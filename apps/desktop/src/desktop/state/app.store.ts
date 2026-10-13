import { create } from "zustand";
import type { AppState, CommandRunOptions } from "./appState.types";
import type { Project } from "./workspace.types";
import { readStoredFlag, readStoredValue, writeStoredFlag, writeStoredValue } from "../../shared/helpers/storage.helper";
import { agentApi } from "../services/agentApi.service";
import { ApiError } from "../services/connection/serviceRequest.service";
import {
  applyTaskEvent, mapApprovalRow, refreshApprovals, refreshChanges, statusFromSnapshot, type TaskEngineHost,
} from "./workspaceTaskEngine";

let idCounter = 0;
const createUniqueId = (prefix: string) => `${prefix}-${++idCounter}-${Date.now() % 100000}`;

function welcomeChat(project: Project): { id: string; from: "sys"; text: string }[] {
  const languages = project.stack?.languages ?? [];
  const stackNote = languages.length ? ` Detected ${languages.join(", ")}.` : "";
  return [{
    id: createUniqueId("m"),
    from: "sys",
    text: `Opened ${project.name}.${stackNote} Describe a task — OWL plans it, shows every change as a diff, and waits for your approval.`,
  }];
}

export const useAppStore = create<AppState>((set, get) => {
  const host = (): TaskEngineHost => ({
    appendChat: (message) => get().appendChat(message),
    appendTerminal: (line) => get().appendTerminalLine(line),
    setSteps: (agentEvents) => set({ agentEvents }),
    getSteps: () => get().agentEvents,
    setApprovals: (approvals) => set({ approvals, agentStatus: approvals.some((a) => a.status === "pending") ? "awaiting" : get().agentStatus }),
    setChanges: (changes) => set({ changes }),
    setStatus: (agentStatus) => set({ agentStatus }),
    setProgress: (agentStep) => set({ agentStep }),
    getTaskId: () => get().taskId,
    getProjectId: () => get().project?.id ?? null,
    notice: (notice) => set({ notice }),
  });

  const reportSendError = (error: unknown) => {
    if (error instanceof ApiError && error.code === "provider_not_configured") {
      set({ needsProvider: true, agentStatus: "idle" });
      return;
    }
    const message = error instanceof Error ? error.message : "the local service is unreachable";
    set((s) => ({ agentStatus: "idle", chat: [...s.chat, { id: createUniqueId("m"), from: "sys", text: `Couldn't reach OWL: ${message}` }] }));
  };

  const runCommandWithOptions = (command: string, options: CommandRunOptions) => {
    const project = get().project;
    if (!project) return;
    set({ terminalBusy: true });
    agentApi.runProjectCommand(project.id, { command, ...options }, {
      onOutput: (stream, text) =>
        get().appendTerminalLine({ kind: stream === "stderr" ? "err" : "out", text: text.replace(/\n+$/, "") }),
      onCompleted: (data) => {
        const exit = Number(data.exit_code ?? 0);
        set({ terminalBusy: false });
        get().appendTerminalLine({ kind: exit === 0 ? "ok" : "err", text: `exit ${exit}${data.truncated ? " (output truncated)" : ""}` });
      },
      onError: (code, detail, data) => {
        set({ terminalBusy: false });
        if (code === "confirmation_required") {
          get().askForConfirmation({
            title: "Run this high-risk command?",
            body: `${detail}${data.reason ? ` — ${String(data.reason)}` : ""} It runs in the project sandbox.`,
            confirmLabel: "Run it",
            run: () => runCommandWithOptions(command, { ...options, confirm_high_risk: true }),
          });
          return;
        }
        if (code === "network_confirmation_required") {
          get().askForConfirmation({
            title: "Allow network access?",
            body: `${detail} Only allow it if you trust this command.`,
            confirmLabel: "Allow network",
            run: () => runCommandWithOptions(command, { ...options, allow_network: true }),
          });
          return;
        }
        get().appendTerminalLine({ kind: "err", text: code === "command_refused" ? `refused: ${detail}` : detail });
      },
    });
  };

  return {
    screen: "welcome",
    project: null,
    centerTab: "chat",
    filePanelSection: "files",
    inspectorTab: "agent",
    terminalOpen: true,
    filePanelOpen: true,
    inspectorOpen: true,
    commandPaletteOpen: false,
    askOwlOpen: false,
    createProjectOpen: false,
    confirm: null,
    taskFilter: "all",
    openTaskId: null,
    openBackendTaskId: null,
    agentStatus: "idle",
    agentStep: 0,
    agentEvents: [],
    approvals: [],
    changes: [],
    chat: [],
    terminal: [],
    draft: "",
    notice: null,
    preferredModel: readStoredValue("owl-model") ?? "auto",
    taskId: null,
    needsProvider: false,
    terminalBusy: false,
    filePanelWidth: 264,
    inspectorWidth: 320,
    terminalHeight: 216,
    openFilePath: "",
    shortcutsOpen: false,
    sidebarCollapsedPreference: readStoredFlag("owl-sb-collapsed", false),
    sidebarExpandedInWorkspace: readStoredFlag("owl-sb-ws-expanded", false),
    terminalTab: "agent",
    editorTabs: [],
    cancelTaskStream: null,

    goToScreen: (screen) => set({ screen, commandPaletteOpen: false, askOwlOpen: false }),
    openProject: (project) => {
      get().cancelTaskStream?.();
      set({
        project, screen: "workspace", centerTab: "chat", taskId: null, needsProvider: false,
        chat: welcomeChat(project), terminal: [], agentEvents: [], approvals: [], changes: [],
        agentStatus: "idle", agentStep: 0, openFilePath: "", editorTabs: [], cancelTaskStream: null,
      });
      void agentApi.updateProject(project.id, { opened: true }).catch(() => {});
      void refreshChanges(host());
    },
    setCenterTab: (centerTab) => set({ centerTab }),
    setFilePanelSection: (filePanelSection) => set({ filePanelSection, filePanelOpen: true }),
    setInspectorTab: (inspectorTab) => set({ inspectorTab, inspectorOpen: true }),
    toggleTerminal: () => set((s) => ({ terminalOpen: !s.terminalOpen })),
    toggleFilePanel: () => set((s) => ({ filePanelOpen: !s.filePanelOpen })),
    toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
    setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
    setAskOwlOpen: (askOwlOpen) => set({ askOwlOpen }),
    setCreateProjectOpen: (createProjectOpen) => set({ createProjectOpen }),
    askForConfirmation: (confirm) => set({ confirm }),
    answerConfirmation: (yes) => {
      const c = get().confirm;
      set({ confirm: null });
      if (yes && c) c.run();
    },
    setTaskFilter: (taskFilter) => set({ taskFilter }),
    openTask: (openTaskId) => set({ openTaskId, screen: "task" }),
    openBackendTask: (openBackendTaskId) => set({ openBackendTaskId, screen: "btask" }),
    setDraft: (draft) => set({ draft }),
    setPreferredModel: (preferredModel) => {
      writeStoredValue("owl-model", preferredModel);
      set({ preferredModel });
    },
    sendWorkspaceMessage: () => {
      const text = get().draft.trim();
      const project = get().project;
      if (!text || !project) return;
      get().appendChat({ from: "you", text });
      set({ draft: "", needsProvider: false });
      const taskId = get().taskId;
      if (taskId) {
        set({ agentStatus: "working" });
        agentApi.sendBackendTaskMessage(taskId, text).catch(reportSendError);
        return;
      }
      set({ agentStatus: "working", agentEvents: [], approvals: [] });
      agentApi.createBackendTask(text, project.name, project.path, get().preferredModel)
        .then((task) => {
          set({ taskId: task.id });
          get().attachTaskStream(task.id);
        })
        .catch(reportSendError);
    },
    attachTaskStream: (taskId) => {
      get().cancelTaskStream?.();
      const cancel = agentApi.events(taskId, (type, payload) => {
        if (type === "snapshot") {
          const snapshot = payload as { status: string; progress: number; approvals?: unknown[] };
          set({ agentStatus: statusFromSnapshot(snapshot.status), agentStep: snapshot.progress ?? 0 });
          if (Array.isArray(snapshot.approvals)) {
            set({ approvals: snapshot.approvals.map((row) => mapApprovalRow(row as never)) });
          }
          return;
        }
        applyTaskEvent(type, (payload as { data?: unknown }).data ?? payload, host());
      });
      set({ cancelTaskStream: cancel });
    },
    pauseAgent: () => {
      const taskId = get().taskId;
      if (!taskId) return;
      set({ agentStatus: "paused" });
      agentApi.pauseBackendTask(taskId).catch(() => {});
    },
    resumeAgent: () => {
      const taskId = get().taskId;
      if (!taskId) return;
      set({ agentStatus: "working" });
      agentApi.resumeBackendTask(taskId).catch(() => {});
    },
    stopAgent: () => {
      const taskId = get().taskId;
      set({ agentStatus: "stopped" });
      if (taskId) agentApi.cancelBackendTask(taskId).catch(() => {});
    },
    decideApproval: (id, v) => {
      const taskId = get().taskId;
      set((s) => ({ approvals: s.approvals.map((a) => (a.id === id ? { ...a, status: v } : a)) }));
      if (!taskId) return;
      agentApi.decide(taskId, id, v === "approved")
        .then(() => { void refreshApprovals(host()); void refreshChanges(host()); })
        .catch(() => set({ notice: "Couldn't record the decision. Is the service running?" }));
    },
    appendChat: (message) => set((s) => ({ chat: [...s.chat, { ...message, id: createUniqueId("m") }] })),
    appendTerminalLine: (l) => set((s) => ({ terminal: [...s.terminal, { ...l, id: createUniqueId("t") }] })),
    showNotice: (notice) => set({ notice }),
    setFilePanelWidth: (width) => set({ filePanelWidth: Math.min(480, Math.max(180, width)) }),
    setInspectorWidth: (width) => set({ inspectorWidth: Math.min(520, Math.max(220, width)) }),
    setTerminalHeight: (height) => set({ terminalHeight: Math.min(560, Math.max(120, height)) }),
    openFile: (openFilePath) => set({ openFilePath, centerTab: "code" }),
    runTerminalCommand: (cmd, options = {}) => {
      const command = cmd.trim();
      const project = get().project;
      if (!command || !project || get().terminalBusy) return;
      get().appendTerminalLine({ kind: "cmd", text: `$ ${command}` });
      runCommandWithOptions(command, options);
    },
    startNewTask: () => {
      get().cancelTaskStream?.();
      const project = get().project;
      set({
        taskId: null, needsProvider: false, agentStatus: "idle", agentStep: 0, agentEvents: [],
        approvals: [], changes: [], cancelTaskStream: null, centerTab: "chat", screen: project ? "workspace" : "welcome",
        chat: project ? welcomeChat(project) : [],
      });
    },
    setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
    setSidebarCollapsedPreference: (sidebarCollapsedPreference) => { writeStoredFlag("owl-sb-collapsed", sidebarCollapsedPreference); set({ sidebarCollapsedPreference }); },
    setSidebarExpandedInWorkspace: (sidebarExpandedInWorkspace) => { writeStoredFlag("owl-sb-ws-expanded", sidebarExpandedInWorkspace); set({ sidebarExpandedInWorkspace }); },
    setTerminalTab: (terminalTab) => set({ terminalTab, terminalOpen: true }),
    clearTerminal: () => set({ terminal: [] }),
    setEditorTabs: (editorTabs) => set({ editorTabs }),
  };
});
