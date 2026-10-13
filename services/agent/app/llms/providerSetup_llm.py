from __future__ import annotations

import sqlite3
import time

from ..databases.recordStamp_database import current_utc_time
from ..settings.serviceSettings_setting import Settings
from .connections.localDiscovery_connection import discover_local_runners
from .connections.providerAddress_connection import (
    ProviderAddressError,
    validate_provider_base_url,
)
from .connections.providerKey_connection import build_key_hint
from .connections.providerPreset_connection import (
    LOCAL_PROVIDER_IDS,
    PROVIDER_PRESETS,
    ProviderPreset,
)
from .modelRegistry_llm import ModelRegistry
from .providers.baseProvider_provider import ActiveProvider, UnconfiguredProvider
from .providers.providerError_provider import ProviderError, ProviderNetworkError
from .providerSwitch_llm import ProviderSetupError, ProviderSwitchboard

MAX_KEY_LENGTH = 512
MAX_MODEL_LENGTH = 200
MAX_LISTED_MODELS = 500


def validate_api_key_text(key: str) -> str:
    cleaned = (key or "").strip()
    if not cleaned or len(cleaned) > MAX_KEY_LENGTH:
        raise ProviderSetupError(422, "validation", "Paste an API key (up to 512 characters).")
    if any(ch.isspace() or ord(ch) < 32 for ch in cleaned):
        raise ProviderSetupError(422, "validation", "API keys can't contain spaces.")
    return cleaned


def validate_base_url_or_raise(url: str) -> str:
    try:
        return validate_provider_base_url(url)
    except ProviderAddressError as exc:
        raise ProviderSetupError(422, "invalid_base_url", str(exc)) from exc


class ProviderSetupService(ProviderSwitchboard):
    def compute_status(self, preset: ProviderPreset, saved: dict, has_key: bool) -> str:
        if preset.requires_key and not has_key:
            return "key_missing"
        if preset.base_url_editable and not (saved["base_url"] or preset.base_url):
            return "base_url_missing"
        return saved["last_status"] or "untested"

    def describe_provider_card(self, provider_id: str) -> dict:
        preset = self.require_preset(provider_id)
        saved = self.config.read_provider_settings(provider_id)
        env_key = self.read_environment_key(provider_id)
        source = "env" if env_key else (saved["key_source"] or None)
        card = {
            "id": preset.id,
            "label": preset.label,
            "group": preset.group,
            "kind": preset.kind,
            "description": preset.description,
            "key_url": preset.key_url,
            "how_to": preset.how_to,
            "requires_key": preset.requires_key,
            "base_url": self.resolve_base_url(preset, saved) or preset.base_url,
            "base_url_editable": preset.base_url_editable,
            "has_key": source is not None,
            "key_hint": build_key_hint(env_key) if env_key else (saved["key_hint"] or None),
            "key_source": source,
            "key_read_only": source == "env",
            "model": saved["model"] or "auto",
            "default_model": self.resolve_model(preset, {**saved, "model": ""}),
            "models": saved["models"][:MAX_LISTED_MODELS],
            "status": self.compute_status(preset, saved, source is not None),
            "last_error": saved["last_error"],
            "checked_at": saved["checked_at"],
            "active": self.holder.provider_id == preset.id,
            "options": {},
        }
        if preset.kind == "anthropic":
            card["options"] = {
                "server_fallbacks": bool(saved["options"].get("server_fallbacks", True))
            }
        return card

    def list_provider_cards(self) -> dict:
        return {
            "active": self.holder.provider_id or "none",
            "active_model": str(self.holder.describe().get("model", "") or ""),
            "configured": bool(self.holder.describe().get("configured")),
            "key_storage": self.keys.describe_storage(),
            "providers": [self.describe_provider_card(pid) for pid in PROVIDER_PRESETS],
        }

    def save_provider_key(self, provider_id: str, key: str) -> dict:
        preset = self.require_preset(provider_id)
        if self.read_environment_key(provider_id):
            raise ProviderSetupError(
                409, "key_from_environment", "This key comes from the environment (NVIDIA_API_KEY)."
            )
        cleaned = validate_api_key_text(key)
        try:
            source = self.keys.save_key(preset.id, cleaned)
        except Exception as exc:  # noqa: BLE001 - never echo the key or backend detail
            raise ProviderSetupError(
                500, "key_storage_failed", "OWL couldn't store the key."
            ) from exc
        self.config.save_provider_settings(
            preset.id,
            key_source=source,
            key_hint=build_key_hint(cleaned),
            last_status="",
            last_error="",
        )
        self.refresh_active_if(preset.id)
        return self.describe_provider_card(preset.id)

    def delete_provider_key(self, provider_id: str) -> dict:
        preset = self.require_preset(provider_id)
        if self.read_environment_key(provider_id):
            raise ProviderSetupError(
                409, "key_from_environment", "This key comes from the environment (NVIDIA_API_KEY)."
            )
        self.keys.delete_key(preset.id)
        self.config.save_provider_settings(
            preset.id, key_source="", key_hint="", last_status="", last_error=""
        )
        self.refresh_active_if(preset.id)
        return self.describe_provider_card(preset.id)

    def update_provider_settings(
        self,
        provider_id: str,
        *,
        base_url: str | None = None,
        model: str | None = None,
        server_fallbacks: bool | None = None,
    ) -> dict:
        preset = self.require_preset(provider_id)
        fields: dict = {}
        if base_url is not None:
            if not preset.base_url_editable:
                raise ProviderSetupError(422, "base_url_fixed", "This provider's URL is fixed.")
            fields["base_url"] = validate_base_url_or_raise(base_url)
            fields.update(last_status="", last_error="")
        if model is not None:
            if len(model) > MAX_MODEL_LENGTH or any(ord(ch) < 32 for ch in model):
                raise ProviderSetupError(422, "validation", "That model id isn't valid.")
            fields["model"] = "" if model.strip() in ("", "auto") else model.strip()
        options = None
        if server_fallbacks is not None and preset.kind == "anthropic":
            options = {"server_fallbacks": bool(server_fallbacks)}
        self.config.save_provider_settings(preset.id, options=options, **fields)
        self.refresh_active_if(preset.id)
        return self.describe_provider_card(preset.id)

    async def run_connection_test(
        self, provider_id: str, key: str | None = None, base_url: str | None = None
    ) -> tuple[dict, ProviderError | None]:
        preset = self.require_preset(provider_id)
        candidate_key = validate_api_key_text(key) if key else None
        address = validate_base_url_or_raise(base_url) if base_url else None
        if address is not None and not preset.base_url_editable:
            raise ProviderSetupError(422, "base_url_fixed", "This provider's URL is fixed.")
        provider = self.build_provider(preset.id, key=candidate_key, base_url=address)
        if candidate_key:
            self.keys.remember_secret_for_redaction(candidate_key)
        result = {"ok": False, "latency_ms": None, "model_count": 0, "models": []}
        start = time.monotonic()
        error: ProviderError | None = None
        try:
            models = await provider.list_models()
        except ProviderError as exc:
            error = exc
            models = []
        finally:
            close = getattr(provider, "aclose", None)
            if callable(close):
                await close()
        if error is None:
            result.update(
                ok=True,
                latency_ms=int((time.monotonic() - start) * 1000),
                model_count=len(models),
                models=sorted(models)[:MAX_LISTED_MODELS],
            )
        if error is None or (candidate_key is None and address is None):
            # Security: a successful probe always refreshes the stored model list, so
            # Test-then-Save keeps the live models; a failed candidate probe never
            # overwrites the last good state.
            self.record_test_outcome(preset, models, error)
        return result, error

    def record_test_outcome(self, preset: ProviderPreset, models, error) -> None:
        now = current_utc_time().isoformat()
        if error is None:
            self.config.save_provider_settings(
                preset.id,
                models=models,
                options={"models_fetched_at": now},
                last_status="connected",
                last_error="",
                checked_at=now,
            )
            return
        local_down = preset.id in LOCAL_PROVIDER_IDS and isinstance(error, ProviderNetworkError)
        self.config.save_provider_settings(
            preset.id,
            last_status="not_running" if local_down else "error",
            last_error=self.keys.redact(type(error).__name__),
            checked_at=now,
        )

    async def refresh_provider_models(self, provider_id: str) -> tuple[dict, ProviderError | None]:
        preset = self.require_preset(provider_id)
        result, error = await self.run_connection_test(preset.id)
        saved = self.config.read_provider_settings(preset.id)
        if preset.id == self.holder.provider_id and error is None:
            self.activate_saved_provider_now(preset.id)
        return {
            "id": preset.id,
            "model": saved["model"] or "auto",
            "models": saved["models"][:MAX_LISTED_MODELS],
            "fetched": error is None,
        }, error

    async def discover_local_models(self) -> list[dict]:
        urls = {
            pid: self.config.read_provider_settings(pid)["base_url"] for pid in LOCAL_PROVIDER_IDS
        }
        return await discover_local_runners(urls, self.transport)


def create_provider_setup(
    settings: Settings, conn: sqlite3.Connection, data_dir: str, registry: ModelRegistry
) -> ProviderSetupService:
    holder = ActiveProvider(UnconfiguredProvider(), "none")
    setup = ProviderSetupService(settings, conn, data_dir, holder, registry, [])
    provider, provider_id = setup.choose_startup_provider()
    holder.replace_provider(provider, provider_id)
    return setup
