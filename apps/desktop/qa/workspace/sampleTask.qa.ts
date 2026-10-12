import { expect, test, type Page } from "@playwright/test";
import { openApp, statusBar } from "../support/appScreen.support";

async function openProjectAndRunSample(page: Page) {
  await openApp(page, "/app/workspace");
  await page.getByRole("button", { name: "Open ZudoMart" }).click();
  await expect(page.getByRole("tree", { name: "Files" })).toBeVisible();
  await page.getByRole("button", { name: "Run sample task" }).click();
  await expect(page.getByText("Waiting for your approval")).toBeVisible({ timeout: 20_000 });
}

test("open a project and run the sample task", async ({ page }) => {
  await openProjectAndRunSample(page);
  await expect(page.getByRole("tablist", { name: "Workspace tabs" }).getByRole("tab", { name: /^Changes 3/ })).toBeVisible();
  await expect(statusBar(page).getByRole("button", { name: /main · 3 changes/ })).toBeVisible();
});

test("review changes: accept one file and reject another", async ({ page }) => {
  await openProjectAndRunSample(page);
  await page.getByRole("tablist", { name: "Workspace tabs" }).getByRole("tab", { name: /^Changes/ }).click();
  const serviceFile = page.getByRole("article").filter({ hasText: "src/auth/service.go" });
  const oldFile = page.getByRole("article").filter({ hasText: "src/old_auth.go" });
  await serviceFile.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(serviceFile.getByText("accepted", { exact: true })).toBeVisible();
  await expect(serviceFile.getByRole("button", { name: "Accept", exact: true })).toBeDisabled();
  await oldFile.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(oldFile.getByText("Rejected", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Undo \(\d+\)$/ })).toBeEnabled();
});

test("terminal toggles from the status bar", async ({ page }) => {
  await openApp(page, "/app/workspace");
  await page.getByRole("button", { name: "Open ZudoMart" }).click();
  const terminalInput = page.getByRole("textbox", { name: "Run a command" });
  await expect(terminalInput).toBeVisible();
  await statusBar(page).getByRole("button", { name: "Terminal" }).click();
  await expect(terminalInput).toBeHidden();
  await statusBar(page).getByRole("button", { name: "Terminal" }).click();
  await expect(terminalInput).toBeVisible();
});
