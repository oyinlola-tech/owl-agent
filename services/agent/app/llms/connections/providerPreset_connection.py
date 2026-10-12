from __future__ import annotations

from dataclasses import dataclass

ANTHROPIC_DEFAULT_MODEL = "claude-opus-5-5"


@dataclass(frozen=True)
class ProviderPreset:
    id: str
    label: str
    group: str
    kind: str
    base_url: str
    base_url_editable: bool = False
    requires_key: bool = True
    key_url: str = ""
    default_model: str = ""
    max_tokens_field: str = "max_tokens"
    description: str = ""
    how_to: str = ""


PROVIDER_PRESETS: dict[str, ProviderPreset] = {
    preset.id: preset
    for preset in (
        ProviderPreset(
            id="anthropic",
            label="Claude (Anthropic)",
            group="cloud",
            kind="anthropic",
            base_url="https://api.anthropic.com",
            key_url="https://console.anthropic.com/settings/keys",
            default_model=ANTHROPIC_DEFAULT_MODEL,
            description=(
                "Claude through the official Anthropic SDK. If Claude declines a request, "
                "Anthropic's server-side fallback retries it on a recommended model "
                "(you can turn this off)."
            ),
        ),
        ProviderPreset(
            id="openai",
            label="OpenAI",
            group="cloud",
            kind="openai_compatible",
            base_url="https://api.openai.com/v1",
            key_url="https://platform.openai.com/api-keys",
            max_tokens_field="max_completion_tokens",
            description="OpenAI models through the OpenAI API.",
        ),
        ProviderPreset(
            id="gemini",
            label="Google Gemini",
            group="cloud",
            kind="openai_compatible",
            base_url="https://generativelanguage.googleapis.com/v1beta/openai",
            key_url="https://aistudio.google.com/apikey",
            description="Gemini through Google's OpenAI-compatible endpoint.",
        ),
        ProviderPreset(
            id="xai",
            label="Grok (xAI)",
            group="cloud",
            kind="openai_compatible",
            base_url="https://api.x.ai/v1",
            key_url="https://console.x.ai",
            description="Grok models from xAI.",
        ),
        ProviderPreset(
            id="groq",
            label="Groq",
            group="cloud",
            kind="openai_compatible",
            base_url="https://api.groq.com/openai/v1",
            key_url="https://console.groq.com/keys",
            description="Open models served fast by Groq.",
        ),
        ProviderPreset(
            id="nvidia",
            label="NVIDIA",
            group="cloud",
            kind="openai_compatible",
            base_url="https://integrate.api.nvidia.com/v1",
            key_url="https://build.nvidia.com",
            description="NVIDIA Build hosted models.",
        ),
        ProviderPreset(
            id="openrouter",
            label="OpenRouter",
            group="cloud",
            kind="openai_compatible",
            base_url="https://openrouter.ai/api/v1",
            key_url="https://openrouter.ai/keys",
            description="Many providers' models behind one OpenRouter key.",
        ),
        ProviderPreset(
            id="together",
            label="Together AI",
            group="cloud",
            kind="openai_compatible",
            base_url="https://api.together.xyz/v1",
            key_url="https://api.together.ai/settings/api-keys",
            description="Open models hosted by Together AI.",
        ),
        ProviderPreset(
            id="custom",
            label="Custom (OpenAI-compatible)",
            group="cloud",
            kind="openai_compatible",
            base_url="",
            base_url_editable=True,
            requires_key=False,
            description="Any OpenAI-compatible endpoint. https is required unless it runs here.",
        ),
        ProviderPreset(
            id="ollama",
            label="Ollama",
            group="local",
            kind="openai_compatible",
            base_url="http://127.0.0.1:11434/v1",
            base_url_editable=True,
            requires_key=False,
            key_url="https://ollama.com/download",
            description="Models running on this computer with Ollama.",
            how_to="Install Ollama, run `ollama serve`, then `ollama pull <model>`.",
        ),
        ProviderPreset(
            id="lmstudio",
            label="LM Studio",
            group="local",
            kind="openai_compatible",
            base_url="http://127.0.0.1:1234/v1",
            base_url_editable=True,
            requires_key=False,
            key_url="https://lmstudio.ai",
            description="Models running on this computer with LM Studio.",
            how_to="Open LM Studio, load a model, and start the local server (Developer tab).",
        ),
        ProviderPreset(
            id="llamacpp",
            label="llama.cpp / vLLM",
            group="local",
            kind="openai_compatible",
            base_url="http://127.0.0.1:8080/v1",
            base_url_editable=True,
            requires_key=False,
            key_url="https://github.com/ggml-org/llama.cpp",
            description="A llama.cpp or vLLM OpenAI-compatible server on this computer.",
            how_to="Start `llama-server -m model.gguf --port 8080` or `vllm serve <model>`.",
        ),
    )
}

LOCAL_PROVIDER_IDS = tuple(p.id for p in PROVIDER_PRESETS.values() if p.group == "local")


def find_provider_preset(provider_id: str) -> ProviderPreset | None:
    return PROVIDER_PRESETS.get(provider_id)
