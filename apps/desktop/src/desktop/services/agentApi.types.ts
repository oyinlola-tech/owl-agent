export interface ProjectStackCheck {
  kind: string;
  command: string;
  required: boolean;
  safe: boolean;
  unsafe_reason: string;
  source: string;
  runs: boolean;
}

export interface ProjectStack {
  languages?: string[];
  frameworks?: string[];
  package_manager?: string;
  checks?: ProjectStackCheck[];
  checks_note?: string;
  is_git_repository?: boolean;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  stack: ProjectStack;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
  exists: boolean;
}

export interface ProjectListRead {
  projects: Project[];
}

export interface ProjectCreateRead {
  project: Project;
  created: boolean;
}

export interface TreeEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  symlink: boolean;
  size: number;
  ignored: boolean;
}

export interface ProjectTree {
  path: string;
  entries: TreeEntry[];
  truncated: boolean;
  hidden: { ignored: number; sensitive: number };
}

export interface ProjectFileContent {
  path: string;
  content: string;
  size: number;
  sha256: string;
}

export interface FileSaveResult {
  path: string;
  bytes: number;
  sha256: string;
  journal_id: string;
  created: boolean;
  source: string;
}

export interface SearchResult {
  path: string;
  line: number;
  preview: string;
  kind: "name" | "content";
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  truncated: boolean;
  files_scanned: number;
}

export interface CommandRow {
  id: string;
  project_id: string;
  command: string;
  argv: string[];
  cwd: string;
  status: string;
  risk: string;
  risk_reason: string;
  sandboxed: boolean | null;
  sandbox_backend: string;
  network: boolean;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  duration_ms: number | null;
  started_at: string;
  completed_at: string | null;
  error: string;
}

export interface GitChange {
  path: string;
  index: string;
  worktree: string;
  status: string;
  original_path?: string;
}

export interface GitSummary {
  is_repo: boolean;
  branch?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  detached?: boolean;
  changed: GitChange[];
  changed_count?: number;
  truncated?: boolean;
  clean?: boolean;
  sandboxed?: boolean;
  sandbox_backend?: string;
}

export interface GitBranch {
  name: string;
  current: boolean;
}

export interface GitBranches {
  branches: GitBranch[];
  current: string;
  sandboxed?: boolean;
  sandbox_backend?: string;
}

export interface CommitMessageDraft {
  message: string;
  provider_configured: boolean;
  note?: string;
}

export interface BackupInfo {
  name: string;
  kind: string;
  created_at: string;
  bytes: number;
}

export interface DataStatus {
  data_dir: string;
  data_dir_overridden: boolean;
  database_path: string;
  database_bytes: number;
  directories: Record<string, string>;
  schema_version: number;
  latest_schema_version: number;
  journal_mode: string;
  foreign_keys: boolean;
  integrity: string;
  restore: string | null;
  migrated_from: string | null;
  notices: string[];
  log_file: string | null;
  backups: BackupInfo[];
  last_backup_at: string | null;
  backup_policy: { daily: number; weekly: number; event: number };
  counts: Record<string, number>;
}

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

export interface CustomToolRead {
  id: string;
  name: string;
  description: string;
  argv: string[];
  risk: "low" | "medium" | "high";
  project: string;
  enabled: boolean;
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

export type ProviderGroup = "cloud" | "local";
export type ProviderKeySource = "keyring" | "file" | "env" | null;

export interface ProviderCard {
  id: string;
  label: string;
  group: ProviderGroup;
  kind: string;
  description: string;
  key_url: string;
  how_to: string;
  requires_key: boolean;
  base_url: string;
  base_url_editable: boolean;
  has_key: boolean;
  key_hint: string | null;
  key_source: ProviderKeySource;
  key_read_only: boolean;
  model: string;
  default_model: string;
  models: string[];
  status: string;
  last_error: string | null;
  checked_at: string | null;
  active: boolean;
  options: { server_fallbacks?: boolean };
}

export interface ProviderKeyStorage {
  backend: string;
  detail: string;
}

export interface ProviderCardsRead {
  active: string;
  active_model: string;
  configured: boolean;
  key_storage: ProviderKeyStorage;
  providers: ProviderCard[];
}

export interface ProviderTestRead {
  ok: boolean;
  provider: string;
  latency_ms: number | null;
  model_count: number;
  models: string[];
  error: string;
  code: string;
}

export interface ProviderModelsRead {
  id: string;
  model: string;
  models: string[];
  fetched: boolean;
  error: string;
  code: string;
}

export interface LocalRunner {
  id: string;
  label: string;
  base_url: string;
  running: boolean;
  models: string[];
  latency_ms: number | null;
  error: string;
  how_to: string;
}

export interface ProviderActivation {
  active: string;
  model: string;
  provider: ProviderCard | null;
}

export interface UserProfile {
  display_name: string;
  role: string;
  experience: string;
  languages: string[];
  package_managers: string[];
  code_style: string;
  test_framework: string;
  commit_style: string;
  tone: string;
  projects_folder: string;
}

export interface UserProfileRead extends UserProfile {
  updated_at: string | null;
  is_empty: boolean;
}

export type OnboardingStep = "welcome" | "about_you" | "connect_model" | "first_project" | "safety_check" | "done";

export interface OnboardingRead {
  step: OnboardingStep;
  completed: boolean;
  skipped_steps: string[];
  updated_at: string | null;
  profile_empty: boolean;
  provider_configured: boolean;
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

export interface StackEntry {
  id: string;
  name: string;
  languages: string[];
  frameworks: string[];
  [key: string]: unknown;
}

export interface StackCatalogRead {
  count: number;
  stacks: StackEntry[];
}

export interface StackRecommendation {
  stack: StackEntry;
  fit_score: number;
  why: string;
  tradeoffs: string[];
  vs_runner_up: string;
  starter_command: string;
  verification_commands: string[];
  owl_support: string;
  experience_note: string;
}

export interface StackRecommendRead {
  ranked_by: string;
  recommendations: StackRecommendation[];
}
