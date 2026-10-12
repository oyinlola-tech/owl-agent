import { ArrowSquareOut, CaretUpDown, Gear, Keyboard, Monitor, Moon, Question, Sun } from "@phosphor-icons/react";
import { useAppStore } from "../../state/app.store";
import { OwlMark } from "../../../shared/components/owlMark.component";
import { navigateTo } from "../../../shared/hooks/currentPath.hook";
import { applyThemeMode, toggleLightDarkTheme, useThemeMode } from "../../../shared/hooks/themeMode.hook";
import { Popover, usePopover } from "../../components/popover.component";

const THEME_OPTIONS = [["light", Sun, "Light"], ["dark", Moon, "Dark"], ["system", Monitor, "System"]] as const;

export function AccountMenu({ collapsed }: { collapsed: boolean }) {
  const goToScreen = useAppStore((s) => s.goToScreen);
  const setShortcutsOpen = useAppStore((s) => s.setShortcutsOpen);
  const [themeMode, appliedTheme] = useThemeMode();
  const popover = usePopover(collapsed ? "right-end" : "top-start");
  const closeAndRun = (action: () => void) => { popover.close(false); action(); };
  return (
    <div className="sb-user-row">
      <button ref={popover.trigger} className="sb-user" onClick={popover.toggle} aria-haspopup="dialog" aria-expanded={popover.open}
        aria-label="Account and app menu" data-tip={collapsed ? "Account" : undefined}>
        <span className="sb-avatar">O</span>
        <span className="sb-user-text sb-hide"><b>Oluwayemi</b><small>Local workspace</small></span>
        <CaretUpDown size={13} className="sb-hide" />
      </button>
      <button className="sb-mini sb-hide sb-theme" onClick={() => toggleLightDarkTheme()} aria-label={appliedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        title={appliedTheme === "dark" ? "Light mode" : "Dark mode"}>
        {appliedTheme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
      </button>
      <Popover popover={popover} label="Account menu" className="pop-account">
        <div className="pop-user">
          <span className="sb-avatar sb-avatar-lg">O</span>
          <span className="pop-main"><b>Oluwayemi</b><small>Local workspace · this computer</small></span>
        </div>
        <div className="pop-sep" />
        <button className="pop-item" onClick={() => closeAndRun(() => goToScreen("settings"))}><Gear size={16} /><span className="pop-main">Settings</span></button>
        <button className="pop-item" onClick={() => closeAndRun(() => setShortcutsOpen(true))}>
          <Keyboard size={16} /><span className="pop-main">Keyboard shortcuts</span><kbd>?</kbd>
        </button>
        <button className="pop-item" onClick={() => closeAndRun(() => goToScreen("help"))}><Question size={16} /><span className="pop-main">Help</span></button>
        <div className="pop-sep" />
        <div className="pop-theme">
          <span>Theme</span>
          <div className="seg" role="radiogroup" aria-label="Theme">
            {THEME_OPTIONS.map(([mode, ThemeIcon, label]) => (
              <button key={mode} role="radio" aria-checked={themeMode === mode} aria-pressed={themeMode === mode} onClick={() => applyThemeMode(mode)} title={label}>
                <ThemeIcon size={13} weight={themeMode === mode ? "fill" : "regular"} /> {label}
              </button>
            ))}
          </div>
        </div>
        <div className="pop-sep" />
        <button className="pop-item" onClick={() => closeAndRun(() => navigateTo("/"))}>
          <ArrowSquareOut size={16} /><span className="pop-main">Back to website</span>
        </button>
        <div className="pop-foot"><OwlMark size={14} /> OWL 0.1.0 · local-first</div>
      </Popover>
    </div>
  );
}
