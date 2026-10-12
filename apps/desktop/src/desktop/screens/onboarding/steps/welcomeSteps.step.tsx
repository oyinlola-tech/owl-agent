import { Check, Cpu, DesktopTower, FolderOpen, GitDiff, SealCheck, UserCircle } from "@phosphor-icons/react";
import { OwlMark } from "../../../../shared/components/owlMark.component";

const TRUST_POINTS = [
  { icon: DesktopTower, title: "Runs on your machine", body: "OWL works through a local service. Your code and keys stay on this computer." },
  { icon: GitDiff, title: "Every change is a diff you approve", body: "Nothing is written, run, or pushed until you say yes." },
  { icon: SealCheck, title: "It checks its own work", body: "OWL runs your tests and build, and tells you plainly when something isn't verified." },
];

export function WelcomeStep() {
  return (
    <div className="ob-welcome">
      <div className="ob-welcome-mark"><OwlMark size={64} /></div>
      <ul className="ob-trust">
        {TRUST_POINTS.map((point) => (
          <li key={point.title}>
            <span className="ob-trust-icon"><point.icon size={20} weight="duotone" /></span>
            <div>
              <b>{point.title}</b>
              <p>{point.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DoneStep({ name, providerConfigured, projectName }: {
  name: string;
  providerConfigured: boolean;
  projectName: string;
}) {
  const rows = [
    { icon: UserCircle, label: "You", value: name ? name : "No name set — add one anytime" },
    { icon: Cpu, label: "Model", value: providerConfigured ? "A provider is connected" : "No model yet — connect one when you're ready" },
    { icon: FolderOpen, label: "First project", value: projectName ? projectName : "None chosen yet" },
  ];
  return (
    <div className="ob-done">
      <div className="ob-done-badge"><Check size={26} weight="bold" /></div>
      <dl className="ob-summary">
        {rows.map((row) => (
          <div key={row.label} className="ob-summary-row">
            <dt><row.icon size={16} weight="duotone" /> {row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="ob-done-note">OWL opens with the composer ready. Describe what you want to build, and it will plan before it touches anything.</p>
    </div>
  );
}
