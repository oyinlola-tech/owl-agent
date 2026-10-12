import { ClockCounterClockwise, FolderSimple } from "@phosphor-icons/react";
import { isFinishedStatus, StatusTag } from "../../../shared/components/statusTag.component";
import { Tag, type Hue } from "../../../shared/components/tag.component";

export interface TaskBoardCard { key: string; title: string; project: string; status: string; progress: number; model?: string; when?: string; open: () => void }

const TASK_BOARD_COLUMNS: { id: string; label: string; match: (status: string) => boolean; hue: Hue }[] = [
  { id: "running", label: "Running", match: (status) => status === "running" || status === "created", hue: "blue" },
  { id: "approval", label: "Needs approval", match: (status) => status === "awaiting_approval" || status === "awaiting", hue: "orange" },
  { id: "paused", label: "Paused", match: (status) => status === "paused", hue: "gray" },
  { id: "completed", label: "Completed", match: isFinishedStatus, hue: "green" },
  { id: "failed", label: "Failed or cancelled", match: (status) => status === "failed" || status === "cancelled", hue: "red" },
];

export function TaskBoard({ cards }: { cards: TaskBoardCard[] }) {
  return (
    <div className="pg-board" role="list">
      {TASK_BOARD_COLUMNS.map((column) => {
        const columnCards = cards.filter((card) => column.match(card.status));
        return (
          <section key={column.id} className="pg-col" aria-label={column.label}>
            <header><span className={`tag tag-${column.hue}`}><span className="dot" />{column.label}</span><span className="pg-count">{columnCards.length}</span></header>
            {columnCards.length === 0 ? <p className="pg-col-empty">Nothing here.</p> : columnCards.map((card) => (
              <button key={card.key} className="pg-card" onClick={card.open} role="listitem">
                <b>{card.title}</b>
                {column.id === "completed" && card.status !== "completed" && <StatusTag status={card.status} />}
                <span className="tags"><Tag icon={FolderSimple}>{card.project || "No project"}</Tag>{card.model && <Tag hue="purple">{card.model.split("/").pop()}</Tag>}</span>
                <span className="pg-progress">
                  <span className={`progress ${card.status === "failed" ? "red" : isFinishedStatus(card.status) ? "green" : ""}`}><i style={{ width: `${card.progress}%` }} /></span>
                  <span className="pg-pct">{card.progress}%</span>
                </span>
                {card.when && <span className="when"><ClockCounterClockwise size={13} /> {card.when}</span>}
              </button>
            ))}
          </section>
        );
      })}
    </div>
  );
}
