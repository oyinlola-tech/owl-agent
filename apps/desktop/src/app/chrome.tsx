import { useEffect, useMemo, useRef, useState } from "react";
import { ClockCounterClockwise, FolderOpen, Gear, Globe, House, Layout } from "@phosphor-icons/react";
import { useApp } from "./store";
import { COMMANDS } from "./seed";
import type { AppScreen } from "./types";

const RAIL: { s: AppScreen; icon: typeof House; label: string }[] = [
  { s: "welcome", icon: House, label: "Welcome" },
  { s: "projects", icon: FolderOpen, label: "Projects" },
  { s: "workspace", icon: Layout, label: "Workspace" },
  { s: "tasks", icon: ClockCounterClockwise, label: "Tasks" },
  { s: "browser", icon: Globe, label: "Browser Studio" },
];

export function Rail() {
  const screen = useApp((s) => s.screen);
  const go = useApp((s) => s.go);
  return (
    <div className="rail" role="navigation" aria-label="Primary">
      {RAIL.map((r) => (
        <button key={r.s} className={screen === r.s || (screen === "task" && r.s === "tasks") ? "on" : ""}
          onClick={() => go(r.s)} title={r.label} aria-label={r.label}>
          <r.icon size={20} />
        </button>
      ))}
      <span className="sp" />
      <button className={screen === "settings" ? "on" : ""} onClick={() => go("settings")} title="Settings" aria-label="Settings">
        <Gear size={20} />
      </button>
    </div>
  );
}

export function StatusBar({ onCommand }: { onCommand: () => void }) {
  const agent = useApp((s) => s.agent);
  const changes = useApp((s) => s.changes);
  const go = useApp((s) => s.go);
  const toggleTerm = useApp((s) => s.toggleTerm);
  return (
    <div className="statusbar">
      <button onClick={() => go("workspace")}>main, {changes.length} changes</button>
      <button onClick={() => go("tasks")}>
        {agent === "working" ? "Agent working" : agent === "paused" ? "Agent paused" : agent === "awaiting" ? "Agent needs approval" : "Agent ready"}
      </button>
      <span className="grow" />
      <span className="hide-m">NVIDIA model</span>
      <button onClick={toggleTerm}>Terminal</button>
      <button onClick={onCommand}>Palette</button>
    </div>
  );
}

export function Notice() {
  const notice = useApp((s) => s.notice);
  const notify = useApp((s) => s.notify);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => notify(null), 2600);
    return () => clearTimeout(t);
  }, [notice, notify]);
  if (!notice) return null;
  return <div className="notice" role="status">{notice}</div>;
}

export function Palette() {
  const open = useApp((s) => s.palette);
  const setPalette = useApp((s) => s.setPalette);
  const go = useApp((s) => s.go);
  const pause = useApp((s) => s.pause);
  const resume = useApp((s) => s.resume);
  const toggleTerm = useApp((s) => s.toggleTerm);
  const toggleSide = useApp((s) => s.toggleSide);
  const toggleInspector = useApp((s) => s.toggleInspector);
  const newTask = useApp((s) => s.newTask);
  const undoChange = useApp((s) => s.undoChange);
  const setSide = useApp((s) => s.setSide);
  const setCenter = useApp((s) => s.setCenter);
  const termOpen = useApp((s) => s.termOpen);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) { setQ(""); setTimeout(() => ref.current?.focus(), 30); }
  }, [open ]);
  const list = useMemo(() => COMMANDS.filter((c) => c.toLowerCase().includes(q.toLowerCase())), [q]);
  if (!open) return null;
  const run = (c: string) => {
    setPalette(false);
    if (c === "Open Settings") go("settings");
    else if (c === "Open Browser") go("browser");
    else if (c === "Open Terminal") { go("workspace"); if (!termOpen) toggleTerm(); }
    else if (c === "Toggle Terminal") { go("workspace"); toggleTerm(); }
    else if (c === "Toggle Sidebar") { go("workspace"); toggleSide(); }
    else if (c === "Toggle Inspector") { go("workspace"); toggleInspector(); }
    else if (c === "Open Project" || c === "New Task") { newTask(); }
    else if (c === "Open File") { go("workspace"); setSide("search"); }
    else if (c === "Review Changes") { go("workspace"); setCenter("changes"); }
    else if (c === "Undo Change") undoChange();
    else if (c === "Pause Agent") pause();
    else if (c === "Resume Agent") resume();
    else if (c === "Ask OWL") go("workspace");
    else toggleTerm();
  };
  return (
    <div className="overlay" onClick={() => setPalette(false)}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search commands"
          onKeyDown={(e) => { if (e.key === "Enter" && list[0]) run(list[0]); if (e.key === "Escape") setPalette(false); }} />
        <ul>
          {list.map((c) => (
            <li key={c}><button onClick={() => run(c)}>{c}</button></li>
          ))}
          {list.length === 0 && <li><button disabled>No matching command</button></li>}
        </ul>
      </div>
    </div>
  );
}

export function ConfirmModal() {
  const confirm = useApp((s) => s.confirm);
  const answerConfirm = useApp((s) => s.answerConfirm);
  if (!confirm) return null;
  return (
    <div className="overlay" onClick={() => answerConfirm(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="alertdialog"
        aria-label={confirm.title} aria-describedby="confirm-body">
        <h3>{confirm.title}</h3>
        <p id="confirm-body" style={{ fontSize: 14, color: "var(--slate)", margin: "0 0 8px" }}>{confirm.body}</p>
        <div className="row">
          <button className="btn btn-secondary" onClick={() => answerConfirm(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={() => answerConfirm(true)}>{confirm.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

const CTX = ["Current file", "Current folder", "Current project", "Selected files", "Entire workspace", "Computer"];

export function AiBar() {
  const open = useApp((s) => s.aiBar);
  const setAiBar = useApp((s) => s.setAiBar);
  const pushLine = useApp((s) => s.pushLine);
  const [q, setQ] = useState("");
  const [ctx, setCtx] = useState(2);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) { setQ(""); setTimeout(() => ref.current?.focus(), 30); }
  }, [open]);
  if (!open) return null;
  const run = () => {
    if (!q.trim()) return;
    pushLine({ kind: "cmd", text: `$ owl run [${CTX[ctx]}] "${q.slice(0, 48)}"` });
    setAiBar(false);
  };
  return (
    <div className="overlay" onClick={() => setAiBar(false)}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Ask OWL">
        <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask OWL anything..."
          onKeyDown={(e) => { if (e.key === "Enter") run(); if (e.key === "Escape") setAiBar(false); }} />
        <ul>
          {CTX.map((c, i) => (
            <li key={c}>
              <button className={i === ctx ? "hot" : ""} onClick={() => setCtx(i)}>
                {i === ctx ? "● " : "○ "}{c}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
