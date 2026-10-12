import { AppleLogo, DownloadSimple, LinuxLogo, WindowsLogo } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import type { DetectedPlatform, OperatingSystem } from "../release/releaseAssets.helper";
import {
  STABLE_DOWNLOADS, STABLE_DOWNLOAD_TARGETS_BY_OS, detectedDownloadLinkFor, downloadButtonLabel, stableDownloadPath,
} from "./stableDownloadLink.helper";

export const OS_ICONS: Record<OperatingSystem, Icon> = { windows: WindowsLogo, macos: AppleLogo, linux: LinuxLogo };

export function DetectedDownloadButton({ className, platform }: { className: string; platform: DetectedPlatform }) {
  const link = detectedDownloadLinkFor(platform);
  const PlatformIcon = link.os ? OS_ICONS[link.os] : DownloadSimple;
  return (
    <a className={className} href={link.href}>
      <PlatformIcon size={18} weight={link.os ? "fill" : "bold"} /> {link.label}
    </a>
  );
}

export function IntelMacLink({ className, platform }: { className: string; platform: DetectedPlatform }) {
  const alternate = detectedDownloadLinkFor(platform).alternate;
  if (!alternate) return null;
  return <p className={className}><a href={alternate.href}>{alternate.label}</a></p>;
}

export function StablePlatformButtons({ os }: { os: OperatingSystem }) {
  const [mainTarget, ...otherTargets] = STABLE_DOWNLOAD_TARGETS_BY_OS[os];
  const PlatformIcon = OS_ICONS[os];
  return (
    <div className="plat-stable">
      <a className="btn btn-dark btn-sm" href={stableDownloadPath(mainTarget)}>
        <PlatformIcon size={15} weight="fill" /> {downloadButtonLabel(os)}
      </a>
      <span className="plat-stable-main">{STABLE_DOWNLOADS[mainTarget].label}</span>
      <span className="plat-stable-alt">
        {otherTargets.map((target, index) => (
          <span key={target}>
            {index > 0 && " · "}
            <a href={stableDownloadPath(target)}>{STABLE_DOWNLOADS[target].label}</a>
          </span>
        ))}
      </span>
    </div>
  );
}
