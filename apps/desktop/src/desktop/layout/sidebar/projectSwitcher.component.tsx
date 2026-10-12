import { CaretUpDown, Check, FolderOpen, FolderSimplePlus } from "@phosphor-icons/react";
import { useAppStore } from "../../state/app.store";
import { PROJECTS } from "../../services/samples/sampleWorkspace.data";
import { OwlMark } from "../../../shared/components/owlMark.component";
import { Popover, usePopover } from "../../components/popover.component";

export function ProjectSwitcher({ collapsed }: { collapsed: boolean }) {
  const project = useAppStore((s) => s.project);
  const openProject = useAppStore((s) => s.openProject);
  const setCreateProjectOpen = useAppStore((s) => s.setCreateProjectOpen);
  const goToScreen = useAppStore((s) => s.goToScreen);
  const popover = usePopover(collapsed ? "right-start" : "bottom-start");
  return (
    <>
      <button ref={popover.trigger} className="sb-switch" onClick={popover.toggle} aria-haspopup="dialog" aria-expanded={popover.open}
        aria-label={`Project: ${project?.name ?? "none"}. Switch project`} data-tip={collapsed ? (project?.name ?? "Switch project") : undefined}>
        <OwlMark size={24} />
        <span className="sb-switch-text">
          <b>{project?.name ?? "OWL Agent"}</b>
          <small>{project?.path ?? "No project open"}</small>
        </span>
        <CaretUpDown size={14} className="sb-hide" />
      </button>
      <Popover popover={popover} label="Switch project" className="pop-projects">
        <div className="pop-title">Projects</div>
        {PROJECTS.map((sampleProject) => {
          const isCurrent = project?.name === sampleProject.name;
          return (
            <button key={sampleProject.name} className={`pop-item${isCurrent ? " on" : ""}`} onClick={() => { popover.close(false); openProject(sampleProject); }}>
              <span className="pop-proj-ico">{sampleProject.name.slice(0, 1)}</span>
              <span className="pop-main"><b>{sampleProject.name}</b><small className="mono">{sampleProject.path}</small></span>
              {isCurrent ? <Check size={14} weight="bold" className="pop-check" /> : <span className="pop-aside">{sampleProject.opened}</span>}
            </button>
          );
        })}
        <div className="pop-sep" />
        <button className="pop-item" onClick={() => { popover.close(false); setCreateProjectOpen(true); }}>
          <FolderSimplePlus size={16} /> <span className="pop-main">New project…</span>
        </button>
        <button className="pop-item" onClick={() => { popover.close(false); goToScreen("projects"); }}>
          <FolderOpen size={16} /> <span className="pop-main">All projects</span>
        </button>
      </Popover>
    </>
  );
}
