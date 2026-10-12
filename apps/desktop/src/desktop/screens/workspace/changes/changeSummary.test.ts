import { describe, expect, it } from "vitest";
import { describeChangeDecisions, summarizeChangeDecisions } from "./changeSummary.helper";
import type { ChangeFile } from "../../../state/workspace.types";

const threeChanges: ChangeFile[] = ["a.go", "b.go", "c.go"].map((path) => ({ path, status: "M", before: "", after: "" }));

describe("change review summary", () => {
  it("counts every file as to review before any decision", () => {
    const summary = summarizeChangeDecisions(threeChanges, {});
    expect(summary).toEqual({ accepted: 0, rejected: 0, pending: 3 });
    expect(describeChangeDecisions(summary)).toBe("0 accepted · 3 to review");
  });

  it("does not count rejected files as still to review", () => {
    const summary = summarizeChangeDecisions(threeChanges, { "a.go": "accepted", "b.go": "rejected" });
    expect(summary).toEqual({ accepted: 1, rejected: 1, pending: 1 });
    expect(describeChangeDecisions(summary)).toBe("1 accepted · 1 rejected · 1 to review");
  });

  it("treats a decision reset to pending as to review again", () => {
    const summary = summarizeChangeDecisions(threeChanges, { "a.go": "pending", "b.go": "accepted", "c.go": "accepted" });
    expect(describeChangeDecisions(summary)).toBe("2 accepted · 1 to review");
  });
});
