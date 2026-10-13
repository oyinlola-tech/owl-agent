from __future__ import annotations

import asyncio
import logging
import os

from ...databases.recordStamp_database import create_prefixed_id
from ...guards.secretScrub_guard import redact_secrets_in_text
from ..browserExecutor_executor import BrowserError, validate_browser_url
from .browserSession_executor import (
    DEFAULT_VIEWPORT_HEIGHT,
    DEFAULT_VIEWPORT_WIDTH,
    IsolatedBrowserSession,
)

MAX_TOTAL_SESSIONS = 8

log = logging.getLogger("owl")


class BrowserSessionManager:
    # Security: sessions are bounded (one per task, a small total cap), isolated, tied to the
    # task that opened them, and killed on shutdown so no browser process or cookie store ever
    # outlives its task.

    def __init__(
        self,
        shots_dir: str,
        downloads_dir: str,
        *,
        allow_loopback: bool = False,
        max_total_sessions: int = MAX_TOTAL_SESSIONS,
    ) -> None:
        self.shots_dir = shots_dir
        self.downloads_dir = downloads_dir
        self.allow_loopback = allow_loopback
        self.max_total_sessions = max_total_sessions
        os.makedirs(shots_dir, mode=0o700, exist_ok=True)
        os.makedirs(downloads_dir, mode=0o700, exist_ok=True)
        self._playwright = None
        self._sessions: dict[str, IsolatedBrowserSession] = {}
        self._lock = asyncio.Lock()

    @property
    def session_count(self) -> int:
        return len(self._sessions)

    async def _ensure_started(self) -> None:
        if self._playwright is None:
            from playwright.async_api import async_playwright

            self._playwright = await async_playwright().start()

    async def open_session(self, task_id: str, url: str) -> tuple[IsolatedBrowserSession, dict]:
        # Security: the URL is validated before any browser is launched, so a blocked target
        # never even spawns a process.
        await asyncio.to_thread(validate_browser_url, url, allow_loopback=self.allow_loopback)
        async with self._lock:
            if task_id in self._sessions:
                raise BrowserError("this task already has an open browser session; close it first")
            if len(self._sessions) >= self.max_total_sessions:
                raise BrowserError("too many open browser sessions; close one first")
            await self._ensure_started()
            browser = await self._playwright.chromium.launch(headless=True)
            context = await browser.new_context(
                viewport={"width": DEFAULT_VIEWPORT_WIDTH, "height": DEFAULT_VIEWPORT_HEIGHT},
                accept_downloads=True,
            )
            page = await context.new_page()
            session = IsolatedBrowserSession(
                create_prefixed_id("bsn"),
                task_id,
                browser,
                context,
                page,
                shots_dir=self.shots_dir,
                downloads_dir=self.downloads_dir,
                allow_loopback=self.allow_loopback,
            )
            await session.install_route_guard()
            self._sessions[task_id] = session
        try:
            result = await session.navigate(url)
        except BaseException:
            await self.close_session(task_id)
            raise
        return session, result

    def active_session(self, task_id: str) -> IsolatedBrowserSession:
        session = self._sessions.get(task_id)
        if session is None:
            raise BrowserError(
                "no open browser session for this task; call browser_session_open first"
            )
        return session

    async def close_session(self, task_id: str) -> bool:
        session = self._sessions.pop(task_id, None)
        if session is None:
            return False
        try:
            await session.close()
        except Exception as exc:
            cleaned, _ = redact_secrets_in_text(str(exc))
            log.debug("browser session close failed: %s", cleaned)
        return True

    async def close_task_sessions(self, task_id: str) -> bool:
        return await self.close_session(task_id)

    async def shutdown(self) -> None:
        for task_id in list(self._sessions):
            await self.close_session(task_id)
        if self._playwright is not None:
            try:
                await self._playwright.stop()
            finally:
                self._playwright = None
