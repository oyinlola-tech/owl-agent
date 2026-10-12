import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, PaperPlaneTilt, Play, X } from "@phosphor-icons/react";
import { PROJECTS } from "../../../services/samples/sampleWorkspace.data";
import { Tag } from "../../../../shared/components/tag.component";
import { fillPlaybookTemplate, type Playbook, type PlaybookField } from "./playbookCatalog.data";

interface PlaybookDrawerProps {
  playbook: Playbook;
  defaultProject: string;
  onClose: () => void;
  onRunInWorkspace: (prompt: string, project: string) => void;
  onStartBackendTask: (prompt: string, project: string) => Promise<void>;
  onCopyPrompt: (prompt: string) => void;
}

export function PlaybookDrawer({
  playbook, defaultProject, onClose, onRunInWorkspace, onStartBackendTask, onCopyPrompt,
}: PlaybookDrawerProps) {
  const [project, setProject] = useState(defaultProject);
  const [fields, setFields] = useState<PlaybookField[]>(playbook.fields);
  const filledPrompt = useMemo(() => fillPlaybookTemplate(playbook.template, project, fields), [playbook.template, project, fields]);
  const [prompt, setPrompt] = useState(filledPrompt);
  const [starting, setStarting] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setPrompt(filledPrompt); }, [filledPrompt]);
  useEffect(() => {
    closeButtonRef.current?.focus();
    const closeOnEscape = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return createPortal(
    <div className="x-drawer-overlay" onClick={onClose}>
      <aside className="x-drawer" role="dialog" aria-modal="true" aria-label={playbook.title} onClick={(e) => e.stopPropagation()}>
        <header className="x-drawer-head">
          <span className={`tile tile-lg ${playbook.hue}`}><playbook.icon size={20} weight="duotone" /></span>
          <div>
            <div className="x-drawer-eyebrow">{playbook.cat} playbook</div>
            <h2>{playbook.title}</h2>
          </div>
          <button ref={closeButtonRef} className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="x-drawer-body">
          <p className="x-drawer-out">{playbook.outcome}</p>

          <div className="x-fields">
            <label className="x-field">
              <span className="label">Project</span>
              <select className="input" value={project} onChange={(e) => setProject(e.target.value)}>
                {PROJECTS.map((sampleProject) => <option key={sampleProject.name} value={sampleProject.name}>{sampleProject.name}</option>)}
              </select>
            </label>
            {fields.map((field, fieldIndex) => (
              <label key={field.key} className="x-field">
                <span className="label">{field.label}</span>
                <input className="input" value={field.value}
                  onChange={(e) => setFields((current) => current.map((existing, index) => (index === fieldIndex ? { ...existing, value: e.target.value } : existing)))} />
              </label>
            ))}
          </div>

          <label className="x-field">
            <span className="label">Prompt</span>
            <textarea className="input x-textarea" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6} />
            <span className="hint">Edit freely. Changing a field above rewrites the prompt.</span>
          </label>

          <div className="x-drawer-sect">
            <h4>Plan OWL will follow</h4>
            <ol className="x-steps">{playbook.steps.map((step) => <li key={step}>{step}</li>)}</ol>
          </div>
          <div className="x-drawer-sect">
            <h4>Tools it uses</h4>
            <div className="x-tags">{playbook.tools.map((tool) => <Tag key={tool} hue={/create|apply|exec|commit|push/.test(tool) ? "orange" : "gray"}>{tool}</Tag>)}</div>
            <p className="hint">{playbook.approvals ? `OWL stops for your approval about ${playbook.approvals} ${playbook.approvals > 1 ? "times" : "time"}: before writing files or running commands.` : "Read-only: nothing is written, so there is nothing to approve."}</p>
          </div>
        </div>
        <footer className="x-drawer-foot">
          <button className="btn btn-ghost" onClick={() => onCopyPrompt(prompt)}><Copy size={15} /> Copy prompt</button>
          <span className="grow" />
          <button className="btn btn-secondary" disabled={starting || !prompt.trim()}
            onClick={() => { setStarting(true); void onStartBackendTask(prompt, project).finally(() => setStarting(false)); }}>
            <PaperPlaneTilt size={15} /> {starting ? "Starting…" : "Start as backend task"}
          </button>
          <button className="btn btn-primary" disabled={!prompt.trim()} onClick={() => onRunInWorkspace(prompt, project)}>
            <Play size={15} weight="fill" /> Run in workspace
          </button>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
