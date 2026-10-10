import { Check, ClockCounterClockwise, Eye, Globe, ShieldCheck } from "@phosphor-icons/react";
import { Reveal } from "./reveal";

export default function Sections() {
  return (
    <>
      <section className="wrap section" id="features">
        <Reveal>
          <h2>Everything the agent touches stays visible</h2>
          <p className="lede">One event pipeline drives every panel, so the interface stays live while the agent works. Nothing runs silently.</p>
        </Reveal>
        <div className="bento">
          <Reveal delay={60}>
            <div className="card tint-yellow-bold">
              <span className="tag tag-orange">Assistant</span>
              <h3>Ask, then inspect the plan before anything changes</h3>
              <p>OWL reads the repo first and lists each edit. You approve the batch or single files.</p>
              <img className="shot" src="https://picsum.photos/seed/owl-assistant-ui/880/520" alt="Sample approval panel with a proposed file change" loading="lazy" />
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="card tint-peach">
              <span className="icon-tile"><Eye size={22} weight="duotone" /></span>
              <h3>Activity timeline</h3>
              <p>Every read, search, and edit with file paths. Select a row to open it.</p>
            </div>
          </Reveal>
          <Reveal delay={180}>
            <div className="card tint-mint">
              <span className="icon-tile"><ShieldCheck size={22} weight="duotone" /></span>
              <h3>Approvals</h3>
              <p>Command, folder, and reason on each request. Approve once, per task, or reject.</p>
            </div>
          </Reveal>
        </div>
        <div className="bento-2">
          <Reveal>
            <div className="card tint-sky">
              <span className="icon-tile"><Globe size={22} weight="duotone" /></span>
              <h3>Browser panel</h3>
              <p>Desktop, tablet, and mobile preview with screenshots and console errors.</p>
              <img className="shot" src="https://picsum.photos/seed/owl-browser-preview/800/500" alt="Sample responsive preview at three widths" loading="lazy" />
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="card tint-lavender">
              <span className="icon-tile"><ClockCounterClockwise size={22} weight="duotone" /></span>
              <h3>Checkpoints and Git</h3>
              <p>Automatic snapshots before edits. Restore any point through Git, with diffs you can read first.</p>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="wrap section" id="recreation">
        <Reveal>
          <h2>Paste a URL, compare, ship your own build</h2>
          <p className="lede">The agent studies public structure and responsive states, then writes fresh code. Reference on the left, your build on the right.</p>
        </Reveal>
        <Reveal delay={60}>
          <div className="compare">
            <div className="compare-pane"><header>REFERENCE PAGE</header><div className="ph">Reference capture</div></div>
            <div className="compare-pane"><header>YOUR LOCAL BUILD</header><div className="ph">Localhost preview</div></div>
          </div>
        </Reveal>
        <div className="split" id="workspace">
          <Reveal>
            <div className="copy">
              <span className="tag tag-green">Terminal</span>
              <h3>Yours and the agent's, never mixed up</h3>
              <p>Separate tabs for dev server, tests, and agent runs. Agent commands carry a label, so blame stays clear.</p>
              <ul className="check-list">
                <li><Check size={16} weight="bold" />Labeled agent commands</li>
                <li><Check size={16} weight="bold" />One click to copy any output</li>
                <li><Check size={16} weight="bold" />Failed builds link to the fix</li>
              </ul>
              <a className="btn btn-dark" href="/app">Open the workspace</a>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="media">
              <img src="https://picsum.photos/seed/owl-terminal-panel/800/560" alt="Sample terminal panel with labeled user and agent commands" loading="lazy" />
              <div className="cap">Sample run: agent output kept separate</div>
            </div>
          </Reveal>
        </div>
        <Reveal delay={60}>
          <div className="stat-row">
            <div><b>14</b><span>Tools across files, terminal, browser, Git</span></div>
            <div><b>50</b><span>Max steps per task, adjustable</span></div>
            <div><b>6</b><span>Pipeline stages with live status</span></div>
            <div><b>100%</b><span>Edits readable before approval</span></div>
          </div>
        </Reveal>
        <Reveal delay={100}>
          <div className="quote">
            <p>"We review agent diffs the way we review each other. That kept our main branch clean."</p>
            <cite>Adaeze Okonkwo, platform lead at ZudoMart</cite>
          </div>
        </Reveal>
      </section>

      <section className="wrap section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="cta-banner">
            <span className="badge badge-purple">Local first</span>
            <h2>Your code never leaves your machine</h2>
            <p>Keys live in the OS keyring. The agent works inside your project folder. Open the app and start building.</p>
            <div className="hero-cta">
              <a className="btn btn-primary" href="/app">Open the app</a>
              <a className="btn btn-secondary" href="#features">Browse features</a>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
