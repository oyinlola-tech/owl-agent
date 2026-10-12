import {
  ArrowRight, Brain, Check, CheckCircle, ClockCounterClockwise, DeviceMobile, DeviceTablet, Eye, EyeSlash, LockKey,
  Monitor, Prohibit, SealCheck, Sparkle, X,
} from "@phosphor-icons/react";
import type { Hue } from "../../../shared/components/tag.component";

export function DiffVisual() {
  const diffLines: { k: "ctx" | "add" | "del"; n: string; t: string }[] = [
    { k: "ctx", n: "41", t: "func (s *Service) Login(" },
    { k: "del", n: "42", t: "    user User) error {" },
    { k: "add", n: "42", t: "    ctx context.Context, user User," },
    { k: "add", n: "43", t: ") (string, error) {" },
    { k: "ctx", n: "44", t: "    hash, err := s.lookup(ctx, user.Email)" },
    { k: "add", n: "45", t: "    if err != nil { return \"\", err }" },
    { k: "add", n: "46", t: "    return issueToken(ctx, user.ID, 15*time.Minute)" },
  ];
  return (
    <div className="vcard">
      <div className="v-diff-files">
        {[["M", "src/auth/service.go", "+4 −1", "yellow"], ["A", "src/auth/jwt.go", "+62", "green"], ["A", "src/auth/middleware.go", "+41", "green"]].map(([status, filePath, lineDelta, hue], index) => (
          <div key={filePath} className={`v-file${index === 0 ? " on" : ""}`}><span className={`hd-st st-${status}`}>{status}</span><span className="mono">{filePath}</span><em className={`t-${hue}`}>{lineDelta}</em></div>
        ))}
      </div>
      <div className="v-diff">
        {diffLines.map((line, index) => (
          <div key={index} className={`v-ln ${line.k} mono`}><i>{line.n}</i><span>{line.k === "add" ? "+" : line.k === "del" ? "−" : " "}</span>{line.t}</div>
        ))}
      </div>
      <div className="v-acts">
        <span className="v-state"><CheckCircle size={15} weight="fill" /> 1 of 3 accepted</span>
        <span className="fake-btn"><ClockCounterClockwise size={13} /> Revert</span>
        <span className="fake-btn"><X size={13} /> Reject</span>
        <span className="fake-btn go"><Check size={13} weight="bold" /> Accept</span>
      </div>
    </div>
  );
}

export function BrowserVisual() {
  return (
    <div className="vcard v-browser">
      <div className="vb-bar">
        <span className="vb-url"><LockKey size={13} /> <span className="mono">localhost:3000/pricing</span></span>
        <span className="seg"><button className="on"><Monitor size={13} /></button><button><DeviceTablet size={13} /></button><button><DeviceMobile size={13} /></button></span>
      </div>
      <div className="vb-stage">
        {(["d", "t", "m"] as const).map((device) => (
          <figure key={device} className={`vb-dev vb-${device}`}>
            <div className="vb-frame">
              <div className="vb-nav"><i /><span /><span /><span /></div>
              <div className="vb-hero"><span className="sk big" /><span className="sk w60" /><span className="vb-btn" /></div>
              <div className="vb-cards"><span /><span /><span /></div>
            </div>
            <figcaption>{device === "d" ? "1440" : device === "t" ? "768" : "390"}px</figcaption>
          </figure>
        ))}
      </div>
      <div className="vb-console mono"><span className="tag tag-red">1 error</span> TypeError: price.toFixed is not a function <em>pricing.tsx:28</em></div>
    </div>
  );
}

export function MemoryVisual() {
  const memoryFacts: { cat: string; hue: Hue; text: string; state: "on" | "off"; confirmed: boolean }[] = [
    { cat: "Project", hue: "purple", text: "Money is stored in minor units as int64. Never floats.", state: "on", confirmed: true },
    { cat: "Project", hue: "purple", text: "Run go test ./... before proposing any commit.", state: "on", confirmed: true },
    { cat: "Global", hue: "blue", text: "Prefer small, reviewable diffs. One concern per change.", state: "on", confirmed: true },
    { cat: "Task", hue: "yellow", text: "Staging pushes go to release/staging, never main.", state: "on", confirmed: false },
    { cat: "Project", hue: "purple", text: "Legacy editor code in src/legacy is frozen.", state: "off", confirmed: true },
  ];
  return (
    <div className="vcard v-mem">
      <div className="vm-head"><Brain size={16} weight="duotone" /> <b>Memory</b> <span>ZudoMart · 5 facts</span></div>
      {memoryFacts.map((fact) => (
        <div key={fact.text} className={`vm-row${fact.state === "off" ? " off" : ""}`}>
          <span className={`tag tag-${fact.hue}`}>{fact.cat}</span>
          <span className="vm-text">{fact.text}</span>
          <span className={`tag ${fact.confirmed ? "tag-green" : "tag-gray"}`}>{fact.confirmed ? <><SealCheck size={11} weight="fill" /> Confirmed</> : "Inferred"}</span>
          <span className="vm-icon">{fact.state === "off" ? <EyeSlash size={15} /> : <Eye size={15} />}</span>
        </div>
      ))}
      <div className="vm-refuse"><Prohibit size={15} weight="bold" /> <span>Refused to save: <span className="mono">api_key = sk-…</span> looks like a secret.</span></div>
    </div>
  );
}

export function RoutingVisual() {
  const routedPrompts: { prompt: string; cat: string; needs: string; model: string; hue: Hue }[] = [
    { prompt: "Why does checkout round 0.005 up?", cat: "debug", needs: "['code', 'tools']", model: "llama-3.1-nemotron-70b", hue: "red" },
    { prompt: "Summarise this repository for a new hire", cat: "big_context", needs: "['long_context']", model: "llama-3.1-nemotron-70b", hue: "blue" },
    { prompt: "Plan the payments refactor", cat: "plan", needs: "['chat']", model: "llama-3.3-70b-instruct", hue: "gray" },
    { prompt: "Match this screenshot's layout", cat: "multimodal", needs: "['vision']", model: "llama-3.2-90b-vision", hue: "purple" },
  ];
  return (
    <div className="vcard v-route">
      {routedPrompts.map((route) => (
        <div key={route.prompt} className="vr-row">
          <div className="vr-prompt">“{route.prompt}”</div>
          <div className="vr-reason mono"><Sparkle size={12} weight="fill" /> auto classified <b>'{route.cat}'</b>, needs {route.needs}</div>
          <div className="vr-model"><span className={`tag tag-${route.hue}`}>{route.cat}</span><ArrowRight size={13} /><span className="mono">{route.model}</span></div>
        </div>
      ))}
      <div className="vr-foot"><span className="mono">ctx 27,100 / 128,000</span><span className="progress"><i style={{ width: "21%" }} /></span><span>Compressed once · 38,200 → 27,100 tokens</span></div>
    </div>
  );
}
