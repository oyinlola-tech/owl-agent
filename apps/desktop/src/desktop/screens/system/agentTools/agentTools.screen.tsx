import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight, Fingerprint, Folder, GitBranch, Globe, LockKey, ShieldCheck, Terminal, Wrench, type Icon,
} from "@phosphor-icons/react";
import { useAppStore } from "../../../state/app.store";
import { agentApi, isServiceAuthError } from "../../../services/agentApi.service";
import { type ToolRead } from "../../../services/agentApi.types";
import { EmptyState, PageHeader } from "../../../../shared/components/pageLayout.component";
import { Tag, type Hue } from "../../../../shared/components/tag.component";
import "./agentTools.style.css";

const TOOL_GROUPS: { prefix: string; title: string; icon: Icon; hue: Hue; blurb: string }[] = [
  { prefix: "fs_", title: "Files", icon: Folder, hue: "blue", blurb: "Read, search, and change files inside the authorized project folder. Edits are proposed as a diff first." },
  { prefix: "git_", title: "Git", icon: GitBranch, hue: "brown", blurb: "Inspect history and status freely. Commits and pushes always ask." },
  { prefix: "exec_", title: "Terminal", icon: Terminal, hue: "purple", blurb: "Run a command as an argument list, never through a shell string, with a timeout and output limit." },
  { prefix: "browser_", title: "Browser", icon: Globe, hue: "green", blurb: "Open a public page and read its title and text for recreation and research." },
];

export function AgentToolsScreen() {
  const goToScreen = useAppStore((s) => s.goToScreen);
  const [tools, setTools] = useState<ToolRead[]>([]);
  const [failure, setFailure] = useState<"none" | "offline" | "unauthorized">("none");

  const loadTools = useCallback(async () => {
    try {
      setTools(await agentApi.tools());
      setFailure("none");
    } catch (error) {
      setTools([]);
      setFailure(isServiceAuthError(error) ? "unauthorized" : "offline");
    }
  }, []);
  useEffect(() => { void loadTools(); }, [loadTools]);

  const approvalGatedCount = tools.filter((tool) => tool.requires_approval).length;
  const otherTools = tools.filter((tool) => !TOOL_GROUPS.some((group) => tool.name.startsWith(group.prefix)));
  const toolGroups = [...TOOL_GROUPS.map((group) => ({ ...group, tools: tools.filter((tool) => tool.name.startsWith(group.prefix)) })),
    ...(otherTools.length ? [{ prefix: "", title: "Other", icon: Wrench, hue: "gray" as Hue, blurb: "Additional tools registered by the service.", tools: otherTools }] : [])]
    .filter((group) => group.tools.length > 0);

  return (
    <div className="page x-tools">
      <PageHeader
        icon={Wrench} hue="purple" title="Agent tools"
        lede="Every action OWL can take, and which ones stop for your approval. The service enforces this list, not the app."
        actions={<button className="btn btn-secondary" onClick={() => goToScreen("settings")}>
          <ShieldCheck size={15} /> Permission settings <ArrowRight size={14} />
        </button>}
      />
      {failure !== "none" && (
        <EmptyState icon={Wrench} hue={failure === "unauthorized" ? "orange" : "red"}
          title={failure === "unauthorized" ? "Sign in to the local service" : "OWL's local service isn't running"}
          body={failure === "unauthorized" ? "The desktop app couldn't authenticate with the local service." : "Start the OWL service to see the tools it exposes."}>
          <button className="btn btn-secondary" onClick={() => void loadTools()}>Retry</button>
        </EmptyState>
      )}

      {failure === "none" && (<>
      <div className="x-tool-summary">
        <div><b>{tools.length}</b><span>tools available</span></div>
        <div><b className="x-green">{tools.length - approvalGatedCount}</b><span>run freely (read-only)</span></div>
        <div><b className="x-orange">{approvalGatedCount}</b><span>need your approval</span></div>
      </div>

      <div className="callout purple x-bound">
        <Fingerprint size={18} weight="duotone" />
        <div>
          <b>How an approval is bound.</b> When you approve, the service records the exact action and a hash of its
          arguments, with an expiry. The approval is used once. If OWL tries a different command, different files, or
          runs after the approval expires, it has to ask again.
        </div>
      </div>

      {toolGroups.map((group) => (
        <section key={group.title} className="x-tool-group">
          <header>
            <span className={`tile tile-lg ${group.hue}`}><group.icon size={20} weight="duotone" /></span>
            <div>
              <h3>{group.title} <span className="x-count">{group.tools.length}</span></h3>
              <p>{group.blurb}</p>
            </div>
          </header>
          <ul className="x-tool-list">
            {group.tools.map((tool) => (
              <li key={tool.name}>
                <code>{tool.name}</code>
                <span className="x-tool-desc">{tool.description.replace(/\s*Requires (a bound )?approval\.?/i, "").trim()}</span>
                {tool.requires_approval
                  ? <Tag hue="orange" icon={LockKey}>Needs approval</Tag>
                  : <Tag hue="green" dot>Runs freely</Tag>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      </>)}
    </div>
  );
}
