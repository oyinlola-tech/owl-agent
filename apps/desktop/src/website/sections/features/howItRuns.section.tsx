import { GitCommit, ListChecks, MagnifyingGlass, PencilSimple, ShieldCheck, TerminalWindow } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { Tile, type Hue } from "../../../shared/components/tag.component";
import { Reveal } from "../../components/reveal.component";
import { SectionHeading } from "../sectionHeading.component";
import "./features.style.css";

const TASK_STEPS: { icon: Icon; hue: Hue; title: string; body: string; you?: boolean }[] = [
  { icon: MagnifyingGlass, hue: "blue", title: "Read", body: "Lists, searches, and reads only inside the project folders you authorize." },
  { icon: ListChecks, hue: "gray", title: "Plan", body: "Writes the steps down before touching anything, so you can redirect early." },
  { icon: PencilSimple, hue: "yellow", title: "Propose", body: "Every edit becomes a diff. Proposing changes nothing on disk." },
  { icon: ShieldCheck, hue: "orange", title: "You approve", body: "Approve once or for the task. The approval is bound to that exact action.", you: true },
  { icon: TerminalWindow, hue: "green", title: "Verify", body: "Runs your tests and shows the output it saw, not a summary of it." },
  { icon: GitCommit, hue: "brown", title: "Record", body: "Each applied change is journaled, so you can revert it file by file." },
];

export function HowItRunsSection() {
  return (
    <section className="section" id="how">
      <div className="wrap">
        <SectionHeading eyebrow="How a task runs" title={<>Six steps. You hold the fourth.</>}
          lede="The same pipeline drives every panel in the app. The agent cannot skip from proposing to writing without you." />
        <ol className="track">
          {TASK_STEPS.map((step, index) => (
            <Reveal as="li" key={step.title} delay={index * 70} className={`track-step${step.you ? " you" : ""}`}>
              <span className="track-node"><Tile icon={step.icon} hue={step.hue} size="lg" /></span>
              <span className="track-n">Step {index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
