import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CostDashboard } from "../costDashboard.component";
import { BUDGET_STORAGE_KEY } from "../costTotals.helper";
import type { UsageRow } from "../../../../services/agentApi.types";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

function row(overrides: Partial<UsageRow> = {}): UsageRow {
  return {
    id: 1, task_id: "task-1", model: "anthropic/claude-opus", requested_model: "auto",
    routing_reason: "code", input_tokens: 800, output_tokens: 200, estimated: 0,
    duration_ms: 1200, retries: 0, error: "", created_at: new Date().toISOString(), ...overrides,
  };
}

const baseProps = {
  tasksById: {},
  onOpenTask: vi.fn(),
  onRetry: vi.fn(),
} as const;

describe("CostDashboard", () => {
  it("shows loading states while usage loads", () => {
    render(<CostDashboard {...baseProps} usage={[]} loading error={null} offline={false} />);
    expect(screen.getAllByText("Loading usage…").length).toBeGreaterThan(0);
  });

  it("shows empty states with no sample data when there are no usage rows", () => {
    render(<CostDashboard {...baseProps} usage={[]} loading={false} error={null} offline={false} />);
    expect(screen.getByText("No usage recorded yet. Run a task to see per-model spend.")).toBeTruthy();
    expect(screen.getByText("No task spend recorded yet.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("Token counts only, not dollars. Provider billing may differ.")).toBeTruthy();
  });

  it("shows error state with retry", () => {
    const onRetry = vi.fn();
    render(<CostDashboard {...baseProps} onRetry={onRetry} usage={[]} loading={false} error="Couldn't load usage" offline={false} />);
    expect(screen.getAllByText(/Couldn't load usage/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Retry" })[0]);
    expect(onRetry).toHaveBeenCalled();
  });

  it("shows the offline state", () => {
    render(<CostDashboard {...baseProps} usage={[]} loading={false} error={null} offline />);
    expect(screen.getByText(/You're offline. Showing the last loaded usage./)).toBeTruthy();
  });

  it("groups per-model totals with share % and flags measurement per task", () => {
    const usage = [
      row({ id: 1, task_id: "task-1", model: "anthropic/claude-opus", input_tokens: 300, output_tokens: 100, estimated: 0 }),
      row({ id: 2, task_id: "task-2", model: "openai/gpt-5", input_tokens: 100, output_tokens: 100, estimated: 1 }),
    ];
    render(<CostDashboard {...baseProps} usage={usage} loading={false} error={null} offline={false} />);
    const modelTable = screen.getByRole("table", { name: "Tokens by model" });
    expect(modelTable.getAttribute("aria-label")).toBe("Tokens by model");
    expect(screen.getAllByText("claude-opus").length).toBeGreaterThan(0);
    expect(screen.getByText("67%")).toBeTruthy();
    const taskTable = screen.getByRole("table", { name: "Spend by task" });
    expect(taskTable).toBeTruthy();
    expect(screen.getAllByText("Measured").length).toBeGreaterThan(0);
    expect(screen.getByText("Estimated")).toBeTruthy();
  });

  it("warns at 80% and hard-warns at 100% without blocking", () => {
    localStorage.setItem(BUDGET_STORAGE_KEY, "1000");
    const warnUsage = [row({ input_tokens: 700, output_tokens: 100 })];
    const { unmount } = render(<CostDashboard {...baseProps} usage={warnUsage} loading={false} error={null} offline={false} />);
    expect(screen.getByRole("alert").textContent).toMatch(/Approaching monthly budget/);
    expect(screen.getByText(/never block model calls/)).toBeTruthy();
    unmount();
    cleanup();
    localStorage.setItem(BUDGET_STORAGE_KEY, "1000");
    const overUsage = [row({ input_tokens: 900, output_tokens: 200 })];
    render(<CostDashboard {...baseProps} usage={overUsage} loading={false} error={null} offline={false} />);
    expect(screen.getByRole("alert").textContent).toMatch(/Monthly budget reached/);
  });

  it("edits and persists the local-only budget cap", () => {
    render(<CostDashboard {...baseProps} usage={[]} loading={false} error={null} offline={false} />);
    const input = screen.getByLabelText("Monthly token budget");
    fireEvent.change(input, { target: { value: "2000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save budget" }));
    expect(localStorage.getItem(BUDGET_STORAGE_KEY)).toBe("2000000");
    expect(screen.getByText(/Stored only in this browser/)).toBeTruthy();
  });
});
