import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { agentApi } from "../../services/agentApi.service";
import { useAppStore } from "../../state/app.store";
import { useOnboardingStore } from "./onboarding.state";
import { ONBOARDING_STEP_ORDER, canContinueFromStep, canSkipStep, stepAt } from "./stepFlow.data";
import { CompactRail, ProgressRail } from "./progressRail.component";
import { WelcomeStep, DoneStep } from "./steps/welcomeSteps.step";
import { AboutYouStep } from "./steps/aboutYouStep.step";
import { ConnectModelStep } from "./steps/connectModelStep.step";
import { FirstProjectStep } from "./steps/firstProjectStep.step";
import { SafetyStep } from "./steps/safetyStep.step";
import "./onboarding.style.css";

function StepBody({ index }: { index: number }) {
  const profileConfigured = useOnboardingStore((s) => s.providerConfigured);
  const profileName = useOnboardingStore((s) => s.profileDraft.display_name);
  const projectName = useOnboardingStore((s) => s.projectName);
  switch (ONBOARDING_STEP_ORDER[index]) {
    case "welcome": return <WelcomeStep />;
    case "about_you": return <AboutYouStep />;
    case "connect_model": return <ConnectModelStep />;
    case "first_project": return <FirstProjectStep />;
    case "safety_check": return <SafetyStep />;
    default: return <DoneStep name={profileName} providerConfigured={profileConfigured} projectName={projectName} />;
  }
}

export function OnboardingScreen() {
  const store = useOnboardingStore();
  const notify = useAppStore((s) => s.showNotice);
  const setDraft = useAppStore((s) => s.setDraft);
  const goToScreen = useAppStore((s) => s.goToScreen);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const step = stepAt(store.stepIndex);
  const context = { profile: store.profileDraft, providerConfigured: store.providerConfigured, projectName: store.projectName };
  const canContinue = canContinueFromStep(store.stepIndex, context);
  const isLast = store.stepIndex === ONBOARDING_STEP_ORDER.length - 1;

  useEffect(() => { headingRef.current?.focus(); }, [store.stepIndex]);

  const recordProgress = (completed: boolean) => {
    void agentApi.saveOnboarding({ step: step.id, completed, skipped_steps: store.skipped }).catch(() => undefined);
  };

  const commitCurrentStep = async () => {
    if (step.id === "about_you") {
      try { await agentApi.saveProfile(store.profileDraft); store.setProfileSaved(true); }
      catch { notify("Kept your details here. OWL will save them when the service is reachable."); }
    }
  };

  const finishSetup = () => {
    recordProgress(true);
    store.finish();
    const folder = store.projectName.trim();
    if (folder) {
      setDraft("Give me a short tour of this project and suggest a good first task.");
      void agentApi.createProject(folder)
        .then((result) => { useAppStore.getState().openProject(result.project); })
        .catch(() => { goToScreen("welcome"); notify("Couldn't open that folder — add a project from the workspace."); });
      notify("Setup complete. Welcome to OWL.");
      return;
    }
    goToScreen("welcome");
    notify("Setup complete. Welcome to OWL.");
  };

  const advance = async () => {
    if (!canContinue) return;
    if (isLast) { finishSetup(); return; }
    await commitCurrentStep();
    recordProgress(false);
    store.goNext();
  };

  const skip = () => {
    store.markSkipped(step.id);
    recordProgress(false);
    if (isLast) finishSetup(); else store.goNext();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const tag = (event.target as HTMLElement).tagName;
    if (event.key === "Enter" && !["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag) && canContinue) {
      event.preventDefault();
      void advance();
    }
  };

  return (
    <div className="ob-root" onKeyDown={onKeyDown}>
      <ProgressRail currentIndex={store.stepIndex} onSelect={(index) => store.setStepIndex(index)} />
      <div className="ob-main">
        <CompactRail currentIndex={store.stepIndex} />
        <div className="ob-scroll">
          <div className="ob-panel">
            <p className="ob-eyebrow">Step {store.stepIndex + 1} of {ONBOARDING_STEP_ORDER.length}</p>
            <h1 className="ob-title" ref={headingRef} tabIndex={-1}>{step.title}</h1>
            <p className="ob-lede">{step.lede}</p>
            <div className="ob-content">
              <StepBody index={store.stepIndex} />
            </div>
          </div>
        </div>
        <footer className="ob-foot">
          <button className="btn btn-ghost" onClick={() => store.goBack()} disabled={store.stepIndex === 0}>
            <ArrowLeft size={15} /> Back
          </button>
          <div className="ob-foot-right">
            {canSkipStep(store.stepIndex) && !canContinue && (
              <button className="btn btn-ghost" onClick={skip}>Set up later</button>
            )}
            <button className="btn btn-primary" onClick={() => void advance()} disabled={!canContinue}>
              {step.continueLabel ?? "Continue"} {!isLast && <ArrowRight size={15} />}
            </button>
          </div>
        </footer>
      </div>
      <div className="sr-only" role="status" aria-live="polite">{`Step ${store.stepIndex + 1} of ${ONBOARDING_STEP_ORDER.length}: ${step.title}`}</div>
    </div>
  );
}
