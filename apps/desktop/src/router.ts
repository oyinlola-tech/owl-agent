import { useEffect, useState } from "react";

/** Clean-path routing (e.g. /app, /app/tasks). No hash fragments. */
export function getPath(): string {
  return window.location.pathname;
}

export function go(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function usePath(): string {
  const [path, setPath] = useState(() => getPath());
  useEffect(() => {
    const onPop = () => setPath(getPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return path;
}
