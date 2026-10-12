import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowSquareOut, DownloadSimple } from "@phosphor-icons/react";
import { OwlMark } from "../../../shared/components/owlMark.component";
import { replaceCurrentPath } from "../../../shared/hooks/currentPath.hook";
import { SiteLink } from "../../components/siteLink.component";
import {
  deepLinkForAppPath, forgetAppWasNotFound, openDeepLinkInHiddenFrame, rememberAppWasNotFound, watchForAppHandoff,
} from "./appLauncher.helper";
import "./appLauncher.style.css";

type LaunchState = "opening" | "opened";

export function AppLauncherPage({ path }: { path: string }) {
  const [launchState, setLaunchState] = useState<LaunchState>("opening");
  const stopWatchingRef = useRef<(() => void) | null>(null);
  const deepLink = deepLinkForAppPath(path);

  const openInstalledApp = useCallback(() => {
    stopWatchingRef.current?.();
    forgetAppWasNotFound();
    stopWatchingRef.current = watchForAppHandoff((appTookOver) => {
      stopWatchingRef.current = null;
      if (appTookOver) {
        setLaunchState("opened");
        return;
      }
      rememberAppWasNotFound();
      replaceCurrentPath("/download");
    });
    openDeepLinkInHiddenFrame(deepLink);
  }, [deepLink]);

  useEffect(() => {
    const launchTimer = window.setTimeout(openInstalledApp, 0);
    return () => {
      window.clearTimeout(launchTimer);
      stopWatchingRef.current?.();
      stopWatchingRef.current = null;
    };
  }, [openInstalledApp]);

  const opened = launchState === "opened";

  return (
    <section className="launch">
      <div className="wrap launch-inner">
        <div className={`launch-mark${opened ? "" : " waiting"}`}><OwlMark size={64} /></div>
        <span className="eyebrow">Desktop app</span>
        <h1>{opened ? "OWL is open on your computer" : "Opening OWL…"}</h1>
        <p className="launch-status" role="status" aria-live="polite">
          {opened
            ? "Switch to the OWL window to carry on. You can close this tab."
            : "Looking for the OWL desktop app on this computer."}
        </p>
        <p className="launch-note">Your browser may ask “Open OWL?” first. Choose Open to continue.</p>
        <div className="launch-actions">
          <button className="btn btn-dark btn-lg" onClick={openInstalledApp}>
            <ArrowSquareOut size={17} weight="bold" /> {opened ? "Open OWL again" : "Open OWL"}
          </button>
          <SiteLink className="btn btn-secondary btn-lg" to="/download">
            <DownloadSimple size={17} weight="bold" /> Don't have it? Download OWL
          </SiteLink>
        </div>
      </div>
    </section>
  );
}
