import { expect, type Locator, type Page } from "@playwright/test";

export const SIDEBAR_SCREENS: { button: string; path: string | RegExp; heading?: RegExp }[] = [
  { button: "Home", path: /\/app(\/welcome)?$/, heading: /What are we building\?/ },
  { button: "Inbox", path: "/app/inbox", heading: /^Inbox$/ },
  { button: "Workspace", path: "/app/workspace" },
  { button: "Tasks", path: "/app/tasks", heading: /^Tasks$/ },
  { button: "Projects", path: "/app/projects" },
  { button: "Browser Studio", path: "/app/browser" },
  { button: "Memory", path: "/app/memory" },
  { button: "Playbooks", path: "/app/playbooks" },
  { button: "Change history", path: "/app/history" },
  { button: "Models & usage", path: "/app/models" },
  { button: "Agent tools", path: "/app/tools" },
  { button: "Settings", path: "/app/settings", heading: /^Settings$/ },
  { button: "Help", path: "/app/help" },
];

export function sidebar(page: Page): Locator {
  return page.getByRole("navigation", { name: "Primary" });
}

export function statusBar(page: Page): Locator {
  return page.getByRole("contentinfo");
}

export async function openApp(page: Page, path = "/app"): Promise<void> {
  await page.goto(path);
  await expect(sidebar(page)).toBeVisible();
}

export async function readInboxBadgeCount(page: Page): Promise<number> {
  const text = await sidebar(page).getByRole("button", { name: "Inbox", exact: true }).innerText();
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

export async function openBackendSampleTask(page: Page, objective: RegExp): Promise<void> {
  await openApp(page, "/app/tasks");
  const row = page.getByRole("row", { name: objective });
  await expect(row).toBeVisible();
  await expect(async () => {
    await row.getByRole("button", { name: "Open", exact: true }).click({ timeout: 2_000 });
    await expect(page.getByRole("heading", { level: 1, name: objective })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}
