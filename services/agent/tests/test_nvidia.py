"""NVIDIA adapter tests. All HTTP is mocked; no key, no network."""

import json as jsonlib

import httpx
import pytest

from app.config import Settings
from app.providers import (
    InvalidCredentialsError,
    ModelNotAvailableError,
    NvidiaProvider,
    ProviderNetworkError,
    ProviderNotConfiguredError,
    ProviderResponseError,
    ProviderTimeoutError,
    QuotaExceededError,
    RateLimitedError,
)


def settings(**overrides):
    base = {"nvidia_api_key": "test-key", "nvidia_model": "test-model"}
    base.update(overrides)
    return Settings(**base)


def completion_payload(text="hello back"):
    return {
        "id": "chatcmpl-1",
        "object": "chat.completion",
        "created": 1,
        "model": "test-model",
        "choices": [
            {"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}
        ],
    }


def sse_body(*chunks):
    body = "".join(f"data: {c}\n\n" for c in chunks) + "data: [DONE]\n\n"
    return body.encode()


def mock_client(handler):
    return httpx.MockTransport(handler)


@pytest.mark.anyio
async def test_complete_parses_openai_shape():
    def handler(request):
        assert request.headers["authorization"] == "Bearer test-key"
        assert request.url.path == "/v1/chat/completions"
        payload = jsonlib.loads(request.content)
        assert payload["model"] == "test-model"
        assert payload["stream"] is False
        return httpx.Response(200, json=completion_payload("hi there"))

    provider = NvidiaProvider(settings(), transport=mock_client(handler))
    assert await provider.complete([{"role": "user", "content": "hi"}]) == "hi there"
    await provider.aclose()


@pytest.mark.anyio
async def test_stream_yields_deltas_until_done():
    c1 = '{"choices": [{"delta": {"content": "hello "}}]}'
    c2 = '{"choices": [{"delta": {"content": "world"}}]}'
    provider = NvidiaProvider(
        settings(), transport=mock_client(lambda r: httpx.Response(200, content=sse_body(c1, c2)))
    )
    parts = [d async for d in provider.complete_stream([{"role": "user", "content": "hi"}])]
    assert "".join(parts) == "hello world"
    await provider.aclose()


@pytest.mark.anyio
async def test_stream_ignores_empty_deltas():
    c1 = '{"choices": [{"delta": {}}]}'
    c2 = '{"choices": [{"delta": {"content": "x"}}]}'
    provider = NvidiaProvider(
        settings(), transport=mock_client(lambda r: httpx.Response(200, content=sse_body(c1, c2)))
    )
    assert (
        "".join([d async for d in provider.complete_stream([{"role": "user", "content": "hi"}])])
        == "x"
    )
    await provider.aclose()


@pytest.mark.anyio
async def test_status_mapping():
    cases = [
        (401, InvalidCredentialsError),
        (402, QuotaExceededError),
        (404, ModelNotAvailableError),
        (429, RateLimitedError),
    ]
    for status, exc in cases:
        provider = NvidiaProvider(
            settings(),
            transport=mock_client(lambda r, s=status: httpx.Response(s, json={"detail": "x"})),
        )
        with pytest.raises(exc):
            await provider.complete([{"role": "user", "content": "hi"}])
        await provider.aclose()


@pytest.mark.anyio
async def test_rate_limit_carries_retry_after():
    def handler(request):
        return httpx.Response(429, json={"detail": "slow"}, headers={"retry-after": "7"})

    provider = NvidiaProvider(settings(), transport=mock_client(handler))
    with pytest.raises(RateLimitedError) as info:
        await provider.complete([{"role": "user", "content": "hi"}])
    assert info.value.retry_after == "7"
    await provider.aclose()


@pytest.mark.anyio
async def test_timeout_network_and_shape_errors():
    def timeout_handler(request):
        raise httpx.TimeoutException("slow", request=request)

    provider = NvidiaProvider(settings(), transport=mock_client(timeout_handler))
    with pytest.raises(ProviderTimeoutError):
        await provider.complete([{"role": "user", "content": "hi"}])
    await provider.aclose()

    def connect_handler(request):
        raise httpx.ConnectError("down")

    provider = NvidiaProvider(settings(), transport=mock_client(connect_handler))
    with pytest.raises(ProviderNetworkError):
        await provider.complete([{"role": "user", "content": "hi"}])
    await provider.aclose()

    provider = NvidiaProvider(
        settings(), transport=mock_client(lambda r: httpx.Response(200, json={"nope": True}))
    )
    with pytest.raises(ProviderResponseError):
        await provider.complete([{"role": "user", "content": "hi"}])
    await provider.aclose()


@pytest.mark.anyio
async def test_not_configured_without_key():
    provider = NvidiaProvider(settings(nvidia_api_key=""))
    assert provider.describe()["configured"] is False
    with pytest.raises(ProviderNotConfiguredError):
        await provider.complete([{"role": "user", "content": "hi"}])
    with pytest.raises(ProviderNotConfiguredError):
        await provider.list_models()
    await provider.aclose()


@pytest.mark.anyio
async def test_list_models_parses_ids():
    provider = NvidiaProvider(
        settings(),
        transport=mock_client(
            lambda r: httpx.Response(
                200, json={"object": "list", "data": [{"id": "a"}, {"id": "b"}]}
            )
        ),
    )
    assert await provider.list_models() == ["a", "b"]
    await provider.aclose()
