import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowCounterClockwise, Check, CaretDown, CaretLeft, CaretRight, Pause, Play, Stop, X,
} from "@phosphor-icons/react";
import { useApp } from "./store";
import { api } from "./agent/api";
import { contentFor } from "./seed";
import { FILES } from "./seed";
import type { FileNode } from "./types";

const MonacoEditor = lazy(() => import("@monaco-editor/react").then((m) => ({ default: m.default })));

/* ---------- resize handles ---------- */
function VHandle({ onDrag }: { onDrag: (dx: number) => void }) {
  const x0 = useRef(0);
  return (
    <div
      className="rz-v"
      role="separator"
      aria-label="Resize panel"
      title="Drag to resize"
      onPointerDown={(e) => {
        e.preventDefault();
        x0.current = e.clientX;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) onDrag(e.clientX - x0.current);
      }}
    />
  );
}

function HHandle({ onDrag }: { onDrag: (dy: number) => void }) {
  const y0 = useRef(0);
  return (
    <div
      className="rz-h"
      role="separator"
      aria-label="Resize terminal"
      title="Drag to resize"
      onPointerDown={(e) => {
        e.preventDefault();
        y0.current = e.clientY;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) onDrag(y0.current - e.clientY);
      }}
    />
  );
}

/* ---------- file tree ---------- */
function Tree({ nodes, depth = 0 }: { nodes: FileNode[]; depth?: number }) {
  const openFile = useApp((s) => s.openFile);
  const openPath = useApp((s) => s.openPath);
  const [open, setOpen] = useState<Record<string, boolean>>({ src: true, "src/auth": true });
  return (
    <>
      {nodes.map((n) => (
        <div key={n.path} className="fnode">
          <div
            className={`frow2${openPath === n.path ? " on" : ""}`}
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() => {
              if (n.children) setOpen((o) => ({ ...o, [n.path]: !o[n.path] }));
              else openFile(n.path);
            }}
          >
            {n.children ? (
              open[n.path] ? <CaretDown size={12} /> : <CaretRight size={12} />
            ) : <span style={{ width: 12 }} />}
            {n.name}
          </div>
          {n.children && open[n.path] && <Tree nodes={n.children} depth={depth + 1} />}
        </div>
      ))}
    </>
  );
}

function Sidebar() {
  const side = useApp((s) => s.side);
  const setSide = useApp((s) => s.setSide);
  const open = useApp((s) => s.sideOpen);
  const project = useApp((s) => s.project);
  const sideW = useApp((s) => s.sideW);
  const setSideW = useApp((s) => s.setSideW);
  const toggleSide = useApp((s) => s.toggleSide);
  const [q, setQ] = useState("");
  if (!open) return null;
  const hits = ["src/auth/service.go", "src/auth/middleware.go", "tests/auth_test.go"]
    .filter((f) => f.includes(q.toLowerCase()));
  const openFile = useApp.getState().openFile;
  return (
    <>
      <div className="side" style={{ width: sideW }}>
        <div className="side-tabs" role="tablist" aria-label="Project navigation">
          {(["files", "search", "git", "tasks"] as const).map((t) => (
            <button key={t} className={side === t ? "on" : ""} onClick={() => setSide(t)} role="tab">
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
          <button className="tab-x" onClick={toggleSide} title="Close sidebar" aria-label="Close sidebar" style={{ marginLeft: "auto" }}>
            <X size={13} />
          </button>
        </div>
        <div className="side-body">
          {side === "files" && (
            <>
              <div style={{ fontSize: 12, color: "var(--steel)", padding: "4px 8px" }}>{project?.name ?? "No project"}</div>
              <Tree nodes={FILES} />
            </>
          )}
          {side === "search" && (
            <>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search entire project..."
                aria-label="Search entire project"
                style={{ width: "100%", height: 36, border: "1px solid var(--hairline-strong)", borderRadius: 8, padding: "0 10px", background: "var(--canvas)", color: "var(--ink)", marginBottom: 8 }} />
              {hits.map((h) => <div key={h} className="frow2" onClick={() => openFile(h)}>{h}</div>)}
              {q && hits.length === 0 && <div style={{ fontSize: 13, color: "var(--steel)" }}>No matches.</div>}
            </>
          )}
          {side === "git" && (
            <div className="gitbox">
              <b>BRANCH</b>
              <div>main · 2 ahead · 0 behind</div>
              <div style={{ marginTop: 8 }}>12 changes · 4 staged</div>
            </div>
          )}
          {side === "tasks" && (
            <div className="taskbox">
              <b>TASKS</b>
              <div>● Implement checkout</div>
              <div>✓ Authentication</div>
              <div>○ Fix payment bug</div>
            </div>
          )}
        </div>
      </div>
      <VHandle onDrag={(dx) => setSideW(sideW + dx)} />
    </>
  );
}

/* ---------- chat ---------- */
function ChatTab() {
  const chat = useApp((s) => s.chat);
  const draft = useApp((s) => s.draft);
  const setDraft = useApp((s) => s.setDraft);
  const send = useApp((s) => s.send);
  const sendLive = useApp((s) => s.sendLive);
  const liveChat = useApp((s) => s.liveChat);
  const liveBusy = useApp((s) => s.liveBusy);
  const run = useApp((s) => s.run);
  const agent = useApp((s) => s.agent);
  const pause = useApp((s) => s.pause);
  const resume = useApp((s) => s.resume);
  const stop = useApp((s) => s.stop);
  const askConfirm = useApp((s) => s.askConfirm);
  const modelPref = useApp((s) => s.modelPref);
  const setModelPref = useApp((s) => s.setModelPref);
  const [models, setModels] = useState<{ id: string; status: string }[]>([]);
  useEffect(() => {
    let alive = true;
    api
      .registry()
      .then((r) => {
        if (alive) setModels(r.models.map((m) => ({ id: m.id, status: m.status })));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const confirmStop = () => askConfirm({
    title: "Stop the running task?",
    body: "The agent halts immediately. Progress so far is kept and can be resumed from history.",
    confirmLabel: "Stop task",
    run: stop,
  });
  return (
    <div className="chat">
      <div className="chatbar">
        <span className="chatbar-status">
          OWL · {liveChat ? "Live model" : "Sample replay"} · Working on ZudoMart · {agent === "working" ? "Analyzing project" : agent === "paused" ? "Paused" : agent === "awaiting" ? "Waiting for approval" : agent === "done" ? "Done" : "Idle"}
        </span>
        <select
          className="modelsel"
          aria-label="Model"
          value={modelPref}
          onChange={(e) => setModelPref(e.target.value)}
          title={modelPref === "auto" ? "Auto: router picks per task" : `Pinned: ${modelPref}`}
        >
          <option value="auto">Auto</option>
          {models
            .filter((m) => m.status === "available" || m.status === "verified")
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
              </option>
            ))}
          {models
            .filter((m) => m.status !== "available" && m.status !== "verified")
            .map((m) => (
              <option key={m.id} value={m.id} disabled>
                {m.id} ({m.status})
              </option>
            ))}
        </select>
      </div>
      {chat.map((m) => (
        <div key={m.id} className={`bubble2${m.from === "you" ? " you" : ""}`}>
          <b className="who">{m.from === "you" ? "YOU" : m.from === "owl" ? "OWL" : "SYSTEM"}</b>
          {m.text}
          {m.meta && <div className="meta-line">{m.meta}</div>}
          {m.plan && (
            <ul className="plan">
              {m.plan.map((p, i) => (
                <li key={p}><span style={{ color: "var(--green)", fontWeight: 700 }}>{i + 1}.</span> {p}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(agent === "working" || agent === "awaiting") && (
          <button className="btn btn-secondary" onClick={pause}><Pause size={14} /> Pause</button>
        )}
        {agent === "paused" && (
          <button className="btn btn-secondary" onClick={resume}><Play size={14} /> Resume</button>
        )}
        {(agent === "working" || agent === "paused" || agent === "awaiting") && (
          <button className="btn btn-secondary" onClick={confirmStop}><Stop size={14} /> Stop</button>
        )}
        {(agent === "idle" || agent === "done" || agent === "stopped") && (
          <button className="btn btn-primary" onClick={run}><Play size={14} /> Run sample task</button>
        )}
      </div>
      <div className="prompt">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Describe what you want to build..."
          aria-label="Message OWL"
          onKeyDown={(e) => { if (e.key === "Enter") (liveChat ? sendLive : send)(); }} />
        <button className="btn btn-dark" disabled={liveChat && liveBusy} onClick={liveChat ? sendLive : send}>
          {liveChat && liveBusy ? "Waiting…" : "Send"}
        </button>
      </div>
    </div>
  );
}

/* ---------- code with Monaco, offline-safe fallback ---------- */
function useDark(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.getAttribute("data-theme") === "dark");
  useEffect(() => {
    const ob = new MutationObserver(() => setDark(document.documentElement.getAttribute("data-theme") === "dark"));
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => ob.disconnect();
  }, []);
  return dark;
}

class EditorError extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <>{this.props.fallback}</>;
    return this.props.children;
  }
}

function FallbackCode({ path }: { path: string }) {
  const { code } = contentFor(path);
  return (
    <pre aria-label="Source preview">
      {code.split("\n").map((line, i) => (
        <span key={i} className="ln"><i>{i + 1}</i><span>{line || " "}</span></span>
      ))}
    </pre>
  );
}

function CodeTab() {
  const openPath = useApp((s) => s.openPath);
  const edited = useApp((s) => s.edited);
  const editFile = useApp((s) => s.editFile);
  const dark = useDark();
  const { lang, code } = contentFor(openPath);
  const value = edited[openPath] ?? code;
  const tabs = ["src/auth/service.go", "src/auth/middleware.go", "src/main.go"];
  const openFile = useApp((s) => s.openFile);
  return (
    <div className="codeview">
      <header>
        {tabs.map((t) => (
          <span key={t} className={openPath === t ? "on" : ""} onClick={() => openFile(t)} style={{ cursor: "pointer" }}>
            {t.split("/").pop()}{edited[t] ? " ●" : ""}
          </span>
        ))}
        {!tabs.includes(openPath) && <span className="on">{openPath.split("/").pop()}</span>}
      </header>
      <div style={{ height: 420 }}>
        <EditorError fallback={<FallbackCode path={openPath} />}>
          <Suspense fallback={<div className="skel" aria-label="Loading editor"><i /><i /><i /><i /><i /></div>}>
            <MonacoEditor
              path={openPath}
              language={lang}
              value={value}
              theme={dark ? "vs-dark" : "vs"}
              onChange={(v) => editFile(openPath, v ?? "")}
              options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, padding: { top: 12 } }}
            />
          </Suspense>
        </EditorError>
      </div>
    </div>
  );
}

/* ---------- changes ---------- */
function ChangesTab() {
  const changes = useApp((s) => s.changes);
  const changeState = useApp((s) => s.changeState);
  const decideChange = useApp((s) => s.decideChange);
  const undoChange = useApp((s) => s.undoChange);
  const history = useApp((s) => s.history);
  if (changes.length === 0) {
    return (
      <div className="empty">No changes yet. AI modifications will appear here.
        <div className="row"><button className="btn btn-secondary" onClick={() => useApp.getState().run()}>Run sample task</button></div>
      </div>
    );
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button className="btn btn-secondary" disabled={history.length === 0} onClick={undoChange}>
          <ArrowCounterClockwise size={14} /> Undo{history.length > 0 ? ` (${history.length})` : ""}
        </button>
      </div>
      {changes.map((c) => {
        const st = changeState[c.path] ?? "pending";
        return (
          <div key={c.path} className="diff" style={{ opacity: st === "rejected" ? 0.55 : 1 }}>
            <header><span className={`st-tag st-${c.status}`}>{c.status}</span> {c.path}
              {st !== "pending" && <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--steel)" }}>{st}</span>}
            </header>
            {c.before && <div className="del">- {c.before}</div>}
            {c.after && <div className="add">+ {c.after}</div>}
            <div className="acts">
              <button className="btn btn-secondary" onClick={() => decideChange(c.path, "accepted")}>Accept</button>
              <button className="btn btn-secondary" onClick={() => decideChange(c.path, "rejected")}>Reject</button>
              <button className="btn btn-secondary" onClick={() => decideChange(c.path, "pending")}>Revert</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- browser with loading state ---------- */
function MiniBrowser() {
  const [w, setW] = useState(1440);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 700);
    return () => clearTimeout(t);
  }, [w]);
  return (
    <div>
      <div className="devices" style={{ marginBottom: 12 }}>
        {[1440, 1024, 768, 390].map((d) => (
          <button key={d} className={w === d ? "on" : ""} onClick={() => setW(d)}>{d}px</button>
        ))}
      </div>
      {loading ? (
        <div className="skel wide" aria-label="Loading preview"><i /><i /><i /><i /></div>
      ) : (
        <div className="viewport" style={{ maxWidth: w, margin: "0 auto", width: "100%" }}>
          localhost:3000 at {w}px
        </div>
      )}
    </div>
  );
}

/* ---------- inspector ---------- */
function Inspector() {
  const tab = useApp((s) => s.inspector);
  const setInspector = useApp((s) => s.setInspector);
  const open = useApp((s) => s.inspectorOpen);
  const toggleInspector = useApp((s) => s.toggleInspector);
  const events = useApp((s) => s.events);
  const approvals = useApp((s) => s.approvals);
  const changes = useApp((s) => s.changes);
  const decide = useApp((s) => s.decide);
  const setCenter = useApp((s) => s.setCenter);
  const inspW = useApp((s) => s.inspW);
  const setInspW = useApp((s) => s.setInspW);
  if (!open) return null;
  return (
    <>
      <VHandle onDrag={(dx) => setInspW(inspW - dx)} />
      <div className="insp" style={{ width: inspW }}>
        <div className="itabs" role="tablist" aria-label="Inspector">
          {(["agent", "changes", "tasks", "context"] as const).map((t) => (
            <button key={t} className={tab === t ? "on" : ""} onClick={() => setInspector(t)} role="tab">
              {t === "agent" ? "Agent" : t === "tasks" ? "Approvals" : t[0].toUpperCase() + t.slice(1)}
              {t === "changes" && changes.length > 0 ? ` (${changes.length})` : ""}
            </button>
          ))}
          <button className="tab-x" onClick={toggleInspector} title="Close inspector" aria-label="Close inspector">
            <X size={13} />
          </button>
        </div>
        <div className="ibody">
          {tab === "agent" && (
            events.length === 0
              ? <div style={{ fontSize: 13, color: "var(--steel)" }}>No activity yet. Run the sample task from Chat.</div>
              : events.map((e) => (
                <div key={e.id} className="ev">
                  <span style={{ color: e.state === "done" ? "var(--green)" : e.state === "active" ? "var(--orange)" : "var(--steel)" }}>
                    {e.state === "done" ? <Check size={14} weight="bold" /> : e.state === "active" ? "●" : "○"}
                  </span>
                  <span>{e.label}{e.detail && <small>{e.detail}</small>}</span>
                </div>
              ))
          )}
          {tab === "changes" && (
            changes.length === 0
              ? <div style={{ fontSize: 13, color: "var(--steel)" }}>No changes yet.</div>
              : changes.map((c) => (
                <div key={c.path} className="frow2" onClick={() => setCenter("changes")}>
                  <span className={`st-tag st-${c.status}`}>{c.status}</span> {c.path}
                </div>
              ))
          )}
          {tab === "tasks" && (
            approvals.filter((a) => a.status === "pending").length > 0
              ? approvals.filter((a) => a.status === "pending").map((a) => (
                <div key={a.id} className="appr">
                  <b>{a.title}</b>
                  {a.command && <code>$ {a.command}</code>}
                  {a.files && <div style={{ fontSize: 12, color: "var(--slate)" }}>{a.files.length} files</div>}
                  <div className="meta">{a.dir} · {a.reason} · Risk {a.risk}</div>
                  <div className="row">
                    <button className="mini-btn" onClick={() => { decide(a.id, "rejected"); }}>Reject</button>
                    <button className="mini-btn go" onClick={() => { decide(a.id, "approved"); }}>Approve</button>
                  </div>
                  <div className="row">
                    <button className="mini-btn" onClick={() => setCenter("changes")}>View Diff</button>
                  </div>
                </div>
              ))
              : <div style={{ fontSize: 13, color: "var(--steel)" }}>Approval queue is clear.</div>
          )}
          {tab === "context" && <ContextPanel />}
        </div>
      </div>
    </>
  );
}

/* ---------- context inspector ---------- */
function ContextPanel() {
  const chat = useApp((s) => s.chat);
  const modelPref = useApp((s) => s.modelPref);
  const [report, setReport] = useState<import("./agent/api").BudgetReport | null>(null);
  const [history, setHistory] = useState<{ id: number; level: number; before_tokens: number; after_tokens: number; summary: string; created_at: string }[]>([]);
  useEffect(() => {
    let alive = true;
    const parts = chat
      .filter((m) => m.from !== "sys")
      .slice(-12)
      .map((m) => ({ category: m.from === "you" ? "recent" : "history", text: m.text.slice(0, 2000) }));
    api
      .budget(modelPref === "auto" ? "" : modelPref, [
        { category: "instructions", text: "You are OWL, a careful coding assistant." },
        ...parts,
      ])
      .then((r) => {
        if (alive) setReport(r);
      })
      .catch(() => {});
    api
      .compressions()
      .then((h) => {
        if (alive) setHistory(h);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [chat.length, modelPref]);
  if (!report) {
    return (
      <div className="ctx">
        <div>Files 8 · Lines 1,843 · 12 messages · 14 tools</div>
        <div>Context budget unavailable offline.</div>
      </div>
    );
  }
  const pct = Math.min(100, Math.round(report.utilization * 100));
  return (
    <div className="ctx">
      <div>Model {report.model || "auto"} · limit {report.limit.toLocaleString()} ({report.limit_source})</div>
      <div>
        {report.used.toLocaleString()} of {report.available.toLocaleString()} tokens ({pct}%)
        {report.over_budget ? " · OVER BUDGET" : ""}
        {report.should_compress && !report.over_budget ? " · compression advised" : ""}
      </div>
      <div className="bar">
        <i style={{ width: `${pct}%` }} />
      </div>
      {report.parts.map((p) => (
        <div key={p.category}>
          {p.category}: {p.tokens.toLocaleString()}
        </div>
      ))}
      {history.length > 0 && (
        <div>
          Compression history
          {history.slice(0, 5).map((h) => (
            <div key={h.id}>
              L{h.level}: {h.before_tokens.toLocaleString()} to {h.after_tokens.toLocaleString()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- terminal ---------- */
function Terminal() {
  const lines = useApp((s) => s.terminal);
  const open = useApp((s) => s.termOpen);
  const toggleTerm = useApp((s) => s.toggleTerm);
  const runCommand = useApp((s) => s.runCommand);
  const [cmd, setCmd] = useState("");
  if (!open) return null;
  return (
    <div className="termwrap">
      <div className="ttabs">
        <span className="on">Agent</span><span>Dev Server</span><span>Tests</span>
        <span className="x" style={{ marginLeft: "auto" }} onClick={toggleTerm} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter") toggleTerm(); }} title="Close terminal (Ctrl+J)">
          Close <X size={13} />
        </span>
      </div>
      <div className="tout" aria-live="polite">
        {lines.map((l) => (
          <div key={l.id} className={l.kind === "cmd" ? "c" : l.kind === "ok" ? "k" : l.kind === "err" ? "e" : l.kind === "agent" ? "a" : "o"}>
            {l.text}
          </div>
        ))}
      </div>
      <div className="tin">
        <span>$</span>
        <input value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="Run a command in the project sandbox..."
          aria-label="Run a command"
          onKeyDown={(e) => { if (e.key === "Enter") { runCommand(cmd); setCmd(""); } }} />
      </div>
    </div>
  );
}

/* ---------- shell ---------- */
export function TopBar({ onPalette, onAi }: { onPalette: () => void; onAi: () => void }) {
  const project = useApp((s) => s.project);
  const agent = useApp((s) => s.agent);
  const go = useApp((s) => s.go);
  const pill = agent === "working" ? "pill work" : agent === "awaiting" ? "pill work" : agent === "paused" ? "pill pause" : "pill ready";
  const label = agent === "working" ? "Working" : agent === "awaiting" ? "Needs approval" : agent === "paused" ? "Paused" : agent === "done" ? "Done" : "Ready";
  return (
    <div className="topbar">
      <span className="proj">OWL</span>
      <span className="crumb">{project ? project.name : "No project open"}</span>
      <span className="grow" />
      <span className={pill}>● {label}</span>
      <button className="kbd-btn hide-m" onClick={onAi}>Ask OWL <kbd>Ctrl K</kbd></button>
      <button className="kbd-btn" onClick={onPalette}><kbd>Ctrl Shift P</kbd></button>
      <button className="kbd-btn" onClick={() => go("settings")}>Settings</button>
    </div>
  );
}

export default function Workspace() {
  const project = useApp((s) => s.project);
  const center = useApp((s) => s.center);
  const setCenter = useApp((s) => s.setCenter);
  const openProject = useApp((s) => s.openProject);
  const setCreate = useApp((s) => s.setCreate);
  const toggleTerm = useApp((s) => s.toggleTerm);
  const termOpen = useApp((s) => s.termOpen);
  const termH = useApp((s) => s.termH);
  const setTermH = useApp((s) => s.setTermH);
  const sideOpen = useApp((s) => s.sideOpen);
  const inspOpen = useApp((s) => s.inspectorOpen);
  const toggleSide = useApp((s) => s.toggleSide);
  const toggleInspector = useApp((s) => s.toggleInspector);
  if (!project) {
    return (
      <div className="page">
        <div className="empty">No project open. Open an existing project or create something new.
          <div className="row">
            <button className="btn btn-primary" onClick={() => setCreate(true)}>Create Project</button>
            <button className="btn btn-secondary" onClick={() => openProject({ name: "ZudoMart", path: "~/Projects/zudomart", opened: "now" })}>Open ZudoMart</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={`work${termOpen ? "" : " no-term"}`}>
      <div className="worktop">
        {!sideOpen && (
          <button className="pane-reopen l" onClick={toggleSide} title="Open sidebar" aria-label="Open sidebar">
            <CaretRight size={14} weight="bold" />
          </button>
        )}
        <Sidebar />
        <div className="center">
        <div className="ctabs" role="tablist" aria-label="Workspace tabs">
          {(["chat", "code", "changes", "browser", "preview"] as const).map((t) => (
            <button key={t} className={center === t ? "on" : ""} onClick={() => setCenter(t)} role="tab">
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="cbody">
          {center === "chat" && <ChatTab />}
          {center === "code" && <CodeTab />}
          {center === "changes" && <ChangesTab />}
          {center === "browser" && <MiniBrowser />}
          {center === "preview" && <MiniBrowser />}
        </div>
      </div>
      <Inspector />
        {!inspOpen && (
          <button className="pane-reopen r" onClick={toggleInspector} title="Open inspector" aria-label="Open inspector">
            <CaretLeft size={14} weight="bold" />
          </button>
        )}
      </div>
      <div className="termzone" style={termOpen ? { height: termH } : undefined}>
        {termOpen && <HHandle onDrag={(dy) => setTermH(termH + dy)} />}
        <Terminal />
        {!termOpen && (
          <button className="termreopen" onClick={toggleTerm}>
            Open terminal <kbd>Ctrl J</kbd>
          </button>
        )}
      </div>
    </div>
  );
}
