import { Timer, Wrench } from "@phosphor-icons/react";
import type { TaskDetail } from "../../../services/agentApi.types";
import { SectionTitle } from "../../../../shared/components/pageLayout.component";
import { StatusTag } from "../../../../shared/components/statusTag.component";
import { formatShortTimeAgo } from "../../../../shared/helpers/time.helper";
import { describeEvent } from "../verification/verificationState.helper";

export type BackendTaskEvent = { type: string; at: string; data: Record<string, unknown> };

export function BackendTaskActivityPanel({ toolCalls, events, live, demo }: {
  toolCalls: TaskDetail["tool_calls"];
  events: BackendTaskEvent[];
  live: boolean;
  demo: boolean;
}) {
  return (
    <div className="pg-blocks">
      <section>
        <SectionTitle actions={live && !demo ? <span className="pg-live"><span className="live-dot pulse" /> Live</span> : undefined}>Events</SectionTitle>
        {events.length === 0 ? <p className="pg-muted pg-p">{live ? "Waiting for the next event…" : "No events recorded in this session."}</p> : (
          <div className="pg-log" aria-live="polite">
            {events.slice(0, 20).map((event, index) => (
              <div key={`${event.at}-${index}`}><span className="i">{formatShortTimeAgo(event.at) || "now"}</span>{describeEvent(event.type, event.data) ?? event.type}</div>
            ))}
          </div>
        )}
      </section>
      <section>
        <SectionTitle count={toolCalls.length}>Tool calls</SectionTitle>
        {toolCalls.length === 0 ? <p className="pg-muted pg-p">No tools called yet.</p> : (
          <div className="pg-table-wrap">
            <table className="pg-table static compact">
              <thead><tr><th><Wrench size={13} />Tool</th><th>Status</th><th>Exit</th><th><Timer size={13} />Time</th></tr></thead>
              <tbody>
                {toolCalls.slice(-12).map((call) => (
                  <tr key={call.id} title={call.output_excerpt}>
                    <td className="pg-mono">{call.tool}</td>
                    <td><StatusTag status={call.status === "ok" ? "completed" : call.status} /></td>
                    <td className="num pg-mono">{call.exit_code ?? "—"}</td>
                    <td className="num">{call.duration_ms} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
