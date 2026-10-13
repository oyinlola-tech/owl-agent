import { ArrowRight, ClockCounterClockwise, Copy, FolderOpen, LockKey, ShieldCheck } from "@phosphor-icons/react";
import { useAppStore } from "../../../../state/app.store";
import { Tag } from "../../../../../shared/components/tag.component";
import { copyTextAndNotify } from "../../../../../shared/helpers/clipboard.helper";
import { SettingToggleRow, SettingValueRow } from "../settingRow.component";
import type { SettingsPrefs } from "../settingsPrefs.helper";
import { SecurityStatusSection } from "./securityStatus.section";

const PROTECTED_PATHS = [".env and .env.*", "~/.ssh", "~/.gnupg", "id_rsa, id_ed25519, id_dsa", "*.pem, *.key, *.p12, *.pfx, *.kdbx", "Browser cookie and login stores"];

export function PermissionSettingsSection({ prefs, onTogglePref }: { prefs: SettingsPrefs; onTogglePref: (key: string) => void }) {
  const goToScreen = useAppStore((s) => s.goToScreen);
  return (
    <>
      <div className="surface pg-setgroup">
        <h4>What the agent may touch</h4>
        <SettingToggleRow title="Filesystem" sub="Read and write inside authorized project folders only." on={prefs.fs} onFlip={() => onTogglePref("fs")} />
        <SettingToggleRow title="Terminal" sub="Run project commands. Each command asks first." on={prefs.term} onFlip={() => onTogglePref("term")} />
        <SettingToggleRow title="Browser" sub="Preview and inspect pages." on={prefs.browser} onFlip={() => onTogglePref("browser")} />
        <SettingToggleRow title="External network" sub="Fetch public pages for recreation." on={prefs.net} onFlip={() => onTogglePref("net")} />
        <SettingToggleRow title="Privileged commands" sub="Pushes and installs. Always asks, every time." on={prefs.priv} onFlip={() => onTogglePref("priv")} />
      </div>
      <div className="callout blue">
        <ShieldCheck size={18} weight="duotone" color="var(--blue)" />
        <span>The service enforces approvals regardless of these switches: writes, commands, commits, and pushes always need your yes.
          {" "}<button className="pg-link" onClick={() => goToScreen("tools")}>See every tool and its rule <ArrowRight size={12} /></button></span>
      </div>
    </>
  );
}

export function WorkspaceSettingsSection({ roots }: { roots: string[] }) {
  const notify = useAppStore((s) => s.showNotice);
  const exampleRoots = [...roots, "~/Projects/new-app"].join(",");
  return (
    <>
      <div className="surface pg-setgroup">
        <h4>Authorized folders</h4>
        {roots.length === 0 ? (
          <p className="pg-muted pg-p">No folders are authorized. The agent can't read or write anything until you add one.</p>
        ) : roots.map((root) => (
          <div className="pg-setrow" key={root}>
            <span className="t pg-rootrow"><FolderOpen size={16} /><span className="pg-mono">{root}</span></span>
            <button className="btn btn-ghost btn-sm btn-icon" aria-label={`Copy ${root}`} onClick={() => copyTextAndNotify(root, notify, "Path copied")}><Copy size={14} /></button>
          </div>
        ))}
      </div>
      <div className="surface pg-setgroup">
        <h4>Add a folder</h4>
        <p className="pg-p pg-muted" style={{ marginTop: 6 }}>Folders are set when the service starts, so a running agent can't widen its own access. Add the path to <code>OWL_WORKSPACES</code> and restart the service.</p>
        <div className="pg-code" style={{ margin: "10px 0 14px" }}>
          <button className="btn btn-icon btn-sm copy" aria-label="Copy example" onClick={() => copyTextAndNotify(`OWL_WORKSPACES=${exampleRoots}`, notify, "Copied")}><Copy size={13} /></button>
          <div><span className="p">$</span>OWL_WORKSPACES={exampleRoots}</div>
        </div>
      </div>
    </>
  );
}

export function SecuritySettingsSection() {
  return (
    <>
      <SecurityStatusSection />
      <div className="surface pg-setgroup">
        <h4>Never read or sent</h4>
        <div className="pg-chips">{PROTECTED_PATHS.map((path) => <Tag key={path} hue="red" icon={LockKey}>{path}</Tag>)}</div>
        <p className="pg-p pg-muted" style={{ margin: "10px 0 14px" }}>These paths are blocked by the service even inside an authorized folder.</p>
      </div>
      <div className="surface pg-setgroup">
        <h4>Approvals</h4>
        <SettingValueRow title="Approval lifetime" sub="An unanswered approval expires, so a stale yes can't be reused. Set with OWL_APPROVAL_TTL."><span className="pg-mono">30 min</span></SettingValueRow>
        <SettingValueRow title="Bound to exact arguments" sub="Each approval is tied to a hash of the command or edit. Changing it needs a new approval."><Tag hue="green" icon={ShieldCheck}>Enforced</Tag></SettingValueRow>
        <SettingValueRow title="Command timeout" sub="Long-running commands are stopped. Set with OWL_EXEC_TIMEOUT."><span className="pg-mono">120 s</span></SettingValueRow>
      </div>
      <div className="surface pg-setgroup">
        <h4>Keys</h4>
        <SettingValueRow title="Provider key" sub="Read from the service environment. Never logged, never returned by the API, never shown here."><Tag hue="green" icon={LockKey}>Server side</Tag></SettingValueRow>
      </div>
    </>
  );
}

export function GitSettingsSection({ prefs, onTogglePref }: { prefs: SettingsPrefs; onTogglePref: (key: string) => void }) {
  const goToScreen = useAppStore((s) => s.goToScreen);
  return (
    <div className="surface pg-setgroup">
      <h4>Checkpoints and commits</h4>
      <SettingToggleRow title="Checkpoint before changes" sub="A Git snapshot the agent can restore to." on={prefs.checkpoint} onFlip={() => onTogglePref("checkpoint")} />
      <SettingToggleRow title="Commit automatically" sub="Commit approved changes without asking again." on={prefs.commit} onFlip={() => onTogglePref("commit")} />
      <SettingToggleRow title="Ask before every push" sub="Pushes are privileged and always confirm." on={prefs.push} onFlip={() => onTogglePref("push")} />
      <div className="pg-setrow">
        <span className="t"><b>Change history</b><small>Every applied edit, with one-click revert.</small></span>
        <button className="btn btn-secondary btn-sm" onClick={() => goToScreen("history")}><ClockCounterClockwise size={14} /> Open</button>
      </div>
    </div>
  );
}
