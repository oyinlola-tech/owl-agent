import { useState } from "react";
import {
  ArrowCounterClockwise, ArrowLeft, ArrowSquareOut, CalendarBlank, Check, CheckCircle, ClockCounterClockwise, Copy,
  FolderSimple, GitBranch, Info, ListChecks, Pause, Play, Pulse, Rows, SpinnerGap, Stop, TestTube, Timer, X, XCircle, type Icon,
} from "@phosphor-icons/react";
import { useAppStore } from "../../state/app.store";
import { hueForStatus, isFinishedStatus, StatusTag } from "../../../shared/components/statusTag.component";
import { EmptyState, PageHeader, PropertyList, SectionTitle } from "../../../shared/components/pageLayout.component";
import { Tag } from "../../../shared/components/tag.component";
import { copyTextAndNotify } from "../../../shared/helpers/clipboard.helper";
import { fileIconForPath } from "../../../shared/helpers/fileIcon.helper";
import "./tasks.style.css";

type LocalTaskTab = "overview" | "activity" | "changes";

export function LocalTaskDetailScreen() {
  const tasks = useAppStore((s) => s.tasks);
  const openTaskId = useAppStore((s) => s.openTaskId);
  const goToScreen = useAppStore((s) => s.goToScreen);
  const agentStatus = useAppStore((s) => s.agentStatus);
  const pauseAgent = useAppStore((s) => s.pauseAgent);
  const resumeAgent = useAppStore((s) => s.resumeAgent);
  const stopAgent = useAppStore((s) => s.stopAgent);
  const runSampleTask = useAppStore((s) => s.runSampleTask);
  const askForConfirmation = useAppStore((s) => s.askForConfirmation);
  const notify = useAppStore((s) => s.showNotice);
  const agentStep = useAppStore((s) => s.agentStep);
  const agentEvents = useAppStore((s) => s.agentEvents);
  const changes = useAppStore((s) => s.changes);
  const fileChangeDecisions = useAppStore((s) => s.fileChangeDecisions);
  const decideFileChange = useAppStore((s) => s.decideFileChange);
  const setCenterTab = useAppStore((s) => s.setCenterTab);
  const [tab, setTab] = useState<LocalTaskTab>("overview");
  const task = tasks.find((item) => item.id === openTaskId) ?? tasks[0];
  const live = task.id === "task-1";
  const progress = live && agentStatus !== "idle" ? Math.min(100, Math.max(task.progress, agentStep * 30)) : task.progress;
  const doneSteps = Math.floor((progress / 100) * task.plan.length);
  const testHue = task.status === "completed" ? "green" : task.status === "failed" ? "red" : "blue";
  const TestIcon = task.status === "completed" ? CheckCircle : task.status === "failed" ? XCircle : TestTube;
  const taskChanges = live ? changes : [];
  const runInWorkspace = () => { goToScreen("workspace"); runSampleTask(); };
  const tabs: [LocalTaskTab, string, Icon][] = [
    ["overview", "Overview", Info],
    ["activity", "Activity", Pulse],
    ["changes", `Changes${taskChanges.length ? ` (${taskChanges.length})` : ""}`, GitBranch],
  ];
  return (
    <div className="page pg-detail">
      <button className="btn btn-ghost btn-sm pg-back" onClick={() => goToScreen("tasks")}><ArrowLeft size={14} /> All tasks</button>
      <PageHeader icon={ListChecks} hue={hueForStatus(task.status)} title={task.name} eyebrow={<><FolderSimple size={13} /> {task.project}</>} />
      <PropertyList rows={[
        { icon: SpinnerGap, label: "Status", value: <StatusTag status={task.status} /> },
        { icon: FolderSimple, label: "Project", value: <Tag>{task.project}</Tag> },
        { icon: CalendarBlank, label: "Started", value: task.started },
        { icon: Timer, label: "Elapsed", value: <span className="pg-mono">{task.elapsed}</span> },
        { icon: Rows, label: "Progress", value: (
          <div className="pg-progress" style={{ maxWidth: 280 }}>
            <div className={`progress ${task.status === "failed" ? "red" : isFinishedStatus(task.status) ? "green" : ""}`}><i style={{ width: `${progress}%` }} /></div>
            <span className="pg-pct">{progress}%</span>
          </div>
        ) },
      ]} />
      <div className="pg-actions">
        {live && (agentStatus === "working" || agentStatus === "awaiting") && <button className="btn btn-secondary" onClick={pauseAgent}><Pause size={14} /> Pause</button>}
        {live && agentStatus === "paused" && <button className="btn btn-secondary" onClick={resumeAgent}><Play size={14} /> Resume</button>}
        {live && (agentStatus === "idle" || agentStatus === "done" || agentStatus === "stopped") && task.status !== "completed" && <button className="btn btn-secondary" onClick={runInWorkspace}><Play size={14} /> Run</button>}
        {live && agentStatus !== "idle" && agentStatus !== "done" && agentStatus !== "stopped" && (
          <button className="btn btn-secondary" onClick={() => askForConfirmation({
            title: "Stop this task?",
            body: `${task.name} halts immediately. Progress so far is kept.`,
            confirmLabel: "Stop task",
            run: stopAgent,
          })}><Stop size={14} /> Stop</button>
        )}
        {!live && task.status === "failed" && <button className="btn btn-secondary" onClick={runInWorkspace}><ArrowCounterClockwise size={14} /> Retry</button>}
        <button className="btn btn-secondary" onClick={() => copyTextAndNotify(task.id, notify, "Task ID copied")}><Copy size={14} /> Copy ID</button>
        <span className="grow" />
        <button className="btn btn-primary" onClick={() => goToScreen("workspace")}><ArrowSquareOut size={14} /> Open in workspace</button>
      </div>

      <div className="pg-tabs" role="tablist" aria-label="Task sections">
        {tabs.map(([key, label, TabIcon]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}><TabIcon size={15} /> {label}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="pg-blocks">
          <section>
            <SectionTitle count={task.plan.length}>Plan</SectionTitle>
            <ul className="pg-todo">
              {task.plan.map((planStep, index) => {
                const state = task.status === "completed" || index < doneSteps ? "done" : index === doneSteps && task.status === "running" ? "now" : "";
                return (
                  <li key={planStep} className={state}>
                    <span className="box">{state === "done" && <Check size={11} weight="bold" />}</span>
                    <span className="txt">{planStep}</span>
                    {state === "now" && <Tag hue="blue" dot>In progress</Tag>}
                  </li>
                );
              })}
            </ul>
          </section>
          <section>
            <SectionTitle count={task.files.length}>Files touched</SectionTitle>
            {task.files.length === 0 ? <p className="pg-muted pg-p">No files changed yet.</p> : (
              <div className="pg-files">
                {task.files.map((file) => { const FileIcon = fileIconForPath(file).icon; return <div key={file} className="pg-file"><FileIcon size={15} />{file}</div>; })}
              </div>
            )}
          </section>
          <section>
            <SectionTitle count={task.commands.length}>Commands</SectionTitle>
            <div className="pg-code">
              <button className="btn btn-icon btn-sm copy" aria-label="Copy commands" onClick={() => copyTextAndNotify(task.commands.join("\n"), notify, "Commands copied")}>
                <Copy size={13} />
              </button>
              {task.commands.map((command) => <div key={command}><span className="p">$</span>{command}</div>)}
            </div>
          </section>
          <section>
            <SectionTitle>Tests</SectionTitle>
            <div className={`callout ${testHue}`}>
              <TestIcon size={18} weight="duotone" style={{ color: `var(--${testHue})` }} />
              <span>{task.status === "completed" ? "Sample replay. OWL didn't independently verify this task." : task.note}</span>
            </div>
          </section>
        </div>
      )}

      {tab === "activity" && (
        live && agentEvents.length > 0 ? (
          <ol className="pg-steps-v">
            {agentEvents.map((event) => (
              <li key={event.id} className={event.state}>
                <i>{event.state === "done" ? <Check size={11} weight="bold" /> : event.state === "active" ? <span className="live-dot pulse" /> : null}</i>
                <span><b>{event.label}</b>{event.detail && <small>{event.detail}</small>}</span>
                <Tag hue={event.state === "done" ? "green" : event.state === "active" ? "blue" : "gray"}>{event.state === "done" ? "Done" : event.state === "active" ? "Working" : "Queued"}</Tag>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState icon={Pulse} hue="blue" title={live ? "No activity yet" : "Activity isn't kept for this task"}
            body={live ? "Run the task and every read, edit, and command appears here as it happens." : "This session only records step-by-step activity for the task that's running. Saved tasks keep a full log."}>
            {live && <button className="btn btn-primary" onClick={runInWorkspace}><Play size={14} /> Run task</button>}
            <button className="btn btn-secondary" onClick={() => goToScreen("tasks")}>See saved tasks</button>
          </EmptyState>
        )
      )}

      {tab === "changes" && (
        taskChanges.length > 0 ? (
          <div className="pg-journal">
            {taskChanges.map((change) => {
              const decision = fileChangeDecisions[change.path] ?? "pending";
              const FileIcon = fileIconForPath(change.path).icon;
              return (
                <div key={change.path} className="pg-jrow">
                  <span className={`tag tag-${change.status === "A" ? "green" : change.status === "D" ? "red" : "yellow"}`}>{change.status === "A" ? "Added" : change.status === "D" ? "Deleted" : "Modified"}</span>
                  <span className="path"><FileIcon size={15} />{change.path}</span>
                  <StatusTag status={decision === "accepted" ? "approved" : decision} />
                  <span className="acts">
                    <button className="btn btn-ghost btn-sm" onClick={() => decideFileChange(change.path, "accepted")}><Check size={13} /> Accept</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => decideFileChange(change.path, "rejected")}><X size={13} /> Reject</button>
                  </span>
                </div>
              );
            })}
            <div className="pg-actions"><button className="btn btn-secondary" onClick={() => { setCenterTab("changes"); goToScreen("workspace"); }}><GitBranch size={14} /> Review diffs in workspace</button></div>
          </div>
        ) : (
          <EmptyState icon={GitBranch} hue="yellow" title="No changes proposed" body={live ? "When the agent proposes edits they show here for review." : "Changes for finished tasks are kept by the OWL service. Open a saved task to see and revert them."}>
            <button className="btn btn-secondary" onClick={() => goToScreen("history")}><ClockCounterClockwise size={14} /> Change history</button>
          </EmptyState>
        )
      )}
    </div>
  );
}
