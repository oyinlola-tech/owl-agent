import { Pause, Play, Stop } from "@phosphor-icons/react";
import { useAppStore } from "../../state/app.store";

export function AgentControls() {
  const agentStatus = useAppStore((s) => s.agentStatus);
  const pauseAgent = useAppStore((s) => s.pauseAgent);
  const resumeAgent = useAppStore((s) => s.resumeAgent);
  const stopAgent = useAppStore((s) => s.stopAgent);
  const askForConfirmation = useAppStore((s) => s.askForConfirmation);
  const goToScreen = useAppStore((s) => s.goToScreen);
  const hue = agentStatus === "working" ? "blue" : agentStatus === "awaiting" ? "orange" : agentStatus === "paused" || agentStatus === "stopped" ? "gray" : "green";
  const label = agentStatus === "working" ? "Working" : agentStatus === "awaiting" ? "Needs approval" : agentStatus === "paused" ? "Paused" : agentStatus === "stopped" ? "Stopped" : agentStatus === "done" ? "Done" : "Ready";
  const active = agentStatus === "working" || agentStatus === "awaiting" || agentStatus === "paused";
  return (
    <div className={`agent-ctl-tb${active ? " active" : ""}`} role="group" aria-label="Agent">
      <button className={`status-pill sp-${hue}`} onClick={() => goToScreen("workspace")} title={`Agent: ${label}. Open the workspace`}>
        <span className={`live-dot${agentStatus === "working" ? " pulse" : ""}`} style={{ width: 7, height: 7 }} />
        <span className="hide-s">{label}</span>
      </button>
      {(agentStatus === "working" || agentStatus === "awaiting") && (
        <button className="btn btn-ghost btn-icon btn-sm" onClick={pauseAgent} aria-label="Pause agent" title="Pause agent"><Pause size={15} weight="fill" /></button>
      )}
      {agentStatus === "paused" && (
        <button className="btn btn-ghost btn-icon btn-sm" onClick={resumeAgent} aria-label="Resume agent" title="Resume agent"><Play size={15} weight="fill" /></button>
      )}
      {active && (
        <button className="btn btn-ghost btn-icon btn-sm tb-stop" aria-label="Stop agent" title="Stop agent"
          onClick={() => askForConfirmation({
            title: "Stop the running task?",
            body: "The agent halts immediately. Progress so far is kept and can be resumed from history.",
            confirmLabel: "Stop task",
            run: stopAgent,
          })}>
          <Stop size={15} weight="fill" />
        </button>
      )}
    </div>
  );
}
