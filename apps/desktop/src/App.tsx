import { useCallback, useEffect, useRef, useState } from "react";
import LandingPage from "./landing/LandingPage";
import DesktopApp from "./app";
import { getPath, go, usePath } from "./router";
import type { AppScreen } from "./app/types";

const APP_SCREENS: AppScreen[] = ["welcome", "workspace", "tasks", "task", "browser", "projects", "settings"];

function appSub(path: string): AppScreen {
  const sub = path.replace(/^\/app\/?/, "") as AppScreen;
  return APP_SCREENS.includes(sub) ? sub : "welcome";
}

function getTheme(): "light" | "dark" {
  const saved = window.localStorage.getItem("owl-theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function App() {
  const path = usePath();
  const [theme, setTheme] = useState<"light" | "dark">(() => getTheme());
  const prevPath = useRef(path);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("owl-theme", theme);
  }, [theme]);

  // Scroll to top on route change, but leave in-page anchors alone.
  useEffect(() => {
    if (path !== prevPath.current) {
      prevPath.current = path;
      if (!window.location.hash) window.scrollTo(0, 0);
    }
  }, [path]);

  // Intercept same-origin /app navigations so they never reload the page.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      const a = el?.closest?.("a");
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      const href = a.getAttribute("href");
      if (href && href.startsWith("/app")) {
        e.preventDefault();
        go(href);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const toggle = useCallback(() => {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }, []);

  const inApp = path === "/app" || path.startsWith("/app/");

  return (
    <div data-theme={theme}>
      {inApp ? (
        <DesktopApp key={appSub(path)} initial={appSub(path)} />
      ) : (
        <LandingPage theme={theme} toggle={toggle} />
      )}
    </div>
  );
}

// Re-export for callers that still import it.
export { getPath };
