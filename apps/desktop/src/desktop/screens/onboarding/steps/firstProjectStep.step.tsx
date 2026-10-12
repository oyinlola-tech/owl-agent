import { FolderOpen, Info } from "@phosphor-icons/react";
import { useOnboardingStore } from "../onboarding.state";

function folderName(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, "");
  const parts = trimmed.split(/[/\\]/);
  return parts[parts.length - 1] || trimmed;
}

export function FirstProjectStep() {
  const path = useOnboardingStore((s) => s.projectName);
  const setPath = useOnboardingStore((s) => s.setProjectName);
  return (
    <div className="ob-project">
      <label className="pv-field">
        <span className="label">Project folder</span>
        <div className="input-wrap">
          <FolderOpen size={15} />
          <input
            className="input pv-mono" value={path} spellCheck={false}
            placeholder="~/Projects/my-app" aria-label="Project folder"
            onChange={(event) => setPath(event.target.value)}
          />
        </div>
        <span className="hint">Point OWL at an existing folder on this computer. {path ? <>OWL will open <b>{folderName(path)}</b>.</> : null}</span>
      </label>
      <div className="callout blue" role="note">
        <Info size={18} weight="duotone" color="var(--blue)" />
        <span>
          OWL authorizes this folder as a workspace, detects its stack, and lists the checks it can run — all read-only.
          Protected locations like your home root or <code>~/.ssh</code> are refused. You can also skip this and open a project later.
        </span>
      </div>
    </div>
  );
}
