import { useEffect, useState } from "react";
import { readStoredValue, writeStoredValue } from "../helpers/storage.helper";

export type ThemeMode = "light" | "dark" | "system";
export type AppliedTheme = "light" | "dark";

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function readAppliedTheme(): AppliedTheme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function readSavedTheme(): AppliedTheme {
  const saved = readStoredValue("owl-theme");
  if (saved === "light" || saved === "dark") return saved;
  return systemPrefersDark() ? "dark" : "light";
}

export function saveTheme(theme: AppliedTheme) {
  writeStoredValue("owl-theme", theme);
}

export function readThemeMode(): ThemeMode {
  if (readStoredValue("owl-theme-mode") === "system") return "system";
  return readAppliedTheme();
}

export function applyThemeMode(mode: ThemeMode): AppliedTheme {
  const theme: AppliedTheme = mode === "system" ? (systemPrefersDark() ? "dark" : "light") : mode;
  document.querySelectorAll("[data-theme]").forEach((element) => element.setAttribute("data-theme", theme));
  document.documentElement.setAttribute("data-theme", theme);
  saveTheme(theme);
  writeStoredValue("owl-theme-mode", mode);
  window.dispatchEvent(new Event("owl-theme"));
  return theme;
}

export function toggleLightDarkTheme(): AppliedTheme {
  return applyThemeMode(readAppliedTheme() === "dark" ? "light" : "dark");
}

export function useThemeMode(): [ThemeMode, AppliedTheme] {
  const [state, setState] = useState<[ThemeMode, AppliedTheme]>(() => [readThemeMode(), readAppliedTheme()]);
  useEffect(() => {
    const syncFromDocument = () => setState([readThemeMode(), readAppliedTheme()]);
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const followSystemChange = () => { if (readThemeMode() === "system") applyThemeMode("system"); };
    window.addEventListener("owl-theme", syncFromDocument);
    mediaQuery.addEventListener("change", followSystemChange);
    return () => {
      window.removeEventListener("owl-theme", syncFromDocument);
      mediaQuery.removeEventListener("change", followSystemChange);
    };
  }, []);
  return state;
}
