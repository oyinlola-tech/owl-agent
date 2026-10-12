import { useEffect, useState } from "react";
import { Command, Cpu, GitBranch, TerminalWindow, Tray } from "@phosphor-icons/react";
import { useAppStore } from "../state/app.store";
import { agentApi } from "../services/agentApi.service";
import { usePendingApprovalCount } from "../state/pendingApprovals.store";
import { useServiceConnectionStore } from "../services/connection/serviceConnection.store";

type ServiceState = "unknown" | "online" | "offline";

const HEALTH_CHECK_INTERVAL_MS = 15000;

export function StatusBar({ onOpenCommandPalette }: { onOpenCommandPalette: () => void }) {
  const agentStatus = useAppStore((s) => s.agentStatus);
  const changes = useAppStore((s) => s.changes);
  const preferredModel = useAppStore((s) => s.preferredModel);
  const goToScreen = useAppStore((s) => s.goToScreen);
  const toggleTerminal = useAppStore((s) => s.toggleTerminal);
  const pendingCount = usePendingApprovalCount();
  const serviceAuthFailed = useServiceConnectionStore((s) => s.authFailed);
  const [serviceState, setServiceState] = useState<ServiceState>("unknown");
  const [serviceVersion, setServiceVersion] = useState("");
  const checkServiceHealth = async () => {
    try {
      const health = await agentApi.health();
      setServiceVersion(health.version);
      setServiceState("online");
    } catch {
      setServiceState("offline");
    }
  };
  useEffect(() => {
    let alive = true;
    checkServiceHealth().catch(() => {});
    const healthTimer = setInterval(() => { if (alive) checkServiceHealth().catch(() => {}); }, HEALTH_CHECK_INTERVAL_MS);
    return () => { alive = false; clearInterval(healthTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const agentHue = agentStatus === "working" ? "blue" : agentStatus === "awaiting" ? "orange" : agentStatus === "paused" || agentStatus === "stopped" ? "gray" : "green";
  const agentLabel = agentStatus === "working" ? "Agent working" : agentStatus === "paused" ? "Agent paused" : agentStatus === "awaiting" ? "Needs approval" : agentStatus === "stopped" ? "Agent stopped" : "Agent ready";
  const serviceLocked = serviceAuthFailed && serviceState === "online";
  const serviceDotColor = serviceLocked ? "var(--orange)" : serviceState === "online" ? "var(--green)" : serviceState === "offline" ? "var(--red)" : "var(--gray)";
  const serviceLabel = serviceLocked ? "Service locked" : serviceState === "unknown" ? "Checking service" : serviceState === "online" ? `Service v${serviceVersion}` : "Service offline";
  const serviceTitle = serviceLocked
    ? "The OWL service refused this app's token. Select to retry."
    : serviceState === "online" ? `Python service online (v${serviceVersion})` : "Python service unreachable, running in mock mode. Select to retry.";
  return (
    <footer className="statusbar">
      <button onClick={() => { goToScreen("workspace"); useAppStore.getState().setCenterTab("changes"); }} title="Review changes">
        <GitBranch size={12} weight="bold" /> main <span className="sbar-dim hide-s">· {changes.length} changes</span>
      </button>
      <button onClick={() => goToScreen("tasks")} style={{ color: `var(--${agentHue})` }}>
        <span className={`live-dot${agentStatus === "working" ? " pulse" : ""}`} style={{ width: 6, height: 6 }} /> {agentLabel}
      </button>
      <button onClick={() => goToScreen("inbox")} title="Open inbox" className={pendingCount ? "sbar-hot" : ""}>
        <Tray size={12} weight={pendingCount ? "fill" : "regular"} /> {pendingCount ? `${pendingCount} to approve` : <span className="hide-s">Inbox clear</span>}
      </button>
      <span className="grow" />
      <button
        onClick={() => checkServiceHealth().catch(() => {})}
        title={serviceTitle}
      >
        <span className="live-dot" style={{ width: 6, height: 6, color: serviceDotColor }} />
        <span className="hide-s">{serviceLabel}</span>
      </button>
      <span className="hide-m sbar-static"><Cpu size={12} /> {preferredModel === "auto" ? "Auto routing" : preferredModel}</span>
      <button className="hide-s" onClick={toggleTerminal} title="Toggle terminal (Ctrl J)"><TerminalWindow size={12} /> Terminal</button>
      <button className="hide-s" onClick={onOpenCommandPalette} title="Command palette (Ctrl Shift P)"><Command size={12} /> Commands</button>
    </footer>
  );
}
