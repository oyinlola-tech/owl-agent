import { describe, expect, it } from "vitest";
import {
  classifyReleaseAsset, detectPlatformFromClientHints, detectPlatformFromUserAgent, findChecksumAsset, formatAssetSize,
  formatReleaseDate, githubCliPatternFor, installersForOs, pickPrimaryInstaller, unclassifiedAssets, type ReleaseAsset,
} from "./releaseAssets.helper";

const asset = (name: string, size = 1000): ReleaseAsset => ({ name, size, browser_download_url: `https://github.com/oyinlola-tech/owl-agent/releases/download/v0.1.0/${name}` });

const FULL_RELEASE = [
  asset("OWL_0.1.0_x64-setup.exe"),
  asset("OWL_0.1.0_x64_en-US.msi"),
  asset("OWL_0.1.0_aarch64.dmg"),
  asset("OWL_0.1.0_x64.dmg"),
  asset("OWL_0.1.0_amd64.AppImage"),
  asset("OWL_0.1.0_amd64.deb"),
  asset("OWL-0.1.0-1.x86_64.rpm"),
  asset("OWL_aarch64.app.tar.gz.sig"),
  asset("SHA256SUMS.txt"),
];

const UA = {
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  linux: "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
  linuxArm: "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
};

describe("classifyReleaseAsset", () => {
  it("recognises the tauri-action installer names", () => {
    expect(classifyReleaseAsset(asset("OWL_0.1.0_x64-setup.exe"))).toMatchObject({ os: "windows", kind: "setup-exe", arch: "x64" });
    expect(classifyReleaseAsset(asset("OWL_0.1.0_x64_en-US.msi"))).toMatchObject({ os: "windows", kind: "msi" });
    expect(classifyReleaseAsset(asset("OWL_0.1.0_aarch64.dmg"))).toMatchObject({ os: "macos", arch: "arm64", label: "Apple silicon (.dmg)" });
    expect(classifyReleaseAsset(asset("OWL_0.1.0_x64.dmg"))).toMatchObject({ os: "macos", arch: "x64", label: "Intel (.dmg)" });
    expect(classifyReleaseAsset(asset("OWL_0.1.0_amd64.AppImage"))).toMatchObject({ os: "linux", kind: "appimage", arch: "x64" });
    expect(classifyReleaseAsset(asset("OWL_0.1.0_amd64.deb"))).toMatchObject({ os: "linux", kind: "deb" });
    expect(classifyReleaseAsset(asset("OWL-0.1.0-1.x86_64.rpm"))).toMatchObject({ os: "linux", kind: "rpm", arch: "x64" });
  });

  it("leaves signatures, archives and checksums unclassified", () => {
    expect(classifyReleaseAsset(asset("OWL_aarch64.app.tar.gz.sig"))).toBeNull();
    expect(classifyReleaseAsset(asset("SHA256SUMS.txt"))).toBeNull();
    expect(unclassifiedAssets(FULL_RELEASE).map((item) => item.name)).toEqual(["OWL_aarch64.app.tar.gz.sig", "SHA256SUMS.txt"]);
  });
});

describe("pickPrimaryInstaller", () => {
  it("prefers the setup .exe on Windows", () => {
    expect(pickPrimaryInstaller(FULL_RELEASE, { os: "windows", arch: "x64" })?.asset.name).toBe("OWL_0.1.0_x64-setup.exe");
  });

  it("falls back to the .msi when there is no setup .exe", () => {
    const withoutSetup = FULL_RELEASE.filter((item) => !item.name.endsWith("-setup.exe"));
    expect(pickPrimaryInstaller(withoutSetup, { os: "windows", arch: "x64" })?.asset.name).toBe("OWL_0.1.0_x64_en-US.msi");
  });

  it("picks the Apple silicon build on a Mac with unknown or ARM architecture", () => {
    expect(pickPrimaryInstaller(FULL_RELEASE, { os: "macos", arch: null })?.asset.name).toBe("OWL_0.1.0_aarch64.dmg");
    expect(pickPrimaryInstaller(FULL_RELEASE, { os: "macos", arch: "arm64" })?.asset.name).toBe("OWL_0.1.0_aarch64.dmg");
  });

  it("picks the Intel build on an Intel Mac", () => {
    expect(pickPrimaryInstaller(FULL_RELEASE, { os: "macos", arch: "x64" })?.asset.name).toBe("OWL_0.1.0_x64.dmg");
  });

  it("prefers the AppImage on Linux, then .deb", () => {
    expect(pickPrimaryInstaller(FULL_RELEASE, { os: "linux", arch: "x64" })?.asset.name).toBe("OWL_0.1.0_amd64.AppImage");
    const withoutAppImage = FULL_RELEASE.filter((item) => !item.name.endsWith(".AppImage"));
    expect(pickPrimaryInstaller(withoutAppImage, { os: "linux", arch: "x64" })?.asset.name).toBe("OWL_0.1.0_amd64.deb");
  });

  it("returns nothing for an unknown system or a release without installers", () => {
    expect(pickPrimaryInstaller(FULL_RELEASE, { os: null, arch: null })).toBeNull();
    expect(pickPrimaryInstaller([asset("SHA256SUMS.txt")], { os: "linux", arch: "x64" })).toBeNull();
  });

  it("lists every installer for one system", () => {
    expect(installersForOs(FULL_RELEASE, "linux")).toHaveLength(3);
    expect(installersForOs(FULL_RELEASE, "macos")).toHaveLength(2);
  });
});

describe("platform detection", () => {
  it("reads the operating system from the user agent", () => {
    expect(detectPlatformFromUserAgent(UA.windows)).toEqual({ os: "windows", arch: "x64" });
    expect(detectPlatformFromUserAgent(UA.mac)).toEqual({ os: "macos", arch: null });
    expect(detectPlatformFromUserAgent(UA.linux)).toEqual({ os: "linux", arch: "x64" });
    expect(detectPlatformFromUserAgent(UA.linuxArm)).toEqual({ os: "linux", arch: "arm64" });
  });

  it("does not offer a desktop installer to phones", () => {
    expect(detectPlatformFromUserAgent(UA.iphone).os).toBeNull();
    expect(detectPlatformFromUserAgent(UA.android).os).toBeNull();
  });

  it("uses client hints when the browser provides them", () => {
    expect(detectPlatformFromClientHints({ platform: "macOS", architecture: "arm" })).toEqual({ os: "macos", arch: "arm64" });
    expect(detectPlatformFromClientHints({ platform: "macOS", architecture: "x86" })).toEqual({ os: "macos", arch: "x64" });
    expect(detectPlatformFromClientHints({ platform: "Windows", architecture: "x86" })).toEqual({ os: "windows", arch: "x64" });
    expect(detectPlatformFromClientHints({ platform: "Chrome OS" })).toEqual({ os: null, arch: null });
  });
});

describe("formatting", () => {
  it("formats sizes for people", () => {
    expect(formatAssetSize(512)).toBe("512 B");
    expect(formatAssetSize(2048)).toBe("2.0 KB");
    expect(formatAssetSize(8.4 * 1024 * 1024)).toBe("8.4 MB");
    expect(formatAssetSize(150 * 1024 * 1024)).toBe("150 MB");
    expect(formatAssetSize(3 * 1024 * 1024 * 1024)).toBe("3.0 GB");
    expect(formatAssetSize(-1)).toBe("unknown size");
  });

  it("formats the publish date in UTC", () => {
    expect(formatReleaseDate("2026-10-10T23:30:00Z")).toBe("October 10, 2026");
    expect(formatReleaseDate(null)).toBeNull();
    expect(formatReleaseDate("not a date")).toBeNull();
  });

  it("finds the checksum file", () => {
    expect(findChecksumAsset(FULL_RELEASE)?.name).toBe("SHA256SUMS.txt");
    expect(findChecksumAsset([asset("OWL_0.1.0_x64.dmg")])).toBeNull();
  });

  it("builds a GitHub CLI pattern per system", () => {
    expect(githubCliPatternFor({ os: "windows", arch: "x64" })).toBe("*-setup.exe");
    expect(githubCliPatternFor({ os: "macos", arch: null })).toBe("*_aarch64.dmg");
    expect(githubCliPatternFor({ os: "macos", arch: "x64" })).toBe("*_x64.dmg");
    expect(githubCliPatternFor({ os: "linux", arch: "x64" })).toBe("*_amd64.AppImage");
    expect(githubCliPatternFor({ os: "linux", arch: "arm64" })).toBe("*_aarch64.AppImage");
    expect(githubCliPatternFor({ os: null, arch: null })).toBe("*");
  });
});

describe("stable-name copies", () => {
  const STABLE_COPIES = [
    asset("OWL-Agent-Setup-x64.exe"), asset("OWL-Agent-x64.msi"), asset("OWL-Agent-macOS-AppleSilicon.dmg"),
    asset("OWL-Agent-macOS-Intel.dmg"), asset("OWL-Agent-Linux-x64.AppImage"), asset("OWL-Agent-Linux-x64.deb"),
    asset("OWL-Agent-Linux-x64.rpm"),
  ];
  const WITH_STABLE_COPIES = [...FULL_RELEASE, ...STABLE_COPIES];

  it("leaves stable copies out of the versioned file list", () => {
    STABLE_COPIES.forEach((copy) => expect(classifyReleaseAsset(copy)).toBeNull());
    expect(installersForOs(WITH_STABLE_COPIES, "windows").map((item) => item.asset.name)).toEqual(["OWL_0.1.0_x64-setup.exe", "OWL_0.1.0_x64_en-US.msi"]);
    expect(installersForOs(WITH_STABLE_COPIES, "macos")).toHaveLength(2);
    expect(installersForOs(WITH_STABLE_COPIES, "linux")).toHaveLength(3);
    expect(unclassifiedAssets(WITH_STABLE_COPIES).map((item) => item.name)).toEqual(["OWL_aarch64.app.tar.gz.sig", "SHA256SUMS.txt"]);
  });

  it("still picks the versioned installer as the primary file", () => {
    expect(pickPrimaryInstaller(WITH_STABLE_COPIES, { os: "macos", arch: "x64" })?.asset.name).toBe("OWL_0.1.0_x64.dmg");
  });
});
