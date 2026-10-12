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
    def __init__(self, retry_after: str = "", label: str = "NVIDIA") -> None:
        self.retry_after = retry_after
        hint = f" Retry after {retry_after}s." if retry_after else ""
        super().__init__(f"Rate limited by {label} API.{hint}")


class ProviderTimeoutError(ProviderError):
    pass


class ProviderNetworkError(ProviderError):
    pass


class ProviderResponseError(ProviderError):
    pass


class ProviderRefusalError(ProviderError):
    def __init__(self, category: str = "") -> None:
        self.category = category
        detail = f" ({category})" if category else ""
        super().__init__(f"The model declined this request{detail}.")


class ProviderRequestRejectedError(ProviderError):
    pass


def build_error_for_status(
    status: int, retry_after: str = "", label: str = "NVIDIA"
) -> ProviderError:
    if status in (401, 403):
        return InvalidCredentialsError(f"{label} key was rejected ({status}). Check the API key.")
    if status == 402:
        return QuotaExceededError(f"{label} quota exceeded (402).")
    if status == 404:
        return ModelNotAvailableError("Model is not enabled for this key (404).")
    if status == 429:
        return RateLimitedError(retry_after, label)
    if status == 400:
        return ProviderRequestRejectedError(f"{label} rejected the request (HTTP 400).")
    if status >= 500:
        return ProviderNetworkError(f"{label} API error (HTTP {status}).")
    return ProviderError(f"{label} API error (HTTP {status}).")
