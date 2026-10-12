import { useEffect, useState } from "react";
import { fetchLatestRelease, type LatestReleaseResult } from "./latestRelease.service";
import { detectPlatformFromClientHints, detectPlatformFromUserAgent, type DetectedPlatform } from "./releaseAssets.helper";

type UserAgentDataWithHints = {
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{ platform?: string; architecture?: string; bitness?: string }>;
};

export type LatestReleaseState = LatestReleaseResult | { status: "loading" };

export function useLatestRelease(): LatestReleaseState {
  const [releaseState, setReleaseState] = useState<LatestReleaseState>({ status: "loading" });
  useEffect(() => {
    let active = true;
    void fetchLatestRelease().then((result) => {
      if (active) setReleaseState(result);
    });
    return () => { active = false; };
  }, []);
  return releaseState;
}

export function useDetectedPlatform(): DetectedPlatform {
  const [platform, setPlatform] = useState<DetectedPlatform>(() => detectPlatformFromUserAgent(navigator.userAgent));
  useEffect(() => {
    const userAgentData = (navigator as Navigator & { userAgentData?: UserAgentDataWithHints }).userAgentData;
    if (!userAgentData?.getHighEntropyValues) return;
    let active = true;
    userAgentData.getHighEntropyValues(["architecture", "platform", "bitness"]).then((hints) => {
      if (!active) return;
      const hinted = detectPlatformFromClientHints(hints);
      if (hinted.os) setPlatform((current) => ({ os: hinted.os, arch: hinted.arch ?? current.arch }));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  return platform;
}
