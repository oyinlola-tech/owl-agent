import { useState } from "react";
import { ArrowLeft, ArrowCounterClockwise, Check, Pause, Play, Plus, Stop } from "@phosphor-icons/react";
import { useApp } from "./store";
import type { TaskFilter } from "./types";

const FILTERS: TaskFilter[] = ["all", "running", "completed", "failed", "cancelled"];

export function Tasks() {
  const tasks = useApp((s) => s.tasks);
  const filter = useApp((s) => s.taskFilter);
  const setFilter = useApp((s) => s.setFilter);
  const openTask = useApp((s) => s.openTask);
  const newTask = useApp((s) => s.newTask);
  const [q, setQ] = useState("");
  const list = tasks.filter((t) =>
    (filter === "all" || t.status === filter) &&
    (t.name + t.project).toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div className="page">
      <h2>Task History</h2>
      <p className="lede">Running and past agent work. Select a task for its full record.</p>
      <div style={{ marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={newTask}><Plus size={15} weight="bold" /> New Task</button>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {FILTERS.map((f) => (
          <button key={f} className={`btn ${filter === f ? "btn-dark" : "btn-secondary"}`} onClick={() => setFilter(f)}>
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks..." aria-label="Search tasks"
          style={{ marginLeft: "auto", height: 40, border: "1px solid var(--hairline-strong)", borderRadius: 8, padding: "0 12px", background: "var(--canvas)", color: "var(--ink)" }} />
      </div>
      {list.map((t) => (
        <button key={t.id} className="taskrow" onClick={() => openTask(t.id)}>
          <span><b>{t.name}</b><br /><span style={{ color: "var(--steel)", fontSize: 13 }}>{t.project} · {t.note}</span></span>
          <span className={`st st-${t.status}`}>{t.status}</span>
        </button>
      ))}
      {list.length === 0 && <div className="empty">No tasks yet. Start by telling OWL what you want to build.</div>}
    </div>
  );
}

export function TaskDetail() {
  const tasks = useApp((s) => s.tasks);
  const id = useApp((s) => s.openTaskId);
  const go = useApp((s) => s.go);
  const agent = useApp((s) => s.agent);
  const pause = useApp((s) => s.pause);
  const resume = useApp((s) => s.resume);
  const stop = useApp((s) => s.stop);
  const run = useApp((s) => s.run);
  const askConfirm = useApp((s) => s.askConfirm);
  const t = tasks.find((x) => x.id === id) ?? tasks[0];
  const live = t.id === "task-1";
  return (
    <div className="page">
      <button className="btn btn-secondary" onClick={() => go("tasks")}><ArrowLeft size={14} /> All tasks</button>
      <h2 style={{ marginTop: 16 }}>{t.name}</h2>
      <p className="lede">{t.project} · Started {t.started} · Elapsed {t.elapsed}</p>
      <div className="pbar"><i style={{ width: `${live && agent !== "idle" ? Math.max(t.progress, useApp.getState().step * 30) : t.progress}%` }} /></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {live && (agent === "working" || agent === "awaiting") && <button className="btn btn-secondary" onClick={pause}><Pause size={14} /> Pause</button>}
        {live && agent === "paused" && <button className="btn btn-secondary" onClick={resume}><Play size={14} /> Resume</button>}
        {live && agent !== "idle" && agent !== "done" && (
          <button className="btn btn-secondary" onClick={() => askConfirm({
            title: "Stop this task?",
            body: `${t.name} halts immediately. Progress so far is kept.`,
            confirmLabel: "Stop task",
            run: stop,
          })}>
            <Stop size={14} /> Stop
          </button>
        )}
        {!live && t.status === "failed" && <button className="btn btn-secondary" onClick={() => { go("workspace"); run(); }}><ArrowCounterClockwise size={14} /> Retry</button>}
        <button className="btn btn-primary" onClick={() => go("workspace")}><Check size={14} weight="bold" /> Approve</button>
      </div>
      <div className="detail-grid">
        <div className="kv"><h4>Plan</h4>{t.plan.map((p, i) => <p key={p}>{i + 1}. {p}</p>)}</div>
        <div className="kv"><h4>Files touched</h4>{t.files.length === 0 ? <p>None yet.</p> : t.files.map((f) => <p key={f}>{f}</p>)}</div>
        <div className="kv"><h4>Commands</h4>{t.commands.map((c) => <p key={c}>$ {c}</p>)}</div>
        <div className="kv"><h4>Tests</h4><p>{t.status === "completed" ? "All passing." : t.note}</p></div>
      </div>
    </div>
  );
}

export function BrowserStudio() {
  const [url, setUrl] = useState("https://example.com");
  const [w, setW] = useState(1440);
  const [stage, setStage] = useState<"idle" | "analysis" | "built">("idle");
  const notify = useApp((s) => s.notify);
  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <h2>Browser Studio</h2>
      <p className="lede">Inspect live pages and recreate public sites into your project.</p>
      <div className="browserbar">
        <button className="btn btn-secondary">←</button>
        <button className="btn btn-secondary">→</button>
        <button className="btn btn-secondary">⟳</button>
        <input value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Address" />
        <div className="devices">
          {[1440, 1024, 768, 390].map((d) => (
            <button key={d} className={w === d ? "on" : ""} onClick={() => setW(d)}>{d}</button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {["Screenshot", "Inspect", "Select Element", "Copy HTML", "Copy CSS", "Analyze Page"].map((a) => (
          <button key={a} className="btn btn-secondary" onClick={() => notify(`${a} queued`)}>{a}</button>
        ))}
      </div>
      <div className="viewport" style={{ maxWidth: w, margin: "0 auto", width: "100%" }}>{url} at {w}px</div>
      <div className="detail-grid">
        <div className="kv">
          <h4>Website recreation</h4>
          <p>Reference {url}. Analysis finds pages, components, fonts, and breakpoints, then builds fresh code.</p>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn btn-dark" onClick={() => setStage("analysis")}>Analyze</button>
            <button className="btn btn-primary" disabled={stage !== "analysis"} onClick={() => setStage("built")}>Build implementation</button>
          </div>
        </div>
        <div className="kv">
          <h4>Analysis</h4>
          {stage === "idle" && <p>Run Analyze to inspect the reference.</p>}
          {stage !== "idle" && <p>6 pages · 34 components · 17 images · 3 fonts · 4 breakpoints · Navigation detected.</p>}
          {stage === "built" && <p>Build complete. Open the Changes tab to review.</p>}
        </div>
      </div>
    </div>
  );
}

const SETS = ["General", "AI", "Permissions", "Security", "Git", "Advanced"] as const;

function Row({ title, sub, on, onFlip }: { title: string; sub: string; on: boolean; onFlip: () => void }) {
  return (
    <div className="setrow">
      <span>{title}<small>{sub}</small></span>
      <button className={`switch${on ? " on" : ""}`} onClick={onFlip} role="switch" aria-checked={on} aria-label={title}><i /></button>
    </div>
  );
}

export function Settings() {
  const [cat, setCat] = useState<typeof SETS[number]>("General");
  const [flags, setFlags] = useState<Record<string, boolean>>({
    fs: true, term: true, browser: true, net: true, priv: false,
    checkpoint: true, commit: false, push: true, notify: true,
  });
  const flip = (k: string) => setFlags((f) => ({ ...f, [k]: !f[k] }));
  return (
    <div className="page">
      <h2>Settings</h2>
      <p className="lede">AI, permissions, appearance, and system configuration.</p>
      <div className="setgrid">
        <div className="setnav">
          {SETS.map((s) => (
            <button key={s} className={cat === s ? "on" : ""} onClick={() => setCat(s)}>{s}</button>
          ))}
        </div>
        <div>
          {cat === "General" && (
            <>
              <Row title="Appearance follows system" sub="Light and dark themes supported" on={flags.notify} onFlip={() => flip("notify")} />
              <Row title="Desktop notifications" sub="Subtle toasts for builds and approvals" on={flags.notify} onFlip={() => flip("notify")} />
            </>
          )}
          {cat === "AI" && (
            <>
              <div className="setrow"><span>Provider<small>NVIDIA Build, key in system keyring</small></span><span style={{ fontSize: 13, color: "var(--steel)" }}>Connected</span></div>
              <div className="setrow"><span>Maximum agent steps<small>Hard stop per task</small></span><span style={{ fontSize: 13 }}>50</span></div>
            </>
          )}
          {cat === "Permissions" && (
            <>
              <Row title="Filesystem" sub="Read and write inside the project" on={flags.fs} onFlip={() => flip("fs")} />
              <Row title="Terminal" sub="Run project commands" on={flags.term} onFlip={() => flip("term")} />
              <Row title="Browser" sub="Preview and inspect local pages" on={flags.browser} onFlip={() => flip("browser")} />
              <Row title="External network" sub="Fetch public pages for recreation" on={flags.net} onFlip={() => flip("net")} />
              <Row title="Privileged commands" sub="Requires explicit approval every time" on={flags.priv} onFlip={() => flip("priv")} />
            </>
          )}
          {cat === "Security" && (
            <div className="setrow"><span>Protected paths<small>~/.ssh, ~/.gnupg, credentials never sent</small></span><span style={{ fontSize: 13, color: "var(--green)" }}>Enforced</span></div>
          )}
          {cat === "Git" && (
            <>
              <Row title="Auto checkpoint before changes" sub="Git snapshot the agent can restore" on={flags.checkpoint} onFlip={() => flip("checkpoint")} />
              <Row title="Auto commit" sub="Commit without asking" on={flags.commit} onFlip={() => flip("commit")} />
              <Row title="Require approval before push" sub="Push always confirms" on={flags.push} onFlip={() => flip("push")} />
            </>
          )}
          {cat === "Advanced" && (
            <div className="setrow"><span>Debug logs<small>Agent event stream for diagnostics</small></span><span style={{ fontSize: 13 }}>Off</span></div>
          )}
        </div>
      </div>
    </div>
  );
}
