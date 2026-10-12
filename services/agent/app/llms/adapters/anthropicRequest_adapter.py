from __future__ import annotations

import anthropic

from ...guards.secretScrub_guard import redact_secrets_in_text
from ..providers.providerError_provider import (
    InvalidCredentialsError,
    ModelNotAvailableError,
    ProviderError,
    ProviderNetworkError,
    ProviderRefusalError,
    ProviderRequestRejectedError,
    ProviderResponseError,
    ProviderTimeoutError,
    QuotaExceededError,
    RateLimitedError,
)

SERVER_FALLBACK_BETA = "server-side-fallback-2026-07-01"
SERVER_FALLBACK_MODELS = frozenset(
    {"claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"}
)
NON_STREAMING_MAX_TOKENS = 16000
STREAMING_MAX_TOKENS = 64000
EFFORT_LEVELS = ("low", "medium", "high", "xhigh", "max")


def convert_messages_for_anthropic(
    messages: list[dict[str, str]],
) -> tuple[str, list[dict[str, str]]]:
    system_parts: list[str] = []
    turns: list[dict[str, str]] = []
    for message in messages:
        role = message.get("role", "user")
        content = str(message.get("content", ""))
        if role == "system":
            if content.strip():
                system_parts.append(content)
            continue
        if role not in ("user", "assistant") or not content.strip():
            continue
        turns.append({"role": role, "content": content})
    while turns and turns[0]["role"] != "user":
        turns.pop(0)
    while turns and turns[-1]["role"] != "user":
        turns.pop()
    return "\n\n".join(system_parts), turns


def build_anthropic_request(
    messages: list[dict[str, str]],
    model: str,
    *,
    effort: str,
    max_tokens: int,
    server_fallbacks: bool,
) -> dict:
    system, turns = convert_messages_for_anthropic(messages)
    if not turns:
        raise ProviderRequestRejectedError("There is no user message to send to Claude.")
    params: dict = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": turns,
        "output_config": {"effort": effort if effort in EFFORT_LEVELS else "medium"},
    }
    if system:
        params["system"] = system
    if server_fallbacks and model in SERVER_FALLBACK_MODELS:
        params["betas"] = [SERVER_FALLBACK_BETA]
        params["fallbacks"] = "default"
    return params


def read_text_from_message(message: object) -> str:
    stop_reason = getattr(message, "stop_reason", None)
    if stop_reason == "refusal":
        details = getattr(message, "stop_details", None)
        category = getattr(details, "category", None) if details is not None else None
        raise ProviderRefusalError(str(category or ""))
    blocks = getattr(message, "content", None)
    if not isinstance(blocks, list):
        raise ProviderResponseError("Claude returned an unreadable reply.")
    return "".join(
        str(getattr(block, "text", "")) for block in blocks if getattr(block, "type", "") == "text"
    )


def read_usage_from_message(message: object) -> dict | None:
    usage = getattr(message, "usage", None)
    input_tokens = getattr(usage, "input_tokens", None)
    if not isinstance(input_tokens, int):
        return None
    output_tokens = getattr(usage, "output_tokens", 0)
    return {
        "input": input_tokens,
        "output": output_tokens if isinstance(output_tokens, int) else 0,
        "estimated": False,
    }


def convert_anthropic_error(exc: Exception, redact) -> ProviderError:
    # Security: upstream messages may echo request details, so they are scrubbed of every
    # known key and secret pattern before they reach logs or the user.
    if isinstance(exc, anthropic.AuthenticationError | anthropic.PermissionDeniedError):
        return InvalidCredentialsError("Claude rejected the API key.")
    if isinstance(exc, anthropic.NotFoundError):
        return ModelNotAvailableError("That Claude model isn't available to this key.")
    if isinstance(exc, anthropic.RateLimitError):
        retry_after = exc.response.headers.get("retry-after", "") if exc.response else ""
        return RateLimitedError(retry_after, "Claude")
    if isinstance(exc, anthropic.BadRequestError):
        message = redact_secrets_in_text(redact(str(exc.message or "")))[0][:300]
        return ProviderRequestRejectedError(f"Claude rejected the request: {message}")
    if isinstance(exc, anthropic.APIStatusError):
        if exc.status_code >= 500:
            return ProviderNetworkError(f"Claude API error (HTTP {exc.status_code}).")
        if exc.status_code == 402:
            return QuotaExceededError("Claude billing or credit problem (402).")
        return ProviderError(f"Claude API error (HTTP {exc.status_code}).")
    if isinstance(exc, anthropic.APITimeoutError):
        return ProviderTimeoutError("Claude request timed out.")
    if isinstance(exc, anthropic.APIConnectionError):
        return ProviderNetworkError("Cannot reach the Claude API.")
    return ProviderResponseError("Claude returned an unexpected error.")
