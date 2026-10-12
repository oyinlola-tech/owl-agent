import { Check, FileText, FolderSimple, ShieldWarning, Terminal, Timer, X, type Icon } from "@phosphor-icons/react";
import { Tag, type Hue } from "../../../shared/components/tag.component";
import { FilePath } from "../../components/filePath.component";
import { formatClockTime, formatRelativeTime } from "../../../shared/helpers/time.helper";
import type { InboxItem } from "./inboxApproval.types";

const APPROVAL_KIND_STYLE: Record<InboxItem["kind"], { icon: Icon; hue: Hue; label: string }> = {
  files: { icon: FileText, hue: "yellow", label: "File changes" },
  command: { icon: Terminal, hue: "purple", label: "Command" },
  privileged: { icon: ShieldWarning, hue: "red", label: "Privileged" },
};
const RISK_HUE: Record<InboxItem["risk"], Hue> = { Low: "green", Medium: "yellow", High: "red" };

interface ApprovalCardProps {
  item: InboxItem;
  isSelected: boolean;
  now: number;
  onSelect: () => void;
  onDecide: (approved: boolean) => void;
}

export function ApprovalCard({ item, isSelected, now, onSelect, onDecide }: ApprovalCardProps) {
  const kindStyle = APPROVAL_KIND_STYLE[item.kind];
  const isPending = item.status === "pending";
  const isExpired = isPending && item.expires_at !== null && new Date(item.expires_at).getTime() < now;
  return (
    <article id={`x-ap-${item.key}`}
      className={`x-ap${isPending ? " pending" : ""}${isSelected ? " sel" : ""}`}
      onClick={onSelect}>
      <span className={`tile ${kindStyle.hue}`}><kindStyle.icon size={16} weight="duotone" /></span>
      <div className="x-ap-body">
        <div className="x-ap-top">
          <h4>{item.title}</h4>
          <Tag hue={RISK_HUE[item.risk]}>{item.risk} risk</Tag>
          <span className="x-ap-kind">{kindStyle.label}</span>
        </div>
        {item.reason && <p className="x-ap-reason">{item.reason}</p>}
        {item.command && <div className="x-cmd"><span>$</span>{item.command}</div>}
        {item.files.length > 0 && (
          <ul className="x-files">{item.files.map((file) => <li key={file}><FilePath path={file} /></li>)}</ul>
        )}
        <div className="x-ap-meta">
          {item.dir && <span><FolderSimple size={13} /> {item.dir}</span>}
          <span>Scope: {item.scope === "once" ? "this request only" : item.scope}</span>
          {isPending && item.expires_at && (
            <span className={isExpired ? "x-warn" : ""}><Timer size={13} /> {isExpired ? "Expired — OWL will ask again" : `Expires ${formatRelativeTime(item.expires_at, now)}`}</span>
          )}
          {!isPending && (
            <span>{item.status === "approved" ? "Approved" : item.status === "rejected" ? "Rejected" : "Expired"}
              {item.decided_by ? ` by ${item.decided_by === "local-user" ? "you" : item.decided_by}` : ""}
              {item.decided_at ? ` · ${formatRelativeTime(item.decided_at, now)} at ${formatClockTime(item.decided_at)}` : ""}</span>
          )}
        </div>
      </div>
      <div className="x-ap-acts">
        {isPending && !isExpired ? (
          <>
            <button className="btn btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); onDecide(false); }}>
              <X size={14} /> Reject
            </button>
            <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); onDecide(true); }}>
              <Check size={14} weight="bold" /> Approve
            </button>
          </>
        ) : (
          <Tag hue={item.status === "approved" ? "green" : item.status === "rejected" ? "red" : "gray"} dot>
            {isExpired ? "Expired" : item.status[0].toUpperCase() + item.status.slice(1)}
          </Tag>
        )}
      </div>
    </article>
  );
}
