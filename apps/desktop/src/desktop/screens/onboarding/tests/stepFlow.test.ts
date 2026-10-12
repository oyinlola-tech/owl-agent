import { describe, expect, it } from "vitest";
import {
  ONBOARDING_STEPS, ONBOARDING_STEP_ORDER, canContinueFromStep, canSkipStep, stepAt,
  type StepContext,
} from "../stepFlow.data";
import { EMPTY_PROFILE } from "../../system/settings/profile/profile.hook";

function context(overrides: Partial<StepContext> = {}): StepContext {
  return { profile: { ...EMPTY_PROFILE }, providerConfigured: false, projectName: "", ...overrides };
}

const indexOf = (id: string) => ONBOARDING_STEP_ORDER.indexOf(id as (typeof ONBOARDING_STEP_ORDER)[number]);

describe("onboarding step order", () => {
  it("matches the six backend steps in order", () => {
    expect(ONBOARDING_STEP_ORDER).toEqual(["welcome", "about_you", "connect_model", "first_project", "safety_check", "done"]);
    expect(ONBOARDING_STEPS.map((step) => step.id)).toEqual(ONBOARDING_STEP_ORDER);
  });
});

describe("welcome and safety steps", () => {
  it("are always continuable and never skippable", () => {
    expect(canContinueFromStep(indexOf("welcome"), context())).toBe(true);
    expect(canSkipStep(indexOf("welcome"))).toBe(false);
    expect(canContinueFromStep(indexOf("safety_check"), context())).toBe(true);
    expect(canSkipStep(indexOf("safety_check"))).toBe(false);
  });
});

describe("about you step", () => {
  const index = indexOf("about_you");
  it("needs a name to continue but can be set up later", () => {
    expect(canContinueFromStep(index, context())).toBe(false);
    expect(canContinueFromStep(index, context({ profile: { ...EMPTY_PROFILE, display_name: "  " } }))).toBe(false);
    expect(canContinueFromStep(index, context({ profile: { ...EMPTY_PROFILE, display_name: "Ada" } }))).toBe(true);
    expect(canSkipStep(index)).toBe(true);
  });
});

describe("connect model step", () => {
  const index = indexOf("connect_model");
  it("continues only once a provider is configured, and can be skipped", () => {
    expect(canContinueFromStep(index, context())).toBe(false);
    expect(canContinueFromStep(index, context({ providerConfigured: true }))).toBe(true);
    expect(canSkipStep(index)).toBe(true);
  });
});

describe("first project step", () => {
  const index = indexOf("first_project");
  it("needs a folder but can be skipped", () => {
    expect(canContinueFromStep(index, context())).toBe(false);
    expect(canContinueFromStep(index, context({ projectName: "~/Projects/app" }))).toBe(true);
    expect(canSkipStep(index)).toBe(true);
  });
});

describe("done step", () => {
  it("uses the finish label and completes the flow", () => {
    const done = stepAt(indexOf("done"));
    expect(done.continueLabel).toBe("Open OWL");
    expect(canContinueFromStep(indexOf("done"), context())).toBe(true);
  });
});
