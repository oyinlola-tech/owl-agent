import { describe, expect, it } from "vitest";
import { describeEvent } from "./verificationState.helper";

describe("describeEvent", () => {
  it("only says a check passed when the runtime reported status passed", () => {
    expect(describeEvent("verification.requirement.completed", { command: "pytest", status: "passed", duration_ms: 1800 }))
      .toBe("✓ pytest passed in 1.8s");
    expect(describeEvent("verification.requirement.completed", { command: "npm run typecheck", status: "failed", exit_code: 2 }))
      .toBe("✕ npm run typecheck failed with exit code 2");
    expect(describeEvent("verification.requirement.completed", { command: "pytest", status: "timeout" })).toBe("✕ pytest timed out");
    expect(describeEvent("verification.started", {})).toBe("OWL finished the implementation and is independently verifying it.");
    expect(describeEvent("verification.failed", { attempt: 1, max_attempts: 3 }))
      .toBe("OWL is reviewing the actual error output before continuing.");
    expect(describeEvent("verification.completed", { verified: false, reason: "No reliable project verification command was detected." }))
      .not.toMatch(/passed/);
    expect(describeEvent("task.completed", { summary: "All tests passed." })).toBeNull();
  });
});
