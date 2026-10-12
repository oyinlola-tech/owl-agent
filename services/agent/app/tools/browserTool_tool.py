from __future__ import annotations

from .handlers.browser.browserInspection_handler import (
    extract_browser_page,
    screenshot_browser_page,
)
from .handlers.browser.browserInteraction_handler import (
    click_browser_target,
    hover_browser_target,
    scroll_browser_page,
    select_browser_target,
    type_browser_target,
    wait_browser_page,
)
from .handlers.browser.browserNavigation_handler import (
    browser_session_back,
    browser_session_forward,
    browser_session_reload,
    close_browser_session,
    navigate_browser_session,
    open_browser_session,
)
from .handlers.browser.browserSideEffect_handler import (
    download_browser_file,
    submit_browser_form,
    upload_browser_file,
)
from .toolArgument_tool import (
    BrowserClickArguments,
    BrowserDownloadArguments,
    BrowserExtractArguments,
    BrowserHoverArguments,
    BrowserNavigateArguments,
    BrowserScrollArguments,
    BrowserSelectArguments,
    BrowserSessionOpenArguments,
    BrowserSessionRefArguments,
    BrowserSubmitArguments,
    BrowserTypeArguments,
    BrowserUploadArguments,
    BrowserWaitArguments,
)
from .toolRegistry_tool import TOOL_HANDLERS, ToolDefinition, register_tool

BROWSER_TOOLS = (
    (
        open_browser_session,
        "browser_session_open",
        BrowserSessionOpenArguments,
        False,
        "Open an isolated browser session and navigate to a URL. Read-only, SSRF-guarded.",
    ),
    (
        navigate_browser_session,
        "browser_navigate",
        BrowserNavigateArguments,
        False,
        "Navigate the session to a new URL. Read-only, SSRF-guarded.",
    ),
    (
        browser_session_back,
        "browser_back",
        BrowserSessionRefArguments,
        False,
        "Go back in session history. Read-only.",
    ),
    (
        browser_session_forward,
        "browser_forward",
        BrowserSessionRefArguments,
        False,
        "Go forward in session history. Read-only.",
    ),
    (
        browser_session_reload,
        "browser_reload",
        BrowserSessionRefArguments,
        False,
        "Reload the current page. Read-only.",
    ),
    (
        close_browser_session,
        "browser_close",
        BrowserSessionRefArguments,
        False,
        "Close the browser session.",
    ),
    (
        extract_browser_page,
        "browser_extract",
        BrowserExtractArguments,
        False,
        "Extract page text, links, forms, structure or title as untrusted data. Read-only.",
    ),
    (
        screenshot_browser_page,
        "browser_screenshot",
        BrowserSessionRefArguments,
        False,
        "Capture a screenshot of the current page. Read-only.",
    ),
    (
        click_browser_target,
        "browser_click",
        BrowserClickArguments,
        False,
        "Click an element in the page. Audited.",
    ),
    (
        type_browser_target,
        "browser_type",
        BrowserTypeArguments,
        False,
        "Type text into an element. Audited.",
    ),
    (
        select_browser_target,
        "browser_select",
        BrowserSelectArguments,
        False,
        "Select a dropdown option. Audited.",
    ),
    (
        scroll_browser_page,
        "browser_scroll",
        BrowserScrollArguments,
        False,
        "Scroll the page. Audited.",
    ),
    (
        hover_browser_target,
        "browser_hover",
        BrowserHoverArguments,
        False,
        "Hover over an element. Audited.",
    ),
    (
        wait_browser_page,
        "browser_wait",
        BrowserWaitArguments,
        False,
        "Wait for a selector or a timeout. Audited.",
    ),
    (
        submit_browser_form,
        "browser_submit",
        BrowserSubmitArguments,
        True,
        "Submit a web form. External side effect. Requires approval.",
    ),
    (
        upload_browser_file,
        "browser_upload",
        BrowserUploadArguments,
        True,
        "Upload a workspace file to a page. External side effect. Requires approval.",
    ),
    (
        download_browser_file,
        "browser_download",
        BrowserDownloadArguments,
        True,
        "Download a file to the sandboxed download dir. External side effect. Requires approval.",
    ),
)

for browser_handler, browser_name, browser_model, browser_approval, browser_desc in BROWSER_TOOLS:
    TOOL_HANDLERS[browser_name] = browser_handler
    register_tool(ToolDefinition(browser_name, browser_desc, browser_model, browser_approval))
