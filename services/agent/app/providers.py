"""Model provider interface plus NVIDIA Build adapter.

Verified against the official docs (docs.api.nvidia.com, build.nvidia.com):
- Base URL https://integrate.api.nvidia.com/v1, Bearer key auth.
- POST /v1/chat/completions is OpenAI-compatible; stream:true yields SSE
  `data:` JSON chunks terminated by `data: [DONE]`.
- GET /v1/models lists the public catalog (no key required).
- Error codes: 401 invalid key, 402 quota, 404 model not enabled,
  422 validation, 429 rate limit.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from .config import Settings

CHAT_PATH = "/chat/completions"
MODELS_PATH = "/models"
DONE = "[DONE]"
DEFAULT_MODEL = "nvidia/llama-3.1-nemotron-70b-instruct"


class ProviderError(Exception):
    """User-safe error. Never carries key material."""


class ProviderNotConfiguredError(ProviderError):
    pass


class InvalidCredentialsError(ProviderError):
    pass


class QuotaExceededError(ProviderError):
    pass


class ModelNotAvailableError(ProviderError):
    pass


class RateLimitedError(ProviderError):
    def __init__(self, retry_after: str = "") -> None:
        self.retry_after = retry_after
        hint = f" Retry after {retry_after}s." if retry_after else ""
        super().__init__(f"Rate limited by NVIDIA API.{hint}")


class ProviderTimeoutError(ProviderError):
    pass


class ProviderNetworkError(ProviderError):
    pass


class ProviderResponseError(ProviderError):
    pass


def _status_error(status: int, retry_after: str = "") -> ProviderError:
    if status == 401:
        return InvalidCredentialsError("NVIDIA key was rejected (401). Check NVIDIA_API_KEY.")
    if status == 402:
        return QuotaExceededError("NVIDIA quota exceeded (402).")
    if status == 404:
        return ModelNotAvailableError("Model is not enabled for this key (404).")
    if status == 429:
        return RateLimitedError(retry_after)
    return ProviderError(f"NVIDIA API error (HTTP {status}).")


class Provider:
    """Interface every model backend implements."""

    name = "base"
    _usage: dict | None = None

    async def complete(self, messages: list[dict[str, str]], model: str | None = None) -> str:
        raise NotImplementedError

    async def complete_stream(
        self, messages: list[dict[str, str]], model: str | None = None
    ) -> AsyncIterator[str]:
        """Yield text deltas. Default replays the full answer at once."""
        yield await self.complete(messages, model)

    async def list_models(self) -> list[str]:
        return []

    def pop_usage(self) -> dict | None:
        """Actual provider-reported tokens for the last call, else None."""
        usage, self._usage = self._usage, None
        return usage

    def describe(self) -> dict[str, object]:
        return {"name": self.name, "configured": False, "model": ""}


class MockProvider(Provider):
    """Deterministic stand-in used by tests and local runs."""

    name = "mock"

    MOCK_PLAN = {
        "plan": [
            {"title": "Inspect project"},
            {"title": "Run verification command"},
            {"title": "Report results"},
        ],
        "summary": "mock plan",
    }

    def __init__(self) -> None:
        pass

    async def complete(self, messages: list[dict[str, str]], model: str | None = None) -> str:
        last = messages[-1]["content"] if messages else ""
        if "RETURN-JSON-PLAN" in last:
            return json.dumps(self.MOCK_PLAN)
        if "NEXT-ACTION" in last:
            # Always propose; completion comes from an explicit done action.
            # Keeps behavior identical across tasks sharing one instance.
            return json.dumps(
                {
                    "tool": "exec_run",
                    "args": {"argv": ["echo", "owl-mock-ok"], "cwd": "."},
                    "why": "smoke check",
                }
            )
        return f"Mock plan for: {last[:120]} (1 index, 2 propose, 3 verify)"

    async def complete_stream(
        self, messages: list[dict[str, str]], model: str | None = None
    ) -> AsyncIterator[str]:
        text = await self.complete(messages, model)
        for word in text.split(" "):
            yield word + " "

    async def list_models(self) -> list[str]:
        return ["mock-1"]

    def describe(self) -> dict[str, object]:
        return {"name": self.name, "configured": True, "model": "mock-1"}


class NvidiaProvider(Provider):
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
        return self._settings.nvidia_model or DEFAULT_MODEL

    @property
    def is_configured(self) -> bool:
        return bool(self._settings.nvidia_api_key)

    def describe(self) -> dict[str, object]:
        return {"name": self.name, "configured": self.is_configured, "model": self.model}

    def _payload(self, messages: list[dict[str, str]], stream: bool, model: str | None) -> dict:
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

    def _checked(self, response: httpx.Response) -> None:
        if response.status_code < 400:
            return
        raise _status_error(response.status_code, response.headers.get("retry-after", ""))

    async def complete(self, messages: list[dict[str, str]], model: str | None = None) -> str:
        if not self.is_configured:
            raise ProviderNotConfiguredError("NVIDIA_API_KEY is not set")
        try:
            response = await self._client.post(
                CHAT_PATH, json=self._payload(messages, False, model)
            )
        except httpx.TimeoutException as exc:
            raise ProviderTimeoutError("NVIDIA request timed out.") from exc
        except httpx.HTTPError as exc:
            raise ProviderNetworkError("Cannot reach the NVIDIA API.") from exc
        self._checked(response)
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
                "POST", CHAT_PATH, json=self._payload(messages, True, model)
            ) as response:
                self._checked(response)
                async for line in response.aiter_lines():
                    line = line.strip()
                    if not line.startswith("data:"):
                        continue
                    data = line.removeprefix("data:").strip()
                    if data == DONE:
                        return
                    try:
                        chunk = json.loads(data)
                        delta = chunk["choices"][0]["delta"].get("content", "")
                        use = chunk.get("usage") or {}
                    except (ValueError, KeyError, IndexError, TypeError) as exc:
                        raise ProviderResponseError("NVIDIA stream chunk was unreadable.") from exc
                    if isinstance(use.get("prompt_tokens"), int):
                        self._usage = {
                            "input": use.get("prompt_tokens", 0),
                            "output": use.get("completion_tokens", 0),
                            "estimated": False,
                        }
                    if delta:
                        yield delta
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
        self._checked(response)
        try:
            return [m["id"] for m in response.json()["data"]]
        except (ValueError, KeyError, TypeError) as exc:
            raise ProviderResponseError("NVIDIA model list was unreadable.") from exc

    async def aclose(self) -> None:
        await self._client.aclose()


def build_provider(settings: Settings) -> Provider:
    if settings.nvidia_api_key:
        return NvidiaProvider(settings)
    return MockProvider()
