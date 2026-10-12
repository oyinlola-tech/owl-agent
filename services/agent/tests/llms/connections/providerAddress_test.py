import pytest

from app.llms.connections.providerAddress_connection import (
    ProviderAddressError,
    validate_provider_base_url,
)

ALLOWED = {
    "https://api.openai.com/v1/": "https://api.openai.com/v1",
    "http://127.0.0.1:11434/v1": "http://127.0.0.1:11434/v1",
    "http://localhost:1234/v1": "http://localhost:1234/v1",
    "http://[::1]:8080/v1": "http://[::1]:8080/v1",
    "https://10.0.0.5:8443/v1": "https://10.0.0.5:8443/v1",
}
REFUSED = [
    "",
    "http://example.com/v1",
    "ftp://example.com",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "https://user:pass@example.com/v1",
    "https://token@example.com/v1",
    "https://169.254.169.254/latest",
    "http://169.254.169.254/latest",
    "https://metadata.google.internal/v1",
    "https://[fe80::1]/v1",
    "https://0.0.0.0/v1",
    "https://example.com/v1?x=1",
    "https://exa mple.com/v1",
    "https://example.com:99999/v1",
]


@pytest.mark.parametrize(("url", "expected"), ALLOWED.items())
def test_allowed_addresses_are_normalized(url, expected):
    assert validate_provider_base_url(url) == expected


@pytest.mark.parametrize("url", REFUSED)
def test_refused_addresses(url):
    with pytest.raises(ProviderAddressError):
        validate_provider_base_url(url)
