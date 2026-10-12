import { CaretLeft, CaretRight, ChatCircleText, Code, Eye, FolderOpen, GitDiff, Globe, TerminalWindow, type Icon } from "@phosphor-icons/react";
import { useAppStore } from "../../state/app.store";
import { EmptyState } from "../../../shared/components/pageLayout.component";
import { HorizontalResizeHandle } from "./resizeHandle.component";
import { FilePanel } from "./explorer/filePanel.panel";
import { ChatPanel } from "./chat/chat.panel";
import { CodeEditorPanel } from "./editor/codeEditor.panel";
import { ChangesReviewPanel } from "./changes/changesReview.panel";
import { MiniBrowserPanel } from "./editor/miniBrowser.panel";
import { InspectorPanel } from "./inspector/inspector.panel";
import { TerminalPanel } from "./terminal/terminal.panel";
import "./workspaceLayout.style.css";

const CENTER_TABS: { id: "chat" | "code" | "changes" | "browser" | "preview"; icon: Icon; label: string }[] = [
  { id: "chat", icon: ChatCircleText, label: "Chat" },
  { id: "code", icon: Code, label: "Code" },
  { id: "changes", icon: GitDiff, label: "Changes" },
  { id: "browser", icon: Globe, label: "Browser" },
  { id: "preview", icon: Eye, label: "Preview" },
];

export function WorkspaceScreen() {
  const project = useAppStore((s) => s.project);
  const centerTab = useAppStore((s) => s.centerTab);
  const setCenterTab = useAppStore((s) => s.setCenterTab);
  const goToScreen = useAppStore((s) => s.goToScreen);
  const setCreateProjectOpen = useAppStore((s) => s.setCreateProjectOpen);
  const toggleTerminal = useAppStore((s) => s.toggleTerminal);
  const terminalOpen = useAppStore((s) => s.terminalOpen);
  const terminalHeight = useAppStore((s) => s.terminalHeight);
  const setTerminalHeight = useAppStore((s) => s.setTerminalHeight);
  const filePanelOpen = useAppStore((s) => s.filePanelOpen);
  const inspectorOpen = useAppStore((s) => s.inspectorOpen);
  const toggleFilePanel = useAppStore((s) => s.toggleFilePanel);
  const toggleInspector = useAppStore((s) => s.toggleInspector);
  const changes = useAppStore((s) => s.changes);
  if (!project) {
    return (
      <div className="page">
        <EmptyState icon={FolderOpen} hue="blue" title="No project open"
          body="Open a project to give OWL a folder to work in. It can only read and write inside that folder.">
          <button className="btn btn-primary" onClick={() => setCreateProjectOpen(true)}>Add a project</button>
          <button className="btn btn-secondary" onClick={() => goToScreen("projects")}>
            <FolderOpen size={14} /> Browse projects
          </button>
        </EmptyState>
      </div>
    );
  }
  return (
    <div className={`work${terminalOpen ? "" : " no-term"}`}>
      <div className="worktop">
        {!filePanelOpen && (
          <button className="pane-reopen l" onClick={toggleFilePanel} title="Open sidebar (Ctrl B)" aria-label="Open sidebar">
            <CaretRight size={13} weight="bold" />
          </button>
        )}
        <FilePanel />
        <section className="center">
          <div className="ctabs" role="tablist" aria-label="Workspace tabs">
            {CENTER_TABS.map((tab) => (
              <button key={tab.id} className={centerTab === tab.id ? "on" : ""} onClick={() => setCenterTab(tab.id)} role="tab" aria-selected={centerTab === tab.id}>
                <tab.icon size={15} weight={centerTab === tab.id ? "fill" : "regular"} />
                {tab.label}
                {tab.id === "changes" && changes.length > 0 && <span className="count">{changes.length}</span>}
              </button>
            ))}
          </div>
          <div className={`cbody cbody-${centerTab}`}>
            {centerTab === "chat" && <ChatPanel />}
            {centerTab === "code" && <CodeEditorPanel />}
            {centerTab === "changes" && <ChangesReviewPanel />}
            {centerTab === "browser" && <MiniBrowserPanel />}
            {centerTab === "preview" && <MiniBrowserPanel />}
          </div>
        </section>
        <InspectorPanel />
        {!inspectorOpen && (
          <button className="pane-reopen r" onClick={toggleInspector} title="Open inspector" aria-label="Open inspector">
            <CaretLeft size={13} weight="bold" />
          </button>
        )}
      </div>
      <div className="termzone" style={terminalOpen ? { height: terminalHeight } : undefined}>
        {terminalOpen && <HorizontalResizeHandle onDrag={(deltaY) => setTerminalHeight(terminalHeight + deltaY)} />}
        <TerminalPanel />
        {!terminalOpen && (
          <button className="termreopen" onClick={toggleTerminal}>
            <TerminalWindow size={14} /> Open terminal <kbd>Ctrl</kbd><kbd>J</kbd>
          </button>
        )}
      </div>
    </div>
  );
}
