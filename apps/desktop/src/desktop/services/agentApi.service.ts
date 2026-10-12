import {
  SERVICE_BASE_URL, buildEventStreamUrl, fetchFromService, loadServiceImageAsObjectUrl, requestServiceJson,
} from "./connection/serviceRequest.service";
import type { ApprovalRead, BackendTask, BudgetReport, ChatMessage, HealthRead, JournalRow, MemoryHistoryRow, MemoryRow, ModelEntry, ProviderRead, RouteRead, SecurityStatusRead, TaskDetail, ToolRead, UsageRow, VerifyRead } from "./agentApi.types";

export { ApiError, isServiceAuthError } from "./connection/serviceRequest.service";

const request = requestServiceJson;

function query(params: Record<string, string>): string {
  const q = Object.entries(params).filter(([, v]) => v).map(
    ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`,
  );
  return q.length ? `?${q.join("&")}` : "";
}

export const agentApi = {
  baseUrl: SERVICE_BASE_URL,
  health: (signal?: AbortSignal) => request<HealthRead>("/health", { signal }),
  provider: () => request<ProviderRead>("/provider"),
  verifyProvider: () =>
    request<VerifyRead>("/provider/verify", { method: "POST" }),
  registry: () => request<{ models: ModelEntry[] }>("/models"),
  refreshRegistry: () => request<{ added: number; deprecated: number; total: number }>("/models/refresh", { method: "POST" }),
  validateModel: (id: string) =>
    request<{ id: string; status: string; error?: string }>(`/models/${encodeURIComponent(id)}/validate`, { method: "POST" }),
  route: (prompt: string, model = "auto") =>
    request<RouteRead>("/route", { method: "POST", body: JSON.stringify({ prompt, model }) }),
  budget: (model: string, parts: { category: string; text: string }[]) =>
    request<BudgetReport>("/context/budget", { method: "POST", body: JSON.stringify({ model, parts }) }),
  compressions: (taskId = "") =>
    request<{ id: number; task_id: string; level: number; before_tokens: number; after_tokens: number; summary: string; created_at: string }[]>(
      `/context/compressions${taskId ? `?task_id=${encodeURIComponent(taskId)}` : ""}`,
    ),
  memories: (category = "", project = "") =>
    request<MemoryRow[]>(`/memory${query({ category, project })}`),
  searchMemories: (q: string, project = "") =>
    request<MemoryRow[]>(`/memory/search${query({ q, project })}`),
  saveMemory: (category: string, text: string, project = "", confirmed = true) =>
    request<{ saved: boolean; memory?: MemoryRow; reason?: string }>("/memory", {
      method: "POST", body: JSON.stringify({ category, text, project, confirmed }),
    }),
  updateMemory: (id: string, text: string) => request<MemoryRow>(`/memory/${id}`, { method: "PATCH", body: JSON.stringify({ text }) }),
  deleteMemory: (id: string) => request<{ deleted: boolean }>(`/memory/${id}`, { method: "DELETE" }),
  setMemoryEnabled: (id: string, enabled: boolean) =>
    request<Record<string, boolean>>(`/memory/${id}/${enabled ? "enable" : "disable"}`, { method: "POST" }),
  clearProjectMemory: (project: string) =>
    request<{ cleared: number }>("/memory/clear-project", { method: "POST", body: JSON.stringify({ project }) }),
  maintainMemory: (project = "") =>
    request<{ scanned: number; merged: number }>("/memory/maintain", { method: "POST", body: JSON.stringify({ project }) }),
  backendTasks: () => request<BackendTask[]>("/tasks"),
  createBackendTask: (prompt: string, project: string, workspace: string, model = "auto") =>
    request<BackendTask>("/tasks", { method: "POST", body: JSON.stringify({ prompt, project, workspace, model }) }),
  resumeBackendTask: (id: string) => request<BackendTask>(`/tasks/${id}/resume`, { method: "POST" }),
  pauseBackendTask: (id: string) => request<BackendTask>(`/tasks/${id}/pause`, { method: "POST" }),
  journal: (taskId: string) => request<JournalRow[]>(`/tasks/${taskId}/journal`),
  tools: () => request<ToolRead[]>("/tools"),
  memoryHistory: () => request<MemoryHistoryRow[]>("/memory/history"),
  cancelBackendTask: (id: string) => request<BackendTask>(`/tasks/${id}/cancel`, { method: "POST" }),
  checkpoints: (taskId: string) =>
    request<{ id: string; label: string; state: Record<string, unknown>; created_at: string }[]>(`/tasks/${taskId}/checkpoints`),
  taskDetail: (taskId: string) => request<TaskDetail>(`/tasks/${taskId}/detail`),
  revertJournal: (taskId: string, journalId: string) =>
    request<{ journal_id: string; path: string }>(`/tasks/${taskId}/revert`, {
      method: "POST", body: JSON.stringify({ journal_id: journalId }),
    }),
  workspaces: () => request<{ roots: string[] }>("/workspaces"),
  browserCapture: (url: string, width = 1440, shot = false) =>
    request<{ url: string; title: string; text: string; screenshot?: string }>(
      "/browser/capture", { method: "POST", body: JSON.stringify({ url, width, shot }) },
    ),
  loadScreenshotObjectUrl: (name: string) => loadServiceImageAsObjectUrl(`/shots/${encodeURIComponent(name)}`),
  securityStatus: () => request<SecurityStatusRead>("/security/status"),
  usage: (taskId = "") => request<UsageRow[]>(`/usage${taskId ? `?task_id=${encodeURIComponent(taskId)}` : ""}`),
  streamChat: (
    messages: ChatMessage[],
    model: string,
    onDelta: (text: string) => void,
    onDone: (text: string, info: { model: string; routing: string; usage: { input: number; output: number; estimated: boolean } }) => void,
    onError: (code: string, message: string) => void,
  ): (() => void) => {
    const ctrl = new AbortController();
    void (async () => {
      try {
        const res = await fetchFromService("/chat/stream", {
          method: "POST",
          body: JSON.stringify({ messages, model }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          if (res.status === 401) onError("unauthorized", "Can't authenticate with the local OWL service.");
          else onError("http_error", `Chat stream failed (${res.status}).`);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const block = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            let ev = "";
            let data = "";
            for (const line of block.split("\n")) {
              if (line.startsWith("event:")) ev = line.slice(6).trim();
              else if (line.startsWith("data:")) data += line.slice(5).trim();
            }
            if (ev === "chat.delta") {
              try {
                onDelta((JSON.parse(data) as { text: string }).text ?? "");
              } catch {
                              }
            } else if (ev === "chat.done") {
              try {
                const done = JSON.parse(data) as {
                  text: string; model: string; routing?: string;
                  usage?: { input: number; output: number; estimated: boolean };
                };
                onDone(done.text ?? "", {
                  model: done.model ?? "",
                  routing: done.routing ?? "",
                  usage: done.usage ?? { input: 0, output: 0, estimated: true },
                });
              } catch {
                onDone("", { model: "", routing: "", usage: { input: 0, output: 0, estimated: true } });
              }
              return;
            } else if (ev === "chat.error") {
              try {
                const err = JSON.parse(data) as { code: string; message: string };
                onError(err.code ?? "error", err.message ?? "Chat failed.");
              } catch {
                onError("error", "Chat failed.");
              }
              return;
            }
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") onError("network_error", "Chat stream disconnected.");
      }
    })();
    return () => ctrl.abort();
  },
  approvals: (taskId: string) => request<ApprovalRead[]>(`/tasks/${taskId}/approvals`),
  decide: (taskId: string, approvalId: string, approved: boolean, by = "local-user") =>
    request<ApprovalRead>(`/tasks/${taskId}/approvals/${approvalId}/decision`, {
      method: "POST",
      body: JSON.stringify({ approved, by }),
    }),
  events: (taskId: string, onEvent: (type: string, data: unknown) => void): (() => void) => {
    let source: EventSource | null = null;
    let closed = false;
    void buildEventStreamUrl(`/tasks/${taskId}/events`).then((streamUrl) => {
      if (closed) return;
      source = new EventSource(streamUrl);
      listenToTaskEvents(source, onEvent);
    });
    return () => {
      closed = true;
      source?.close();
    };
  },
};

function listenToTaskEvents(source: EventSource, onEvent: (type: string, data: unknown) => void): void {
  const types = [
    "task.started", "task.progress", "message", "approval.requested",
    "approval.decided", "task.awaiting_approval", "task.paused", "task.resumed",
    "task.cancelled", "task.completed", "task.failed", "snapshot",
    "step.started", "step.done", "step.failed", "step.added", "tool.result", "checkpoint.created",
    "verification.started", "verification.requirement.started",
    "verification.requirement.completed", "verification.failed", "verification.completed",
  ];
  for (const t of types) {
    source.addEventListener(t, (e) => {
      try {
        onEvent(t, JSON.parse((e as MessageEvent).data));
      } catch {
        onEvent(t, {});
      }
    });
  }
}
