import { useEffect, type ComponentType } from "react";
import "../styles/shell.style.css";
import "../styles/screenCommon.style.css";
import { useAppStore } from "../state/app.store";
import { startPendingApprovalsSync } from "../state/pendingApprovals.store";
import type { AppScreen } from "../state/workspace.types";
import { pathForScreen } from "./screenCatalog.data";
import { useGlobalShortcuts } from "./globalShortcuts.hook";
import { Sidebar } from "./sidebar/sidebar.layout";
import { TopBar } from "./topbar/topBar.layout";
import { StatusBar } from "./statusBar.layout";
import { ServiceAuthErrorPanel } from "./serviceAuthError.layout";
import { useServiceConnectionStore } from "../services/connection/serviceConnection.store";
import { Toast } from "../components/toast.component";
import { CommandPaletteDialog } from "../dialogs/commandPalette.dialog";
import { AskOwlDialog } from "../dialogs/askOwl.dialog";
import { KeyboardShortcutsDialog } from "../dialogs/keyboardShortcuts.dialog";
import { ConfirmDialog } from "../dialogs/confirm.dialog";
import { CreateProjectDialog } from "../dialogs/createProject.dialog";
import { HomeScreen } from "../screens/home/home.screen";
import { ProjectsScreen } from "../screens/home/projects.screen";
import { WorkspaceScreen } from "../screens/workspace/workspace.screen";
import { TaskListScreen } from "../screens/tasks/taskList.screen";
import { LocalTaskDetailScreen } from "../screens/tasks/localTaskDetail.screen";
import { BackendTaskDetailScreen } from "../screens/tasks/backendTask/backendTaskDetail.screen";
import { BrowserStudioScreen } from "../screens/browser/browserStudio.screen";
import { SettingsScreen } from "../screens/system/settings/settings.screen";
import { MemoryScreen } from "../screens/knowledge/memory/memory.screen";
import { InboxScreen } from "../screens/inbox/inbox.screen";
import { ChangeHistoryScreen } from "../screens/knowledge/history/changeHistory.screen";
import { ModelsUsageScreen } from "../screens/system/models/modelsUsage.screen";
import { AgentToolsScreen } from "../screens/system/agentTools/agentTools.screen";
import { PlaybooksScreen } from "../screens/knowledge/playbooks/playbooks.screen";
import { HelpScreen } from "../screens/system/help/help.screen";
import { OnboardingScreen } from "../screens/onboarding/onboarding.screen";
import { ensureOnboardingChecked, useOnboardingStore } from "../screens/onboarding/onboarding.state";

const SCREEN_COMPONENTS: Record<AppScreen, ComponentType> = {
  welcome: HomeScreen,
  workspace: WorkspaceScreen,
  tasks: TaskListScreen,
  task: LocalTaskDetailScreen,
  btask: BackendTaskDetailScreen,
  browser: BrowserStudioScreen,
  projects: ProjectsScreen,
  memory: MemoryScreen,
  settings: SettingsScreen,
  inbox: InboxScreen,
  history: ChangeHistoryScreen,
  models: ModelsUsageScreen,
  tools: AgentToolsScreen,
  playbooks: PlaybooksScreen,
  help: HelpScreen,
};

export function DesktopShell({ initial = "welcome" }: { initial?: AppScreen }) {
  const screen = useAppStore((s) => s.screen);
  const commandPaletteOpen = useAppStore((s) => s.commandPaletteOpen);
  const askOwlOpen = useAppStore((s) => s.askOwlOpen);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const setAskOwlOpen = useAppStore((s) => s.setAskOwlOpen);
  const goToScreen = useAppStore((s) => s.goToScreen);
  const serviceAuthFailed = useServiceConnectionStore((s) => s.authFailed);
  const onboardingActive = useOnboardingStore((s) => s.status === "active");

  useEffect(() => { startPendingApprovalsSync(); ensureOnboardingChecked(); }, []);

  useEffect(() => {
    goToScreen(initial);
  }, [initial, goToScreen]);

  useEffect(() => {
    const target = pathForScreen(screen);
    if (window.location.pathname !== target) {
      window.history.replaceState({}, "", target);
    }
  }, [screen]);

  useGlobalShortcuts();

  const ActiveScreen = SCREEN_COMPONENTS[screen];

  if (onboardingActive) return <OnboardingScreen />;

  return (
    <div className="desk">
      <Sidebar />
      <div className="main">
        <TopBar onOpenCommandPalette={() => setCommandPaletteOpen(true)} onOpenAskOwl={() => setAskOwlOpen(true)} />
        {serviceAuthFailed ? <ServiceAuthErrorPanel /> : <ActiveScreen />}
        <StatusBar onOpenCommandPalette={() => setCommandPaletteOpen(true)} />
      </div>
      {commandPaletteOpen && <CommandPaletteDialog />}
      {askOwlOpen && <AskOwlDialog />}
      <CreateProjectDialog />
      <KeyboardShortcutsDialog />
      <ConfirmDialog />
      <Toast />
    </div>
  );
}
