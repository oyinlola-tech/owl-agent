import {
  FingerprintSimple, FolderSimple, GitCommit, Globe, ListChecks, LockKey, PencilSimple, Prohibit, TerminalWindow,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { Tag, type Hue } from "../../../shared/components/tag.component";
import { Reveal } from "../../components/reveal.component";
import { SectionHeading } from "../sectionHeading.component";
import "./trust.style.css";

const DEFAULT_PERMISSIONS: { icon: Icon; cap: string; def: { hue: Hue; label: string }; scope: string }[] = [
  { icon: FolderSimple, cap: "File reads", def: { hue: "green", label: "Allowed" }, scope: "Only inside the roots in OWL_WORKSPACES" },
  { icon: PencilSimple, cap: "File writes", def: { hue: "orange", label: "Ask" }, scope: "Proposed as a diff, applied only with a bound approval" },
  { icon: TerminalWindow, cap: "Commands", def: { hue: "orange", label: "Ask" }, scope: "Shows command, folder, reason, and risk" },
  { icon: GitCommit, cap: "Git commit and push", def: { hue: "orange", label: "Ask" }, scope: "Status, diff, and log stay read-only" },
  { icon: LockKey, cap: "Sensitive paths", def: { hue: "red", label: "Blocked" }, scope: ".env, .ssh, .gnupg, private keys, browser profiles" },
  { icon: Prohibit, cap: "Privilege escalation", def: { hue: "red", label: "Refused" }, scope: "sudo, su, doas, runas" },
  { icon: FingerprintSimple, cap: "Secrets in environment", def: { hue: "gray", label: "Stripped" }, scope: "KEY, TOKEN, SECRET, PASSWORD vars removed before a command runs" },
  { icon: Globe, cap: "Public web pages", def: { hue: "blue", label: "Read-only" }, scope: "Title and text for previews and recreation" },
];

export function PermissionsSection() {
  return (
    <section className="section" id="permissions">
      <div className="wrap">
        <SectionHeading eyebrow="Permissions" title="You set the limits. OWL asks at the edges."
          lede="Defaults are strict and enforced by the local service, not just the interface." />
        <Reveal className="db">
          <div className="db-bar">
            <span className="db-view"><ListChecks size={14} /> Default policy</span>
            <span className="db-title">8 capabilities</span>
          </div>
          <div className="db-scroll">
            <table>
              <thead><tr><th>Capability</th><th>Default</th><th>Scope</th></tr></thead>
              <tbody>
                {DEFAULT_PERMISSIONS.map((permission) => (
                  <tr key={permission.cap}>
                    <td><span className="db-cap"><permission.icon size={17} />{permission.cap}</span></td>
                    <td><Tag hue={permission.def.hue} dot>{permission.def.label}</Tag></td>
                    <td className="db-scope">{permission.scope}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
