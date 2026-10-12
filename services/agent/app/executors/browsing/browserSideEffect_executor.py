from __future__ import annotations

import asyncio
import os

from ..browserExecutor_executor import validate_browser_url
from .browserInteraction_executor import resolve_locator
from .browserSession_executor import (
    ACTION_TIMEOUT_MS,
    IsolatedBrowserSession,
    as_browser_action,
    origin_of,
)


def sanitize_download_name(name: str) -> str:
    # Security: a page-chosen filename never escapes the sandboxed download dir.
    base = os.path.basename((name or "").replace("\\", "/"))
    cleaned = "".join(c for c in base if c.isalnum() or c in ("-", "_", ".")).strip(".")
    return cleaned or "download.bin"


@as_browser_action
async def submit_form(session: IsolatedBrowserSession, target: str) -> dict:
    before = origin_of(session.page.url)
    locator = resolve_locator(session.page, target)
    tag = await locator.evaluate("e => e.tagName.toLowerCase()")
    try:
        async with session.page.expect_navigation(
            timeout=ACTION_TIMEOUT_MS, wait_until="domcontentloaded"
        ):
            if tag == "form":
                await locator.evaluate("f => (f.requestSubmit ? f.requestSubmit() : f.submit())")
            else:
                await locator.click(timeout=ACTION_TIMEOUT_MS)
    except Exception:
        # A submit that updates the page in place triggers no top-level navigation.
        pass
    # Security: the destination after a submit is re-checked against the SSRF guard.
    await asyncio.to_thread(
        validate_browser_url, session.page.url, allow_loopback=session.allow_loopback
    )
    return session.event_result("side_effect", "submit", before, {"target": target})


@as_browser_action
async def upload_file(session: IsolatedBrowserSession, target: str, resolved_path: str) -> dict:
    # Security: resolved_path has already passed the workspace guard, so uploads can only come
    # from inside the authorized project workspace, never an arbitrary host path.
    before = origin_of(session.page.url)
    await resolve_locator(session.page, target).set_input_files(
        resolved_path, timeout=ACTION_TIMEOUT_MS
    )
    return session.event_result(
        "side_effect", "upload", before, {"target": target, "path": resolved_path}
    )


@as_browser_action
async def download_file(session: IsolatedBrowserSession, target: str) -> dict:
    before = origin_of(session.page.url)
    async with session.page.expect_download(timeout=ACTION_TIMEOUT_MS) as download_info:
        if target:
            await resolve_locator(session.page, target).click(timeout=ACTION_TIMEOUT_MS)
    download = await download_info.value
    name = sanitize_download_name(download.suggested_filename)
    dest = os.path.join(session.downloads_dir, f"{session.session_id}-{name}")
    await download.save_as(dest)
    return session.event_result(
        "side_effect",
        "download",
        before,
        {"path": dest, "bytes": os.path.getsize(dest), "suggested_name": name},
    )
