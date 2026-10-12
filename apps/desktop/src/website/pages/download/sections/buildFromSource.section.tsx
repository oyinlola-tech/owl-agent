import { ArrowUpRight, Database, GithubLogo, Key, Package, Terminal, Wrench } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { CodeBlock } from "../../../components/codeBlock.component";
import { Reveal } from "../../../components/reveal.component";
import { SiteLink } from "../../../components/siteLink.component";
import { RELEASES_PAGE_URL } from "../release/latestRelease.service";
import "./buildFromSource.style.css";

const REQUIREMENTS: { icon: Icon; label: string; value: string }[] = [
  { icon: Package, label: "Node.js", value: "Current LTS, for the app" },
  { icon: Wrench, label: "Rust toolchain", value: "Stable, for the native window" },
  { icon: Terminal, label: "Python", value: "3.11 or newer, for the agent service" },
  { icon: Database, label: "Disk", value: "A few hundred MB including dependencies" },
  { icon: Key, label: "Model key", value: "NVIDIA_API_KEY, or use the built-in mock" },
];

export function BuildFromSourceSection() {
  return (
    <>
      <Reveal className="dl-manual">
        <GithubLogo size={22} weight="duotone" />
        <div>
          <h2>Other ways to install</h2>
          <p>Every installer, the checksums, and the release notes are on GitHub. Download a file by hand from the{" "}
            <a href={RELEASES_PAGE_URL} target="_blank" rel="noopener noreferrer">releases page <ArrowUpRight size={13} weight="bold" /></a>, or build OWL yourself below.</p>
        </div>
      </Reveal>
      <div className="dl-grid" id="build">
        <Reveal className="dl-steps">
          <h2>Build from source</h2>
          <ol>
            <li><b>Build the desktop app.</b> The bundle lands in <code>src-tauri/target/release/bundle</code>.
              <CodeBlock label="apps/desktop" code={"$ cd apps/desktop\n$ npm install\n$ npm run tauri build"} />
            </li>
            <li><b>Install and start the agent service.</b>
              <CodeBlock label="services/agent" code={"$ cd services/agent\n$ python3 -m venv .venv\n$ .venv/bin/pip install -e \".[dev]\"\n$ .venv/bin/python -m uvicorn --factory app:create_app --port 8000"} />
            </li>
            <li><b>Point it at your projects.</b> Set <code>OWL_WORKSPACES</code> and <code>NVIDIA_API_KEY</code> in <code>services/agent/.env</code>, then open the app.</li>
          </ol>
        </Reveal>
        <Reveal className="reqs" delay={100}>
          <h3>Requirements</h3>
          <ul>
            {REQUIREMENTS.map((requirement) => (
              <li key={requirement.label}><requirement.icon size={18} weight="duotone" /><span><b>{requirement.label}</b>{requirement.value}</span></li>
            ))}
          </ul>
          <SiteLink className="reqs-link" to="/docs#start">Full setup guide <ArrowUpRight size={14} weight="bold" /></SiteLink>
        </Reveal>
      </div>
    </>
  );
}
