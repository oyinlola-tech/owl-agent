// Background-task OS notifications via the Web Notification API only.
// No native plugins: there is no signing-safe path yet, so this helper
// degrades gracefully when Notification is unavailable or denied.
// Pure functions (classify/format) are unit-testable; the thin wrappers
// (permission/notify/title badge) take injectable envs for tests.

export type BackgroundNoticeKind = "approval" | "completed" | "failed";

export type NotificationPermissionState = "default" | "granted" | "denied" | "unsupported";

export interface NotificationEnv {
  Notification?: typeof Notification;
}

export interface DocumentEnv {
  title: string;
}

const globalEnv = (): NotificationEnv =>
  typeof globalThis === "object" ? (globalThis as NotificationEnv) : {};

export function isNotificationSupported(env: NotificationEnv = globalEnv()): boolean {
  return typeof env.Notification === "function";
}

export function getNotificationPermission(env: NotificationEnv = globalEnv()): NotificationPermissionState {
  if (!isNotificationSupported(env)) return "unsupported";
  const permission = env.Notification?.permission;
  if (permission === "granted" || permission === "denied") return permission;
  return "default";
}

/**
 * Resolves permission, requesting it only when it is still "default"
 * (first backgrounded task event). Never throws; returns the end state.
 */
export async function ensureNotificationPermission(
  env: NotificationEnv = globalEnv(),
): Promise<NotificationPermissionState> {
  if (!isNotificationSupported(env)) return "unsupported";
  const current = getNotificationPermission(env);
  if (current !== "default") return current;
  try {
    const result = await env.Notification?.requestPermission();
    return result === "granted" ? "granted" : result === "denied" ? "denied" : "default";
  } catch {
    return getNotificationPermission(env);
  }
}

export interface TaskNoticeContent {
  title: string;
  body: string;
  tag: string;
}

export function notificationContentFor(
  kind: BackgroundNoticeKind,
  taskLabel: string,
): TaskNoticeContent {
  const label = taskLabel.trim() || "Background task";
  if (kind === "approval") {
    return {
      title: "Approval needed",
      body: `${label} is waiting for your approval.`,
      tag: `owl-approval-${label}`,
    };
  }
  if (kind === "completed") {
    return {
      title: "Task completed",
      body: `${label} finished. Open it to review the result.`,
      tag: `owl-completed-${label}`,
    };
  }
  return {
    title: "Task failed",
    body: `${label} failed. Open it to see what happened.`,
    tag: `owl-failed-${label}`,
  };
}

/**
 * Maps SSE event types / snapshot statuses to the background notices we
 * surface. Returns null for events that need no notification.
 * Pure and total: unknown inputs yield null, never throw.
 */
export function classifyBackgroundEvent(
  type: string,
  payload: unknown = {},
): BackgroundNoticeKind | null {
  if (type === "approval.requested" || type === "task.awaiting_approval") return "approval";
  if (type === "task.completed" || type === "verification.completed") return "completed";
  if (type === "task.failed" || type === "verification.failed") return "failed";
  if (type === "snapshot") {
    const status = String((payload as Record<string, unknown> | null)?.status ?? "");
    if (status === "awaiting_approval") return "approval";
    if (status === "failed") return "failed";
    if (status === "verified_completed" || status.startsWith("completed")) return "completed";
    return null;
  }
  return null;
}

/** Never notify for the currently open (visible) task. */
export function shouldNotifyForTask(taskId: string | null, openTaskId: string | null): boolean {
  return Boolean(taskId) && taskId !== openTaskId;
}

/**
 * Thin wrapper over `new Notification(...)`. Returns true when a
 * notification was shown. Never throws; false when unavailable/denied.
 */
export function notify(
  title: string,
  body: string,
  tag: string,
  env: NotificationEnv = globalEnv(),
): boolean {
  try {
    if (!isNotificationSupported(env)) return false;
    if (env.Notification?.permission !== "granted") return false;
    new env.Notification(title, { body, tag });
    return true;
  } catch {
    return false;
  }
}

/** Convenience: content + delivery for one background notice. */
export function notifyBackgroundTask(
  kind: BackgroundNoticeKind,
  taskLabel: string,
  env: NotificationEnv = globalEnv(),
): boolean {
  const content = notificationContentFor(kind, taskLabel);
  return notify(content.title, content.body, content.tag, env);
}

// --- document.title badge -------------------------------------------------

const BADGE_PREFIX = /^\s*\(\d+\)\s*/;
let baseTitle = "";

export function formatTitleWithBadge(count: number, base: string): string {
  return count > 0 ? `(${count}) ${base}` : base;
}

export function resetTitleBadgeCache(): void {
  baseTitle = "";
}

/** Shows the pending-background-task count in document.title. Never throws. */
export function applyTitleBadge(count: number, doc?: DocumentEnv): void {
  try {
    const target =
      doc ?? (typeof document === "undefined" ? undefined : (document as unknown as DocumentEnv));
    if (!target) return;
    const current = target.title ?? "";
    if (!baseTitle) baseTitle = current.replace(BADGE_PREFIX, "") || "OWL";
    target.title = formatTitleWithBadge(Math.max(0, Math.floor(count)), baseTitle);
  } catch {
    return;
  }
}
