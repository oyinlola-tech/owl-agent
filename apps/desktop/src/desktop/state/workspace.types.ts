export type AgentStatus = "idle" | "working" | "paused" | "awaiting" | "done" | "stopped";
type TaskStatus = "running" | "paused" | "completed" | "failed" | "cancelled";
type EventState = "done" | "active" | "queued";

export interface ActEvent {
  id: string;
  label: string;
  state: EventState;
  detail?: string;
}

export interface Approval {
  id: string;
  kind: "files" | "command" | "privileged";
  title: string;
  command?: string;
  dir?: string;
  reason?: string;
  risk?: "Low" | "Medium" | "High";
  files?: string[];
  status: "pending" | "approved" | "rejected";
}

export interface ChatMsg {
  id: string;
  from: "you" | "owl" | "sys";
  text: string;
  plan?: string[];
  meta?: string;
}

export interface ChangeFile {
  path: string;
  status: "M" | "A" | "D";
  before: string;
  after: string;
}

export interface TermLine {
  id: string;
  text: string;
  kind: "cmd" | "out" | "ok" | "err" | "agent";
}

export interface FileNode {
  name: string;
  path: string;
  children?: FileNode[];
}

export interface Task {
  id: string;
  name: string;
  project: string;
  status: TaskStatus;
  progress: number;
  started: string;
  elapsed: string;
  plan: string[];
  files: string[];
  commands: string[];
  note: string;
}

export type { Project } from "../services/agentApi.types";

export type AppScreen =
  | "welcome" | "workspace" | "tasks" | "task" | "btask" | "browser" | "projects" | "memory" | "settings"
  | "inbox" | "history" | "models" | "tools" | "playbooks" | "help";
export type CenterTab = "chat" | "code" | "changes" | "browser" | "preview";
export type SideSection = "files" | "search" | "git" | "tasks";
export type InspectorTab = "agent" | "changes" | "tasks" | "context";
export type TaskFilter = "all" | "running" | "completed" | "failed" | "cancelled";
