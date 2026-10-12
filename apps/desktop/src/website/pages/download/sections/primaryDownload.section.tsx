import { ArrowUpRight, DownloadSimple, ShieldWarning } from "@phosphor-icons/react";
import { Reveal } from "../../../components/reveal.component";
import { RELEASES_PAGE_URL } from "../release/latestRelease.service";
import type { LatestReleaseState } from "../release/releaseDownload.hook";
import {
  findChecksumAsset, formatAssetSize, installersForOs, osDisplayName, pickPrimaryInstaller, type DetectedPlatform,
  type LatestRelease,
} from "../release/releaseAssets.helper";
import { OS_ICONS } from "../links/downloadButton.component";
import { WebsitePrimaryDownloadCard } from "../links/websitePrimaryDownload.section";

function ReleaseReadyCard({ release, platform }: { release: LatestRelease; platform: DetectedPlatform }) {
  const primaryInstaller = pickPrimaryInstaller(release.assets, platform);
  const checksumAsset = findChecksumAsset(release.assets);
  if (!primaryInstaller) {
    return (
      <>
        <h2>Choose your system</h2>
        <p>{platform.os
          ? `This release has no ${osDisplayName(platform.os)} installer yet. Pick another file below or build from source.`
          : "We couldn't tell which computer you're on. Pick the installer for your system below."}</p>
        <a className="btn btn-dark btn-lg" href="#platforms"><DownloadSimple size={17} weight="bold" /> See all downloads</a>
      </>
    );
  }
  const PlatformIcon = OS_ICONS[primaryInstaller.os];
  const otherInstallers = installersForOs(release.assets, primaryInstaller.os).filter((installer) => installer !== primaryInstaller);
  return (
    <>
      <h2>Download OWL for {osDisplayName(primaryInstaller.os)}</h2>
      <a className="btn btn-dark btn-lg dl-primary-btn" href={primaryInstaller.asset.browser_download_url}>
        <PlatformIcon size={18} weight="fill" /> Download for {osDisplayName(primaryInstaller.os)}
      </a>
      <p className="dl-primary-meta">
        {primaryInstaller.label} · {formatAssetSize(primaryInstaller.asset.size)} · <span className="mono">{primaryInstaller.asset.name}</span>
      </p>
      {otherInstallers.length > 0 && (
        <p className="dl-primary-alt">
          Also for {osDisplayName(primaryInstaller.os)}:{" "}
          {otherInstallers.map((installer, index) => (
            <span key={installer.asset.name}>
              {index > 0 && " · "}
              <a href={installer.asset.browser_download_url}>{installer.label}</a>
            </span>
          ))}
        </p>
      )}
      <p className="dl-primary-alt">
        Not on {osDisplayName(primaryInstaller.os)}? <a href="#platforms">See every platform</a>
        {checksumAsset && <> · <a href={checksumAsset.browser_download_url}>SHA256SUMS.txt</a></>}
      </p>
    </>
  );
}

function UnsignedInstallerNotice() {
  return (
    <div className="callout orange dl-unsigned">
      <ShieldWarning size={18} weight="duotone" />
      <span>
        <b>The installers aren't code-signed yet,</b> so your system may warn you the first time.
        On macOS, right-click OWL in Applications and choose <b>Open</b>, or go to <b>System Settings → Privacy &amp; Security</b> and choose <b>Open Anyway</b>.
        On Windows, if SmartScreen appears, choose <b>More info → Run anyway</b>.
        Check the file against <span className="mono">SHA256SUMS.txt</span> first if you want to be sure it's the one we published.
      </span>
    </div>
  );
}

export function PrimaryDownloadSection({ releaseState, platform, websiteOnly }: {
  releaseState: LatestReleaseState; platform: DetectedPlatform; websiteOnly: boolean;
}) {
  if (websiteOnly) {
    return (
      <Reveal className="dl-primary">
        <div className="dl-primary-card" aria-live="polite" aria-busy={releaseState.status === "loading"}>
          <WebsitePrimaryDownloadCard releaseState={releaseState} platform={platform} />
        </div>
        <UnsignedInstallerNotice />
      </Reveal>
    );
  }
  return (
    <Reveal className="dl-primary">
      <div className="dl-primary-card" aria-live="polite" aria-busy={releaseState.status === "loading"}>
        {releaseState.status === "loading" && <p className="dl-primary-wait">Checking GitHub for the latest release…</p>}
        {releaseState.status === "ready" && <ReleaseReadyCard release={releaseState.release} platform={platform} />}
        {releaseState.status === "none" && (
          <>
            <h2>No release has been published yet</h2>
            <p>There are no pre-built installers on GitHub so far. You can build the desktop app from source today; it takes a few minutes.</p>
            <a className="btn btn-dark btn-lg" href="#build">Build from source</a>
          </>
        )}
        {releaseState.status === "rate-limited" && (
          <>
            <h2>GitHub is limiting requests right now</h2>
            <p>This page asks GitHub for the latest release without signing in, and that limit was reached for your network. Try again in a while, or get the files straight from the releases page.</p>
            <a className="btn btn-dark btn-lg" href={RELEASES_PAGE_URL} target="_blank" rel="noopener noreferrer">Open GitHub releases <ArrowUpRight size={15} weight="bold" /></a>
          </>
        )}
        {releaseState.status === "error" && (
          <>
            <h2>Couldn't load the latest release</h2>
            <p>{releaseState.message}</p>
            <a className="btn btn-dark btn-lg" href={RELEASES_PAGE_URL} target="_blank" rel="noopener noreferrer">Open GitHub releases <ArrowUpRight size={15} weight="bold" /></a>
          </>
        )}
      </div>
      {releaseState.status === "ready" && <UnsignedInstallerNotice />}
    </Reveal>
  );
}
