import { create } from "zustand";
import type { ChatMsg } from "./workspace.types";
import type { AppState } from "./appState.types";
import { readStoredFlag, readStoredValue, writeStoredFlag, writeStoredValue } from "../../shared/helpers/storage.helper";
import { INITIAL_CHAT, INITIAL_TERMINAL, TASKS } from "../services/samples/sampleWorkspace.data";
import { MockAgentService, type AgentService } from "../services/mockAgent.service";
import { agentApi } from "../services/agentApi.service";
import { type ChatMessage } from "../services/agentApi.types";

let idCounter = 0;
const createUniqueId = (prefix: string) => `${prefix}-${++idCounter}-${Date.now() % 100000}`;

let sampleAgentService: AgentService | null = null;

export const useAppStore = create<AppState>((set, get) => {
  if (!sampleAgentService) {
    sampleAgentService = new MockAgentService({
      reset: () => set({
        agentStatus: "working", agentStep: 0, agentEvents: [], approvals: [], changes: [],
        chat: INITIAL_CHAT, centerTab: "chat",
      }),
      steps: (agentEvents) => set({ agentEvents }),
      chat: (msg) => set((s) => ({ chat: [...s.chat, { from: msg.from, text: msg.text, plan: msg.plan, id: createUniqueId("m") }] })),
      lines: (lines) => set((s) => ({ terminal: [...s.terminal, ...lines.map((l) => ({ kind: l.kind, text: l.text, id: createUniqueId("t") }))] })),
      approvals: (approvals) => set({ approvals }),
      changes: (changes) => set({ changes }),
      status: (agentStatus, agentStep) => set({ agentStatus, agentStep }),
      notice: (notice) => set({ notice: notice || null }),
    });
  }
  const sampleAgent = (): AgentService => sampleAgentService as AgentService;

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
    chat: INITIAL_CHAT,
    terminal: INITIAL_TERMINAL,
    draft: "",
    tasks: TASKS,
    notice: null,
    liveChatEnabled: false,
    liveReplyInProgress: false,
    preferredModel: readStoredValue("owl-model") ?? "auto",
    filePanelWidth: 264,
    inspectorWidth: 320,
    terminalHeight: 216,
    openFilePath: "src/auth/service.go",
    editedFiles: {},
    fileChangeDecisions: {},
    fileChangeHistory: [],
    shortcutsOpen: false,
    sidebarCollapsedPreference: readStoredFlag("owl-sb-collapsed", false),
    sidebarExpandedInWorkspace: readStoredFlag("owl-sb-ws-expanded", false),
    terminalTab: "agent",
    editorTabs: ["src/auth/service.go", "src/auth/middleware.go", "src/main.go"],
    cancelLiveReply: null,

    goToScreen: (screen) => set({ screen, commandPaletteOpen: false, askOwlOpen: false }),
    openProject: (project) => set({ project, screen: "workspace", centerTab: "chat" }),
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
    setLiveChatEnabled: (liveChatEnabled) => set({ liveChatEnabled }),
    setPreferredModel: (preferredModel) => {
      writeStoredValue("owl-model", preferredModel);
      set({ preferredModel });
    },
    sendDraftToLiveModel: () => {
      const text = get().draft.trim();
      if (!text || get().liveReplyInProgress) return;
      const modelPref = get().preferredModel;
      const history: ChatMessage[] = get()
        .chat.filter((m) => m.from !== "sys")
        .slice(-10)
        .map((m) => ({
          role: m.from === "you" ? ("user" as const) : ("assistant" as const),
          content: m.text,
        }));
      const id = createUniqueId("m");
      set((s) => ({
        chat: [...s.chat, { id: createUniqueId("m"), from: "you", text }, { id, from: "owl", text: "" }],
        draft: "",
        liveReplyInProgress: true,
      }));
      const patch = (fn: (m: ChatMsg) => ChatMsg) =>
        set((s) => ({ chat: s.chat.map((m) => (m.id === id ? fn(m) : m)) }));
      const cancel = agentApi.streamChat(
        [...history, { role: "user", content: text }],
        modelPref,
        (delta) => patch((m) => ({ ...m, text: m.text + delta })),
        (_full, info) => {
          const u = info.usage;
          const tokens = `${u.input} in / ${u.output} out (${u.estimated ? "estimated" : "measured"})`;
          const reason = info.routing ? ` · ${info.routing}` : "";
          patch((m) => ({ ...m, meta: `via ${info.model || "model"} · ${tokens}${reason}` }));
          set({ liveReplyInProgress: false, cancelLiveReply: null });
          if (modelPref === "auto") {
            set({ notice: `Auto selected ${info.model || "a model"}` });
          }
        },
        (code, message) => {
          patch((m) => ({ ...m, text: `Live model unavailable [${code}]: ${message}` }));
          set({ liveReplyInProgress: false, cancelLiveReply: null, notice: `Live model error: ${message}` });
        },
      );
      set({ cancelLiveReply: cancel });
    },
    appendTerminalLine: (l) => set((s) => ({ terminal: [...s.terminal, { ...l, id: createUniqueId("t") }] })),
    showNotice: (notice) => set({ notice }),
    setFilePanelWidth: (width) => set({ filePanelWidth: Math.min(480, Math.max(180, width)) }),
    setInspectorWidth: (width) => set({ inspectorWidth: Math.min(520, Math.max(220, width)) }),
    setTerminalHeight: (height) => set({ terminalHeight: Math.min(560, Math.max(120, height)) }),
    openFile: (openFilePath) => set({ openFilePath, centerTab: "code" }),
    saveFileEdit: (path, value) => set((s) => ({ editedFiles: { ...s.editedFiles, [path]: value } })),
    decideFileChange: (path, v) => {
      const prev = get().fileChangeDecisions[path] ?? "pending";
      set((s) => ({
        fileChangeDecisions: { ...s.fileChangeDecisions, [path]: v },
        fileChangeHistory: [...s.fileChangeHistory, { path, prev }],
      }));
      get().appendTerminalLine({ kind: v === "accepted" ? "ok" : "err", text: `${v === "accepted" ? "applied" : "rejected"} ${path}` });
    },
    undoLastFileChange: () => {
      const h = get().fileChangeHistory;
      const last = h[h.length - 1];
      if (!last) { set({ notice: "Nothing to undo" }); return; }
      set((s) => ({
        fileChangeDecisions: { ...s.fileChangeDecisions, [last.path]: last.prev },
        fileChangeHistory: s.fileChangeHistory.slice(0, -1),
        notice: `Undone: ${last.path}`,
      }));
    },

    sendDraftToSampleAgent: () => {
      const text = get().draft.trim();
      if (!text) return;
      set({ draft: "" });
      sampleAgent().send(text);
    },
    runSampleTask: () => sampleAgent().start(),
    pauseAgent: () => sampleAgent().pause(),
    resumeAgent: () => sampleAgent().resume(),
    stopAgent: () => sampleAgent().stop(),
    decideApproval: (id, v) => sampleAgent().decide(id, v),
    runTerminalCommand: (cmd) => sampleAgent().runCommand(cmd),
    startNewTask: () => {
      sampleAgent().stop();
      set((s) => ({
        agentStatus: "idle", agentStep: 0, agentEvents: [], approvals: [], changes: [], fileChangeDecisions: {}, fileChangeHistory: [],
        chat: [...s.chat, { id: createUniqueId("m"), from: "sys", text: "New task started. Describe what you want to build, then press Run." }],
        centerTab: "chat", screen: "workspace",
      }));
    },
    setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
    setSidebarCollapsedPreference: (sidebarCollapsedPreference) => { writeStoredFlag("owl-sb-collapsed", sidebarCollapsedPreference); set({ sidebarCollapsedPreference }); },
    setSidebarExpandedInWorkspace: (sidebarExpandedInWorkspace) => { writeStoredFlag("owl-sb-ws-expanded", sidebarExpandedInWorkspace); set({ sidebarExpandedInWorkspace }); },
    setTerminalTab: (terminalTab) => set({ terminalTab, terminalOpen: true }),
    clearTerminal: () => set({ terminal: [] }),
    setEditorTabs: (editorTabs) => set({ editorTabs }),
    stopLiveReply: () => {
      const c = get().cancelLiveReply;
      if (c) c();
      set({ liveReplyInProgress: false, cancelLiveReply: null, notice: "Stopped generating" });
    },
  };
});
