import { create } from "zustand";
import { agentApi } from "../../services/agentApi.service";
import type { OnboardingStep, UserProfile } from "../../services/agentApi.types";
import { readStoredValue, writeStoredValue } from "../../../shared/helpers/storage.helper";
import { EMPTY_PROFILE } from "../system/settings/profile/profile.hook";
import { ONBOARDING_STEP_ORDER } from "./stepFlow.data";

const COMPLETED_KEY = "owl-onboarding-completed";
const STEP_KEY = "owl-onboarding-step";

type OnboardingStatus = "unknown" | "checking" | "active" | "hidden";

interface OnboardingState {
  status: OnboardingStatus;
  stepIndex: number;
  profileDraft: UserProfile;
  profileSaved: boolean;
  providerConfigured: boolean;
  projectName: string;
  skipped: OnboardingStep[];
  setStepIndex: (index: number) => void;
  goNext: () => void;
  goBack: () => void;
  setProfileDraft: (profile: UserProfile) => void;
  setProfileSaved: (saved: boolean) => void;
  setProviderConfigured: (configured: boolean) => void;
  setProjectName: (name: string) => void;
  markSkipped: (step: OnboardingStep) => void;
  finish: () => void;
}

function readSavedStep(): number {
  const raw = Number(readStoredValue(STEP_KEY));
  return Number.isInteger(raw) && raw >= 0 && raw < ONBOARDING_STEP_ORDER.length ? raw : 0;
}

export function isOnboardingCompletedLocally(): boolean {
  return readStoredValue(COMPLETED_KEY) === "1";
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  status: "unknown",
  stepIndex: readSavedStep(),
  profileDraft: { ...EMPTY_PROFILE },
  profileSaved: false,
  providerConfigured: false,
  projectName: "",
  skipped: [],
  setStepIndex: (index) => { writeStoredValue(STEP_KEY, String(index)); set({ stepIndex: index }); },
  goNext: () => {
    const next = Math.min(get().stepIndex + 1, ONBOARDING_STEP_ORDER.length - 1);
    writeStoredValue(STEP_KEY, String(next));
    set({ stepIndex: next });
  },
  goBack: () => {
    const prev = Math.max(get().stepIndex - 1, 0);
    writeStoredValue(STEP_KEY, String(prev));
    set({ stepIndex: prev });
  },
  setProfileDraft: (profileDraft) => set({ profileDraft }),
  setProfileSaved: (profileSaved) => set({ profileSaved }),
  setProviderConfigured: (providerConfigured) => set({ providerConfigured }),
  setProjectName: (projectName) => set({ projectName }),
  markSkipped: (step) => set((state) => (state.skipped.includes(step) ? state : { skipped: [...state.skipped, step] })),
  finish: () => {
    writeStoredValue(COMPLETED_KEY, "1");
    set({ status: "hidden" });
  },
}));

export function restartOnboarding(): void {
  writeStoredValue(COMPLETED_KEY, "0");
  writeStoredValue(STEP_KEY, "0");
  useOnboardingStore.setState({ status: "active", stepIndex: 0, skipped: [] });
}

async function refineFromService(): Promise<void> {
  try {
    const [onboarding, profile, providers] = await Promise.all([
      agentApi.onboarding(), agentApi.profile(), agentApi.providers(),
    ]);
    if (onboarding.completed) {
      writeStoredValue(COMPLETED_KEY, "1");
      useOnboardingStore.setState({ status: "hidden" });
      return;
    }
    if (providers.active === "mock") {
      useOnboardingStore.setState({ status: "hidden" });
      return;
    }
    const resumeIndex = Math.max(0, ONBOARDING_STEP_ORDER.indexOf(onboarding.step));
    useOnboardingStore.setState((state) => ({
      status: "active",
      stepIndex: state.stepIndex || resumeIndex,
      providerConfigured: onboarding.provider_configured,
      profileDraft: profile.is_empty ? state.profileDraft : { ...state.profileDraft, ...stripReadMeta(profile) },
      profileSaved: !profile.is_empty,
    }));
  } catch {
    useOnboardingStore.setState((state) => (state.status === "checking" ? { status: "hidden" } : state));
  }
}

function stripReadMeta(profile: UserProfile): UserProfile {
  return {
    display_name: profile.display_name, role: profile.role, experience: profile.experience,
    languages: profile.languages, package_managers: profile.package_managers, code_style: profile.code_style,
    test_framework: profile.test_framework, commit_style: profile.commit_style, tone: profile.tone,
    projects_folder: profile.projects_folder,
  };
}

export function ensureOnboardingChecked(): void {
  const { status } = useOnboardingStore.getState();
  if (status !== "unknown") return;
  if (isOnboardingCompletedLocally()) {
    useOnboardingStore.setState({ status: "hidden" });
    return;
  }
  useOnboardingStore.setState({ status: "checking" });
  void refineFromService();
}
