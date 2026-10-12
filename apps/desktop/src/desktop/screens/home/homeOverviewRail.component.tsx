import {
  ArrowRight, BookOpenText, CaretRight, ChartBar, Check, CheckCircle, Eye, Keyboard, PencilSimple, ShieldWarning,
  Sparkle, SpinnerGap, Tray, X,
} from "@phosphor-icons/react";
import { useAppStore } from "../../state/app.store";
import type { Approval } from "../../state/workspace.types";
import { StatusTag } from "../../../shared/components/statusTag.component";
import { Tag, Tile } from "../../../shared/components/tag.component";
import type { PendingBackendApproval } from "./backendWork.hook";

interface HomeOverviewRailProps {
  localPendingApprovals: Approval[];
  backendPendingApprovals: PendingBackendApproval[];
  pendingCount: number;
  runningCount: number;
  completedCount: number;
}

export function HomeOverviewRail({
  localPendingApprovals, backendPendingApprovals, pendingCount, runningCount, completedCount,
}: HomeOverviewRailProps) {
  const goToScreen = useAppStore((s) => s.goToScreen);
  const decideApproval = useAppStore((s) => s.decideApproval);
  const openTask = useAppStore((s) => s.openTask);
  const openBackendTask = useAppStore((s) => s.openBackendTask);
  const tasks = useAppStore((s) => s.tasks);
  const project = useAppStore((s) => s.project);
  const currentTask = tasks[0];

  return (
    <aside className="pg-home-rail" aria-label="Overview">
      <section className="pg-rail-card">
        <header><Tray size={16} /><b>Needs you</b>{pendingCount > 0 && <span className="pg-badge">{pendingCount}</span>}</header>
        {pendingCount === 0 ? (
          <p className="pg-rail-empty"><CheckCircle size={16} color="var(--green)" weight="duotone" /> Nothing is waiting on you.</p>
        ) : (
          <ul className="pg-needs">
            {localPendingApprovals.slice(0, 2).map((approval) => (
              <li key={approval.id}>
                <span className="t"><ShieldWarning size={15} color="var(--orange)" weight="duotone" /><b>{approval.title}</b></span>
                <span className="s">{approval.command ? <code>{approval.command}</code> : `${approval.files?.length ?? 0} files · ${project?.name ?? "ZudoMart"}`}</span>
                <span className="r">
                  <button className="btn btn-ghost btn-sm" onClick={() => decideApproval(approval.id, "rejected")}><X size={13} /> Reject</button>
                  <button className="btn btn-primary btn-sm" onClick={() => decideApproval(approval.id, "approved")}><Check size={13} weight="bold" /> Approve</button>
                </span>
              </li>
            ))}
            {backendPendingApprovals.slice(0, Math.max(0, 3 - localPendingApprovals.length)).map(({ task, approval }) => (
              <li key={approval.id}>
                <span className="t"><ShieldWarning size={15} color="var(--orange)" weight="duotone" /><b>{approval.title}</b></span>
                <span className="s">{approval.command ? <code>{approval.command}</code> : task.prompt}</span>
                <span className="r">
                  <Tag hue={approval.risk === "High" ? "red" : approval.risk === "Medium" ? "yellow" : "green"}>{approval.risk} risk</Tag>
                  <span className="grow" />
                  <button className="btn btn-secondary btn-sm" onClick={() => openBackendTask(task.id)}><Eye size={13} /> Review</button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <button className="btn btn-ghost btn-sm pg-rail-more" onClick={() => goToScreen("inbox")}>Open inbox <ArrowRight size={13} /></button>
      </section>

      <section className="pg-rail-card">
        <header><ChartBar size={16} /><b>At a glance</b></header>
        <div className="pg-glance">
          <button className="pg-stat" onClick={() => goToScreen("tasks")}><Tile icon={SpinnerGap} hue="blue" /><span><b>{runningCount}</b><span className="l">Running</span></span></button>
          <button className="pg-stat" onClick={() => goToScreen("inbox")}><Tile icon={ShieldWarning} hue="orange" /><span><b>{pendingCount}</b><span className="l">To approve</span></span></button>
          <button className="pg-stat" onClick={() => goToScreen("tasks")}><Tile icon={CheckCircle} hue="green" /><span><b>{completedCount}</b><span className="l">Completed</span></span></button>
        </div>
        {currentTask && (
          <button className="pg-current" onClick={() => openTask(currentTask.id)}>
            <span className="t"><StatusTag status={currentTask.status} /><b>{currentTask.name}</b></span>
            <span className="pg-progress"><span className="progress"><i style={{ width: `${currentTask.progress}%` }} /></span><span className="pg-pct">{currentTask.progress}%</span></span>
          </button>
        )}
      </section>

      <section className="pg-rail-card">
        <header><Sparkle size={16} /><b>Tips</b></header>
        <button className="pg-tip" onClick={() => goToScreen("playbooks")}>
          <Tile icon={BookOpenText} hue="purple" /><span><b>Try a playbook</b><small>Proven task recipes, like “Add tests to a module”.</small></span><CaretRight size={14} />
        </button>
        <button className="pg-tip" onClick={() => goToScreen("help")}>
          <Tile icon={Keyboard} hue="gray" /><span><b>Keyboard shortcuts</b><small>Press <kbd>?</kbd> anywhere to see them all.</small></span><CaretRight size={14} />
        </button>
        <button className="pg-tip" onClick={() => goToScreen("memory")}>
          <Tile icon={PencilSimple} hue="pink" /><span><b>Teach OWL a rule</b><small>Save a fact once; every task in the project follows it.</small></span><CaretRight size={14} />
        </button>
      </section>
    </aside>
  );
}
