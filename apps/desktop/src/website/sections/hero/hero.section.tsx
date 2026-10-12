import {
  ArrowRight, Cube, Database, FileCode, GitBranch, HardDrives, PlayCircle, ShieldCheck, TerminalWindow,
} from "@phosphor-icons/react";
import { HeroDemo } from "./heroDemo.section";
import { SiteLink } from "../../components/siteLink.component";
import { OpenAppLink, WebsiteDownloadLink } from "../../components/openApp.component";
import "./hero.style.css";

const SUPPORTED_STACK = [
  { icon: GitBranch, name: "Git" },
  { icon: FileCode, name: "Go" },
  { icon: FileCode, name: "TypeScript" },
  { icon: FileCode, name: "Python" },
  { icon: Cube, name: "Docker" },
  { icon: Database, name: "Postgres" },
];

export function HeroSection() {
  return (
    <>
      <section className="hero" id="top">
        <div className="hero-glow" aria-hidden="true" />
        <div className="wrap hero-copy">
          <SiteLink className="hero-chip" to="/changelog">
            <span className="tag tag-blue">v0.1</span>
            Bound approvals, change journal, and model routing
            <ArrowRight size={13} weight="bold" />
          </SiteLink>
          <h1>The AI engineer that <em>shows</em> its work.</h1>
          <p className="hero-sub">
            OWL reads your repo, writes a plan, and proposes every edit as a diff you can read.
            Nothing is written, run, or pushed until you approve it.
          </p>
          <div className="hero-cta">
            <OpenAppLink className="btn btn-dark btn-lg" label="Open the app" arrowSize={16} />
            <WebsiteDownloadLink className="btn btn-secondary btn-lg" />
            <a className="btn btn-secondary btn-lg" href="#demo"><PlayCircle size={17} weight="duotone" /> Try a run</a>
          </div>
          <ul className="hero-trust">
            <li><HardDrives size={15} weight="duotone" />Runs on your machine</li>
            <li><ShieldCheck size={15} weight="duotone" />Approvals bound to the exact action</li>
            <li><TerminalWindow size={15} weight="duotone" />Secrets stripped from commands</li>
          </ul>
        </div>
        <div className="wrap hero-demo">
          <HeroDemo />
          <p className="hero-hint">This run is live. Approve or reject the change to see what happens.</p>
        </div>
      </section>
      <div className="stack">
        <div className="wrap stack-inner">
          <p>Works in the repo you already have</p>
          <ul>
            {SUPPORTED_STACK.map((stackItem) => (
              <li key={stackItem.name}><stackItem.icon size={18} weight="duotone" />{stackItem.name}</li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
