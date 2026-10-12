import { useEffect, useState } from "react";

function readCurrentPath(): string {
  return window.location.pathname;
}

export function navigateTo(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function replaceCurrentPath(path: string) {
  window.history.replaceState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useCurrentPath(): string {
  const [path, setPath] = useState(() => readCurrentPath());
  useEffect(() => {
    const updatePathFromHistory = () => setPath(readCurrentPath());
    window.addEventListener("popstate", updatePathFromHistory);
    return () => window.removeEventListener("popstate", updatePathFromHistory);
  }, []);
  return path;
}
