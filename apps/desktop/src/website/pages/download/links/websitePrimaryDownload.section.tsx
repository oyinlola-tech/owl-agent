import { ArrowUpRight, DownloadSimple } from "@phosphor-icons/react";
import { RELEASES_PAGE_URL } from "../release/latestRelease.service";
import type { LatestReleaseState } from "../release/releaseDownload.hook";
import {
  findChecksumAsset, formatAssetSize, osDisplayName, pickPrimaryInstaller, type DetectedPlatform,
} from "../release/releaseAssets.helper";
import { DetectedDownloadButton, IntelMacLink } from "./downloadButton.component";
import { STABLE_DOWNLOADS, STABLE_DOWNLOAD_TARGETS_BY_OS, detectedDownloadLinkFor, stableDownloadPath } from "./stableDownloadLink.helper";

function ReleaseStatusNote({ releaseState, platform }: { releaseState: LatestReleaseState; platform: DetectedPlatform }) {
  if (releaseState.status === "loading") return <p className="dl-primary-meta">Checking GitHub for the latest release…</p>;
  if (releaseState.status === "none") {
    return (
      <p className="dl-primary-meta">
        The first release hasn't been published yet. This button will start the download as soon as it is.
        Until then you can <a href="#build">build OWL from source</a>.
      </p>
    );
  }
  if (releaseState.status === "rate-limited" || releaseState.status === "error") {
    return (
      <p className="dl-primary-meta">
        Couldn't load release details from GitHub right now, but the button still downloads the latest installer.{" "}
        <a href={RELEASES_PAGE_URL} target="_blank" rel="noopener noreferrer">Open GitHub releases <ArrowUpRight size={13} weight="bold" /></a>
      </p>
    );
  }
  const primaryInstaller = pickPrimaryInstaller(releaseState.release.assets, platform);
  const checksumAsset = findChecksumAsset(releaseState.release.assets);
  return (
    <p className="dl-primary-meta">
      {releaseState.release.tag_name}
      {primaryInstaller && <> · {primaryInstaller.label} · {formatAssetSize(primaryInstaller.asset.size)} · <span className="mono">{primaryInstaller.asset.name}</span></>}
      {checksumAsset && <> · <a href={checksumAsset.browser_download_url}>SHA256SUMS.txt</a></>}
    </p>
  );
}

export function WebsitePrimaryDownloadCard({ releaseState, platform }: { releaseState: LatestReleaseState; platform: DetectedPlatform }) {
  const link = detectedDownloadLinkFor(platform);
  if (!link.os || !link.target) {
    return (
      <>
        <h2>Choose your system</h2>
        <p>We couldn't tell which computer you're on. Pick the installer for your system below.</p>
        <a className="btn btn-dark btn-lg" href="#platforms"><DownloadSimple size={17} weight="bold" /> See all downloads</a>
        <ReleaseStatusNote releaseState={releaseState} platform={platform} />
      </>
    );
  }
  const primaryTarget = link.target;
  const alternateHref = link.alternate?.href;
  const otherTargets = STABLE_DOWNLOAD_TARGETS_BY_OS[link.os]
    .filter((target) => target !== primaryTarget && stableDownloadPath(target) !== alternateHref);
  return (
    <>
      <h2>Download OWL for {osDisplayName(link.os)}</h2>
      <DetectedDownloadButton className="btn btn-dark btn-lg dl-primary-btn" platform={platform} />
      <ReleaseStatusNote releaseState={releaseState} platform={platform} />
      <IntelMacLink className="dl-primary-alt" platform={platform} />
      {otherTargets.length > 0 && (
        <p className="dl-primary-alt">
          Also for {osDisplayName(link.os)}:{" "}
          {otherTargets.map((target, index) => (
            <span key={target}>
              {index > 0 && " · "}
              <a href={stableDownloadPath(target)}>{STABLE_DOWNLOADS[target].label}</a>
            </span>
          ))}
        </p>
      )}
      <p className="dl-primary-alt">Not on {osDisplayName(link.os)}? <a href="#platforms">See every platform</a></p>
    </>
  );
}
