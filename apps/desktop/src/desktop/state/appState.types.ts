import type {
  ActEvent, AgentStatus, AppScreen, Approval, CenterTab, ChangeFile,
  ChatMsg, InspectorTab, Project, SideSection, TaskFilter, TermLine,
} from "./workspace.types";

export interface ConfirmState {
  title: string;
  body: string;
  confirmLabel: string;
  run: () => void;
}

export interface CommandRunOptions {
  confirm_high_risk?: boolean;
  allow_network?: boolean;
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
  notice: string | null;
  preferredModel: string;
  taskId: string | null;
  needsProvider: boolean;
  terminalBusy: boolean;
  filePanelWidth: number;
  inspectorWidth: number;
  terminalHeight: number;
  openFilePath: string;
  shortcutsOpen: boolean;
  sidebarCollapsedPreference: boolean;
  sidebarExpandedInWorkspace: boolean;
  terminalTab: "agent" | "dev" | "tests";
  editorTabs: string[];
  cancelTaskStream: (() => void) | null;

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
  setPreferredModel: (m: string) => void;
  sendWorkspaceMessage: () => void;
  attachTaskStream: (taskId: string) => void;
  pauseAgent: () => void;
  resumeAgent: () => void;
  stopAgent: () => void;
  decideApproval: (id: string, v: "approved" | "rejected") => void;
  appendChat: (message: Omit<ChatMsg, "id">) => void;
  appendTerminalLine: (l: Omit<TermLine, "id">) => void;
  showNotice: (n: string | null) => void;
  setFilePanelWidth: (w: number) => void;
  setInspectorWidth: (w: number) => void;
  setTerminalHeight: (h: number) => void;
  openFile: (path: string) => void;
  runTerminalCommand: (cmd: string, options?: CommandRunOptions) => void;
  startNewTask: () => void;
  setShortcutsOpen: (v: boolean) => void;
  setSidebarCollapsedPreference: (v: boolean) => void;
  setSidebarExpandedInWorkspace: (v: boolean) => void;
  setTerminalTab: (t: "agent" | "dev" | "tests") => void;
  clearTerminal: () => void;
  setEditorTabs: (tabs: string[]) => void;
}
