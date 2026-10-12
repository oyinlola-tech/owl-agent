import { describe, expect, it } from "vitest";
import {
  canEditProviderKey, describeKeySource, describeProviderStatus, detectOperatingSystem,
  getKeyLinkLabel, resolveActiveModelLabel, shouldOfferLocalHowTo,
} from "../providerStatus.helper";
import type { ProviderCard } from "../../../../../services/agentApi.types";

function makeCard(overrides: Partial<ProviderCard> = {}): ProviderCard {
  return {
    id: "anthropic", label: "Claude (Anthropic)", group: "cloud", kind: "anthropic",
    description: "", key_url: "https://console.anthropic.com/settings/keys", how_to: "",
    requires_key: true, base_url: "https://api.anthropic.com", base_url_editable: false,
    has_key: false, key_hint: null, key_source: null, key_read_only: false,
    model: "auto", default_model: "claude-opus-5-5", models: [], status: "key_missing",
    last_error: null, checked_at: null, active: false, options: {}, ...overrides,
  };
}

describe("describeProviderStatus", () => {
  it("maps each backend status to a distinct chip", () => {
    expect(describeProviderStatus(makeCard({ status: "connected" }))).toEqual({ label: "Connected", hue: "green" });
    expect(describeProviderStatus(makeCard({ status: "key_missing" }))).toEqual({ label: "Key missing", hue: "gray" });
    expect(describeProviderStatus(makeCard({ status: "not_running" }))).toEqual({ label: "Not running", hue: "orange" });
    expect(describeProviderStatus(makeCard({ status: "error" }))).toEqual({ label: "Error", hue: "red" });
    expect(describeProviderStatus(makeCard({ status: "base_url_missing" }))).toEqual({ label: "Set a URL", hue: "gray" });
  });

  it("treats unknown or empty status as not tested", () => {
    expect(describeProviderStatus(makeCard({ status: "" })).label).toBe("Not tested");
    expect(describeProviderStatus(makeCard({ status: "untested" })).label).toBe("Not tested");
  });
});

describe("detectOperatingSystem", () => {
  it("recognizes the three desktop platforms and falls back", () => {
    expect(detectOperatingSystem("MacIntel")).toBe("macOS");
    expect(detectOperatingSystem("Win32")).toBe("Windows");
    expect(detectOperatingSystem("Linux x86_64")).toBe("Linux");
    expect(detectOperatingSystem("")).toBe("your computer");
  });
});

describe("getKeyLinkLabel", () => {
  it("asks where to get a key for cloud providers", () => {
    expect(getKeyLinkLabel(makeCard())).toBe("Where do I get a Claude (Anthropic) key?");
  });
  it("offers an install link for local runners", () => {
    expect(getKeyLinkLabel(makeCard({ group: "local", label: "Ollama" }))).toBe("Install Ollama");
  });
  it("returns nothing when there is no link", () => {
    expect(getKeyLinkLabel(makeCard({ key_url: "" }))).toBe("");
  });
});

describe("local runner helpers", () => {
  it("offers a how-to while a local runner is not connected", () => {
    expect(shouldOfferLocalHowTo(makeCard({ group: "local", status: "not_running" }))).toBe(true);
    expect(shouldOfferLocalHowTo(makeCard({ group: "local", status: "connected" }))).toBe(false);
    expect(shouldOfferLocalHowTo(makeCard({ group: "cloud", status: "error" }))).toBe(false);
  });
});

describe("key source and model labels", () => {
  it("blocks editing a key that comes from the environment", () => {
    expect(canEditProviderKey(makeCard({ key_read_only: true }))).toBe(false);
    expect(canEditProviderKey(makeCard({ key_read_only: false }))).toBe(true);
  });
  it("describes where a saved key is kept", () => {
    expect(describeKeySource("env")).toContain("environment");
    expect(describeKeySource("keyring")).toContain("keychain");
    expect(describeKeySource(null)).toContain("No key");
  });
  it("labels Auto plainly and shows a chosen model verbatim", () => {
    expect(resolveActiveModelLabel(makeCard({ model: "auto" }))).toContain("Auto");
    expect(resolveActiveModelLabel(makeCard({ model: "" }))).toContain("Auto");
    expect(resolveActiveModelLabel(makeCard({ model: "claude-opus-5-5" }))).toBe("claude-opus-5-5");
  });
});
