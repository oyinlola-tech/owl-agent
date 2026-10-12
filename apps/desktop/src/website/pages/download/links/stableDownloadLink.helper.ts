import type { DetectedPlatform, OperatingSystem } from "../release/releaseAssets.helper";

export type StableDownloadTarget = "windows" | "windows-msi" | "mac" | "mac-intel" | "linux" | "linux-deb" | "linux-rpm";
type StableDownload = { os: OperatingSystem; fileName: string; label: string };
export type DetectedDownloadLink = {
  href: string;
  label: string;
  os: OperatingSystem | null;
  target: StableDownloadTarget | null;
  alternate: { href: string; label: string } | null;
};

export const DOWNLOAD_PAGE_PATH = "/download";
export const INSTALL_SCRIPT_BASE_URL = "https://raw.githubusercontent.com/oyinlola-tech/owl-agent/main/scripts/install";
export const UNIX_INSTALL_COMMAND = `curl -fsSL ${INSTALL_SCRIPT_BASE_URL}/owl.install.sh | sh`;
export const WINDOWS_INSTALL_COMMAND = `irm ${INSTALL_SCRIPT_BASE_URL}/owl.install.ps1 | iex`;
export const LATEST_RELEASE_DOWNLOAD_URL = "https://github.com/oyinlola-tech/owl-agent/releases/latest/download";

export const STABLE_DOWNLOADS: Record<StableDownloadTarget, StableDownload> = {
  windows: { os: "windows", fileName: "OWL-Agent-Setup-x64.exe", label: "Installer (.exe), x64" },
  "windows-msi": { os: "windows", fileName: "OWL-Agent-x64.msi", label: "Installer (.msi), x64" },
  mac: { os: "macos", fileName: "OWL-Agent-macOS-AppleSilicon.dmg", label: "Apple silicon (.dmg)" },
  "mac-intel": { os: "macos", fileName: "OWL-Agent-macOS-Intel.dmg", label: "Intel (.dmg)" },
  linux: { os: "linux", fileName: "OWL-Agent-Linux-x64.AppImage", label: "AppImage, x64" },
  "linux-deb": { os: "linux", fileName: "OWL-Agent-Linux-x64.deb", label: ".deb for Debian and Ubuntu, x64" },
  "linux-rpm": { os: "linux", fileName: "OWL-Agent-Linux-x64.rpm", label: ".rpm for Fedora and RHEL, x64" },
};

export const STABLE_DOWNLOAD_TARGETS_BY_OS: Record<OperatingSystem, StableDownloadTarget[]> = {
  windows: ["windows", "windows-msi"],
  macos: ["mac", "mac-intel"],
  linux: ["linux", "linux-deb", "linux-rpm"],
};

const DOWNLOAD_BUTTON_LABELS: Record<OperatingSystem, string> = {
  windows: "Download for Windows",
  macos: "Download for macOS",
  linux: "Download for Linux",
};

const STABLE_FILE_NAMES = new Set(Object.values(STABLE_DOWNLOADS).map((download) => download.fileName.toLowerCase()));

export function isStableCopyFileName(fileName: string): boolean {
  return STABLE_FILE_NAMES.has(fileName.toLowerCase());
}

export function stableDownloadPath(target: StableDownloadTarget): string {
  return `${DOWNLOAD_PAGE_PATH}/${target}`;
}

export function stableDownloadGithubUrl(target: StableDownloadTarget): string {
  return `${LATEST_RELEASE_DOWNLOAD_URL}/${STABLE_DOWNLOADS[target].fileName}`;
}

export function downloadButtonLabel(os: OperatingSystem): string {
  return DOWNLOAD_BUTTON_LABELS[os];
}

export function primaryDownloadTargetFor(platform: DetectedPlatform): StableDownloadTarget | null {
  if (platform.os === "windows") return "windows";
  if (platform.os === "macos") return platform.arch === "x64" ? "mac-intel" : "mac";
  if (platform.os === "linux") return platform.arch === "arm64" ? null : "linux";
  return null;
}

export function detectedDownloadLinkFor(platform: DetectedPlatform): DetectedDownloadLink {
  const target = primaryDownloadTargetFor(platform);
  if (!target) return { href: DOWNLOAD_PAGE_PATH, label: "Download OWL", os: null, target: null, alternate: null };
  const os = STABLE_DOWNLOADS[target].os;
  const archUnknownOnMac = os === "macos" && platform.arch === null;
  return {
    href: stableDownloadPath(target),
    label: downloadButtonLabel(os),
    os,
    target,
    alternate: archUnknownOnMac ? { href: stableDownloadPath("mac-intel"), label: "Intel Mac? Get the Intel build" } : null,
  };
}

export function terminalInstallCommandFor(platform: DetectedPlatform): { label: string; code: string } {
  if (platform.os === "windows") return { label: "PowerShell", code: WINDOWS_INSTALL_COMMAND };
  return { label: "Terminal", code: UNIX_INSTALL_COMMAND };
}
