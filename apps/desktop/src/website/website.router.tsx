import { useEffect, type ReactNode } from "react";
import { isDesktopAppPath } from "../shared/platform/runtimeMode.helper";
import { Navbar } from "./layout/navbar.layout";
import { Footer } from "./layout/footer.layout";
import { HomePage } from "./pages/home.page";
import { DocsPage } from "./pages/docs/docs.page";
import { SecurityPage } from "./pages/security/security.page";
import { ChangelogPage } from "./pages/changelog/changelog.page";
import { DownloadPage } from "./pages/download/download.page";
import { NotFoundPage } from "./pages/notFound.page";
import { AppLauncherPage } from "./pages/launcher/appLauncher.page";
import { forgetAppWasNotFound } from "./pages/launcher/appLauncher.helper";
import {
  STABLE_DOWNLOADS, stableDownloadGithubUrl, type StableDownloadTarget,
} from "./pages/download/links/stableDownloadLink.helper";
import "./styles/site.style.css";

const PAGE_TITLES: Record<string, string> = {
  "/": "OWL — the AI engineer that shows its work",
  "/docs": "Docs — OWL",
  "/security": "Security — OWL",
  "/changelog": "Changelog — OWL",
  "/download": "Download — OWL",
};

const APP_LAUNCHER_TITLE = "Opening OWL — OWL";

function StableDownloadRedirect({ target }: { target: string }) {
  const known = STABLE_DOWNLOADS[target as StableDownloadTarget] !== undefined;
  useEffect(() => {
    if (!known) return;
    document.title = "Downloading OWL";
    window.location.replace(stableDownloadGithubUrl(target as StableDownloadTarget));
  }, [known, target]);
  if (!known) return <NotFoundPage path={`/download/${target}`} />;
  const url = stableDownloadGithubUrl(target as StableDownloadTarget);
  return (
    <div className="wrap">
      <p>Starting your download… if nothing happens, <a href={url}>download directly from GitHub</a>.</p>
    </div>
  );
}

function pageForPath(cleanPath: string, originalPath: string): ReactNode {
  if (isDesktopAppPath(cleanPath)) return <AppLauncherPage path={cleanPath} />;
  if (cleanPath.startsWith("/download/")) {
    return <StableDownloadRedirect target={cleanPath.slice("/download/".length)} />;
  }
  switch (cleanPath) {
    case "/": return <HomePage />;
    case "/docs": return <DocsPage />;
    case "/security": return <SecurityPage />;
    case "/changelog": return <ChangelogPage />;
    case "/download": return <DownloadPage />;
    default: return <NotFoundPage path={originalPath} />;
  }
}

export function WebsiteRouter({ path, theme, toggle }: { path: string; theme: "light" | "dark"; toggle: () => void }) {
  const cleanPath = path.length > 1 ? path.replace(/\/+$/, "") : path;

  useEffect(() => {
    document.title = isDesktopAppPath(cleanPath) ? APP_LAUNCHER_TITLE : PAGE_TITLES[cleanPath] ?? "Page not found — OWL";
    if (cleanPath !== "/download" && !isDesktopAppPath(cleanPath)) forgetAppWasNotFound();
  }, [cleanPath]);

  useEffect(() => {
    const hashTargetId = window.location.hash.slice(1);
    if (!hashTargetId) return;
    const scrollTimer = window.setTimeout(() => document.getElementById(hashTargetId)?.scrollIntoView({ block: "start" }), 60);
    return () => window.clearTimeout(scrollTimer);
  }, [cleanPath]);

  return (
    <div className="owl">
      <a className="skip" href="#main">Skip to content</a>
      <Navbar path={cleanPath} theme={theme} toggle={toggle} />
      <main id="main" key={cleanPath} className="site-main">{pageForPath(cleanPath, path)}</main>
      <Footer />
    </div>
  );
}
