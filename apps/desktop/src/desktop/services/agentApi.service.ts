import {
  SERVICE_BASE_URL, buildEventStreamUrl, fetchFromService, loadServiceImageAsObjectUrl, requestServiceJson,
} from "./connection/serviceRequest.service";
import type { ApprovalRead, BackendTask, BudgetReport, ChatMessage, CommandRow, CommitMessageDraft, DataStatus, FileSaveResult, GitBranches, GitSummary, HealthRead, JournalRow, LocalRunner, MemoryHistoryRow, MemoryRow, ModelEntry, OnboardingRead, OnboardingStep, Project, ProjectCreateRead, ProjectFileContent, ProjectListRead, ProjectTree, ProviderActivation, ProviderCard, ProviderCardsRead, ProviderModelsRead, ProviderRead, ProviderTestRead, RouteRead, SearchResponse, SecurityStatusRead, StackCatalogRead, StackRecommendRead, TaskDetail, ToolRead, UsageRow, UserProfile, UserProfileRead, VerifyRead } from "./agentApi.types";

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
  sendBackendTaskMessage: (id: string, text: string) =>
    request<{ id: string; role: string; text: string; created_at: string }>(`/tasks/${id}/messages`, {
      method: "POST", body: JSON.stringify({ role: "user", text }),
    }),
  listProjects: () => request<ProjectListRead>("/projects"),
  createProject: (path: string, name = "") =>
    request<ProjectCreateRead>("/projects", { method: "POST", body: JSON.stringify({ path, name }) }),
  getProject: (id: string) => request<{ project: Project }>(`/projects/${encodeURIComponent(id)}`),
  updateProject: (id: string, fields: { name?: string | null; opened?: boolean }) =>
    request<{ project: Project }>(`/projects/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(fields) }),
  forgetProject: (id: string) =>
    request<{ forgotten: boolean; id: string; path: string; files_deleted: boolean }>(`/projects/${encodeURIComponent(id)}`, { method: "DELETE" }),
  projectTree: (id: string, path = "") => request<ProjectTree>(`/projects/${encodeURIComponent(id)}/tree${query({ path })}`),
  projectFile: (id: string, path: string) => request<ProjectFileContent>(`/projects/${encodeURIComponent(id)}/file${query({ path })}`),
  saveProjectFile: (id: string, body: { path: string; content: string; base_sha256?: string | null; create?: boolean }) =>
    request<FileSaveResult>(`/projects/${encodeURIComponent(id)}/file`, { method: "PUT", body: JSON.stringify(body) }),
  searchProject: (id: string, q: string, limit = 50) =>
    request<SearchResponse>(`/projects/${encodeURIComponent(id)}/search${query({ q, limit: String(limit) })}`),
  gitSummary: (id: string) => request<GitSummary>(`/projects/${encodeURIComponent(id)}/git`),
  gitBranches: (id: string) => request<GitBranches>(`/projects/${encodeURIComponent(id)}/git/branches`),
  createGitBranch: (id: string, name: string, checkout = true) =>
    request<Record<string, unknown>>(`/projects/${encodeURIComponent(id)}/git/branches`, { method: "POST", body: JSON.stringify({ name, checkout }) }),
  checkoutGitRef: (id: string, ref: string, confirmDiscard = false) =>
    request<Record<string, unknown>>(`/projects/${encodeURIComponent(id)}/git/checkout`, { method: "POST", body: JSON.stringify({ ref, confirm_discard: confirmDiscard }) }),
  generateCommitMessage: (id: string) =>
    request<CommitMessageDraft>(`/projects/${encodeURIComponent(id)}/git/commit-message`, { method: "POST" }),
  gitCommit: (id: string, files: string[], message: string) =>
    request<Record<string, unknown>>(`/projects/${encodeURIComponent(id)}/git/commit`, { method: "POST", body: JSON.stringify({ files, message }) }),
  gitPush: (id: string, body: { remote?: string; branch?: string; confirm: boolean }) =>
    request<{ pushed: boolean; branch: string; remote: string; ahead: number; behind: number }>(`/projects/${encodeURIComponent(id)}/git/push`, { method: "POST", body: JSON.stringify(body) }),
  gitPull: (id: string, body: { remote?: string; branch?: string; confirm: boolean }) =>
    request<{ pulled: boolean; branch: string; remote: string; ahead: number; behind: number }>(`/projects/${encodeURIComponent(id)}/git/pull`, { method: "POST", body: JSON.stringify(body) }),
  gitSync: async (id: string, body: { remote?: string; branch?: string; confirm: boolean }) => {
    const pulled = await request<{ pulled: boolean; branch: string; remote: string; ahead: number; behind: number }>(`/projects/${encodeURIComponent(id)}/git/pull`, { method: "POST", body: JSON.stringify(body) });
    const pushed = await request<{ pushed: boolean; branch: string; remote: string; ahead: number; behind: number }>(`/projects/${encodeURIComponent(id)}/git/push`, { method: "POST", body: JSON.stringify(body) });
    return { pulled, pushed };
  },
  commandHistory: (id: string, limit = 50) =>
    request<{ commands: CommandRow[] }>(`/projects/${encodeURIComponent(id)}/commands${query({ limit: String(limit) })}`),
  dataStatus: () => request<DataStatus>("/data/status"),
  backupData: () => request<{ backup: unknown; backups: unknown[] }>("/data/backup", { method: "POST" }),
  exportDataResponse: () => fetchFromService("/data/export"),
  importData: (body: { path?: string; archive_base64?: string }) =>
    request<{ imported: boolean; schema_version: number; exported_at: string }>("/data/import", { method: "POST", body: JSON.stringify(body) }),
  resetData: (confirmation: string) =>
    request<{ reset: boolean; cleared_rows: Record<string, number>; screenshots_removed: number }>("/data/reset", { method: "POST", body: JSON.stringify({ confirmation }) }),
  runProjectCommand: (
    projectId: string,
    body: { command: string; cwd?: string; confirm_high_risk?: boolean; allow_network?: boolean },
    handlers: {
      onStarted?: (data: Record<string, unknown>) => void;
      onOutput?: (stream: string, text: string) => void;
      onCompleted?: (data: Record<string, unknown>) => void;
      onError: (code: string, detail: string, data: Record<string, unknown>) => void;
    },
  ): (() => void) => {
    const ctrl = new AbortController();
    void (async () => {
      let res: Response;
      try {
        res = await fetchFromService(`/projects/${encodeURIComponent(projectId)}/commands`, {
          method: "POST", body: JSON.stringify(body), signal: ctrl.signal,
        });
      } catch (e) {
        if ((e as Error).name !== "AbortError") handlers.onError("network_error", "Couldn't reach the OWL service.", {});
        return;
      }
      if (!res.ok || !res.body) {
        const payload = (await res.json().catch(() => null)) as { code?: string; detail?: string } | null;
        handlers.onError(payload?.code ?? "http_error", payload?.detail ?? `Command failed (${res.status}).`, (payload as Record<string, unknown>) ?? {});
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      try {
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
            let parsed: Record<string, unknown> = {};
            try { parsed = JSON.parse(data) as Record<string, unknown>; } catch { parsed = {}; }
            if (ev === "command.started") handlers.onStarted?.(parsed);
            else if (ev === "command.output") handlers.onOutput?.(String(parsed.stream ?? "stdout"), String(parsed.text ?? ""));
            else if (ev === "command.completed") handlers.onCompleted?.(parsed);
            else if (ev === "command.error") handlers.onError(String(parsed.code ?? "error"), String(parsed.detail ?? "Command failed."), parsed);
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") handlers.onError("network_error", "The command stream disconnected.", {});
      }
    })();
    return () => ctrl.abort();
  },
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
  stacks: () => request<StackCatalogRead>("/stacks"),
  recommendStack: (description: string, constraints?: string) =>
    request<StackRecommendRead>("/stacks/recommend", {
      method: "POST",
      body: JSON.stringify(
        constraints?.trim()
          ? { description, constraints: { team_experience: constraints.trim() } }
          : { description },
      ),
    }),
  providers: () => request<ProviderCardsRead>("/providers"),
  localProviders: () => request<{ runners: LocalRunner[] }>("/providers/local"),
  setActiveProvider: (providerId: string, model?: string) =>
    request<ProviderActivation>("/providers/active", {
      method: "PUT", body: JSON.stringify({ provider_id: providerId, model: model ?? null }),
    }),
  saveProviderKey: (providerId: string, key: string) =>
    request<ProviderCard>(`/providers/${encodeURIComponent(providerId)}/key`, { method: "PUT", body: JSON.stringify({ key }) }),
  deleteProviderKey: (providerId: string) =>
    request<ProviderCard>(`/providers/${encodeURIComponent(providerId)}/key`, { method: "DELETE" }),
  updateProviderSettings: (providerId: string, fields: { base_url?: string; model?: string; server_fallbacks?: boolean }) =>
    request<ProviderCard>(`/providers/${encodeURIComponent(providerId)}/settings`, { method: "PUT", body: JSON.stringify(fields) }),
  testProvider: (providerId: string, probe: { key?: string; base_url?: string } = {}) =>
    request<ProviderTestRead>(`/providers/${encodeURIComponent(providerId)}/test`, { method: "POST", body: JSON.stringify(probe) }),
  providerModels: (providerId: string) =>
    request<ProviderModelsRead>(`/providers/${encodeURIComponent(providerId)}/models`),
  profile: () => request<UserProfileRead>("/profile"),
  saveProfile: (profile: Partial<UserProfile>) => request<UserProfileRead>("/profile", { method: "PUT", body: JSON.stringify(profile) }),
  onboarding: () => request<OnboardingRead>("/onboarding"),
  saveOnboarding: (state: { step: OnboardingStep; completed: boolean; skipped_steps: string[] }) =>
    request<OnboardingRead>("/onboarding", { method: "PUT", body: JSON.stringify(state) }),
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
