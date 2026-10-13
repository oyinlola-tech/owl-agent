import { useMemo, useState } from "react";
import { ArrowClockwise, Check, FileText, GitDiff, Tray, X } from "@phosphor-icons/react";
import { useAppStore } from "../../../state/app.store";
import { agentApi } from "../../../services/agentApi.service";
import { EmptyState } from "../../../../shared/components/pageLayout.component";
import { Tag, type Hue } from "../../../../shared/components/tag.component";
import { FileGlyph } from "../explorer/fileGlyph.component";
import { refreshChanges } from "../../../state/workspaceTaskEngine";
import type { ChangeFile } from "../../../state/workspace.types";
import { buildHunksFromTexts, composeAcceptedText } from "./diffHunks.helper";
import { describeChangeDecisions, summarizeChangeDecisions } from "./changeSummary.helper";
import "../editor/editor.style.css";

const CHANGE_STATUS_STYLES: Record<"M" | "A" | "D", { hue: Hue; label: string }> = {
  M: { hue: "yellow", label: "Modified" },
  A: { hue: "green", label: "Added" },
  D: { hue: "red", label: "Deleted" },
};

type FileDecision = "pending" | "accepted" | "rejected";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The OWL service didn't answer.";
}

function ChangeFileCard({ change, decision, onDecision, onChanged }: {
  change: ChangeFile;
  decision: FileDecision;
  onDecision: (path: string, decision: FileDecision) => void;
  onChanged: () => void;
}) {
  const project = useAppStore((s) => s.project);
  const openFile = useAppStore((s) => s.openFile);
  const showNotice = useAppStore((s) => s.showNotice);
  const statusStyle = CHANGE_STATUS_STYLES[change.status];
  const hunks = useMemo(
    () => buildHunksFromTexts(change.before, change.after),
    [change.before, change.after],
  );
  const [checked, setChecked] = useState<boolean[]>(() => hunks.map(() => true));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Selections default to checked; tolerate hunk lists that arrive later.
  const selection = hunks.map((_, index) => checked[index] ?? true);
  const selectedCount = selection.filter(Boolean).length;

  const toggleHunk = (index: number) => {
    setChecked(selection.map((value, i) => (i === index ? !value : value)));
  };

  const saveComposedText = (content: string, accepted: boolean, notice: string) => {
    if (!project || saving) return;
    setSaving(true);
    setError(null);
    agentApi.saveProjectFile(project.id, { path: change.path, content })
      .then(() => {
        onDecision(change.path, accepted ? "accepted" : "rejected");
        showNotice(notice);
        onChanged();
      })
      .catch((saveError: unknown) => {
        const message = errorMessage(saveError);
        setError(message);
        showNotice(`Couldn't save ${change.path}: ${message}`);
      })
      .finally(() => setSaving(false));
  };

  const rejectFile = () => {
    if (!project || saving) return;
    if (!change.before) {
      // Added files have nothing to restore; the file itself must be deleted by hand.
      onDecision(change.path, "rejected");
      showNotice(`Rejected ${change.path}. Delete the new file from the explorer to remove it.`);
      return;
    }
    saveComposedText(change.before, false, `Rejected changes in ${change.path}.`);
  };

  const acceptFile = () => {
    // Refusing every hunk is the same as rejecting the whole file.
    if (selectedCount === 0) {
      rejectFile();
      return;
    }
    // The file on disk already holds every hunk, so accepting all changes nothing.
    if (selectedCount === hunks.length) {
      onDecision(change.path, "accepted");
      return;
    }
    saveComposedText(
      composeAcceptedText(change.before, hunks, selection),
      true,
      `Accepted ${selectedCount} of ${hunks.length} hunks in ${change.path}.`,
    );
  };

  return (
    <article className={`diff${decision === "rejected" ? " diff-rejected" : decision === "accepted" ? " diff-accepted" : ""}`}>
      <header>
        <Tag hue={statusStyle.hue}>{change.status}</Tag>
        <FileGlyph name={change.path} size={14} />
        <span className="diff-path mono">{change.path}</span>
        <span className="grow" />
        {change.status !== "D" && (
          <button className="btn btn-sm btn-ghost" onClick={() => openFile(change.path)}><FileText size={13} /> Open</button>
        )}
      </header>
      {hunks.length > 0 ? (
        <div className="diff-body">
          {hunks.map((hunk, index) => (
            <section key={hunk.index} aria-label={`Hunk ${index + 1} of ${hunks.length} in ${change.path}`}>
              <label className="diff-meta">
                <input
                  type="checkbox"
                  checked={selection[index]}
                  onChange={() => toggleHunk(index)}
                  aria-label={`Include hunk ${index + 1} of ${hunks.length} from ${change.path}`}
                />
                Hunk {index + 1} · {hunk.header}
              </label>
              {hunk.lines.map((line, lineIndex) => (
                <div key={lineIndex} className={`dl${line.kind === "add" ? " add" : line.kind === "del" ? " del" : ""}`}>
                  <i>{line.oldLine ?? line.newLine ?? ""}</i>
                  <span>{line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}{line.text}</span>
                </div>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="diff-body">
          <div className="dl"><i /><span className="diff-meta">No hunk preview — open the file to review it.</span></div>
        </div>
      )}
      {hunks.length > 0 && (
        <footer>
          <span className="diff-meta">{selectedCount} of {hunks.length} hunks selected</span>
          {error && <span className="diff-meta" role="alert">{error}</span>}
          <span className="grow" />
          <button className="btn btn-sm btn-secondary" disabled={saving} onClick={rejectFile}><X size={12} weight="bold" /> Reject</button>
          <button className="btn btn-sm btn-primary" disabled={saving} onClick={acceptFile}>
            <Check size={12} weight="bold" /> {saving ? "Saving…" : "Accept selected"}
          </button>
        </footer>
      )}
    </article>
  );
}

export function ChangesReviewPanel() {
  const changes = useAppStore((s) => s.changes);
  const project = useAppStore((s) => s.project);
  const goToScreen = useAppStore((s) => s.goToScreen);
  const [decisions, setDecisions] = useState<Record<string, FileDecision>>({});
  const refresh = () => {
    if (!project) return;
    void refreshChanges({
      appendChat: () => {}, appendTerminal: () => {}, setSteps: () => {}, getSteps: () => [],
      setApprovals: () => {}, setChanges: (list) => useAppStore.setState({ changes: list }),
      setStatus: () => {}, setProgress: () => {}, getTaskId: () => useAppStore.getState().taskId,
      getProjectId: () => project.id, notice: () => {},
    });
  };
  const summary = describeChangeDecisions(summarizeChangeDecisions(changes, decisions));
  if (changes.length === 0) {
    return (
      <EmptyState icon={GitDiff} hue="yellow" title="No uncommitted changes"
        body="Edits OWL makes land as approvals you accept in the inbox. Once applied, changed files in this project's working tree show up here.">
        <button className="btn btn-secondary" onClick={refresh} disabled={!project}><ArrowClockwise size={14} /> Refresh</button>
        <button className="btn btn-secondary" onClick={() => goToScreen("inbox")}><Tray size={14} /> Open inbox</button>
      </EmptyState>
    );
  }
  return (
    <div className="changes">
      <div className="changes-head">
        <div>
          <b>{changes.length} file{changes.length === 1 ? "" : "s"} changed</b>
          <span>{summary} · Working-tree changes in {project?.name ?? "this project"}. Approvals are reviewed in the inbox.</span>
        </div>
        <span className="grow" />
        <button className="btn btn-ghost btn-sm" onClick={refresh}><ArrowClockwise size={13} /> Refresh</button>
      </div>
      {changes.map((change) => (
        <ChangeFileCard
          key={change.path}
          change={change}
          decision={decisions[change.path] ?? "pending"}
          onDecision={(path, decision) => setDecisions((prev) => ({ ...prev, [path]: decision }))}
          onChanged={refresh}
        />
      ))}
    </div>
  );
}
