import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { VerificationPanel } from "./verificationPanel.component";
import { verificationState } from "./verificationState.helper";
import { SAMPLE_VERIFICATION } from "../../../services/samples/sampleVerification.data";
import type { VerificationRun } from "../../../services/agentApi.types";

afterEach(cleanup);

const verified = SAMPLE_VERIFICATION.tsk_1be4470a;
const unverified = SAMPLE_VERIFICATION.tsk_9d33b2f8;
const failing = SAMPLE_VERIFICATION.tsk_3e91a0b5;

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
