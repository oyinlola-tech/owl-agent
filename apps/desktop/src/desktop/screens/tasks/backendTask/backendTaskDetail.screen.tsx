import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowSquareOut, Check, Copy, Cpu, Gauge, GitBranch, Hash, Info, ListChecks, Path, Pause, Play, Pulse,
  SealCheck, ShieldWarning, SpinnerGap, Terminal, Timer, Wrench, X, CalendarBlank, type Icon,
} from "@phosphor-icons/react";
import { useAppStore } from "../../../state/app.store";
import { pendingApprovalKey, usePendingApprovalsStore } from "../../../state/pendingApprovals.store";
import { agentApi, ApiError } from "../../../services/agentApi.service";
import { type ApprovalRead, type JournalRow, type TaskDetail } from "../../../services/agentApi.types";
import { isServiceAuthError } from "../../../services/connection/serviceRequest.service";
import { EmptyState, PageHeader, PropertyList, SectionTitle } from "../../../../shared/components/pageLayout.component";
import { StatusTag, isFinishedStatus, hueForStatus } from "../../../../shared/components/statusTag.component";
import { Tag } from "../../../../shared/components/tag.component";
import { formatShortTimeAgo } from "../../../../shared/helpers/time.helper";
import { copyTextAndNotify } from "../../../../shared/helpers/clipboard.helper";
import { fileIconForPath } from "../../../../shared/helpers/fileIcon.helper";
import { VerificationPanel } from "../verification/verificationPanel.component";
import { BackendTaskActivityPanel, type BackendTaskEvent } from "./backendTaskActivity.panel";
import { BackendTaskChangesPanel } from "./backendTaskChanges.panel";
import { BackendTaskOverviewPanel } from "./backendTaskOverview.panel";
import { BackendTaskUsagePanel } from "./backendTaskUsage.panel";
import "../tasks.style.css";

const RISK_HUES = { Low: "green", Medium: "yellow", High: "red" } as const;
type BackendTaskTab = "overview" | "verification" | "activity" | "changes" | "usage";

function PendingApprovalCard({ approval, onDecide }: { approval: ApprovalRead; onDecide: (approved: boolean) => void }) {
  return (
    <div className="pg-appr">
      <div className="pg-appr-head">
        <ShieldWarning size={18} weight="duotone" color="var(--orange)" />
        <b>{approval.title}</b>
        <Tag hue={RISK_HUES[approval.risk] ?? "gray"}>{approval.risk} risk</Tag>
        {approval.action && <Tag icon={Wrench}>{approval.action}</Tag>}
      </div>
      {approval.command && <div className="pg-code"><span className="p">$</span>{approval.command}</div>}
      {approval.files && approval.files.length > 0 && (
        <div className="pg-files">{approval.files.map((file) => { const FileIcon = fileIconForPath(file).icon; return <div key={file} className="pg-file"><FileIcon size={15} />{file}</div>; })}</div>
      )}
      <div className="meta">
        <span>{approval.reason}</span>
        <span><Timer size={13} /> {approval.expires_at ? `Expires ${new Date(approval.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "No expiry"}</span>
      </div>
      <div className="row">
        <button className="btn btn-secondary btn-sm" onClick={() => onDecide(false)}><X size={13} /> Reject</button>
        <button className="btn btn-primary btn-sm" onClick={() => onDecide(true)}><Check size={13} weight="bold" /> Approve</button>
      </div>
    </div>
  );
}

export function BackendTaskDetailScreen() {
  const taskId = useAppStore((s) => s.openBackendTaskId);
  const goToScreen = useAppStore((s) => s.goToScreen);
  const notify = useAppStore((s) => s.showNotice);
  const askForConfirmation = useAppStore((s) => s.askForConfirmation);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRead[]>([]);
  const [journal, setJournal] = useState<JournalRow[]>([]);
  const [events, setEvents] = useState<BackendTaskEvent[]>([]);
  const [failure, setFailure] = useState<"none" | "offline" | "unauthorized">("none");
  const [tab, setTab] = useState<BackendTaskTab>("overview");

  const loadTaskDetail = async (id: string) => {
    try {
      const [loadedDetail, loadedApprovals, loadedJournal] = await Promise.all([
        agentApi.taskDetail(id), agentApi.approvals(id), agentApi.journal(id).catch(() => [] as JournalRow[]),
      ]);
      setDetail(loadedDetail);
      setApprovals(loadedApprovals);
      setJournal(loadedJournal);
      setFailure("none");
    } catch (error) {
      setFailure(isServiceAuthError(error) ? "unauthorized" : "offline");
    }
  };

  useEffect(() => {
    if (!taskId) return;
    void loadTaskDetail(taskId);
    const stopEvents = agentApi.events(taskId, (type, data) => {
      if (type === "snapshot") return;
      setEvents((list) => [{ type, at: new Date().toISOString(), data: (data ?? {}) as Record<string, unknown> }, ...list].slice(0, 60));
      void loadTaskDetail(taskId);
    });
    const pollTimer = setInterval(() => { void loadTaskDetail(taskId); }, 4000);
    return () => {
      stopEvents();
      clearInterval(pollTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const backButton = <button className="btn btn-ghost btn-sm pg-back" onClick={() => goToScreen("tasks")}><ArrowLeft size={14} /> All tasks</button>;

  if (!taskId) {
    return (
      <div className="page pg-detail">
        {backButton}
        <EmptyState icon={ListChecks} title="No saved task selected" body="Pick a saved task from the Tasks page.">
          <button className="btn btn-primary" onClick={() => goToScreen("tasks")}>Go to tasks</button>
        </EmptyState>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="page pg-detail">
        {backButton}
        <div className="pg-skel" aria-label="Loading task">
          <span className="skel-line" style={{ width: 52, height: 52, borderRadius: 12 }} />
          <span className="skel-line" style={{ width: "60%", height: 28 }} />
          {[70, 45, 55, 40].map((width, index) => <span key={index} className="skel-line" style={{ width: `${width}%` }} />)}
        </div>
      </div>
    );
  }

  const task = detail.task;
  const pendingApprovals = approvals.filter((approval) => approval.status === "pending");
  const decidedApprovals = approvals.filter((approval) => approval.status !== "pending");
  const setSampleStatus = (status: string) => setDetail((current) => (current ? { ...current, task: { ...current.task, status, updated_at: new Date().toISOString() } } : current));
  const runTaskAction = async (request: () => Promise<unknown>, message: string, sampleStatus?: string) => {
    if (demo) {
      if (sampleStatus) setSampleStatus(sampleStatus);
      notify(`${message}. ${SAMPLE_SAVE_NOTICE}`);
      return;
    }
    try {
      await request();
      notify(message);
      await loadTaskDetail(taskId);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "The OWL service didn't answer.");
    }
  };
  const decideApproval = (approval: ApprovalRead, approved: boolean) => {
    if (demo) {
      setApprovals((list) => list.map((item) => (item.id === approval.id ? { ...item, status: approved ? "approved" : "rejected", decided_by: "you", decided_at: new Date().toISOString() } : item)));
      usePendingApprovalsStore.getState().markDecided(pendingApprovalKey(task.id, approval.id), { status: approved ? "approved" : "rejected", at: new Date().toISOString() });
      notify(`${approved ? "Approved" : "Rejected"}. ${SAMPLE_SAVE_NOTICE}`);
      return;
    }
    void runTaskAction(() => agentApi.decide(task.id, approval.id, approved), approved ? "Approved" : "Rejected")
      .then(() => usePendingApprovalsStore.getState().refresh());
  };
  const revertJournalRow = (row: JournalRow) => askForConfirmation({
    title: `Revert ${row.path}?`,
    body: "Restores the file to how it was before this change. If the file changed since, the revert stops and nothing is overwritten.",
    confirmLabel: "Revert change",
    run: () => {
      if (demo) {
        setJournal((list) => list.map((item) => (item.id === row.id ? { ...item, reverted_at: new Date().toISOString() } : item)));
        notify(`Reverted. ${SAMPLE_SAVE_NOTICE}`);
        return;
      }
      agentApi.revertJournal(task.id, row.id)
        .then(() => { notify(`Reverted ${row.path}`); void loadTaskDetail(taskId); })
        .catch((e) => notify(e instanceof ApiError && e.status === 409
          ? `Not reverted: ${row.path} changed after this edit. Review it by hand.`
          : e instanceof ApiError ? e.message : "The OWL service didn't answer."));
    },
  });
  const live = task.status === "running" || task.status === "awaiting_approval";
  const totalInputTokens = detail.usage.reduce((total, row) => total + row.input_tokens, 0);
  const totalOutputTokens = detail.usage.reduce((total, row) => total + row.output_tokens, 0);
  const verificationRuns = detail.verifications ?? [];
  const resumeTask = () => void runTaskAction(() => agentApi.resumeBackendTask(task.id), "Task resumed", "running");
  const tabs: [BackendTaskTab, string, Icon, number?][] = [
    ["overview", "Overview", Info],
    ["verification", "Verification", SealCheck, verificationRuns.length],
    ["activity", "Activity", Pulse, detail.tool_calls.length],
    ["changes", "Changes", GitBranch, journal.length],
    ["usage", "Usage", Cpu, detail.usage.length],
  ];

  return (
    <div className="page pg-detail">
      {backButton}
      {demo && <SampleDataBanner onRetry={() => { demoRef.current = false; void loadTaskDetail(taskId); }} what="this task" />}
      <PageHeader icon={Terminal} hue={hueForStatus(task.status)} title={task.prompt.slice(0, 140) || "Untitled task"}
        eyebrow={<><Hash size={13} /> {task.id}{task.project && <> · {task.project}</>}</>} />
      <PropertyList rows={[
        { icon: SpinnerGap, label: "Status", value: <StatusTag status={task.status} /> },
        { icon: Gauge, label: "Progress", value: (
          <div className="pg-progress" style={{ maxWidth: 280 }}>
            <div className={`progress ${task.status === "failed" ? "red" : isFinishedStatus(task.status) ? "green" : ""}`}><i style={{ width: `${task.progress}%` }} /></div>
            <span className="pg-pct">{task.progress}%</span>
          </div>
        ) },
        { icon: Cpu, label: "Model", value: task.model ? <Tag hue="purple">{task.model}</Tag> : <span className="pg-muted">Auto</span> },
        ...(task.routing ? [{ icon: Path, label: "Routing", value: <span className="pg-sm">{task.routing}</span> }] : []),
        { icon: CalendarBlank, label: "Updated", value: <span title={new Date(task.updated_at).toLocaleString()}>{formatShortTimeAgo(task.updated_at)}</span> },
      ]} />
      <div className="pg-actions">
        {task.status === "running" && <button className="btn btn-secondary" onClick={() => void runTaskAction(() => agentApi.pauseBackendTask(task.id), "Task paused", "paused")}><Pause size={14} /> Pause</button>}
        {(task.status === "paused" || task.status === "failed") && (
          <button className="btn btn-primary" onClick={resumeTask}><Play size={14} /> Resume</button>
        )}
        {(task.status === "running" || task.status === "awaiting_approval" || task.status === "paused") && (
          <button className="btn btn-secondary" onClick={() => askForConfirmation({
            title: "Cancel this task?",
            body: "The agent stops at its next step. Approved changes stay and checkpoints are kept.",
            confirmLabel: "Cancel task",
            run: () => void runTaskAction(() => agentApi.cancelBackendTask(task.id), "Task cancelled", "cancelled"),
          })}><X size={14} /> Cancel</button>
        )}
        <button className="btn btn-secondary" onClick={() => copyTextAndNotify(task.id, notify, "Task ID copied")}><Copy size={14} /> Copy ID</button>
        <span className="grow" />
        <button className="btn btn-secondary" onClick={() => { openProject({ name: task.project || "ZudoMart", path: `~/Projects/${(task.project || "zudomart").toLowerCase()}`, opened: "now" }); }}>
          <ArrowSquareOut size={14} /> Open in workspace
        </button>
      </div>

      {pendingApprovals.length > 0 && (
        <>
          <SectionTitle count={pendingApprovals.length}>Waiting for your approval</SectionTitle>
          {pendingApprovals.map((approval) => (
            <PendingApprovalCard key={approval.id} approval={approval} onDecide={(approved) => decideApproval(approval, approved)} />
          ))}
        </>
      )}

      <div className="pg-tabs" role="tablist" aria-label="Task sections">
        {tabs.map(([key, label, TabIcon, count]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
            <TabIcon size={15} /> {label}{typeof count === "number" && count > 0 && <span className="pg-count">{count}</span>}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <BackendTaskOverviewPanel detail={detail} journal={journal} decidedApprovals={decidedApprovals}
          totalTokens={totalInputTokens + totalOutputTokens} onOpenVerification={() => setTab("verification")} onResume={resumeTask} />
      )}
      {tab === "verification" && (
        <VerificationPanel taskStatus={task.status} summary={detail.verification} runs={verificationRuns} onResume={resumeTask} />
      )}
      {tab === "activity" && <BackendTaskActivityPanel toolCalls={detail.tool_calls} events={events} live={live} demo={demo} />}
      {tab === "changes" && <BackendTaskChangesPanel journal={journal} onRevert={revertJournalRow} />}
      {tab === "usage" && (
        <BackendTaskUsagePanel usage={detail.usage} totalInputTokens={totalInputTokens} totalOutputTokens={totalOutputTokens} />
      )}
    </div>
  );
}
