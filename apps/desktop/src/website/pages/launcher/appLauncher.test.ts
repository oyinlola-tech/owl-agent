import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_HANDOFF_TIMEOUT_MS, deepLinkForAppPath, didAppTakeOver, forgetAppWasNotFound, rememberAppWasNotFound,
  wasAppNotFound, watchForAppHandoff,
} from "./appLauncher.helper";

describe("deepLinkForAppPath", () => {
  it("opens the app home for /app", () => {
    expect(deepLinkForAppPath("/app")).toBe("owl://app");
    expect(deepLinkForAppPath("/app/")).toBe("owl://app");
  });

  it("passes a simple screen name through", () => {
    expect(deepLinkForAppPath("/app/tasks")).toBe("owl://app/tasks");
    expect(deepLinkForAppPath("/app/inbox/")).toBe("owl://app/inbox");
  });

  it("drops anything that is not a short lower-case word", () => {
    expect(deepLinkForAppPath("/app/Tasks")).toBe("owl://app");
    expect(deepLinkForAppPath("/app/tasks/123")).toBe("owl://app");
    expect(deepLinkForAppPath("/app/a%22onload")).toBe("owl://app");
    expect(deepLinkForAppPath("/app/../../etc")).toBe("owl://app");
    expect(deepLinkForAppPath("/app/abcdefghijklmnopqrstu")).toBe("owl://app");
  });
});

describe("didAppTakeOver", () => {
  it("is true when any handoff signal fired", () => {
    expect(didAppTakeOver({ windowBlurred: true, pageHidden: false, pageHiddenForNavigation: false })).toBe(true);
    expect(didAppTakeOver({ windowBlurred: false, pageHidden: true, pageHiddenForNavigation: false })).toBe(true);
    expect(didAppTakeOver({ windowBlurred: false, pageHidden: false, pageHiddenForNavigation: true })).toBe(true);
  });

  it("is false when nothing fired", () => {
    expect(didAppTakeOver({ windowBlurred: false, pageHidden: false, pageHiddenForNavigation: false })).toBe(false);
  });
});

describe("watchForAppHandoff", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reports the app is missing when nothing happens before the timeout", () => {
    const onDecided = vi.fn();
    watchForAppHandoff(onDecided);
    vi.advanceTimersByTime(APP_HANDOFF_TIMEOUT_MS - 1);
    expect(onDecided).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDecided).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("reports the app took over when the window loses focus", () => {
    const onDecided = vi.fn();
    watchForAppHandoff(onDecided);
    vi.advanceTimersByTime(800);
    window.dispatchEvent(new Event("blur"));
    vi.advanceTimersByTime(APP_HANDOFF_TIMEOUT_MS);
    expect(onDecided).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("reports the app took over when the page is hidden", () => {
    const onDecided = vi.fn();
    const hiddenSpy = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    watchForAppHandoff(onDecided);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(onDecided).toHaveBeenCalledExactlyOnceWith(true);
    hiddenSpy.mockRestore();
  });

  it("ignores a visibility change that leaves the page visible", () => {
    const onDecided = vi.fn();
    watchForAppHandoff(onDecided);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(onDecided).not.toHaveBeenCalled();
    vi.advanceTimersByTime(APP_HANDOFF_TIMEOUT_MS);
    expect(onDecided).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("reports the app took over on pagehide", () => {
    const onDecided = vi.fn();
    watchForAppHandoff(onDecided);
    window.dispatchEvent(new Event("pagehide"));
    expect(onDecided).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("never reports after it was stopped", () => {
    const onDecided = vi.fn();
    const stopWatching = watchForAppHandoff(onDecided);
    stopWatching();
    window.dispatchEvent(new Event("blur"));
    vi.advanceTimersByTime(APP_HANDOFF_TIMEOUT_MS * 2);
    expect(onDecided).not.toHaveBeenCalled();
  });
});

describe("app not found notice flag", () => {
  it("can be remembered and forgotten", () => {
    forgetAppWasNotFound();
    expect(wasAppNotFound()).toBe(false);
    rememberAppWasNotFound();
    expect(wasAppNotFound()).toBe(true);
    forgetAppWasNotFound();
    expect(wasAppNotFound()).toBe(false);
  });
});
