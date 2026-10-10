"""Isolated browser service. Page content is untrusted input."""

from __future__ import annotations

import asyncio
import ipaddress
import os
import urllib.parse

from .memory import scrub_secrets

BLOCKED_HOSTS = {"169.254.169.254", "metadata.google.internal"}
SNAPSHOT_LIMIT = 20000


class BrowserError(Exception):
    pass


def check_url(raw: str) -> str:
    try:
        parts = urllib.parse.urlsplit(raw)
    except ValueError as exc:
        raise BrowserError(f"bad url: {exc}") from exc
    if parts.scheme not in ("http", "https"):
        raise BrowserError("only http and https urls are allowed")
    host = (parts.hostname or "").lower()
    if host in BLOCKED_HOSTS:
        raise BrowserError("cloud metadata endpoints are blocked")
    try:
        ip = ipaddress.ip_address(host)
        if not (ip.is_loopback or ip.is_private):
            raise BrowserError("only loopback, private, and public web hosts are allowed")
    except ValueError:
        pass
    return raw


def _redact(text: str) -> str:
    cleaned, _ = scrub_secrets(text)
    return cleaned[:SNAPSHOT_LIMIT]


class BrowserService:
    """One headed-off Chromium with an isolated throwaway profile."""

    def __init__(self, shots_dir: str) -> None:
        self.shots_dir = shots_dir
        os.makedirs(shots_dir, exist_ok=True)
        self._count = 0

    def _run(self, url: str, width: int, shot: bool):
        from playwright.sync_api import sync_playwright

        check_url(url)
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            try:
                page = browser.new_page(viewport={"width": width, "height": 800})
                page.goto(url, timeout=20000, wait_until="domcontentloaded")
                result = {
                    "url": page.url,
                    "title": page.title(),
                    "text": _redact(page.inner_text("body") or ""),
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

    async def inspect(self, url: str, width: int = 1440, shot: bool = False) -> dict:
        if width not in (390, 768, 1024, 1440):
            raise BrowserError("width must be one of 390, 768, 1024, 1440")
        return await asyncio.to_thread(self._run, url, width, shot)
