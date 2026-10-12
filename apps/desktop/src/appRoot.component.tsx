import { useCallback, useEffect, useRef, useState } from "react";
import { WebsiteRouter } from "./website/website.router";
import { DesktopShell } from "./desktop/layout/desktopShell.layout";
import { resolveScreenFromPath } from "./desktop/layout/screenCatalog.data";
import { navigateTo, replaceCurrentPath, useCurrentPath } from "./shared/hooks/currentPath.hook";
import { readSavedTheme, saveTheme, type AppliedTheme } from "./shared/hooks/themeMode.hook";
import { isDesktopAppPath, isRunningInsideDesktopShell, isWebsiteOnlyBuild } from "./shared/platform/runtimeMode.helper";

function useInstalledAppOpensDesktop(path: string) {
  useEffect(() => {
    if (path === "/" && isRunningInsideDesktopShell()) replaceCurrentPath("/app");
  }, [path]);
}

function useInAppLinksWithoutReload() {
  useEffect(() => {
    const routeAppLinkClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      if (!anchor || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      const href = anchor.getAttribute("href");
      if (href && href.startsWith("/app")) {
        event.preventDefault();
        navigateTo(href);
      }
    };
    document.addEventListener("click", routeAppLinkClick);
    return () => document.removeEventListener("click", routeAppLinkClick);
  }, []);
}

export function AppRoot() {
  const path = useCurrentPath();
  const [theme, setTheme] = useState<AppliedTheme>(() => readSavedTheme());
  const previousPath = useRef(path);
  useInstalledAppOpensDesktop(path);
  useInAppLinksWithoutReload();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (path === previousPath.current) return;
    previousPath.current = path;
    setTheme(readSavedTheme());
    if (!window.location.hash) window.scrollTo(0, 0);
  }, [path]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "light" ? "dark" : "light"));
  }, []);

  const showDesktopApp = isDesktopAppPath(path) && !isWebsiteOnlyBuild();
  const screen = resolveScreenFromPath(path);

  return (
    <div data-theme={theme}>
      {showDesktopApp
        ? <DesktopShell key={screen} initial={screen} />
        : <WebsiteRouter path={path} theme={theme} toggle={toggleTheme} />}
    </div>
  );
}
