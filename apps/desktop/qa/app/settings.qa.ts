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
