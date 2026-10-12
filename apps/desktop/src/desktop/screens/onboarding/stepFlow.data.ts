import type { OnboardingStep, UserProfile } from "../../services/agentApi.types";

export const ONBOARDING_STEP_ORDER: OnboardingStep[] = [
  "welcome", "about_you", "connect_model", "first_project", "safety_check", "done",
];

export interface StepContext {
  profile: UserProfile;
  providerConfigured: boolean;
  projectName: string;
}

export interface StepMeta {
  id: OnboardingStep;
  railLabel: string;
  title: string;
  lede: string;
  allowSkip: boolean;
  continueLabel?: string;
  isValid: (context: StepContext) => boolean;
}

export function hasDisplayName(context: StepContext): boolean {
  return context.profile.display_name.trim().length > 0;
}

export function hasActiveProvider(context: StepContext): boolean {
  return context.providerConfigured;
}

export function hasChosenProject(context: StepContext): boolean {
  return context.projectName.trim().length > 0;
}

export const ONBOARDING_STEPS: StepMeta[] = [
  {
    id: "welcome", railLabel: "Welcome", title: "Meet OWL",
    lede: "An AI engineer that shows its work and waits for your approval.",
    allowSkip: false, continueLabel: "Get started", isValid: () => true,
  },
  {
    id: "about_you", railLabel: "About you", title: "A little about you",
    lede: "OWL uses this to greet you and to shape how it plans and writes code. Nothing here leaves your computer.",
    allowSkip: true, isValid: hasDisplayName,
  },
  {
    id: "connect_model", railLabel: "Connect a model", title: "Connect a model",
    lede: "OWL runs on the provider you choose. Add a cloud key or a model running on this computer.",
    allowSkip: true, isValid: hasActiveProvider,
  },
  {
    id: "first_project", railLabel: "First project", title: "Your first project",
    lede: "Point OWL at a folder on your computer. It reads the stack and the checks it can run — it never writes without your yes.",
    allowSkip: true, isValid: hasChosenProject,
  },
  {
    id: "safety_check", railLabel: "Safety check", title: "How OWL keeps you safe",
    lede: "Here is exactly what is protected on this machine right now.",
    allowSkip: false, isValid: () => true,
  },
  {
    id: "done", railLabel: "Done", title: "You're set up",
    lede: "Here is what OWL knows. You can change any of it later in Settings.",
    allowSkip: false, continueLabel: "Open OWL", isValid: () => true,
  },
];

export function stepAt(index: number): StepMeta {
  return ONBOARDING_STEPS[Math.max(0, Math.min(index, ONBOARDING_STEPS.length - 1))];
}

export function canContinueFromStep(index: number, context: StepContext): boolean {
  return stepAt(index).isValid(context);
}

export function canSkipStep(index: number): boolean {
  return stepAt(index).allowSkip;
}
