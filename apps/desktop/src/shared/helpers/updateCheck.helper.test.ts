import { describe, expect, it, vi } from "vitest";
import {
  APP_VERSION,
  checkForAppUpdate,
  compareVersions,
  isNewerVersion,
  normalizeVersion,
} from "./updateCheck.helper";

const release = (tag_name: string, html_url = "https://github.com/oyinlola-tech/owl-agent/releases/tag/v0.2.0") =>
  new Response(JSON.stringify({ tag_name, html_url, assets: [] }), { status: 200 });

describe("normalizeVersion", () => {
  it("strips a leading v and trims whitespace", () => {
    expect(normalizeVersion("  v0.2.0 ")).toBe("0.2.0");
    expect(normalizeVersion("V1.0")).toBe("1.0");
    expect(normalizeVersion(null)).toBe("");
  });
});

describe("compareVersions", () => {
  it("orders dotted versions numerically", () => {
    expect(compareVersions("0.1.0", "0.2.0")).toBe(-1);
    expect(compareVersions("0.2.0", "0.1.0")).toBe(1);
    expect(compareVersions("v0.1.0", "0.1.0")).toBe(0);
    expect(compareVersions("0.1", "0.1.0")).toBe(0);
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
  });
});

describe("isNewerVersion", () => {
  it("is true only when the release is strictly newer", () => {
    expect(isNewerVersion("v0.2.0", APP_VERSION)).toBe(true);
    expect(isNewerVersion(APP_VERSION, APP_VERSION)).toBe(false);
    expect(isNewerVersion("0.0.9", APP_VERSION)).toBe(false);
    expect(isNewerVersion("", APP_VERSION)).toBe(false);
  });
});

describe("checkForAppUpdate", () => {
  it("reports up to date when the release matches the app version", async () => {
    const state = await checkForAppUpdate({
      fetchJson: vi.fn().mockResolvedValue(release(`v${APP_VERSION}`)),
      currentVersion: APP_VERSION,
    });
    expect(state).toEqual({ status: "up-to-date", latest: APP_VERSION });
  });

  it("reports an available update with the release notes link", async () => {
    const state = await checkForAppUpdate({
      fetchJson: vi.fn().mockResolvedValue(release("v9.9.9")),
      currentVersion: APP_VERSION,
    });
    expect(state).toMatchObject({ status: "available", latest: "9.9.9" });
  });

  it("falls back to the releases page when the notes URL is not on github.com", async () => {
    const state = await checkForAppUpdate({
      fetchJson: vi.fn().mockResolvedValue(release("v9.9.9", "https://evil.example.com/notes")),
      currentVersion: APP_VERSION,
    });
    expect(state).toEqual({
      status: "available",
      latest: "9.9.9",
      notesUrl: "https://github.com/oyinlola-tech/owl-agent/releases",
    });
  });

  it("maps 404 to no-releases and network failures to offline", async () => {
    expect(
      await checkForAppUpdate({ fetchJson: vi.fn().mockResolvedValue(new Response("{}", { status: 404 })) }),
    ).toEqual({ status: "no-releases" });
    expect(
      await checkForAppUpdate({ fetchJson: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) }),
    ).toMatchObject({ status: "offline" });
  });

  it("maps rate limiting and server errors to retryable offline states", async () => {
    expect(
      await checkForAppUpdate({ fetchJson: vi.fn().mockResolvedValue(new Response("{}", { status: 429 })) }),
    ).toMatchObject({ status: "offline" });
    expect(
      await checkForAppUpdate({ fetchJson: vi.fn().mockResolvedValue(new Response("{}", { status: 500 })) }),
    ).toMatchObject({ status: "offline", message: expect.stringContaining("500") });
  });
});
