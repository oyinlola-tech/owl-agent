import { isStableCopyFileName } from "../links/stableDownloadLink.helper";

export type OperatingSystem = "windows" | "macos" | "linux";
type CpuArchitecture = "arm64" | "x64";
export type DetectedPlatform = { os: OperatingSystem | null; arch: CpuArchitecture | null };
export type ReleaseAsset = { name: string; size: number; browser_download_url: string };
export type LatestRelease = { tag_name: string; name: string | null; published_at: string | null; html_url: string; assets: ReleaseAsset[] };
type InstallerKind = "setup-exe" | "msi" | "dmg" | "appimage" | "deb" | "rpm";
type ClassifiedAsset = { asset: ReleaseAsset; os: OperatingSystem; kind: InstallerKind; arch: CpuArchitecture | null; label: string };

export const OPERATING_SYSTEMS: OperatingSystem[] = ["windows", "macos", "linux"];

const OS_DISPLAY_NAMES: Record<OperatingSystem, string> = { windows: "Windows", macos: "macOS", linux: "Linux" };

const INSTALLER_PREFERENCE: Record<OperatingSystem, InstallerKind[]> = {
  windows: ["setup-exe", "msi"],
  macos: ["dmg"],
  linux: ["appimage", "deb", "rpm"],
};

export function osDisplayName(os: OperatingSystem): string {
  return OS_DISPLAY_NAMES[os];
}

function architectureFromAssetName(name: string): CpuArchitecture | null {
  if (/aarch64|arm64/i.test(name)) return "arm64";
  if (/x64|x86_64|amd64/i.test(name)) return "x64";
  return null;
}

function architectureLabel(arch: CpuArchitecture | null): string {
  if (arch === "arm64") return "ARM64";
  if (arch === "x64") return "x64";
  return "";
}

export function classifyReleaseAsset(asset: ReleaseAsset): ClassifiedAsset | null {
  const name = asset.name;
  if (isStableCopyFileName(name)) return null;
  const arch = architectureFromAssetName(name);
  const withArch = (label: string) => (arch ? `${label}, ${architectureLabel(arch)}` : label);
  if (/-setup\.exe$/i.test(name)) return { asset, os: "windows", kind: "setup-exe", arch, label: withArch("Installer (.exe)") };
  if (/\.msi$/i.test(name)) return { asset, os: "windows", kind: "msi", arch, label: withArch("Installer (.msi)") };
  if (/\.dmg$/i.test(name)) {
    const label = arch === "arm64" ? "Apple silicon (.dmg)" : arch === "x64" ? "Intel (.dmg)" : "Universal (.dmg)";
    return { asset, os: "macos", kind: "dmg", arch, label };
  }
  if (/\.AppImage$/i.test(name)) return { asset, os: "linux", kind: "appimage", arch, label: withArch("AppImage") };
  if (/\.deb$/i.test(name)) return { asset, os: "linux", kind: "deb", arch, label: withArch(".deb for Debian and Ubuntu") };
  if (/\.rpm$/i.test(name)) return { asset, os: "linux", kind: "rpm", arch, label: withArch(".rpm for Fedora and RHEL") };
  return null;
}

function architectureScore(assetArch: CpuArchitecture | null, os: OperatingSystem, wantedArch: CpuArchitecture | null): number {
  const effectiveArch = wantedArch ?? (os === "macos" ? "arm64" : "x64");
  if (assetArch === effectiveArch) return 2;
  if (assetArch === null) return 1;
  return 0;
}

export function installersForOs(assets: ReleaseAsset[], os: OperatingSystem): ClassifiedAsset[] {
  return assets
    .map(classifyReleaseAsset)
    .filter((classified): classified is ClassifiedAsset => classified !== null && classified.os === os);
}

export function pickPrimaryInstaller(assets: ReleaseAsset[], platform: DetectedPlatform): ClassifiedAsset | null {
  if (!platform.os) return null;
  const os = platform.os;
  const candidates = installersForOs(assets, os);
  const preference = INSTALLER_PREFERENCE[os];
  const ranked = [...candidates].sort((first, second) => {
    const archDifference = architectureScore(second.arch, os, platform.arch) - architectureScore(first.arch, os, platform.arch);
    if (archDifference !== 0) return archDifference;
    return preference.indexOf(first.kind) - preference.indexOf(second.kind);
  });
  return ranked[0] ?? null;
}

export function findChecksumAsset(assets: ReleaseAsset[]): ReleaseAsset | null {
  return assets.find((asset) => asset.name.toLowerCase() === "sha256sums.txt") ?? null;
}

export function unclassifiedAssets(assets: ReleaseAsset[]): ReleaseAsset[] {
  return assets.filter((asset) => !isStableCopyFileName(asset.name) && classifyReleaseAsset(asset) === null);
}

export function formatAssetSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown size";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatReleaseDate(isoDate: string | null): string | null {
  if (!isoDate) return null;
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export function detectPlatformFromUserAgent(userAgent: string): DetectedPlatform {
  if (/iPhone|iPad|iPod|Android|CrOS/i.test(userAgent)) return { os: null, arch: null };
  if (/Windows/i.test(userAgent)) return { os: "windows", arch: /ARM64|aarch64/i.test(userAgent) ? "arm64" : "x64" };
  if (/Macintosh|Mac OS X/i.test(userAgent)) return { os: "macos", arch: null };
  if (/Linux|X11/i.test(userAgent)) {
    const arch = /aarch64|arm64/i.test(userAgent) ? "arm64" : /x86_64|amd64/i.test(userAgent) ? "x64" : null;
    return { os: "linux", arch };
  }
  return { os: null, arch: null };
}

export function detectPlatformFromClientHints(hints: { platform?: string; architecture?: string; bitness?: string }): DetectedPlatform {
  const platformName = (hints.platform ?? "").toLowerCase();
  const os: OperatingSystem | null =
    platformName === "windows" ? "windows" : platformName === "macos" ? "macos" : platformName === "linux" ? "linux" : null;
  const architecture = (hints.architecture ?? "").toLowerCase();
  const arch: CpuArchitecture | null = architecture === "arm" ? "arm64" : architecture === "x86" ? "x64" : null;
  return { os, arch };
}

export function githubCliPatternFor(platform: DetectedPlatform): string {
  if (platform.os === "windows") return "*-setup.exe";
  if (platform.os === "macos") return platform.arch === "x64" ? "*_x64.dmg" : "*_aarch64.dmg";
  if (platform.os === "linux") return platform.arch === "arm64" ? "*_aarch64.AppImage" : "*_amd64.AppImage";
  return "*";
}
