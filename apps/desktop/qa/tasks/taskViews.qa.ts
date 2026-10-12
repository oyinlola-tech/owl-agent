import { expect, test } from "@playwright/test";
import { openApp } from "../support/appScreen.support";

test("tasks switch between table and board", async ({ page }) => {
  await openApp(page, "/app/tasks");
  await expect(page.getByRole("button", { name: "Table", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(page.getByRole("button", { name: "Board", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Running" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Name" })).toBeHidden();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
});

test("task filter tabs narrow the list", async ({ page }) => {
  await openApp(page, "/app/tasks");
  const filters = page.getByRole("tablist", { name: "Filter tasks" });
  await filters.getByRole("tab", { name: /^Failed/ }).click();
  await expect(filters.getByRole("tab", { name: /^Failed/ })).toHaveAttribute("aria-selected", "true");
});
