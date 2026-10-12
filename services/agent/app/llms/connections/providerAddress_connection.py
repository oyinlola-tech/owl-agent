from __future__ import annotations

import ipaddress
from urllib.parse import urlsplit, urlunsplit

LOOPBACK_HOST_NAMES = frozenset({"localhost", "localhost.localdomain"})
METADATA_HOST_NAMES = frozenset(
    {"metadata.google.internal", "metadata", "instance-data", "instance-data.ec2.internal"}
)
MAX_URL_LENGTH = 512


class ProviderAddressError(ValueError):
    pass


def parse_host_address(host: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    try:
        return ipaddress.ip_address(host.strip("[]").split("%")[0])
    except ValueError:
        return None


def is_loopback_host(host: str) -> bool:
    lowered = host.lower().rstrip(".")
    if lowered in LOOPBACK_HOST_NAMES or lowered.endswith(".localhost"):
        return True
    address = parse_host_address(lowered)
    return bool(address and address.is_loopback)


def validate_provider_base_url(url: str) -> str:
    # Security: a provider base URL decides where API keys and prompts are sent. Only
    # https (or http to this machine) is allowed, never embedded credentials, and never
    # link-local or cloud metadata hosts, which could leak keys or instance credentials.
    raw = (url or "").strip()
    if not raw or len(raw) > MAX_URL_LENGTH:
        raise ProviderAddressError("Enter a base URL (up to 512 characters).")
    if any(ch.isspace() or ord(ch) < 32 for ch in raw):
        raise ProviderAddressError("The base URL can't contain spaces or control characters.")
    try:
        parts = urlsplit(raw)
        port = parts.port
    except ValueError as exc:
        raise ProviderAddressError("The base URL isn't a valid address.") from exc
    scheme = parts.scheme.lower()
    if scheme not in ("http", "https"):
        raise ProviderAddressError("Only http:// and https:// addresses are allowed.")
    if parts.username is not None or parts.password is not None or "@" in parts.netloc:
        raise ProviderAddressError("Don't put credentials in the URL; save the key instead.")
    host = (parts.hostname or "").lower()
    if not host:
        raise ProviderAddressError("The base URL needs a host name.")
    if parts.query or parts.fragment:
        raise ProviderAddressError("The base URL can't have a query string or fragment.")
    loopback = is_loopback_host(host)
    if scheme != "https" and not loopback:
        raise ProviderAddressError("Use https:// (plain http is only allowed for this machine).")
    if host.rstrip(".") in METADATA_HOST_NAMES:
        raise ProviderAddressError("Cloud metadata addresses are not allowed.")
    address = parse_host_address(host)
    if address is not None:
        if address.is_link_local or address.is_unspecified or address.is_multicast:
            raise ProviderAddressError("Link-local, multicast and 0.0.0.0 addresses are blocked.")
        if str(address) in ("169.254.169.254", "fd00:ec2::254", "100.100.100.200"):
            raise ProviderAddressError("Cloud metadata addresses are not allowed.")
        mapped = getattr(address, "ipv4_mapped", None)
        if mapped is not None and (mapped.is_link_local or mapped.is_unspecified):
            raise ProviderAddressError("Link-local and 0.0.0.0 addresses are blocked.")
    netloc = host if port is None else f"{host}:{port}"
    if address is not None and address.version == 6:
        netloc = f"[{host}]" if port is None else f"[{host}]:{port}"
    return urlunsplit((scheme, netloc, parts.path.rstrip("/"), "", ""))
