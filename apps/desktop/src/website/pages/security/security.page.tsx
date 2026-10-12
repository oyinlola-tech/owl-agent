import type { ReactNode } from "react";
import { FingerprintSimple, FolderLock, Globe, Key, LockKey, Prohibit, ShieldCheck } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { Tile, type Hue } from "../../../shared/components/tag.component";
import { PageIntro } from "../../components/pageIntro.component";
import { Reveal } from "../../components/reveal.component";
import { ArchitectureDiagram } from "./architectureDiagram.component";
import "./security.style.css";

const SECURITY_CONTROLS: { icon: Icon; hue: Hue; title: string; body: ReactNode }[] = [
  { icon: FingerprintSimple, hue: "orange", title: "Approvals are bound", body: <>An approval stores a SHA-256 of the tool name and arguments. A different command, path, or flag does not match. Approvals are single use unless granted for the whole task, and expire after 30 minutes by default.</> },
  { icon: FolderLock, hue: "blue", title: "Workspace roots", body: <>Every path is canonicalised and checked against <code>OWL_WORKSPACES</code>. Path traversal and anything that resolves outside a root is rejected. With no roots set, the agent cannot touch files, run commands, or use Git.</> },
  { icon: LockKey, hue: "red", title: "Sensitive paths", body: <><code>.env</code> files, <code>.ssh</code>, <code>.gnupg</code>, private keys, <code>.pem</code>/<code>.key</code>/<code>.p12</code> files, and browser profile databases need explicit authorization, even inside a workspace.</> },
  { icon: Prohibit, hue: "red", title: "Commands", body: <><code>sudo</code>, <code>su</code>, <code>doas</code>, and <code>runas</code> are refused. Recursive deletes, disk tools, permission changes, package installs, and <code>curl</code>/<code>wget</code> are marked high risk on the approval card.</> },
  { icon: Key, hue: "purple", title: "Secrets", body: <>The provider key comes from <code>NVIDIA_API_KEY</code> and is never logged or returned. Environment variables named like KEY, TOKEN, SECRET, or PASSWORD are removed before a command runs, and command, Git, and browser output is scrubbed.</> },
  { icon: Globe, hue: "green", title: "Network", body: <>The service binds to 127.0.0.1. Cross-origin requests are allowed only from the app and any origins you list in <code>OWL_TRUSTED_ORIGINS</code>. Request bodies are size-limited.</> },
];

const HARD_LIMITS = [
  "Write a file without a matching approval",
  "Run a command as root",
  "Read your SSH or GPG keys without explicit authorization",
  "Store a secret in memory",
  "Send your API key to a command, a log, or the API",
  "Push to a remote without asking",
];

export function SecurityPage() {
  return (
    <>
      <PageIntro eyebrow="Security" title="You stay in control of every write."
        lede="OWL is built so the agent can read and propose freely, but anything that changes your machine passes through you. These limits are enforced by the local service, not just the interface." />
      <div className="wrap sec-page">
        <Reveal><ArchitectureDiagram /></Reveal>
        <div className="controls">
          {SECURITY_CONTROLS.map((control, index) => (
            <Reveal key={control.title} delay={index * 50} className="control">
              <Tile icon={control.icon} hue={control.hue} size="lg" />
              <h3>{control.title}</h3>
              <p>{control.body}</p>
            </Reveal>
          ))}
        </div>
        <Reveal className="never">
          <div>
            <span className="eyebrow">Hard limits</span>
            <h2>What OWL never does</h2>
          </div>
          <ul>
            {HARD_LIMITS.map((limit) => <li key={limit}><Prohibit size={18} weight="bold" />{limit}</li>)}
          </ul>
        </Reveal>
        <Reveal className="disclose">
          <ShieldCheck size={22} weight="duotone" />
          <div>
            <b>Found a security issue?</b>
            <p>Please report it privately to the maintainers rather than in a public issue, with steps to reproduce. We will confirm receipt and work on a fix before details are published.</p>
          </div>
        </Reveal>
      </div>
    </>
  );
}
