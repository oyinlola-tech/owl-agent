import { SealCheck } from "@phosphor-icons/react";
import type { Hue } from "./tag.component";

const STATUS_STYLES: Record<string, { hue: Hue; label: string }> = {
  running: { hue: "blue", label: "Running" },
  awaiting_approval: { hue: "orange", label: "Needs approval" },
  awaiting: { hue: "orange", label: "Needs approval" },
  paused: { hue: "gray", label: "Paused" },
  completed: { hue: "green", label: "Completed" },
  completed_unverified: { hue: "yellow", label: "Completed, not verified" },
  verified_completed: { hue: "green", label: "Verified" },
  passed: { hue: "green", label: "Passed" },
  timeout: { hue: "red", label: "Timed out" },
  error: { hue: "red", label: "Couldn't run" },
  interrupted: { hue: "gray", label: "Interrupted" },
  done: { hue: "green", label: "Done" },
  failed: { hue: "red", label: "Failed" },
  cancelled: { hue: "gray", label: "Cancelled" },
  pending: { hue: "yellow", label: "Pending" },
  queued: { hue: "gray", label: "Queued" },
  approved: { hue: "green", label: "Approved" },
  rejected: { hue: "red", label: "Rejected" },
};

export function hueForStatus(s: string): Hue {
  return STATUS_STYLES[s]?.hue ?? "gray";
}

const FINISHED_TASK_STATUSES = ["completed", "completed_unverified", "verified_completed"] as const;
export function isFinishedStatus(status: string): boolean {
  return (FINISHED_TASK_STATUSES as readonly string[]).includes(status);
}

export function StatusTag({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { hue: "gray" as Hue, label: status.replace(/_/g, " ") };
  return (
    <span className={`tag tag-${s.hue}`}>
      {status === "verified_completed"
        ? <SealCheck size={12} weight="fill" aria-hidden="true" />
        : <span className={`live-dot${status === "running" ? " pulse" : ""}`} style={{ width: 6, height: 6 }} />}
      {s.label}
    </span>
  );
}
