import json

import httpx
import pytest
from supports.providerDouble_support import SECRET_KEY, LogCapture

from app.llms.adapters.openaiCompatible_adapter import OpenAICompatibleProvider
from app.llms.connections.providerPreset_connection import PROVIDER_PRESETS
from app.llms.providers.providerError_provider import (
    InvalidCredentialsError,
    ProviderNetworkError,
    ProviderNotConfiguredError,
    ProviderRequestRejectedError,
)

EXPECTED_BASES = {
    "openai": "https://api.openai.com/v1",
    "groq": "https://api.groq.com/openai/v1",
    "xai": "https://api.x.ai/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
    "nvidia": "https://integrate.api.nvidia.com/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "together": "https://api.together.xyz/v1",
    "ollama": "http://127.0.0.1:11434/v1",
    "lmstudio": "http://127.0.0.1:1234/v1",
    "llamacpp": "http://127.0.0.1:8080/v1",
}
OPENAI_STYLE = [p for p in PROVIDER_PRESETS.values() if p.kind == "openai_compatible"]


def build_preset_provider(preset, handler, base_url=None, key=SECRET_KEY):
    return OpenAICompatibleProvider(
        provider_id=preset.id,
        label=preset.label,
        base_url=base_url or preset.base_url or "https://llm.example.com/v1",
        api_key=key if preset.requires_key else "",
        model="picked-model",
        requires_key=preset.requires_key,
        max_tokens_field=preset.max_tokens_field,
        transport=httpx.MockTransport(handler),
    )


def test_every_preset_base_url_is_pinned():
    for preset_id, base in EXPECTED_BASES.items():
        assert PROVIDER_PRESETS[preset_id].base_url == base


@pytest.mark.anyio
@pytest.mark.parametrize("preset", OPENAI_STYLE, ids=lambda p: p.id)
async def test_preset_request_shape_auth_and_model_list(preset):
    seen = []

    def handler(request):
        seen.append(request)
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [{"id": "m-b"}, {"id": "m-a"}]})
        body = {
            "choices": [{"message": {"role": "assistant", "content": "ok"}}],
            "usage": {"prompt_tokens": 9, "completion_tokens": 2},
        }
        return httpx.Response(200, json=body)

    provider = build_preset_provider(preset, handler)
    assert await provider.list_models() == ["m-b", "m-a"]
    assert await provider.complete([{"role": "user", "content": "hi"}]) == "ok"
    assert provider.pop_usage() == {"input": 9, "output": 2, "estimated": False}
    models_request, chat_request = seen
    base = (preset.base_url or "https://llm.example.com/v1").rstrip("/")
    assert str(models_request.url) == f"{base}/models"
    assert str(chat_request.url) == f"{base}/chat/completions"
    payload = json.loads(chat_request.content)
    assert payload["model"] == "picked-model"
    assert preset.max_tokens_field in payload
    assert "temperature" not in payload
    if preset.requires_key:
        assert chat_request.headers["authorization"] == f"Bearer {SECRET_KEY}"
    else:
        assert "authorization" not in chat_request.headers
    await provider.aclose()


def test_openai_uses_max_completion_tokens():
    assert PROVIDER_PRESETS["openai"].max_tokens_field == "max_completion_tokens"


@pytest.mark.anyio
async def test_missing_usage_leaves_estimate_to_caller():
    def handler(request):
        return httpx.Response(200, json={"choices": [{"message": {"content": "x"}}]})

    provider = build_preset_provider(PROVIDER_PRESETS["groq"], handler)
    await provider.complete([{"role": "user", "content": "hi"}])
    assert provider.pop_usage() is None


@pytest.mark.anyio
async def test_errors_never_carry_the_key():
    def handler(request):
        return httpx.Response(401, json={"error": f"bad key {SECRET_KEY}"})

    provider = build_preset_provider(PROVIDER_PRESETS["openai"], handler)
    with LogCapture() as logs, pytest.raises(InvalidCredentialsError) as caught:
        await provider.complete([{"role": "user", "content": "hi"}])
    assert SECRET_KEY not in str(caught.value)
    assert all(SECRET_KEY not in line for line in logs.lines)


@pytest.mark.anyio
async def test_status_mapping_for_bad_request_and_server_errors():
    statuses = iter([400, 503])

    def handler(request):
        return httpx.Response(next(statuses))

    provider = build_preset_provider(PROVIDER_PRESETS["xai"], handler)
    with pytest.raises(ProviderRequestRejectedError):
        await provider.complete([{"role": "user", "content": "hi"}])
    with pytest.raises(ProviderNetworkError):
        await provider.complete([{"role": "user", "content": "hi"}])


@pytest.mark.anyio
async def test_base_url_is_rechecked_at_request_time():
    def handler(request):
        raise AssertionError("must not send")

    provider = build_preset_provider(
        PROVIDER_PRESETS["custom"], handler, base_url="http://169.254.169.254/v1"
    )
    with pytest.raises(ProviderNotConfiguredError):
        await provider.list_models()


@pytest.mark.anyio
async def test_stream_parses_deltas_and_usage_only_chunks():
    body = (
        'data: {"choices":[{"delta":{"content":"he"}}]}\n\n'
        'data: {"choices":[{"delta":{"content":"llo"}}]}\n\n'
        'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\n'
        "data: [DONE]\n\n"
    )

    def handler(request):
        assert json.loads(request.content)["stream"] is True
        return httpx.Response(200, content=body.encode())

    provider = build_preset_provider(PROVIDER_PRESETS["together"], handler)
    chunks = [c async for c in provider.complete_stream([{"role": "user", "content": "hi"}])]
    assert "".join(chunks) == "hello"
    assert provider.pop_usage() == {"input": 3, "output": 2, "estimated": False}
