import { Brain, Cpu, Desktop, Globe, HardDrives, ShieldCheck } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import type { Hue } from "../../../shared/components/tag.component";

export const RELEASE_HISTORY: { v: string; date: string; title: string; tag?: { hue: Hue; label: string }; groups: { icon: Icon; hue: Hue; h: string; items: string[] }[] }[] = [
  { v: "0.2.0", date: "October 13, 2026", title: "Ten roadmap features", tag: { hue: "blue", label: "Latest" }, groups: [
    { icon: Desktop, hue: "blue", h: "Workflows", items: [
      "Git push and pull with confirm gates, ahead/behind counts, and force-push refused.",
      "Background tasks with OS and title-badge notifications for approvals, completions, and failures.",
      "Editable plans: reorder, rewrite, add, or delete steps while paused.",
      "Per-hunk accept in Changes, composed through the existing save and reject paths.",
      "Project scaffolding from stack picks: starter command, git init, first commit, all approval-gated.",
      "Voice dictation in the composer with interim streaming.",
    ] },
    { icon: Cpu, hue: "green", h: "Insight and sharing", items: [
      "Cost dashboard: per-model and per-task token tables with a local monthly budget cap.",
      "Update checker in Help with one-click access to new installers.",
      "Task bundles: export and import tasks as versioned files.",
      "Custom command tools through the sandboxed, approval-gated runner.",
    ] },
  ] },
  { v: "0.1.0", date: "October 13, 2026", title: "First release", groups: [
    { icon: Desktop, hue: "blue", h: "Desktop app", items: [
      "Notion-style sidebar with grouped sections, recent tasks, and a collapsible rail.",
      "Screens: Home, Inbox, Workspace, Tasks, Projects, Browser Studio, Memory, Playbooks, Change history, Models & usage, Agent tools, Settings, and Help.",
      "Command palette with icons, groups, and keyboard navigation.",
      "No mock data: every screen shows real service states, designed empty states, and a clear offline notice instead of sample rows.",
      "First-run onboarding: profile, model connection, first project, safety check, and done summary.",
      "Stack advisor: describe what you are building, compare recommendations, and pick one for the first task.",
      "Workspace with chat, code, changes, browser preview, inspector, and terminal.",
      "Self-hosted Inter, Newsreader, and JetBrains Mono, so the app works without a network.",
    ] },
    { icon: Cpu, hue: "green", h: "Models and providers", items: [
      "Cloud providers (Claude, OpenAI, Gemini, Grok, Groq, NVIDIA, OpenRouter, Together AI, custom) and local runners (Ollama, LM Studio, llama.cpp).",
      "API keys from the app into the OS keyring, write-only, with Test connection and per-provider model picker.",
      "Model lists come from each provider's live /models; the router honors pinned models and reports why it picked.",
      "Model registry with refresh and validation; router that classifies requests by capability, size, and recent failures.",
      "Context budget with compression history, and token usage per call.",
      "No provider configured means a clear connect-first message, never invented replies.",
    ] },
    { icon: ShieldCheck, hue: "orange", h: "Approvals and verification", items: [
      "Approvals bound to a SHA-256 of the action and its arguments; expiry, atomic single-use consumption, and task-wide scope.",
      "Risk levels for commands; privilege escalation refused; network off by default with per-run grants.",
      "Change journal with per-entry revert and conflict detection.",
      "Independent verification: OWL runs your project's own checks (Node, Python, Go, Rust, JVM, .NET, Flutter, CMake, and more) and marks tasks verified or unverified with the reason stored.",
      "Sandboxed execution with resource limits; git hooks disabled on clone, fetch, pull, checkout, and merge.",
      "Wider secret scrubbing, ownership checks on legacy database adoption, and scrubbed console logs.",
    ] },
    { icon: Brain, hue: "pink", h: "Memory", items: [
      "Global, project, task, and knowledge categories.",
      "Edit, disable, delete, search, clear project, and maintenance merge.",
      "Secret scrubbing on save, and a history of memory changes.",
      "Memories feed back into prompts; each task shows which memories it used.",
      "Project-scan memories built automatically from the detected stack.",
    ] },
    { icon: HardDrives, hue: "purple", h: "Agent service", items: [
      "FastAPI service with SQLite storage for tasks, steps, tool calls, and usage.",
      "Task manager with pause, resume, cancel, checkpoints, and loop budgets.",
      "Event bus with a server-sent event stream per task.",
      "Workspace authorization: every path is resolved against authorized roots.",
      "Tool registry: file list, read, search, stat, create, propose and apply edit; Git status, diff, log, branch, commit, push; command execution.",
      "Read-only browser page capture: title, text, and optional screenshot.",
    ] },
    { icon: Globe, hue: "purple", h: "Website", items: [
      "Interactive hero run you can approve or reject.",
      "Docs, Security, Changelog, and Download pages.",
      "One-click downloads: /download links redirect straight to the latest published installers.",
    ] },
  ] },
];
