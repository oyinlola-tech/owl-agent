from __future__ import annotations

import asyncio
import logging
import sqlite3
from collections.abc import Callable
from datetime import datetime

import httpx

from ..databases.recordStamp_database import current_utc_time
from ..settings.serviceSettings_setting import Settings
from .adapters.anthropic_adapter import AnthropicProvider
from .adapters.openaiCompatible_adapter import OpenAICompatibleProvider
from .connections.providerConfig_connection import ProviderConfigStore
from .connections.providerKey_connection import ProviderKeyStore
from .connections.providerPreset_connection import ProviderPreset, find_provider_preset
from .modelRegistry_llm import ModelRegistry
from .modelRouter_llm import ModelRouter
from .providers.baseProvider_provider import ActiveProvider, ModelProvider, UnconfiguredProvider
from .providers.mockProvider_provider import MockProvider
from .providers.providerError_provider import ProviderError

log = logging.getLogger("owl")

MODEL_LIST_STALE_SECONDS = 7 * 24 * 3600


def read_models_fetched_at(saved: dict) -> datetime | None:
    raw = saved.get("options", {}).get("models_fetched_at")
    if not isinstance(raw, str) or not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed


def models_cache_is_stale(saved: dict) -> bool:
    if not saved.get("models"):
        return False
    fetched_at = read_models_fetched_at(saved)
    if fetched_at is None:
        return True
    try:
        age = (current_utc_time() - fetched_at).total_seconds()
    except TypeError:
        return True
    return age >= MODEL_LIST_STALE_SECONDS


class ProviderSetupError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


class ProviderSwitchboard:
    def __init__(
        self,
        settings: Settings,
        conn: sqlite3.Connection,
        data_dir: str,
        holder: ActiveProvider,
        registry: ModelRegistry,
        routers: list[ModelRouter],
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        anthropic_client_factory: Callable[[str], object] | None = None,
    ) -> None:
        self.settings = settings
        self.config = ProviderConfigStore(conn)
        self.keys = ProviderKeyStore(data_dir, settings.secret_store)
        self.holder = holder
        self.registry = registry
        self.routers = routers
        self.transport = transport
        self.anthropic_client_factory = anthropic_client_factory

    def require_preset(self, provider_id: str) -> ProviderPreset:
        preset = find_provider_preset(provider_id)
        if preset is None:
            raise ProviderSetupError(404, "unknown_provider", "That provider isn't supported.")
        return preset

    def read_environment_key(self, provider_id: str) -> str:
        return self.settings.nvidia_api_key if provider_id == "nvidia" else ""

    def resolve_key(self, provider_id: str) -> tuple[str, str]:
        env_key = self.read_environment_key(provider_id)
        if env_key:
            return env_key, "env"
        source = self.config.read_provider_settings(provider_id)["key_source"]
        if not source:
            return "", ""
        key = self.keys.read_key(provider_id, source)
        return (key, source) if key else ("", "")

    def resolve_base_url(self, preset: ProviderPreset, saved: dict) -> str:
        if preset.id == "nvidia":
            return self.settings.nvidia_base_url
        if preset.kind == "anthropic":
            return self.settings.anthropic_base_url
        if preset.base_url_editable and saved["base_url"]:
            return saved["base_url"]
        return preset.base_url

    def resolve_model(self, preset: ProviderPreset, saved: dict) -> str:
        if saved["model"]:
            return saved["model"]
        if preset.id == "nvidia":
            return self.settings.nvidia_model
        return preset.default_model

    def build_provider(
        self,
        provider_id: str,
        *,
        key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
    ) -> ModelProvider:
        preset = self.require_preset(provider_id)
        saved = self.config.read_provider_settings(provider_id)
        if key is None:
            key = self.resolve_key(provider_id)[0]
        address = self.resolve_base_url(preset, saved) if base_url is None else base_url
        chosen = model or self.resolve_model(preset, saved)
        if preset.kind == "anthropic":
            factory = self.anthropic_client_factory
            return AnthropicProvider(
                api_key=key,
                model=chosen,
                base_url=address,
                timeout=max(self.settings.provider_timeout, 600.0),
                server_fallbacks=bool(saved["options"].get("server_fallbacks", True)),
                redact=self.keys.redact,
                client=factory(key) if factory and key else None,
            )
        if preset.id == "nvidia":
            return OpenAICompatibleProvider(
                provider_id=preset.id,
                label=preset.label,
                base_url=address,
                api_key=key,
                model=chosen,
                requires_key=preset.requires_key,
                timeout=self.settings.nvidia_timeout,
                max_tokens=self.settings.nvidia_max_tokens,
                max_tokens_field=preset.max_tokens_field,
                temperature=self.settings.nvidia_temperature,
                transport=self.transport,
            )
        return OpenAICompatibleProvider(
            provider_id=preset.id,
            label=preset.label,
            base_url=address,
            api_key=key,
            model=chosen,
            requires_key=preset.requires_key,
            timeout=self.settings.provider_timeout,
            max_tokens=self.settings.provider_max_tokens,
            max_tokens_field=preset.max_tokens_field,
            transport=self.transport,
        )

    def choose_startup_provider(self) -> tuple[ModelProvider, str]:
        forced = self.settings.provider.strip().lower()
        if forced == "mock":
            return MockProvider(), "mock"
        if forced == "none":
            return UnconfiguredProvider(), "none"
        provider_id = forced if find_provider_preset(forced) else ""
        provider_id = provider_id or self.config.read_active_provider_id()
        if not provider_id and self.settings.nvidia_api_key:
            provider_id = "nvidia"
        if not find_provider_preset(provider_id):
            return UnconfiguredProvider(), "none"
        try:
            return self.build_provider(provider_id), provider_id
        except Exception as exc:  # noqa: BLE001 - a broken saved setup must not stop startup
            log.warning("could not start provider %s: %s", provider_id, type(exc).__name__)
            return UnconfiguredProvider(), "none"

    def apply_provider(self, provider: ModelProvider, provider_id: str, models: list[str]) -> str:
        chosen = str(provider.describe().get("model", "") or "")
        if not chosen and models:
            chosen = sorted(models)[0]
        if models:
            self.registry.sync_with_live_catalog(
                sorted(set(models) | ({chosen} if chosen else set()))
            )
        elif chosen:
            self.registry.save_model(chosen, status="available", capabilities=["chat"])
        for router in self.routers:
            router.default_model = chosen
        previous = self.holder.replace_provider(provider, provider_id)
        if previous is not provider:
            self.close_quietly(previous)
        return chosen

    @staticmethod
    def close_quietly(provider: object) -> None:
        close = getattr(provider, "aclose", None)
        if not callable(close):
            return
        try:
            asyncio.get_running_loop().create_task(close())
        except RuntimeError:
            pass

    def activate_saved_provider_now(self, provider_id: str) -> None:
        provider = self.build_provider(provider_id)
        models = self.config.read_provider_settings(provider_id)["models"]
        self.apply_provider(provider, provider_id, models)

    async def activate_provider(self, provider_id: str, model: str | None = None) -> str:
        if provider_id in ("none", ""):
            self.close_quietly(self.holder.replace_provider(UnconfiguredProvider(), "none"))
            self.config.save_active_provider_id("")
            return ""
        preset = self.require_preset(provider_id)
        if model is not None:
            self.config.save_provider_settings(provider_id, model="" if model == "auto" else model)
        provider = self.build_provider(provider_id)
        if not provider.describe().get("configured"):
            code = "key_missing" if preset.requires_key else "base_url_missing"
            raise ProviderSetupError(412, code, f"{preset.label} isn't set up yet.")
        saved = self.config.read_provider_settings(provider_id)
        models = saved["models"]
        if not models or models_cache_is_stale(saved):
            try:
                models = await provider.list_models()
                self.config.save_provider_settings(
                    provider_id,
                    models=models,
                    options={"models_fetched_at": current_utc_time().isoformat()},
                )
            except ProviderError as exc:
                log.info("model list for %s unavailable: %s", provider_id, type(exc).__name__)
                models = saved["models"]
        chosen = self.apply_provider(provider, provider_id, models)
        self.config.save_active_provider_id(provider_id)
        return chosen

    def attach_routers(self, routers: list[ModelRouter]) -> None:
        self.routers = routers
        if find_provider_preset(self.holder.provider_id):
            models = self.config.read_provider_settings(self.holder.provider_id)["models"]
            self.apply_provider(self.holder.current, self.holder.provider_id, models)

    def refresh_active_if(self, provider_id: str) -> None:
        if self.holder.provider_id == provider_id:
            self.activate_saved_provider_now(provider_id)
