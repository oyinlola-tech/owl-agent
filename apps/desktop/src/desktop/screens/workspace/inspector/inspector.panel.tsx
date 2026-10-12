import { Check, CheckCircle, Circle, Eye, FolderOpen, GitDiff, ShieldCheck, Sparkle, Stack, X, type Icon } from "@phosphor-icons/react";
import { useAppStore } from "../../../state/app.store";
import { EmptyState } from "../../../../shared/components/pageLayout.component";
import { Tag, type Hue } from "../../../../shared/components/tag.component";
import { VerticalResizeHandle } from "../resizeHandle.component";
import { FileGlyph } from "../explorer/fileGlyph.component";
import { ContextBudgetPanel } from "./contextBudget.panel";
import "./inspector.style.css";

const INSPECTOR_TABS: { id: "agent" | "changes" | "tasks" | "context"; icon: Icon; label: string }[] = [
  { id: "agent", icon: Sparkle, label: "Activity" },
  { id: "tasks", icon: ShieldCheck, label: "Approvals" },
  { id: "changes", icon: GitDiff, label: "Changes" },
  { id: "context", icon: Stack, label: "Context" },
];

const RISK_LEVEL_HUES: Record<string, Hue> = { Low: "green", Medium: "yellow", High: "red" };

export function InspectorPanel() {
  const tab = useAppStore((s) => s.inspectorTab);
  const setInspectorTab = useAppStore((s) => s.setInspectorTab);
  const isOpen = useAppStore((s) => s.inspectorOpen);
  const toggleInspector = useAppStore((s) => s.toggleInspector);
  const agentEvents = useAppStore((s) => s.agentEvents);
  const approvals = useAppStore((s) => s.approvals);
  const changes = useAppStore((s) => s.changes);
  const decideApproval = useAppStore((s) => s.decideApproval);
  const setCenterTab = useAppStore((s) => s.setCenterTab);
  const inspectorWidth = useAppStore((s) => s.inspectorWidth);
  const setInspectorWidth = useAppStore((s) => s.setInspectorWidth);
  if (!isOpen) return null;
  const pendingApprovals = approvals.filter((approval) => approval.status === "pending");
  return (
    <>
      <VerticalResizeHandle onDrag={(deltaX) => setInspectorWidth(inspectorWidth - deltaX)} />
      <aside className="insp" style={{ width: inspectorWidth }}>
        <div className="itabs" role="tablist" aria-label="Inspector">
          {INSPECTOR_TABS.map((inspectorTab) => {
            const badgeCount = inspectorTab.id === "changes" ? changes.length : inspectorTab.id === "tasks" ? pendingApprovals.length : 0;
            return (
              <button key={inspectorTab.id} className={tab === inspectorTab.id ? "on" : ""} onClick={() => setInspectorTab(inspectorTab.id)} role="tab"
                aria-selected={tab === inspectorTab.id} title={inspectorTab.label} aria-label={inspectorTab.label}>
                <inspectorTab.icon size={14} weight={tab === inspectorTab.id ? "fill" : "regular"} />
                <span className="itab-label">{inspectorTab.label}</span>
                {badgeCount > 0 && <span className={`count${inspectorTab.id === "tasks" ? " count-hot" : ""}`}>{badgeCount}</span>}
              </button>
            );
          })}
          <button className="icon-x" onClick={toggleInspector} title="Close inspector" aria-label="Close inspector">
            <X size={13} />
          </button>
        </div>
        <div className="ibody">
          {tab === "agent" && (
            agentEvents.length === 0
              ? <EmptyState icon={Sparkle} hue="blue" title="No activity yet" body="Every file read, edit, and command shows up here as it happens." />
              : (
                <ol className="tl">
                  {agentEvents.map((event) => (
                    <li key={event.id} className={`tl-${event.state}`}>
                      <span className="tl-node">
                        {event.state === "done" ? <Check size={10} weight="bold" /> : event.state === "active" ? <span className="live-dot pulse" style={{ width: 6, height: 6 }} /> : <Circle size={6} weight="fill" />}
                      </span>
                      <div>
                        <div className="tl-label">{event.label}</div>
                        {event.detail && <div className="tl-detail mono">{event.detail}</div>}
                      </div>
                    </li>
                  ))}
                </ol>
              )
          )}
          {tab === "changes" && (
            changes.length === 0
              ? <EmptyState icon={GitDiff} hue="yellow" title="No changes yet" body="Proposed edits appear here before anything is written." />
              : changes.map((change) => (
                <button key={change.path} className="frow" onClick={() => setCenterTab("changes")}>
                  <span className={`chg chg-${change.status}`}>{change.status}</span>
                  <span className="fname mono">{change.path}</span>
                </button>
              ))
          )}
          {tab === "tasks" && (
            pendingApprovals.length > 0
              ? pendingApprovals.map((approval) => (
                <div key={approval.id} className="appr">
                  <div className="appr-head">
                    <span className="tile orange"><ShieldCheck size={15} weight="duotone" /></span>
                    <div>
                      <b>{approval.title}</b>
                      <small>{approval.reason}</small>
                    </div>
                  </div>
                  {approval.command && <pre className="appr-cmd"><span>$</span> {approval.command}</pre>}
                  {approval.files && (
                    <ul className="appr-files">
                      {approval.files.map((file) => <li key={file}><FileGlyph name={file} size={13} /><span className="mono">{file}</span></li>)}
                    </ul>
                  )}
                  <div className="appr-meta">
                    {approval.dir && <Tag icon={FolderOpen}>{approval.dir}</Tag>}
                    {approval.risk && <Tag hue={RISK_LEVEL_HUES[approval.risk] ?? "gray"} dot>{approval.risk} risk</Tag>}
                  </div>
                  <div className="appr-acts">
                    <button className="btn btn-sm btn-secondary" onClick={() => decideApproval(approval.id, "rejected")}>Reject</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setCenterTab("changes")}><Eye size={13} /> Diff</button>
                    <span className="grow" />
                    <button className="btn btn-sm btn-primary" onClick={() => decideApproval(approval.id, "approved")}><Check size={13} weight="bold" /> Approve</button>
                  </div>
                </div>
              ))
              : <EmptyState icon={CheckCircle} hue="green" title="Queue is clear" body="OWL asks here before writing files or running commands." />
          )}
          {tab === "context" && <ContextBudgetPanel />}
        </div>
      </aside>
    </>
  );
}
