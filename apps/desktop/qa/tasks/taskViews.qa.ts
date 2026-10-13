import { expect, test } from "@playwright/test";
import { openApp } from "../support/appScreen.support";
import { routeAppToService, seedProject, startServiceForBaseUrl, type SeededProject } from "../support/realService.support";
import { seedTask, waitForTaskStatus } from "../support/seededTask.support";
import type { RunningService } from "../support/serviceProcess.support";

let service: RunningService | undefined;
let project: SeededProject | undefined;
const SEEDED_PROMPT = "owl qa table board filter task";

test.beforeAll(async ({ baseURL }) => {
  service = await startServiceForBaseUrl(baseURL);
  if (!service) return;
  project = await seedProject(service.url, "QA Tasks");
  const task = await seedTask(service.url, project, SEEDED_PROMPT);
  await waitForTaskStatus(service.url, task.id, "awaiting_approval");
});

test.afterAll(() => {
  service?.stop();
});

test.beforeEach(async ({ page }) => {
  test.skip(!service, "The OWL service could not be started (no Python venv or startup failed)");
  await routeAppToService(page, service!.url);
});

test("tasks switch between table and board", async ({ page }) => {
  await openApp(page, "/app/tasks");
  await expect(page.getByRole("button", { name: "Table", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("columnheader", { name: "Objective" })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(SEEDED_PROMPT) })).toBeVisible();
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(page.getByRole("button", { name: "Board", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Needs approval" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Needs approval" })).toContainText(SEEDED_PROMPT);
  await expect(page.getByRole("columnheader", { name: "Objective" })).toBeHidden();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: "Objective" })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(SEEDED_PROMPT) })).toBeVisible();
});

test("task search narrows the list", async ({ page }) => {
  await openApp(page, "/app/tasks");
  const search = page.getByRole("textbox", { name: "Search tasks" });
  await expect(search).toBeVisible();
  await search.fill("owl qa table board");
  await expect(page.getByRole("row", { name: new RegExp(SEEDED_PROMPT) })).toBeVisible();
  await search.fill("zzz-no-such-task-anywhere");
  await expect(page.getByText(/No saved tasks match "zzz-no-such-task-anywhere"/)).toBeVisible();
});
