import { Bell, Check, Monitor, Moon, Sun } from "@phosphor-icons/react";
import { Tag } from "../../../../../shared/components/tag.component";
import type { ThemeMode } from "../../../../../shared/hooks/themeMode.hook";
import { SettingToggleRow } from "../settingRow.component";
import type { SettingsPrefs } from "../settingsPrefs.helper";

const KEYBOARD_SHORTCUTS: [string, string][] = [
  ["Ctrl K", "Ask OWL"], ["Ctrl Shift P", "Command palette"], ["Ctrl J", "Toggle terminal"],
  ["Ctrl B", "Toggle sidebar"], ["Ctrl Shift E", "Review changes"], ["?", "All keyboard shortcuts"], ["Esc", "Close dialogs"],
];

export function GeneralSettingsSection({ themeMode, onPickThemeMode, startScreen, onPickStartScreen, prefs, onTogglePref }: {
  themeMode: ThemeMode;
  onPickThemeMode: (mode: ThemeMode) => void;
  startScreen: string;
  onPickStartScreen: (screen: string) => void;
  prefs: SettingsPrefs;
  onTogglePref: (key: string) => void;
}) {
  return (
    <>
      <div className="surface pg-setgroup">
        <h4>Appearance</h4>
        <div className="pg-setrow">
          <span className="t"><b>Theme</b><small>System follows your OS and switches with it.</small></span>
          <div className="seg" aria-label="Theme">
            <button aria-pressed={themeMode === "light"} onClick={() => onPickThemeMode("light")}><Sun size={14} /> Light</button>
            <button aria-pressed={themeMode === "dark"} onClick={() => onPickThemeMode("dark")}><Moon size={14} /> Dark</button>
            <button aria-pressed={themeMode === "system"} onClick={() => onPickThemeMode("system")}><Monitor size={14} /> System</button>
          </div>
        </div>
        <SettingToggleRow title="Reduce motion" sub="Turns off animations and transitions in the app." on={prefs.motion} onFlip={() => onTogglePref("motion")} />
      </div>
      <div className="surface pg-setgroup">
        <h4>Startup</h4>
        <div className="pg-setrow">
          <span className="t"><b>Open to</b><small>The screen shown when you open the app.</small></span>
          <select className="input pg-select" value={startScreen} onChange={(e) => onPickStartScreen(e.target.value)} aria-label="Start screen">
            <option value="welcome">Home</option>
            <option value="workspace">Last workspace</option>
            <option value="tasks">Tasks</option>
            <option value="inbox">Inbox</option>
          </select>
        </div>
      </div>
    </>
  );
}

export function NotificationSettingsSection({ notificationPermission, onAskPermission, prefs, onTogglePref }: {
  notificationPermission: string;
  onAskPermission: () => void;
  prefs: SettingsPrefs;
  onTogglePref: (key: string) => void;
}) {
  const permissionNote = notificationPermission === "granted" ? "Allowed for this app."
    : notificationPermission === "denied" ? "Blocked. Allow them in your system settings."
    : notificationPermission === "unsupported" ? "Not supported here." : "Not allowed yet.";
  return (
    <div className="surface pg-setgroup">
      <h4>When to tell you</h4>
      <div className="pg-setrow">
        <span className="t"><b>Desktop notifications</b><small>{permissionNote}</small></span>
        {notificationPermission === "granted" ? <Tag hue="green" icon={Check}>Allowed</Tag>
          : <button className="btn btn-secondary btn-sm" disabled={notificationPermission === "denied" || notificationPermission === "unsupported"} onClick={onAskPermission}><Bell size={14} /> Allow</button>}
      </div>
      <SettingToggleRow title="Approval needed" sub="The agent is waiting on you." on={prefs.notifyApproval} onFlip={() => onTogglePref("notifyApproval")} />
      <SettingToggleRow title="Task finished" sub="A task completed and its tests ran." on={prefs.notifyDone} onFlip={() => onTogglePref("notifyDone")} />
      <SettingToggleRow title="Task failed" sub="A step failed or a command exited with an error." on={prefs.notifyFail} onFlip={() => onTogglePref("notifyFail")} />
      <SettingToggleRow title="Play a sound" sub="A short chime with each notification." on={prefs.sound} onFlip={() => onTogglePref("sound")} />
    </div>
  );
}

export function KeyboardSettingsSection() {
  return (
    <div className="surface pg-setgroup">
      <h4>Shortcuts</h4>
      {KEYBOARD_SHORTCUTS.map(([keys, label]) => (
        <div className="pg-setrow" key={keys}><span className="t"><b>{label}</b></span><span className="pg-keys">{keys.split(" ").map((key) => <kbd key={key}>{key}</kbd>)}</span></div>
      ))}
      <p className="pg-p pg-muted" style={{ margin: "4px 0 14px" }}>Press <kbd>?</kbd> anywhere in the app to see this list. On macOS, Ctrl is ⌘.</p>
    </div>
  );
}
