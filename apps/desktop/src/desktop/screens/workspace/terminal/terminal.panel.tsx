import { useEffect, useRef, useState } from "react";
import { Broom, Copy, X } from "@phosphor-icons/react";
import { useAppStore } from "../../../state/app.store";
import { copyTextToClipboard } from "../../../../shared/helpers/clipboard.helper";
import { SAMPLE_DEV_SERVER_LINES, SAMPLE_TEST_RUN_LINES, TERMINAL_TABS } from "./terminalSample.data";
import "./terminal.style.css";

export function TerminalPanel() {
  const agentLines = useAppStore((s) => s.terminal);
  const isOpen = useAppStore((s) => s.terminalOpen);
  const toggleTerminal = useAppStore((s) => s.toggleTerminal);
  const runTerminalCommand = useAppStore((s) => s.runTerminalCommand);
  const tab = useAppStore((s) => s.terminalTab);
  const setTerminalTab = useAppStore((s) => s.setTerminalTab);
  const clearTerminal = useAppStore((s) => s.clearTerminal);
  const showNotice = useAppStore((s) => s.showNotice);
  const [clearedSampleTabs, setClearedSampleTabs] = useState<Record<string, boolean>>({});
  const [command, setCommand] = useState("");
  const outputRef = useRef<HTMLDivElement>(null);
  const shownLines = tab === "agent"
    ? agentLines
    : clearedSampleTabs[tab] ? [] : (tab === "dev" ? SAMPLE_DEV_SERVER_LINES : SAMPLE_TEST_RUN_LINES).map((line, index) => ({ ...line, id: `${tab}-${index}` }));
  useEffect(() => {
    const outputElement = outputRef.current;
    if (outputElement) outputElement.scrollTop = outputElement.scrollHeight;
  }, [shownLines.length, tab]);
  if (!isOpen) return null;
  const clearOutput = () => {
    if (tab === "agent") clearTerminal();
    else setClearedSampleTabs((cleared) => ({ ...cleared, [tab]: true }));
  };
  const copyOutput = async () => {
    const text = shownLines.map((line) => line.text).join("\n");
    const copied = await copyTextToClipboard(text);
    showNotice(copied ? `Copied ${shownLines.length} lines` : "Clipboard blocked. Select the output and copy it by hand.");
  };
  return (
    <div className="term">
      <div className="ttabs" role="tablist" aria-label="Terminals">
        {TERMINAL_TABS.map((terminalTab) => (
          <button key={terminalTab.id} role="tab" aria-selected={tab === terminalTab.id} className={`ttab${tab === terminalTab.id ? " on" : ""}`} onClick={() => setTerminalTab(terminalTab.id)}>
            <terminalTab.icon size={13} weight={tab === terminalTab.id ? "fill" : "regular"} /> {terminalTab.label}
            {terminalTab.id === "dev" && <span className="t-live" title="Sample dev server output" />}
          </button>
        ))}
        <span className="grow" />
        <button className="ttab-x" onClick={() => void copyOutput()} title="Copy output" aria-label="Copy output" disabled={shownLines.length === 0}>
          <Copy size={13} />
        </button>
        <button className="ttab-x" onClick={clearOutput} title="Clear" aria-label="Clear terminal" disabled={shownLines.length === 0}>
          <Broom size={13} />
        </button>
        <button className="ttab-x" onClick={toggleTerminal} title="Close terminal (Ctrl J)" aria-label="Close terminal">
          <X size={13} />
        </button>
      </div>
      <div className="tout" ref={outputRef} aria-live="polite">
        {shownLines.length === 0 && (
          <div className="t-empty">
            {tab === "agent" ? "Terminal cleared. Commands you run, and the agent's labelled commands, appear here." : "Cleared. New output from this process appears here."}
          </div>
        )}
        {shownLines.map((line) => (
          <div key={line.id} className={`tl-line t-${line.kind}`}>
            {line.kind === "agent" && <span className="t-owl">OWL</span>}
            {line.text}
          </div>
        ))}
      </div>
      {tab === "agent" ? (
        <div className="tin">
          <span className="t-prompt">~/zudomart <b>❯</b></span>
          <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="Run a command in the project sandbox"
            aria-label="Run a command"
            onKeyDown={(e) => { if (e.key === "Enter") { runTerminalCommand(command); setCommand(""); } }} />
        </div>
      ) : (
        <div className="tin t-note">
          {tab === "dev" ? "Sample output. Ask OWL to start the dev server and its output streams here." : "Sample output. Run Tests from the palette, or ask OWL to run them."}
        </div>
      )}
    </div>
  );
}
