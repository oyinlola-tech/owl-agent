import { openUrl } from "@tauri-apps/plugin-opener";
import { isRunningInsideDesktopShell } from "./runtimeMode.helper";

export async function openLinkInSystemBrowser(url: string): Promise<void> {
  if (isRunningInsideDesktopShell()) {
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
