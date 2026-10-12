import json as jsonlib

import httpx
import pytest

from app.llms.providers.nvidiaProvider_provider import NvidiaProvider
from app.llms.providers.providerError_provider import (
    InvalidCredentialsError,
    ModelNotAvailableError,
    ProviderNetworkError,
    ProviderNotConfiguredError,
    ProviderResponseError,
    ProviderTimeoutError,
    QuotaExceededError,
    RateLimitedError,
)
from app.settings.serviceSettings_setting import Settings


def build_nvidia_settings(**overrides):
    base = {"nvidia_api_key": "test-key", "nvidia_model": "test-model"}
    base.update(overrides)
    return Settings(**base)


def build_completion_payload(text="hello back"):
    return {
        "id": "chatcmpl-1",
        "object": "chat.completion",
        "created": 1,
        "model": "test-model",
        "choices": [
            {"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}
        ],
    }


def build_sse_body(*chunks):
    body = "".join(f"data: {c}\n\n" for c in chunks) + "data: [DONE]\n\n"
    return body.encode()


def build_mock_transport(handler):
    return httpx.MockTransport(handler)


@pytest.mark.anyio
async def test_complete_parses_openai_shape():
    def handler(request):
        assert request.headers["authorization"] == "Bearer test-key"
        assert request.url.path == "/v1/chat/completions"
        payload = jsonlib.loads(request.content)
        assert payload["model"] == "test-model"
        assert payload["stream"] is False
        return httpx.Response(200, json=build_completion_payload("hi there"))

    provider = NvidiaProvider(build_nvidia_settings(), transport=build_mock_transport(handler))
    assert await provider.complete([{"role": "user", "content": "hi"}]) == "hi there"
    await provider.aclose()


@pytest.mark.anyio
async def test_stream_yields_deltas_until_done():
    c1 = '{"choices": [{"delta": {"content": "hello "}}]}'
    c2 = '{"choices": [{"delta": {"content": "world"}}]}'
    provider = NvidiaProvider(
        build_nvidia_settings(),
        transport=build_mock_transport(
            lambda r: httpx.Response(200, content=build_sse_body(c1, c2))
        ),
    )
    parts = [d async for d in provider.complete_stream([{"role": "user", "content": "hi"}])]
    assert "".join(parts) == "hello world"
    await provider.aclose()


@pytest.mark.anyio
async def test_stream_ignores_empty_deltas():
    c1 = '{"choices": [{"delta": {}}]}'
    c2 = '{"choices": [{"delta": {"content": "x"}}]}'
    provider = NvidiaProvider(
        build_nvidia_settings(),
        transport=build_mock_transport(
            lambda r: httpx.Response(200, content=build_sse_body(c1, c2))
        ),
    )
    assert (
        "".join([d async for d in provider.complete_stream([{"role": "user", "content": "hi"}])])
        == "x"
    )
    await provider.aclose()


@pytest.mark.anyio
async def test_stream_tolerates_usage_only_chunks():
    c1 = (
        '{"choices": [{"delta": {"content": "hi"}}],'
        ' "usage": {"prompt_tokens": 5, "completion_tokens": 0}}'
    )
    c2 = '{"choices": [], "usage": {"prompt_tokens": 5, "completion_tokens": 2}}'
    provider = NvidiaProvider(
        build_nvidia_settings(),
        transport=build_mock_transport(
            lambda r: httpx.Response(200, content=build_sse_body(c1, c2))
        ),
    )
    parts = [d async for d in provider.complete_stream([{"role": "user", "content": "hi"}])]
    assert "".join(parts) == "hi"
    assert provider.pop_usage() == {"input": 5, "output": 2, "estimated": False}
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
            build_nvidia_settings(),
            transport=build_mock_transport(
                lambda r, s=status: httpx.Response(s, json={"detail": "x"})
            ),
        )
        with pytest.raises(exc):
            await provider.complete([{"role": "user", "content": "hi"}])
        await provider.aclose()


@pytest.mark.anyio
async def test_rate_limit_carries_retry_after():
    def handler(request):
        return httpx.Response(429, json={"detail": "slow"}, headers={"retry-after": "7"})

    provider = NvidiaProvider(build_nvidia_settings(), transport=build_mock_transport(handler))
    with pytest.raises(RateLimitedError) as info:
        await provider.complete([{"role": "user", "content": "hi"}])
    assert info.value.retry_after == "7"
    await provider.aclose()


@pytest.mark.anyio
async def test_timeout_network_and_shape_errors():
    def timeout_handler(request):
        raise httpx.TimeoutException("slow", request=request)

    provider = NvidiaProvider(
        build_nvidia_settings(), transport=build_mock_transport(timeout_handler)
    )
    with pytest.raises(ProviderTimeoutError):
        await provider.complete([{"role": "user", "content": "hi"}])
    await provider.aclose()

    def connect_handler(request):
        raise httpx.ConnectError("down")

    provider = NvidiaProvider(
        build_nvidia_settings(), transport=build_mock_transport(connect_handler)
    )
    with pytest.raises(ProviderNetworkError):
        await provider.complete([{"role": "user", "content": "hi"}])
    await provider.aclose()

    provider = NvidiaProvider(
        build_nvidia_settings(),
        transport=build_mock_transport(lambda r: httpx.Response(200, json={"nope": True})),
    )
    with pytest.raises(ProviderResponseError):
        await provider.complete([{"role": "user", "content": "hi"}])
    await provider.aclose()


@pytest.mark.anyio
async def test_not_configured_without_key():
    provider = NvidiaProvider(build_nvidia_settings(nvidia_api_key=""))
    assert provider.describe()["configured"] is False
    with pytest.raises(ProviderNotConfiguredError):
        await provider.complete([{"role": "user", "content": "hi"}])
    with pytest.raises(ProviderNotConfiguredError):
        await provider.list_models()
    await provider.aclose()


@pytest.mark.anyio
async def test_list_models_parses_ids():
    provider = NvidiaProvider(
        build_nvidia_settings(),
        transport=build_mock_transport(
            lambda r: httpx.Response(
                200, json={"object": "list", "data": [{"id": "a"}, {"id": "b"}]}
            )
        ),
    )
    assert await provider.list_models() == ["a", "b"]
    await provider.aclose()
