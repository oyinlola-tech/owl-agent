import type { Hue } from "../../../../../shared/components/tag.component";
import type { ProviderCard, ProviderKeySource } from "../../../../services/agentApi.types";

export interface ProviderStatusChip {
  label: string;
  hue: Hue;
}

export function describeProviderStatus(card: ProviderCard): ProviderStatusChip {
  switch (card.status) {
    case "connected":
      return { label: "Connected", hue: "green" };
    case "key_missing":
      return { label: "Key missing", hue: "gray" };
    case "base_url_missing":
      return { label: "Set a URL", hue: "gray" };
    case "not_running":
      return { label: "Not running", hue: "orange" };
    case "error":
      return { label: "Error", hue: "red" };
    default:
      return { label: "Not tested", hue: "gray" };
  }
}

export function describeKeySource(source: ProviderKeySource): string {
  switch (source) {
    case "keyring":
      return "Stored in your system keychain";
    case "file":
      return "Stored in a private file in OWL's data folder";
    case "env":
      return "Set from the service environment (read-only here)";
    default:
      return "No key saved yet";
  }
}

export function canEditProviderKey(card: ProviderCard): boolean {
  return !card.key_read_only;
}

const BROWSER_PLATFORM_LABELS: { match: RegExp; label: string }[] = [
  { match: /mac|darwin/i, label: "macOS" },
  { match: /win/i, label: "Windows" },
  { match: /linux|x11/i, label: "Linux" },
];

export function detectOperatingSystem(platform: string): string {
  for (const entry of BROWSER_PLATFORM_LABELS) {
    if (entry.match.test(platform)) return entry.label;
  }
  return "your computer";
}

export function getKeyLinkLabel(card: ProviderCard): string {
  if (!card.key_url) return "";
  if (card.group === "local") return `Install ${card.label}`;
  return `Where do I get a ${card.label} key?`;
}

export function shouldOfferLocalHowTo(card: ProviderCard): boolean {
  return card.group === "local" && card.status !== "connected";
}

export function localRunnerHowTo(card: ProviderCard, operatingSystem: string): string {
  if (card.how_to) return card.how_to;
  return `Start ${card.label} on ${operatingSystem}, then test the connection.`;
}

export function isModelPickerReady(card: ProviderCard): boolean {
  return card.models.length > 0;
}

export function resolveActiveModelLabel(card: ProviderCard): string {
  if (!card.model || card.model === "auto") return "Auto (router picks per task)";
  return card.model;
}
