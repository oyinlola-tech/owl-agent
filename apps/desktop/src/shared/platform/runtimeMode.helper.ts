export function isRunningInsideDesktopShell(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function isWebsiteOnlyBuild(): boolean {
  return import.meta.env.VITE_OWL_WEBSITE_ONLY === "1" && !isRunningInsideDesktopShell();
}

export function isDesktopAppPath(path: string): boolean {
  return path === "/app" || path.startsWith("/app/");
}
