import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PlanEditor, type EditablePlanStep } from "./planEditor.component";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const steps: EditablePlanStep[] = [
  { title: "Draft the migration", summary: "Outline tables", status: "pending" },
  { title: "Run the checks", status: "done" },
];

function renderEditor(taskStatus = "paused", onSaved = () => {}) {
  render(<PlanEditor taskId="task-1" taskStatus={taskStatus} steps={steps} onSaved={onSaved} />);
}

describe("PlanEditor", () => {
  it("lists plan steps with an enabled edit button while paused", () => {
    renderEditor();
    expect(screen.getByText("Draft the migration")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit plan" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Edit plan" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables editing with an explanation while the task runs", () => {
    renderEditor("running");
    expect((screen.getByRole("button", { name: "Edit plan" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Pause the task to reorder or rewrite its plan.")).toBeTruthy();
  });

  it("reorders steps with move up", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Move step 2 up" }));
    expect((screen.getByLabelText("Step 1 title") as HTMLInputElement).value).toBe("Run the checks");
    expect((screen.getByLabelText("Step 2 title") as HTMLInputElement).value).toBe("Draft the migration");
  });

  it("deletes a step and adds a new one", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete step 1" }));
    expect(screen.queryByLabelText("Step 2 title")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    expect(screen.getByLabelText("Step 2 title")).toBeTruthy();
  });

  it("discards edits on cancel", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit plan" }));
    fireEvent.change(screen.getByLabelText("Step 1 title"), { target: { value: "Rewritten" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Draft the migration")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save plan" })).toBeNull();
  });

  it("saves the reordered plan and notifies the parent", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ task: {}, steps: [] }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();
    renderEditor("paused", onSaved);
    fireEvent.click(screen.getByRole("button", { name: "Edit plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Move step 2 up" }));
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8000/tasks/task-1/plan");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({
      steps: [
        { title: "Run the checks", summary: "" },
        { title: "Draft the migration", summary: "Outline tables" },
      ],
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  });

  it("refuses to save when a title is blank", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit plan" }));
    fireEvent.change(screen.getByLabelText("Step 1 title"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
