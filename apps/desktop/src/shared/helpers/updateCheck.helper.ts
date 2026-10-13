// Single source of version truth for the desktop app UI (mirrors package.json "version").
// NOTE: silent auto-install / Tauri updater plugin are out of scope: no signing keys exist yet,
// so updates are manual downloads only.
export const APP_VERSION = "0.1.0";

export const UPDATE_CHECK_API_URL =
  "https://api.github.com/repos/oyinlola-tech/owl-agent/releases/latest";
export const UPDATE_CHECK_TIMEOUT_MS = 8000;
export const APP_DOWNLOAD_URL = "/download";

export type UpdateCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "up-to-date"; latest: string }
  | { status: "available"; latest: string; notesUrl: string }
  | { status: "no-releases" }
  | { status: "offline"; message: string };

export function normalizeVersion(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^[vV]/, "");
}

function versionParts(version: string): number[] {
  return normalizeVersion(version)
    .split(".")
    .map((part) => {
      const numeric = Number.parseInt(part, 10);
      return Number.isNaN(numeric) ? 0 : numeric;
    });
}

/** Compares two semver-ish strings: -1 when a < b, 0 when equal, 1 when a > b. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const left = versionParts(a);
  const right = versionParts(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;
    if (l < r) return -1;
    if (l > r) return 1;
  }
  return 0;
}

export function isNewerVersion(latest: string, current: string): boolean {
  if (!normalizeVersion(latest) || !normalizeVersion(current)) return false;
  return compareVersions(latest, current) === 1;
}

function isGithubReleaseUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "github.com";
  } catch {
    return false;
  }
}

type CheckOptions = {
  fetchJson?: typeof fetch;
  currentVersion?: string;
  timeoutMs?: number;
};

export async function checkForAppUpdate(options: CheckOptions = {}): Promise<UpdateCheckState> {
  const fetchJson = options.fetchJson ?? fetch;
  const current = normalizeVersion(options.currentVersion ?? APP_VERSION);
  const timeoutMs = options.timeoutMs ?? UPDATE_CHECK_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchJson(UPDATE_CHECK_API_URL, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    });
    if (response.status === 404) return { status: "no-releases" };
    if (response.status === 403 || response.status === 429) {
      return { status: "offline", message: "GitHub rate-limited the check. Try again in a few minutes." };
    }
    if (!response.ok) {
      return { status: "offline", message: `GitHub answered with status ${response.status}. Try again later.` };
    }
    let payload: Record<string, unknown>;
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      return { status: "offline", message: "GitHub sent a reply OWL couldn't read. Try again later." };
    }
    const tag = normalizeVersion(payload.tag_name);
    if (!tag) return { status: "offline", message: "GitHub sent a reply OWL couldn't read. Try again later." };
    if (!isNewerVersion(tag, current)) return { status: "up-to-date", latest: tag };
    const notesUrl = isGithubReleaseUrl(payload.html_url)
      ? payload.html_url
      : "https://github.com/oyinlola-tech/owl-agent/releases";
    return { status: "available", latest: tag, notesUrl };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "offline", message: "The check timed out. Check your connection and try again." };
    }
    return { status: "offline", message: "Couldn't reach GitHub. Check your connection and try again." };
  } finally {
    clearTimeout(timer);
  }
}
