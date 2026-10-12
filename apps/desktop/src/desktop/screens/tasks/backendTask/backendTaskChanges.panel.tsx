import { ArrowCounterClockwise, GitBranch, Info } from "@phosphor-icons/react";
import type { JournalRow } from "../../../services/agentApi.types";
import { EmptyState } from "../../../../shared/components/pageLayout.component";
import { Tag } from "../../../../shared/components/tag.component";
import { formatShortTimeAgo } from "../../../../shared/helpers/time.helper";
import { fileIconForPath } from "../../../../shared/helpers/fileIcon.helper";

export function BackendTaskChangesPanel({ journal, onRevert }: { journal: JournalRow[]; onRevert: (row: JournalRow) => void }) {
  if (journal.length === 0) {
    return <EmptyState icon={GitBranch} hue="yellow" title="No files changed yet" body="Edits appear here after you approve them, each with a one-click revert." />;
  }
  return (
    <div className="pg-journal">
      {journal.map((row) => {
        const FileIcon = fileIconForPath(row.path).icon;
        const added = row.before_bytes === null;
        return (
          <div key={row.id} className={`pg-jrow${row.reverted_at ? " off" : ""}`}>
            <span className={`tag tag-${added ? "green" : "yellow"}`}>{added ? "Added" : "Modified"}</span>
            <span className="path"><FileIcon size={15} />{row.path}</span>
            <span className="pg-sm pg-muted">{row.before_bytes ?? 0} → {row.after_bytes ?? 0} bytes</span>
            <span className="pg-sm pg-muted">{formatShortTimeAgo(row.applied_at)}</span>
            <span className="acts">
              {row.reverted_at ? <Tag icon={ArrowCounterClockwise}>Reverted {formatShortTimeAgo(row.reverted_at)}</Tag>
                : <button className="btn btn-secondary btn-sm" onClick={() => onRevert(row)}><ArrowCounterClockwise size={13} /> Revert</button>}
            </span>
          </div>
        );
      })}
      <p className="pg-note" style={{ marginTop: 12 }}><Info size={14} /> Reverts stop safely if a file was edited after the agent changed it.</p>
    </div>
  );
}
