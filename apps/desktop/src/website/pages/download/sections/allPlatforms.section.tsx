import { DownloadSimple, FileText, Timer } from "@phosphor-icons/react";
import { Reveal } from "../../../components/reveal.component";
import type { LatestReleaseState } from "../release/releaseDownload.hook";
import {
  OPERATING_SYSTEMS, findChecksumAsset, formatAssetSize, installersForOs, osDisplayName, unclassifiedAssets,
  type DetectedPlatform, type OperatingSystem, type ReleaseAsset,
} from "../release/releaseAssets.helper";
import { OS_ICONS } from "./primaryDownload.section";

const SOURCE_BUILD_NOTES: Record<OperatingSystem, { build: string; note: string }> = {
  linux: { build: ".deb and .AppImage", note: "Needs WebKitGTK and the usual Tauri build packages." },
  macos: { build: ".dmg and .app", note: "Needs Xcode Command Line Tools." },
  windows: { build: ".msi and .exe", note: "Needs the Visual Studio C++ build tools and WebView2." },
};

const SOURCE_BUILD_ORDER: OperatingSystem[] = ["linux", "macos", "windows"];

function AssetLink({ asset, label }: { asset: ReleaseAsset; label: string }) {
  return (
    <li>
      <a href={asset.browser_download_url}>
        <DownloadSimple size={15} weight="bold" />
        <span><b>{label}</b><small className="mono">{asset.name}</small></span>
        <em>{formatAssetSize(asset.size)}</em>
      </a>
    </li>
  );
}

export function AllPlatformsSection({ releaseState, platform }: { releaseState: LatestReleaseState; platform: DetectedPlatform }) {
  if (releaseState.status !== "ready") {
    return (
      <div className="plats" id="platforms">
        {SOURCE_BUILD_ORDER.map((os, index) => {
          const PlatformIcon = OS_ICONS[os];
          return (
            <Reveal key={os} delay={index * 60} className="plat">
              <PlatformIcon size={34} weight="duotone" />
              <h3>{osDisplayName(os)}</h3>
              <span className="plat-build">Builds {SOURCE_BUILD_NOTES[os].build}</span>
              <p>{SOURCE_BUILD_NOTES[os].note}</p>
              <span className="plat-state"><Timer size={14} /> {releaseState.status === "loading" ? "Checking for installers…" : "Installer coming soon"}</span>
            </Reveal>
          );
        })}
      </div>
    );
  }
  const assets = releaseState.release.assets;
  const otherFiles = unclassifiedAssets(assets);
  const checksumAsset = findChecksumAsset(assets);
  return (
    <section className="dl-all" id="platforms" aria-labelledby="platforms-title">
      <h2 id="platforms-title">All platforms</h2>
      <div className="plats">
        {OPERATING_SYSTEMS.map((os, index) => {
          const PlatformIcon = OS_ICONS[os];
          const installers = installersForOs(assets, os);
          return (
            <Reveal key={os} delay={index * 60} className={`plat${platform.os === os ? " plat-yours" : ""}`}>
              <PlatformIcon size={34} weight="duotone" />
              <h3>{osDisplayName(os)}{platform.os === os && <span className="plat-you">Your system</span>}</h3>
              {installers.length > 0
                ? <ul className="dl-assets">{installers.map((installer) => <AssetLink key={installer.asset.name} asset={installer.asset} label={installer.label} />)}</ul>
                : <p>No {osDisplayName(os)} installer in this release.</p>}
            </Reveal>
          );
        })}
      </div>
      {otherFiles.length > 0 && (
        <div className="dl-other">
          <h3><FileText size={16} weight="duotone" /> Other files in this release</h3>
          <ul className="dl-assets">
            {otherFiles.map((asset) => <AssetLink key={asset.name} asset={asset} label={asset === checksumAsset ? "Checksums" : asset.name} />)}
          </ul>
        </div>
      )}
    </section>
  );
}
