import { expect, test } from "@playwright/test";
import { openApp, readInboxBadgeCount } from "../support/appScreen.support";

test("approving a sample request lowers the sidebar badge", async ({ page }) => {
  await openApp(page, "/app/inbox");
  await expect(page.getByRole("status").filter({ hasText: "Sample data" })).toBeVisible();
  const before = await readInboxBadgeCount(page);
  expect(before).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Approve", exact: true }).first().click();
  await expect.poll(() => readInboxBadgeCount(page)).toBe(before - 1);
  await expect(page.getByRole("tab", { name: `Pending ${before - 1}` })).toBeVisible();
});

test("rejecting a sample request lowers the sidebar badge", async ({ page }) => {
  await openApp(page, "/app/inbox");
  const before = await readInboxBadgeCount(page);
  await page.getByRole("button", { name: "Reject", exact: true }).first().click();
  await expect.poll(() => readInboxBadgeCount(page)).toBe(before - 1);
  await expect(page.getByRole("button", { name: `Inbox, ${before - 1} approvals waiting` })).toBeVisible();
});
