import { Check, GitBranch } from "@phosphor-icons/react";
import type { ApprovalRead, JournalRow, TaskDetail } from "../../../services/agentApi.types";
import { SectionTitle } from "../../../../shared/components/pageLayout.component";
import { StatusTag } from "../../../../shared/components/statusTag.component";
import { formatShortTimeAgo } from "../../../../shared/helpers/time.helper";
import { VerificationCallout } from "../verification/verificationPanel.component";

export function BackendTaskOverviewPanel({ detail, journal, decidedApprovals, totalTokens, onOpenVerification, onResume }: {
  detail: TaskDetail;
  journal: JournalRow[];
  decidedApprovals: ApprovalRead[];
  totalTokens: number;
  onOpenVerification: () => void;
  onResume: () => void;
}) {
  return (
    <>
      <div style={{ margin: "12px 0 4px" }}>
        <VerificationCallout taskStatus={detail.task.status} summary={detail.verification} runs={detail.verifications ?? []}
          onOpen={onOpenVerification} onResume={onResume} />
      </div>
      <div className="pg-blocks">
        <section>
          <SectionTitle count={detail.steps.length}>Plan</SectionTitle>
          {detail.steps.length === 0 ? <p className="pg-muted pg-p">The agent hasn't written a plan yet.</p> : (
            <ul className="pg-todo">
              {detail.steps.map((step, index) => {
                const done = step.status === "completed" || step.status === "done";
                return (
                  <li key={index} className={done ? "done" : step.status === "running" || step.status === "awaiting_approval" ? "now" : ""}>
                    <span className="box">{done && <Check size={11} weight="bold" />}</span>
                    <span className="txt">{step.title}</span>
                    {!done && <StatusTag status={step.status} />}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section>
          <SectionTitle count={detail.checkpoints.length}>Checkpoints</SectionTitle>
          {detail.checkpoints.length === 0 ? <p className="pg-muted pg-p">A checkpoint is saved before the first edit.</p> : (
            <ol className="pg-timeline">
              {detail.checkpoints.map((checkpoint) => (
                <li key={checkpoint.id}><i /><GitBranch size={14} color="var(--brown)" /><span style={{ flex: 1 }}>{checkpoint.label}</span>
                  <span className="pg-sm pg-muted">{formatShortTimeAgo(checkpoint.created_at)}</span></li>
              ))}
            </ol>
          )}
          {decidedApprovals.length > 0 && (
            <>
              <SectionTitle count={decidedApprovals.length}>Decisions</SectionTitle>
              <ul className="pg-decisions">
                {decidedApprovals.map((approval) => (
                  <li key={approval.id}><StatusTag status={approval.status} /><span>{approval.title}</span><span className="pg-sm pg-muted">{formatShortTimeAgo(approval.decided_at)}</span></li>
                ))}
              </ul>
            </>
          )}
        </section>
        <section className="full">
          <SectionTitle>Summary</SectionTitle>
          <div className="pg-kpis">
            <div><b>{detail.steps.filter((step) => step.status === "completed").length}/{detail.steps.length}</b><span>Steps done</span></div>
            <div><b>{detail.tool_calls.length}</b><span>Tool calls</span></div>
            <div><b>{journal.filter((row) => !row.reverted_at).length}</b><span>Files changed</span></div>
            <div><b>{totalTokens.toLocaleString()}</b><span>Tokens used</span></div>
          </div>
        </section>
      </div>
    </>
  );
}
