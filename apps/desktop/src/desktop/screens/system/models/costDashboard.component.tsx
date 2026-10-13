import { useMemo, useState } from "react";
import { Coins, Gauge, Receipt } from "@phosphor-icons/react";
import type { BackendTask, UsageRow } from "../../../services/agentApi.types";
import { SectionTitle } from "../../../../shared/components/pageLayout.component";
import { Tag } from "../../../../shared/components/tag.component";
import {
  budgetLevel, groupUsageByModel, groupUsageByTask, monthTokenTotal,
  readBudgetCap, writeBudgetCap,
} from "./costTotals.helper";

interface CostDashboardProps {
  usage: UsageRow[];
  loading: boolean;
  error: string | null;
  offline: boolean;
  tasksById: Record<string, BackendTask>;
  onOpenTask: (taskId: string) => void;
  onRetry: () => void;
}

const formatTokens = (n: number) => n.toLocaleString();

export function CostDashboard({ usage, loading, error, offline, tasksById, onOpenTask, onRetry }: CostDashboardProps) {
  const [cap, setCap] = useState<number>(() => readBudgetCap());
  const [draft, setDraft] = useState<string>(() => String(readBudgetCap()));

  const byModel = useMemo(() => groupUsageByModel(usage), [usage]);
  const byTask = useMemo(() => groupUsageByTask(usage), [usage]);
  const monthTotal = useMemo(() => monthTokenTotal(usage), [usage]);
  const level = budgetLevel(monthTotal, cap);
  const pct = cap > 0 ? Math.min(100, Math.round((monthTotal / cap) * 100)) : 0;

  const saveCap = () => {
    const parsed = Number(draft.replace(/[^0-9]/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) {
      setCap(Math.floor(parsed));
      writeBudgetCap(Math.floor(parsed));
      setDraft(String(Math.floor(parsed)));
    } else {
      setDraft(String(cap));
    }
  };

  const taskLabel = (taskId: string) => tasksById[taskId]?.prompt ?? taskId;

  return (
    <section aria-label="Cost dashboard">
      <SectionTitle>Cost dashboard</SectionTitle>
      <p className="x-muted">Token counts only, not dollars. Provider billing may differ.</p>

      <div className="surface x-panel">
        <div className="x-panel-head">
          <h3><Gauge size={15} /> Monthly token budget</h3>
          <Tag hue={level === "over" ? "red" : level === "warn" ? "brown" : "green"}>
            {formatTokens(monthTotal)} of {formatTokens(cap)} tokens ({pct}%)
          </Tag>
        </div>
        {level === "warn" && (
          <div role="alert" className="callout">Approaching monthly budget: {pct}% used. Warnings are display-only and never block model calls.</div>
        )}
        {level === "over" && (
          <div role="alert" className="callout">Monthly budget reached: {pct}% used. Warnings are display-only and never block model calls.</div>
        )}
        <form
          className="x-route-form"
          onSubmit={(e) => { e.preventDefault(); saveCap(); }}
        >
          <input
            className="input"
            aria-label="Monthly token budget"
            inputMode="numeric"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="btn btn-secondary" type="submit">Save budget</button>
        </form>
        <p className="x-muted">Stored only in this browser. Nothing is blocked when the budget is reached.</p>
      </div>

      <div className="x-split">
        <section className="surface x-panel" aria-label="Per-model breakdown">
          <div className="x-panel-head">
            <h3><Coins size={15} /> Per-model breakdown</h3>
          </div>
          {loading ? (
            <p className="x-muted">Loading usage…</p>
          ) : offline ? (
            <p className="x-muted">You&apos;re offline. Showing the last loaded usage.</p>
          ) : error ? (
            <div role="alert" className="callout">{error} <button className="btn btn-sm btn-secondary" onClick={onRetry}>Retry</button></div>
          ) : byModel.length === 0 ? (
            <p className="x-muted">No usage recorded yet. Run a task to see per-model spend.</p>
          ) : (
            <div className="x-table-wrap">
              <table className="x-table" aria-label="Tokens by model">
                <thead><tr><th>Model</th><th>Calls</th><th className="x-r">Sent</th><th className="x-r">Received</th><th className="x-r">Total</th><th className="x-r">Share</th></tr></thead>
                <tbody>
                  {byModel.map((row) => (
                    <tr key={row.model}>
                      <td data-label="Model"><span className="mono" title={row.model}>{row.model}</span></td>
                      <td data-label="Calls" className="x-num">{row.calls}</td>
                      <td data-label="Sent" className="x-num x-r">{formatTokens(row.input)}</td>
                      <td data-label="Received" className="x-num x-r">{formatTokens(row.output)}</td>
                      <td data-label="Total" className="x-num x-r">{formatTokens(row.total)}</td>
                      <td data-label="Share" className="x-num x-r">{Math.round(row.share * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="surface x-panel" aria-label="Per-task spend">
          <div className="x-panel-head">
            <h3><Receipt size={15} /> Per-task spend</h3>
          </div>
          {loading ? (
            <p className="x-muted">Loading usage…</p>
          ) : offline && byTask.length === 0 ? (
            <p className="x-muted">You&apos;re offline. Usage will load when you reconnect.</p>
          ) : error && byTask.length === 0 ? (
            <div role="alert" className="callout">{error} <button className="btn btn-sm btn-secondary" onClick={onRetry}>Retry</button></div>
          ) : byTask.length === 0 ? (
            <p className="x-muted">No task spend recorded yet.</p>
          ) : (
            <div className="x-table-wrap">
              <table className="x-table" aria-label="Spend by task">
                <thead><tr><th>Task</th><th>Model</th><th className="x-r">Sent</th><th className="x-r">Received</th><th>Measured</th></tr></thead>
                <tbody>
                  {byTask.slice(0, 15).map((row) => (
                    <tr key={row.taskId}>
                      <td data-label="Task">
                        <button className="x-link mono" onClick={() => onOpenTask(row.taskId)} title={taskLabel(row.taskId)}>
                          {taskLabel(row.taskId).slice(0, 40)}
                        </button>
                      </td>
                      <td data-label="Model"><span className="mono">{row.models.join(", ")}</span></td>
                      <td data-label="Sent" className="x-num x-r">{formatTokens(row.input)}</td>
                      <td data-label="Received" className="x-num x-r">{formatTokens(row.output)}</td>
                      <td data-label="Measured">
                        <Tag hue={row.measurement === "Measured" ? "green" : row.measurement === "Estimated" ? "brown" : "blue"} dot>
                          {row.measurement}
                        </Tag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
