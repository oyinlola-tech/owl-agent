import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
    expect(screen.queryByRole("link", { name: /Download for/ })).toBeNull();
  });
});

describe("download page in website-only mode", () => {
  const WINDOWS_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
  const releaseAsset = (name: string) => ({ name, size: 2048, browser_download_url: `https://github.com/oyinlola-tech/owl-agent/releases/download/v0.1.0/${name}` });

  beforeEach(() => {
    vi.stubEnv("VITE_OWL_WEBSITE_ONLY", "1");
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(WINDOWS_USER_AGENT);
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it("keeps one-click buttons when no release exists yet and says when they will work", async () => {
    renderAt("/download");
    expect(await screen.findByText(/The first release hasn't been published yet/)).toBeTruthy();
    const downloadLinks = screen.getAllByRole("link", { name: "Download for Windows" });
    downloadLinks.forEach((link) => expect(link.getAttribute("href")).toBe("/download/windows"));
    expect(downloadLinks.length).toBe(2);
    expect(screen.getByRole("link", { name: "Download for macOS" }).getAttribute("href")).toBe("/download/mac");
    expect(screen.getByRole("link", { name: "Download for Linux" }).getAttribute("href")).toBe("/download/linux");
    expect(screen.getAllByText("Works once the first release is published").length).toBe(3);
  });

  it("keeps the full terminal install section below the one-click buttons", async () => {
    renderAt("/download");
    const terminalSection = await screen.findByRole("region", { name: "Install from the terminal" });
    const primaryButton = screen.getAllByRole("link", { name: "Download for Windows" })[0];
    expect(primaryButton.compareDocumentPosition(terminalSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(terminalSection).getByRole("tab", { name: "Windows (PowerShell)" }).getAttribute("aria-selected")).toBe("true");
    expect(within(terminalSection).getByText(/owl\.install\.ps1 \| iex/)).toBeTruthy();
    expect(within(terminalSection).getByRole("button", { name: "Copy code" })).toBeTruthy();
    fireEvent.click(within(terminalSection).getByRole("tab", { name: "macOS and Linux" }));
    expect(within(terminalSection).getByText(/owl\.install\.sh \| sh/)).toBeTruthy();
    fireEvent.click(within(terminalSection).getByRole("tab", { name: "GitHub CLI" }));
    expect(within(terminalSection).getByText(/gh release download/)).toBeTruthy();
    expect(within(terminalSection).getByText("Read a script before you pipe it into a shell.")).toBeTruthy();
    expect(within(terminalSection).getByRole("link", { name: "shell script" })).toBeTruthy();
  });

  it("keeps one-click buttons working when GitHub rate-limits the page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 403 })));
    renderAt("/download");
    expect(await screen.findByText(/the button still downloads the latest installer/)).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Download for Windows" })[0].getAttribute("href")).toBe("/download/windows");
  });

  it("lists the versioned files and checksums under the one-click buttons", async () => {
    const release = {
      tag_name: "v0.1.0", name: "OWL v0.1.0", published_at: "2026-10-10T00:00:00Z",
      html_url: "https://github.com/oyinlola-tech/owl-agent/releases/tag/v0.1.0",
      assets: [releaseAsset("OWL.Agent_0.1.0_x64-setup.exe"), releaseAsset("OWL-Agent-Setup-x64.exe"), releaseAsset("SHA256SUMS.txt")],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(release), { status: 200 })));
    renderAt("/download");
    expect(await screen.findByRole("heading", { name: "All platforms" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Download for Windows" })[0].getAttribute("href")).toBe("/download/windows");
    expect(screen.getAllByText("OWL.Agent_0.1.0_x64-setup.exe").length).toBeGreaterThan(0);
    expect(screen.queryByText("OWL-Agent-Setup-x64.exe")).toBeNull();
    expect(screen.getAllByRole("link", { name: /SHA256SUMS\.txt|Checksums/ }).length).toBeGreaterThan(0);
  });
});
