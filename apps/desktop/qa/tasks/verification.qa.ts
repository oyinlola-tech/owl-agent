import { expect, test } from "@playwright/test";
import { openApp } from "../support/appScreen.support";
import { routeAppToService, seedProject, startServiceForBaseUrl, type SeededProject } from "../support/realService.support";
import {
  cancelTask,
  decideApproval,
  openSeededTask,
  seedTask,
  waitForApprovalCount,
  waitForPendingApproval,
  waitForTaskStatus,
} from "../support/seededTask.support";
import { startRealService, type RunningService } from "../support/serviceProcess.support";

let service: RunningService | undefined;
let project: SeededProject | undefined;

test.beforeAll(async ({ baseURL }) => {
  service = await startServiceForBaseUrl(baseURL);
  if (service) project = await seedProject(service.url, "QA Verification");
});

test.afterAll(() => {
  service?.stop();
});

test.beforeEach(async ({ page }) => {
  test.skip(!service, "The OWL service could not be started (no Python venv or startup failed)");
  await routeAppToService(page, service!.url);
});

async function openVerificationTab(page: import("@playwright/test").Page) {
  await page.getByRole("tablist", { name: "Task sections" }).getByRole("tab", { name: /^Verification/ }).click();
}

test("task waiting for approval is not verified yet", async ({ page }) => {
  const prompt = `owl qa verify pending ${Date.now()}`;
  const task = await seedTask(service!.url, project!, prompt);
  await waitForTaskStatus(service!.url, task.id, "awaiting_approval");
  await openSeededTask(page, prompt);
  await openVerificationTab(page);
  await expect(page.getByRole("status").filter({ hasText: "Not verified yet" })).toBeVisible();
  await expect(page.getByText(/never counts/)).toBeVisible();
});

test("approving the command lets the agent keep working", async ({ page }) => {
  const prompt = `owl qa verify approve ${Date.now()}`;
  const task = await seedTask(service!.url, project!, prompt);
  const first = await waitForPendingApproval(service!.url, task.id);
  await decideApproval(service!.url, task.id, first.id, true);
  // The mock agent runs the approved command, then asks for approval again.
  await waitForApprovalCount(service!.url, task.id, 2);
  await openSeededTask(page, prompt);
  await expect(page.getByRole("heading", { name: /^Waiting for your approval/ })).toBeVisible();
  await openVerificationTab(page);
  await expect(page.getByRole("status").filter({ hasText: "Not verified yet" })).toBeVisible();
});

test("cancelled task is not verified yet", async ({ page }) => {
  const prompt = `owl qa verify cancelled ${Date.now()}`;
  const task = await seedTask(service!.url, project!, prompt);
  await waitForTaskStatus(service!.url, task.id, "awaiting_approval");
  await cancelTask(service!.url, task.id);
  await waitForTaskStatus(service!.url, task.id, "cancelled");
  await openSeededTask(page, prompt);
  await expect(page.getByText(/^Cancelled$/).first()).toBeVisible();
  await openVerificationTab(page);
  await expect(page.getByRole("status").filter({ hasText: "Not verified yet" })).toBeVisible();
});

test("tasks page shows an empty state with no tasks", async ({ page, baseURL }) => {
  const fresh = await startRealService(new URL(baseURL ?? "http://localhost:5212").origin);
  test.skip(!fresh, "The OWL service could not be started (no Python venv or startup failed)");
  try {
    await routeAppToService(page, fresh!.url);
    await openApp(page, "/app/tasks");
    await expect(page.getByText(/No saved tasks yet/)).toBeVisible({ timeout: 20_000 });
  } finally {
    fresh!.stop();
  }
});
