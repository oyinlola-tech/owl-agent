import { useState } from "react";
import { ArrowClockwise, ArrowsInLineVertical, FilePlus, Folder, GitBranch, Kanban, MagnifyingGlass, X, type Icon } from "@phosphor-icons/react";
import { useAppStore } from "../../../state/app.store";
import { FILES } from "../../../services/samples/sampleWorkspace.data";
import { StatusTag } from "../../../../shared/components/statusTag.component";
import { VerticalResizeHandle } from "../resizeHandle.component";
import { FileGlyph } from "./fileGlyph.component";
import { FileTree } from "./fileTree.component";

const FILE_PANEL_SECTIONS: { id: "files" | "search" | "git" | "tasks"; icon: Icon; label: string }[] = [
  { id: "files", icon: Folder, label: "Files" },
  { id: "search", icon: MagnifyingGlass, label: "Search" },
  { id: "git", icon: GitBranch, label: "Source control" },
  { id: "tasks", icon: Kanban, label: "Tasks" },
];

const SEARCHABLE_SAMPLE_FILES = ["src/auth/service.go", "src/auth/middleware.go", "tests/auth_test.go"];

export function FilePanel() {
  const section = useAppStore((s) => s.filePanelSection);
  const setSection = useAppStore((s) => s.setFilePanelSection);
  const isOpen = useAppStore((s) => s.filePanelOpen);
  const project = useAppStore((s) => s.project);
  const panelWidth = useAppStore((s) => s.filePanelWidth);
  const setPanelWidth = useAppStore((s) => s.setFilePanelWidth);
  const toggleFilePanel = useAppStore((s) => s.toggleFilePanel);
  const tasks = useAppStore((s) => s.tasks);
  const openTask = useAppStore((s) => s.openTask);
  const changes = useAppStore((s) => s.changes);
  const setCenterTab = useAppStore((s) => s.setCenterTab);
  const showNotice = useAppStore((s) => s.showNotice);
  const [searchQuery, setSearchQuery] = useState("");
  const [treeKey, setTreeKey] = useState(0);
  const [allCollapsed, setAllCollapsed] = useState(false);
  if (!isOpen) return null;
  const matchingFiles = SEARCHABLE_SAMPLE_FILES.filter((file) => file.includes(searchQuery.toLowerCase()));
  const openFile = useAppStore.getState().openFile;
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
          {section === "files" && (
            <span className="side-acts">
              <button className="icon-x" title="New file" aria-label="New file"
                onClick={() => showNotice("Ask OWL to create files, so every new file arrives as a reviewed change.")}>
                <FilePlus size={14} />
              </button>
              <button className="icon-x" title="Refresh" aria-label="Refresh file tree"
                onClick={() => { setAllCollapsed(false); setTreeKey((key) => key + 1); showNotice("File tree refreshed"); }}>
                <ArrowClockwise size={14} />
              </button>
              <button className="icon-x" title="Collapse all" aria-label="Collapse all folders"
                onClick={() => { setAllCollapsed(true); setTreeKey((key) => key + 1); }}>
                <ArrowsInLineVertical size={14} />
              </button>
            </span>
          )}
        </div>
        <div className="side-body">
          {section === "files" && <div role="tree" aria-label="Files"><FileTree key={treeKey} nodes={FILES} collapsed={allCollapsed} /></div>}
          {section === "search" && (
            <>
              <div className="input-wrap" style={{ marginBottom: 8 }}>
                <MagnifyingGlass size={14} />
                <input className="input" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search the project"
                  aria-label="Search entire project" autoFocus />
              </div>
              {matchingFiles.map((file) => (
                <button key={file} className="frow" onClick={() => openFile(file)}>
                  <FileGlyph name={file} />
                  <span className="fname">{file.split("/").pop()}</span>
                  <span className="fpath">{file.split("/").slice(0, -1).join("/")}</span>
                </button>
              ))}
              {searchQuery && matchingFiles.length === 0 && <div className="side-note">No files match “{searchQuery}”.</div>}
            </>
          )}
          {section === "git" && (
            <div className="gitpanel">
              <div className="gitcard">
                <GitBranch size={16} weight="duotone" />
                <div><b>main</b><small>2 ahead · 0 behind origin</small></div>
              </div>
              <div className="side-label">Changes · {changes.length}</div>
              {changes.length === 0 && <div className="side-note">Working tree clean.</div>}
              {changes.map((change) => (
                <button key={change.path} className="frow" onClick={() => setCenterTab("changes")}>
                  <FileGlyph name={change.path} />
                  <span className="fname">{change.path.split("/").pop()}</span>
                  <span className={`chg chg-${change.status}`}>{change.status}</span>
                </button>
              ))}
            </div>
          )}
          {section === "tasks" && (
            <div>
              {tasks.map((task) => (
                <button key={task.id} className="side-task" onClick={() => openTask(task.id)}>
                  <span className="side-task-top"><b>{task.name}</b></span>
                  <span className="side-task-meta"><StatusTag status={task.status} /><small>{task.elapsed}</small></span>
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
