import { ClockCounterClockwise, Cpu, Lightning } from "@phosphor-icons/react";
import type { TaskDetail } from "../../../services/agentApi.types";
import { useAppStore } from "../../../state/app.store";
import { EmptyState } from "../../../../shared/components/pageLayout.component";
import { Tag } from "../../../../shared/components/tag.component";

export function BackendTaskUsagePanel({ usage, totalInputTokens, totalOutputTokens }: {
  usage: TaskDetail["usage"];
  totalInputTokens: number;
  totalOutputTokens: number;
}) {
  const goToScreen = useAppStore((s) => s.goToScreen);
  if (usage.length === 0) return <EmptyState icon={Cpu} title="No model calls yet" body="Token use for each call appears here." />;
  return (
    <>
      <div className="pg-kpis" style={{ marginBottom: 16 }}>
        <div><b>{totalInputTokens.toLocaleString()}</b><span>Input tokens</span></div>
        <div><b>{totalOutputTokens.toLocaleString()}</b><span>Output tokens</span></div>
        <div><b>{usage.length}</b><span>Model calls</span></div>
        <div><b>{(usage.reduce((total, row) => total + row.duration_ms, 0) / 1000).toFixed(1)} s</b><span>Model time</span></div>
      </div>
      <div className="pg-table-wrap">
        <table className="pg-table static compact">
          <thead><tr><th><Cpu size={13} />Model</th><th>In</th><th>Out</th><th>Time</th><th>Source</th></tr></thead>
          <tbody>
            {usage.map((row, index) => (
              <tr key={row.id ?? index}>
                <td className="pg-mono">{row.model}{row.error && <div className="pg-err">{row.error}</div>}</td>
                <td className="num">{row.input_tokens.toLocaleString()}</td>
                <td className="num">{row.output_tokens.toLocaleString()}</td>
                <td className="num">{row.duration_ms ? `${(row.duration_ms / 1000).toFixed(1)} s` : "—"}</td>
                <td>{row.estimated ? <Tag icon={ClockCounterClockwise}>Estimated</Tag> : <Tag hue="green" icon={Lightning}>Measured</Tag>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pg-actions"><button className="btn btn-secondary" onClick={() => goToScreen("models")}><Cpu size={14} /> All models and usage</button></div>
    </>
  );
}
