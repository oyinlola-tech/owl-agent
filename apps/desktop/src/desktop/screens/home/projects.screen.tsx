import { useEffect, useState } from "react";
import {
  ArrowClockwise, Clock, Copy, FolderOpen, FolderSimplePlus, GridFour, ListBullets, MagnifyingGlass, Plus, Terminal, Trash, WarningCircle,
} from "@phosphor-icons/react";
import { useAppStore } from "../../state/app.store";
import { agentApi } from "../../services/agentApi.service";
import type { BackendTask, Project } from "../../services/agentApi.types";
import { useProjects } from "../../hooks/useProjects.hook";
import { StatusTag } from "../../../shared/components/statusTag.component";
import { EmptyState, PageHeader } from "../../../shared/components/pageLayout.component";
import { Tag, Tile } from "../../../shared/components/tag.component";
import { copyTextAndNotify } from "../../../shared/helpers/clipboard.helper";
import { formatShortTimeAgo } from "../../../shared/helpers/time.helper";
import { hueForName, stackLabel } from "./projectStyle.helper";
import { StackAdvisorComponent } from "./stackAdvisor.component";
import "./styles/projects.style.css";

type ProjectSortOrder = "recent" | "name";

export function ProjectsScreen() {
  const openProject = useAppStore((s) => s.openProject);
  const setCreateProjectOpen = useAppStore((s) => s.setCreateProjectOpen);
  const showNotice = useAppStore((s) => s.showNotice);
  const askForConfirmation = useAppStore((s) => s.askForConfirmation);
  const goToScreen = useAppStore((s) => s.goToScreen);
  const toggleTerminal = useAppStore((s) => s.toggleTerminal);
  const terminalOpen = useAppStore((s) => s.terminalOpen);
  const { projects, status, offline, unauthorized, reload } = useProjects();
  const [backendTasks, setBackendTasks] = useState<BackendTask[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [view, setView] = useState<"gallery" | "list">("gallery");
  const [sortOrder, setSortOrder] = useState<ProjectSortOrder>("recent");
  useEffect(() => {
    let alive = true;
    agentApi.backendTasks().then((tasks) => { if (alive) setBackendTasks(tasks); }).catch(() => {});
    return () => { alive = false; };
  }, [projects]);
  const visibleProjects = projects
    .filter((project) => (project.name + project.path).toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => sortOrder === "name"
      ? a.name.localeCompare(b.name)
      : (b.last_opened_at ?? b.created_at).localeCompare(a.last_opened_at ?? a.created_at));
  const taskStatsFor = (projectName: string) => {
    const projectTasks = backendTasks.filter((task) => task.project === projectName);
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
      void agentApi.forgetProject(project.id)
        .then(() => { showNotice(`${project.name} removed from OWL. Files kept.`); reload(); })
        .catch((e) => showNotice(e instanceof Error ? e.message : "Couldn't remove the project"));
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
          <button className="btn btn-primary" onClick={() => setCreateProjectOpen(true)}><Plus size={15} weight="bold" /> Add project</button>
        </>}
      />
      {status === "error" ? (
        <EmptyState icon={WarningCircle} hue={unauthorized ? "orange" : "red"}
          title={unauthorized ? "Sign in to the local service" : "OWL's local service isn't running"}
          body={unauthorized ? "The desktop app couldn't authenticate with the local service." : offline ? "Start the OWL service to see your projects. Nothing is shown until it's reachable." : "The local service returned an error."}>
          <button className="btn btn-secondary" onClick={reload}><ArrowClockwise size={14} /> Retry</button>
        </EmptyState>
      ) : (
        <>
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
          {status === "loading" ? (
            <div className="side-note" style={{ padding: 24 }}>Loading projects…</div>
          ) : visibleProjects.length === 0 ? (
            <>
            <EmptyState icon={MagnifyingGlass} title={searchQuery ? `No projects match "${searchQuery}"` : "No projects in OWL yet"}
              body={searchQuery ? "Check the spelling, or add a folder with that name." : "Point OWL at a folder on this computer. It only reads and writes inside the folders you choose."}>
              {searchQuery && <button className="btn btn-secondary" onClick={() => setSearchQuery("")}>Clear search</button>}
              <button className="btn btn-primary" onClick={() => setCreateProjectOpen(true)}><Plus size={14} weight="bold" /> {searchQuery ? "Add project" : "Open your first project"}</button>
            </EmptyState>
            {!searchQuery && <StackAdvisorComponent onPick={(stackId) => showNotice(`Picked ${stackId}. Add a project folder to use it.`)} />}
            </>
          ) : view === "gallery" ? (
            <div className="pg-gallery">
              {visibleProjects.map((project) => {
                const hue = hueForName(project.name);
                const label = stackLabel(project);
                const stats = taskStatsFor(project.name);
                return (
                  <article className="pg-proj" key={project.id}>
                    <div className="pg-cover" style={{ background: `var(--${hue}-bg)`, color: `var(--${hue})` }} />
                    <Tile icon={FolderOpen} hue={hue} size="lg" />
                    <div className="pg-proj-body">
                      <div className="nmrow"><b>{project.name}</b>{label && <Tag hue={hue}>{label}</Tag>}{!project.exists && <Tag hue="red">missing</Tag>}</div>
                      <span className="path">{project.path}</span>
                      <div className="pg-proj-stats">
                        <span><ListBullets size={14} /> {stats.count} {stats.count === 1 ? "task" : "tasks"}</span>
                        {stats.lastTask && <span><StatusTag status={stats.lastTask.status} /></span>}
                        <span><Clock size={14} /> {project.last_opened_at ? formatShortTimeAgo(project.last_opened_at) : "new"}</span>
                      </div>
                      {stats.lastTask && <span className="last">Last: {stats.lastTask.prompt}</span>}
                    </div>
                    <div className="pg-proj-acts">{projectActions(project)}</div>
                  </article>
                );
              })}
              <button className="pg-proj pg-proj-new" onClick={() => setCreateProjectOpen(true)}>
                <Tile icon={FolderSimplePlus} hue="gray" size="lg" />
                <b>Add project</b>
                <span>Choose an existing folder on this computer.</span>
              </button>
            </div>
          ) : (
            <div className="pg-list">
              {visibleProjects.map((project) => {
                const label = stackLabel(project);
                const stats = taskStatsFor(project.name);
                return (
                  <div key={project.id} className="pg-list-row pg-list-static">
                    <Tile icon={FolderOpen} hue={hueForName(project.name)} />
                    <span className="nm">{project.name}</span>
                    {label && <Tag hue={hueForName(project.name)}>{label}</Tag>}
                    <span className="path">{project.path}</span>
                    <span className="when hide-m">{stats.count} tasks · {project.last_opened_at ? formatShortTimeAgo(project.last_opened_at) : "new"}</span>
                    <span className="pg-list-acts">{projectActions(project)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
