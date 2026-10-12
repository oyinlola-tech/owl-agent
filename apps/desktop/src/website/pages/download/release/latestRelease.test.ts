import { describe, expect, it, vi } from "vitest";
import { fetchLatestRelease, LATEST_RELEASE_CACHE_KEY, LATEST_RELEASE_CACHE_MS, parseLatestRelease } from "./latestRelease.service";

const RELEASE_JSON = {
  tag_name: "v0.1.0",
  name: "OWL 0.1.0",
  published_at: "2026-10-10T12:00:00Z",
  html_url: "https://github.com/oyinlola-tech/owl-agent/releases/tag/v0.1.0",
  assets: [
    { name: "OWL_0.1.0_x64.dmg", size: 9000000, browser_download_url: "https://github.com/oyinlola-tech/owl-agent/releases/download/v0.1.0/OWL_0.1.0_x64.dmg" },
    { name: "evil.exe", size: 1, browser_download_url: "https://evil.example.com/evil-setup.exe" },
  ],
};

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

const jsonResponse = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

describe("parseLatestRelease", () => {
  it("drops assets that are not hosted on GitHub", () => {
    expect(parseLatestRelease(RELEASE_JSON)?.assets.map((asset) => asset.name)).toEqual(["OWL_0.1.0_x64.dmg"]);
  });

  it("rejects payloads without a tag or assets", () => {
    expect(parseLatestRelease({ assets: [] })).toBeNull();
    expect(parseLatestRelease(null)).toBeNull();
  });
});

describe("fetchLatestRelease", () => {
  it("returns the release and caches it", async () => {
    const storage = memoryStorage();
    const fetchJson = vi.fn().mockResolvedValue(jsonResponse(200, RELEASE_JSON));
    const result = await fetchLatestRelease({ fetchJson, storage, now: () => 1000 });
    expect(result.status).toBe("ready");
    expect(storage.getItem(LATEST_RELEASE_CACHE_KEY)).not.toBeNull();
    const again = await fetchLatestRelease({ fetchJson, storage, now: () => 2000 });
    expect(again).toEqual(result);
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it("fetches again once the cache is stale", async () => {
    const storage = memoryStorage();
    const fetchJson = vi.fn().mockImplementation(async () => jsonResponse(200, RELEASE_JSON));
    await fetchLatestRelease({ fetchJson, storage, now: () => 0 });
    await fetchLatestRelease({ fetchJson, storage, now: () => LATEST_RELEASE_CACHE_MS + 1 });
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });

  it("says there is no release yet on 404", async () => {
    const result = await fetchLatestRelease({ fetchJson: vi.fn().mockResolvedValue(jsonResponse(404)), storage: null });
    expect(result).toEqual({ status: "none" });
  });

  it("reports rate limiting on 403 and 429 without caching it", async () => {
    const storage = memoryStorage();
    expect(await fetchLatestRelease({ fetchJson: vi.fn().mockResolvedValue(jsonResponse(403)), storage })).toEqual({ status: "rate-limited" });
    expect(await fetchLatestRelease({ fetchJson: vi.fn().mockResolvedValue(jsonResponse(429)), storage })).toEqual({ status: "rate-limited" });
    expect(storage.getItem(LATEST_RELEASE_CACHE_KEY)).toBeNull();
  });

  it("reports network failures and server errors honestly", async () => {
    const offline = await fetchLatestRelease({ fetchJson: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")), storage: null });
    expect(offline.status).toBe("error");
    const broken = await fetchLatestRelease({ fetchJson: vi.fn().mockResolvedValue(jsonResponse(500)), storage: null });
    expect(broken).toMatchObject({ status: "error", message: expect.stringContaining("500") });
  });

  it("treats an unreadable body as an error", async () => {
    const result = await fetchLatestRelease({ fetchJson: vi.fn().mockResolvedValue(new Response("not json", { status: 200 })), storage: null });
    expect(result.status).toBe("error");
  });

  it("keeps working when storage throws", async () => {
    const storage = memoryStorage();
    storage.getItem = () => { throw new Error("blocked"); };
    storage.setItem = () => { throw new Error("blocked"); };
    const result = await fetchLatestRelease({ fetchJson: vi.fn().mockResolvedValue(jsonResponse(200, RELEASE_JSON)), storage });
    expect(result.status).toBe("ready");
  });
});
