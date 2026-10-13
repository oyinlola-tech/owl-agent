import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetTitleBadgeCache } from "../../shared/helpers/notifications.helper";

const { handlers, events } = vi.hoisted(() => {
  const handlers = new Map<string, (type: string, payload: unknown) => void>();
  const events = vi.fn((taskId: string, onEvent: (type: string, payload: unknown) => void) => {
    handlers.set(taskId, onEvent);
    return () => void handlers.delete(taskId);
  });
  return { handlers, events };
});

vi.mock("../services/agentApi.service", () => ({
  ApiError: class ApiError extends Error {},
  agentApi: {
    events,
    updateProject: vi.fn().mockResolvedValue({}),
    gitSummary: vi.fn().mockResolvedValue({ is_repo: false, changed: [] }),
    approvals: vi.fn().mockResolvedValue([]),
  },
}));

import { useAppStore } from "./app.store";

beforeEach(() => {
  handlers.clear();
  events.mockClear();
  resetTitleBadgeCache();
  document.title = "OWL";
  useAppStore.setState({
    taskId: null,
    backgroundTasks: {},
    notificationsEnabled: false, // keep OS notify off; store behavior only
    cancelTaskStream: null,
  });
});

describe("background task tracking", () => {
  it("subscribes once per backgrounded task id", () => {
    const store = useAppStore.getState();
    store.watchBackgroundTasks([{ id: "bg-1" }, { id: "bg-1" }, { id: "  " }]);
    expect(events).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().backgroundTasks["bg-1"]).toMatchObject({ pending: null });
  });

  it("flags a backgrounded task on approval and badges document.title", () => {
    useAppStore.getState().watchBackgroundTasks([{ id: "bg-2" }]);
    handlers.get("bg-2")?.("approval.requested", {});
    const entry = useAppStore.getState().backgroundTasks["bg-2"];
    expect(entry?.pending).toBe("approval");
    expect(entry?.status).toBe("awaiting_approval");
    expect(document.title).toBe("(1) OWL");
  });

  it("never notifies for the currently open task", () => {
    useAppStore.setState({ taskId: "open-1" });
    useAppStore.getState().watchBackgroundTasks([{ id: "open-1" }]);
    handlers.get("open-1")?.("task.failed", { reason: "boom" });
    expect(useAppStore.getState().backgroundTasks["open-1"]?.pending).toBeNull();
    expect(document.title).toBe("OWL");
  });

  it("opening the task clears its pending flag and badge", () => {
    const store = useAppStore.getState();
    store.watchBackgroundTasks([{ id: "bg-3" }]);
    handlers.get("bg-3")?.("task.completed", {});
    expect(document.title).toBe("(1) OWL");
    useAppStore.setState({ taskId: "bg-3" });
    store.attachTaskStream("bg-3");
    expect(useAppStore.getState().backgroundTasks["bg-3"]?.pending).toBeNull();
    expect(document.title).toBe("OWL");
  });

  it("clearBackgroundNotice drops the badge", () => {
    const store = useAppStore.getState();
    store.watchBackgroundTasks([{ id: "bg-4" }]);
    handlers.get("bg-4")?.("task.failed", {});
    expect(document.title).toBe("(1) OWL");
    store.clearBackgroundNotice("bg-4");
    expect(document.title).toBe("OWL");
  });
});
