import type { LatestRelease, ReleaseAsset } from "./releaseAssets.helper";

export const RELEASE_REPOSITORY = "oyinlola-tech/owl-agent";
const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${RELEASE_REPOSITORY}/releases/latest`;
export const RELEASES_PAGE_URL = `https://github.com/${RELEASE_REPOSITORY}/releases`;
export const LATEST_RELEASE_CACHE_KEY = "owl-website-latest-release";
export const LATEST_RELEASE_CACHE_MS = 10 * 60 * 1000;

export type LatestReleaseResult =
  | { status: "ready"; release: LatestRelease }
  | { status: "none" }
  | { status: "rate-limited" }
  | { status: "error"; message: string };

type CachedReleaseResult = { savedAt: number; result: LatestReleaseResult };

type ReleaseFetchOptions = { fetchJson?: typeof fetch; storage?: Storage | null; now?: () => number };

function readSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isGithubDownloadUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && (parsed.hostname === "github.com" || parsed.hostname.endsWith(".githubusercontent.com"));
  } catch {
    return false;
  }
}

function parseReleaseAsset(value: unknown): ReleaseAsset | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.name !== "string" || typeof candidate.size !== "number") return null;
  // Security: only link to files hosted by GitHub, never to an arbitrary URL from the response.
  if (!isGithubDownloadUrl(candidate.browser_download_url)) return null;
  return { name: candidate.name, size: candidate.size, browser_download_url: candidate.browser_download_url };
}

export function parseLatestRelease(value: unknown): LatestRelease | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.tag_name !== "string" || !Array.isArray(candidate.assets)) return null;
  return {
    tag_name: candidate.tag_name,
    name: typeof candidate.name === "string" ? candidate.name : null,
    published_at: typeof candidate.published_at === "string" ? candidate.published_at : null,
    html_url: isGithubDownloadUrl(candidate.html_url) ? candidate.html_url : RELEASES_PAGE_URL,
    assets: candidate.assets.map(parseReleaseAsset).filter((asset): asset is ReleaseAsset => asset !== null),
  };
}

function readCachedResult(storage: Storage | null, now: number): LatestReleaseResult | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(LATEST_RELEASE_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedReleaseResult;
    if (typeof cached.savedAt !== "number" || now - cached.savedAt > LATEST_RELEASE_CACHE_MS) return null;
    if (cached.result?.status === "none") return cached.result;
    if (cached.result?.status !== "ready") return null;
    const release = parseLatestRelease(cached.result.release);
    return release ? { status: "ready", release } : null;
  } catch {
    return null;
  }
}

function writeCachedResult(storage: Storage | null, now: number, result: LatestReleaseResult) {
  if (!storage) return;
  try {
    storage.setItem(LATEST_RELEASE_CACHE_KEY, JSON.stringify({ savedAt: now, result } satisfies CachedReleaseResult));
  } catch {
    return;
  }
}

export async function fetchLatestRelease(options: ReleaseFetchOptions = {}): Promise<LatestReleaseResult> {
  const fetchJson = options.fetchJson ?? fetch;
  const storage = options.storage === undefined ? readSessionStorage() : options.storage;
  const now = (options.now ?? Date.now)();
  const cached = readCachedResult(storage, now);
  if (cached) return cached;

  let response: Response;
  try {
    response = await fetchJson(LATEST_RELEASE_API_URL, { headers: { Accept: "application/vnd.github+json" } });
  } catch {
    return { status: "error", message: "Couldn't reach GitHub to check for the latest release. Check your connection and try again." };
  }
  if (response.status === 404) {
    const result: LatestReleaseResult = { status: "none" };
    writeCachedResult(storage, now, result);
    return result;
  }
  if (response.status === 403 || response.status === 429) return { status: "rate-limited" };
  if (!response.ok) return { status: "error", message: `GitHub answered with status ${response.status} while checking for the latest release.` };

  let release: LatestRelease | null = null;
  try {
    release = parseLatestRelease(await response.json());
  } catch {
    release = null;
  }
  if (!release) return { status: "error", message: "GitHub sent release details OWL couldn't read." };
  const result: LatestReleaseResult = { status: "ready", release };
  writeCachedResult(storage, now, result);
  return result;
}
