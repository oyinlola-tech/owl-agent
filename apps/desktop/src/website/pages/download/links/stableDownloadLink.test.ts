import { describe, expect, it } from "vitest";
import vercelConfig from "../../../../../vercel.json";
import {
  STABLE_DOWNLOADS, detectedDownloadLinkFor, isStableCopyFileName, primaryDownloadTargetFor, stableDownloadGithubUrl,
  stableDownloadPath, type StableDownloadTarget,
} from "./stableDownloadLink.helper";

describe("primaryDownloadTargetFor", () => {
  it("maps each detected system to its one-click download", () => {
    expect(primaryDownloadTargetFor({ os: "windows", arch: "x64" })).toBe("windows");
    expect(primaryDownloadTargetFor({ os: "windows", arch: "arm64" })).toBe("windows");
    expect(primaryDownloadTargetFor({ os: "macos", arch: "arm64" })).toBe("mac");
    expect(primaryDownloadTargetFor({ os: "macos", arch: "x64" })).toBe("mac-intel");
    expect(primaryDownloadTargetFor({ os: "macos", arch: null })).toBe("mac");
    expect(primaryDownloadTargetFor({ os: "linux", arch: "x64" })).toBe("linux");
    expect(primaryDownloadTargetFor({ os: "linux", arch: null })).toBe("linux");
  });

  it("has no one-click file for unknown, mobile, or ARM Linux systems", () => {
    expect(primaryDownloadTargetFor({ os: null, arch: null })).toBeNull();
    expect(primaryDownloadTargetFor({ os: "linux", arch: "arm64" })).toBeNull();
  });
});

describe("detectedDownloadLinkFor", () => {
  it("labels and links the download for each system", () => {
    expect(detectedDownloadLinkFor({ os: "windows", arch: "x64" })).toMatchObject({ href: "/download/windows", label: "Download for Windows", alternate: null });
    expect(detectedDownloadLinkFor({ os: "macos", arch: "arm64" })).toMatchObject({ href: "/download/mac", label: "Download for macOS", alternate: null });
    expect(detectedDownloadLinkFor({ os: "macos", arch: "x64" })).toMatchObject({ href: "/download/mac-intel", label: "Download for macOS", alternate: null });
    expect(detectedDownloadLinkFor({ os: "linux", arch: "x64" })).toMatchObject({ href: "/download/linux", label: "Download for Linux" });
  });

  it("defaults an undetected Mac to Apple silicon and offers the Intel build", () => {
    const link = detectedDownloadLinkFor({ os: "macos", arch: null });
    expect(link.href).toBe("/download/mac");
    expect(link.alternate).toEqual({ href: "/download/mac-intel", label: "Intel Mac? Get the Intel build" });
  });

  it("sends unknown systems to the download page", () => {
    expect(detectedDownloadLinkFor({ os: null, arch: null })).toEqual({ href: "/download", label: "Download OWL", os: null, target: null, alternate: null });
  });
});

describe("stable file names", () => {
  it("recognises stable copies regardless of case", () => {
    expect(isStableCopyFileName("OWL-Agent-Setup-x64.exe")).toBe(true);
    expect(isStableCopyFileName("owl-agent-linux-x64.appimage")).toBe(true);
    expect(isStableCopyFileName("OWL.Agent_0.1.0_x64-setup.exe")).toBe(false);
  });

  it("builds GitHub latest-release URLs", () => {
    expect(stableDownloadGithubUrl("windows")).toBe("https://github.com/oyinlola-tech/owl-agent/releases/latest/download/OWL-Agent-Setup-x64.exe");
  });

  it("has a temporary vercel.json redirect for every one-click link, ahead of the SPA rewrite", () => {
    const keys = Object.keys(vercelConfig);
    expect(keys.indexOf("redirects")).toBeLessThan(keys.indexOf("rewrites"));
    const targets = Object.keys(STABLE_DOWNLOADS) as StableDownloadTarget[];
    expect(vercelConfig.redirects).toEqual(targets.map((target) => ({
      source: stableDownloadPath(target), destination: stableDownloadGithubUrl(target), statusCode: 302,
    })));
    expect(vercelConfig.redirects.some((redirect) => redirect.source === "/download")).toBe(false);
  });
});
