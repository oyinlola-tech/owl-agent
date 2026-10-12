import asyncio
import os

import pytest
from supports.browserLocalSite_support import INJECTION_TEXT, PAGE_MARKER, serve_local_site

from app.executors.browserExecutor_executor import BrowserError
from app.executors.browsing.browserExtraction_executor import extract_from_page
from app.executors.browsing.browserInteraction_executor import (
    click_target,
    hover_target,
    scroll_page,
    select_option_in_target,
    type_into_target,
    wait_on_page,
)
from app.executors.browsing.browserSessionPool_executor import BrowserSessionManager


def make_manager(tmp_path, *, allow_loopback=True):
    return BrowserSessionManager(
        str(tmp_path / "shots"),
        str(tmp_path / "downloads"),
        allow_loopback=allow_loopback,
    )


def test_open_extract_screenshot_and_untrusted(tmp_path):
    async def scenario():
        manager = make_manager(tmp_path)
        with serve_local_site() as base:
            session, opened = await manager.open_session("task-a", base + "/")
            try:
                assert opened["untrusted"] is True
                text = await extract_from_page(session, "text")
                assert text["untrusted"] is True
                assert text["content_type"] == "web_page_content"
                assert text["title"] == "OWL Test Page"
                assert PAGE_MARKER in text["text"]
                # Security: a prompt-injection string on the page comes back as data, wrapped
                # untrusted, and is never treated as an instruction.
                assert INJECTION_TEXT in text["text"]
                links = await extract_from_page(session, "links")
                assert any(link["href"].endswith("/other") for link in links["links"])
                forms = await extract_from_page(session, "forms")
                assert forms["forms"] and forms["forms"][0]["method"] == "get"
                structure = await extract_from_page(session, "structure")
                assert structure["structure"]["counts"]["forms"] == 1
                shot = await session.screenshot()
                assert shot["bytes"] > 0
                assert os.path.isfile(os.path.join(manager.shots_dir, shot["screenshot"]))
            finally:
                await manager.shutdown()

    asyncio.run(scenario())


def test_interactions_type_select_click_navigates(tmp_path):
    async def scenario():
        manager = make_manager(tmp_path)
        with serve_local_site() as base:
            session, _ = await manager.open_session("task-i", base + "/")
            try:
                await type_into_target(session, 'input[name="q"]', "hello owl")
                assert await session.page.input_value('input[name="q"]') == "hello owl"
                await select_option_in_target(session, 'select[name="pick"]', "b")
                assert (
                    await session.page.eval_on_selector("select[name=pick]", "e => e.value") == "b"
                )
                await scroll_page(session, "bottom")
                await hover_target(session, "h1")
                waited = await wait_on_page(session, "h1", 1000)
                assert waited["action"] == "wait"
                clicked = await click_target(session, 'a[href="/other"]')
                assert clicked["url"].endswith("/other")
                # Same-origin navigation is not flagged as an external-origin hop.
                assert "external_navigation" not in clicked
                title = await extract_from_page(session, "title")
                assert title["title"] == "Other Page"
            finally:
                await manager.shutdown()

    asyncio.run(scenario())


def test_two_sessions_do_not_share_cookies(tmp_path):
    async def scenario():
        manager = make_manager(tmp_path)
        with serve_local_site() as base:
            session_a, _ = await manager.open_session("task-one", base + "/")
            session_b, _ = await manager.open_session("task-two", base + "/")
            try:
                await session_a.page.evaluate("document.cookie = 'owl=secretA; path=/'")
                cookies_a = await session_a.context.cookies()
                cookies_b = await session_b.context.cookies()
                assert any(c["name"] == "owl" for c in cookies_a)
                # Security: a second isolated session shares no cookie store with the first.
                assert not any(c["name"] == "owl" for c in cookies_b)
            finally:
                await manager.shutdown()

    asyncio.run(scenario())


def test_ssrf_guard_refuses_blocked_targets(tmp_path):
    async def scenario():
        manager = make_manager(tmp_path, allow_loopback=False)
        try:
            for blocked in (
                "http://127.0.0.1:9/",
                "http://169.254.169.254/latest/meta-data/",
                "http://10.0.0.1/",
                "ftp://example.com/",
            ):
                with pytest.raises(BrowserError):
                    await manager.open_session("task-ssrf", blocked)
            assert manager.session_count == 0
        finally:
            await manager.shutdown()

    asyncio.run(scenario())


def test_shutdown_kills_browsers_and_leaves_no_leak(tmp_path):
    async def scenario():
        manager = make_manager(tmp_path)
        with serve_local_site() as base:
            session_a, _ = await manager.open_session("task-x", base + "/")
            session_b, _ = await manager.open_session("task-y", base + "/")
            browsers = [session_a.browser, session_b.browser]
            assert all(b.is_connected() for b in browsers)
            assert manager.session_count == 2
            await manager.shutdown()
            assert manager.session_count == 0
            assert manager._playwright is None
            # Security: shutdown kills every browser process; none is left connected.
            assert not any(b.is_connected() for b in browsers)

    asyncio.run(scenario())


def test_one_active_session_per_task(tmp_path):
    async def scenario():
        manager = make_manager(tmp_path)
        with serve_local_site() as base:
            await manager.open_session("task-cap", base + "/")
            try:
                with pytest.raises(BrowserError, match="already has an open browser session"):
                    await manager.open_session("task-cap", base + "/")
                assert await manager.close_session("task-cap") is True
                assert manager.session_count == 0
            finally:
                await manager.shutdown()

    asyncio.run(scenario())
