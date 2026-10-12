import { expect, test } from "@playwright/test";
import { openApp, SIDEBAR_SCREENS, sidebar, statusBar } from "../support/appScreen.support";

test("app starts in sample-data mode when the service is offline", async ({ page }) => {
  await openApp(page);
  await expect(statusBar(page).getByRole("button", { name: "Service offline" })).toBeVisible();
});

for (const screen of SIDEBAR_SCREENS) {
  test(`sidebar opens ${screen.button}`, async ({ page }) => {
    await openApp(page, screen.button === "Home" ? "/app/settings" : "/app");
    await sidebar(page).getByRole("button", { name: screen.button, exact: true }).click();
    await expect(page).toHaveURL(screen.path);
    if (screen.heading) {
      await expect(page.getByRole("heading", { level: 1, name: screen.heading })).toBeVisible();
    }
  });
}
