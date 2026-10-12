import type { ChangeFile } from "../../../state/workspace.types";

type ChangeDecision = "pending" | "accepted" | "rejected";

interface ChangeDecisionSummary {
  accepted: number;
  rejected: number;
  pending: number;
}

export function summarizeChangeDecisions(
  changes: ChangeFile[],
  decisions: Record<string, ChangeDecision>,
): ChangeDecisionSummary {
  const summary: ChangeDecisionSummary = { accepted: 0, rejected: 0, pending: 0 };
  for (const change of changes) summary[decisions[change.path] ?? "pending"] += 1;
  return summary;
}

export function describeChangeDecisions(summary: ChangeDecisionSummary): string {
  const parts = [`${summary.accepted} accepted`];
  if (summary.rejected > 0) parts.push(`${summary.rejected} rejected`);
  parts.push(`${summary.pending} to review`);
  return parts.join(" · ");
}
