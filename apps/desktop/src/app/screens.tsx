import { useEffect, useState } from "react";
import { ArrowLeft, ArrowCounterClockwise, Check, Pause, Play, Plus, Stop } from "@phosphor-icons/react";
import { useApp } from "./store";
import { api, type ProviderRead } from "./agent/api";
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
      <BackendTasks />
    </div>
  );
}

function BackendTasks() {
  const notify = useApp((s) => s.notify);
  const openBTask = useApp((s) => s.openBTask);
  const [rows, setRows] = useState<import("./agent/api").BackendTask[]>([]);
  const [online, setOnline] = useState(true);
  const [ckpts, setCkpts] = useState<Record<string, { id: string; label: string }[]>>({});
  const [prompt, setPrompt] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [roots, setRoots] = useState<string[]>([]);
  const load = async () => {
    try {
      const [tasks, ws] = await Promise.all([api.backendTasks(), api.workspaces()]);
      setRows(tasks);
      setRoots(ws.roots);
      if (!workspace && ws.roots.length > 0) setWorkspace(ws.roots[0]);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      notify(msg);
      await load();
    } catch {
      notify("Backend unreachable");
    }
  };
  const showCkpts = async (id: string) => {
    try {
      const list = await api.checkpoints(id);
      setCkpts((c) => ({ ...c, [id]: list }));
    } catch {
      notify("Backend unreachable");
    }
  };
  if (!online) return null;
  return (
    <div style={{ marginTop: 32 }}>
      <h3 style={{ fontSize: 20, margin: "0 0 4px" }}>Saved backend tasks</h3>
      <p className="lede">Persisted across restarts with checkpoints. Resume continues from the last verified state.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0 16px" }}>
        <input
          value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder="New task objective..." aria-label="New backend task"
          style={{ flex: 2, minWidth: 200, height: 40, border: "1px solid var(--hairline-strong)", borderRadius: 8, padding: "0 12px", background: "var(--canvas)", color: "var(--ink)" }}
        />
        <input
          value={workspace} onChange={(e) => setWorkspace(e.target.value)}
          placeholder={roots.length ? roots[0] : "Workspace path"} aria-label="Workspace path"
          title={roots.length ? `Authorized: ${roots.join(", ")}` : "No workspaces authorized on the backend"}
          style={{ flex: 1, minWidth: 160, height: 40, border: "1px solid var(--hairline-strong)", borderRadius: 8, padding: "0 12px", background: "var(--canvas)", color: "var(--ink)" }}
        />
        <button
          className="btn btn-primary"
          disabled={!prompt.trim()}
          onClick={() => void (async () => {
            try {
              const t = await api.createBackendTask(prompt.trim(), "", workspace.trim());
              setPrompt("");
              notify("Backend task started");
              openBTask(t.id);
            } catch {
              notify("Backend unreachable");
            }
          })()}
        >
          Start task
        </button>
      </div>
      {rows.map((t) => (
        <div key={t.id} className="taskrow" style={{ cursor: "pointer" }} onClick={() => openBTask(t.id)} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter") openBTask(t.id); }}>
          <span>
            <b style={{ fontSize: 13, fontFamily: "ui-monospace, monospace" }}>{t.id}</b>
            <br />
            <span style={{ color: "var(--steel)", fontSize: 13 }}>
              {t.prompt.slice(0, 80)} · {t.model || "no model"} · {t.progress}%
              {ckpts[t.id] && ` · checkpoints: ${ckpts[t.id].map((c) => c.label).join(", ")}`}
            </span>
          </span>
          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span className={`st st-${t.status === "awaiting_approval" ? "running" : t.status}`}>{t.status.replace("_", " ")}</span>
            {(t.status === "paused" || t.status === "failed") && (
              <button className="btn btn-secondary" onClick={(e) => { e.stopPropagation(); void act(() => api.resumeBackendTask(t.id), "Task resumed"); }}>Resume</button>
            )}
            {(t.status === "running" || t.status === "awaiting_approval" || t.status === "paused") && (
              <button className="btn btn-secondary" onClick={(e) => { e.stopPropagation(); void act(() => api.cancelBackendTask(t.id), "Task cancelled"); }}>Cancel</button>
            )}
            <button className="btn btn-secondary" onClick={(e) => { e.stopPropagation(); void showCkpts(t.id); }}>Checkpoints</button>
          </span>
        </div>
      ))}
      {rows.length === 0 && <div className="empty">No saved backend tasks yet.</div>}
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
  const [capture, setCapture] = useState<{ title: string; text: string; screenshot?: string } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const doCapture = async (shot: boolean) => {
    setCapturing(true);
    try {
      const res = await api.browserCapture(url, w, shot);
      setCapture(res);
    } catch {
      notify("Backend unreachable — showing mock preview");
      setCapture(null);
    } finally {
      setCapturing(false);
    }
  };
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
        <button className="btn btn-dark" disabled={capturing} onClick={() => void doCapture(false)}>
          {capturing ? "Capturing…" : "Capture via backend"}
        </button>
        <button className="btn btn-secondary" disabled={capturing} onClick={() => void doCapture(true)}>Capture + screenshot</button>
        {["Inspect", "Select Element", "Copy HTML", "Copy CSS", "Analyze Page"].map((a) => (
          <button key={a} className="btn btn-secondary" onClick={() => notify(`${a} queued`)}>{a}</button>
        ))}
      </div>
      {capture ? (
        <div>
          {capture.screenshot && (
            <img src={api.shotUrl(capture.screenshot)} alt={`Screenshot of ${capture.title}`}
              style={{ width: "100%", maxWidth: w, border: "1px solid var(--hairline)", borderRadius: 12, display: "block", margin: "0 auto" }} />
          )}
          <div className="kv" style={{ marginTop: 12 }}>
            <h4>{capture.title || url}</h4>
            <p style={{ whiteSpace: "pre-wrap" }}>{capture.text.slice(0, 2000)}</p>
          </div>
        </div>
      ) : (
        <div className="viewport" style={{ maxWidth: w, margin: "0 auto", width: "100%" }}>{url} at {w}px</div>
      )}
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
  const liveChat = useApp((s) => s.liveChat);
  const setLiveChat = useApp((s) => s.setLiveChat);
  const notify = useApp((s) => s.notify);
  const [provider, setProvider] = useState<ProviderRead | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verdict, setVerdict] = useState("");
  useEffect(() => {
    let alive = true;
    api.provider()
      .then((p) => { if (alive) setProvider(p); })
      .catch(() => { if (alive) setProvider(null); });
    return () => { alive = false; };
  }, []);
  const verify = async () => {
    setVerifying(true);
    setVerdict("");
    try {
      const v = await api.verifyProvider();
      setVerdict(v.ok ? `Connected: ${v.provider} / ${v.model}` : `Failed [${v.code}]: ${v.error}`);
      notify(v.ok ? "Provider verified" : `Provider check failed: ${v.error}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unreachable";
      setVerdict(`Service unreachable: ${msg}`);
      notify("Service unreachable");
    } finally {
      setVerifying(false);
    }
  };
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
              <div className="setrow">
                <span>Provider<small>{provider ? `${provider.name} · ${provider.model || "default model"}` : "Python service unreachable — mock mode"}</small></span>
                <span style={{ fontSize: 13, color: provider?.configured ? "var(--green)" : "var(--steel)" }}>
                  {provider ? (provider.configured ? "Configured" : "Mock") : "Offline"}
                </span>
              </div>
              <div className="setrow">
                <span>Verify connection<small>Checks the key and model without spending tokens</small></span>
                <button className="btn btn-secondary" disabled={verifying || !provider} onClick={verify}>
                  {verifying ? "Checking…" : "Verify"}
                </button>
              </div>
              {verdict && <div className="setrow"><span style={{ fontSize: 13 }}>{verdict}</span><span /></div>}
              <div className="setrow">
                <span>Live model replies<small>Send chat through the backend instead of the sample replay</small></span>
                <button className={`switch${liveChat ? " on" : ""}`} onClick={() => setLiveChat(!liveChat)} role="switch" aria-checked={liveChat} aria-label="Live model replies"><i /></button>
              </div>
              <div className="setrow"><span>Maximum agent steps<small>Hard stop per task</small></span><span style={{ fontSize: 13 }}>50</span></div>
              <div className="setrow"><span>Service URL<small>Backend base address (VITE_OWL_SERVICE_URL)</small></span><span style={{ fontSize: 12 }}>{api.baseUrl}</span></div>
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
