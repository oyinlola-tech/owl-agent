import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useCurrentPath } from "../shared/hooks/currentPath.hook";
import { WebsiteRouter } from "./website.router";
import { APP_HANDOFF_TIMEOUT_MS } from "./pages/launcher/appLauncher.helper";

function RoutedWebsite() {
  const path = useCurrentPath();
  return <WebsiteRouter path={path} theme="light" toggle={() => undefined} />;
}

function renderAt(path: string) {
  window.history.replaceState({}, "", path);
  return render(<RoutedWebsite />);
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  window.scrollTo = vi.fn();
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })));
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("website calls to action", () => {
  it("keeps today's app links outside website-only mode", () => {
    renderAt("/");
    expect(screen.getAllByRole("link", { name: /Open the app/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /Open OWL/ })).toBeNull();
  });

  it("points app links at the launcher in website-only mode", () => {
    vi.stubEnv("VITE_OWL_WEBSITE_ONLY", "1");
    renderAt("/");
    const openLinks = screen.getAllByRole("link", { name: /Open OWL/ });
    expect(openLinks.length).toBeGreaterThan(0);
    openLinks.forEach((link) => expect(link.getAttribute("href")).toBe("/app"));
    expect(screen.queryByRole("link", { name: /Open the app/ })).toBeNull();
  });
});

describe("app launcher in website-only mode", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_OWL_WEBSITE_ONLY", "1");
    vi.useFakeTimers();
  });

  it("tries the owl:// link for the screen and keeps both buttons visible", () => {
    renderAt("/app/tasks");
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByRole("heading", { name: "Opening OWL…" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Open OWL/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Don't have it\? Download OWL/ })).toBeTruthy();
    expect(document.querySelector("iframe")?.getAttribute("src")).toBe("owl://app/tasks");
  });

  it("says OWL is open when the browser hands off to the app", () => {
    renderAt("/app");
    act(() => { vi.advanceTimersByTime(1); });
    act(() => { window.dispatchEvent(new Event("blur")); });
    expect(screen.getByRole("heading", { name: "OWL is open on your computer" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Open OWL again/ })).toBeTruthy();
  });

  it("sends people to the download page when nothing answers", () => {
    renderAt("/app");
    act(() => { vi.advanceTimersByTime(APP_HANDOFF_TIMEOUT_MS + 1); });
    expect(window.location.pathname).toBe("/download");
    expect(screen.getByText("OWL isn't installed on this computer yet — download it below.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("OWL isn't installed on this computer yet — download it below.")).toBeNull();
  });
});

describe("download page", () => {
  it("says plainly when no release exists yet", async () => {
    renderAt("/download");
    expect(await screen.findByRole("heading", { name: "No release has been published yet" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "macOS and Linux" })).toBeTruthy();
    expect(document.title).toBe("Download — OWL");
  });
});
