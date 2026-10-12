import { readStoredValue, writeStoredValue } from "../../../../shared/helpers/storage.helper";

export type SettingsPrefs = Record<string, boolean>;

const SETTINGS_PREFS_STORAGE_KEY = "owl-settings";
const START_SCREEN_STORAGE_KEY = "owl-start";

export const DEFAULT_SETTINGS_PREFS: SettingsPrefs = {
  fs: true, term: true, browser: true, net: true, priv: false,
  checkpoint: true, commit: false, push: true,
  notifyApproval: true, notifyDone: true, notifyFail: true, sound: false, motion: false,
};

export function readSettingsPrefs(): SettingsPrefs {
  try {
    return { ...DEFAULT_SETTINGS_PREFS, ...JSON.parse(readStoredValue(SETTINGS_PREFS_STORAGE_KEY) ?? "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS_PREFS };
  }
}

export function saveSettingsPrefs(prefs: SettingsPrefs) {
  writeStoredValue(SETTINGS_PREFS_STORAGE_KEY, JSON.stringify(prefs));
}

export function readStartScreen(): string {
  return readStoredValue(START_SCREEN_STORAGE_KEY) ?? "welcome";
}

export function saveStartScreen(screen: string) {
  writeStoredValue(START_SCREEN_STORAGE_KEY, screen);
}
