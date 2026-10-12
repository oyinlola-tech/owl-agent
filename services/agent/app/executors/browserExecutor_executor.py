from __future__ import annotations

import asyncio
import ipaddress
import os
import socket
import urllib.parse
from collections.abc import Callable

from ..guards.secretScrub_guard import redact_secrets_in_text

BLOCKED_METADATA_HOSTS = {"169.254.169.254", "fd00:ec2::254", "metadata.google.internal"}
METADATA_ADDRESSES = {
    ipaddress.ip_address("169.254.169.254"),
    ipaddress.ip_address("fd00:ec2::254"),
}
PAGE_TEXT_LIMIT = 20000

Resolver = Callable[[str], list[str]]


class BrowserError(Exception):
    pass


def resolve_host_addresses(host: str) -> list[str]:
    try:
        infos = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
    except (socket.gaierror, UnicodeError) as exc:
        raise BrowserError(f"cannot resolve host {host}") from exc
    return sorted({str(info[4][0]).split("%")[0] for info in infos})


def describe_blocked_address(ip, allow_loopback: bool) -> str:
    if ip in METADATA_ADDRESSES:
        return "cloud metadata endpoints are blocked"
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        return describe_blocked_address(ip.ipv4_mapped, allow_loopback)
    if ip.is_loopback:
        return "" if allow_loopback else "loopback addresses are blocked"
    if ip.is_link_local:
        return "link-local addresses are blocked"
    if ip.is_multicast:
        return "multicast addresses are blocked"
    if ip.is_unspecified:
        return "unspecified addresses are blocked"
    if ip.is_private or ip.is_reserved or not ip.is_global:
        return "private and reserved network addresses are blocked"
    return ""


def validate_browser_url(
    raw: str, *, resolver: Resolver | None = None, allow_loopback: bool = False
) -> str:
    # Security: the browser may only reach public web hosts. Every address the name resolves
    # to is checked, so a public name pointing at 127.0.0.1 or 169.254.169.254 is refused.
    try:
        parts = urllib.parse.urlsplit(raw)
    except ValueError as exc:
        raise BrowserError(f"bad url: {exc}") from exc
    if parts.scheme not in ("http", "https"):
        raise BrowserError("only http and https urls are allowed")
    host = (parts.hostname or "").lower().rstrip(".")
    if not host:
        raise BrowserError("url has no host")
    if host in BLOCKED_METADATA_HOSTS:
        raise BrowserError("cloud metadata endpoints are blocked")
    try:
        addresses = [str(ipaddress.ip_address(host))]
    except ValueError:
        addresses = (resolver or resolve_host_addresses)(host)
    if not addresses:
        raise BrowserError(f"cannot resolve host {host}")
    for address in addresses:
        try:
            ip = ipaddress.ip_address(address)
        except ValueError as exc:
            raise BrowserError(f"resolver returned a bad address for {host}") from exc
        reason = describe_blocked_address(ip, allow_loopback)
        if reason:
            raise BrowserError(f"{reason} ({host} -> {address})")
    return raw


def redact_and_trim_page_text(text: str) -> str:
    # Security: page content is untrusted input; secrets are redacted before it is returned.
    cleaned, _ = redact_secrets_in_text(text)
    return cleaned[:PAGE_TEXT_LIMIT]


class BrowserPageInspector:
    # Security: each visit uses one headless Chromium with an isolated throwaway profile.

    def __init__(self, shots_dir: str, *, allow_loopback: bool = False) -> None:
        self.shots_dir = shots_dir
        self.allow_loopback = allow_loopback
        os.makedirs(shots_dir, mode=0o700, exist_ok=True)
        self._count = 0

    def open_page_and_read(self, url: str, width: int, shot: bool):
        from playwright.sync_api import sync_playwright

        validate_browser_url(url, allow_loopback=self.allow_loopback)
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            try:
                page = browser.new_page(viewport={"width": width, "height": 800})
                page.route("**/*", self.allow_only_safe_requests)
                response = page.goto(url, timeout=20000, wait_until="domcontentloaded")
                self.raise_if_redirect_chain_unsafe(response, page.url)
                result = {
                    "url": page.url,
                    "title": page.title(),
                    "text": redact_and_trim_page_text(page.inner_text("body") or ""),
                }
                if shot:
                    self._count += 1
                    name = f"shot-{self._count}.png"
                    dest = os.path.join(self.shots_dir, name)
                    page.screenshot(path=dest, full_page=False)
                    result["screenshot"] = name
                    result["shot_bytes"] = os.path.getsize(dest)
                return result
            finally:
                browser.close()

    def allow_only_safe_requests(self, route, request) -> None:
        # Security: every request the page makes, including each redirect hop, is checked
        # again, so a public page can't bounce the browser to an internal address.
        if not request.url.startswith(("http://", "https://")):
            if request.url.startswith(("data:", "blob:", "about:")):
                route.continue_()
                return
            route.abort("blockedbyclient")
            return
        try:
            validate_browser_url(request.url, allow_loopback=self.allow_loopback)
        except BrowserError:
            route.abort("blockedbyclient")
            return
        route.continue_()

    def raise_if_redirect_chain_unsafe(self, response, final_url: str) -> None:
        validate_browser_url(final_url, allow_loopback=self.allow_loopback)
        request = response.request if response is not None else None
        while request is not None:
            validate_browser_url(request.url, allow_loopback=self.allow_loopback)
            request = request.redirected_from

    async def inspect_page(self, url: str, width: int = 1440, shot: bool = False) -> dict:
        if width not in (390, 768, 1024, 1440):
            raise BrowserError("width must be one of 390, 768, 1024, 1440")
        return await asyncio.to_thread(self.open_page_and_read, url, width, shot)
