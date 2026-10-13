import type { UsageRow } from "../../../services/agentApi.types";

export const BUDGET_STORAGE_KEY = "owl.monthlyTokenBudget";
export const DEFAULT_MONTHLY_BUDGET = 1_000_000;

export interface ModelSpend {
  model: string;
  input: number;
  output: number;
  total: number;
  calls: number;
  share: number;
}

export interface TaskSpend {
  taskId: string;
  models: string[];
  input: number;
  output: number;
  total: number;
  calls: number;
  measurement: "Measured" | "Estimated" | "Mixed";
}

export const shortModelName = (id: string) => id.split("/").pop() ?? id;

export function groupUsageByModel(usage: UsageRow[]): ModelSpend[] {
  const grand = usage.reduce((sum, row) => sum + row.input_tokens + row.output_tokens, 0);
  const byModel = new Map<string, { input: number; output: number; calls: number }>();
  for (const row of usage) {
    const key = shortModelName(row.model);
    const entry = byModel.get(key) ?? { input: 0, output: 0, calls: 0 };
    entry.input += row.input_tokens;
    entry.output += row.output_tokens;
    entry.calls += 1;
    byModel.set(key, entry);
  }
  return [...byModel.entries()]
    .map(([model, entry]) => ({
      model,
      input: entry.input,
      output: entry.output,
      total: entry.input + entry.output,
      calls: entry.calls,
      share: grand > 0 ? (entry.input + entry.output) / grand : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export function groupUsageByTask(usage: UsageRow[]): TaskSpend[] {
  const byTask = new Map<string, { models: Set<string>; input: number; output: number; calls: number; estimated: number }>();
  for (const row of usage) {
    const entry = byTask.get(row.task_id) ?? { models: new Set<string>(), input: 0, output: 0, calls: 0, estimated: 0 };
    entry.models.add(shortModelName(row.model));
    entry.input += row.input_tokens;
    entry.output += row.output_tokens;
    entry.calls += 1;
    if (row.estimated) entry.estimated += 1;
    byTask.set(row.task_id, entry);
  }
  return [...byTask.entries()]
    .map(([taskId, entry]) => ({
      taskId,
      models: [...entry.models].sort(),
      input: entry.input,
      output: entry.output,
      total: entry.input + entry.output,
      calls: entry.calls,
      measurement: (entry.estimated === 0 ? "Measured" : entry.estimated === entry.calls ? "Estimated" : "Mixed") as TaskSpend["measurement"],
    }))
    .sort((a, b) => b.total - a.total);
}

export function monthTokenTotal(usage: UsageRow[], now = new Date()): number {
  const month = now.getUTCMonth();
  const year = now.getUTCFullYear();
  return usage
    .filter((row) => {
      const created = new Date(row.created_at);
      return !Number.isNaN(created.getTime()) && created.getUTCMonth() === month && created.getUTCFullYear() === year;
    })
    .reduce((sum, row) => sum + row.input_tokens + row.output_tokens, 0);
}

export type BudgetLevel = "ok" | "warn" | "over";

export function budgetLevel(total: number, cap: number): BudgetLevel {
  if (!Number.isFinite(cap) || cap <= 0) return "ok";
  if (total >= cap) return "over";
  if (total >= cap * 0.8) return "warn";
  return "ok";
}

export function readBudgetCap(): number {
  try {
    const raw = localStorage.getItem(BUDGET_STORAGE_KEY);
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_MONTHLY_BUDGET;
  } catch {
    return DEFAULT_MONTHLY_BUDGET;
  }
}

export function writeBudgetCap(cap: number): void {
  try {
    if (Number.isFinite(cap) && cap > 0) localStorage.setItem(BUDGET_STORAGE_KEY, String(Math.floor(cap)));
  } catch {
    // Local-only preference: never let storage failures break the dashboard.
  }
}
