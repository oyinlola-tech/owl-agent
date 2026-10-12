import { useState } from "react";
import {
  Clock, Copy, FolderOpen, FolderSimplePlus, GridFour, ListBullets, MagnifyingGlass, Plus, Terminal, Trash,
} from "@phosphor-icons/react";
import { useAppStore } from "../../state/app.store";
import { PROJECTS } from "../../services/samples/sampleWorkspace.data";
import type { Project } from "../../state/workspace.types";
import { StatusTag } from "../../../shared/components/statusTag.component";
import { EmptyState, PageHeader } from "../../../shared/components/pageLayout.component";
import { Tag, Tile } from "../../../shared/components/tag.component";
import { copyTextAndNotify } from "../../../shared/helpers/clipboard.helper";
import { hueForName, PROJECT_STACKS } from "./projectStyle.helper";
import "./styles/projects.style.css";

type ProjectSortOrder = "recent" | "name";
const RECENCY_ORDER = ["just now", "12m ago", "yesterday", "2d ago", "3d ago"];

export function ProjectsScreen() {
  const openProject = useAppStore((s) => s.openProject);
  const setCreateProjectOpen = useAppStore((s) => s.setCreateProjectOpen);
  const showNotice = useAppStore((s) => s.showNotice);
  const askForConfirmation = useAppStore((s) => s.askForConfirmation);
  const goToScreen = useAppStore((s) => s.goToScreen);
  const toggleTerminal = useAppStore((s) => s.toggleTerminal);
  const terminalOpen = useAppStore((s) => s.terminalOpen);
  const tasks = useAppStore((s) => s.tasks);
  const [searchQuery, setSearchQuery] = useState("");
  const [view, setView] = useState<"gallery" | "list">("gallery");
  const [sortOrder, setSortOrder] = useState<ProjectSortOrder>("recent");
  const [removedProjectNames, setRemovedProjectNames] = useState<string[]>([]);
  const visibleProjects = PROJECTS
    .filter((project) => !removedProjectNames.includes(project.name))
    .filter((project) => (project.name + project.path).toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => sortOrder === "name" ? a.name.localeCompare(b.name)
      : RECENCY_ORDER.indexOf(a.opened) - RECENCY_ORDER.indexOf(b.opened));
  const taskStatsFor = (projectName: string) => {
    const projectTasks = tasks.filter((task) => task.project === projectName);
    return { count: projectTasks.length, lastTask: projectTasks[0] };
  };
  const openInTerminal = (project: Project) => {
    openProject(project);
    if (!terminalOpen) toggleTerminal();
  };
  const removeProject = (project: Project) => askForConfirmation({
    title: `Remove ${project.name}?`,
    body: "Removes the project from OWL only. Files on disk are kept.",
    confirmLabel: "Remove",
    run: () => {
      setRemovedProjectNames((names) => [...names, project.name]);
      showNotice(`${project.name} removed from OWL. Files kept.`);
    },
  });
  const projectActions = (project: Project) => (
    <>
      <button className="btn btn-primary btn-sm" onClick={() => openProject(project)}>Open</button>
      <button className="btn btn-secondary btn-sm btn-icon" title="Open in terminal" aria-label={`Open ${project.name} in terminal`} onClick={() => openInTerminal(project)}><Terminal size={14} /></button>
      <button className="btn btn-secondary btn-sm btn-icon" title="Copy path" aria-label={`Copy path of ${project.name}`} onClick={() => copyTextAndNotify(project.path, showNotice, "Path copied")}><Copy size={14} /></button>
      <button className="btn btn-ghost btn-sm btn-icon" aria-label={`Remove ${project.name}`} title="Remove from OWL" onClick={() => removeProject(project)}><Trash size={15} /></button>
    </>
  );
  return (
    <div className="page pg-projects">
      <PageHeader
        icon={FolderOpen} hue="blue" title="Projects"
        lede="Folders OWL may work in. Removing a project from OWL never deletes its files."
        actions={<>
          <button className="btn btn-secondary" onClick={() => goToScreen("tasks")}><ListBullets size={15} /> All tasks</button>
          <button className="btn btn-primary" onClick={() => setCreateProjectOpen(true)}><Plus size={15} weight="bold" /> New project</button>
        </>}
      />
      <div className="pg-toolbar">
        <div className="input-wrap">
          <MagnifyingGlass size={15} />
          <input className="input" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search projects" aria-label="Search projects" />
        </div>
        <span className="grow" />
        <div className="seg" aria-label="Sort">
          <button aria-pressed={sortOrder === "recent"} onClick={() => setSortOrder("recent")}><Clock size={14} /> Recent</button>
          <button aria-pressed={sortOrder === "name"} onClick={() => setSortOrder("name")}>A–Z</button>
        </div>
        <div className="seg" aria-label="View">
          <button aria-pressed={view === "gallery"} onClick={() => setView("gallery")} title="Gallery"><GridFour size={14} /> Gallery</button>
          <button aria-pressed={view === "list"} onClick={() => setView("list")} title="List"><ListBullets size={14} /> List</button>
        </div>
      </div>
      {visibleProjects.length === 0 ? (
        <EmptyState icon={MagnifyingGlass} title={searchQuery ? `No projects match "${searchQuery}"` : "No projects in OWL"} body={searchQuery ? "Check the spelling, or create a new project with that name." : "Create a project or open an existing folder to begin."}>
          {searchQuery && <button className="btn btn-secondary" onClick={() => setSearchQuery("")}>Clear search</button>}
          <button className="btn btn-primary" onClick={() => setCreateProjectOpen(true)}><Plus size={14} weight="bold" /> Create project</button>
        </EmptyState>
      ) : view === "gallery" ? (
        <div className="pg-gallery">
          {visibleProjects.map((project) => {
            const hue = hueForName(project.name);
            const stack = PROJECT_STACKS[project.name];
            const stats = taskStatsFor(project.name);
            return (
              <article className="pg-proj" key={project.name}>
                <div className="pg-cover" style={{ background: `var(--${hue}-bg)`, color: `var(--${hue})` }} />
                <Tile icon={FolderOpen} hue={hue} size="lg" />
                <div className="pg-proj-body">
                  <div className="nmrow"><b>{project.name}</b>{stack && <Tag hue={stack.hue}>{stack.label}</Tag>}</div>
                  <span className="path">{project.path}</span>
                  <div className="pg-proj-stats">
                    <span><ListBullets size={14} /> {stats.count} {stats.count === 1 ? "task" : "tasks"}</span>
                    {stats.lastTask && <span><StatusTag status={stats.lastTask.status} /></span>}
                    <span><Clock size={14} /> {project.opened}</span>
                  </div>
                  {stats.lastTask && <span className="last">Last: {stats.lastTask.name}</span>}
                </div>
                <div className="pg-proj-acts">{projectActions(project)}</div>
              </article>
            );
          })}
          <button className="pg-proj pg-proj-new" onClick={() => setCreateProjectOpen(true)}>
            <Tile icon={FolderSimplePlus} hue="gray" size="lg" />
            <b>New project</b>
            <span>Start from a template or let OWL decide.</span>
          </button>
        </div>
      ) : (
        <div className="pg-list">
          {visibleProjects.map((project) => {
            const stack = PROJECT_STACKS[project.name];
            const stats = taskStatsFor(project.name);
            return (
              <div key={project.name} className="pg-list-row pg-list-static">
                <Tile icon={FolderOpen} hue={hueForName(project.name)} />
                <span className="nm">{project.name}</span>
                {stack && <Tag hue={stack.hue}>{stack.label}</Tag>}
                <span className="path">{project.path}</span>
                <span className="when hide-m">{stats.count} tasks · {project.opened}</span>
                <span className="pg-list-acts">{projectActions(project)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
