import type { ApprovalRead, BackendTask, JournalRow, TaskDetail, UsageRow } from "../agentApi.types";
import { daysAgoAt, minutesFromNow } from "./sampleMode.helper";
import { SAMPLE_VERIFICATION } from "./sampleVerification.data";

export const SAMPLE_BACKEND_TASKS: BackendTask[] = [
  {
    id: "tsk_8f2a91c4", prompt: "Add JWT authentication to the ZudoMart API with refresh tokens and tests",
    project: "ZudoMart", status: "awaiting_approval", progress: 64, message_count: 14,
    model: "nvidia/llama-3.1-nemotron-70b-instruct", routing: "auto classified 'code', needs ['code', 'tools']",
    created_at: daysAgoAt(0, 9, 12), updated_at: daysAgoAt(0, 9, 41),
  },
  {
    id: "tsk_5c07de13", prompt: "Fix the checkout rounding bug when a coupon and VAT apply together",
    project: "ZudoMart", status: "running", progress: 38, message_count: 9,
    model: "nvidia/llama-3.1-nemotron-70b-instruct", routing: "auto classified 'debug', needs ['code', 'tools']",
    created_at: daysAgoAt(0, 10, 5), updated_at: daysAgoAt(0, 10, 22),
  },
  {
    id: "tsk_3e91a0b5", prompt: "Add a VAT rounding helper to the ProofLens billing service, with tests",
    project: "ProofLens", status: "running", progress: 86, message_count: 17,
    model: "nvidia/llama-3.1-nemotron-70b-instruct", routing: "auto classified 'code', needs ['code', 'tools']",
    verification_note: "Required checks not passing: .venv/bin/python -m pytest -q",
    created_at: daysAgoAt(0, 8, 2), updated_at: daysAgoAt(0, 8, 51),
  },
  {
    id: "tsk_1be4470a", prompt: "Raise the ProofLens API client timeout and add retry with backoff",
    project: "ProofLens", status: "verified_completed", progress: 100, message_count: 21,
    model: "nvidia/llama-3.1-nemotron-70b-instruct", routing: "auto classified 'code', needs ['code', 'tools']",
    verified_at: daysAgoAt(1, 17, 3), created_at: daysAgoAt(1, 16, 40), updated_at: daysAgoAt(1, 17, 3),
  },
  {
    id: "tsk_9d33b2f8", prompt: "Summarise the Scriptune repository structure and owners for onboarding",
    project: "Scriptune", status: "completed_unverified", progress: 100, message_count: 6,
    verification_note: "No reliable project verification command was detected.",
    model: "nvidia/llama-3.1-nemotron-70b-instruct", routing: "auto classified 'big_context', needs ['long_context']",
    created_at: daysAgoAt(2, 11, 15), updated_at: daysAgoAt(2, 11, 24),
  },
  {
    id: "tsk_0a6e5d27", prompt: "Deploy ZudoMart to staging and push the image tag",
    project: "ZudoMart", status: "failed", progress: 41, message_count: 11,
    model: "nvidia/llama-3.1-nemotron-70b-instruct", routing: "pinned by user",
    created_at: daysAgoAt(3, 18, 2), updated_at: daysAgoAt(3, 18, 13),
  },
  {
    id: "tsk_77c1e902", prompt: "Recreate the example.com pricing page as a React component",
    project: "Scriptune", status: "paused", progress: 52, message_count: 8,
    model: "nvidia/llama-3.1-nemotron-70b-instruct", routing: "auto classified 'multimodal', needs ['vision']",
    created_at: daysAgoAt(4, 14, 30), updated_at: daysAgoAt(4, 15, 2),
  },
];

const approval = (a: Partial<ApprovalRead> & Pick<ApprovalRead, "id" | "title" | "kind">): ApprovalRead => ({
  command: null, files: [], reason: "", risk: "Low", action: "", args_hash: "", scope: "once", targets: [],
  expires_at: minutesFromNow(25), consumed_at: null, status: "pending", decided_by: "", created_at: daysAgoAt(0, 9, 40),
  decided_at: null, ...a,
});

export const SAMPLE_APPROVALS_BY_TASK: Record<string, ApprovalRead[]> = {
  tsk_8f2a91c4: [
    approval({
      id: "apr_31d0", title: "Write 3 files", kind: "files", action: "fs_create",
      files: ["src/auth/service.go", "src/auth/jwt.go", "src/auth/middleware.go"],
      reason: "New authentication layer: password hashing, token issue, route guard.", risk: "Low",
    }),
    approval({
      id: "apr_31d1", title: "Run the test suite", kind: "command", action: "exec_run",
      command: "go test ./...", reason: "Verify the new auth package and existing handlers.", risk: "Low",
    }),
  ],
  tsk_5c07de13: [
    approval({
      id: "apr_52a7", title: "Edit checkout totals", kind: "files", action: "fs_apply_edit",
      files: ["src/checkout/totals.go"], reason: "Apply VAT after the coupon discount, round once at the end.",
      risk: "Medium", created_at: daysAgoAt(0, 10, 20),
    }),
  ],
  tsk_0a6e5d27: [
    approval({
      id: "apr_90ee", title: "Push to remote", kind: "privileged", action: "git_push",
      command: "git push origin release/staging", reason: "Staging deploy reads from release/staging.",
      risk: "High", status: "rejected", decided_by: "local-user", decided_at: daysAgoAt(3, 18, 12), expires_at: null,
    }),
  ],
  tsk_1be4470a: [
    approval({
      id: "apr_11c2", title: "Edit API client", kind: "files", action: "fs_apply_edit", files: ["src/api/client.ts"],
      reason: "Timeout from 5s to 20s, retry 3 times with jittered backoff.", status: "approved",
      decided_by: "local-user", decided_at: daysAgoAt(1, 16, 52), expires_at: null,
    }),
  ],
};

const SAMPLE_TASK_DETAILS: Record<string, {
  steps: { title: string; status: string }[];
  tool_calls: { id: string; tool: string; status: string; exit_code: number | null; duration_ms: number; output_excerpt: string; created_at: string }[];
  checkpoints: { id: string; label: string; created_at: string }[];
  usage: UsageRow[];
}> = {};

const usage = (id: number, task: string, inT: number, outT: number, ms: number, d: number, h: number, extra: Partial<UsageRow> = {}): UsageRow => ({
  id, task_id: task, model: "nvidia/llama-3.1-nemotron-70b-instruct", requested_model: "auto",
  routing_reason: "auto classified 'code'", input_tokens: inT, output_tokens: outT, estimated: 0,
  duration_ms: ms, retries: 0, error: "", created_at: daysAgoAt(d, h), ...extra,
});

export const SAMPLE_USAGE: UsageRow[] = [
  usage(48, "tsk_8f2a91c4", 18420, 2210, 9120, 0, 9),
  usage(47, "tsk_8f2a91c4", 12950, 1680, 7340, 0, 9),
  usage(46, "tsk_5c07de13", 9870, 940, 4410, 0, 10),
  usage(45, "tsk_1be4470a", 7310, 1120, 5030, 1, 16),
  usage(44, "tsk_1be4470a", 6020, 610, 2980, 1, 16),
  usage(43, "tsk_9d33b2f8", 61200, 3480, 21400, 2, 11, { routing_reason: "auto classified 'big_context'" }),
  usage(42, "tsk_0a6e5d27", 5400, 420, 2650, 3, 18, { retries: 1 }),
  usage(41, "tsk_0a6e5d27", 5100, 0, 30000, 3, 18, { error: "upstream timeout after 30s", estimated: 1, retries: 2 }),
  usage(40, "tsk_77c1e902", 14200, 2650, 11900, 4, 14, { routing_reason: "auto classified 'multimodal'" }),
];

SAMPLE_TASK_DETAILS.tsk_8f2a91c4 = {
  steps: [
    { title: "Index the repository", status: "completed" },
    { title: "Read the user model and routes", status: "completed" },
    { title: "Propose the auth package", status: "completed" },
    { title: "Write files after approval", status: "awaiting_approval" },
    { title: "Run go test ./...", status: "pending" },
    { title: "Checkpoint and summarise", status: "pending" },
  ],
  tool_calls: [
    { id: "tc1", tool: "fs_list", status: "ok", exit_code: null, duration_ms: 42, output_excerpt: "src/ tests/ go.mod", created_at: daysAgoAt(0, 9, 13) },
    { id: "tc2", tool: "fs_read", status: "ok", exit_code: null, duration_ms: 18, output_excerpt: "type User struct {", created_at: daysAgoAt(0, 9, 14) },
    { id: "tc3", tool: "fs_search", status: "ok", exit_code: null, duration_ms: 95, output_excerpt: "3 matches for Login(", created_at: daysAgoAt(0, 9, 15) },
    { id: "tc4", tool: "git_status", status: "ok", exit_code: 0, duration_ms: 61, output_excerpt: "clean", created_at: daysAgoAt(0, 9, 16) },
    { id: "tc5", tool: "fs_create", status: "awaiting_approval", exit_code: null, duration_ms: 0, output_excerpt: "", created_at: daysAgoAt(0, 9, 40) },
  ],
  checkpoints: [
    { id: "ck_a3f9c21", label: "Before auth changes", created_at: daysAgoAt(0, 9, 39) },
  ],
  usage: SAMPLE_USAGE.filter((u) => u.task_id === "tsk_8f2a91c4"),
};

SAMPLE_TASK_DETAILS.tsk_3e91a0b5 = {
  steps: [
    { title: "Read the billing module and its tests", status: "completed" },
    { title: "Add round_vat with ROUND_HALF_UP", status: "completed" },
    { title: "Add tests for edge cases", status: "completed" },
    { title: "Fix failing tests: .venv/bin/python -m pytest -q", status: "completed" },
    { title: "Fix failing tests: .venv/bin/python -m pytest -q", status: "running" },
  ],
  tool_calls: [
    { id: "tv1", tool: "fs_read", status: "ok", exit_code: null, duration_ms: 21, output_excerpt: "def total(lines):", created_at: daysAgoAt(0, 8, 5) },
    { id: "tv2", tool: "fs_create", status: "ok", exit_code: 0, duration_ms: 14, output_excerpt: "billing/vat.py", created_at: daysAgoAt(0, 8, 20) },
    { id: "tv3", tool: "fs_create", status: "ok", exit_code: 0, duration_ms: 12, output_excerpt: "tests/test_vat.py", created_at: daysAgoAt(0, 8, 24) },
    { id: "tv4", tool: "fs_apply_edit", status: "ok", exit_code: 0, duration_ms: 16, output_excerpt: "billing/vat.py", created_at: daysAgoAt(0, 8, 40) },
  ],
  checkpoints: [
    { id: "ck_3e91a01", label: "verification-failed", created_at: daysAgoAt(0, 8, 31) },
    { id: "ck_3e91a02", label: "verification-failed", created_at: daysAgoAt(0, 8, 50) },
  ],
  usage: [],
};

export function sampleTaskDetailFor(id: string): TaskDetail {
  const task = SAMPLE_BACKEND_TASKS.find((t) => t.id === id) ?? SAMPLE_BACKEND_TASKS[0];
  const d = SAMPLE_TASK_DETAILS[task.id] ?? {
    steps: [{ title: "Plan", status: "completed" }, { title: "Implement", status: task.status.startsWith("completed") || task.status === "verified_completed" ? "completed" : "running" }],
    tool_calls: [],
    checkpoints: [{ id: `ck_${task.id.slice(4, 11)}`, label: "Before changes", created_at: task.created_at }],
    usage: SAMPLE_USAGE.filter((u) => u.task_id === task.id),
  };
  const v = SAMPLE_VERIFICATION[task.id];
  return { task, ...d, ...(v ?? {}) };
}

export const SAMPLE_JOURNAL: Record<string, JournalRow[]> = {
  tsk_1be4470a: [
    { id: "jr_7701", path: "src/api/client.ts", approval_id: "apr_11c2", applied_at: daysAgoAt(1, 16, 53), reverted_at: null, before_bytes: 1840, after_bytes: 2615 },
    { id: "jr_7702", path: "src/api/client.test.ts", approval_id: "apr_11c2", applied_at: daysAgoAt(1, 16, 55), reverted_at: null, before_bytes: null, after_bytes: 1932 },
  ],
  tsk_9d33b2f8: [
    { id: "jr_6610", path: "docs/ONBOARDING.md", approval_id: "apr_6610", applied_at: daysAgoAt(2, 11, 22), reverted_at: null, before_bytes: null, after_bytes: 5120 },
  ],
  tsk_0a6e5d27: [
    { id: "jr_5521", path: "deploy/staging.yaml", approval_id: "apr_5521", applied_at: daysAgoAt(3, 18, 6), reverted_at: daysAgoAt(3, 18, 14), before_bytes: 940, after_bytes: 1012 },
  ],
};
