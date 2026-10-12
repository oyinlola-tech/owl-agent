from __future__ import annotations


class ProviderError(Exception):
    # Security: provider errors are user-safe and never carry key material.
    pass


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


def build_error_for_status(status: int, retry_after: str = "") -> ProviderError:
    if status == 401:
        return InvalidCredentialsError("NVIDIA key was rejected (401). Check NVIDIA_API_KEY.")
    if status == 402:
        return QuotaExceededError("NVIDIA quota exceeded (402).")
    if status == 404:
        return ModelNotAvailableError("Model is not enabled for this key (404).")
    if status == 429:
        return RateLimitedError(retry_after)
    return ProviderError(f"NVIDIA API error (HTTP {status}).")
