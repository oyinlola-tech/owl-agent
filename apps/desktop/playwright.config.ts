import { defineConfig, devices } from "@playwright/test";
// @ts-expect-error type error without @types/node package
import { existsSync } from "node:fs";
// @ts-expect-error type error without @types/node package
import process from "node:process";
import { QA_SERVICE_TOKEN } from "./qa/support/qaServiceToken.support";

const QA_PORT = 5212;
const OFFLINE_SERVICE_URL = "http://127.0.0.1:1";
const SYSTEM_CHROMIUM = "/usr/bin/chromium";

function pickChromiumExecutable(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (!process.env.CI && existsSync(SYSTEM_CHROMIUM)) return SYSTEM_CHROMIUM;
  return undefined;
}

export default defineConfig({
  testDir: "qa",
  testMatch: "**/*.qa.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "node_modules/.cache/owl-qa/report" }]] : "list",
  outputDir: "node_modules/.cache/owl-qa/results",
  use: {
    baseURL: `http://localhost:${QA_PORT}`,
    trace: "retain-on-failure",
    launchOptions: { executablePath: pickChromiumExecutable() },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: `npx vite --port ${QA_PORT} --strictPort`,
    url: `http://localhost:${QA_PORT}/app`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { VITE_OWL_SERVICE_URL: OFFLINE_SERVICE_URL, VITE_OWL_DEV_TOKEN: QA_SERVICE_TOKEN },
  },
});
