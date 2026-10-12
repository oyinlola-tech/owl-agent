import { expect, test } from "@playwright/test";
import { openApp, statusBar } from "../support/appScreen.support";
import { startRealService, type RunningService } from "../support/serviceProcess.support";

const OFFLINE_SERVICE_ORIGIN = "http://127.0.0.1:1";

let service: RunningService | undefined;

test.beforeAll(async ({ baseURL }) => {
  service = await startRealService(new URL(baseURL ?? "http://localhost:5212").origin);
});

test.afterAll(() => {
  service?.stop();
});

test("app shows the service online when the real service runs", async ({ page }) => {
  test.skip(!service, "The OWL service could not be started (no Python venv or startup failed)");
  const serviceUrl = service!.url;
  await page.route(`${OFFLINE_SERVICE_ORIGIN}/**`, (route) => {
    const target = route.request().url().replace(OFFLINE_SERVICE_ORIGIN, serviceUrl);
    return route.continue({ url: target });
  });
  await openApp(page);
  await expect(statusBar(page).getByRole("button", { name: /^Service (online|v\d)/ })).toBeVisible({ timeout: 20_000 });
  await expect(statusBar(page).getByRole("button", { name: "Service offline" })).toBeHidden();
  await openApp(page, "/app/settings");
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Security", exact: true }).click();
  await expect(page.getByRole("heading", { level: 4, name: "Service access", exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Token protection", { exact: true })).toBeVisible();
  await expect(page.getByText("Can't authenticate with the local OWL service")).toBeHidden();
});
