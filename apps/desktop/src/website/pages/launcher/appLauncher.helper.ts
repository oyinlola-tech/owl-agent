export const APP_HANDOFF_TIMEOUT_MS = 2500;

const SAFE_SCREEN_NAME = /^[a-z]{1,20}$/;

export function deepLinkForAppPath(path: string): string {
  const screen = path.replace(/^\/app\/?/, "").replace(/\/+$/, "");
  return SAFE_SCREEN_NAME.test(screen) ? `owl://app/${screen}` : "owl://app";
}

type AppHandoffSignals = { windowBlurred: boolean; pageHidden: boolean; pageHiddenForNavigation: boolean };

export function didAppTakeOver(signals: AppHandoffSignals): boolean {
  return signals.windowBlurred || signals.pageHidden || signals.pageHiddenForNavigation;
}

export function watchForAppHandoff(
  onDecided: (appTookOver: boolean) => void,
  timeoutMs = APP_HANDOFF_TIMEOUT_MS,
  targetWindow: Window = window,
): () => void {
  const signals: AppHandoffSignals = { windowBlurred: false, pageHidden: false, pageHiddenForNavigation: false };
  let decided = false;
  const finish = () => {
    if (decided) return;
    decided = true;
    stopWatching();
    onDecided(didAppTakeOver(signals));
  };
  const markBlurred = () => { signals.windowBlurred = true; finish(); };
  const markHidden = () => {
    if (!targetWindow.document.hidden) return;
    signals.pageHidden = true;
    finish();
  };
  const markPageHide = () => { signals.pageHiddenForNavigation = true; finish(); };
  const timer = targetWindow.setTimeout(finish, timeoutMs);
  function stopWatching() {
    targetWindow.clearTimeout(timer);
    targetWindow.removeEventListener("blur", markBlurred);
    targetWindow.document.removeEventListener("visibilitychange", markHidden);
    targetWindow.removeEventListener("pagehide", markPageHide);
  }
  targetWindow.addEventListener("blur", markBlurred);
  targetWindow.document.addEventListener("visibilitychange", markHidden);
  targetWindow.addEventListener("pagehide", markPageHide);
  return () => { decided = true; stopWatching(); };
}

export function openDeepLinkInHiddenFrame(deepLink: string, targetDocument: Document = document): void {
  const frame = targetDocument.createElement("iframe");
  frame.style.display = "none";
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("tabindex", "-1");
  frame.src = deepLink;
  targetDocument.body.appendChild(frame);
  window.setTimeout(() => frame.remove(), APP_HANDOFF_TIMEOUT_MS * 2);
}

let appWasNotFound = false;

export function rememberAppWasNotFound(): void {
  appWasNotFound = true;
}

export function forgetAppWasNotFound(): void {
  appWasNotFound = false;
}

export function wasAppNotFound(): boolean {
  return appWasNotFound;
}
