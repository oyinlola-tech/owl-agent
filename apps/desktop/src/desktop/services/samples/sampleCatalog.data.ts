import type { MemoryHistoryRow, MemoryRow, ModelEntry, ProviderRead, ToolRead } from "../agentApi.types";
import { daysAgoAt } from "./sampleMode.helper";

export const SAMPLE_PROVIDER: ProviderRead = {
  name: "nvidia",
  configured: true,
  model: "nvidia/llama-3.1-nemotron-70b-instruct",
};

export const SAMPLE_MODELS: ModelEntry[] = [
  { id: "nvidia/llama-3.1-nemotron-70b-instruct", context_window: 128000, context_source: "provider", capabilities: ["chat", "code", "tools", "long_context"], status: "verified", last_seen: daysAgoAt(0, 8), updated_at: daysAgoAt(0, 8) },
  { id: "meta/llama-3.3-70b-instruct", context_window: 128000, context_source: "provider", capabilities: ["chat", "code", "tools"], status: "available", last_seen: daysAgoAt(0, 8), updated_at: daysAgoAt(0, 8) },
  { id: "qwen/qwen2.5-coder-32b-instruct", context_window: 32768, context_source: "provider", capabilities: ["code", "tools"], status: "available", last_seen: daysAgoAt(0, 8), updated_at: daysAgoAt(0, 8) },
  { id: "deepseek-ai/deepseek-r1", context_window: 128000, context_source: "provider", capabilities: ["chat", "reasoning", "long_context"], status: "untested", last_seen: daysAgoAt(0, 8), updated_at: daysAgoAt(0, 8) },
  { id: "meta/llama-3.2-90b-vision-instruct", context_window: 128000, context_source: "provider", capabilities: ["chat", "vision"], status: "untested", last_seen: daysAgoAt(0, 8), updated_at: daysAgoAt(0, 8) },
  { id: "mistralai/mixtral-8x7b-instruct-v0.1", context_window: 32768, context_source: "default", capabilities: ["chat"], status: "deprecated", last_seen: daysAgoAt(12, 8), updated_at: daysAgoAt(5, 8) },
];

export const SAMPLE_TOOLS: ToolRead[] = [
  { name: "browser_open", description: "Open a URL and read title and text. Read-only.", requires_approval: false },
  { name: "exec_run", description: "Run a command by argv array. Requires approval.", requires_approval: true },
  { name: "fs_create", description: "Create a new file. Requires approval.", requires_approval: true },
  { name: "fs_apply_edit", description: "Apply a proposed edit. Requires a bound approval.", requires_approval: true },
  { name: "fs_propose_edit", description: "Propose a file edit and get a diff. No changes made.", requires_approval: false },
  { name: "fs_list", description: "List project directories and files.", requires_approval: false },
  { name: "fs_read", description: "Read a text file with offset and limit.", requires_approval: false },
  { name: "fs_search", description: "Search file contents by regex.", requires_approval: false },
  { name: "fs_stat", description: "File metadata and modification status.", requires_approval: false },
  { name: "git_branch", description: "Read-only current branch.", requires_approval: false },
  { name: "git_commit", description: "Stage paths and commit. Requires approval.", requires_approval: true },
  { name: "git_diff", description: "Read-only git diff.", requires_approval: false },
  { name: "git_log", description: "Read-only recent commits.", requires_approval: false },
  { name: "git_push", description: "Push to a remote. Requires approval.", requires_approval: true },
  { name: "git_status", description: "Read-only git status.", requires_approval: false },
];

const mem = (id: string, category: MemoryRow["category"], project: string, text: string, confirmed = 1, enabled = 1, d = 1): MemoryRow => ({
  id, category, project, text, confirmed, enabled, source: confirmed ? "user" : "task", created_at: daysAgoAt(d), updated_at: daysAgoAt(d),
});

export const SAMPLE_MEMORIES: MemoryRow[] = [
  mem("mem_01", "global", "", "Prefer small, reviewable diffs. One concern per change."),
  mem("mem_02", "global", "", "Use pnpm, not npm, in JavaScript projects.", 1, 1, 6),
  mem("mem_03", "project", "ZudoMart", "Money is stored in minor units (kobo) as int64. Never use floats for amounts."),
  mem("mem_04", "project", "ZudoMart", "Run go test ./... before proposing any commit.", 1, 1, 3),
  mem("mem_05", "project", "ZudoMart", "Errors follow RFC 7807 problem+json in HTTP handlers.", 0, 1, 2),
  mem("mem_06", "task", "ZudoMart", "Staging pushes go to release/staging, never to main.", 0, 1, 3),
  mem("mem_07", "knowledge", "ProofLens", "The upstream OCR API rate-limits at 10 requests per second per key.", 1, 1, 1),
  mem("mem_08", "project", "Scriptune", "Legacy editor code in src/legacy is frozen. Do not edit.", 1, 0, 8),
];

export const SAMPLE_MEMORY_HISTORY: MemoryHistoryRow[] = [
  { id: 31, memory_id: "mem_05", action: "created", text: "Errors follow RFC 7807 problem+json in HTTP handlers.", created_at: daysAgoAt(2, 12) },
  { id: 30, memory_id: "mem_08", action: "disabled", text: "Legacy editor code in src/legacy is frozen. Do not edit.", created_at: daysAgoAt(3, 9) },
  { id: 29, memory_id: "mem_04", action: "updated", text: "Run go test ./... before proposing any commit.", created_at: daysAgoAt(3, 8) },
  { id: 28, memory_id: "mem_06", action: "created", text: "Staging pushes go to release/staging, never to main.", created_at: daysAgoAt(3, 18) },
  { id: 27, memory_id: "mem_10", action: "merged", text: "Two duplicates about pnpm merged into one.", created_at: daysAgoAt(6, 10) },
];
