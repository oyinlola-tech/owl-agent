use tauri::{AppHandle, Manager, Url};

pub const DEEP_LINK_SCHEME: &str = "owl";
const DEEP_LINK_HOST: &str = "app";
const MAIN_WINDOW_LABEL: &str = "main";
const MAX_SCREEN_NAME_LENGTH: usize = 20;
const ALLOWED_SCREENS: [&str; 15] = [
    "welcome", "workspace", "tasks", "task", "btask", "browser", "projects", "memory", "settings",
    "inbox", "history", "models", "tools", "playbooks", "help",
];

pub enum DeepLinkTarget {
    FocusOnly,
    Screen(&'static str),
}

fn is_plain_screen_name(text: &str) -> bool {
    !text.is_empty()
        && text.len() <= MAX_SCREEN_NAME_LENGTH
        && text.bytes().all(|byte| byte.is_ascii_lowercase())
}

pub fn read_deep_link_target(url: &Url) -> DeepLinkTarget {
    if url.scheme() != DEEP_LINK_SCHEME || url.host_str() != Some(DEEP_LINK_HOST) {
        return DeepLinkTarget::FocusOnly;
    }
    let requested = url.path().trim_start_matches('/').trim_end_matches('/');
    if requested.is_empty() || !is_plain_screen_name(requested) {
        return DeepLinkTarget::FocusOnly;
    }
    // Security: only screens from the fixed allowlist are used, so link text never reaches the webview.
    match ALLOWED_SCREENS.iter().find(|screen| **screen == requested) {
        Some(screen) => DeepLinkTarget::Screen(*screen),
        None => DeepLinkTarget::FocusOnly,
    }
}

pub fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn navigate_main_window_to_screen(app: &AppHandle, screen: &'static str) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };
    let Ok(current) = window.url() else {
        return;
    };
    if let Ok(target) = current.join(&format!("/app/{screen}")) {
        let _ = window.navigate(target);
    }
}

pub fn open_deep_links(app: &AppHandle, urls: &[Url]) {
    let screen = urls.iter().rev().find_map(|url| match read_deep_link_target(url) {
        DeepLinkTarget::Screen(screen) => Some(screen),
        DeepLinkTarget::FocusOnly => None,
    });
    if let Some(screen) = screen {
        navigate_main_window_to_screen(app, screen);
    }
    focus_main_window(app);
}
