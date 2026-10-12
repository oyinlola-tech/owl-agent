export interface HealthRead {
  status: string;
  version: string;
  provider: string;
  provider_configured: boolean;
  approvals_enforced: boolean;
}

export interface ApprovalRead {
  id: string;
  title: string;
  kind: "files" | "command" | "privileged";
  command: string | null;
  files: string[];
  reason: string;
  risk: "Low" | "Medium" | "High";
  action: string;
  args_hash: string;
  scope: string;
  targets: string[];
  expires_at: string | null;
  consumed_at: string | null;
  status: "pending" | "approved" | "rejected" | "expired";
  decided_by: string;
  created_at: string;
  decided_at: string | null;
}

export interface ProviderRead {
  name: string;
  configured: boolean;
  model: string;
}

export interface VerifyRead {
  ok: boolean;
  provider: string;
  model: string;
  error: string;
  code: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ModelEntry {
  id: string;
  context_window: number | null;
  context_source: string;
  capabilities: string[];
  status: "available" | "verified" | "untested" | "unavailable" | "deprecated";
  last_seen: string;
  updated_at: string;
}

export interface RouteRead {
  model: string;
  reason: string;
  category: string;
}

export interface BudgetReport {
  model: string;
  limit: number;
  limit_source: string;
  used: number;
  reserved: number;
  available: number;
  utilization: number;
  over_budget: boolean;
  compress_at: number;
  should_compress: boolean;
  parts: { category: string; tokens: number }[];
}

export interface MemoryRow {
  id: string;
  category: "global" | "project" | "task" | "knowledge";
  project: string;
  text: string;
  confirmed: number;
  enabled: number;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface UsageRow {
  id: number;
  task_id: string;
  model: string;
  requested_model: string;
  routing_reason: string;
  input_tokens: number;
  output_tokens: number;
  estimated: number;
  duration_ms: number;
  retries: number;
  error: string;
  created_at: string;
}

export interface ToolRead {
  name: string;
  description: string;
  requires_approval: boolean;
}

export interface JournalRow {
  id: string;
  path: string;
  approval_id: string | null;
  applied_at: string;
  reverted_at: string | null;
  before_bytes: number | null;
  after_bytes: number | null;
}

export interface MemoryHistoryRow {
  id: number;
  memory_id: string;
  action: string;
  text: string;
  created_at: string;
}

export interface BackendTask {
  id: string;
  prompt: string;
  project: string;
  status: string;
  progress: number;
  message_count: number;
  model: string;
  routing: string;
  verification_note?: string;
  verified_at?: string | null;
  created_at: string;
  updated_at: string;
}

type VerificationKind = "tests" | "typecheck" | "lint" | "build" | "custom";
export type VerificationRunStatus =
  | "running" | "passed" | "failed" | "timeout" | "error" | "cancelled" | "interrupted";

export interface VerificationRequirement {
  id: string;
  kind: VerificationKind;
  argv: string[];
  cwd: string;
  source: string;
  detail: string;
  required: boolean;
  timeout: number;
  safe: boolean;
  unsafe_reason: string;
}

export interface VerificationRun {
  id: string;
  task_id: string;
  requirement_id: string;
  kind: VerificationKind;
  command: string[];
  working_directory: string;
  status: VerificationRunStatus;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  required: boolean;
  source: string;
  source_detail: string;
  attempt: number;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error: string;
  created_at: string;
}

export interface VerificationSummary {
  status: string;
  verified: boolean;
  verified_at: string | null;
  note: string;
  attempts: number;
  max_attempts: number;
  requirements: VerificationRequirement[];
}

export interface TaskDetail {
  task: BackendTask;
  steps: { title: string; status: string }[];
  tool_calls: { id: string; tool: string; status: string; exit_code: number | null; duration_ms: number; output_excerpt: string; created_at: string }[];
  checkpoints: { id: string; label: string; created_at: string }[];
  usage: UsageRow[];
    verification?: VerificationSummary;
  verifications?: VerificationRun[];
}

export interface SecurityStatusRead {
  platform: string;
  sandbox: {
    mode: string;
    backend: string;
    active: boolean;
    reason: string;
    self_test: {
      ran: boolean;
      passed: boolean;
      read_outside_blocked: boolean;
      network_blocked: boolean;
      workspace_write_ok: boolean;
      detail: string;
    };
    network_policy: { default: string; commands: string; verification: string };
    limits: { max_processes: number; cpu_seconds: number; memory_mb: number; open_files: number };
    protected: string[];
  };
  service_token: {
    required: boolean;
    source: string;
    dev_token_accepted: boolean;
    token_file_written: boolean;
    host_check: string;
    json_required_for_changes: boolean;
  };
  browser: { blocked: string[]; schemes: string[] };
}
