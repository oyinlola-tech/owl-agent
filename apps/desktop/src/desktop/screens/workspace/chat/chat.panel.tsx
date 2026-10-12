import { useEffect, useRef, useState } from "react";
import { Check, Info, PaperPlaneRight, Pause, Play, Plugs, Stack, Stop } from "@phosphor-icons/react";
import { useAppStore } from "../../../state/app.store";
import { agentApi } from "../../../services/agentApi.service";
import { OwlMark } from "../../../../shared/components/owlMark.component";
import { Tag, type Hue } from "../../../../shared/components/tag.component";
import { ChatContextPicker } from "./chatContextPicker.component";
import "./chat.style.css";

function ChatAvatar({ from }: { from: "you" | "owl" | "sys" }) {
  if (from === "owl") return <OwlMark size={28} />;
  if (from === "sys") return <span className="av av-sys"><Info size={15} weight="bold" /></span>;
  return <span className="av av-you">OO</span>;
}

export function ChatPanel() {
  const chat = useAppStore((s) => s.chat);
  const draft = useAppStore((s) => s.draft);
  const setDraft = useAppStore((s) => s.setDraft);
  const sendWorkspaceMessage = useAppStore((s) => s.sendWorkspaceMessage);
  const agentStatus = useAppStore((s) => s.agentStatus);
  const pauseAgent = useAppStore((s) => s.pauseAgent);
  const resumeAgent = useAppStore((s) => s.resumeAgent);
  const stopAgent = useAppStore((s) => s.stopAgent);
  const askForConfirmation = useAppStore((s) => s.askForConfirmation);
  const preferredModel = useAppStore((s) => s.preferredModel);
  const setPreferredModel = useAppStore((s) => s.setPreferredModel);
  const project = useAppStore((s) => s.project);
  const needsProvider = useAppStore((s) => s.needsProvider);
  const goToScreen = useAppStore((s) => s.goToScreen);
  const [models, setModels] = useState<{ id: string; status: string }[]>([]);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    agentApi.registry()
      .then((registry) => { if (alive) setModels(registry.models.map((model) => ({ id: model.id, status: model.status }))); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [chat.length]);
  const confirmStopTask = () => askForConfirmation({
    title: "Stop the running task?",
    body: "The agent halts immediately. Progress so far is kept and the task stays in your history.",
    confirmLabel: "Stop task",
    run: stopAgent,
  });
  const working = agentStatus === "working" || agentStatus === "awaiting";
  const agentStateLabel = agentStatus === "working" ? "Working" : agentStatus === "paused" ? "Paused" : agentStatus === "awaiting" ? "Waiting for your approval" : agentStatus === "done" ? "Done" : agentStatus === "stopped" ? "Stopped" : "Ready";
  const agentStateHue: Hue = agentStatus === "working" ? "blue" : agentStatus === "awaiting" ? "orange" : agentStatus === "done" ? "green" : "gray";
  const isModelUsable = (model: { status: string }) => model.status === "available" || model.status === "verified";
  return (
    <div className="chat">
      <div className="chatbar">
        <span className="chatbar-status">
          <Tag hue={agentStateHue} dot>{agentStateLabel}</Tag>
          <span className="chatbar-meta">{project?.name ?? "No project"}</span>
        </span>
        <select
          className="input modelsel"
          aria-label="Model"
          value={preferredModel}
          onChange={(e) => setPreferredModel(e.target.value)}
          title={preferredModel === "auto" ? "Auto: the router picks a model per task" : `Pinned to ${preferredModel}`}
        >
          <option value="auto">Auto routing</option>
          {models.filter(isModelUsable).map((model) => <option key={model.id} value={model.id}>{model.id}</option>)}
          {models.filter((model) => !isModelUsable(model)).map((model) => (
            <option key={model.id} value={model.id} disabled>{model.id} ({model.status})</option>
          ))}
        </select>
      </div>

      <div className="msgs">
        {chat.map((message) => (
          <div key={message.id} className={`msg msg-${message.from}`}>
            <ChatAvatar from={message.from} />
            <div className="msg-body">
              <div className="msg-who">{message.from === "you" ? "You" : message.from === "owl" ? "OWL" : "System"}</div>
              <div className="msg-text">{message.text}</div>
              {message.plan && (
                <ol className="todo">
                  {message.plan.map((step, index) => (
                    <li key={step}>
                      <span className="todo-box"><Check size={11} weight="bold" /></span>
                      <span className="todo-n">{index + 1}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              )}
              {message.meta && <div className="msg-meta">{message.meta}</div>}
            </div>
          </div>
        ))}
        <div ref={endOfMessagesRef} />
      </div>

      <div className="chat-dock">
        {needsProvider && (
          <div className="callout blue" role="status" style={{ marginBottom: 8 }}>
            <Plugs size={18} weight="duotone" color="var(--blue)" />
            <span>Connect a model before OWL can work on a task.</span>
            <span className="grow" />
            <button className="btn btn-primary btn-sm" onClick={() => goToScreen("settings")}>Connect a model</button>
          </div>
        )}
        <div className="agent-ctl">
          {working && <button className="btn btn-secondary btn-sm" onClick={pauseAgent}><Pause size={13} weight="fill" /> Pause</button>}
          {agentStatus === "paused" && <button className="btn btn-secondary btn-sm" onClick={resumeAgent}><Play size={13} weight="fill" /> Resume</button>}
          {(working || agentStatus === "paused") && (
            <button className="btn btn-secondary btn-sm" onClick={confirmStopTask}><Stop size={13} weight="fill" style={{ color: "var(--red)" }} /> Stop</button>
          )}
        </div>
        <div className="composer">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask OWL to build, fix, or explain…"
            aria-label="Message OWL"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendWorkspaceMessage(); } }} />
          <div className="composer-row">
            <ChatContextPicker />
            <span className="ctx-chip"><Stack size={13} /> {preferredModel === "auto" ? "Auto model" : preferredModel.split("/").pop()}</span>
            <span className="grow" />
            <span className="composer-hint"><kbd>Enter</kbd> to send</span>
            {working ? (
              <button className="btn btn-secondary btn-sm" onClick={confirmStopTask} aria-label="Stop task">
                <Stop size={13} weight="fill" style={{ color: "var(--red)" }} /> Stop
              </button>
            ) : (
              <button className="btn btn-primary btn-sm send" disabled={!draft.trim() || !project} onClick={sendWorkspaceMessage} aria-label="Send message">
                <PaperPlaneRight size={14} weight="fill" /> Send
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
