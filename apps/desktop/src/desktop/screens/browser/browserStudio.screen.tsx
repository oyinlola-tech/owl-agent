import { useEffect, useState } from "react";
import {
  ArrowClockwise, ArrowLeft, ArrowRight, Browser, Camera, CheckCircle, Code, Copy, Cursor, DeviceMobile, DeviceTablet,
  Globe, Info, Laptop, LockKey, MagicWand, Monitor, PaperPlaneRight, SpinnerGap, Square, Terminal, TextAa, WifiHigh, XCircle, type Icon,
} from "@phosphor-icons/react";
import { useAppStore } from "../../state/app.store";
import { agentApi } from "../../services/agentApi.service";
import { PageHeader, SectionTitle } from "../../../shared/components/pageLayout.component";
import { formatShortTimeAgo } from "../../../shared/helpers/time.helper";
import { copyTextAndNotify } from "../../../shared/helpers/clipboard.helper";
import { WebsiteRecreationPanel, type RecreationStage } from "./websiteRecreation.panel";
import "./browserStudio.style.css";

const VIEWPORT_DEVICES: { w: number; icon: Icon; label: string }[] = [
  { w: 1440, icon: Monitor, label: "Desktop" },
  { w: 1024, icon: Laptop, label: "Laptop" },
  { w: 768, icon: DeviceTablet, label: "Tablet" },
  { w: 390, icon: DeviceMobile, label: "Mobile" },
];

const PAGE_TOOLS: [string, Icon][] = [["Inspect", Cursor], ["Select element", Square], ["Copy HTML", Code], ["Copy CSS", Copy], ["Analyze page", MagicWand]];

type DevtoolsPanel = "console" | "network" | "text";

const DEVTOOLS_TABS: [DevtoolsPanel, string, Icon][] = [["console", "Console", Terminal], ["network", "Network", WifiHigh], ["text", "Page text", TextAa]];

interface PageCapture { url: string; w: number; title: string; at: string; ok: boolean; screenshot?: string }

export function BrowserStudioScreen() {
  const [url, setUrl] = useState("https://example.com");
  const [width, setWidth] = useState(1440);
  const [stage, setStage] = useState<RecreationStage>("idle");
  const notify = useAppStore((s) => s.showNotice);
  const setDraft = useAppStore((s) => s.setDraft);
  const goToScreen = useAppStore((s) => s.goToScreen);
  const openProject = useAppStore((s) => s.openProject);
  const project = useAppStore((s) => s.project);
  const [capture, setCapture] = useState<{ title: string; text: string; screenshot?: string; screenshotUrl?: string } | null>(null);
  const [capturing, setCapturing] = useState(false);
  useEffect(() => () => { if (capture?.screenshotUrl) URL.revokeObjectURL(capture.screenshotUrl); }, [capture]);
  const [captureHistory, setCaptureHistory] = useState<PageCapture[]>([]);
  const [backStack, setBackStack] = useState<string[]>([]);
  const [forwardStack, setForwardStack] = useState<string[]>([]);
  const [devtoolsPanel, setDevtoolsPanel] = useState<DevtoolsPanel>("console");
  const device = VIEWPORT_DEVICES.find((d) => d.w === width) ?? VIEWPORT_DEVICES[0];
  const capturePage = async (withScreenshot: boolean) => {
    setCapturing(true);
    try {
      const result = await agentApi.browserCapture(url, width, withScreenshot);
      const screenshotUrl = result.screenshot ? await agentApi.loadScreenshotObjectUrl(result.screenshot).catch(() => undefined) : undefined;
      setCapture({ ...result, screenshotUrl });
      setCaptureHistory((list) => [{ url, w: width, title: result.title || url, at: new Date().toISOString(), ok: true, screenshot: result.screenshot }, ...list].slice(0, 8));
    } catch {
      notify("The OWL service is offline, so pages can't be captured. Showing a wireframe instead.");
      setCapture(null);
      setCaptureHistory((list) => [{ url, w: width, title: url.replace(/^https?:\/\//, ""), at: new Date().toISOString(), ok: false }, ...list].slice(0, 8));
    } finally {
      setCapturing(false);
    }
  };
  const loadUrlInPreview = (nextUrl: string) => {
    if (nextUrl === url) return;
    setBackStack((stack) => [...stack, url]);
    setForwardStack([]);
    setUrl(nextUrl);
  };
  const goBack = () => { const previous = backStack[backStack.length - 1]; if (!previous) return; setBackStack((stack) => stack.slice(0, -1)); setForwardStack((stack) => [url, ...stack]); setUrl(previous); };
  const goForward = () => { const next = forwardStack[0]; if (!next) return; setForwardStack((stack) => stack.slice(1)); setBackStack((stack) => [...stack, url]); setUrl(next); };
  const sendToAgent = () => {
    setDraft(`Recreate the layout of ${url} as fresh components in this project. Match the structure and responsive behaviour at ${width}px, ${width >= 1024 ? 768 : 1440}px and 390px. Don't copy assets or text.`);
    if (!project) openProject({ name: "ZudoMart", path: "~/Projects/zudomart", opened: "now" });
    goToScreen("workspace");
    notify("Prompt added to the chat. Review it, then press Send.");
  };
  const runPageTool = (label: string) => {
    if (label === "Copy HTML" || label === "Copy CSS") {
      if (!capture) { notify(`Capture the page first, then ${label.toLowerCase()}.`); return; }
      copyTextAndNotify(label === "Copy HTML" ? capture.text : `/* ${capture.title} */`, notify, `${label.replace("Copy ", "")} copied`);
      return;
    }
    if (label === "Analyze page") { setStage("analysis"); return; }
    notify(`${label} needs a captured page. Press Capture page first.`);
  };
  const secure = url.startsWith("https://");
  const frameMaxPercent = Math.round((width / 1440) * 100);
  const wireframeColumns = width >= 1024 ? 3 : width >= 768 ? 2 : 1;
  return (
    <div className="page pg-browser">
      <PageHeader icon={Browser} hue="purple" title="Browser studio"
        lede="Inspect live pages at real breakpoints, then recreate public sites as fresh code in your project."
        actions={<button className="btn btn-primary" onClick={sendToAgent}><PaperPlaneRight size={15} /> Send to agent</button>} />
      <div className="pg-window">
        <div className="pg-wbar">
          <span className="pg-lights" aria-hidden="true"><i /><i /><i /></span>
          <button className="btn btn-ghost btn-icon btn-sm" aria-label="Back" disabled={backStack.length === 0} onClick={goBack}><ArrowLeft size={15} /></button>
          <button className="btn btn-ghost btn-icon btn-sm" aria-label="Forward" disabled={forwardStack.length === 0} onClick={goForward}><ArrowRight size={15} /></button>
          <button className="btn btn-ghost btn-icon btn-sm" aria-label="Reload" onClick={() => void capturePage(false)}><ArrowClockwise size={15} /></button>
          <div className="input-wrap">
            {secure ? <LockKey size={14} /> : <Globe size={14} />}
            <input className="input pg-mono" defaultValue={url} key={url} aria-label="Address"
              onKeyDown={(e) => { if (e.key === "Enter") { const typed = (e.target as HTMLInputElement).value.trim(); loadUrlInPreview(/^https?:\/\//.test(typed) ? typed : `https://${typed}`); } }} />
          </div>
          <div className="seg" aria-label="Viewport width">
            {VIEWPORT_DEVICES.map((d) => (
              <button key={d.w} aria-pressed={width === d.w} onClick={() => setWidth(d.w)} title={`${d.label}, ${d.w}px`}>
                <d.icon size={15} /><span className="hide-m">{d.w}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="pg-tools">
          <button className="btn btn-dark btn-sm" disabled={capturing} onClick={() => void capturePage(false)}>
            {capturing ? <SpinnerGap size={14} /> : <Globe size={14} />} {capturing ? "Capturing…" : "Capture page"}
          </button>
          <button className="btn btn-secondary btn-sm" disabled={capturing} onClick={() => void capturePage(true)}><Camera size={14} /> With screenshot</button>
          <span className="sep" />
          {PAGE_TOOLS.map(([label, ToolIcon]) => (
            <button key={label} className="btn btn-ghost btn-sm" onClick={() => runPageTool(label)}><ToolIcon size={14} /> {label}</button>
          ))}
        </div>
        <div className="pg-stage">
          <div className="pg-frame" style={{ maxWidth: `${frameMaxPercent}%` }}>
            <div className="pg-frame-meta"><span><device.icon size={12} /> {device.label} · {capture?.title || url.replace(/^https?:\/\//, "")}</span><span>{width} × {Math.round(width * (width >= 1024 ? 0.625 : width >= 768 ? 1.33 : 2.16))}</span></div>
            {capture?.screenshotUrl ? (
              <img src={capture.screenshotUrl} alt={`Screenshot of ${capture.title}`} />
            ) : (
              <div className="pg-wire" aria-label={`Wireframe preview of ${url} at ${width}px`} role="img">
                <div className="nav"><span className="logo" /><span className="bar" style={{ width: 60 }} /><span className="grow" />
                  {wireframeColumns > 1 && <><span className="bar" style={{ width: 40 }} /><span className="bar" style={{ width: 40 }} /></>}
                  <span className="bar" style={{ width: 28 }} /></div>
                <div className="hero"><span className="h" /><span className="s" /><span className="b" /></div>
                <div className="cards" style={{ ["--cols" as string]: wireframeColumns }}>{Array.from({ length: wireframeColumns * 2 }, (_, index) => <div key={index} />)}</div>
              </div>
            )}
          </div>
        </div>
        <div className="pg-devtools">
          <div className="pg-tabs sm" role="tablist" aria-label="Page details">
            {DEVTOOLS_TABS.map(([key, label, TabIcon]) => (
              <button key={key} role="tab" aria-selected={devtoolsPanel === key} onClick={() => setDevtoolsPanel(key)}><TabIcon size={14} /> {label}</button>
            ))}
          </div>
          <div className="pg-devbody">
            {devtoolsPanel === "text" && (capture ? <p className="pg-captext">{capture.text.slice(0, 3000) || "The page has no readable text."}</p>
              : <p className="pg-muted pg-p">Capture the page to read its title and text here.</p>)}
            {devtoolsPanel === "console" && <p className="pg-muted pg-p"><Info size={14} /> Console messages are collected when the agent previews your local build. Captures of public pages read text only.</p>}
            {devtoolsPanel === "network" && <p className="pg-muted pg-p"><Info size={14} /> Network requests aren't recorded for captures. Run your dev server and preview it from the workspace to inspect requests.</p>}
          </div>
        </div>
      </div>

      <div className="pg-browser-grid">
        <WebsiteRecreationPanel url={url} stage={stage} onStageChange={setStage} />
        <aside>
          <SectionTitle count={captureHistory.length}>Captures</SectionTitle>
          {captureHistory.length === 0 ? (
            <p className="pg-muted pg-p">Pages you capture this session are listed here, so you can jump back to them.</p>
          ) : (
            <ul className="pg-caps">
              {captureHistory.map((entry, index) => (
                <li key={index}>
                  <button onClick={() => { loadUrlInPreview(entry.url); setWidth(entry.w); }}>
                    {entry.ok ? <CheckCircle size={15} color="var(--green)" weight="duotone" /> : <XCircle size={15} color="var(--red)" weight="duotone" />}
                    <span><b>{entry.title}</b><small>{entry.w}px · {formatShortTimeAgo(entry.at)}{entry.ok ? "" : " · service offline"}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
