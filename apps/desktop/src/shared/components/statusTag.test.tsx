import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StatusTag, isFinishedStatus, hueForStatus } from "./statusTag.component";

afterEach(cleanup);

describe("StatusTag", () => {
  it("labels the two Phase 5.1 completion states distinctly", () => {
    render(<><StatusTag status="completed_unverified" /><StatusTag status="verified_completed" /><StatusTag status="completed" /></>);
    expect(screen.getByText("Completed, not verified")).toBeTruthy();
    expect(screen.getByText("Verified")).toBeTruthy();
    expect(screen.getByText("Completed")).toBeTruthy();
  });

  it("colors verified green and unverified yellow", () => {
    expect(hueForStatus("verified_completed")).toBe("green");
    expect(hueForStatus("completed_unverified")).toBe("yellow");
  });

  it("treats every completion state as done, and nothing else", () => {
    for (const s of ["completed", "completed_unverified", "verified_completed"]) expect(isFinishedStatus(s)).toBe(true);
    for (const s of ["running", "paused", "failed", "cancelled", "awaiting_approval"]) expect(isFinishedStatus(s)).toBe(false);
  });
});
