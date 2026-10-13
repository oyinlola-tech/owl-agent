import { Brain, Browser, Cpu, Desktop, Globe, HardDrives, ShieldCheck } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import type { Hue } from "../../../shared/components/tag.component";

export const RELEASE_HISTORY: { v: string; date: string; title: string; tag?: { hue: Hue; label: string }; groups: { icon: Icon; hue: Hue; h: string; items: string[] }[] }[] = [
  { v: "Unreleased", date: "In progress", title: "Providers, onboarding, and hardening", tag: { hue: "blue", label: "Next" }, groups: [
    { icon: Desktop, hue: "blue", h: "Desktop app", items: [
      "Notion-style sidebar with grouped sections, recent tasks, and a collapsible rail.",
      "New screens: Inbox, Change history, Models & usage, Agent tools, Playbooks, and Help.",
      "Command palette with icons, groups, and keyboard navigation.",
      "No mock data: every screen shows real service states, designed empty states, and a clear offline notice instead of sample rows.",
      "First-run onboarding: profile, model connection, first project, safety check, and done summary.",
      "Stack advisor: describe what you are building, compare recommendations, and pick one for the first task.",
      "Self-hosted Inter, Newsreader, and JetBrains Mono, so the app works without a network.",
    ] },
    { icon: Cpu, hue: "green", h: "Models and providers", items: [
      "Cloud providers (Claude, OpenAI, Gemini, Grok, Groq, NVIDIA, OpenRouter, Together, custom) and local runners (Ollama, LM Studio, llama.cpp).",
      "API keys from the app into the OS keyring, write-only, with Test connection and per-provider model picker.",
      "Model lists come from each provider's live /models; the router honors pinned models and reports why it picked.",
      "No provider configured means a clear connect-first message, never invented replies.",
    ] },
    { icon: ShieldCheck, hue: "orange", h: "Security", items: [
      "Atomic approval consumption, per-task resume locks, and pause-while-gated tasks.",
      "Sandbox resource limits that no longer depend on an external binary; git hooks disabled on clone, fetch, pull, checkout, and merge.",
      "Wider secret scrubbing, ownership checks on legacy database adoption, and scrubbed console logs.",
    ] },
    { icon: HardDrives, hue: "purple", h: "Agent service", items: [
      "New verification detectors: Hardhat, standalone Kotlin, requirements.txt pytest, and shellcheck without Bats.",
      "Project-scan memories built from the detected stack; elapsed budgets survive pause and resume.",
      "Paginated task history reads for long-running tasks.",
    ] },
    { icon: Globe, hue: "purple", h: "Website", items: [
      "Interactive hero run you can approve or reject.",
      "Docs, Security, Changelog, and Download pages.",
      "One-click downloads: /download links redirect straight to the latest published installers.",
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
