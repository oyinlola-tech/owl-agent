import { useEffect, useRef, useState } from "react";
import { ChatCircleDots, Desktop, File, Files, Folder, FolderOpen, PlugsConnected, Sparkle, Stack, type Icon } from "@phosphor-icons/react";
import { useAppStore } from "../state/app.store";
import "../styles/dialog.style.css";

const CONTEXT_SCOPES: { label: string; icon: Icon }[] = [
  { label: "Current file", icon: File },
  { label: "Current folder", icon: Folder },
  { label: "Current project", icon: FolderOpen },
  { label: "Selected files", icon: Files },
  { label: "Entire workspace", icon: Stack },
  { label: "Computer", icon: Desktop },
];

export function AskOwlDialog() {
  const open = useAppStore((s) => s.askOwlOpen);
  const setAskOwlOpen = useAppStore((s) => s.setAskOwlOpen);
  const appendTerminalLine = useAppStore((s) => s.appendTerminalLine);
  const [question, setQuestion] = useState("");
  const [scopeIndex, setScopeIndex] = useState(2);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) { setQuestion(""); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);
  if (!open) return null;
  const submitQuestion = () => {
    if (!question.trim()) return;
    appendTerminalLine({ kind: "cmd", text: `$ owl run [${CONTEXT_SCOPES[scopeIndex].label}] "${question.slice(0, 48)}"` });
    setAskOwlOpen(false);
  };
  return (
    <div className="overlay" onClick={() => setAskOwlOpen(false)}>
      <div className="sheet sheet-ai" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Ask OWL">
        <div className="sheet-input">
          <Sparkle size={18} weight="fill" className="ai-spark" />
          <input ref={inputRef} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask OWL to build, fix, or explain something…"
            aria-label="Ask OWL"
            onKeyDown={(e) => { if (e.key === "Enter") submitQuestion(); if (e.key === "Escape") setAskOwlOpen(false); }} />
          <button className="btn btn-primary btn-sm" disabled={!question.trim()} onClick={submitQuestion}>Run</button>
        </div>
        <div className="ai-ctx">
          <span className="ai-ctx-label">Context</span>
          <div className="ai-chips" role="radiogroup" aria-label="Context scope">
            {CONTEXT_SCOPES.map((scope, index) => (
              <button key={scope.label} role="radio" aria-checked={index === scopeIndex} className={`ai-chip${index === scopeIndex ? " on" : ""}`} onClick={() => setScopeIndex(index)}>
                <scope.icon size={14} weight={index === scopeIndex ? "fill" : "regular"} /> {scope.label}
              </button>
            ))}
          </div>
        </div>
        <div className="sheet-foot">
          <span><ChatCircleDots size={13} /> Replies land in the agent terminal</span>
          <span><PlugsConnected size={13} /> Edits always wait for your approval</span>
          <span style={{ marginLeft: "auto" }}><kbd>Enter</kbd> to run</span>
        </div>
      </div>
    </div>
  );
}
