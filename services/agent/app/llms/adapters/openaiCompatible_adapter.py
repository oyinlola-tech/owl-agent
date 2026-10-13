from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from ..connections.providerAddress_connection import (
    ProviderAddressError,
    validate_provider_base_url,
)
from ..providers.baseProvider_provider import ModelProvider
from ..providers.providerError_provider import (
    ProviderError,
    ProviderNetworkError,
    ProviderNotConfiguredError,
    ProviderResponseError,
    ProviderTimeoutError,
    build_error_for_status,
)

CHAT_PATH = "chat/completions"
MODELS_PATH = "models"
STREAM_DONE_MARKER = "[DONE]"


class OpenAICompatibleProvider(ModelProvider):
    def __init__(
        self,
        *,
        provider_id: str,
        label: str,
        base_url: str,
        api_key: str = "",
        model: str = "",
        requires_key: bool = True,
        timeout: float = 120.0,
        max_tokens: int = 4096,
        max_tokens_field: str = "max_tokens",
        temperature: float | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.name = provider_id
        self.label = label
        self._base_url = base_url
        self._api_key = api_key
        self._model = model
        self._requires_key = requires_key
        self._max_tokens = max_tokens
        self._max_tokens_field = max_tokens_field
        self._temperature = temperature
        headers = {"Content-Type": "application/json", "Accept": "text/event-stream"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/") + "/",
            transport=transport,
            timeout=httpx.Timeout(connect=10.0, read=timeout, write=10.0, pool=10.0),
            headers=headers,
            follow_redirects=False,
        )

    @property
    def model(self) -> str:
        return self._model

    @property
    def is_configured(self) -> bool:
        return bool(self._base_url) and (bool(self._api_key) or not self._requires_key)

    def describe(self) -> dict[str, object]:
        return {"name": self.name, "configured": self.is_configured, "model": self.model}

    def build_request_payload(
        self, messages: list[dict[str, str]], stream: bool, model: str | None
    ) -> dict:
        payload: dict = {
            "model": model or self.model,
            "messages": messages,
            self._max_tokens_field: self._max_tokens,
            "stream": stream,
        }
        if self._temperature is not None:
            payload["temperature"] = self._temperature
        if stream:
            payload["stream_options"] = {"include_usage": True}
        return payload

    def ensure_ready_for_request(self) -> None:
        if not self._base_url:
            raise ProviderNotConfiguredError(f"{self.label} base URL is not set")
        if not self.is_configured:
            raise ProviderNotConfiguredError(f"{self.label} API key is not set")
        # Security: the base URL is re-checked before every request, not only when saved.
        try:
            validate_provider_base_url(self._base_url)
        except ProviderAddressError as exc:
            raise ProviderNotConfiguredError(f"{self.label} address is not allowed") from exc

    def raise_for_error_status(self, response: httpx.Response) -> None:
        if response.status_code < 400:
            return
        raise build_error_for_status(
            response.status_code, response.headers.get("retry-after", ""), self.label
        )

    def remember_usage(self, usage: object) -> None:
        if isinstance(usage, dict) and isinstance(usage.get("prompt_tokens"), int):
            self._store_usage(
                {
                    "input": usage.get("prompt_tokens", 0),
                    "output": usage.get("completion_tokens", 0) or 0,
                    "estimated": False,
                }
            )

    async def complete(self, messages: list[dict[str, str]], model: str | None = None) -> str:
        self.ensure_ready_for_request()
        try:
            response = await self._client.post(
                CHAT_PATH, json=self.build_request_payload(messages, False, model)
            )
        except httpx.TimeoutException as exc:
            raise ProviderTimeoutError(f"{self.label} request timed out.") from exc
        except httpx.HTTPError as exc:
            raise ProviderNetworkError(f"Cannot reach the {self.label} API.") from exc
        self.raise_for_error_status(response)
        try:
            body = response.json()
            content = body["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise ProviderResponseError(f"{self.label} returned an unreadable reply.") from exc
        if not isinstance(content, str):
            raise ProviderResponseError(f"{self.label} returned an unreadable reply.")
        self.remember_usage(body.get("usage"))
        return content

    async def complete_stream(
        self, messages: list[dict[str, str]], model: str | None = None
    ) -> AsyncIterator[str]:
        self.ensure_ready_for_request()
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
                    for delta in self.read_stream_chunk(data):
                        yield delta
        except ProviderError:
            raise
        except httpx.TimeoutException as exc:
            raise ProviderTimeoutError(f"{self.label} stream timed out.") from exc
        except httpx.HTTPError as exc:
            raise ProviderNetworkError(f"{self.label} stream disconnected.") from exc

    def read_stream_chunk(self, data: str) -> list[str]:
        try:
            chunk = json.loads(data)
        except ValueError as exc:
            raise ProviderResponseError(f"{self.label} stream chunk was unreadable.") from exc
        if not isinstance(chunk, dict):
            raise ProviderResponseError(f"{self.label} stream chunk was unreadable.")
        deltas = []
        for choice in chunk.get("choices", []) or []:
            if not isinstance(choice, dict):
                continue
            delta = (choice.get("delta") or {}).get("content", "")
            if delta:
                deltas.append(delta)
        self.remember_usage(chunk.get("usage"))
        return deltas

    async def list_models(self) -> list[str]:
        self.ensure_ready_for_request()
        try:
            response = await self._client.get(MODELS_PATH)
        except httpx.TimeoutException as exc:
            raise ProviderTimeoutError(f"{self.label} request timed out.") from exc
        except httpx.HTTPError as exc:
            raise ProviderNetworkError(f"Cannot reach the {self.label} API.") from exc
        self.raise_for_error_status(response)
        try:
            return [str(m["id"]) for m in response.json()["data"]]
        except (ValueError, KeyError, TypeError) as exc:
            raise ProviderResponseError(f"{self.label} model list was unreadable.") from exc

    async def aclose(self) -> None:
        await self._client.aclose()
