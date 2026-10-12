import { ArrowCounterClockwise, ArrowRight, ClockCounterClockwise, Copy, Gauge, Lightning, ShieldCheck, ShieldWarning } from "@phosphor-icons/react";
import { useAppStore } from "../../../../state/app.store";
import { agentApi } from "../../../../services/agentApi.service";
import { Tag, Tile } from "../../../../../shared/components/tag.component";
import { SettingValueRow } from "../settingRow.component";
import { PROJECT_AUTHOR } from "../../../../../shared/data/projectAuthor.data";
import { openLinkInSystemBrowser } from "../../../../../shared/platform/externalLink.platform";

export function AdvancedSettingsSection({ health, onCopyDiagnostics, onResetLayout }: { health: string; onCopyDiagnostics: () => void; onResetLayout: () => void }) {
  return (
    <>
      <div className="surface pg-setgroup">
        <h4>Service</h4>
        <SettingValueRow title="Service URL" sub="Set with VITE_OWL_SERVICE_URL when building the app."><span className="pg-mono">{agentApi.baseUrl}</span></SettingValueRow>
        <SettingValueRow title="Status" sub="Checked when this page opens.">
          <Tag hue={health.startsWith("online") ? "green" : health === "offline" ? "red" : "gray"} dot>{health}</Tag>
        </SettingValueRow>
        <div className="pg-setrow">
          <span className="t"><b>Copy diagnostics</b><small>Version, service status, and provider. No keys or file contents.</small></span>
          <button className="btn btn-secondary btn-sm" onClick={onCopyDiagnostics}><Copy size={14} /> Copy</button>
        </div>
      </div>
      <div className="surface pg-setgroup">
        <h4>Reset</h4>
        <div className="pg-setrow">
          <span className="t"><b>Reset interface layout</b><small>Panel sizes, views, theme, and these settings on this device.</small></span>
          <button className="btn btn-secondary btn-sm" onClick={onResetLayout}><ArrowCounterClockwise size={14} /> Reset</button>
        </div>
      </div>
    </>
  );
}

export function AboutSettingsSection({ health }: { health: string }) {
  const goToScreen = useAppStore((s) => s.goToScreen);
  return (
    <div className="surface pg-setgroup pg-about">
      <div className="pg-about-head">
        <Tile icon={Lightning} hue="ink" size="xl" />
        <div><b>OWL Agent</b><span>Version 0.1.0 · local-first coding agent</span></div>
      </div>
      <SettingValueRow title="Service" sub={agentApi.baseUrl}><Tag hue={health.startsWith("online") ? "green" : "gray"} dot>{health}</Tag></SettingValueRow>
      <SettingValueRow title="Approvals" sub="Every write, command, commit, and push"><Tag hue="green" icon={ShieldWarning}>Required</Tag></SettingValueRow>
      <SettingValueRow title="Made by" sub={`${PROJECT_AUTHOR.name} · free software under GPL-3.0`}>
        <button className="btn btn-secondary btn-sm" onClick={() => void openLinkInSystemBrowser(PROJECT_AUTHOR.website)}>
          Visit portfolio <ArrowRight size={13} />
        </button>
      </SettingValueRow>
      <div className="pg-about-links">
        <a className="btn btn-secondary btn-sm" href="/docs"><Gauge size={14} /> Documentation</a>
        <a className="btn btn-secondary btn-sm" href="/changelog"><ClockCounterClockwise size={14} /> Changelog</a>
        <a className="btn btn-secondary btn-sm" href="/security"><ShieldCheck size={14} /> Security</a>
        <button className="btn btn-ghost btn-sm" onClick={() => goToScreen("help")}>Help <ArrowRight size={13} /></button>
      </div>
    </div>
  );
}
