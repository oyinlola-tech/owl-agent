import { useEffect, useState } from "react";
import { FolderOpen, FolderSimple, FolderSimplePlus } from "@phosphor-icons/react";
import { useAppStore } from "../state/app.store";
import { agentApi } from "../services/agentApi.service";
import { canPickFolderNatively, pickProjectFolder } from "../services/folderPicker.service";
import { Tile } from "../../shared/components/tag.component";
import "../styles/dialog.style.css";

export function CreateProjectDialog() {
  const isOpen = useAppStore((s) => s.createProjectOpen);
  const setCreateProjectOpen = useAppStore((s) => s.setCreateProjectOpen);
  const openProject = useAppStore((s) => s.openProject);
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const native = canPickFolderNatively();
  useEffect(() => {
    if (!isOpen) { setPath(""); setName(""); setError(null); setBusy(false); return; }
    const closeOnEscape = (e: KeyboardEvent) => { if (e.key === "Escape") setCreateProjectOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen, setCreateProjectOpen]);
  if (!isOpen) return null;
  const chooseFolder = async () => {
    setError(null);
    const chosen = await pickProjectFolder().catch(() => null);
    if (chosen) setPath(chosen);
  };
  const addProject = async () => {
    if (!path.trim()) { setError("Choose a folder on this computer to continue."); return; }
    setError(null);
    setBusy(true);
    try {
      const result = await agentApi.createProject(path.trim(), name.trim());
      setCreateProjectOpen(false);
      openProject(result.project);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add the project.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="overlay" onClick={() => setCreateProjectOpen(false)}>
      <div className="modal pg-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add project">
        <div className="pg-modal-head">
          <Tile icon={FolderSimplePlus} hue="blue" size="lg" />
          <div><h3>Add a project</h3><p>Point OWL at an existing folder. It only reads and writes inside the folders you add.</p></div>
        </div>
        <div>
          <label className="label" htmlFor="cp-loc">Project folder</label>
          <div className="input-wrap">
            <FolderSimple size={15} />
            <input id="cp-loc" className="input pg-mono" type="text" value={path} placeholder="~/Projects/my-app"
              spellCheck={false} readOnly={native} aria-invalid={error ? true : undefined}
              onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addProject(); }} />
            {native && <button className="btn btn-secondary btn-sm" onClick={() => void chooseFolder()}><FolderOpen size={14} /> Choose…</button>}
          </div>
          {native
            ? <span className="hint">Use Choose to pick a folder with the native picker.</span>
            : <span className="hint">Type an absolute path to a folder on this computer. Protected locations (home root, <code>~/.ssh</code>, system folders) are refused.</span>}
          {error && <div role="alert" className="error-text">{error}</div>}
        </div>
        <div>
          <label className="label" htmlFor="cp-name">Name <span className="hint-inline">(optional)</span></label>
          <input id="cp-name" className="input" type="text" value={name} placeholder="Defaults to the folder name"
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addProject(); }} />
        </div>
        <div className="pg-modal-foot">
          <button className="btn btn-secondary" onClick={() => setCreateProjectOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void addProject()} disabled={busy}>{busy ? "Adding…" : "Add project"}</button>
        </div>
      </div>
    </div>
  );
}
