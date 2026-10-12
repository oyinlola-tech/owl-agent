import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowCounterClockwise, Brain, House, CheckCircle, Cpu, FileText, FolderSimple, GitBranch, GitCommit, Gear,
  ListChecks, MagnifyingGlass, PencilSimple, Play, SealCheck, ShieldCheck, Tray, TerminalWindow, XCircle,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { OwlMark } from "../../../shared/components/owlMark.component";
import { PropertyList } from "../../../shared/components/pageLayout.component";
import { Tag, type Hue } from "../../../shared/components/tag.component";
import "./heroDemo.style.css";

const TEST_OUTPUT_LINES = [
  { t: "$ go test ./...", k: "cmd" },
  { t: "ok   zudomart/auth    0.412s   8 tests", k: "ok" },
  { t: "ok   zudomart/users   0.207s   4 tests", k: "ok" },
  { t: "ok   zudomart/api     0.318s   2 tests", k: "ok" },
  { t: "PASS  14 tests, 0 failures", k: "pass" },
];

const PROPOSED_DIFF = [
  { file: "src/auth/service.go", st: "M", lines: [
    { k: "del", t: "func Login(user User) error" },
    { k: "add", t: "func Login(ctx context.Context, user User) (string, error)" },
  ] },
  { file: "src/auth/jwt.go", st: "A", lines: [
    { k: "add", t: "func issueToken(sub string, ttl time.Duration) (string, error)" },
  ] },
  { file: "src/auth/middleware.go", st: "A", lines: [
    { k: "add", t: "func RequireAuth(next http.Handler) http.Handler" },
  ] },
];

function useReducedMotion() {
  const [prefersReducedMotion] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  return prefersReducedMotion;
}

function ActivityBlock({ hue, icon: BlockIcon, title, meta, children, last, flash }: {
  hue: Hue; icon: Icon; title: ReactNode; meta?: ReactNode; children?: ReactNode; last?: boolean; flash?: boolean;
}) {
  return (
    <li className={`hd-block${last ? " last" : ""}${flash ? " flash" : ""}`}>
      <span className={`tile ${hue} hd-node`}><BlockIcon size={15} weight="duotone" /></span>
      <div className="hd-body">
        <div className="hd-title"><span>{title}</span>{meta && <span className="hd-meta">{meta}</span>}</div>
        {children}
      </div>
    </li>
  );
}

export function HeroDemo() {
  const reduceMotion = useReducedMotion();
  const [runNumber, setRunNumber] = useState(0);
  const [visibleBlockCount, setVisibleBlockCount] = useState(0);
  const [decision, setDecision] = useState<null | "approved" | "rejected">(null);
  const [testProgress, setTestProgress] = useState(0);

  useEffect(() => {
    setVisibleBlockCount(0); setDecision(null); setTestProgress(0);
    if (reduceMotion) { setVisibleBlockCount(4); return; }
    const timers = [500, 1400, 2400, 3500].map((delayMs, index) => window.setTimeout(() => setVisibleBlockCount(index + 1), delayMs));
    return () => timers.forEach(clearTimeout);
  }, [runNumber, reduceMotion]);

  useEffect(() => {
    if (decision !== "approved") return;
    if (reduceMotion) { setTestProgress(TEST_OUTPUT_LINES.length + 2); return; }
    const timers: number[] = [];
    for (let step = 1; step <= TEST_OUTPUT_LINES.length + 2; step++) timers.push(window.setTimeout(() => setTestProgress(step), 300 + step * 380));
    return () => timers.forEach(clearTimeout);
  }, [decision, reduceMotion]);

  const awaiting = visibleBlockCount >= 4 && decision === null;
  const testsDone = testProgress >= TEST_OUTPUT_LINES.length;
  const checkpoint = testProgress >= TEST_OUTPUT_LINES.length + 1;
  const stamped = testProgress >= TEST_OUTPUT_LINES.length + 2;

  const status: { hue: Hue; label: string; pulse?: boolean } =
    decision === "rejected" ? { hue: "gray", label: "Reverted" }
    : stamped ? { hue: "green", label: "Done" }
    : decision === "approved" ? { hue: "purple", label: "Running tests", pulse: true }
    : awaiting ? { hue: "orange", label: "Needs your approval", pulse: true }
    : { hue: "blue", label: "Working", pulse: true };

  const accepted = decision === "approved";

  const pageRef = useRef<HTMLDivElement>(null);
  const followNewestBlock = useRef(true);
  useEffect(() => { followNewestBlock.current = true; pageRef.current?.scrollTo({ top: 0 }); }, [runNumber]);
  useLayoutEffect(() => {
    const pageElement = pageRef.current;
    if (!pageElement || !followNewestBlock.current || visibleBlockCount === 0) return;
    pageElement.scrollTo({ top: pageElement.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
  }, [visibleBlockCount, testProgress, decision, reduceMotion]);
  const rememberWhetherAtBottom = () => {
    const pageElement = pageRef.current;
    if (pageElement) followNewestBlock.current = pageElement.scrollHeight - pageElement.scrollTop - pageElement.clientHeight < 80;
  };

  return (
    <div className="hd-window" id="demo">
      <div className="hd-bar">
        <span className="hd-lights" aria-hidden="true"><i /><i /><i /></span>
        <span className="hd-crumb"><span>ZudoMart</span><span className="sep">/</span><span>Tasks</span><span className="sep">/</span><b>Add JWT auth</b></span>
        <button className="btn btn-ghost btn-sm hd-replay" onClick={() => setRunNumber((previousRun) => previousRun + 1)}>
          <ArrowCounterClockwise size={14} /> Replay
        </button>
      </div>
      <div className="hd-grid">
        <aside className="hd-side" aria-hidden="true">
          <div className="hd-ws"><OwlMark size={20} /><b>ZudoMart</b></div>
          <div className="hd-nav"><House size={15} />Home</div>
          <div className="hd-nav"><MagnifyingGlass size={15} />Search</div>
          <div className="hd-nav"><Tray size={15} />Approvals {awaiting && <span className="hd-badge">1</span>}</div>
          <div className="hd-nav"><Gear size={15} />Settings</div>
          <div className="hd-sect">Tasks</div>
          <div className="hd-nav on"><FileText size={15} />Add JWT auth</div>
          <div className="hd-nav"><FileText size={15} />Fix checkout rounding</div>
          <div className="hd-nav"><FileText size={15} />Staging deploy</div>
          <div className="hd-sect">Project</div>
          <div className="hd-nav"><FolderSimple size={15} />Files</div>
          <div className="hd-nav"><GitBranch size={15} />main</div>
          <div className="hd-nav"><Brain size={15} />Memory</div>
        </aside>
        <div className="hd-page" ref={pageRef} onScroll={rememberWhetherAtBottom} tabIndex={0} aria-label="Task page">
          <h3 className="hd-h">Add JWT auth to ZudoMart</h3>
          <PropertyList rows={[
            { icon: CheckCircle, label: "Status", value: (
              <span key={status.label} className={`tag tag-${status.hue} hd-status`}>
                <span className={`live-dot${status.pulse ? " pulse" : ""}`} style={{ width: 6, height: 6 }} />{status.label}
              </span>
            ) },
            { icon: Cpu, label: "Model", value: <span className="mono hd-small">nvidia/llama-3.1-nemotron-70b</span> },
            { icon: PencilSimple, label: "Files", value: <span className="hd-small">{visibleBlockCount >= 3 ? "3 proposed" : "Reading"}{accepted ? ", written" : ""}</span> },
          ]} />
          <ol className="hd-timeline" aria-live="polite" aria-label="Agent activity">
            {visibleBlockCount >= 1 && (
              <ActivityBlock hue="blue" icon={MagnifyingGlass} title="Read 8 files" meta="0.4s">
                <div className="hd-files mono">src/auth/*  src/users/model.go  go.mod  +5</div>
              </ActivityBlock>
            )}
            {visibleBlockCount >= 2 && (
              <ActivityBlock hue="gray" icon={ListChecks} title="Plan" meta="3 steps">
                <ul className="hd-plan">
                  <li>Hash passwords with bcrypt in the user service</li>
                  <li>Issue short-lived JWTs from a new jwt.go</li>
                  <li>Guard /api routes with RequireAuth middleware</li>
                </ul>
              </ActivityBlock>
            )}
            {visibleBlockCount >= 3 && (
              <ActivityBlock hue="yellow" icon={PencilSimple} title="Proposed changes"
                meta={decision === "approved" ? <Tag hue="green">Accepted</Tag> : decision === "rejected" ? <Tag hue="gray">Discarded</Tag> : "3 files"}>
                <div className={`hd-diff${decision === "rejected" ? " dim" : ""}`}>
                  {PROPOSED_DIFF.map((diffFile) => (
                    <div key={diffFile.file} className="hd-diff-file">
                      <div className="hd-diff-head mono"><span className={`hd-st st-${diffFile.st}`}>{diffFile.st}</span>{diffFile.file}</div>
                      {diffFile.lines.map((line, index) => (
                        <div key={index} className={`hd-line ${line.k} mono`}><span>{line.k === "add" ? "+" : "-"}</span>{line.t}</div>
                      ))}
                    </div>
                  ))}
                </div>
              </ActivityBlock>
            )}
            {visibleBlockCount >= 4 && (
              <ActivityBlock hue={decision === "rejected" ? "red" : decision === "approved" ? "green" : "orange"}
                icon={decision === "rejected" ? XCircle : ShieldCheck}
                title={decision === "approved" ? "Approved by you" : decision === "rejected" ? "Rejected by you" : "OWL wants to write 3 files"}
                last={decision === null} flash={decision === "approved"}>
                {decision === null && (
                  <div className="hd-approve">
                    <p>Nothing is written until you decide. A checkpoint is taken first either way.</p>
                    <div className="hd-approve-row">
                      <button className="btn btn-secondary btn-sm" onClick={() => { followNewestBlock.current = true; setDecision("rejected"); }}>Reject</button>
                      <button className="btn btn-primary btn-sm hd-cta-pulse" onClick={() => { followNewestBlock.current = true; setDecision("approved"); }}>
                        <ShieldCheck size={14} weight="bold" /> Approve and run testProgress
                      </button>
                    </div>
                  </div>
                )}
                {decision === "rejected" && (
                  <div className="hd-approve">
                    <p>Reverted. No files were written and the working tree is unchanged. Tell OWL what to change, or replay the run.</p>
                    <div className="hd-approve-row">
                      <button className="btn btn-secondary btn-sm" onClick={() => setRunNumber((previousRun) => previousRun + 1)}>
                        <Play size={13} weight="fill" /> Replay
                      </button>
                    </div>
                  </div>
                )}
              </ActivityBlock>
            )}
            {accepted && testProgress >= 1 && (
              <ActivityBlock hue="purple" icon={TerminalWindow} title="Ran a command" meta={testsDone ? "0.94s" : "running"}>
                <div className="hd-term mono">
                  {TEST_OUTPUT_LINES.slice(0, Math.min(testProgress, TEST_OUTPUT_LINES.length)).map((outputLine) => (
                    <div key={outputLine.t} className={`t-${outputLine.k}`}>{outputLine.t}</div>
                  ))}
                </div>
              </ActivityBlock>
            )}
            {accepted && checkpoint && (
              <ActivityBlock hue="brown" icon={GitCommit} title="Checkpoint saved" meta={<span className="mono">a3f9c21</span>} last>
                <div className="hd-small hd-muted">Every write is in the change journal. Revert any file later.</div>
              </ActivityBlock>
            )}
          </ol>
          {stamped && (
            <div className="hd-stamp" role="status">
              <SealCheck size={18} weight="duotone" />
              <span>Approved by you</span><i>·</i><span>3 files</span><i>·</i><span>14 tests passing</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
