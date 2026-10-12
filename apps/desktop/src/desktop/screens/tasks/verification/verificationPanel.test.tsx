import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { VerificationPanel } from "./verificationPanel.component";
import { verificationState } from "./verificationState.helper";
import type { VerificationRequirement, VerificationRun, VerificationSummary } from "../../../services/agentApi.types";

afterEach(cleanup);

function requirement(id: string, kind: VerificationRequirement["kind"], argv: string[], required = true): VerificationRequirement {
  return { id, kind, argv, cwd: ".", source: "project_manifest", detail: `${kind} check`, required, timeout: 600, safe: true, unsafe_reason: "" };
}

function run(req: VerificationRequirement, attempt: number, status: VerificationRun["status"], exitCode: number | null, stdout: string): VerificationRun {
  return {
    id: `${req.id}-${attempt}`, task_id: "t", requirement_id: req.id, kind: req.kind, command: req.argv,
    working_directory: "/tmp/project", status, exit_code: exitCode, stdout, stderr: "", required: req.required,
    source: req.source, source_detail: req.detail, attempt, started_at: "2026-01-01T00:00:00Z",
    completed_at: status === "running" ? null : "2026-01-01T00:00:05Z", duration_ms: status === "running" ? null : 380, error: "", created_at: "2026-01-01T00:00:00Z",
  };
}

const typecheck = requirement("req-typecheck", "typecheck", ["pnpm", "run", "typecheck"]);
const tests = requirement("req-tests", "tests", ["pnpm", "run", "test"]);
const lint = requirement("req-lint", "lint", ["pnpm", "run", "lint"], false);

const verified: { verification: VerificationSummary; verifications: VerificationRun[] } = {
  verification: { status: "verified_completed", verified: true, verified_at: "2026-01-01T00:00:05Z", note: "", attempts: 1, max_attempts: 3, requirements: [typecheck, tests, lint] },
  verifications: [run(typecheck, 1, "passed", 0, "ok"), run(tests, 1, "passed", 0, "9 passed"), run(lint, 1, "passed", 0, "clean")],
};
const unverified: { verification: VerificationSummary; verifications: VerificationRun[] } = {
  verification: { status: "completed_unverified", verified: false, verified_at: null, note: "No reliable project verification command was detected.", attempts: 0, max_attempts: 3, requirements: [] },
  verifications: [],
};
const pytest = requirement("req-pytest", "tests", [".venv/bin/python", "-m", "pytest", "-q"]);
const pyLint = requirement("req-pylint", "lint", [".venv/bin/python", "-m", "ruff", "check", "."], false);
const failing: { verification: VerificationSummary; verifications: VerificationRun[] } = {
  verification: { status: "running", verified: false, verified_at: null, note: "Required checks not passing: pytest", attempts: 2, max_attempts: 3, requirements: [pytest, pyLint] },
  verifications: [run(pytest, 1, "failed", 1, "1 failed, 5 passed in 0.41s"), run(pytest, 2, "failed", 1, "1 failed, 5 passed in 0.38s")],
};

describe("VerificationPanel", () => {
  it("shows a verified task with every check passing", () => {
    render(<VerificationPanel taskStatus="verified_completed" summary={verified.verification} runs={verified.verifications} />);
    expect(screen.getByText("Verified")).toBeTruthy();
    expect(screen.getByText(/OWL ran 3 checks itself and every required one passed/)).toBeTruthy();
    expect(screen.getAllByText("Passed")).toHaveLength(3);
    expect(screen.getByText("pnpm run test")).toBeTruthy();
  });

  it("explains why a completed task is not verified", () => {
    render(<VerificationPanel taskStatus="completed_unverified" summary={unverified.verification} runs={[]} />);
    expect(screen.getByText("Completed, not verified")).toBeTruthy();
    expect(screen.getByText("No reliable project verification command was detected.")).toBeTruthy();
    expect(screen.queryByText("Passed")).toBeNull();
  });

  it("shows a failed check with its exit code, attempt, and expandable output", () => {
    render(<VerificationPanel taskStatus="running" summary={failing.verification} runs={failing.verifications} />);
    expect(screen.getByText("Verification failed")).toBeTruthy();
    expect(screen.getByText(/exited with code 1/)).toBeTruthy();
    expect(screen.getByText(/attempt 2 of 3/)).toBeTruthy();
    expect(screen.getByText(/1 failed, 5 passed in 0.38s/)).toBeTruthy();
    const row = screen.getByRole("button", { name: /Tests/ });
    expect(row.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(row);
    expect(screen.queryByText(/1 failed, 5 passed in 0.38s/)).toBeNull();
    fireEvent.click(row);
    expect(screen.getByText(/1 failed, 5 passed in 0.38s/)).toBeTruthy();
    expect(screen.getByText("Not run")).toBeTruthy();
  });

  it("shows a running requirement as running, never as passed", () => {
    const running: VerificationRun = { ...failing.verifications[1], id: "live", attempt: 3, status: "running", exit_code: null,
      completed_at: null, duration_ms: null, stdout: "", stderr: "" };
    render(<VerificationPanel taskStatus="running" summary={{ ...failing.verification, attempts: 3 }} runs={[...failing.verifications, running]} />);
    expect(screen.getByText("Verifying")).toBeTruthy();
    expect(screen.getAllByText("Running").length).toBeGreaterThan(0);
    expect(screen.queryByText("Passed")).toBeNull();
    expect(verificationState("running", failing.verification, [running])).toBe("running");
  });
});
