import {
  BookOpenText, Brain, ClockCounterClockwise, Cpu, FolderOpen, Gear, Globe, House, Kanban, Layout, Question, Tray, Wrench,
  type Icon,
} from "@phosphor-icons/react";
import type { AppScreen } from "../state/workspace.types";
import { readStoredValue } from "../../shared/helpers/storage.helper";

const APP_SCREENS: AppScreen[] = [
  "welcome", "workspace", "tasks", "task", "btask", "browser", "projects", "memory", "settings",
  "inbox", "history", "models", "tools", "playbooks", "help",
];

export const SCREEN_META: Record<AppScreen, { label: string; icon: Icon }> = {
  welcome: { label: "Home", icon: House },
  projects: { label: "Projects", icon: FolderOpen },
  workspace: { label: "Workspace", icon: Layout },
  tasks: { label: "Tasks", icon: Kanban },
  task: { label: "Task", icon: Kanban },
  btask: { label: "Backend task", icon: Kanban },
  browser: { label: "Browser Studio", icon: Globe },
  memory: { label: "Memory", icon: Brain },
  settings: { label: "Settings", icon: Gear },
  inbox: { label: "Inbox", icon: Tray },
  history: { label: "Change history", icon: ClockCounterClockwise },
  models: { label: "Models & usage", icon: Cpu },
  tools: { label: "Agent tools", icon: Wrench },
  playbooks: { label: "Playbooks", icon: BookOpenText },
  help: { label: "Help", icon: Question },
};

export const NAV_GROUPS: { title: string; items: AppScreen[] }[] = [
  { title: "Work", items: ["welcome", "inbox", "workspace", "tasks", "projects", "browser"] },
  { title: "Knowledge", items: ["memory", "playbooks", "history"] },
  { title: "System", items: ["models", "tools", "settings", "help"] },
];

export function resolveScreenFromPath(path: string): AppScreen {
  const requested = path.replace(/^\/app\/?/, "") as AppScreen;
  if (APP_SCREENS.includes(requested)) return requested;
  const startScreen = readStoredValue("owl-start") as AppScreen | null;
  if (startScreen && APP_SCREENS.includes(startScreen)) return startScreen;
  return "welcome";
}

export function pathForScreen(screen: AppScreen): string {
  return screen === "welcome" ? "/app" : `/app/${screen}`;
}
