import { describe, expect, it } from "vitest";
import { budgetLevel, groupUsageByModel, groupUsageByTask, monthTokenTotal } from "../costTotals.helper";
import type { UsageRow } from "../../../../services/agentApi.types";

function row(overrides: Partial<UsageRow> = {}): UsageRow {
  return {
    id: 1, task_id: "t1", model: "anthropic/claude-opus", requested_model: "auto",
    routing_reason: "code", input_tokens: 100, output_tokens: 50, estimated: 0,
    duration_ms: 1000, retries: 0, error: "", created_at: new Date().toISOString(), ...overrides,
  };
}

describe("groupUsageByModel", () => {
  it("returns nothing when there are no usage rows", () => {
    expect(groupUsageByModel([])).toEqual([]);
  });

  it("totals tokens per model with share of the grand total", () => {
    const usage = [
      row({ id: 1, model: "anthropic/claude-opus", input_tokens: 300, output_tokens: 100 }),
      row({ id: 2, model: "anthropic/claude-opus", input_tokens: 100, output_tokens: 100 }),
      row({ id: 3, model: "openai/gpt-5", input_tokens: 300, output_tokens: 100 }),
    ];
    const groups = groupUsageByModel(usage);
    expect(groups).toHaveLength(2);
    expect(groups[0].model).toBe("claude-opus");
    expect(groups[0].total).toBe(600);
    expect(groups[0].calls).toBe(2);
    expect(groups[0].share).toBeCloseTo(0.6);
    expect(groups[1].share).toBeCloseTo(0.4);
  });
});

describe("groupUsageByTask", () => {
  it("flags estimated, measured, and mixed tasks", () => {
    const usage = [
      row({ id: 1, task_id: "measured", estimated: 0 }),
      row({ id: 2, task_id: "estimated", estimated: 1 }),
      row({ id: 3, task_id: "mixed", estimated: 1, input_tokens: 10, output_tokens: 5 }),
      row({ id: 4, task_id: "mixed", estimated: 0, input_tokens: 10, output_tokens: 5 }),
    ];
    const byId = Object.fromEntries(groupUsageByTask(usage).map((g) => [g.taskId, g]));
    expect(byId.measured.measurement).toBe("Measured");
    expect(byId.estimated.measurement).toBe("Estimated");
    expect(byId.mixed.measurement).toBe("Mixed");
  });
});

describe("monthTokenTotal", () => {
  it("counts only rows created in the current month", () => {
    const now = new Date("2026-10-13T12:00:00Z");
    const usage = [
      row({ id: 1, input_tokens: 100, output_tokens: 50, created_at: "2026-10-01T00:00:00Z" }),
      row({ id: 2, input_tokens: 1000, output_tokens: 500, created_at: "2026-09-30T23:59:59Z" }),
    ];
    expect(monthTokenTotal(usage, now)).toBe(150);
  });
});

describe("budgetLevel", () => {
  it("warns at 80% and trips at 100%", () => {
    expect(budgetLevel(799, 1000)).toBe("ok");
    expect(budgetLevel(800, 1000)).toBe("warn");
    expect(budgetLevel(999, 1000)).toBe("warn");
    expect(budgetLevel(1000, 1000)).toBe("over");
    expect(budgetLevel(5000, 1000)).toBe("over");
  });

  it("treats a missing or invalid cap as ok", () => {
    expect(budgetLevel(999999, 0)).toBe("ok");
    expect(budgetLevel(999999, NaN)).toBe("ok");
  });
});
