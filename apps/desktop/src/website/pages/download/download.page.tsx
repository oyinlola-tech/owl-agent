import { useState } from "react";
import { ArrowRight, Info, TerminalWindow, X } from "@phosphor-icons/react";
import { PageIntro } from "../../components/pageIntro.component";
import { isWebsiteOnlyBuild } from "../../../shared/platform/runtimeMode.helper";
import { forgetAppWasNotFound, wasAppNotFound } from "../launcher/appLauncher.helper";
import { formatReleaseDate } from "./release/releaseAssets.helper";
import { useDetectedPlatform, useLatestRelease, type LatestReleaseState } from "./release/releaseDownload.hook";
import { PrimaryDownloadSection } from "./sections/primaryDownload.section";
import { AllPlatformsSection } from "./sections/allPlatforms.section";
import { TerminalInstallSection } from "./sections/terminalInstall.section";
import { BuildFromSourceSection } from "./sections/buildFromSource.section";
import "./download.style.css";

function introLedeFor(releaseState: LatestReleaseState, websiteOnly: boolean): string {
  if (releaseState.status === "ready") {
    const publishedOn = formatReleaseDate(releaseState.release.published_at);
    const version = releaseState.release.tag_name;
    return `Install the desktop app on Windows, macOS, or Linux. The latest release is ${version}${publishedOn ? `, published ${publishedOn}` : ""}.`;
  }
  if (releaseState.status === "none" && websiteOnly) {
    return "Download OWL for Windows, macOS, or Linux. The first release is on its way; the download buttons start working as soon as it is published.";
  }
  if (releaseState.status === "none") {
    return "Pre-built installers are not published yet. Build the desktop app from source in a few minutes, or try the web preview right now.";
  }
  return "Install the desktop app on Windows, macOS, or Linux, from the terminal, or build it from source.";
}

function AppNotInstalledNotice() {
  const [visible, setVisible] = useState(() => wasAppNotFound());
  if (!visible) return null;
  const dismissNotice = () => {
    forgetAppWasNotFound();
    setVisible(false);
  };
  return (
    <div className="callout orange dl-missing" role="status">
      <Info size={18} weight="duotone" />
      <span>OWL isn't installed on this computer yet — download it below.</span>
      <button className="btn btn-ghost btn-icon dl-missing-close" onClick={dismissNotice} aria-label="Dismiss"><X size={15} /></button>
    </div>
  );
}

export function DownloadPage() {
  const releaseState = useLatestRelease();
  const platform = useDetectedPlatform();
  const websiteOnly = isWebsiteOnlyBuild();
  return (
    <>
      <PageIntro eyebrow="Download" title="Get OWL on your machine." lede={introLedeFor(releaseState, websiteOnly)}>
        <AppNotInstalledNotice />
        <div className="pintro-cta">
          {!websiteOnly && <a className="btn btn-dark btn-lg" href="/app">Try the web preview <ArrowRight size={16} weight="bold" /></a>}
          <a className="btn btn-secondary btn-lg" href="#terminal"><TerminalWindow size={17} weight="duotone" /> Install from the terminal</a>
          <a className="btn btn-secondary btn-lg" href="#build"><TerminalWindow size={17} weight="duotone" /> Build from source</a>
        </div>
      </PageIntro>
      <div className="wrap dlp">
        <PrimaryDownloadSection releaseState={releaseState} platform={platform} websiteOnly={websiteOnly} />
        <AllPlatformsSection releaseState={releaseState} platform={platform} websiteOnly={websiteOnly} />
        <TerminalInstallSection platform={platform} />
        <BuildFromSourceSection />
      </div>
    </>
  );
}
