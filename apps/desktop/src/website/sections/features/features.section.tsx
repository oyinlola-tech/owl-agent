import {
  Brain, Camera, ClockCounterClockwise, Cpu, Eye, FolderLock, GitDiff, Globe, Monitor, PencilSimple, Prohibit,
  ShieldCheck, Sparkle, Timer,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Tile, type Hue } from "../../../shared/components/tag.component";
import { Reveal } from "../../components/reveal.component";
import { SectionHeading } from "../sectionHeading.component";
import { BrowserVisual, DiffVisual, MemoryVisual, RoutingVisual } from "./featureVisuals.component";
import "./features.style.css";

function FeatureRow({ id, flip, hue, icon, eyebrow, title, body, points, visual }: {
  id: string; flip?: boolean; hue: Hue; icon: Icon; eyebrow: string; title: string; body: string;
  points: { icon: Icon; text: ReactNode }[]; visual: ReactNode;
}) {
  return (
    <div className={`feat${flip ? " flip" : ""}`} id={id}>
      <Reveal className="feat-copy">
        <span className="feat-eyebrow"><Tile icon={icon} hue={hue} />{eyebrow}</span>
        <h3>{title}</h3>
        <p>{body}</p>
        <ul>
          {points.map((point, index) => <li key={index}><point.icon size={18} weight="duotone" /><span>{point.text}</span></li>)}
        </ul>
      </Reveal>
      <Reveal className="feat-visual" delay={100}>{visual}</Reveal>
    </div>
  );
}

export function FeaturesSection() {
  return (
    <section className="section section-wash" id="features">
      <div className="wrap">
        <SectionHeading eyebrow="What you get" title="Built to be checked, not trusted."
          lede="Four parts of the workspace that turn an agent run into something you can read, steer, and undo." />
        <div className="feats">
          <FeatureRow id="review" hue="yellow" icon={GitDiff} eyebrow="Diff review" title="Review every change before it lands."
            body="Edits arrive as proposals with real line numbers. Accept or reject each file, revert one later, or undo the last decision. Applied changes go into a journal you can roll back from."
            points={[
              { icon: GitDiff, text: "Per-file accept, reject, and revert" },
              { icon: ClockCounterClockwise, text: "Change journal with one-click revert" },
              { icon: ShieldCheck, text: "Writes need a matching, unexpired approval" },
            ]} visual={<DiffVisual />} />
          <FeatureRow id="browser" flip hue="purple" icon={Globe} eyebrow="Browser Studio" title="See the page at every width."
            body="Preview your local build at desktop, tablet, and phone widths with console errors beside it. Capture a public page as reference, then let the agent rebuild it as fresh code."
            points={[
              { icon: Monitor, text: "1440, 1024, 768, and 390 pixel previews" },
              { icon: Camera, text: "Capture title, text, and a screenshot" },
              { icon: Eye, text: "Read-only fetches for public pages" },
            ]} visual={<BrowserVisual />} />
          <FeatureRow id="memory" hue="pink" icon={Brain} eyebrow="Memory" title="Memory you can read and switch off."
            body="OWL keeps durable facts in four scopes: global, project, task, and knowledge. Every fact is visible, editable, and can be disabled without deleting it. Anything that looks like a secret is refused."
            points={[
              { icon: FolderLock, text: "Project memory never leaves its project" },
              { icon: PencilSimple, text: "Edit, disable, or delete any fact" },
              { icon: Prohibit, text: "Keys, tokens, and passwords are scrubbed" },
            ]} visual={<MemoryVisual />} />
          <FeatureRow id="routing" flip hue="green" icon={Cpu} eyebrow="Model routing" title="The right model for each step."
            body="A router classifies each request as chat, plan, code, debug, big context, summarize, or multimodal, then picks a model that has what the step needs. You see the reason, and you can pin a model any time."
            points={[
              { icon: Sparkle, text: "Routing reason shown on every task" },
              { icon: Timer, text: "Context budget with automatic compression" },
              { icon: Cpu, text: "Token usage recorded per call" },
            ]} visual={<RoutingVisual />} />
        </div>
      </div>
    </section>
  );
}
