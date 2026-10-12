from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from ...settings.serviceSettings_setting import Settings
from .baseProvider_provider import ModelProvider
from .providerError_provider import (
    ProviderError,
    ProviderNetworkError,
    ProviderNotConfiguredError,
    ProviderResponseError,
    ProviderTimeoutError,
    build_error_for_status,
)

CHAT_PATH = "/chat/completions"
MODELS_PATH = "/models"
STREAM_DONE_MARKER = "[DONE]"
DEFAULT_NVIDIA_MODEL = "nvidia/llama-3.1-nemotron-70b-instruct"


class NvidiaProvider(ModelProvider):
    name = "nvidia"

    def __init__(
        self,
        settings: Settings,
        transport: httpx.AsyncHTTPTransport | None = None,
    ) -> None:
        self._settings = settings
        self._client = httpx.AsyncClient(
            base_url=settings.nvidia_base_url,
            transport=transport,
            timeout=httpx.Timeout(
                connect=10.0, read=settings.nvidia_timeout, write=10.0, pool=10.0
            ),
            headers={
                "Authorization": f"Bearer {settings.nvidia_api_key}",
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
            },
        )

    @property
    def model(self) -> str:
        return self._settings.nvidia_model or DEFAULT_NVIDIA_MODEL

    @property
    def is_configured(self) -> bool:
        return bool(self._settings.nvidia_api_key)

    def describe(self) -> dict[str, object]:
        return {"name": self.name, "configured": self.is_configured, "model": self.model}

    def build_request_payload(
        self, messages: list[dict[str, str]], stream: bool, model: str | None
    ) -> dict:
        payload = {
            "model": model or self.model,
            "messages": messages,
            "temperature": self._settings.nvidia_temperature,
            "max_tokens": self._settings.nvidia_max_tokens,
            "stream": stream,
        }
        if stream:
            payload["stream_options"] = {"include_usage": True}
        return payload

    def raise_for_error_status(self, response: httpx.Response) -> None:
        if response.status_code < 400:
            return
        raise build_error_for_status(response.status_code, response.headers.get("retry-after", ""))

    async def complete(self, messages: list[dict[str, str]], model: str | None = None) -> str:
        if not self.is_configured:
            raise ProviderNotConfiguredError("NVIDIA_API_KEY is not set")
        try:
            response = await self._client.post(
                CHAT_PATH, json=self.build_request_payload(messages, False, model)
            )
        except httpx.TimeoutException as exc:
            raise ProviderTimeoutError("NVIDIA request timed out.") from exc
        except httpx.HTTPError as exc:
            raise ProviderNetworkError("Cannot reach the NVIDIA API.") from exc
        self.raise_for_error_status(response)
        try:
            body = response.json()
            content = body["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise ProviderResponseError("NVIDIA returned an unreadable reply.") from exc
        if not isinstance(content, str):
            raise ProviderResponseError("NVIDIA returned an unreadable reply.")
        usage = body.get("usage") or {}
        if isinstance(usage.get("prompt_tokens"), int):
            self._usage = {
                "input": usage.get("prompt_tokens", 0),
                "output": usage.get("completion_tokens", 0),
                "estimated": False,
            }
        return content

    async def complete_stream(
        self, messages: list[dict[str, str]], model: str | None = None
    ) -> AsyncIterator[str]:
        if not self.is_configured:
            raise ProviderNotConfiguredError("NVIDIA_API_KEY is not set")
        try:
            async with self._client.stream(
                "POST", CHAT_PATH, json=self.build_request_payload(messages, True, model)
            ) as response:
                self.raise_for_error_status(response)
                async for line in response.aiter_lines():
                    line = line.strip()
                    if not line.startswith("data:"):
                        continue
                    data = line.removeprefix("data:").strip()
                    if data == STREAM_DONE_MARKER:
                        return
                    try:
                        chunk = json.loads(data)
                    except ValueError as exc:
                        raise ProviderResponseError("NVIDIA stream chunk was unreadable.") from exc
                    if not isinstance(chunk, dict):
                        raise ProviderResponseError("NVIDIA stream chunk was unreadable.")
                    for choice in chunk.get("choices", []) or []:
                        if not isinstance(choice, dict):
                            continue
                        delta = (choice.get("delta") or {}).get("content", "")
                        if delta:
                            yield delta
                    use = chunk.get("usage") or {}
                    if isinstance(use.get("prompt_tokens"), int):
                        self._usage = {
                            "input": use.get("prompt_tokens", 0),
                            "output": use.get("completion_tokens", 0),
                            "estimated": False,
                        }
        except ProviderError:
            raise
        except httpx.TimeoutException as exc:
            raise ProviderTimeoutError("NVIDIA stream timed out.") from exc
        except httpx.HTTPError as exc:
            raise ProviderNetworkError("NVIDIA stream disconnected.") from exc

    async def list_models(self) -> list[str]:
        if not self.is_configured:
            raise ProviderNotConfiguredError("NVIDIA_API_KEY is not set")
        try:
            response = await self._client.get(MODELS_PATH)
        except httpx.TimeoutException as exc:
            raise ProviderTimeoutError("NVIDIA request timed out.") from exc
        except httpx.HTTPError as exc:
            raise ProviderNetworkError("Cannot reach the NVIDIA API.") from exc
        self.raise_for_error_status(response)
        try:
            return [m["id"] for m in response.json()["data"]]
        except (ValueError, KeyError, TypeError) as exc:
            raise ProviderResponseError("NVIDIA model list was unreadable.") from exc

    async def aclose(self) -> None:
        await self._client.aclose()
