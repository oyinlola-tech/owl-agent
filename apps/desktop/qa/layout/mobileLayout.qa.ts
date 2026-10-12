import { expect, test } from "@playwright/test";

const ROUTES = [
  "/", "/docs", "/security", "/changelog", "/download", "/missing-page",
  "/app", "/app/inbox", "/app/workspace", "/app/tasks", "/app/btask", "/app/task", "/app/browser",
  "/app/projects", "/app/memory", "/app/settings", "/app/history", "/app/models", "/app/tools",
  "/app/playbooks", "/app/help",
];

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

for (const route of ROUTES) {
  test(`no horizontal scroll at 390px on ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("body")).not.toBeEmpty();
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => {
      window.scrollTo(10_000, window.scrollY);
      const root = document.documentElement;
      return { scrollWidth: Math.max(root.scrollWidth, document.body.scrollWidth), width: window.innerWidth, scrollX: window.scrollX };
    });
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.width);
    expect(overflow.scrollX).toBe(0);
  });
}
