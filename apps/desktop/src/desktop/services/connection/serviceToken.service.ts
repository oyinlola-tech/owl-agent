import { invoke } from "@tauri-apps/api/core";
import { isRunningInsideDesktopShell } from "../../../shared/platform/runtimeMode.helper";

const DESKTOP_TOKEN_COMMAND = "get_service_token";
const DESKTOP_TOKEN_ATTEMPTS = 10;
const DESKTOP_TOKEN_RETRY_MS = 300;

let cachedServiceToken: Promise<string> | null = null;

function waitMilliseconds(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

async function askDesktopShellForServiceToken(): Promise<string> {
  for (let attempt = 0; attempt < DESKTOP_TOKEN_ATTEMPTS; attempt += 1) {
    const token = await invoke<string>(DESKTOP_TOKEN_COMMAND).catch(() => "");
    if (token) return token;
    await waitMilliseconds(DESKTOP_TOKEN_RETRY_MS);
  }
  return "";
}

function readBrowserDevServiceToken(): string {
  const value = import.meta.env.VITE_OWL_DEV_TOKEN as string | undefined;
  return value?.trim() ?? "";
}

export function getServiceToken(): Promise<string> {
  // Security: the token lives only in memory. The desktop shell hands it over through a
  // command scoped to the main window; browser dev builds read VITE_OWL_DEV_TOKEN.
  if (!cachedServiceToken) {
    cachedServiceToken = isRunningInsideDesktopShell()
      ? askDesktopShellForServiceToken()
      : Promise.resolve(readBrowserDevServiceToken());
  }
  return cachedServiceToken;
}

export function forgetServiceToken(): void {
  cachedServiceToken = null;
}
