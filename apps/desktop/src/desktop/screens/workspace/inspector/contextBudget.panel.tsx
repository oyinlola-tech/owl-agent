import { useEffect, useState } from "react";
import { Info } from "@phosphor-icons/react";
import { useAppStore } from "../../../state/app.store";
import { agentApi } from "../../../services/agentApi.service";
import { type BudgetReport } from "../../../services/agentApi.types";
import { Tag } from "../../../../shared/components/tag.component";
import "./inspector.style.css";

const BUDGET_PART_HUES = ["blue", "purple", "green", "orange", "pink", "yellow", "brown"];

type CompressionHistoryEntry = { id: number; level: number; before_tokens: number; after_tokens: number; summary: string; created_at: string };

export function ContextBudgetPanel() {
  const chat = useAppStore((s) => s.chat);
  const preferredModel = useAppStore((s) => s.preferredModel);
  const [report, setReport] = useState<BudgetReport | null>(null);
  const [compressionHistory, setCompressionHistory] = useState<CompressionHistoryEntry[]>([]);
  useEffect(() => {
    let alive = true;
    const conversationParts = chat
      .filter((message) => message.from !== "sys")
      .slice(-12)
      .map((message) => ({ category: message.from === "you" ? "recent" : "history", text: message.text.slice(0, 2000) }));
    agentApi
      .budget(preferredModel === "auto" ? "" : preferredModel, [
        { category: "instructions", text: "You are OWL, a careful coding assistant." },
        ...conversationParts,
      ])
      .then((budgetReport) => {
        if (alive) setReport(budgetReport);
      })
      .catch(() => {});
    agentApi
      .compressions()
      .then((entries) => {
        if (alive) setCompressionHistory(entries);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [chat.length, preferredModel]);
  if (!report) {
    return (
      <div className="ctx">
        <div className="callout"><Info size={15} /> The token budget needs the local OWL service. Start it to see live context usage.</div>
      </div>
    );
  }
  const usedPercent = Math.min(100, Math.round(report.utilization * 100));
  const availableTokens = Math.max(1, report.available);
  const hueForPart = (index: number) => `var(--${BUDGET_PART_HUES[index % BUDGET_PART_HUES.length]})`;
  return (
    <div className="ctx">
      <div className="ctx-big">
        <b>{usedPercent}%</b>
        <span>{report.used.toLocaleString()} of {report.available.toLocaleString()} tokens</span>
      </div>
      <div className="ctx-bar" role="img" aria-label={`${usedPercent}% of context used`}>
        {report.parts.map((part, index) => (
          <i key={part.category} style={{ width: `${(part.tokens / availableTokens) * 100}%`, background: hueForPart(index) }} />
        ))}
      </div>
      {report.over_budget && <div className="callout red"><Info size={15} /> Over budget. Older turns will be compressed.</div>}
      {report.should_compress && !report.over_budget && <div className="callout yellow"><Info size={15} /> Compression advised soon.</div>}
      <ul className="ctx-legend">
        {report.parts.map((part, index) => (
          <li key={part.category}>
            <i style={{ background: hueForPart(index) }} />
            <span>{part.category}</span>
            <b className="mono">{part.tokens.toLocaleString()}</b>
          </li>
        ))}
      </ul>
      <div className="ctx-model">
        <span>Model</span><b className="mono">{report.model || "auto"}</b>
        <span>Limit</span><b className="mono">{report.limit.toLocaleString()} <small>({report.limit_source})</small></b>
      </div>
      {compressionHistory.length > 0 && (
        <>
          <div className="side-label">Compression history</div>
          <ul className="ctx-legend">
            {compressionHistory.slice(0, 5).map((entry) => (
              <li key={entry.id}>
                <Tag hue="purple">L{entry.level}</Tag>
                <span className="mono">{entry.before_tokens.toLocaleString()} → {entry.after_tokens.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
