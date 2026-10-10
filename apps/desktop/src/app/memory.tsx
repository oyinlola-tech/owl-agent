import { useEffect, useState } from "react";
import { useApp } from "./store";
import { api, type MemoryRow } from "./agent/api";

const CATS = ["", "global", "project", "task", "knowledge"];

export function Memory() {
  const notify = useApp((s) => s.notify);
  const [rows, setRows] = useState<MemoryRow[]>([]);
  const [cat, setCat] = useState("");
  const [project, setProject] = useState("ZudoMart");
  const [q, setQ] = useState("");
  const [online, setOnline] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [maintainMsg, setMaintainMsg] = useState("");

  const load = async () => {
    try {
      const list = q.trim()
        ? await api.searchMemories(q.trim(), project.trim())
        : await api.memories(cat, project.trim());
      setRows(list);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat]);

  const remove = async (id: string) => {
    try {
      await api.deleteMemory(id);
      setRows((r) => r.filter((m) => m.id !== id));
    } catch {
      notify("Memory service unreachable");
    }
  };

  const flip = async (m: MemoryRow) => {
    try {
      await api.setMemoryEnabled(m.id, !m.enabled);
      setRows((r) => r.map((x) => (x.id === m.id ? { ...x, enabled: x.enabled ? 0 : 1 } : x)));
    } catch {
      notify("Memory service unreachable");
    }
  };

  const saveEdit = async (id: string) => {
    if (!draft.trim()) return;
    try {
      const updated = await api.updateMemory(id, draft.trim());
      setRows((r) => r.map((x) => (x.id === id ? updated : x)));
      setEditing(null);
    } catch {
      notify("Memory service unreachable");
    }
  };

  const clearProject = async () => {
    if (!project.trim()) return;
    try {
      const res = await api.clearProjectMemory(project.trim());
      notify(`Cleared ${res.cleared} project memories`);
      void load();
    } catch {
      notify("Memory service unreachable");
    }
  };

  const maintain = async () => {
    try {
      const res = await api.maintainMemory(project.trim());
      setMaintainMsg(`Scanned ${res.scanned}, merged ${res.merged}.`);
      void load();
    } catch {
      notify("Memory service unreachable");
    }
  };

  return (
    <div className="page">
      <h2>Memory</h2>
      <p className="lede">
        Durable facts across sessions. Project memory never leaves its project;
        secrets are refused at save time. {!online && "Backend offline: list unavailable."}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void load(); }}
          placeholder="Search memories..." aria-label="Search memories"
          style={{ flex: 1, minWidth: 180, height: 40, border: "1px solid var(--hairline-strong)", borderRadius: 8, padding: "0 12px", background: "var(--canvas)", color: "var(--ink)" }}
        />
        <input
          value={project} onChange={(e) => setProject(e.target.value)}
          placeholder="Project" aria-label="Project filter"
          style={{ width: 160, height: 40, border: "1px solid var(--hairline-strong)", borderRadius: 8, padding: "0 12px", background: "var(--canvas)", color: "var(--ink)" }}
        />
        <button className="btn btn-secondary" onClick={() => void load()}>Search</button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {CATS.map((c) => (
          <button key={c || "all"} className={`btn ${cat === c ? "btn-dark" : "btn-secondary"}`} onClick={() => setCat(c)}>
            {c || "All"}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button className="btn btn-secondary" onClick={() => void maintain()}>Maintain now</button>
        <button className="btn btn-secondary" onClick={() => void clearProject()}>Clear project</button>
      </div>
      {maintainMsg && <p style={{ fontSize: 13, color: "var(--steel)" }}>{maintainMsg}</p>}
      {rows.map((m) => (
        <div key={m.id} className="kv" style={{ marginBottom: 10, opacity: m.enabled ? 1 : 0.55 }}>
          <h4>
            {m.category} · {m.project || "no project"} · {m.confirmed ? "confirmed" : "inferred"}
          </h4>
          {editing === m.id ? (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input
                value={draft} onChange={(e) => setDraft(e.target.value)}
                aria-label="Edit memory"
                style={{ flex: 1, height: 40, border: "1px solid var(--hairline-strong)", borderRadius: 8, padding: "0 12px", background: "var(--canvas)", color: "var(--ink)" }}
              />
              <button className="btn btn-primary" onClick={() => void saveEdit(m.id)}>Save</button>
              <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          ) : (
            <p>{m.text}</p>
          )}
          <div className="cta-row" style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button className="btn btn-secondary" onClick={() => { setEditing(m.id); setDraft(m.text); }}>Edit</button>
            <button className="btn btn-secondary" onClick={() => void flip(m)}>{m.enabled ? "Disable" : "Enable"}</button>
            <button className="btn btn-secondary" onClick={() => void remove(m.id)}>Delete</button>
          </div>
        </div>
      ))}
      {rows.length === 0 && (
        <div className="empty">No memories here yet. Completed tasks and explicit saves will appear.</div>
      )}
    </div>
  );
}
