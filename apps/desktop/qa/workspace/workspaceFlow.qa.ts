import { expect, test } from "@playwright/test";
import { openApp } from "../support/appScreen.support";
import { routeAppToService, seedProject, startServiceForBaseUrl, type SeededProject } from "../support/realService.support";
import type { RunningService } from "../support/serviceProcess.support";

let service: RunningService | undefined;
let project: SeededProject | undefined;

test.beforeAll(async ({ baseURL }) => {
  service = await startServiceForBaseUrl(baseURL);
  if (service) project = await seedProject(service.url, "QA Workspace");
});

test.afterAll(() => {
  service?.stop();
});

test.beforeEach(async ({ page }) => {
  test.skip(!service, "The OWL service could not be started (no Python venv or startup failed)");
  await routeAppToService(page, service!.url);
});

async function openSeededProject(page: import("@playwright/test").Page) {
  await openApp(page, "/app/projects");
  const card = page.getByRole("article").filter({ hasText: project!.name });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByRole("tree", { name: "Files" })).toBeVisible({ timeout: 20_000 });
}

test("a seeded project opens with its real file tree", async ({ page }) => {
  await openSeededProject(page);
  await expect(page.getByText("package.json")).toBeVisible();
  await expect(page.getByText("README.md")).toBeVisible();
  await expect(page.getByText("src", { exact: true })).toBeVisible();
});

test("sending a message starts a real task", async ({ page }) => {
  await openSeededProject(page);
  const composer = page.getByRole("textbox", { name: "Message OWL" });
  await composer.fill("Give me a one line summary of this project");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Give me a one line summary of this project")).toBeVisible();
  await expect(page.getByText(/Working|Waiting for your approval|Done/).first()).toBeVisible({ timeout: 30_000 });
});

test("the terminal runs a real command in the project sandbox", async ({ page }) => {
  await openSeededProject(page);
  const terminalInput = page.getByRole("textbox", { name: "Run a command" });
  await expect(terminalInput).toBeVisible();
  await terminalInput.fill("echo owl-qa-works");
  await terminalInput.press("Enter");
  await expect(page.getByText("owl-qa-works")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/exit 0/)).toBeVisible({ timeout: 20_000 });
});
