import { expect, test } from "@playwright/test";
import { openApp, sidebar } from "../support/appScreen.support";

test("command palette runs a command with Ctrl+Shift+P", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("Control+Shift+P");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await palette.getByRole("combobox").fill("settings");
  await expect(palette.getByRole("option", { name: "Open Settings" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(palette).toBeHidden();
  await expect(page).toHaveURL("/app/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
});

test("command palette closes with Escape", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("Control+Shift+P");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeHidden();
});

test("question mark opens the keyboard shortcuts dialog", async ({ page }) => {
  await openApp(page);
  await page.getByRole("heading", { level: 1 }).click();
  await page.keyboard.press("?");
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Search pages and commands")).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});

test("theme switch persists after a reload", async ({ page }) => {
  await openApp(page);
  const toggle = sidebar(page).getByRole("button", { name: /Switch to (dark|light) mode/ });
  const startedDark = (await toggle.getAttribute("aria-label")) === "Switch to light mode";
  await toggle.click();
  const expectedLabel = startedDark ? "Switch to dark mode" : "Switch to light mode";
  await expect(sidebar(page).getByRole("button", { name: expectedLabel })).toBeVisible();
  await page.reload();
  await expect(sidebar(page).getByRole("button", { name: expectedLabel })).toBeVisible();
});
