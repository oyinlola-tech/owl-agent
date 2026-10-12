import { expect, test } from "@playwright/test";
import { openApp } from "../support/appScreen.support";

const SETTINGS_SECTIONS: { name: string; heading?: string }[] = [
  { name: "General", heading: "Appearance" },
  { name: "AI", heading: "Provider" },
  { name: "Permissions", heading: "What the agent may touch" },
  { name: "Workspaces", heading: "Authorized folders" },
  { name: "Security", heading: "Approvals" },
  { name: "Git", heading: "Checkpoints and commits" },
  { name: "Notifications", heading: "When to tell you" },
  { name: "Keyboard", heading: "Shortcuts" },
  { name: "Advanced", heading: "Service" },
  { name: "About" },
];

test("every settings section opens", async ({ page }) => {
  await openApp(page, "/app/settings");
  const sections = page.getByRole("navigation", { name: "Settings sections" });
  for (const section of SETTINGS_SECTIONS) {
    const button = sections.getByRole("button", { name: section.name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-current", "page");
    if (section.heading) {
      await expect(page.getByRole("heading", { level: 4, name: section.heading, exact: true })).toBeVisible();
    }
  }
});

test("security settings explain that live status needs the service when it is offline", async ({ page }) => {
  await openApp(page, "/app/settings");
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Security", exact: true }).click();
  await expect(page.getByRole("heading", { level: 4, name: "Command sandbox", exact: true })).toBeVisible();
  await expect(page.getByText(/The OWL service is offline, so the live sandbox and token status can't be shown/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 4, name: "Never read or sent", exact: true })).toBeVisible();
  await expect(page.getByText("Can't authenticate with the local OWL service")).toBeHidden();
});
