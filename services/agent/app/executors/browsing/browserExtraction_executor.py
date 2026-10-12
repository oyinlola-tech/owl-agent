from __future__ import annotations

from ..browserExecutor_executor import BrowserError, redact_and_trim_page_text
from .browserSession_executor import IsolatedBrowserSession, as_browser_action, wrap_untrusted

EXTRACT_KINDS = ("text", "links", "forms", "structure", "title")
MAX_ITEMS = 100


async def _collect_links(page) -> list[dict]:
    items = await page.eval_on_selector_all(
        "a[href]",
        "els => els.slice(0, 100).map(a =>"
        " ({text: (a.innerText || '').trim().slice(0, 200), href: a.href}))",
    )
    return [
        {"text": redact_and_trim_page_text(i.get("text", "")), "href": i.get("href", "")}
        for i in items
    ]


async def _collect_forms(page) -> list[dict]:
    return await page.eval_on_selector_all(
        "form",
        "els => els.slice(0, 50).map(f => ({action: f.action || '',"
        " method: (f.getAttribute('method') || 'get').toLowerCase(),"
        " fields: Array.from(f.elements).slice(0, 50).map(e =>"
        " ({name: e.name || '', type: (e.type || ''), tag: e.tagName.toLowerCase()}))}))",
    )


async def _collect_structure(page) -> dict:
    return await page.evaluate(
        "() => ({headings: Array.from(document.querySelectorAll('h1,h2,h3')).slice(0, 50)"
        ".map(h => ({level: h.tagName.toLowerCase(),"
        " text: (h.innerText || '').trim().slice(0, 160)})),"
        " counts: {links: document.querySelectorAll('a[href]').length,"
        " forms: document.querySelectorAll('form').length,"
        " images: document.querySelectorAll('img').length,"
        " buttons: document.querySelectorAll('button, input[type=submit]').length}})"
    )


@as_browser_action
async def extract_from_page(session: IsolatedBrowserSession, what: str) -> dict:
    if what not in EXTRACT_KINDS:
        raise BrowserError(f"unknown extraction kind: {what}")
    page = session.page
    base: dict = {
        "session_id": session.session_id,
        "url": page.url,
        "title": await page.title(),
        "what": what,
    }
    if what == "text":
        base["text"] = redact_and_trim_page_text(await page.inner_text("body") or "")
    elif what == "links":
        base["links"] = await _collect_links(page)
    elif what == "forms":
        base["forms"] = await _collect_forms(page)
    elif what == "structure":
        base["structure"] = await _collect_structure(page)
    return wrap_untrusted("extract", base)
