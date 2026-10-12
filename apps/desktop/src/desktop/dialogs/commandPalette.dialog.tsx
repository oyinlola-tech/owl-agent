import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowCounterClockwise, ArrowSquareOut, BookOpenText, Brain, ClockCounterClockwise, Command, Cpu, File, FolderOpen,
  Gear, GitCommit, GitDiff, Globe, House, Kanban, Keyboard, MagnifyingGlass, Moon, Pause, Play, Plus, Question,
  SidebarSimple, Sparkle, Terminal, TerminalWindow, TestTube, Tray, UploadSimple, Wrench,
  type Icon,
} from "@phosphor-icons/react";
import { useAppStore } from "../state/app.store";
import { COMMANDS } from "../services/samples/sampleWorkspace.data";
import type { AppScreen } from "../state/workspace.types";
import { navigateTo } from "../../shared/hooks/currentPath.hook";
import { toggleLightDarkTheme } from "../../shared/hooks/themeMode.hook";
import "../styles/dialog.style.css";

type CommandGroup = "Agent" | "Go to" | "Navigation" | "Workspace" | "Git" | "App";

const COMMAND_META: Record<string, { icon: Icon; group: CommandGroup; keys?: string[] }> = {
  "New Task": { icon: Plus, group: "Agent" },
  "Ask OWL": { icon: Sparkle, group: "Agent", keys: ["Ctrl", "K"] },
  "Pause Agent": { icon: Pause, group: "Agent" },
  "Resume Agent": { icon: Play, group: "Agent" },
  "Go to Home": { icon: House, group: "Go to" },
  "Go to Inbox": { icon: Tray, group: "Go to" },
  "Go to Tasks": { icon: Kanban, group: "Go to" },
  "Go to Memory": { icon: Brain, group: "Go to" },
  "Go to Playbooks": { icon: BookOpenText, group: "Go to" },
  "Go to Change history": { icon: ClockCounterClockwise, group: "Go to" },
  "Go to Models & usage": { icon: Cpu, group: "Go to" },
  "Go to Agent tools": { icon: Wrench, group: "Go to" },
  "Go to Help": { icon: Question, group: "Go to" },
  "Open Project": { icon: FolderOpen, group: "Navigation" },
  "Open File": { icon: File, group: "Navigation" },
  "Search Project": { icon: MagnifyingGlass, group: "Navigation" },
  "Open Browser": { icon: Globe, group: "Navigation" },
  "Open Settings": { icon: Gear, group: "Navigation" },
  "Run Command": { icon: Terminal, group: "Workspace" },
  "Run Tests": { icon: TestTube, group: "Workspace" },
  "Open Terminal": { icon: TerminalWindow, group: "Workspace" },
  "Toggle Terminal": { icon: TerminalWindow, group: "Workspace", keys: ["Ctrl", "J"] },
  "Toggle Sidebar": { icon: SidebarSimple, group: "Workspace", keys: ["Ctrl", "B"] },
  "Toggle Inspector": { icon: SidebarSimple, group: "Workspace" },
  "Review Changes": { icon: GitDiff, group: "Workspace", keys: ["Ctrl", "⇧", "E"] },
  "Undo Change": { icon: ArrowCounterClockwise, group: "Workspace" },
  "Git Commit": { icon: GitCommit, group: "Git" },
  "Git Push": { icon: UploadSimple, group: "Git" },
  "Keyboard shortcuts": { icon: Keyboard, group: "App", keys: ["?"] },
  "Toggle theme": { icon: Moon, group: "App" },
  "Back to website": { icon: ArrowSquareOut, group: "App" },
};

const COMMAND_GROUPS: CommandGroup[] = ["Agent", "Go to", "Navigation", "Workspace", "Git", "App"];

const GO_TO_SCREEN: Record<string, AppScreen> = {
  "Go to Home": "welcome", "Go to Inbox": "inbox", "Go to Tasks": "tasks", "Go to Memory": "memory",
  "Go to Playbooks": "playbooks", "Go to Change history": "history", "Go to Models & usage": "models",
  "Go to Agent tools": "tools", "Go to Help": "help",
};

function runPaletteCommand(command: string) {
  const state = useAppStore.getState();
  const goToWorkspace = () => state.goToScreen("workspace");
  const openTerminal = () => { if (!useAppStore.getState().terminalOpen) state.toggleTerminal(); };
  if (GO_TO_SCREEN[command]) state.goToScreen(GO_TO_SCREEN[command]);
  else if (command === "Open Settings") state.goToScreen("settings");
  else if (command === "Open Browser") state.goToScreen("browser");
  else if (command === "Open Project") state.goToScreen("projects");
  else if (command === "New Task") state.startNewTask();
  else if (command === "Ask OWL") state.setAskOwlOpen(true);
  else if (command === "Open Terminal") { goToWorkspace(); openTerminal(); }
  else if (command === "Toggle Terminal") { goToWorkspace(); state.toggleTerminal(); }
  else if (command === "Toggle Sidebar") { goToWorkspace(); state.toggleFilePanel(); }
  else if (command === "Toggle Inspector") { goToWorkspace(); state.toggleInspector(); }
  else if (command === "Open File" || command === "Search Project") { goToWorkspace(); state.setFilePanelSection("search"); }
  else if (command === "Review Changes") { goToWorkspace(); state.setCenterTab("changes"); }
  else if (command === "Undo Change") state.undoLastFileChange();
  else if (command === "Pause Agent") state.pauseAgent();
  else if (command === "Resume Agent") state.resumeAgent();
  else if (command === "Run Command") {
    goToWorkspace(); openTerminal(); state.setTerminalTab("agent");
    setTimeout(() => document.querySelector<HTMLInputElement>(".tin input")?.focus(), 60);
  } else if (command === "Run Tests") { goToWorkspace(); openTerminal(); state.setTerminalTab("agent"); state.runTerminalCommand("go test ./..."); }
  else if (command === "Git Commit") { goToWorkspace(); state.setCenterTab("changes"); state.showNotice("Review the changes, then ask OWL to commit. Commits always ask for approval."); }
  else if (command === "Git Push") state.showNotice("Pushing always asks for approval. Ask OWL to push from the chat.");
  else if (command === "Keyboard shortcuts") state.setShortcutsOpen(true);
  else if (command === "Toggle theme") toggleLightDarkTheme();
  else if (command === "Back to website") navigateTo("/");
}

export function CommandPaletteDialog() {
  const open = useAppStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) { setQuery(""); setHighlightedIndex(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);
  const groupedCommands = useMemo(() => {
    const matches = COMMANDS.filter((command) => command.toLowerCase().includes(query.toLowerCase()));
    return COMMAND_GROUPS.map((group) => ({ group, items: matches.filter((command) => (COMMAND_META[command]?.group ?? "Workspace") === group) }))
      .filter((section) => section.items.length > 0);
  }, [query]);
  const visibleCommands = useMemo(() => groupedCommands.flatMap((section) => section.items), [groupedCommands]);
  useEffect(() => { setHighlightedIndex(0); }, [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${highlightedIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);
  if (!open) return null;
  const runSelectedCommand = (command: string) => {
    setCommandPaletteOpen(false);
    runPaletteCommand(command);
  };
  let runningIndex = -1;
  return (
    <div className="overlay" onClick={() => setCommandPaletteOpen(false)}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <div className="sheet-input">
          <MagnifyingGlass size={18} />
          <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search commands and pages…"
            role="combobox" aria-expanded="true" aria-controls="palette-list"
            aria-activedescendant={visibleCommands[highlightedIndex] ? `cmd-${highlightedIndex}` : undefined}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setHighlightedIndex((index) => Math.min(visibleCommands.length - 1, index + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightedIndex((index) => Math.max(0, index - 1)); }
              else if (e.key === "Enter" && visibleCommands[highlightedIndex]) runSelectedCommand(visibleCommands[highlightedIndex]);
              else if (e.key === "Escape") setCommandPaletteOpen(false);
            }} />
          <kbd>Esc</kbd>
        </div>
        <div className="sheet-list" id="palette-list" role="listbox" ref={listRef}>
          {groupedCommands.map(({ group, items }) => (
            <div key={group} role="group" aria-label={group}>
              <div className="sheet-group">{group}</div>
              {items.map((command) => {
                runningIndex += 1;
                const itemIndex = runningIndex;
                const commandMeta = COMMAND_META[command] ?? { icon: Command, group: "Workspace" as CommandGroup };
                return (
                  <button key={command} id={`cmd-${itemIndex}`} data-i={itemIndex} role="option" aria-selected={itemIndex === highlightedIndex}
                    className={`sheet-item${itemIndex === highlightedIndex ? " hot" : ""}`}
                    onMouseMove={() => setHighlightedIndex(itemIndex)} onClick={() => runSelectedCommand(command)}>
                    <commandMeta.icon size={17} />
                    <span>{command}</span>
                    {commandMeta.keys && <span className="sheet-keys">{commandMeta.keys.map((key) => <kbd key={key}>{key}</kbd>)}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {visibleCommands.length === 0 && (
            <div className="sheet-none">No command matches “{query}”. Try “inbox”, “terminal”, or “changes”.</div>
          )}
        </div>
        <div className="sheet-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> to move</span>
          <span><kbd>Enter</kbd> to run</span>
          <span><kbd>Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}
