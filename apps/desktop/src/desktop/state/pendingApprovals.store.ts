import { create } from "zustand";
import { useAppStore } from "./app.store";
import { agentApi } from "../services/agentApi.service";
import { type ApprovalRead } from "../services/agentApi.types";

type Decision = { status: "approved" | "rejected"; at: string };
export const pendingApprovalKey = (taskId: string, approvalId: string) => `${taskId}:${approvalId}`;

interface PendingState {
  keys: string[];
  decided: Record<string, Decision>;
  refresh: () => Promise<void>;
  markDecided: (key: string, d: Decision) => void;
}

export const usePendingApprovalsStore = create<PendingState>((set, get) => ({
  keys: [],
  decided: {},
  refresh: async () => {
    const tasks = await agentApi.backendTasks().catch(() => []);
    const lists = await Promise.all(
      tasks.map(async (t) => {
        const rows: ApprovalRead[] = await agentApi.approvals(t.id).catch(() => [] as ApprovalRead[]);
        return rows.filter((a) => a.status === "pending").map((a) => pendingApprovalKey(t.id, a.id));
      }),
    );
    const decided = get().decided;
    set({ keys: lists.flat().filter((k) => !decided[k]) });
  },
  markDecided: (key, d) =>
    set((s) => ({ decided: { ...s.decided, [key]: d }, keys: s.keys.filter((k) => k !== key) })),
}));

let timer: ReturnType<typeof setInterval> | null = null;

export function startPendingApprovalsSync() {
  if (timer) return;
  const run = () => { usePendingApprovalsStore.getState().refresh().catch(() => {}); };
  run();
  timer = setInterval(run, 15000);
  window.addEventListener("focus", run);
}

export function usePendingApprovalCount(): number {
  const localCount = useAppStore((s) => s.approvals.filter((a) => a.status === "pending").length);
  const backendCount = usePendingApprovalsStore((s) => s.keys.length);
  return localCount + backendCount;
}
