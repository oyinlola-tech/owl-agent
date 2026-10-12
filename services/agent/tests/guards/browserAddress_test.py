import pytest

from app.executors.browserExecutor_executor import BrowserError, validate_browser_url


def resolve_to(*addresses):
    return lambda host: list(addresses)


@pytest.mark.parametrize(
    ("address", "reason"),
    [
        ("127.0.0.1", "loopback"),
        ("::1", "loopback"),
        ("10.0.0.5", "private"),
        ("192.168.1.10", "private"),
        ("172.16.0.1", "private"),
        ("169.254.10.10", "link-local"),
        ("fe80::1", "link-local"),
        ("169.254.169.254", "metadata"),
        ("fd00:ec2::254", "metadata"),
        ("224.0.0.1", "multicast"),
        ("0.0.0.0", "unspecified"),
        ("::ffff:127.0.0.1", "loopback"),
    ],
)
def test_every_resolved_address_is_checked(address, reason):
    with pytest.raises(BrowserError, match=reason):
        validate_browser_url("https://innocent.example/", resolver=resolve_to(address))


def test_one_bad_address_among_good_ones_blocks():
    with pytest.raises(BrowserError):
        validate_browser_url(
            "https://mixed.example/", resolver=resolve_to("93.184.216.34", "10.1.2.3")
        )


def test_public_address_and_schemes():
    assert validate_browser_url("https://example.com/", resolver=resolve_to("93.184.216.34"))
    for bad in ("ftp://example.com/", "file:///etc/passwd", "javascript:alert(1)", "http:///x"):
        with pytest.raises(BrowserError):
            validate_browser_url(bad, resolver=resolve_to("93.184.216.34"))


def test_literal_ip_and_metadata_names_skip_resolver():
    def failing_resolver(host):
        raise AssertionError("resolver must not be called")

    with pytest.raises(BrowserError, match="metadata"):
        validate_browser_url("http://metadata.google.internal/", resolver=failing_resolver)
    with pytest.raises(BrowserError, match="private"):
        validate_browser_url("http://10.0.0.1/", resolver=failing_resolver)


def test_loopback_opt_in_still_blocks_metadata():
    assert validate_browser_url(
        "http://localhost:3000/", resolver=resolve_to("127.0.0.1"), allow_loopback=True
    )
    with pytest.raises(BrowserError):
        validate_browser_url(
            "http://x.example/", resolver=resolve_to("169.254.169.254"), allow_loopback=True
        )
