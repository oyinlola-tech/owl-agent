import { Brain, Browser, Cpu, Desktop, Globe, HardDrives, ShieldCheck } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import type { Hue } from "../../../shared/components/tag.component";

export const RELEASE_HISTORY: { v: string; date: string; title: string; tag?: { hue: Hue; label: string }; groups: { icon: Icon; hue: Hue; h: string; items: string[] }[] }[] = [
  { v: "Unreleased", date: "In progress", title: "A new interface", tag: { hue: "blue", label: "Next" }, groups: [
    { icon: Desktop, hue: "blue", h: "Desktop app", items: [
      "Notion-style sidebar with grouped sections, recent tasks, and a collapsible rail.",
      "New screens: Inbox, Change history, Models & usage, Agent tools, Playbooks, and Help.",
      "Command palette with icons, groups, and keyboard navigation.",
      "Sample data on every screen when the service is offline, clearly labelled.",
      "Self-hosted Inter, Newsreader, and JetBrains Mono, so the app works without a network.",
    ] },
    { icon: Globe, hue: "purple", h: "Website", items: [
      "Interactive hero run you can approve or reject.",
      "Docs, Security, Changelog, and Download pages.",
    ] },
  ] },
  { v: "0.1.0", date: "October 10, 2026", title: "First release of the agent service", tag: { hue: "green", label: "Latest" }, groups: [
    { icon: HardDrives, hue: "purple", h: "Agent service", items: [
      "FastAPI service with SQLite storage for tasks, steps, tool calls, and usage.",
      "Task manager with pause, resume, cancel, checkpoints, and loop budgets.",
      "Event bus with a server-sent event stream per task.",
      "Workspace authorization: every path is resolved against authorized roots.",
      "Tool registry: file list, read, search, stat, create, propose and apply edit; Git status, diff, log, branch, commit, push; command execution.",
    ] },
    { icon: ShieldCheck, hue: "orange", h: "Approvals", items: [
      "Approvals bound to a SHA-256 of the action and its arguments.",
      "Expiry, single-use consumption, and task-wide scope.",
      "Risk levels for commands; privilege escalation refused.",
      "Change journal with per-entry revert and conflict detection.",
    ] },
    { icon: Brain, hue: "pink", h: "Memory", items: [
      "Global, project, task, and knowledge categories.",
      "Edit, disable, delete, search, clear project, and maintenance merge.",
      "Secret scrubbing on save, and a history of memory changes.",
    ] },
    { icon: Cpu, hue: "green", h: "Models and routing", items: [
      "NVIDIA provider with streaming chat and key verification.",
      "Model registry with refresh and validation.",
      "Router that classifies requests and picks a model by capability, size, and recent failures.",
      "Context budget with compression history, and token usage per call.",
    ] },
    { icon: Browser, hue: "blue", h: "Browser", items: [
      "Read-only page capture: title, text, and optional screenshot.",
    ] },
    { icon: Desktop, hue: "gray", h: "Desktop app", items: [
      "Workspace with chat, code, changes, browser preview, inspector, and terminal.",
      "Task history, Browser Studio, Memory, and Settings screens wired to the service.",
    ] },
  ] },
];
