import { useEffect, useRef } from "react";
import { Keyboard, X } from "@phosphor-icons/react";
import { useAppStore } from "../state/app.store";
import "../styles/dialog.style.css";

const SHORTCUT_GROUPS: { group: string; rows: [string[], string][] }[] = [
  { group: "General", rows: [
    [["Ctrl", "⇧", "P"], "Search pages and commands"],
    [["Ctrl", "K"], "Ask OWL"],
    [["?"], "Show keyboard shortcuts"],
    [["Esc"], "Close a dialog or menu"],
  ] },
  { group: "Workspace", rows: [
    [["Ctrl", "B"], "Toggle the file panel"],
    [["Ctrl", "J"], "Toggle the terminal"],
    [["Ctrl", "⇧", "E"], "Review proposed changes"],
    [["Enter"], "Run the command in the terminal"],
  ] },
  { group: "Agent", rows: [
    [["Enter"], "Send a message to OWL"],
    [["Enter"], "Run the highlighted palette command"],
    [["↑", "↓"], "Move through palette results"],
  ] },
];

export function KeyboardShortcutsDialog() {
  const open = useAppStore((s) => s.shortcutsOpen);
  const setShortcutsOpen = useAppStore((s) => s.setShortcutsOpen);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    setTimeout(() => closeButtonRef.current?.focus(), 30);
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setShortcutsOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); previouslyFocused?.focus?.(); };
  }, [open, setShortcutsOpen]);
  if (!open) return null;
  return (
    <div className="overlay overlay-center" onClick={() => setShortcutsOpen(false)}>
      <div className="modal modal-keys" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts">
        <div className="keys-head">
          <span className="tile tile-lg blue"><Keyboard size={20} weight="duotone" /></span>
          <div><h3>Keyboard shortcuts</h3><p className="modal-body">Ctrl is ⌘ on macOS.</p></div>
          <button ref={closeButtonRef} className="btn btn-ghost btn-icon" onClick={() => setShortcutsOpen(false)} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="keys-grid">
          {SHORTCUT_GROUPS.map((shortcutGroup) => (
            <section key={shortcutGroup.group}>
              <h4>{shortcutGroup.group}</h4>
              <dl>
                {shortcutGroup.rows.map(([keys, description]) => (
                  <div key={description} className="keys-row">
                    <dt>{description}</dt>
                    <dd>{keys.map((key) => <kbd key={key}>{key}</kbd>)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
