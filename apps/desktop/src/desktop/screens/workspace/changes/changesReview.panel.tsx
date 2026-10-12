import { ArrowCounterClockwise, Check, Checks, GitDiff, Lightning, X, XCircle } from "@phosphor-icons/react";
import { useAppStore } from "../../../state/app.store";
import { EmptyState } from "../../../../shared/components/pageLayout.component";
import { StatusTag } from "../../../../shared/components/statusTag.component";
import { Tag, type Hue } from "../../../../shared/components/tag.component";
import { FileGlyph } from "../explorer/fileGlyph.component";
import { describeChangeDecisions, summarizeChangeDecisions } from "./changeSummary.helper";
import "../editor/editor.style.css";

const CHANGE_STATUS_STYLES: Record<"M" | "A" | "D", { hue: Hue; label: string }> = {
  M: { hue: "yellow", label: "Modified" },
  A: { hue: "green", label: "Added" },
  D: { hue: "red", label: "Deleted" },
};

export function ChangesReviewPanel() {
  const changes = useAppStore((s) => s.changes);
  const fileChangeDecisions = useAppStore((s) => s.fileChangeDecisions);
  const decideFileChange = useAppStore((s) => s.decideFileChange);
  const undoLastFileChange = useAppStore((s) => s.undoLastFileChange);
  const fileChangeHistory = useAppStore((s) => s.fileChangeHistory);
  if (changes.length === 0) {
    return (
      <EmptyState icon={GitDiff} hue="yellow" title="No changes to review"
        body="When OWL proposes edits, each file shows up here as a diff you accept or reject.">
        <button className="btn btn-primary" onClick={() => useAppStore.getState().runSampleTask()}><Lightning size={14} weight="fill" /> Run sample task</button>
      </EmptyState>
    );
  }
  const decisionSummary = summarizeChangeDecisions(changes, fileChangeDecisions);
  const acceptedCount = decisionSummary.accepted;
  return (
    <div className="changes">
      <div className="changes-head">
        <div>
          <b>{changes.length} files changed</b>
          <span>{describeChangeDecisions(decisionSummary)}</span>
        </div>
        <button className="btn btn-ghost btn-sm" disabled={fileChangeHistory.length === 0} onClick={undoLastFileChange}>
          <ArrowCounterClockwise size={13} /> Undo{fileChangeHistory.length > 0 ? ` (${fileChangeHistory.length})` : ""}
        </button>
        <button className="btn btn-secondary btn-sm" disabled={changes.every((change) => fileChangeDecisions[change.path] === "rejected")}
          onClick={() => changes.forEach((change) => { if (fileChangeDecisions[change.path] !== "rejected") decideFileChange(change.path, "rejected"); })}>
          <XCircle size={14} style={{ color: "var(--red)" }} /> Reject all
        </button>
        <button className="btn btn-primary btn-sm" disabled={acceptedCount === changes.length}
          onClick={() => changes.forEach((change) => { if (fileChangeDecisions[change.path] !== "accepted") decideFileChange(change.path, "accepted"); })}>
          <Checks size={14} weight="bold" /> Accept all
        </button>
      </div>
      {changes.map((change) => {
        const decision = fileChangeDecisions[change.path] ?? "pending";
        const statusStyle = CHANGE_STATUS_STYLES[change.status];
        return (
          <article key={change.path} className={`diff diff-${decision}`}>
            <header>
              <Tag hue={statusStyle.hue}>{change.status}</Tag>
              <FileGlyph name={change.path} size={14} />
              <span className="diff-path mono">{change.path}</span>
              <span className="grow" />
              {decision !== "pending" && <StatusTag status={decision} />}
            </header>
            <div className="diff-body mono">
              {change.before && <div className="dl del"><i>−</i><span>{change.before}</span></div>}
              {change.after && <div className="dl add"><i>+</i><span>{change.after}</span></div>}
            </div>
            <footer>
              <button className="btn btn-sm btn-secondary" disabled={decision === "accepted"} onClick={() => decideFileChange(change.path, "accepted")}>
                <Check size={13} weight="bold" style={{ color: "var(--green)" }} /> Accept
              </button>
              <button className="btn btn-sm btn-secondary" disabled={decision === "rejected"} onClick={() => decideFileChange(change.path, "rejected")}>
                <X size={13} weight="bold" style={{ color: "var(--red)" }} /> Reject
              </button>
              {decision !== "pending" && (
                <button className="btn btn-sm btn-ghost" onClick={() => decideFileChange(change.path, "pending")}>
                  <ArrowCounterClockwise size={13} /> Revert
                </button>
              )}
              <span className="grow" />
              <span className="diff-meta">{statusStyle.label}</span>
            </footer>
          </article>
        );
      })}
    </div>
  );
}
