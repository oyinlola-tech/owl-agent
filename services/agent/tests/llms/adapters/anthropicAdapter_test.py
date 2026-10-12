import anthropic
import httpx2
import pytest
from supports.providerDouble_support import (
    SECRET_KEY,
    FakeAnthropicClient,
    LogCapture,
    build_text_message,
)

from app.llms.adapters.anthropic_adapter import AnthropicProvider
from app.llms.adapters.anthropicRequest_adapter import SERVER_FALLBACK_BETA
from app.llms.providers.providerError_provider import (
    InvalidCredentialsError,
    ModelNotAvailableError,
    ProviderNetworkError,
    ProviderRefusalError,
    ProviderRequestRejectedError,
    ProviderTimeoutError,
    QuotaExceededError,
    RateLimitedError,
)

MESSAGES = [
    {"role": "system", "content": "You are OWL."},
    {"role": "assistant", "content": "leading assistant is dropped"},
    {"role": "user", "content": "plan this"},
    {"role": "assistant", "content": "trailing assistant would be a prefill"},
]
REQUEST = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")


def build_provider(client, **kwargs):
    return AnthropicProvider(api_key=SECRET_KEY, client=client, **kwargs)


def status_response(status, headers=None):
    return httpx2.Response(status, headers=headers or {}, request=REQUEST)


@pytest.mark.anyio
async def test_request_maps_system_and_sends_effort_without_thinking_or_sampling():
    client = FakeAnthropicClient()
    provider = build_provider(client)
    assert await provider.complete(MESSAGES) == "hello"
    kind, params = client.calls[0]
    assert kind == "create"
    assert params["model"] == "claude-opus-5-5"
    assert params["system"] == "You are OWL."
    assert params["messages"] == [{"role": "user", "content": "plan this"}]
    assert params["output_config"] == {"effort": "high"}
    assert params["max_tokens"] == 16000
    for banned in ("thinking", "temperature", "top_p", "top_k", "tool_choice"):
        assert banned not in params


@pytest.mark.anyio
async def test_server_fallbacks_on_by_default_and_removable():
    client = FakeAnthropicClient()
    await build_provider(client).complete(MESSAGES)
    params = client.calls[0][1]
    assert params["betas"] == [SERVER_FALLBACK_BETA]
    assert params["fallbacks"] == "default"
    client = FakeAnthropicClient()
    await build_provider(client, server_fallbacks=False).complete(MESSAGES)
    params = client.calls[0][1]
    assert "betas" not in params and "fallbacks" not in params


@pytest.mark.anyio
async def test_fallbacks_skipped_for_models_without_support():
    client = FakeAnthropicClient()
    await build_provider(client).complete(MESSAGES, "claude-haiku-5-5")
    assert "fallbacks" not in client.calls[0][1]


@pytest.mark.anyio
async def test_text_blocks_only_and_measured_usage():
    client = FakeAnthropicClient(response=build_text_message("answer", usage=(30, 7)))
    provider = build_provider(client)
    assert await provider.complete(MESSAGES) == "answer"
    assert provider.pop_usage() == {"input": 30, "output": 7, "estimated": False}
    assert provider.pop_usage() is None


@pytest.mark.anyio
async def test_refusal_is_surfaced_not_empty_output():
    client = FakeAnthropicClient(response=build_text_message("", "refusal", category="cyber"))
    with pytest.raises(ProviderRefusalError) as caught:
        await build_provider(client).complete(MESSAGES)
    assert caught.value.category == "cyber"


@pytest.mark.anyio
async def test_stream_yields_text_uses_medium_effort_and_long_max_tokens():
    client = FakeAnthropicClient(stream_texts=("a", "b"), response=build_text_message("ab"))
    provider = build_provider(client)
    chunks = [c async for c in provider.complete_stream(MESSAGES)]
    assert chunks == ["a", "b"]
    kind, params = client.calls[0]
    assert kind == "stream"
    assert params["max_tokens"] == 64000
    assert params["output_config"] == {"effort": "medium"}
    assert provider.pop_usage()["estimated"] is False


@pytest.mark.anyio
async def test_stream_refusal_raises_after_partial_text():
    client = FakeAnthropicClient(
        stream_texts=("partial",), response=build_text_message("", "refusal", category="bio")
    )
    with pytest.raises(ProviderRefusalError):
        [c async for c in build_provider(client).complete_stream(MESSAGES)]


ERROR_CASES = [
    (
        anthropic.AuthenticationError("bad", response=status_response(401), body=None),
        InvalidCredentialsError,
    ),
    (
        anthropic.PermissionDeniedError("no", response=status_response(403), body=None),
        InvalidCredentialsError,
    ),
    (
        anthropic.NotFoundError("model", response=status_response(404), body=None),
        ModelNotAvailableError,
    ),
    (
        anthropic.InternalServerError("boom", response=status_response(529), body=None),
        ProviderNetworkError,
    ),
    (anthropic.APIStatusError("pay", response=status_response(402), body=None), QuotaExceededError),
    (anthropic.APITimeoutError(request=REQUEST), ProviderTimeoutError),
    (anthropic.APIConnectionError(request=REQUEST), ProviderNetworkError),
]


@pytest.mark.anyio
@pytest.mark.parametrize(("error", "expected"), ERROR_CASES)
async def test_typed_sdk_errors_map_to_owl_errors(error, expected):
    with pytest.raises(expected):
        await build_provider(FakeAnthropicClient(error=error)).complete(MESSAGES)


@pytest.mark.anyio
async def test_rate_limit_keeps_retry_after():
    error = anthropic.RateLimitError(
        "slow down", response=status_response(429, {"retry-after": "7"}), body=None
    )
    with pytest.raises(RateLimitedError) as caught:
        await build_provider(FakeAnthropicClient(error=error)).complete(MESSAGES)
    assert caught.value.retry_after == "7"


@pytest.mark.anyio
async def test_bad_request_message_is_surfaced_without_the_key():
    error = anthropic.BadRequestError(
        f"max_tokens too large for key {SECRET_KEY}", response=status_response(400), body=None
    )
    provider = AnthropicProvider(
        api_key=SECRET_KEY,
        client=FakeAnthropicClient(error=error),
        redact=lambda text: text.replace(SECRET_KEY, "[redacted-key]"),
    )
    with LogCapture() as logs, pytest.raises(ProviderRequestRejectedError) as caught:
        await provider.complete(MESSAGES)
    assert "max_tokens too large" in str(caught.value)
    assert SECRET_KEY not in str(caught.value)
    assert all(SECRET_KEY not in line for line in logs.lines)


@pytest.mark.anyio
async def test_verify_uses_models_list_and_key_never_described():
    client = FakeAnthropicClient(models=["claude-opus-5-5", "claude-haiku-5-5"])
    provider = build_provider(client)
    assert await provider.list_models() == ["claude-opus-5-5", "claude-haiku-5-5"]
    assert client.calls == [("models", {})]
    assert SECRET_KEY not in repr(provider.describe())


def test_missing_key_is_not_configured():
    assert AnthropicProvider(api_key="").describe()["configured"] is False


@pytest.mark.anyio
async def test_real_sdk_client_is_built_with_the_key_and_no_retries():
    provider = AnthropicProvider(api_key=SECRET_KEY, base_url="https://proxy.example.com")
    assert isinstance(provider._client, anthropic.AsyncAnthropic)
    assert provider._client.max_retries == 0
    assert str(provider._client.base_url).startswith("https://proxy.example.com")
