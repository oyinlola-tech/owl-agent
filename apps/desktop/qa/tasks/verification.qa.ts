import { expect, test } from "@playwright/test";
import { openBackendSampleTask } from "../support/appScreen.support";

async function openVerificationTab(page: import("@playwright/test").Page) {
  await page.getByRole("tablist", { name: "Task sections" }).getByRole("tab", { name: /^Verification/ }).click();
}

test("verified sample task shows passed checks", async ({ page }) => {
  await openBackendSampleTask(page, /Raise the ProofLens API client timeout/);
  await openVerificationTab(page);
  await expect(page.getByRole("status").filter({ hasText: "Verified" })).toContainText("every required one passed");
  await expect(page.getByRole("button", { name: /^Passed Typecheck/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Passed Tests/ })).toBeVisible();
});

test("completed task without checks shows not verified", async ({ page }) => {
  await openBackendSampleTask(page, /Summarise the Scriptune repository/);
  await openVerificationTab(page);
  await expect(page.getByRole("status").filter({ hasText: "Completed, not verified" })).toBeVisible();
});

test("failed verification shows the failing command", async ({ page }) => {
  await openBackendSampleTask(page, /Add a VAT rounding helper/);
  await openVerificationTab(page);
  const banner = page.getByRole("status").filter({ hasText: "Verification failed" });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("code")).toHaveText(".venv/bin/python -m pytest -q");
  await expect(page.getByRole("button", { name: /^Failed Tests/ })).toBeVisible();
});

test("running task is not verified yet", async ({ page }) => {
  await openBackendSampleTask(page, /Fix the checkout rounding bug/);
  await openVerificationTab(page);
  await expect(page.getByRole("status").filter({ hasText: "Not verified yet" })).toBeVisible();
});
