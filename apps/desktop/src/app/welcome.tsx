import { useEffect, useState } from "react";
import { Bird, FolderOpen, Plus } from "@phosphor-icons/react";
import { useApp } from "./store";
import { PROJECTS, TEMPLATES } from "./seed";
import type { Project } from "./types";

const QUICKS = ["Build an App", "Fix a Project", "Review Code", "Recreate a Website", "Analyze Repository"];

export function Welcome() {
  const openProject = useApp((s) => s.openProject);
  const setCreate = useApp((s) => s.setCreate);
  const run = useApp((s) => s.run);
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <div className="welcome">
      <span className="logo-mark" style={{ width: 52, height: 52, margin: "0 auto", display: "grid" }}>
        <Bird size={26} weight="bold" />
      </span>
      <h1>{greet}, Oluwayemi. What are we building?</h1>
      <p className="sub">Your AI development workspace. Describe a task, or open a project to begin.</p>
      <div className="bigprompt">
        <input placeholder="Describe what you want to build..." aria-label="Describe what you want to build"
          onKeyDown={(e) => { if (e.key === "Enter") run(); }} />
        <button className="btn btn-primary" style={{ height: 52 }} onClick={run}>Run</button>
      </div>
      <div className="wrow">
        <button className="btn btn-dark" onClick={() => setCreate(true)}>Create Project</button>
        <button className="btn btn-secondary" onClick={() => openProject(PROJECTS[0])}>
          <FolderOpen size={15} /> Open Project
        </button>
      </div>
      <div className="quicks">
        {QUICKS.map((q) => (
          <button key={q} className="btn btn-secondary" onClick={() => { openProject(PROJECTS[0]); run(); }}>{q}</button>
        ))}
      </div>
      <div className="recent">
        <h4>RECENT</h4>
        {PROJECTS.slice(0, 4).map((p) => (
          <button key={p.name} onClick={() => openProject(p)}>
            <FolderOpen size={18} />
            <span><b>{p.name}</b><span>{p.path}, opened {p.opened}</span></span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Projects() {
  const openProject = useApp((s) => s.openProject);
  const setCreate = useApp((s) => s.setCreate);
  const notify = useApp((s) => s.notify);
  const askConfirm = useApp((s) => s.askConfirm);
  const [q, setQ] = useState("");
  const list = PROJECTS.filter((p) => (p.name + p.path).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="page">
      <h2>Projects</h2>
      <p className="lede">Open a workspace to start the agent. Removing a project from OWL never deletes its files.</p>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={() => setCreate(true)}><Plus size={15} weight="bold" /> New Project</button>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects..."
          aria-label="Search projects"
          style={{ flex: 1, minWidth: 200, height: 42, border: "1px solid var(--hairline-strong)", borderRadius: 8, padding: "0 14px", background: "var(--canvas)", color: "var(--ink)" }} />
      </div>
      <div className="projgrid">
        {list.map((p: Project) => (
          <div className="projcard" key={p.name}>
            <b>{p.name}</b>
            <p>{p.path} · Last opened {p.opened}</p>
            <div className="row">
              <button className="btn btn-dark" onClick={() => openProject(p)}>Open</button>
              <button className="btn btn-secondary" onClick={() => notify("Path copied")}>Copy path</button>
              <button className="btn btn-secondary" onClick={() => askConfirm({
                title: `Remove ${p.name}?`,
                body: "Removes the project from OWL only. Files on disk are kept.",
                confirmLabel: "Remove",
                run: () => notify("Removed from OWL, files kept"),
              })}>Remove</button>
            </div>
          </div>
        ))}
      </div>
      {list.length === 0 && (
        <div className="empty">No projects match.<div className="row"><button className="btn btn-primary" onClick={() => setCreate(true)}>Create Project</button></div></div>
      )}
    </div>
  );
}

export function CreateModal() {
  const open = useApp((s) => s.createOpen);
  const setCreate = useApp((s) => s.setCreate);
  const openProject = useApp((s) => s.openProject);
  const [name, setName] = useState("My Application");
  const [tpl, setTpl] = useState("Let OWL decide");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setCreate(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setCreate]);
  if (!open) return null;
  const create = () => {
    if (!name.trim()) { setError("Give the project a name to continue."); return; }
    setError(null);
    setCreate(false);
    openProject({ name: name || "My Application", path: `~/Projects/${(name || "app").toLowerCase().replace(/\s+/g, "-")}`, opened: "just now" });
  };
  return (
    <div className="overlay" onClick={() => setCreate(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Create project">
        <h3>Create Project</h3>
        <label htmlFor="cp-name">Project name</label>
        <input id="cp-name" type="text" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={error ? true : undefined} />
        {error && <div role="alert" style={{ color: "var(--red, #e03131)", fontSize: 13, marginTop: 6 }}>{error}</div>}
        <label>Location</label>
        <input type="text" value="~/Projects/my-application" readOnly aria-label="Location" />
        <label>Template</label>
        <div className="templates">
          {["Let OWL decide", ...TEMPLATES].map((t) => (
            <button key={t} className={tpl === t ? "on" : ""} onClick={() => setTpl(t)}>{t}</button>
          ))}
        </div>
        <div className="row">
          <button className="btn btn-secondary" onClick={() => setCreate(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={create}>Create</button>
        </div>
      </div>
    </div>
  );
}
