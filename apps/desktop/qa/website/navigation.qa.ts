import { expect, test } from "@playwright/test";

const WEBSITE_PAGES = [
  { link: "Docs", path: "/docs", title: "Docs — OWL", heading: "Set up OWL and learn how it works." },
  { link: "Security", path: "/security", title: "Security — OWL", heading: "You stay in control of every write." },
  { link: "Changelog", path: "/changelog", title: "Changelog — OWL", heading: "What's new in OWL." },
  { link: "Download", path: "/download", title: "Download — OWL", heading: "Get OWL on your machine." },
];

test("home page shows the product headline", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/OWL/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
});

for (const target of WEBSITE_PAGES) {
  test(`main navigation opens ${target.link}`, async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: target.link, exact: true }).click();
    await expect(page).toHaveURL(target.path);
    await expect(page).toHaveTitle(target.title);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(target.heading);
  });
}

test("brand link returns to the home page", async ({ page }) => {
  await page.goto("/docs");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "OWL home" }).click();
  await expect(page).toHaveURL("/");
});

test("open app link starts the desktop app", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Open app" }).click();
  await expect(page).toHaveURL(/\/app/);
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
});

test("unknown path shows the 404 page with ways back", async ({ page }) => {
  await page.goto("/this-page-does-not-exist");
  await expect(page).toHaveTitle("Page not found — OWL");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page doesn't exist.");
  await expect(page.getByRole("main").getByText("/this-page-does-not-exist")).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: /^Docs/ }).click();
  await expect(page).toHaveURL("/docs");
});
