import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { HeroSection } from "../../../sections/hero/hero.section";

const USER_AGENTS = {
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  linux: "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
};

function renderHeroOn(userAgent: string, clientHints?: { platform: string; architecture: string }) {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(userAgent);
  if (clientHints) {
    Object.defineProperty(window.navigator, "userAgentData", {
      configurable: true,
      value: { getHighEntropyValues: vi.fn().mockResolvedValue(clientHints) },
    });
  }
  return render(<HeroSection />);
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubEnv("VITE_OWL_WEBSITE_ONLY", "1");
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window.navigator, "userAgentData");
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("hero download button in website-only mode", () => {
  it.each([
    ["windows", "Download for Windows", "/download/windows"],
    ["mac", "Download for macOS", "/download/mac"],
    ["linux", "Download for Linux", "/download/linux"],
  ] as const)("links %s visitors straight to their installer", (system, label, href) => {
    renderHeroOn(USER_AGENTS[system]);
    expect(screen.getByRole("link", { name: label }).getAttribute("href")).toBe(href);
    expect(screen.getByRole("link", { name: "Other platforms" }).getAttribute("href")).toBe("/download");
  });

  it.each([
    ["windows", "PowerShell", "irm https://raw.githubusercontent.com/oyinlola-tech/owl-agent/main/scripts/install/owl.install.ps1 | iex"],
    ["mac", "Terminal", "curl -fsSL https://raw.githubusercontent.com/oyinlola-tech/owl-agent/main/scripts/install/owl.install.sh | sh"],
    ["linux", "Terminal", "curl -fsSL https://raw.githubusercontent.com/oyinlola-tech/owl-agent/main/scripts/install/owl.install.sh | sh"],
  ] as const)("shows %s visitors the one-line install command under the button", (system, label, command) => {
    renderHeroOn(USER_AGENTS[system]);
    const terminalRow = within(screen.getByRole("group", { name: "Or install from the terminal" }));
    expect(terminalRow.getByText(command)).toBeTruthy();
    expect(terminalRow.getByText(label)).toBeTruthy();
    expect(terminalRow.getByRole("button", { name: "Copy code" })).toBeTruthy();
    expect(terminalRow.getByRole("link", { name: "More install options" }).getAttribute("href")).toBe("/download#terminal");
  });

  it("offers the Intel build when a Mac's chip is unknown", () => {
    renderHeroOn(USER_AGENTS.mac);
    expect(screen.getByRole("link", { name: "Intel Mac? Get the Intel build" }).getAttribute("href")).toBe("/download/mac-intel");
  });

  it("links Intel Macs to the Intel build once client hints say so", async () => {
    renderHeroOn(USER_AGENTS.mac, { platform: "macOS", architecture: "x86" });
    expect(await screen.findByRole("link", { name: "Download for macOS" })).toBeTruthy();
    await vi.waitFor(() => expect(screen.getByRole("link", { name: "Download for macOS" }).getAttribute("href")).toBe("/download/mac-intel"));
    expect(screen.queryByRole("link", { name: /Intel Mac\?/ })).toBeNull();
  });

  it("sends phones and unknown systems to the download page", () => {
    renderHeroOn(USER_AGENTS.iphone);
    expect(screen.getByRole("link", { name: "Download OWL" }).getAttribute("href")).toBe("/download");
  });

  it("keeps the app button and demo link outside website-only mode", () => {
    vi.unstubAllEnvs();
    renderHeroOn(USER_AGENTS.windows);
    expect(screen.queryByRole("link", { name: "Download for Windows" })).toBeNull();
    expect(screen.getByRole("link", { name: /Open the app/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Try a run/ })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Or install from the terminal" })).toBeNull();
  });
});
