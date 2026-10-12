import { agentApi } from "../services/agentApi.service";
import type { ApprovalRead, GitChange } from "../services/agentApi.types";
import type { ActEvent, AgentStatus, Approval, ChangeFile, ChatMsg, TermLine } from "./workspace.types";

export interface TaskEngineHost {
  appendChat: (message: Omit<ChatMsg, "id">) => void;
  appendTerminal: (line: Omit<TermLine, "id">) => void;
  setSteps: (events: ActEvent[]) => void;
  getSteps: () => ActEvent[];
  setApprovals: (list: Approval[]) => void;
  setChanges: (list: ChangeFile[]) => void;
  setStatus: (status: AgentStatus) => void;
  setProgress: (progress: number) => void;
  getTaskId: () => string | null;
  getProjectId: () => string | null;
  notice: (text: string) => void;
}

const RISK_LABELS: Record<string, Approval["risk"]> = { Low: "Low", Medium: "Medium", High: "High" };

export function mapApprovalRow(row: ApprovalRead): Approval {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    command: row.command ?? undefined,
    reason: row.reason,
    risk: RISK_LABELS[row.risk] ?? "Low",
    files: row.files,
    status: row.status === "approved" ? "approved" : row.status === "rejected" ? "rejected" : "pending",
  };
}

function statusFromGitChange(change: GitChange): ChangeFile["status"] {
  if (change.status === "added" || change.status === "untracked") return "A";
  if (change.status === "deleted") return "D";
  return "M";
}

export async function refreshApprovals(host: TaskEngineHost): Promise<void> {
  const taskId = host.getTaskId();
  if (!taskId) return;
  try {
    const rows = await agentApi.approvals(taskId);
    host.setApprovals(rows.map(mapApprovalRow));
  } catch {
    host.setApprovals([]);
  }
}

export async function refreshChanges(host: TaskEngineHost): Promise<void> {
  const projectId = host.getProjectId();
  if (!projectId) return;
  try {
    const git = await agentApi.gitSummary(projectId);
    if (!git.is_repo) {
      host.setChanges([]);
      return;
    }
    host.setChanges(
      git.changed.map((change) => ({ path: change.path, status: statusFromGitChange(change), before: "", after: "" })),
    );
  } catch {
    host.setChanges([]);
  }
}

function updateStep(host: TaskEngineHost, title: string, state: ActEvent["state"], detail?: string): void {
  const steps = host.getSteps();
  const index = steps.findIndex((step) => step.label === title);
  if (index < 0) {
    host.setSteps([...steps, { id: `${title}-${steps.length}`, label: title, state, detail }]);
    return;
  }
  const next = steps.slice();
  next[index] = { ...next[index], state, detail: detail ?? next[index].detail };
  host.setSteps(next);
}

const TERMINAL_STATUS_KIND: Record<string, TermLine["kind"]> = { ok: "ok", error: "err", refused: "err" };

export function applyTaskEvent(type: string, payload: unknown, host: TaskEngineHost): void {
  const data = (payload ?? {}) as Record<string, unknown>;
  if (type === "message") {
    const role = String(data.role ?? "assistant");
    const text = String(data.text ?? "");
    if (!text) return;
    host.appendChat({ from: role === "user" ? "you" : role === "system" ? "sys" : "owl", text });
    return;
  }
  if (type === "step.added" || type === "step.started" || type === "step.done" || type === "step.failed") {
    const title = String(data.title ?? "");
    if (!title) return;
    if (type === "step.added") updateStep(host, title, "queued");
    else if (type === "step.started") updateStep(host, title, "active");
    else if (type === "step.done") updateStep(host, title, "done");
    else updateStep(host, title, "done", String(data.reason ?? "failed"));
    return;
  }
  if (type === "tool.result") {
    const tool = String(data.tool ?? "tool");
    const status = String(data.status ?? "");
    const excerpt = String(data.output_excerpt ?? data.detail ?? "");
    host.appendTerminal({ kind: TERMINAL_STATUS_KIND[status] ?? "agent", text: `${tool}${status ? ` · ${status}` : ""}${excerpt ? `: ${excerpt}` : ""}` });
    return;
  }
  if (type === "approval.requested") {
    host.setStatus("awaiting");
    void refreshApprovals(host);
    host.notice("OWL needs your approval");
    return;
  }
  if (type === "approval.decided") {
    void refreshApprovals(host);
    void refreshChanges(host);
    return;
  }
  if (type === "task.awaiting_approval") {
    host.setStatus("awaiting");
    void refreshApprovals(host);
    return;
  }
  if (type === "task.started" || type === "task.resumed") {
    host.setStatus("working");
    return;
  }
  if (type === "task.paused") {
    host.setStatus("paused");
    if (data.reason) host.notice(String(data.reason));
    return;
  }
  if (type === "task.cancelled") {
    host.setStatus("stopped");
    return;
  }
  if (type === "task.failed") {
    host.setStatus("stopped");
    if (data.reason) host.appendChat({ from: "sys", text: `Task failed: ${String(data.reason)}` });
    return;
  }
  if (type === "task.completed" || type === "verification.completed") {
    host.setStatus("done");
    host.setProgress(100);
    void refreshChanges(host);
    return;
  }
  if (type === "task.progress" && typeof data.progress === "number") {
    host.setProgress(data.progress as number);
  }
}

export function statusFromSnapshot(status: string): AgentStatus {
  if (status === "running") return "working";
  if (status === "awaiting_approval") return "awaiting";
  if (status === "paused") return "paused";
  if (status === "failed" || status === "cancelled") return "stopped";
  if (status.startsWith("completed") || status === "verified_completed") return "done";
  return "idle";
}
