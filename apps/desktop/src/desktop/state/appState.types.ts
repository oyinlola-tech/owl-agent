import type {
  ActEvent, AgentStatus, AppScreen, Approval, CenterTab, ChangeFile,
  ChatMsg, InspectorTab, Project, SideSection, Task, TaskFilter, TermLine,
} from "./workspace.types";

export interface ConfirmState {
  title: string;
  body: string;
  confirmLabel: string;
  run: () => void;
}

export interface AppState {
  screen: AppScreen;
  project: Project | null;
  centerTab: CenterTab;
  filePanelSection: SideSection;
  inspectorTab: InspectorTab;
  terminalOpen: boolean;
  filePanelOpen: boolean;
  inspectorOpen: boolean;
  commandPaletteOpen: boolean;
  askOwlOpen: boolean;
  createProjectOpen: boolean;
  confirm: ConfirmState | null;
  taskFilter: TaskFilter;
  openTaskId: string | null;
  openBackendTaskId: string | null;
  agentStatus: AgentStatus;
  agentStep: number;
  agentEvents: ActEvent[];
  approvals: Approval[];
  changes: ChangeFile[];
  chat: ChatMsg[];
  terminal: TermLine[];
  draft: string;
  tasks: Task[];
  notice: string | null;
  liveChatEnabled: boolean;
  liveReplyInProgress: boolean;
  preferredModel: string;
  filePanelWidth: number;
  inspectorWidth: number;
  terminalHeight: number;
  openFilePath: string;
  editedFiles: Record<string, string>;
  fileChangeDecisions: Record<string, "pending" | "accepted" | "rejected">;
  fileChangeHistory: { path: string; prev: "pending" | "accepted" | "rejected" }[];
  shortcutsOpen: boolean;
  sidebarCollapsedPreference: boolean;
  sidebarExpandedInWorkspace: boolean;
  terminalTab: "agent" | "dev" | "tests";
  editorTabs: string[];
  cancelLiveReply: (() => void) | null;

  goToScreen: (s: AppScreen) => void;
  openProject: (p: Project) => void;
  setCenterTab: (t: CenterTab) => void;
  setFilePanelSection: (s: SideSection) => void;
  setInspectorTab: (t: InspectorTab) => void;
  toggleTerminal: () => void;
  toggleFilePanel: () => void;
  toggleInspector: () => void;
  setCommandPaletteOpen: (v: boolean) => void;
  setAskOwlOpen: (v: boolean) => void;
  setCreateProjectOpen: (v: boolean) => void;
  askForConfirmation: (c: ConfirmState) => void;
  answerConfirmation: (yes: boolean) => void;
  setTaskFilter: (f: TaskFilter) => void;
  openTask: (id: string) => void;
  openBackendTask: (id: string) => void;
  setDraft: (d: string) => void;
  setLiveChatEnabled: (v: boolean) => void;
  setPreferredModel: (m: string) => void;
  sendDraftToSampleAgent: () => void;
  sendDraftToLiveModel: () => void;
  runSampleTask: () => void;
  pauseAgent: () => void;
  resumeAgent: () => void;
  stopAgent: () => void;
  decideApproval: (id: string, v: "approved" | "rejected") => void;
  appendTerminalLine: (l: Omit<TermLine, "id">) => void;
  showNotice: (n: string | null) => void;
  setFilePanelWidth: (w: number) => void;
  setInspectorWidth: (w: number) => void;
  setTerminalHeight: (h: number) => void;
  openFile: (path: string) => void;
  saveFileEdit: (path: string, value: string) => void;
  decideFileChange: (path: string, v: "accepted" | "rejected" | "pending") => void;
  undoLastFileChange: () => void;
  runTerminalCommand: (cmd: string) => void;
  startNewTask: () => void;
  setShortcutsOpen: (v: boolean) => void;
  setSidebarCollapsedPreference: (v: boolean) => void;
  setSidebarExpandedInWorkspace: (v: boolean) => void;
  setTerminalTab: (t: "agent" | "dev" | "tests") => void;
  clearTerminal: () => void;
  setEditorTabs: (tabs: string[]) => void;
  stopLiveReply: () => void;
}
