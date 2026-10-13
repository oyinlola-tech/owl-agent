import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight, Fingerprint, Folder, GitBranch, Globe, LockKey, PencilSimple, Plus, ShieldCheck, Terminal, Trash, Wrench, X, type Icon,
} from "@phosphor-icons/react";
import { useAppStore } from "../../../state/app.store";
import { agentApi, isServiceAuthError } from "../../../services/agentApi.service";
import { type CustomToolRead, type ToolRead } from "../../../services/agentApi.types";
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
      <CustomToolsSection />
      </>)}
    </div>
  );
}

const CUSTOM_TOOL_NAME_PATTERN = /^[a-z0-9-]{1,40}$/;

function CustomToolsSection() {
  const [items, setItems] = useState<CustomToolRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CustomToolRead | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [argvText, setArgvText] = useState("");
  const [risk, setRisk] = useState<"low" | "medium" | "high">("high");
  const [project, setProject] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadCustomTools = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await agentApi.customTools());
    } catch {
      setItems([]);
      setError("Couldn't load custom tools.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void loadCustomTools(); }, [loadCustomTools]);

  function openAddForm() {
    setEditing(null);
    setName("");
    setDescription("");
    setArgvText("");
    setRisk("high");
    setProject("");
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(tool: CustomToolRead) {
    setEditing(tool);
    setName(tool.name);
    setDescription(tool.description);
    setArgvText(tool.argv.join("\n"));
    setRisk(tool.risk);
    setProject(tool.project);
    setFormError(null);
    setShowForm(true);
  }

  function parseArgv(text: string): string[] {
    return text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  }

  async function saveForm() {
    const argv = parseArgv(argvText);
    if (!editing && !CUSTOM_TOOL_NAME_PATTERN.test(name)) {
      setFormError("Name must be 1-40 lowercase letters, numbers, or hyphens.");
      return;
    }
    if (!description.trim()) {
      setFormError("Description is required.");
      return;
    }
    if (argv.length === 0) {
      setFormError("Command needs at least one argument, one per line.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        const updated = await agentApi.updateCustomTool(editing.id, {
          description: description.trim(), argv, risk, project: project.trim(),
        });
        setItems((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      } else {
        const created = await agentApi.createCustomTool({
          name: name.trim(), description: description.trim(), argv, risk, project: project.trim(),
        });
        setItems((prev) => [created, ...prev]);
      }
      setShowForm(false);
      setEditing(null);
    } catch {
      setFormError(editing ? "Couldn't save the custom tool." : "Couldn't create the custom tool. It may already exist.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(tool: CustomToolRead) {
    setBusyId(tool.id);
    try {
      await agentApi.setCustomToolEnabled(tool.id, !tool.enabled);
      setItems((prev) => prev.map((t) => (t.id === tool.id ? { ...t, enabled: !t.enabled } : t)));
    } catch {
      setError("Couldn't change the custom tool.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteTool(tool: CustomToolRead) {
    setBusyId(tool.id);
    try {
      await agentApi.deleteCustomTool(tool.id);
      setItems((prev) => prev.filter((t) => t.id !== tool.id));
      setConfirmDeleteId(null);
    } catch {
      setError("Couldn't delete the custom tool.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-label="Custom tools" className="x-tool-group">
      <header>
        <span className="tile tile-lg purple"><Wrench size={20} weight="duotone" /></span>
        <div>
          <h3>Custom tools <span className="x-count">{items.length}</span></h3>
          <p>Your own commands, running as argument lists through the same approvals and audit trail as built-in tools. New tools stay disabled until you enable them.</p>
        </div>
      </header>

      {loading && <p role="status">Loading custom tools…</p>}
      {!loading && error && (
        <div role="alert" className="callout red">
          <p>{error}</p>
          <button className="btn btn-secondary" onClick={() => void loadCustomTools()}>Retry</button>
        </div>
      )}

      {!loading && !error && (<>
        {items.length === 0 && !showForm && (
          <p>No custom tools yet. Add one to give OWL a command of your own.</p>
        )}
        {items.length > 0 && (
          <ul aria-label="Custom tool list" className="x-tool-list x-custom-list">
            {items.map((tool) => (
              <li key={tool.id}>
                <code>custom-{tool.name}</code>
                <span className="x-tool-desc">
                  {tool.description}
                  <span className="x-custom-argv">{tool.argv.join(" ")}</span>
                  {tool.project && <span className="x-custom-scope">Scoped to {tool.project}</span>}
                </span>
                <span className="x-custom-tags">
                  {tool.risk === "high"
                    ? <Tag hue="orange" icon={LockKey}>High risk</Tag>
                    : <Tag hue={tool.risk === "medium" ? "brown" : "green"} dot>{tool.risk === "medium" ? "Medium risk" : "Low risk"}</Tag>}
                  {tool.enabled
                    ? <Tag hue="green" dot>Enabled</Tag>
                    : <Tag hue="gray">Disabled</Tag>}
                </span>
                <span className="x-custom-actions">
                  <button
                    className="btn btn-secondary"
                    aria-label={`${tool.enabled ? "Disable" : "Enable"} custom tool ${tool.name}`}
                    disabled={busyId === tool.id}
                    onClick={() => void toggleEnabled(tool)}
                  >
                    {tool.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    className="btn btn-secondary"
                    aria-label={`Edit custom tool ${tool.name}`}
                    onClick={() => openEditForm(tool)}
                  >
                    <PencilSimple size={14} /> Edit
                  </button>
                  {confirmDeleteId === tool.id ? (
                    <span role="group" aria-label={`Confirm deleting custom tool ${tool.name}`}>
                      <button
                        className="btn btn-secondary"
                        disabled={busyId === tool.id}
                        onClick={() => void deleteTool(tool)}
                      >
                        <Trash size={14} /> Confirm delete
                      </button>
                      <button className="btn btn-secondary" onClick={() => setConfirmDeleteId(null)}>
                        <X size={14} /> Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      className="btn btn-secondary"
                      aria-label={`Delete custom tool ${tool.name}`}
                      onClick={() => setConfirmDeleteId(tool.id)}
                    >
                      <Trash size={14} /> Delete
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {!showForm && (
          <p>
            <button className="btn btn-secondary" onClick={openAddForm}>
              <Plus size={14} /> Add custom tool
            </button>
          </p>
        )}

        {showForm && (
          <form
            aria-label={editing ? `Edit custom tool ${editing.name}` : "Add custom tool"}
            className="x-custom-form"
            onSubmit={(e) => { e.preventDefault(); void saveForm(); }}
          >
            <div className="x-fields">
              <label className="x-field" htmlFor="x-custom-name">
                <span>Name</span>
                <input
                  id="x-custom-name"
                  className="input"
                  value={name}
                  disabled={editing !== null}
                  placeholder="lint"
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="x-field" htmlFor="x-custom-risk">
                <span>Risk level</span>
                <select
                  id="x-custom-risk"
                  className="input"
                  value={risk}
                  onChange={(e) => setRisk(e.target.value as "low" | "medium" | "high")}
                >
                  <option value="high">High — always confirm</option>
                  <option value="medium">Medium — confirm</option>
                  <option value="low">Low</option>
                </select>
              </label>
            </div>
            <label className="x-field" htmlFor="x-custom-description">
              <span>Description</span>
              <input
                id="x-custom-description"
                className="input"
                value={description}
                placeholder="Run the linter."
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="x-field" htmlFor="x-custom-argv">
              <span>Command, one argument per line. Use {"{args}"} where extra arguments go.</span>
              <textarea
                id="x-custom-argv"
                className="input x-textarea"
                value={argvText}
                rows={3}
                placeholder={"make\nlint\n{args}"}
                onChange={(e) => setArgvText(e.target.value)}
              />
            </label>
            <label className="x-field" htmlFor="x-custom-project">
              <span>Project scope (empty means every project)</span>
              <input
                id="x-custom-project"
                className="input"
                value={project}
                placeholder="my-project"
                onChange={(e) => setProject(e.target.value)}
              />
            </label>
            {formError && <p role="alert" className="x-custom-error">{formError}</p>}
            <div className="x-custom-form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : editing ? "Save changes" : "Add custom tool"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setEditing(null); }}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </>)}
    </section>
  );
}
