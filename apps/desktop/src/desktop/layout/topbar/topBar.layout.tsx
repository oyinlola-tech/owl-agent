import { CaretRight, FolderOpen, MagnifyingGlass, Plus, SidebarSimple, Sparkle, TerminalWindow } from "@phosphor-icons/react";
import { useAppStore } from "../../state/app.store";
import { SCREEN_META } from "../screenCatalog.data";
import { useSidebarCollapsed } from "../sidebar/sidebarCollapsed.hook";
import { AgentControls } from "./agentControls.component";
import { InboxBell } from "./inboxBell.component";
import "./topbar.style.css";

export function TopBar({ onOpenCommandPalette, onOpenAskOwl }: { onOpenCommandPalette: () => void; onOpenAskOwl: () => void }) {
  const project = useAppStore((s) => s.project);
  const screen = useAppStore((s) => s.screen);
  const goToScreen = useAppStore((s) => s.goToScreen);
  const startNewTask = useAppStore((s) => s.startNewTask);
  const filePanelOpen = useAppStore((s) => s.filePanelOpen);
  const terminalOpen = useAppStore((s) => s.terminalOpen);
  const inspectorOpen = useAppStore((s) => s.inspectorOpen);
  const toggleFilePanel = useAppStore((s) => s.toggleFilePanel);
  const toggleTerminal = useAppStore((s) => s.toggleTerminal);
  const toggleInspector = useAppStore((s) => s.toggleInspector);
  const { collapsed } = useSidebarCollapsed();
  const screenMeta = SCREEN_META[screen];
  const parentMeta = screen === "task" || screen === "btask" ? SCREEN_META.tasks : null;
  return (
    <header className="topbar">
      <nav className="crumbs" aria-label="Breadcrumb">
        <button onClick={() => goToScreen(project ? "workspace" : "projects")} className="crumb-proj">
          <FolderOpen size={15} weight="duotone" />
          <span>{project ? project.name : "No project"}</span>
        </button>
        <CaretRight size={11} className="crumb-sep" />
        {parentMeta && (
          <>
            <button onClick={() => goToScreen("tasks")} className="crumb-parent"><parentMeta.icon size={15} /> <span>{parentMeta.label}</span></button>
            <CaretRight size={11} className="crumb-sep" />
          </>
        )}
        <span className="crumb-cur" aria-current="page"><screenMeta.icon size={15} /> {screenMeta.label}</span>
      </nav>
      <span className="grow" />
      <button className="tb-search" onClick={onOpenCommandPalette} aria-label="Search or run a command">
        <MagnifyingGlass size={15} />
        <span className="tb-search-text">Search or run a command…</span>
        <span className="tb-search-keys"><kbd>Ctrl</kbd><kbd>⇧</kbd><kbd>P</kbd></span>
      </button>
      <span className="grow" />
      <div className="tb-right">
        <AgentControls />
        {screen === "workspace" && project && (
          <span className="panel-toggles hide-m">
            <button className={`btn btn-ghost btn-icon btn-sm${filePanelOpen ? " on" : ""}`} onClick={toggleFilePanel} aria-pressed={filePanelOpen} title="Toggle file panel (Ctrl B)" aria-label="Toggle file panel">
              <SidebarSimple size={16} />
            </button>
            <button className={`btn btn-ghost btn-icon btn-sm${terminalOpen ? " on" : ""}`} onClick={toggleTerminal} aria-pressed={terminalOpen} title="Toggle terminal (Ctrl J)" aria-label="Toggle terminal">
              <TerminalWindow size={16} />
            </button>
            <button className={`btn btn-ghost btn-icon btn-sm flip${inspectorOpen ? " on" : ""}`} onClick={toggleInspector} aria-pressed={inspectorOpen} title="Toggle inspector" aria-label="Toggle inspector">
              <SidebarSimple size={16} />
            </button>
          </span>
        )}
        <InboxBell />
        {collapsed && (
          <button className="btn btn-ghost btn-icon hide-s" onClick={startNewTask} title="New task" aria-label="New task">
            <Plus size={17} weight="bold" />
          </button>
        )}
        <button className="tb-ask" onClick={onOpenAskOwl} aria-label="Ask OWL">
          <Sparkle size={14} weight="fill" /> <span className="hide-s">Ask OWL</span> <kbd className="hide-m">Ctrl K</kbd>
        </button>
      </div>
    </header>
  );
}
