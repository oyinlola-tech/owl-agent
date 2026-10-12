import type { VerificationRun, VerificationSummary } from "../../../services/agentApi.types";

type VerificationState = "verified" | "unverified" | "running" | "failed" | "pending" | "none";

export const joinCommandArgs = (argv: string[]) => argv.join(" ");

export const formatRunDuration = (ms: number | null | undefined) =>
  ms == null ? "" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)}s`;

export const formatRunClockTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";

export function latestByRequirement(runs: VerificationRun[]): Map<string, VerificationRun> {
  const latestRuns = new Map<string, VerificationRun>();
  for (const run of runs) {
    const previous = latestRuns.get(run.requirement_id);
    if (!previous || run.attempt > previous.attempt || (run.attempt === previous.attempt && run.started_at > previous.started_at)) {
      latestRuns.set(run.requirement_id, run);
    }
  }
  return latestRuns;
}

export function verificationState(taskStatus: string, summary: VerificationSummary | undefined, runs: VerificationRun[]): VerificationState {
  if (taskStatus === "verified_completed") return "verified";
  if (runs.some((run) => run.status === "running")) return "running";
  if (taskStatus === "completed_unverified") return "unverified";
  const latest = latestByRequirement(runs);
  if ([...latest.values()].some((run) => run.required && run.status !== "passed")) return "failed";
  if (summary && summary.attempts > 0) return "pending";
  return "none";
}

export function describeEvent(type: string, data: Record<string, unknown> = {}): string | null {
  const command = String(data.command ?? data.kind ?? "check");
  switch (type) {
    case "verification.started":
      return "OWL finished the implementation and is independently verifying it.";
    case "verification.requirement.started":
      return `Running: ${command}`;
    case "verification.requirement.completed": {
      const status = String(data.status ?? "");
      if (status === "passed") return `✓ ${command} passed${data.duration_ms != null ? ` in ${formatRunDuration(Number(data.duration_ms))}` : ""}`;
      if (status === "failed") return `✕ ${command} failed with exit code ${data.exit_code ?? "?"}`;
      if (status === "timeout") return `✕ ${command} timed out`;
      if (status === "error") return `✕ ${command} couldn't run`;
      return `${command}: ${status || "finished"}`;
    }
    case "verification.failed": {
      const attempt = Number(data.attempt ?? 0);
      const maxAttempts = Number(data.max_attempts ?? 0);
      return maxAttempts && attempt >= maxAttempts
        ? `Verification failed ${attempt} times. OWL stopped and is waiting for you.`
        : "OWL is reviewing the actual error output before continuing.";
    }
    case "verification.completed":
      return data.verified ? "Verified: every required check passed." : `Completed, not verified. ${String(data.reason ?? "")}`.trim();
    case "step.added":
      return `New step: ${String(data.title ?? "")}`;
    case "task.awaiting_approval":
      return data.verification ? "Waiting for your approval to run verification." : "Waiting for your approval.";
    default:
      return null;
  }
}
