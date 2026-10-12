import { isRunningInsideDesktopShell } from "../../shared/platform/runtimeMode.helper";

export function canPickFolderNatively(): boolean {
  return isRunningInsideDesktopShell();
}

export async function pickProjectFolder(): Promise<string | null> {
  if (!isRunningInsideDesktopShell()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({ directory: true, multiple: false, title: "Choose a project folder" });
  return typeof selected === "string" ? selected : null;
}

export async function pickImportArchive(): Promise<string | null> {
  if (!isRunningInsideDesktopShell()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: false,
    multiple: false,
    title: "Choose an OWL export to import",
    filters: [{ name: "OWL export", extensions: ["zip"] }],
  });
  return typeof selected === "string" ? selected : null;
}
