from __future__ import annotations

from ..browserExecutor_executor import BrowserError
from .browserSession_executor import (
    ACTION_TIMEOUT_MS,
    IsolatedBrowserSession,
    as_browser_action,
    origin_of,
)

SCROLL_SCRIPTS = {
    "down": "window.scrollBy(0, window.innerHeight)",
    "up": "window.scrollBy(0, -window.innerHeight)",
    "top": "window.scrollTo(0, 0)",
    "bottom": "window.scrollTo(0, document.body.scrollHeight)",
}


def resolve_locator(page, target: str):
    # Security: a page-provided target string selects an element; it never becomes code. The
    # agent chooses role/text/label/placeholder or a CSS selector, all scoped to the open page.
    spec = (target or "").strip()
    if not spec:
        raise BrowserError("target is required")
    if spec.startswith("role="):
        role, _, name = spec[len("role=") :].partition(":")
        if name.strip():
            return page.get_by_role(role.strip(), name=name.strip()).first
        return page.get_by_role(role.strip()).first
    if spec.startswith("text="):
        return page.get_by_text(spec[len("text=") :].strip()).first
    if spec.startswith("label="):
        return page.get_by_label(spec[len("label=") :].strip()).first
    if spec.startswith("placeholder="):
        return page.get_by_placeholder(spec[len("placeholder=") :].strip()).first
    return page.locator(spec).first


@as_browser_action
async def click_target(session: IsolatedBrowserSession, target: str) -> dict:
    before = origin_of(session.page.url)
    await resolve_locator(session.page, target).click(timeout=ACTION_TIMEOUT_MS)
    return session.event_result("interaction", "click", before, {"target": target})


@as_browser_action
async def type_into_target(session: IsolatedBrowserSession, target: str, text: str) -> dict:
    before = origin_of(session.page.url)
    await resolve_locator(session.page, target).fill(text, timeout=ACTION_TIMEOUT_MS)
    return session.event_result(
        "interaction", "type", before, {"target": target, "chars": len(text)}
    )


@as_browser_action
async def select_option_in_target(session: IsolatedBrowserSession, target: str, value: str) -> dict:
    before = origin_of(session.page.url)
    chosen = await resolve_locator(session.page, target).select_option(
        value, timeout=ACTION_TIMEOUT_MS
    )
    return session.event_result(
        "interaction", "select", before, {"target": target, "selected": chosen}
    )


@as_browser_action
async def scroll_page(session: IsolatedBrowserSession, direction: str) -> dict:
    script = SCROLL_SCRIPTS.get(direction)
    if script is None:
        raise BrowserError(f"unknown scroll direction: {direction}")
    before = origin_of(session.page.url)
    await session.page.evaluate(script)
    return session.event_result("interaction", "scroll", before, {"direction": direction})


@as_browser_action
async def hover_target(session: IsolatedBrowserSession, target: str) -> dict:
    before = origin_of(session.page.url)
    await resolve_locator(session.page, target).hover(timeout=ACTION_TIMEOUT_MS)
    return session.event_result("interaction", "hover", before, {"target": target})


@as_browser_action
async def wait_on_page(session: IsolatedBrowserSession, selector: str, timeout_ms: int) -> dict:
    before = origin_of(session.page.url)
    if selector:
        effective = timeout_ms or ACTION_TIMEOUT_MS
        await session.page.wait_for_selector(selector, timeout=effective)
        waited: dict = {"selector": selector, "timeout_ms": effective}
    else:
        await session.page.wait_for_timeout(timeout_ms)
        waited = {"timeout_ms": timeout_ms}
    return session.event_result("interaction", "wait", before, waited)
