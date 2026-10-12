import type { Page } from "@playwright/test";
// @ts-expect-error type error without @types/node package
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
// @ts-expect-error type error without @types/node package
import { tmpdir } from "node:os";
// @ts-expect-error type error without @types/node package
import { join } from "node:path";
import { startRealService, type RunningService } from "./serviceProcess.support";
import { QA_SERVICE_TOKEN } from "./qaServiceToken.support";

export const OFFLINE_SERVICE_ORIGIN = "http://127.0.0.1:1";

export interface SeededProject {
  id: string;
  name: string;
  path: string;
}

export async function startServiceForBaseUrl(baseURL: string | undefined): Promise<RunningService | undefined> {
  return startRealService(new URL(baseURL ?? "http://localhost:5212").origin);
}

export async function routeAppToService(page: Page, serviceUrl: string): Promise<void> {
  await page.route(`${OFFLINE_SERVICE_ORIGIN}/**`, (route) => {
    const target = route.request().url().replace(OFFLINE_SERVICE_ORIGIN, serviceUrl);
    return route.continue({ url: target });
  });
}

export function createTempProjectFolder(prefix = "owl-qa-project-"): string {
  const folder = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(join(folder, "package.json"), JSON.stringify({ name: "qa-fixture", scripts: { test: "echo ok" } }, null, 2));
  mkdirSync(join(folder, "src"), { recursive: true });
  writeFileSync(join(folder, "src", "index.ts"), "export const greeting = \"hello from owl qa\";\n");
  writeFileSync(join(folder, "README.md"), "# QA fixture project\n");
  return folder;
}

export async function seedProject(serviceUrl: string, name = "QA Fixture"): Promise<SeededProject> {
  const path = createTempProjectFolder();
  const response = await fetch(`${serviceUrl}/projects`, {
    method: "POST",
    headers: { Authorization: `Bearer ${QA_SERVICE_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ path, name }),
  });
  const body = (await response.json()) as { project: SeededProject };
  return body.project;
}
