import { create } from "zustand";
import type {
  ActEvent, AgentStatus, AppScreen, Approval, CenterTab, ChangeFile,
  ChatMsg, InspectorTab, Project, SideSection, Task, TaskFilter, TermLine,
} from "./types";
import { INITIAL_CHAT, INITIAL_TERMINAL, TASKS } from "./seed";
import { MockAgentService, type AgentService } from "./agent/service";
import { api, type ChatMessage } from "./agent/api";

let clock = 0;
const nid = (p: string) => `${p}-${++clock}-${Date.now() % 100000}`;

export interface ConfirmState {
  title: string;
  body: string;
  confirmLabel: string;
  run: () => void;
}

interface AppState {
  screen: AppScreen;
  project: Project | null;
  center: CenterTab;
  side: SideSection;
  inspector: InspectorTab;
  termOpen: boolean;
  sideOpen: boolean;
  inspectorOpen: boolean;
  palette: boolean;
  aiBar: boolean;
  createOpen: boolean;
  confirm: ConfirmState | null;
  taskFilter: TaskFilter;
  openTaskId: string | null;
  openBTaskId: string | null;
  agent: AgentStatus;
  step: number;
  events: ActEvent[];
  approvals: Approval[];
  changes: ChangeFile[];
  chat: ChatMsg[];
  terminal: TermLine[];
  draft: string;
  tasks: Task[];
  notice: string | null;
  liveChat: boolean;
  liveBusy: boolean;
  modelPref: string;
  sideW: number;
  inspW: number;
  termH: number;
  openPath: string;
  edited: Record<string, string>;
  changeState: Record<string, "pending" | "accepted" | "rejected">;
  history: { path: string; prev: "pending" | "accepted" | "rejected" }[];

  go: (s: AppScreen) => void;
  openProject: (p: Project) => void;
  setCenter: (t: CenterTab) => void;
  setSide: (s: SideSection) => void;
  setInspector: (t: InspectorTab) => void;
  toggleTerm: () => void;
  toggleSide: () => void;
  toggleInspector: () => void;
  setPalette: (v: boolean) => void;
  setAiBar: (v: boolean) => void;
  setCreate: (v: boolean) => void;
  askConfirm: (c: ConfirmState) => void;
  answerConfirm: (yes: boolean) => void;
  setFilter: (f: TaskFilter) => void;
  openTask: (id: string) => void;
  openBTask: (id: string) => void;
  setDraft: (d: string) => void;
  setLiveChat: (v: boolean) => void;
  setModelPref: (m: string) => void;
  send: () => void;
  sendLive: () => void;
  run: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  decide: (id: string, v: "approved" | "rejected") => void;
  pushLine: (l: Omit<TermLine, "id">) => void;
  notify: (n: string | null) => void;
  setSideW: (w: number) => void;
  setInspW: (w: number) => void;
  setTermH: (h: number) => void;
  openFile: (path: string) => void;
  editFile: (path: string, value: string) => void;
  decideChange: (path: string, v: "accepted" | "rejected" | "pending") => void;
  undoChange: () => void;
  runCommand: (cmd: string) => void;
  newTask: () => void;
}

let service: AgentService | null = null;

export const useApp = create<AppState>((set, get) => {
  if (!service) {
    service = new MockAgentService({
      reset: () => set({
        agent: "working", step: 0, events: [], approvals: [], changes: [],
        chat: INITIAL_CHAT, center: "chat",
      }),
      steps: (events) => set({ events }),
      chat: (msg) => set((s) => ({ chat: [...s.chat, { from: msg.from, text: msg.text, plan: msg.plan, id: nid("m") }] })),
      lines: (lines) => set((s) => ({ terminal: [...s.terminal, ...lines.map((l) => ({ kind: l.kind, text: l.text, id: nid("t") }))] })),
      approvals: (approvals) => set({ approvals }),
      changes: (changes) => set({ changes }),
      status: (agent, step) => set({ agent, step }),
      notice: (notice) => set({ notice: notice || null }),
    });
  }
  const svc = (): AgentService => service as AgentService;

  return {
    screen: "welcome",
    project: null,
    center: "chat",
    side: "files",
    inspector: "agent",
    termOpen: true,
    sideOpen: true,
    inspectorOpen: true,
    palette: false,
    aiBar: false,
    createOpen: false,
    confirm: null,
    taskFilter: "all",
    openTaskId: null,
    openBTaskId: null,
    agent: "idle",
    step: 0,
    events: [],
    approvals: [],
    changes: [],
    chat: INITIAL_CHAT,
    terminal: INITIAL_TERMINAL,
    draft: "",
    tasks: TASKS,
    notice: null,
    liveChat: false,
    liveBusy: false,
    modelPref: (() => {
      try {
        return window.localStorage.getItem("owl-model") ?? "auto";
      } catch {
        return "auto";
      }
    })(),
    sideW: 264,
    inspW: 320,
    termH: 216,
    openPath: "src/auth/service.go",
    edited: {},
    changeState: {},
    history: [],

    go: (screen) => set({ screen, palette: false, aiBar: false }),
    openProject: (project) => set({ project, screen: "workspace", center: "chat" }),
    setCenter: (center) => set({ center }),
    setSide: (side) => set({ side, sideOpen: true }),
    setInspector: (inspector) => set({ inspector, inspectorOpen: true }),
    toggleTerm: () => set((s) => ({ termOpen: !s.termOpen })),
    toggleSide: () => set((s) => ({ sideOpen: !s.sideOpen })),
    toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
    setPalette: (palette) => set({ palette }),
    setAiBar: (aiBar) => set({ aiBar }),
    setCreate: (createOpen) => set({ createOpen }),
    askConfirm: (confirm) => set({ confirm }),
    answerConfirm: (yes) => {
      const c = get().confirm;
      set({ confirm: null });
      if (yes && c) c.run();
    },
    setFilter: (taskFilter) => set({ taskFilter }),
    openTask: (openTaskId) => set({ openTaskId, screen: "task" }),
    openBTask: (openBTaskId) => set({ openBTaskId, screen: "btask" }),
    setDraft: (draft) => set({ draft }),
    setLiveChat: (liveChat) => set({ liveChat }),
    setModelPref: (modelPref) => {
      try {
        window.localStorage.setItem("owl-model", modelPref);
      } catch {
        /* private mode: preference lasts the session */
      }
      set({ modelPref });
    },
    sendLive: () => {
      const text = get().draft.trim();
      if (!text || get().liveBusy) return;
      const modelPref = get().modelPref;
      const history: ChatMessage[] = get()
        .chat.filter((m) => m.from !== "sys")
        .slice(-10)
        .map((m) => ({
          role: m.from === "you" ? ("user" as const) : ("assistant" as const),
          content: m.text,
        }));
      const id = nid("m");
      set((s) => ({
        chat: [...s.chat, { id: nid("m"), from: "you", text }, { id, from: "owl", text: "" }],
        draft: "",
        liveBusy: true,
      }));
      const patch = (fn: (m: ChatMsg) => ChatMsg) =>
        set((s) => ({ chat: s.chat.map((m) => (m.id === id ? fn(m) : m)) }));
      api.streamChat(
        [...history, { role: "user", content: text }],
        modelPref,
        (delta) => patch((m) => ({ ...m, text: m.text + delta })),
        (_full, info) => {
          const u = info.usage;
          const tokens = `${u.input} in / ${u.output} out (${u.estimated ? "estimated" : "measured"})`;
          const reason = info.routing ? ` · ${info.routing}` : "";
          patch((m) => ({ ...m, meta: `via ${info.model || "model"} · ${tokens}${reason}` }));
          set({ liveBusy: false });
          if (modelPref === "auto") {
            set({ notice: `Auto selected ${info.model || "a model"}` });
          }
        },
        (code, message) => {
          patch((m) => ({ ...m, text: `Live model unavailable [${code}]: ${message}` }));
          set({ liveBusy: false, notice: `Live model error: ${message}` });
        },
      );
    },
    pushLine: (l) => set((s) => ({ terminal: [...s.terminal, { ...l, id: nid("t") }] })),
    notify: (notice) => set({ notice }),
    setSideW: (sideW) => set({ sideW: Math.min(480, Math.max(180, sideW)) }),
    setInspW: (inspW) => set({ inspW: Math.min(520, Math.max(220, inspW)) }),
    setTermH: (termH) => set({ termH: Math.min(560, Math.max(120, termH)) }),
    openFile: (openPath) => set({ openPath, center: "code" }),
    editFile: (path, value) => set((s) => ({ edited: { ...s.edited, [path]: value } })),
    decideChange: (path, v) => {
      const prev = get().changeState[path] ?? "pending";
      set((s) => ({
        changeState: { ...s.changeState, [path]: v },
        history: [...s.history, { path, prev }],
      }));
      get().pushLine({ kind: v === "accepted" ? "ok" : "err", text: `${v === "accepted" ? "applied" : "rejected"} ${path}` });
    },
    undoChange: () => {
      const h = get().history;
      const last = h[h.length - 1];
      if (!last) { set({ notice: "Nothing to undo" }); return; }
      set((s) => ({
        changeState: { ...s.changeState, [last.path]: last.prev },
        history: s.history.slice(0, -1),
        notice: `Undone: ${last.path}`,
      }));
    },

    send: () => {
      const text = get().draft.trim();
      if (!text) return;
      set({ draft: "" });
      svc().send(text);
    },
    run: () => svc().start(),
    pause: () => svc().pause(),
    resume: () => svc().resume(),
    stop: () => svc().stop(),
    decide: (id, v) => svc().decide(id, v),
    runCommand: (cmd) => svc().runCommand(cmd),
    newTask: () => {
      svc().stop();
      set((s) => ({
        agent: "idle", step: 0, events: [], approvals: [], changes: [], changeState: {}, history: [],
        chat: [...s.chat, { id: nid("m"), from: "sys", text: "New task started. Describe what you want to build, then press Run." }],
        center: "chat", screen: "workspace",
      }));
    },
  };
});
