import { useEffect, useState } from "react";
import { ArrowClockwise, Folder, GitBranch, Kanban, MagnifyingGlass, SpinnerGap, X, type Icon } from "@phosphor-icons/react";
import { useAppStore } from "../../../state/app.store";
import { agentApi } from "../../../services/agentApi.service";
import type { BackendTask, SearchResult } from "../../../services/agentApi.types";
import { useAsyncResource } from "../../../hooks/useAsyncResource.hook";
import { StatusTag } from "../../../../shared/components/statusTag.component";
import { VerticalResizeHandle } from "../resizeHandle.component";
import { FileGlyph } from "./fileGlyph.component";
import { FileTree } from "./fileTree.component";
import { GitPanel } from "./gitPanel.component";

const FILE_PANEL_SECTIONS: { id: "files" | "search" | "git" | "tasks"; icon: Icon; label: string }[] = [
  { id: "files", icon: Folder, label: "Files" },
  { id: "search", icon: MagnifyingGlass, label: "Search" },
  { id: "git", icon: GitBranch, label: "Source control" },
  { id: "tasks", icon: Kanban, label: "Tasks" },
];

export function FilePanel() {
  const section = useAppStore((s) => s.filePanelSection);
  const setSection = useAppStore((s) => s.setFilePanelSection);
  const isOpen = useAppStore((s) => s.filePanelOpen);
  const project = useAppStore((s) => s.project);
  const panelWidth = useAppStore((s) => s.filePanelWidth);
  const setPanelWidth = useAppStore((s) => s.setFilePanelWidth);
  const toggleFilePanel = useAppStore((s) => s.toggleFilePanel);
  const openBackendTask = useAppStore((s) => s.openBackendTask);
  const openFile = useAppStore((s) => s.openFile);
  const projectId = project?.id ?? null;
  const tree = useAsyncResource(async () => {
    if (!projectId) return { entries: [] };
    return agentApi.projectTree(projectId, "");
  }, [projectId]);
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [projectTasks, setProjectTasks] = useState<BackendTask[]>([]);
  useEffect(() => {
    if (section !== "search" || !projectId || searchQuery.trim().length < 2) { setResults([]); return; }
    let alive = true;
    setSearching(true);
    const handle = setTimeout(() => {
      agentApi.searchProject(projectId, searchQuery.trim())
        .then((r) => { if (alive) setResults(r.results); })
        .catch(() => { if (alive) setResults([]); })
        .finally(() => { if (alive) setSearching(false); });
    }, 250);
    return () => { alive = false; clearTimeout(handle); };
  }, [searchQuery, section, projectId]);
  useEffect(() => {
    if (section !== "tasks" || !project) return;
    let alive = true;
    agentApi.backendTasks()
      .then((tasks) => { if (alive) setProjectTasks(tasks.filter((t) => t.project === project.name)); })
      .catch(() => { if (alive) setProjectTasks([]); });
    return () => { alive = false; };
  }, [section, project]);
  if (!isOpen) return null;
  const currentSection = FILE_PANEL_SECTIONS.find((tab) => tab.id === section)!;
  return (
    <>
      <aside className="side" style={{ width: panelWidth }}>
        <div className="side-tabs" role="tablist" aria-label="Project navigation">
          {FILE_PANEL_SECTIONS.map((tab) => (
            <button key={tab.id} className={section === tab.id ? "on" : ""} onClick={() => setSection(tab.id)} role="tab"
              aria-selected={section === tab.id} title={tab.label} aria-label={tab.label}>
              <tab.icon size={16} weight={section === tab.id ? "fill" : "regular"} />
            </button>
          ))}
          <span className="grow" />
          <button className="icon-x" onClick={toggleFilePanel} title="Close sidebar (Ctrl B)" aria-label="Close sidebar">
            <X size={13} />
          </button>
        </div>
        <div className="side-title">
          <span>{section === "files" ? (project?.name ?? "No project") : currentSection.label}</span>
          {section === "files" && project && (
            <span className="side-acts">
              <button className="icon-x" title="Refresh" aria-label="Refresh file tree" onClick={tree.reload}><ArrowClockwise size={14} /></button>
            </span>
          )}
        </div>
        <div className="side-body">
          {!project && <div className="side-note">Open a project to browse its files.</div>}
          {project && section === "files" && (
            tree.status === "loading" ? <div className="side-note"><SpinnerGap size={14} className="pulse" /> Loading files…</div>
              : tree.status === "error" ? <div className="side-note">Couldn't read the project files. <button className="btn btn-sm btn-secondary" onClick={tree.reload}>Retry</button></div>
                : (tree.data?.entries.length ?? 0) === 0 ? <div className="side-note">This folder is empty.</div>
                  : <div role="tree" aria-label="Files"><FileTree projectId={project.id} entries={tree.data!.entries} /></div>
          )}
          {project && section === "search" && (
            <>
              <div className="input-wrap" style={{ marginBottom: 8 }}>
                <MagnifyingGlass size={14} />
                <input className="input" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search the project"
                  aria-label="Search entire project" autoFocus />
              </div>
              {searching && <div className="side-note"><SpinnerGap size={14} className="pulse" /> Searching…</div>}
              {results.map((result) => (
                <button key={`${result.path}:${result.line}`} className="frow" onClick={() => openFile(result.path)}>
                  <FileGlyph name={result.path} />
                  <span className="fname">{result.path.split("/").pop()}</span>
                  <span className="fpath">{result.line > 0 ? `:${result.line}` : result.path.split("/").slice(0, -1).join("/")}</span>
                </button>
              ))}
              {searchQuery.trim().length >= 2 && !searching && results.length === 0 && <div className="side-note">No matches for “{searchQuery}”.</div>}
            </>
          )}
          {project && section === "git" && <GitPanel projectId={project.id} />}
          {project && section === "tasks" && (
            <div>
              {projectTasks.length === 0 && <div className="side-note">No tasks for this project yet.</div>}
              {projectTasks.map((task) => (
                <button key={task.id} className="side-task" onClick={() => openBackendTask(task.id)}>
                  <span className="side-task-top"><b>{task.prompt}</b></span>
                  <span className="side-task-meta"><StatusTag status={task.status} /><small>{task.progress}%</small></span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
      <VerticalResizeHandle onDrag={(deltaX) => setPanelWidth(panelWidth + deltaX)} />
    </>
  );
}
