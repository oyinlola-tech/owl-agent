import { ArrowClockwise, FileText, GitDiff, Tray } from "@phosphor-icons/react";
import { useAppStore } from "../../../state/app.store";
import { EmptyState } from "../../../../shared/components/pageLayout.component";
import { Tag, type Hue } from "../../../../shared/components/tag.component";
import { FileGlyph } from "../explorer/fileGlyph.component";
import { refreshChanges } from "../../../state/workspaceTaskEngine";
import "../editor/editor.style.css";

const CHANGE_STATUS_STYLES: Record<"M" | "A" | "D", { hue: Hue; label: string }> = {
  M: { hue: "yellow", label: "Modified" },
  A: { hue: "green", label: "Added" },
  D: { hue: "red", label: "Deleted" },
};

export function ChangesReviewPanel() {
  const changes = useAppStore((s) => s.changes);
  const project = useAppStore((s) => s.project);
  const openFile = useAppStore((s) => s.openFile);
  const goToScreen = useAppStore((s) => s.goToScreen);
  const refresh = () => {
    if (!project) return;
    void refreshChanges({
      appendChat: () => {}, appendTerminal: () => {}, setSteps: () => {}, getSteps: () => [],
      setApprovals: () => {}, setChanges: (list) => useAppStore.setState({ changes: list }),
      setStatus: () => {}, setProgress: () => {}, getTaskId: () => useAppStore.getState().taskId,
      getProjectId: () => project.id, notice: () => {},
    });
  };
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
          <span>Working-tree changes in {project?.name ?? "this project"}. Approvals are reviewed in the inbox.</span>
        </div>
        <span className="grow" />
        <button className="btn btn-ghost btn-sm" onClick={refresh}><ArrowClockwise size={13} /> Refresh</button>
      </div>
      {changes.map((change) => {
        const statusStyle = CHANGE_STATUS_STYLES[change.status];
        return (
          <article key={change.path} className="diff">
            <header>
              <Tag hue={statusStyle.hue}>{change.status}</Tag>
              <FileGlyph name={change.path} size={14} />
              <span className="diff-path mono">{change.path}</span>
              <span className="grow" />
              {change.status !== "D" && (
                <button className="btn btn-sm btn-ghost" onClick={() => openFile(change.path)}><FileText size={13} /> Open</button>
              )}
            </header>
          </article>
        );
      })}
    </div>
  );
}
