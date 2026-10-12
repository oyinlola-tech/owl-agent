import { useState } from "react";
import {
  CaretRight, CheckCircle, Circle, ClockCounterClockwise, MinusCircle, Play, SealCheck, ShieldWarning,
  SpinnerGap, Timer, WarningCircle, XCircle, type Icon,
} from "@phosphor-icons/react";
import type { VerificationRequirement, VerificationRun, VerificationRunStatus, VerificationSummary } from "../../../services/agentApi.types";
import { Tag, type Hue } from "../../../../shared/components/tag.component";
import {
  formatRunClockTime, formatRunDuration, joinCommandArgs, latestByRequirement, verificationState,
} from "./verificationState.helper";
import "./verification.style.css";

// Security: the UI only says a check passed when a run record with status "passed" exists (or a
// requirement.completed event said so). The model's own claims never reach these components.

type RunDisplayStatus = VerificationRunStatus | "not_run";

const RUN_STATUS_DISPLAY: Record<RunDisplayStatus, { icon: Icon; hue: Hue; label: string }> = {
  passed: { icon: CheckCircle, hue: "green", label: "Passed" },
  failed: { icon: XCircle, hue: "red", label: "Failed" },
  timeout: { icon: Timer, hue: "red", label: "Timed out" },
  error: { icon: WarningCircle, hue: "red", label: "Couldn't run" },
  running: { icon: SpinnerGap, hue: "blue", label: "Running" },
  cancelled: { icon: MinusCircle, hue: "gray", label: "Cancelled" },
  interrupted: { icon: MinusCircle, hue: "gray", label: "Interrupted" },
  not_run: { icon: Circle, hue: "gray", label: "Not run" },
};

const REQUIREMENT_KIND_LABELS: Record<string, string> = {
  tests: "Tests", typecheck: "Typecheck", lint: "Lint", build: "Build", custom: "Custom",
};

const NO_VERIFICATION_COMMAND_NOTE = "OWL could not identify a reliable automated verification command.";

function RunOutput({ run }: { run: VerificationRun }) {
  return (
    <div className="pg-v-out">
      {run.error && <div className="pg-v-err">{run.error}</div>}
      {run.stderr && (<><div className="pg-v-stream">stderr</div><pre>{run.stderr}</pre></>)}
      {run.stdout && (<><div className="pg-v-stream">stdout</div><pre>{run.stdout}</pre></>)}
      {!run.error && !run.stderr && !run.stdout && <p className="pg-muted pg-sm">{run.status === "running" ? "Waiting for output…" : "The command printed nothing."}</p>}
      <div className="pg-v-meta">
        <span>Started {formatRunClockTime(run.started_at)}</span>
        {run.completed_at && <span>Finished {formatRunClockTime(run.completed_at)}</span>}
        <span className="pg-mono">{run.working_directory}</span>
      </div>
    </div>
  );
}

function RunStatusIcon({ status }: { status: RunDisplayStatus }) {
  const display = RUN_STATUS_DISPLAY[status];
  return <display.icon size={17} weight={status === "running" ? "bold" : "fill"} color={`var(--${display.hue})`}
    className={status === "running" ? "pg-v-spin" : undefined} aria-label={display.label} />;
}

function RequirementRow({ requirement, run, defaultOpen }: { requirement: VerificationRequirement; run?: VerificationRun; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const status: RunDisplayStatus = run ? run.status : "not_run";
  const canOpen = !!run;
  return (
    <li className={`pg-v-row${open ? " open" : ""}`}>
      <button className="pg-v-head" onClick={() => canOpen && setOpen((isOpen) => !isOpen)} aria-expanded={canOpen ? open : undefined}
        disabled={!canOpen} title={canOpen ? "Show output" : undefined}>
        <RunStatusIcon status={status} />
        <span className="pg-v-main">
          <span className="pg-v-line">
            <b>{REQUIREMENT_KIND_LABELS[requirement.kind] ?? requirement.kind}</b>
            <code>{joinCommandArgs(requirement.argv)}</code>
          </span>
          <span className="pg-v-sub">
            {requirement.required ? <Tag>Required</Tag> : <Tag hue="gray">Optional</Tag>}
            <span>{requirement.detail}</span>
          </span>
          {!requirement.safe && <span className="pg-v-unsafe"><ShieldWarning size={13} /> Not run: {requirement.unsafe_reason}</span>}
        </span>
        <span className="pg-v-facts">
          <Tag hue={RUN_STATUS_DISPLAY[status].hue}>{RUN_STATUS_DISPLAY[status].label}</Tag>
          {run && run.exit_code != null && <span className="pg-mono">exit {run.exit_code}</span>}
          {run && run.duration_ms != null && <span>{formatRunDuration(run.duration_ms)}</span>}
          {run && <span>attempt {run.attempt}</span>}
          {canOpen && <CaretRight size={13} className="pg-v-caret" />}
        </span>
      </button>
      {open && run && <RunOutput run={run} />}
    </li>
  );
}

function RunAttemptRow({ run }: { run: VerificationRun }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`pg-v-row compact${open ? " open" : ""}`}>
      <button className="pg-v-head" onClick={() => setOpen((isOpen) => !isOpen)} aria-expanded={open}>
        <RunStatusIcon status={run.status} />
        <span className="pg-v-main"><span className="pg-v-line"><b>Attempt {run.attempt}</b><code>{joinCommandArgs(run.command)}</code></span></span>
        <span className="pg-v-facts">
          <Tag hue={RUN_STATUS_DISPLAY[run.status].hue}>{RUN_STATUS_DISPLAY[run.status].label}</Tag>
          {run.exit_code != null && <span className="pg-mono">exit {run.exit_code}</span>}
          <span>{formatRunDuration(run.duration_ms)}</span>
          <span>{formatRunClockTime(run.started_at)}</span>
          <CaretRight size={13} className="pg-v-caret" />
        </span>
      </button>
      {open && <RunOutput run={run} />}
    </li>
  );
}

export function VerificationCallout({ taskStatus, summary, runs, onOpen, onResume }: {
  taskStatus: string; summary?: VerificationSummary; runs: VerificationRun[]; onOpen?: () => void; onResume?: () => void;
}) {
  const state = verificationState(taskStatus, summary, runs);
  const latest = latestByRequirement(runs);
  const passedCount = [...latest.values()].filter((run) => run.status === "passed").length;
  const failingRun = runs.filter((run) => run.status !== "passed" && run.status !== "running" && run.required)
    .sort((a, b) => b.attempt - a.attempt || b.started_at.localeCompare(a.started_at))[0];
  const runningRun = runs.find((run) => run.status === "running");
  const maxAttempts = summary?.max_attempts ?? 0;
  const attempts = summary?.attempts ?? 0;
  const viewOutputButton = onOpen && <button className="btn btn-secondary btn-sm" onClick={onOpen}>View output</button>;
  const resumeButton = onResume && (taskStatus === "failed" || taskStatus === "paused") && (
    <button className="btn btn-primary btn-sm" onClick={onResume}><Play size={13} /> Resume task</button>
  );
  if (state === "verified") {
    return (
      <div className="callout green pg-v-callout" role="status">
        <SealCheck size={18} weight="fill" color="var(--green)" />
        <div><b>Verified</b><span>OWL ran {passedCount} check{passedCount === 1 ? "" : "s"} itself and every required one passed.
          {summary?.verified_at && <> Verified at {formatRunClockTime(summary.verified_at)}.</>}</span></div>
        {onOpen && <button className="btn btn-ghost btn-sm" onClick={onOpen}>Details</button>}
      </div>
    );
  }
  if (state === "running") {
    return (
      <div className="callout blue pg-v-callout" role="status">
        <span className="live-dot pulse" style={{ color: "var(--blue)", marginTop: 6 }} />
        <div><b>Verifying</b><span>Running: <code>{runningRun ? joinCommandArgs(runningRun.command) : "checks"}</code>{attempts > 0 && maxAttempts > 0 && <> · attempt {attempts} of {maxAttempts}</>}</span></div>
        {onOpen && <button className="btn btn-ghost btn-sm" onClick={onOpen}>Watch</button>}
      </div>
    );
  }
  if (state === "unverified") {
    return (
      <div className="callout yellow pg-v-callout" role="status">
        <ShieldWarning size={18} weight="duotone" color="var(--yellow)" />
        <div><b>Completed, not verified</b><span>{summary?.note || NO_VERIFICATION_COMMAND_NOTE}</span></div>
        {onOpen && <button className="btn btn-ghost btn-sm" onClick={onOpen}>Details</button>}
      </div>
    );
  }
  if (state === "failed") {
    return (
      <div className="callout red pg-v-callout" role="status">
        <XCircle size={18} weight="fill" color="var(--red)" />
        <div>
          <b>{taskStatus === "failed" ? "Verification failed, OWL stopped" : "Verification failed"}</b>
          <span>
            {failingRun ? <><code>{joinCommandArgs(failingRun.command)}</code> {failingRun.exit_code != null ? `exited with code ${failingRun.exit_code}` : RUN_STATUS_DISPLAY[failingRun.status].label.toLowerCase()}</> : summary?.note}
            {maxAttempts > 0 && <> · attempt {attempts} of {maxAttempts}</>}
            {taskStatus !== "failed" && taskStatus !== "paused" && <> · OWL is fixing it</>}
          </span>
        </div>
        <span className="pg-v-acts">{viewOutputButton}{resumeButton}</span>
      </div>
    );
  }
  return (
    <div className="callout pg-v-callout" role="status">
      <ClockCounterClockwise size={18} />
      <div><b>Not verified yet</b><span>When the agent says it's done, OWL runs the project's own checks itself before calling it verified.</span></div>
    </div>
  );
}

export function VerificationPanel({ taskStatus, summary, runs, onResume }: {
  taskStatus: string; summary?: VerificationSummary; runs: VerificationRun[]; onResume?: () => void;
}) {
  const latest = latestByRequirement(runs);
  const requirements = summary?.requirements ?? [];
  const knownRequirementIds = new Set(requirements.map((requirement) => requirement.id));
  const orphanRuns = [...latest.values()].filter((run) => !knownRequirementIds.has(run.requirement_id));
  const firstFailing = requirements.find((requirement) => {
    const run = latest.get(requirement.id);
    return run && run.status !== "passed" && requirement.required;
  });
  const [showHistory, setShowHistory] = useState(false);
  return (
    <div className="pg-v">
      <VerificationCallout taskStatus={taskStatus} summary={summary} runs={runs} onResume={onResume} />
      {requirements.length > 0 && (
        <>
          <h4 className="pg-v-h">Checks <span className="pg-muted">from the project's own files</span></h4>
          <ul className="pg-v-list">
            {requirements.map((requirement) => (
              <RequirementRow key={requirement.id} requirement={requirement} run={latest.get(requirement.id)} defaultOpen={requirement.id === firstFailing?.id} />
            ))}
          </ul>
        </>
      )}
      {orphanRuns.length > 0 && (
        <ul className="pg-v-list">{orphanRuns.map((run) => <RunAttemptRow key={run.id} run={run} />)}</ul>
      )}
      {runs.length > 0 && (
        <>
          <button className="pg-v-h pg-v-toggle" onClick={() => setShowHistory((shown) => !shown)} aria-expanded={showHistory}>
            <CaretRight size={12} className="pg-v-caret" /> Every run <span className="pg-muted">{runs.length}</span>
          </button>
          {showHistory && <ul className="pg-v-list">{[...runs].reverse().map((run) => <RunAttemptRow key={run.id} run={run} />)}</ul>}
        </>
      )}
      <p className="pg-note pg-v-note">
        <SealCheck size={14} /> A task is verified only when OWL itself ran every required check and saw it pass. What the
        model says about its own work never counts.
      </p>
    </div>
  );
}
