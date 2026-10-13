import { useCallback, useEffect, useState } from "react";
import {
  ArrowClockwise, ArrowRight, ArrowSquareOut, BookOpen, Bug, CaretRight, CheckCircle, Circle, ClockCounterClockwise,
  DownloadSimple, FolderOpen, GitDiff, Keyboard, Lifebuoy, Notebook, Play, Question, ShieldCheck, Tray, Wrench,
  type Icon,
} from "@phosphor-icons/react";
import { useAppStore } from "../../../state/app.store";
import { agentApi } from "../../../services/agentApi.service";
import { type HealthRead } from "../../../services/agentApi.types";
import { PageHeader, SectionTitle } from "../../../../shared/components/pageLayout.component";
import { Tag } from "../../../../shared/components/tag.component";
import type { AppScreen } from "../../../state/workspace.types";
import "./help.style.css";
import { CommandBlock } from "../../../components/commandBlock.component";
import { copyTextAndNotify } from "../../../../shared/helpers/clipboard.helper";
import { APP_DOWNLOAD_URL, APP_VERSION, checkForAppUpdate, type UpdateCheckState } from "../../../../shared/helpers/updateCheck.helper";

const KEYBOARD_SHORTCUTS: { keys: string[]; what: string }[] = [
  { keys: ["Ctrl", "K"], what: "Ask OWL from anywhere" },
  { keys: ["Ctrl", "Shift", "P"], what: "Open the command palette" },
  { keys: ["Ctrl", "J"], what: "Show or hide the terminal" },
  { keys: ["Ctrl", "B"], what: "Show or hide the sidebar" },
  { keys: ["Ctrl", "Shift", "E"], what: "Review pending changes" },
  { keys: ["?"], what: "Show keyboard shortcuts" },
  { keys: ["Esc"], what: "Close a dialog or palette" },
  { keys: ["J", "K"], what: "Move between requests in the Inbox" },
  { keys: ["A", "R"], what: "Approve or reject the selected request" },
];

const TROUBLESHOOTING_FIXES: { icon: Icon; title: string; body: string; code: string }[] = [
  {
    icon: Lifebuoy, title: "The status bar says “Service offline”",
    body: "The app runs, but tasks, memory, and history need the local Python service. Start it in a terminal and leave it running.",
    code: "cd services/agent\n.venv/bin/python -m uvicorn --factory app:create_app --port 8000",
  },
  {
    icon: ShieldCheck, title: "Provider shows “not configured”",
    body: "Without a key the provider is not configured. Add your NVIDIA key to services/agent/.env, then restart the service. The key is never logged or sent to the app.",
    code: "# services/agent/.env\nNVIDIA_API_KEY=your-key-here",
  },
  {
    icon: FolderOpen, title: "OWL can't read or write project files",
    body: "File, terminal, and git tools only work inside folders you authorize. List each project root, separated by commas, then restart the service.",
    code: "# services/agent/.env\nOWL_WORKSPACES=/home/you/Projects/my-app",
  },
  {
    icon: ClockCounterClockwise, title: "An approval expired before I answered",
    body: "Approvals expire so a stale yes can't run later. OWL asks again when it retries. Raise the window if you step away often (value in seconds).",
    code: "# services/agent/.env\nOWL_APPROVAL_TTL=1800",
  },
];

export function HelpScreen() {
  const goToScreen = useAppStore((s) => s.goToScreen);
  const showNotice = useAppStore((s) => s.showNotice);
  const project = useAppStore((s) => s.project);
  const agentEvents = useAppStore((s) => s.agentEvents);
  const changes = useAppStore((s) => s.changes);
  const approvals = useAppStore((s) => s.approvals);
  const [health, setHealth] = useState<HealthRead | null>(null);
  const [offline, setOffline] = useState(false);
  const [checking, setChecking] = useState(false);
  const [update, setUpdate] = useState<UpdateCheckState>({ status: "idle" });

  const checkServiceHealth = useCallback(async () => {
    setChecking(true);
    try {
      setHealth(await agentApi.health());
      setOffline(false);
    } catch {
      setHealth(null);
      setOffline(true);
    } finally {
      setChecking(false);
    }
  }, []);
  useEffect(() => { void checkServiceHealth(); }, [checkServiceHealth]);

  const checkForUpdates = useCallback(async () => {
    setUpdate({ status: "checking" });
    setUpdate(await checkForAppUpdate());
  }, []);

  const gettingStartedSteps: { done: boolean; title: string; body: string; icon: Icon; to: AppScreen; cta: string }[] = [
    { done: Boolean(project), title: "Open a project", body: "Pick the folder OWL may work in.", icon: FolderOpen, to: "projects", cta: "Projects" },
    { done: agentEvents.length > 0, title: "Run a task", body: "Describe the job; OWL reads first and shows a plan.", icon: Play, to: "workspace", cta: "Workspace" },
    { done: changes.length > 0, title: "Review a diff", body: "Every edit arrives as a diff you can read line by line.", icon: GitDiff, to: "workspace", cta: "Changes" },
    { done: approvals.some((approval) => approval.status !== "pending"), title: "Approve or reject", body: "Nothing is written until you say so.", icon: Tray, to: "inbox", cta: "Inbox" },
    { done: false, title: "Check the history", body: "See what changed and revert any single edit.", icon: ClockCounterClockwise, to: "history", cta: "History" },
  ];
  const doneCount = gettingStartedSteps.filter((step) => step.done).length;

  const copyDiagnostics = () => {
    const diagnosticLines = [
      `OWL desktop ${APP_VERSION}`,
      `Service URL: ${agentApi.baseUrl}`,
      `Service: ${health ? `online v${health.version}, provider ${health.provider} (${health.provider_configured ? "configured" : "not configured"}), approvals ${health.approvals_enforced ? "enforced" : "not enforced"}` : "offline"}`,
      `Project open: ${project ? "yes" : "no"}`,
      `User agent: ${navigator.userAgent}`,
      `Time: ${new Date().toISOString()}`,
    ];
    copyTextAndNotify(diagnosticLines.join("\n"), showNotice, "Diagnostics copied — paste them into your report", "Copy failed");
  };

  return (
    <div className="page x-help">
      <PageHeader icon={Question} hue="gray" title="Help"
        lede="Get started, learn the shortcuts, and fix the common setup problems."
        actions={<>
          <a className="btn btn-secondary" href="/docs" target="_blank" rel="noreferrer"><BookOpen size={15} /> Documentation <ArrowSquareOut size={13} /></a>
          <button className="btn btn-secondary" onClick={() => copyDiagnostics()}><Bug size={15} /> Copy diagnostics</button>
        </>}
      />

      <div className="x-help-top">
        <section className="surface x-panel">
          <div className="x-panel-head">
            <h3>Getting started</h3>
            <span className="x-muted">{doneCount} of {gettingStartedSteps.length} done</span>
          </div>
          <div className="progress green" aria-hidden="true"><i style={{ width: `${(doneCount / gettingStartedSteps.length) * 100}%` }} /></div>
          <ol className="x-check">
            {gettingStartedSteps.map((step) => (
              <li key={step.title} className={step.done ? "done" : ""}>
                {step.done ? <CheckCircle size={20} weight="fill" className="x-green" /> : <Circle size={20} className="x-dim" />}
                <div>
                  <b>{step.title}</b>
                  <span>{step.body}</span>
                </div>
                <button className="btn btn-sm btn-ghost" onClick={() => goToScreen(step.to)}>{step.cta} <CaretRight size={12} /></button>
              </li>
            ))}
          </ol>
        </section>

        <section className="surface x-panel x-health">
          <div className="x-panel-head">
            <h3>Service status</h3>
            <button className="btn btn-sm btn-secondary" onClick={() => void checkServiceHealth()} disabled={checking}>{checking ? "Checking…" : "Check again"}</button>
          </div>
          {health ? (
            <dl className="x-kv">
              <div><dt>Service</dt><dd><Tag hue="green" dot>Online</Tag> <span className="mono">v{health.version}</span></dd></div>
              <div><dt>Provider</dt><dd>{health.provider} {health.provider_configured ? <Tag hue="green">Configured</Tag> : <Tag hue="yellow">No provider</Tag>}</dd></div>
              <div><dt>Approvals</dt><dd>{health.approvals_enforced ? <Tag hue="green" icon={ShieldCheck}>Enforced</Tag> : <Tag hue="red">Not enforced</Tag>}</dd></div>
              <div><dt>Address</dt><dd className="mono">{agentApi.baseUrl}</dd></div>
            </dl>
          ) : (
            <div className="x-health-off">
              <Tag hue={offline ? "red" : "gray"} dot>{offline ? "Offline" : "Checking"}</Tag>
              <p>{offline ? <>Nothing answered at <span className="mono">{agentApi.baseUrl}</span>. Start the service with the first fix below.</> : "Contacting the service…"}</p>
            </div>
          )}
        </section>
      </div>

      <section className="surface x-panel" aria-label="App updates">
        <div className="x-panel-head">
          <h3>App updates</h3>
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => void checkForUpdates()}
            disabled={update.status === "checking"}
          >
            <ArrowClockwise size={14} /> {update.status === "checking" ? "Checking…" : "Check for updates"}
          </button>
        </div>
        <div className="x-health-off" role="status">
          {update.status === "idle" && (
            <>
              <Tag hue="gray" dot>Version {APP_VERSION}</Tag>
              <p>Check GitHub for the latest release. Updates are manual downloads — nothing installs itself.</p>
            </>
          )}
          {update.status === "checking" && (
            <>
              <Tag hue="gray" dot>Checking</Tag>
              <p>Contacting GitHub for the latest release…</p>
            </>
          )}
          {update.status === "up-to-date" && (
            <>
              <Tag hue="green" dot>Up to date</Tag>
              <p>You&apos;re on the latest release (v{update.latest}).</p>
            </>
          )}
          {update.status === "available" && (
            <>
              <Tag hue="yellow" dot>Update available</Tag>
              <p>Version v{update.latest} is out — you&apos;re on v{APP_VERSION}. <a href={update.notesUrl} target="_blank" rel="noreferrer">Read the release notes</a>.</p>
              <div className="x-update-actions">
                <a className="btn btn-sm btn-secondary" href={APP_DOWNLOAD_URL} target="_blank" rel="noreferrer"><DownloadSimple size={14} /> Download</a>
              </div>
            </>
          )}
          {update.status === "no-releases" && (
            <>
              <Tag hue="gray" dot>No releases yet</Tag>
              <p>GitHub has no releases published, so there&apos;s nothing to compare against.</p>
            </>
          )}
          {update.status === "offline" && (
            <>
              <Tag hue="red" dot>Couldn&apos;t check</Tag>
              <p>{update.message}</p>
            </>
          )}
        </div>
      </section>

      <SectionTitle><Keyboard size={16} /> Keyboard shortcuts</SectionTitle>
      <div className="x-shortcuts">
        {KEYBOARD_SHORTCUTS.map((shortcut) => (
          <div key={shortcut.what} className="x-shortcut">
            <span>{shortcut.what}</span>
            <span className="x-keys-row">{shortcut.keys.map((key, index) => <kbd key={index}>{key}</kbd>)}</span>
          </div>
        ))}
      </div>

      <SectionTitle><Wrench size={16} /> Troubleshooting</SectionTitle>
      <div className="x-faq">
        {TROUBLESHOOTING_FIXES.map((fix, index) => (
          <details key={fix.title} open={index === 0 && offline}>
            <summary><fix.icon size={17} weight="duotone" /> <span>{fix.title}</span> <CaretRight size={14} className="x-chev" /></summary>
            <div className="x-faq-body">
              <p>{fix.body}</p>
              <CommandBlock code={fix.code} />
            </div>
          </details>
        ))}
      </div>

      <SectionTitle><Notebook size={16} /> Learn more</SectionTitle>
      <div className="x-links">
        {[
          { href: "/docs", icon: BookOpen, title: "Documentation", body: "Setup, concepts, and the service API." },
          { href: "/security", icon: ShieldCheck, title: "Security model", body: "What OWL can touch and how approvals are enforced." },
          { href: "/changelog", icon: ClockCounterClockwise, title: "Changelog", body: "What's new in each version." },
        ].map((link) => (
          <a key={link.href} className="x-link-card" href={link.href} target="_blank" rel="noreferrer">
            <span className="tile"><link.icon size={16} weight="duotone" /></span>
            <span><b>{link.title}</b><span>{link.body}</span></span>
            <ArrowRight size={15} />
          </a>
        ))}
      </div>
      <p className="x-foot-note">OWL desktop {APP_VERSION} · Runs on your machine. Your code and keys stay local.</p>
    </div>
  );
}
