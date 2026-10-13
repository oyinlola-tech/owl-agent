import { expect, type Page } from "@playwright/test";
import { openApp } from "./appScreen.support";
import { QA_SERVICE_TOKEN } from "./qaServiceToken.support";
import type { SeededProject } from "./realService.support";

export interface SeededTask {
  id: string;
  prompt: string;
  status: string;
}

export interface TaskApproval {
  id: string;
  title: string;
  status: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function serviceApi(serviceUrl: string, method: string, path: string, body?: unknown): Promise<any> {
  const response = await fetch(`${serviceUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${QA_SERVICE_TOKEN}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}`);
  return (await response.json()) as unknown;
}

export async function seedTask(serviceUrl: string, project: SeededProject, prompt: string): Promise<SeededTask> {
  return (await serviceApi(serviceUrl, "POST", "/tasks", {
    prompt,
    project: project.name,
    workspace: project.path,
    model: "auto",
  })) as SeededTask;
}

export async function getTask(serviceUrl: string, taskId: string): Promise<SeededTask> {
  return (await serviceApi(serviceUrl, "GET", `/tasks/${taskId}`)) as SeededTask;
}

export async function listApprovals(serviceUrl: string, taskId: string): Promise<TaskApproval[]> {
  return (await serviceApi(serviceUrl, "GET", `/tasks/${taskId}/approvals`)) as TaskApproval[];
}

export async function decideApproval(
  serviceUrl: string,
  taskId: string,
  approvalId: string,
  approved: boolean,
): Promise<void> {
  await serviceApi(serviceUrl, "POST", `/tasks/${taskId}/approvals/${approvalId}/decision`, {
    approved,
    by: "local-user",
  });
}

export async function cancelTask(serviceUrl: string, taskId: string): Promise<void> {
  await serviceApi(serviceUrl, "POST", `/tasks/${taskId}/cancel`);
}

async function pollUntil(label: string, timeoutMs: number, check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) return;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for: ${label}`);
    await new Promise((wait) => setTimeout(wait, 500));
  }
}

export async function waitForTaskStatus(
  serviceUrl: string,
  taskId: string,
  status: string,
  timeoutMs = 30_000,
): Promise<void> {
  await pollUntil(`task ${taskId} to reach ${status}`, timeoutMs, async () => {
    const task = await getTask(serviceUrl, taskId);
    return task.status === status;
  });
}

export async function waitForPendingApproval(
  serviceUrl: string,
  taskId: string,
  timeoutMs = 30_000,
): Promise<TaskApproval> {
  let pending: TaskApproval | undefined;
  await pollUntil(`task ${taskId} to request approval`, timeoutMs, async () => {
    pending = (await listApprovals(serviceUrl, taskId)).find((approval) => approval.status === "pending");
    return pending !== undefined;
  });
  return pending!;
}

export async function waitForApprovalCount(
  serviceUrl: string,
  taskId: string,
  count: number,
  timeoutMs = 30_000,
): Promise<TaskApproval[]> {
  let approvals: TaskApproval[] = [];
  await pollUntil(`task ${taskId} to have ${count} approvals`, timeoutMs, async () => {
    approvals = await listApprovals(serviceUrl, taskId);
    return approvals.length >= count;
  });
  return approvals;
}

export async function openSeededTask(page: Page, prompt: string): Promise<void> {
  await openApp(page, "/app/tasks");
  const row = page.getByRole("row", { name: new RegExp(escapeRegExp(prompt.slice(0, 48))) });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(async () => {
    await row.getByRole("button", { name: "Open", exact: true }).click({ timeout: 2_000 });
    await expect(page.getByRole("heading", { level: 1, name: prompt.slice(0, 60) })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
