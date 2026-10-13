import { expect, test } from "@playwright/test";
import { openApp, readInboxBadgeCount } from "../support/appScreen.support";
import { routeAppToService, seedProject, startServiceForBaseUrl, type SeededProject } from "../support/realService.support";
import { seedTask, waitForPendingApproval } from "../support/seededTask.support";
import type { RunningService } from "../support/serviceProcess.support";

let service: RunningService | undefined;
let project: SeededProject | undefined;

test.beforeAll(async ({ baseURL }) => {
  service = await startServiceForBaseUrl(baseURL);
  if (service) project = await seedProject(service.url, "QA Inbox");
});

test.afterAll(() => {
  service?.stop();
});

test.beforeEach(async ({ page }) => {
  test.skip(!service, "The OWL service could not be started (no Python venv or startup failed)");
  await routeAppToService(page, service!.url);
});

test("approving a real request lowers the sidebar badge", async ({ page }) => {
  const prompt = `owl qa inbox approve ${Date.now()}`;
  const task = await seedTask(service!.url, project!, prompt);
  await waitForPendingApproval(service!.url, task.id);
  await openApp(page, "/app/inbox");
  await expect.poll(() => readInboxBadgeCount(page), { timeout: 30_000 }).toBe(1);
  const group = page.getByRole("region", { name: prompt });
  await expect(group).toBeVisible({ timeout: 20_000 });
  await group.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(() => readInboxBadgeCount(page), { timeout: 15_000 }).toBe(0);
  await expect(
    page.getByRole("tablist", { name: "Show approvals" }).getByRole("tab", { name: /^Pending/ }),
  ).toContainText("Pending 0");
});

test("rejecting a real request lowers the sidebar badge", async ({ page }) => {
  const prompt = `owl qa inbox reject ${Date.now()}`;
  const task = await seedTask(service!.url, project!, prompt);
  await waitForPendingApproval(service!.url, task.id);
  await openApp(page, "/app/inbox");
  const group = page.getByRole("region", { name: prompt });
  await expect(group).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => readInboxBadgeCount(page), { timeout: 30_000 }).toBeGreaterThan(0);
  const before = await readInboxBadgeCount(page);
  await group.getByRole("button", { name: "Reject", exact: true }).click();
  await expect.poll(() => readInboxBadgeCount(page), { timeout: 15_000 }).toBe(before - 1);
  await expect(
    page.getByRole("tablist", { name: "Show approvals" }).getByRole("tab", { name: /^Pending/ }),
  ).toContainText(`Pending ${before - 1}`);
});
