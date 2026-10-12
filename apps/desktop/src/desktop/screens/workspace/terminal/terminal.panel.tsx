import { useEffect, useRef, useState } from "react";
import { Broom, Copy, TerminalWindow, X } from "@phosphor-icons/react";
import { useAppStore } from "../../../state/app.store";
import { copyTextToClipboard } from "../../../../shared/helpers/clipboard.helper";
import "./terminal.style.css";

export function TerminalPanel() {
  const lines = useAppStore((s) => s.terminal);
  const isOpen = useAppStore((s) => s.terminalOpen);
  const toggleTerminal = useAppStore((s) => s.toggleTerminal);
  const runTerminalCommand = useAppStore((s) => s.runTerminalCommand);
  const clearTerminal = useAppStore((s) => s.clearTerminal);
  const showNotice = useAppStore((s) => s.showNotice);
  const project = useAppStore((s) => s.project);
  const terminalBusy = useAppStore((s) => s.terminalBusy);
  const [command, setCommand] = useState("");
  const outputRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outputElement = outputRef.current;
    if (outputElement) outputElement.scrollTop = outputElement.scrollHeight;
  }, [lines.length]);
  if (!isOpen) return null;
  const copyOutput = async () => {
    const text = lines.map((line) => line.text).join("\n");
    const copied = await copyTextToClipboard(text);
    showNotice(copied ? `Copied ${lines.length} lines` : "Clipboard blocked. Select the output and copy it by hand.");
  };
  const submit = () => {
    if (!command.trim()) return;
    runTerminalCommand(command);
    setCommand("");
  };
  return (
    <div className="term">
      <div className="ttabs" role="tablist" aria-label="Terminal">
        <button role="tab" aria-selected className="ttab on">
          <TerminalWindow size={13} weight="fill" /> Terminal
        </button>
        <span className="t-note" style={{ marginLeft: 8 }}>Non-interactive · runs in the project sandbox</span>
        <span className="grow" />
        <button className="ttab-x" onClick={() => void copyOutput()} title="Copy output" aria-label="Copy output" disabled={lines.length === 0}>
          <Copy size={13} />
        </button>
        <button className="ttab-x" onClick={clearTerminal} title="Clear" aria-label="Clear terminal" disabled={lines.length === 0}>
          <Broom size={13} />
        </button>
        <button className="ttab-x" onClick={toggleTerminal} title="Close terminal (Ctrl J)" aria-label="Close terminal">
          <X size={13} />
        </button>
      </div>
      <div className="tout" ref={outputRef} aria-live="polite">
        {lines.length === 0 && (
          <div className="t-empty">
            {project
              ? "Run a command below. Commands run without a shell (no pipes or &&); high-risk ones ask first. The agent's labelled tool output also appears here."
              : "Open a project to run commands in its sandbox."}
          </div>
        )}
        {lines.map((line) => (
          <div key={line.id} className={`tl-line t-${line.kind}`}>
            {line.kind === "agent" && <span className="t-owl">OWL</span>}
            {line.text}
          </div>
        ))}
      </div>
      <div className="tin">
        <span className="t-prompt">{project ? project.name : "owl"} <b>❯</b></span>
        <input value={command} onChange={(e) => setCommand(e.target.value)}
          placeholder={project ? "Run a command in the project sandbox" : "Open a project first"}
          aria-label="Run a command" disabled={!project || terminalBusy}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
      </div>
    </div>
  );
}
