import { useEffect, useState } from "react";
import {
  Atom, DeviceMobile, File, FileCode, FilePy, FolderSimple, FolderSimplePlus, Hexagon, Lightning, Sparkle, type Icon,
} from "@phosphor-icons/react";
import { useAppStore } from "../state/app.store";
import { TEMPLATES } from "../services/samples/sampleWorkspace.data";
import { Tile } from "../../shared/components/tag.component";
import "../styles/dialog.style.css";

const TEMPLATE_ICONS: Record<string, Icon> = {
  "Let OWL decide": Sparkle, Empty: File, "Next.js": Atom, React: Atom, Python: FilePy, FastAPI: Lightning,
  Go: FileCode, "Node.js": Hexagon, "React Native / Expo": DeviceMobile,
};

export function CreateProjectDialog() {
  const isOpen = useAppStore((s) => s.createProjectOpen);
  const setCreateProjectOpen = useAppStore((s) => s.setCreateProjectOpen);
  const openProject = useAppStore((s) => s.openProject);
  const [projectName, setProjectName] = useState("My Application");
  const [selectedTemplate, setSelectedTemplate] = useState("Let OWL decide");
  const [initialiseGit, setInitialiseGit] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (e: KeyboardEvent) => { if (e.key === "Escape") setCreateProjectOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen, setCreateProjectOpen]);
  if (!isOpen) return null;
  const folderSlug = (projectName || "app").toLowerCase().trim().replace(/\s+/g, "-");
  const createProject = () => {
    if (!projectName.trim()) { setError("Give the project a name to continue."); return; }
    setError(null);
    setCreateProjectOpen(false);
    openProject({ name: projectName || "My Application", path: `~/Projects/${folderSlug}`, opened: "just now" });
  };
  return (
    <div className="overlay" onClick={() => setCreateProjectOpen(false)}>
      <div className="modal pg-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Create project">
        <div className="pg-modal-head">
          <Tile icon={FolderSimplePlus} hue="blue" size="lg" />
          <div><h3>Create project</h3><p>A new folder OWL can read and write inside.</p></div>
        </div>
        <div>
          <label className="label" htmlFor="cp-name">Project name</label>
          <input id="cp-name" className="input" type="text" value={projectName} autoFocus
            onChange={(e) => setProjectName(e.target.value)} aria-invalid={error ? true : undefined}
            onKeyDown={(e) => { if (e.key === "Enter") createProject(); }} />
          {error && <div role="alert" className="error-text">{error}</div>}
        </div>
        <div>
          <label className="label" htmlFor="cp-loc">Location</label>
          <div className="input-wrap">
            <FolderSimple size={15} />
            <input id="cp-loc" className="input pg-mono" type="text" value={`~/Projects/${folderSlug}`} readOnly />
          </div>
        </div>
        <div>
          <span className="label">Template</span>
          <div className="pg-tpls" role="radiogroup" aria-label="Template">
            {["Let OWL decide", ...TEMPLATES].map((template) => {
              const TemplateIcon = TEMPLATE_ICONS[template] ?? File;
              const isSelected = selectedTemplate === template;
              return (
                <button key={template} className={isSelected ? "on" : ""} onClick={() => setSelectedTemplate(template)} role="radio" aria-checked={isSelected}>
                  <TemplateIcon size={16} weight={isSelected ? "duotone" : "regular"} /><span>{template}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="pg-setrow" style={{ padding: "4px 0" }}>
          <span className="t"><b>Initialise a Git repository</b><small>Checkpoints need Git to restore earlier states.</small></span>
          <button className={`switch${initialiseGit ? " on" : ""}`} onClick={() => setInitialiseGit(!initialiseGit)} role="switch" aria-checked={initialiseGit} aria-label="Initialise a Git repository"><i /></button>
        </div>
        <div className="pg-modal-foot">
          <button className="btn btn-secondary" onClick={() => setCreateProjectOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={createProject}>Create project</button>
        </div>
      </div>
    </div>
  );
}
