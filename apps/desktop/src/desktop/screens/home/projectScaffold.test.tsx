import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { StackRecommendation } from "../../services/agentApi.types";

const { mockRecommend } = vi.hoisted(() => ({ mockRecommend: vi.fn() }));

vi.mock("../../services/agentApi.service", () => ({
  agentApi: {
    recommendStack: mockRecommend,
    createProject: vi.fn(),
    runProjectCommand: vi.fn(),
    gitSummary: vi.fn(),
    gitCommit: vi.fn(),
    generateCommitMessage: vi.fn(),
    getProject: vi.fn(),
  },
}));

vi.mock("../../services/folderPicker.service", () => ({
  canPickFolderNatively: () => false,
  pickProjectFolder: vi.fn().mockResolvedValue(null),
}));

import { StackAdvisorComponent } from "./stackAdvisor.component";
import { scaffoldStepList } from "./projectScaffold.component";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function rec(overrides: Partial<StackRecommendation> = {}): StackRecommendation {
  return {
    stack: { id: "vite-react-ts", name: "Vite + React + TS", languages: ["TypeScript"], frameworks: ["React"] },
    fit_score: 0.9,
    why: "Fast single-page apps.",
    tradeoffs: ["Needs Node 20"],
    vs_runner_up: "Beats plain Vite.",
    starter_command: "npm create vite@latest my-app -- --template react-ts",
    verification_commands: ["npm test"],
    owl_support: "Full",
    experience_note: "",
    ...overrides,
  };
}

describe("scaffoldStepList", () => {
  it("describes the approval-gated starter, git, and open steps", () => {
    const steps = scaffoldStepList(rec());
    expect(steps.map((s) => s.id)).toEqual(["starter", "git", "open"]);
    expect(steps[0].detail).toContain("npm create vite@latest");
    expect(steps[1].title).toMatch(/git/i);
    expect(steps[2].title).toMatch(/open/i);
  });

  it("notes stacks without a starter command", () => {
    const steps = scaffoldStepList(rec({ starter_command: "" }));
    expect(steps[0].detail).toMatch(/no starter command/i);
  });
});

describe("StackAdvisor scaffold flow", () => {
  it("offers a scaffold panel after Pick with folder and step controls", async () => {
    mockRecommend.mockResolvedValue({ ranked_by: "rules", recommendations: [rec()] });
    const onPick = vi.fn();
    render(<StackAdvisorComponent onPick={onPick} />);
    fireEvent.change(screen.getByLabelText("Project description"), { target: { value: "small dashboard" } });
    fireEvent.click(screen.getByRole("button", { name: "Recommend a stack" }));
    await waitFor(() => expect(screen.getByText("Vite + React + TS")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Pick Vite + React + TS" }));
    expect(onPick).toHaveBeenCalledWith("vite-react-ts");
    expect(screen.getByRole("region", { name: "Scaffold Vite + React + TS project" })).toBeTruthy();
    expect(screen.getByLabelText("Scaffold project folder")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Create project folder entry" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Step 1: Run the starter command/)).toBeTruthy();
    expect(screen.getByText(/Step 2: Initialise git and commit/)).toBeTruthy();
    expect(screen.getByText(/Step 3: Open the project/)).toBeTruthy();
  });

  it("shows the empty starter state when the stack ships no command", async () => {
    mockRecommend.mockResolvedValue({ ranked_by: "rules", recommendations: [rec({ starter_command: "" })] });
    render(<StackAdvisorComponent onPick={() => {}} />);
    fireEvent.change(screen.getByLabelText("Project description"), { target: { value: "api" } });
    fireEvent.click(screen.getByRole("button", { name: "Recommend a stack" }));
    await waitFor(() => expect(screen.getByText("Vite + React + TS")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Pick Vite + React + TS" }));
    expect(screen.getByText("No starter command ships with this stack. Skip to git once the folder is ready.")).toBeTruthy();
  });

  it("surfaces recommendation failures with a retry", async () => {
    mockRecommend.mockRejectedValueOnce(new Error("service down"));
    render(<StackAdvisorComponent onPick={() => {}} />);
    fireEvent.change(screen.getByLabelText("Project description"), { target: { value: "api" } });
    fireEvent.click(screen.getByRole("button", { name: "Recommend a stack" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toMatch(/service down/);
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
