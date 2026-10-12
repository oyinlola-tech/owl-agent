import { Check } from "@phosphor-icons/react";
import { OwlMark } from "../../../shared/components/owlMark.component";
import { ONBOARDING_STEPS } from "./stepFlow.data";

export function ProgressRail({ currentIndex, onSelect }: {
  currentIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <aside className="ob-rail" aria-label="Setup progress">
      <div className="ob-brand">
        <OwlMark size={30} />
        <span>OWL</span>
      </div>
      <ol className="ob-steps">
        {ONBOARDING_STEPS.map((step, index) => {
          const state = index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming";
          const reachable = index <= currentIndex;
          return (
            <li key={step.id} className={`ob-step ob-step-${state}`}>
              <button
                type="button" className="ob-step-btn" disabled={!reachable}
                aria-current={state === "current" ? "step" : undefined}
                onClick={() => reachable && onSelect(index)}
              >
                <span className="ob-node">{state === "done" ? <Check size={12} weight="bold" /> : <i />}</span>
                <span className="ob-step-text">
                  <small>Step {index + 1}</small>
                  {step.railLabel}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="ob-rail-foot">Runs on your machine. Every change is yours to approve.</p>
    </aside>
  );
}

export function CompactRail({ currentIndex }: { currentIndex: number }) {
  const step = ONBOARDING_STEPS[currentIndex];
  return (
    <div className="ob-compact" aria-hidden="true">
      <div className="ob-compact-brand"><OwlMark size={24} /><span>OWL</span></div>
      <div className="ob-compact-dots">
        {ONBOARDING_STEPS.map((item, index) => (
          <span key={item.id} className={`ob-dot${index === currentIndex ? " on" : index < currentIndex ? " done" : ""}`} />
        ))}
      </div>
      <span className="ob-compact-label">Step {currentIndex + 1} of {ONBOARDING_STEPS.length} · {step.railLabel}</span>
    </div>
  );
}
