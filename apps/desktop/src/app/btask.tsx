import { useEffect, useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { useApp } from "./store";
import { api, type ApprovalRead, type BackendTask } from "./agent/api";

interface Detail {
  task: BackendTask;
  steps: { title: string; status: string }[];
  tool_calls: { id: string; tool: string; status: string; exit_code: number | null; duration_ms: number; output_excerpt: string; created_at: string }[];
  checkpoints: { id: string; label: string; created_at: string }[];
  usage: { model: string; input_tokens: number; output_tokens: number; estimated: number; error: string }[];
}

export function BackendTaskDetail() {
  const id = useApp((s) => s.openBTaskId);
  const go = useApp((s) => s.go);
  const notify = useApp((s) => s.notify);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRead[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [online, setOnline] = useState(true);

  const load = async (taskId: string) => {
    try {
      const [d, a] = await Promise.all([api.taskDetail(taskId), api.approvals(taskId)]);
      setDetail(d);
      setApprovals(a);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    void load(id);
    const cancel = api.events(id, (type) => {
      setEvents((e) => [...e.slice(-29), type]);
      void load(id);
    });
    const t = setInterval(() => void load(id), 4000);
    return () => {
      cancel();
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!id) {
    return (
      <div className="page">
        <div className="empty">No backend task selected.</div>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="page">
        <h2>Backend task</h2>
        <p className="lede">{online ? "Loading…" : "Backend offline."}</p>
      </div>
    );
  }
  const t = detail.task;
  const pending = approvals.filter((a) => a.status === "pending");
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      notify(msg);
      await load(id);
    } catch {
      notify("Backend unreachable");
    }
  };

  return (
    <div className="page">
      <button className="btn btn-secondary" onClick={() => go("tasks")}>
        <ArrowLeft size={14} /> All tasks
      </button>
      <h2 style={{ marginTop: 16, wordBreak: "break-all" }}>{t.prompt.slice(0, 120)}</h2>
      <p className="lede">
        {t.id} · {t.status.replace("_", " ")} · {t.progress}% · model {t.model || "auto"}
      </p>
      {t.routing && <p style={{ fontSize: 13, color: "var(--steel)" }}>Routing: {t.routing}</p>}
      <div className="cta-row" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0 24px" }}>
        {(t.status === "paused" || t.status === "failed") && (
          <button className="btn btn-primary" onClick={() => void act(() => api.resumeBackendTask(t.id), "Task resumed")}>Resume</button>
        )}
        {(t.status === "running" || t.status === "awaiting_approval" || t.status === "paused") && (
          <button className="btn btn-secondary" onClick={() => void act(() => api.cancelBackendTask(t.id), "Task cancelled")}>Cancel</button>
        )}
      </div>

      {pending.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 18 }}>Approval required ({pending.length})</h3>
          {pending.map((a) => (
            <div key={a.id} className="appr" style={{ maxWidth: 640 }}>
              <b>{a.title}</b>
              {a.command && <code>$ {a.command}</code>}
              {a.files && a.files.length > 0 && <div style={{ fontSize: 12 }}>{a.files.join(", ")}</div>}
              <div className="meta">{a.reason} · Risk {a.risk} · expires {a.expires_at ? new Date(a.expires_at).toLocaleTimeString() : "n/a"}</div>
              <div className="row">
                <button className="mini-btn" onClick={() => void act(() => api.decide(t.id, a.id, false), "Rejected")}>Reject</button>
                <button className="mini-btn go" onClick={() => void act(() => api.decide(t.id, a.id, true), "Approved")}>Approve</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="two-col">
        <div className="kv">
          <h4>Plan</h4>
          {detail.steps.length === 0 && <p>No steps yet.</p>}
          {detail.steps.map((s, i) => (
            <p key={i}>{i + 1}. {s.title} — {s.status}</p>
          ))}
        </div>
        <div className="kv">
          <h4>Activity</h4>
          {events.length === 0 && <p>Waiting for events…</p>}
          {events.slice(-12).map((e, i) => (
            <p key={i} style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{e}</p>
          ))}
        </div>
      </div>
      <div className="two-col" style={{ marginTop: 16 }}>
        <div className="kv">
          <h4>Tool calls</h4>
          {detail.tool_calls.length === 0 && <p>None yet.</p>}
          {detail.tool_calls.slice(-8).map((c) => (
            <p key={c.id} style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
              {c.tool} · {c.status}
              {c.exit_code !== null && c.exit_code !== undefined ? ` · exit ${c.exit_code}` : ""} · {c.duration_ms}ms
            </p>
          ))}
        </div>
        <div className="kv">
          <h4>Checkpoints</h4>
          {detail.checkpoints.length === 0 && <p>None yet.</p>}
          {detail.checkpoints.map((c) => (
            <p key={c.id}>{c.label}</p>
          ))}
          <h4 style={{ marginTop: 12 }}>Usage</h4>
          {detail.usage.length === 0 && <p>No model calls yet.</p>}
          {detail.usage.map((u, i) => (
            <p key={i} style={{ fontSize: 13 }}>
              {u.model}: {u.input_tokens} in / {u.output_tokens} out ({u.estimated ? "estimated" : "measured"})
              {u.error ? ` · error: ${u.error}` : ""}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
