import { describe, expect, it, vi } from "vitest";
import {
  applyTitleBadge,
  classifyBackgroundEvent,
  ensureNotificationPermission,
  formatTitleWithBadge,
  getNotificationPermission,
  isNotificationSupported,
  notificationContentFor,
  notify,
  notifyBackgroundTask,
  resetTitleBadgeCache,
  shouldNotifyForTask,
  type NotificationEnv,
} from "./notifications.helper";

const grantedEnv = (create?: (title: string, opts?: NotificationOptions) => void): NotificationEnv => {
  class FakeNotification {
    static permission: NotificationPermission = "granted";
    constructor(title: string, opts?: NotificationOptions) {
      create?.(title, opts);
    }
  }
  return { Notification: FakeNotification as unknown as typeof Notification };
};

describe("isNotificationSupported / getNotificationPermission", () => {
  it("reports unsupported when Notification is missing", () => {
    expect(isNotificationSupported({})).toBe(false);
    expect(getNotificationPermission({})).toBe("unsupported");
  });

  it("reads the ambient permission", () => {
    expect(getNotificationPermission(grantedEnv())).toBe("granted");
  });
});

describe("ensureNotificationPermission", () => {
  it("returns unsupported without requesting", async () => {
    const requestPermission = vi.fn();
    expect(await ensureNotificationPermission({})).toBe("unsupported");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("requests only when permission is default", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    class FakeNotification {
      static permission: NotificationPermission = "default";
      static requestPermission = requestPermission;
    }
    const env: NotificationEnv = {
      Notification: FakeNotification as unknown as typeof Notification,
    };
    await expect(ensureNotificationPermission(env)).resolves.toBe("granted");
    expect(requestPermission).toHaveBeenCalledOnce();
    await expect(ensureNotificationPermission(grantedEnv())).resolves.toBe("granted");
  });

  it("never throws when the request rejects", async () => {
    class FakeNotification {
      static permission: NotificationPermission = "default";
      static requestPermission = vi.fn().mockRejectedValue(new Error("nope"));
    }
    const env: NotificationEnv = {
      Notification: FakeNotification as unknown as typeof Notification,
    };
    await expect(ensureNotificationPermission(env)).resolves.toBe("default");
  });
});

describe("classifyBackgroundEvent", () => {
  it("maps approval events", () => {
    expect(classifyBackgroundEvent("approval.requested", {})).toBe("approval");
    expect(classifyBackgroundEvent("task.awaiting_approval", {})).toBe("approval");
    expect(classifyBackgroundEvent("snapshot", { status: "awaiting_approval" })).toBe("approval");
  });

  it("maps completion events", () => {
    expect(classifyBackgroundEvent("task.completed", {})).toBe("completed");
    expect(classifyBackgroundEvent("verification.completed", {})).toBe("completed");
    expect(classifyBackgroundEvent("snapshot", { status: "verified_completed" })).toBe("completed");
    expect(classifyBackgroundEvent("snapshot", { status: "completed_unverified" })).toBe("completed");
  });

  it("maps failure events", () => {
    expect(classifyBackgroundEvent("task.failed", { reason: "x" })).toBe("failed");
    expect(classifyBackgroundEvent("snapshot", { status: "failed" })).toBe("failed");
  });

  it("ignores noise and unknown input", () => {
    expect(classifyBackgroundEvent("task.progress", { progress: 3 })).toBeNull();
    expect(classifyBackgroundEvent("message", { text: "hi" })).toBeNull();
    expect(classifyBackgroundEvent("snapshot", { status: "running" })).toBeNull();
    expect(classifyBackgroundEvent("snapshot", {})).toBeNull();
    expect(classifyBackgroundEvent("bogus", null)).toBeNull();
  });
});

describe("shouldNotifyForTask", () => {
  it("is false for the open task or a missing id", () => {
    expect(shouldNotifyForTask("a", "a")).toBe(false);
    expect(shouldNotifyForTask(null, "a")).toBe(false);
    expect(shouldNotifyForTask("b", "a")).toBe(true);
    expect(shouldNotifyForTask("b", null)).toBe(true);
  });
});

describe("notificationContentFor", () => {
  it("builds distinct title/body/tag per kind", () => {
    expect(notificationContentFor("approval", "task-1")).toMatchObject({
      title: "Approval needed",
      tag: expect.stringContaining("task-1"),
    });
    expect(notificationContentFor("completed", "task-1").title).toBe("Task completed");
    expect(notificationContentFor("failed", "task-1").title).toBe("Task failed");
  });

  it("falls back to a generic label", () => {
    expect(notificationContentFor("completed", "  ").body).toContain("Background task");
  });
});

describe("notify", () => {
  it("shows a notification when granted", () => {
    const constructed: { title: string; opts?: NotificationOptions }[] = [];
    class FakeNotification {
      static permission: NotificationPermission = "granted";
      constructor(title: string, opts?: NotificationOptions) {
        constructed.push({ title, opts });
      }
    }
    const env: NotificationEnv = {
      Notification: FakeNotification as unknown as typeof Notification,
    };
    expect(notify("T", "B", "tag-1", env)).toBe(true);
    expect(constructed).toEqual([{ title: "T", opts: { body: "B", tag: "tag-1" } }]);
  });

  it("falls back gracefully when unavailable, denied, or throwing", () => {
    expect(notify("T", "B", "tag", {})).toBe(false);
    const ctor = vi.fn();
    class DeniedNotification {
      static permission: NotificationPermission = "denied";
      constructor(...args: unknown[]) {
        ctor(...args);
      }
    }
    const denied: NotificationEnv = {
      Notification: DeniedNotification as unknown as typeof Notification,
    };
    expect(notify("T", "B", "tag", denied)).toBe(false);
    expect(ctor).not.toHaveBeenCalled();
    const throwing = grantedEnv(() => {
      throw new Error("blocked");
    });
    expect(notify("T", "B", "tag", throwing)).toBe(false);
  });

  it("notifyBackgroundTask delivers content per kind", () => {
    const seen: { title: string; opts?: NotificationOptions }[] = [];
    const env = grantedEnv((title, opts) => void seen.push({ title, opts }));
    expect(notifyBackgroundTask("approval", "task-9", env)).toBe(true);
    expect(seen[0]?.title).toBe("Approval needed");
    expect(String(seen[0]?.opts?.tag)).toContain("task-9");
  });
});

describe("title badge", () => {
  it("formats counts and restores the base title at zero", () => {
    resetTitleBadgeCache();
    expect(formatTitleWithBadge(2, "OWL")).toBe("(2) OWL");
    expect(formatTitleWithBadge(0, "OWL")).toBe("OWL");
    const doc = { title: "OWL" };
    applyTitleBadge(3, doc);
    expect(doc.title).toBe("(3) OWL");
    applyTitleBadge(0, doc);
    expect(doc.title).toBe("OWL");
  });

  it("never throws without a document", () => {
    resetTitleBadgeCache();
    expect(() => applyTitleBadge(1, undefined)).not.toThrow();
  });
});
