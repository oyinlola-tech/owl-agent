import { describe, expect, it } from "vitest";
import { buildHunksFromTexts, composeAcceptedText, parseUnifiedDiff } from "./diffHunks.helper";

describe("parseUnifiedDiff", () => {
  it("returns no hunks for an empty diff", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
  });

  it("parses hunk headers with added, removed, and context lines", () => {
    const hunks = parseUnifiedDiff(
      "@@ -1,4 +1,4 @@\n line one\n-old two\n+new two\n line three\n line four\n",
    );
    expect(hunks).toHaveLength(1);
    expect(hunks[0].header).toBe("@@ -1,4 +1,4 @@");
    expect(hunks[0].lines.map((line) => line.kind)).toEqual(["context", "del", "add", "context", "context"]);
    expect(hunks[0].lines.map((line) => line.text)).toEqual(["line one", "old two", "new two", "line three", "line four"]);
  });

  it("splits multiple hunks and numbers lines per hunk", () => {
    const hunks = parseUnifiedDiff(
      "@@ -1,2 +1,2 @@\n a\n-b\n+B\n@@ -10,2 +10,2 @@\n x\n-y\n+Y\n",
    );
    expect(hunks).toHaveLength(2);
    expect(hunks[1].index).toBe(1);
    expect(hunks[1].lines[1]).toMatchObject({ kind: "del", text: "y", oldLine: 11, newLine: null });
    expect(hunks[1].lines[2]).toMatchObject({ kind: "add", text: "Y", oldLine: null, newLine: 11 });
  });

  it("defaults missing hunk counts to one and skips file headers", () => {
    const hunks = parseUnifiedDiff(
      "diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -3 +3 @@\n-old\n+new\n",
    );
    expect(hunks).toHaveLength(1);
    expect(hunks[0].oldCount).toBe(1);
    expect(hunks[0].newCount).toBe(1);
    expect(hunks[0].lines.map((line) => line.kind)).toEqual(["del", "add"]);
  });

  it("skips the no-newline marker", () => {
    const hunks = parseUnifiedDiff("@@ -1,1 +1,1 @@\n-old\n\\ No newline at end of file\n+new\n");
    expect(hunks[0].lines.map((line) => line.kind)).toEqual(["del", "add"]);
  });
});

describe("buildHunksFromTexts", () => {
  it("returns no hunks for identical texts", () => {
    expect(buildHunksFromTexts("a\nb\n", "a\nb\n")).toEqual([]);
  });

  it("groups a single change with context lines", () => {
    const hunks = buildHunksFromTexts("a\nb\nc\nd\ne\nf\ng", "a\nb\nc\nB\ne\nf\ng");
    expect(hunks).toHaveLength(1);
    expect(hunks[0].lines.map((line) => line.kind)).toEqual(["context", "context", "context", "del", "add", "context", "context", "context"]);
  });

  it("splits distant changes into separate hunks", () => {
    const before = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"].join("\n");
    const after = ["1", "ONE", "3", "4", "5", "6", "7", "8", "9", "10", "11", "TWELVE"].join("\n");
    const hunks = buildHunksFromTexts(before, after, 1);
    expect(hunks).toHaveLength(2);
    expect(hunks[0].header).toContain("-1,");
    expect(hunks[1].header).toContain("+11,");
  });

  it("represents a brand-new file as additions only", () => {
    const hunks = buildHunksFromTexts("", "line one\nline two");
    expect(hunks).toHaveLength(1);
    expect(hunks[0].oldCount).toBe(0);
    expect(hunks[0].lines.every((line) => line.kind === "add")).toBe(true);
  });
});

describe("composeAcceptedText", () => {
  const before = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"].join("\n");
  const after = ["1", "ONE", "3", "4", "5", "6", "7", "8", "9", "10", "11", "TWELVE"].join("\n");
  const hunks = buildHunksFromTexts(before, after, 1);

  it("reproduces the new text when every hunk is selected", () => {
    expect(composeAcceptedText(before, hunks, hunks.map(() => true))).toBe(after);
  });

  it("reproduces the old text when no hunk is selected", () => {
    expect(composeAcceptedText(before, hunks, hunks.map(() => false))).toBe(before);
  });

  it("applies only the selected hunk", () => {
    expect(hunks.length).toBeGreaterThan(1);
    const composed = composeAcceptedText(before, hunks, [true, false]);
    expect(composed).toContain("ONE");
    expect(composed).toContain("12");
    expect(composed).not.toContain("TWELVE");
  });

  it("treats a missing selection as selected", () => {
    expect(composeAcceptedText(before, hunks, [])).toBe(after);
  });

  it("returns the input unchanged when there are no hunks", () => {
    expect(composeAcceptedText(before, [], [])).toBe(before);
  });
});
