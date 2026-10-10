/**
 * Typed HTTP client for the OWL Python service.
 * Mirrors services/agent/app/models.py. Mock stays default; this client is
 * the incremental replacement path (health first, tasks next).
 */

export interface HealthRead {
  status: string;
  version: string;
  provider: string;
  provider_configured: boolean;
  approvals_enforced: boolean;
}

export interface TaskRead {
  id: string;
  prompt: string;
  project: string;
  status:
    | "created" | "running" | "awaiting_approval" | "paused"
    | "completed" | "failed" | "cancelled";
  progress: number;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ApprovalRead {
  id: string;
  title: string;
  kind: "files" | "command" | "privileged";
  command: string | null;
  files: string[];
  reason: string;
  risk: "Low" | "Medium" | "High";
  action: string;
  args_hash: string;
  scope: string;
  targets: string[];
  expires_at: string | null;
  consumed_at: string | null;
  status: "pending" | "approved" | "rejected" | "expired";
  decided_by: string;
  created_at: string;
  decided_at: string | null;
}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface ProviderRead {
  name: string;
  configured: boolean;
  model: string;
}

export interface VerifyRead {
  ok: boolean;
  provider: string;
  model: string;
  error: string;
  code: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ModelEntry {
  id: string;
  context_window: number | null;
  context_source: string;
  capabilities: string[];
  status: "available" | "verified" | "untested" | "unavailable" | "deprecated";
  last_seen: string;
  updated_at: string;
}

export interface RouteRead {
  model: string;
  reason: string;
  category: string;
}

export interface BudgetReport {
  model: string;
  limit: number;
  limit_source: string;
  used: number;
  reserved: number;
  available: number;
  utilization: number;
  over_budget: boolean;
  compress_at: number;
  should_compress: boolean;
  parts: { category: string; tokens: number }[];
}

export interface MemoryRow {
  id: string;
  category: "global" | "project" | "task" | "knowledge";
  project: string;
  text: string;
  confirmed: number;
  enabled: number;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface UsageRow {
  id: number;
  task_id: string;
  model: string;
  requested_model: string;
  routing_reason: string;
  input_tokens: number;
  output_tokens: number;
  estimated: number;
  duration_ms: number;
  retries: number;
  error: string;
  created_at: string;
}

export interface BackendTask {
  id: string;
  prompt: string;
  project: string;
  status: string;
  progress: number;
  message_count: number;
  model: string;
  routing: string;
  created_at: string;
  updated_at: string;
}

const BASE = (import.meta.env.VITE_OWL_SERVICE_URL as string | undefined) ?? "http://127.0.0.1:8000";

function query(params: Record<string, string>): string {
  const q = Object.entries(params).filter(([, v]) => v).map(
    ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`,
  );
  return q.length ? `?${q.join("&")}` : "";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let code = "http_error";
    let detail = `request failed with ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
      if (typeof body?.code === "string") code = body.code;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, code, detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  baseUrl: BASE,
  health: (signal?: AbortSignal) => request<HealthRead>("/health", { signal }),
  provider: () => request<ProviderRead>("/provider"),
  verifyProvider: () =>
    request<VerifyRead>("/provider/verify", { method: "POST" }),
  providerModels: () => request<{ models: string[] }>("/provider/models"),
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
  cancelBackendTask: (id: string) => request<BackendTask>(`/tasks/${id}/cancel`, { method: "POST" }),
  checkpoints: (taskId: string) =>
    request<{ id: string; label: string; state: Record<string, unknown>; created_at: string }[]>(`/tasks/${taskId}/checkpoints`),
  taskDetail: (taskId: string) =>
    request<{
      task: BackendTask;
      steps: { title: string; status: string }[];
      tool_calls: { id: string; tool: string; status: string; exit_code: number | null; duration_ms: number; output_excerpt: string; created_at: string }[];
      checkpoints: { id: string; label: string; created_at: string }[];
      usage: UsageRow[];
    }>(`/tasks/${taskId}/detail`),
  revertJournal: (taskId: string, journalId: string) =>
    request<{ journal_id: string; path: string }>(`/tasks/${taskId}/revert`, {
      method: "POST", body: JSON.stringify({ journal_id: journalId }),
    }),
  workspaces: () => request<{ roots: string[] }>("/workspaces"),
  browserCapture: (url: string, width = 1440, shot = false) =>
    request<{ url: string; title: string; text: string; screenshot?: string }>(
      "/browser/capture", { method: "POST", body: JSON.stringify({ url, width, shot }) },
    ),
  shotUrl: (name: string) => `${BASE}/shots/${name}`,
  usage: (taskId = "") => request<UsageRow[]>(`/usage${taskId ? `?task_id=${encodeURIComponent(taskId)}` : ""}`),
  chat: (messages: ChatMessage[]) =>
    request<{ reply: string; model: string }>("/chat", {
      method: "POST",
      body: JSON.stringify({ messages }),
    }),
  /** Streams live reply deltas. Returns a cancel function. */
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
        const res = await fetch(`${BASE}/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages, model }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          onError("http_error", `Chat stream failed (${res.status}).`);
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
                /* partial chunk, keep buffering */
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
  tasks: () => request<TaskRead[]>("/tasks"),
  createTask: (prompt: string, project = "") =>
    request<TaskRead>("/tasks", {
      method: "POST",
      body: JSON.stringify({ prompt, project }),
    }),
  cancelTask: (id: string) => request<TaskRead>(`/tasks/${id}/cancel`, { method: "POST" }),
  approvals: (taskId: string) => request<ApprovalRead[]>(`/tasks/${taskId}/approvals`),
  decide: (taskId: string, approvalId: string, approved: boolean, by = "local-user") =>
    request<ApprovalRead>(`/tasks/${taskId}/approvals/${approvalId}/decision`, {
      method: "POST",
      body: JSON.stringify({ approved, by }),
    }),
  /** Server-sent event stream for one task. Caller closes via the returned function. */
  events: (taskId: string, onEvent: (type: string, data: unknown) => void): (() => void) => {
    const source = new EventSource(`${BASE}/tasks/${taskId}/events`);
    source.onmessage = () => {};
    source.addEventListener("snapshot", () => {});
    const types = [
      "task.started", "task.progress", "message", "approval.requested",
      "approval.decided", "task.awaiting_approval", "task.paused", "task.resumed",
      "task.cancelled", "task.completed", "task.failed", "snapshot",
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
    return () => source.close();
  },
};
