from __future__ import annotations

import asyncio
import time
from urllib.parse import urlsplit

import httpx

from .providerAddress_connection import (
    ProviderAddressError,
    is_loopback_host,
    validate_provider_base_url,
)
from .providerPreset_connection import LOCAL_PROVIDER_IDS, PROVIDER_PRESETS

PROBE_TIMEOUT_SECONDS = 1.5


async def fetch_json_quickly(client: httpx.AsyncClient, url: str) -> dict | None:
    try:
        response = await client.get(url)
    except httpx.HTTPError:
        return None
    if response.status_code != 200:
        return None
    try:
        body = response.json()
    except ValueError:
        return None
    return body if isinstance(body, dict) else None


def read_openai_model_ids(body: dict | None) -> list[str]:
    data = (body or {}).get("data")
    if not isinstance(data, list):
        return []
    return [str(m["id"]) for m in data if isinstance(m, dict) and m.get("id")]


def read_ollama_model_names(body: dict | None) -> list[str]:
    models = (body or {}).get("models")
    if not isinstance(models, list):
        return []
    return [str(m["name"]) for m in models if isinstance(m, dict) and m.get("name")]


async def probe_local_runner(
    provider_id: str, base_url: str, transport: httpx.AsyncBaseTransport | None = None
) -> dict:
    preset = PROVIDER_PRESETS[provider_id]
    result = {
        "id": provider_id,
        "label": preset.label,
        "base_url": base_url,
        "running": False,
        "models": [],
        "latency_ms": None,
        "error": "",
        "how_to": preset.how_to,
    }
    try:
        clean = validate_provider_base_url(base_url)
    except ProviderAddressError as exc:
        result["error"] = str(exc)
        return result
    # Security: discovery only ever probes this machine, never a remote address.
    if not is_loopback_host(urlsplit(clean).hostname or ""):
        result["error"] = "Local discovery only checks addresses on this computer."
        return result
    start = time.monotonic()
    async with httpx.AsyncClient(
        transport=transport, timeout=PROBE_TIMEOUT_SECONDS, follow_redirects=False
    ) as client:
        models_body = await fetch_json_quickly(client, clean + "/models")
        models = read_openai_model_ids(models_body)
        if provider_id == "ollama":
            root = clean.removesuffix("/v1")
            tags_body = await fetch_json_quickly(client, root + "/api/tags")
            models = sorted(set(models) | set(read_ollama_model_names(tags_body)))
            running = models_body is not None or tags_body is not None
        else:
            running = models_body is not None
    result["running"] = running
    result["models"] = sorted(models)
    result["latency_ms"] = int((time.monotonic() - start) * 1000) if running else None
    if not running:
        result["error"] = f"{preset.label} isn't running at {clean}."
    return result


async def discover_local_runners(
    base_urls: dict[str, str], transport: httpx.AsyncBaseTransport | None = None
) -> list[dict]:
    return list(
        await asyncio.gather(
            *(
                probe_local_runner(
                    pid, base_urls.get(pid) or PROVIDER_PRESETS[pid].base_url, transport
                )
                for pid in LOCAL_PROVIDER_IDS
            )
        )
    )
