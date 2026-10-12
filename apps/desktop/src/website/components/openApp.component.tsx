import { ArrowRight } from "@phosphor-icons/react";
import { isWebsiteOnlyBuild } from "../../shared/platform/runtimeMode.helper";
import { SiteLink } from "./siteLink.component";

const WEBSITE_OPEN_APP_LABEL = "Open OWL";

export function openAppLabel(desktopBuildLabel: string): string {
  return isWebsiteOnlyBuild() ? WEBSITE_OPEN_APP_LABEL : desktopBuildLabel;
}

export function OpenAppLink({ className, label, arrowSize, onClick }: {
  className: string; label: string; arrowSize?: number; onClick?: () => void;
}) {
  return (
    <a className={className} href="/app" onClick={onClick}>
      {openAppLabel(label)}{arrowSize ? <> <ArrowRight size={arrowSize} weight="bold" /></> : null}
    </a>
  );
}

export function WebsiteDownloadLink({ className }: { className: string }) {
  if (!isWebsiteOnlyBuild()) return null;
  return <SiteLink className={className} to="/download">Download</SiteLink>;
}
