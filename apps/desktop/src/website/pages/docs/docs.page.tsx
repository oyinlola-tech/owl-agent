import { Desktop, HardDrives, Plug, Sparkle } from "@phosphor-icons/react";
import { Tile } from "../../../shared/components/tag.component";
import { CodeBlock } from "../../components/codeBlock.component";
import { PageIntro } from "../../components/pageIntro.component";
import { SiteLink } from "../../components/siteLink.component";
import { API_ENDPOINT_GROUPS, ENVIRONMENT_VARIABLES, KEYBOARD_SHORTCUTS, DOCS_TABLE_OF_CONTENTS } from "./docsReference.data";
import { DOCS_CONCEPTS } from "./docsConcepts.data";
import { useActiveSection } from "./activeSection.hook";
import "./docs.style.css";

const ALL_SECTION_IDS = DOCS_TABLE_OF_CONTENTS.flatMap((tocEntry) => [tocEntry.id, ...(tocEntry.sub?.map((subEntry) => subEntry.id) ?? [])]);

export function DocsPage() {
  const activeSectionId = useActiveSection(ALL_SECTION_IDS);
  return (
    <>
      <PageIntro eyebrow="Documentation" title="Set up OWL and learn how it works."
        lede="Run the desktop app and the local agent service, connect a model, and point OWL at a project. Then read how tasks, approvals, and memory behave." />
      <div className="wrap docs">
        <nav className="docs-toc" aria-label="On this page">
          <span className="docs-toc-h">On this page</span>
          {DOCS_TABLE_OF_CONTENTS.map((tocEntry) => (
            <div key={tocEntry.id}>
              <a href={`#${tocEntry.id}`} className={activeSectionId === tocEntry.id ? "on" : ""}>{tocEntry.label}</a>
              {tocEntry.sub?.map((subEntry) => <a key={subEntry.id} href={`#${subEntry.id}`} className={`sub${activeSectionId === subEntry.id ? " on" : ""}`}>{subEntry.label}</a>)}
            </div>
          ))}
        </nav>
        <article className="docs-body">
          <section id="start">
            <h2>Getting started</h2>
            <p>OWL has two parts: the desktop app you are looking at, and a Python service that runs the agent on your machine. The app works on its own with sample data; connect the service to run real tasks.</p>
            <h3 id="start-app"><Tile icon={Desktop} hue="blue" /> Run the desktop app</h3>
            <p>The quickest way to get the desktop app is to install it for your system from the <SiteLink to="/download">download page</SiteLink>. It has installers for Windows, macOS, and Linux, plus one-line terminal installs. To run it from source instead, follow the steps below.</p>
            <p>You need Node.js. The Rust toolchain is only needed for the native desktop window.</p>
            <CodeBlock label="apps/desktop" code={"$ cd apps/desktop\n$ npm install\n$ npm run dev\n# Web preview at the URL Vite prints\n$ npm run tauri dev\n# Native window (needs Rust)"} />
            <h3 id="start-service"><Tile icon={HardDrives} hue="purple" /> Start the agent service</h3>
            <p>The service needs Python 3.11 or newer.</p>
            <CodeBlock label="services/agent" code={"$ cd services/agent\n$ python3 -m venv .venv\n$ .venv/bin/pip install -e \".[dev]\"\n$ cp .env.example .env\n$ .venv/bin/python -m uvicorn --factory app:create_app --port 8000"} />
            <p>Check it is up with <code>curl localhost:8000/health</code>. The status bar in the app turns green when it can reach the service.</p>
            <h3 id="start-connect"><Tile icon={Plug} hue="green" /> Connect a model and a project</h3>
            <p>Put your provider key and the folders OWL may work in into <code>services/agent/.env</code>. Without a key, a deterministic mock answers so you can try the flow safely.</p>
            <CodeBlock label="services/agent/.env" code={"NVIDIA_API_KEY=your-key-here\nOWL_WORKSPACES=/home/you/Projects/zudomart,/home/you/Projects/prooflens"} />
            <div className="callout blue"><Sparkle size={18} weight="duotone" /><span>In the app, open <b>Settings → AI</b> and choose <b>Verify</b>. It checks the key and model without spending tokens.</span></div>
          </section>

          <section id="concepts">
            <h2>Concepts</h2>
            <div className="concepts">
              {DOCS_CONCEPTS.map((concept) => (
                <div key={concept.id} id={concept.id} className="concept">
                  <h3><Tile icon={concept.icon} hue={concept.hue} /> {concept.title}</h3>
                  <p>{concept.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="config">
            <h2>Configuration</h2>
            <p>All settings are environment variables with the <code>OWL_</code> prefix, read by the service at start-up. See <code>.env.example</code> for the full list. A dash means the service default.</p>
            <div className="dtable">
              <table>
                <thead><tr><th>Variable</th><th>Default</th><th>What it does</th></tr></thead>
                <tbody>
                  {ENVIRONMENT_VARIABLES.map((variable) => (
                    <tr key={variable.name}><td className="mono">{variable.name}</td><td className="mono dim">{variable.def}</td><td>{variable.what}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="shortcuts">
            <h2>Keyboard shortcuts</h2>
            <p>On macOS, use <kbd>⌘</kbd> where this table says Ctrl.</p>
            <div className="dtable">
              <table>
                <thead><tr><th>Keys</th><th>Action</th></tr></thead>
                <tbody>
                  {KEYBOARD_SHORTCUTS.map((shortcut) => (
                    <tr key={shortcut.what}><td><span className="keys">{shortcut.keys.map((key) => <kbd key={key}>{key}</kbd>)}</span></td><td>{shortcut.what}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="api">
            <h2>API reference</h2>
            <p>The service speaks JSON over HTTP on <code>127.0.0.1:8000</code>. Errors return <code>{"{ detail, code }"}</code> with a matching status.</p>
            {API_ENDPOINT_GROUPS.map((endpointGroup) => (
              <div key={endpointGroup.group} className="api-group">
                <h3>{endpointGroup.group}</h3>
                <div className="dtable">
                  <table>
                    <tbody>
                      {endpointGroup.rows.map(([method, endpointPath, description]) => (
                        <tr key={method + endpointPath}><td className="api-m"><span className={`verb v-${method.toLowerCase()}`}>{method}</span></td><td className="mono">{endpointPath}</td><td>{description}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </section>
        </article>
      </div>
    </>
  );
}
