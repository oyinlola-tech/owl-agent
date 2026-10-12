from __future__ import annotations

from collections.abc import AsyncIterator, Callable

import anthropic

from ..connections.providerAddress_connection import (
    ProviderAddressError,
    validate_provider_base_url,
)
from ..connections.providerPreset_connection import ANTHROPIC_DEFAULT_MODEL
from ..providers.baseProvider_provider import ModelProvider
from ..providers.providerError_provider import ProviderError, ProviderNotConfiguredError
from .anthropicRequest_adapter import (
    NON_STREAMING_MAX_TOKENS,
    STREAMING_MAX_TOKENS,
    build_anthropic_request,
    convert_anthropic_error,
    read_text_from_message,
    read_usage_from_message,
)

AGENT_EFFORT = "high"
CHAT_EFFORT = "medium"
SDK_ERRORS = (anthropic.APIError,)


class AnthropicProvider(ModelProvider):
    name = "anthropic"

    def __init__(
        self,
        *,
        api_key: str,
        model: str = "",
        base_url: str = "",
        timeout: float = 600.0,
        server_fallbacks: bool = True,
        redact: Callable[[str], str] = lambda text: text,
        client: object | None = None,
    ) -> None:
        self._api_key = api_key
        self._model = model or ANTHROPIC_DEFAULT_MODEL
        self._base_url = base_url
        self.server_fallbacks = server_fallbacks
        self._redact = redact
        if client is not None:
            self._client = client
        elif api_key:
            self._client = anthropic.AsyncAnthropic(
                api_key=api_key, base_url=base_url or None, timeout=timeout, max_retries=0
            )
        else:
            self._client = None

    @property
    def model(self) -> str:
        return self._model

    def describe(self) -> dict[str, object]:
        return {"name": self.name, "configured": bool(self._api_key), "model": self._model}

    def ensure_ready_for_request(self) -> object:
        if self._client is None or not self._api_key:
            raise ProviderNotConfiguredError("Claude API key is not set")
        if self._base_url:
            try:
                validate_provider_base_url(self._base_url)
            except ProviderAddressError as exc:
                raise ProviderNotConfiguredError("Claude proxy address is not allowed") from exc
        return self._client

    def build_request(self, messages, model, effort: str, max_tokens: int) -> dict:
        return build_anthropic_request(
            messages,
            model or self._model,
            effort=effort,
            max_tokens=max_tokens,
            server_fallbacks=self.server_fallbacks,
        )

    async def complete(self, messages: list[dict[str, str]], model: str | None = None) -> str:
        client = self.ensure_ready_for_request()
        params = self.build_request(messages, model, AGENT_EFFORT, NON_STREAMING_MAX_TOKENS)
        try:
            response = await client.beta.messages.create(**params)
        except SDK_ERRORS as exc:
            raise convert_anthropic_error(exc, self._redact) from None
        self._usage = read_usage_from_message(response)
        return read_text_from_message(response)

    async def complete_stream(
        self, messages: list[dict[str, str]], model: str | None = None
    ) -> AsyncIterator[str]:
        client = self.ensure_ready_for_request()
        params = self.build_request(messages, model, CHAT_EFFORT, STREAMING_MAX_TOKENS)
        try:
            async with client.beta.messages.stream(**params) as stream:
                async for text in stream.text_stream:
                    if text:
                        yield text
                final = await stream.get_final_message()
        except ProviderError:
            raise
        except SDK_ERRORS as exc:
            raise convert_anthropic_error(exc, self._redact) from None
        self._usage = read_usage_from_message(final)
        read_text_from_message(final)

    async def list_models(self) -> list[str]:
        client = self.ensure_ready_for_request()
        try:
            return [str(m.id) async for m in client.models.list()]
        except SDK_ERRORS as exc:
            raise convert_anthropic_error(exc, self._redact) from None
