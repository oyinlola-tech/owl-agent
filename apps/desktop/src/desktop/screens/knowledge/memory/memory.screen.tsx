import { useEffect, useState } from "react";
import {
  ArrowsMerge, Brain, Broom, Check, ClockCounterClockwise, Eye, EyeSlash, FolderSimple, Globe, Lightbulb, ListChecks,
  MagnifyingGlass, PencilSimple, Plus, SealCheck, Trash, X, type Icon,
} from "@phosphor-icons/react";
import { useAppStore } from "../../../state/app.store";
import { agentApi } from "../../../services/agentApi.service";
import { type MemoryHistoryRow, type MemoryRow } from "../../../services/agentApi.types";
import { EmptyState, PageHeader } from "../../../../shared/components/pageLayout.component";
import { Tag, Tile, type Hue } from "../../../../shared/components/tag.component";
import "./memory.style.css";
import { formatShortTimeAgo } from "../../../../shared/helpers/time.helper";

const CATEGORY_STYLE: Record<string, { hue: Hue; icon: Icon; desc: string }> = {
  global: { hue: "blue", icon: Globe, desc: "Applies to every project" },
  project: { hue: "purple", icon: FolderSimple, desc: "Only inside one project" },
  task: { hue: "yellow", icon: ListChecks, desc: "Learned during a task" },
  knowledge: { hue: "green", icon: Lightbulb, desc: "Facts about tools and APIs" },
};
const HISTORY_ACTION_STYLE: Record<string, { hue: Hue; icon: Icon; label: string }> = {
  created: { hue: "green", icon: Plus, label: "Created" },
  updated: { hue: "blue", icon: PencilSimple, label: "Edited" },
  disabled: { hue: "gray", icon: EyeSlash, label: "Disabled" },
  enabled: { hue: "green", icon: Eye, label: "Enabled" },
  deleted: { hue: "red", icon: Trash, label: "Deleted" },
  merged: { hue: "purple", icon: ArrowsMerge, label: "Merged" },
  cleared: { hue: "red", icon: Broom, label: "Cleared" },
};

export function MemoryScreen() {
  const showNotice = useAppStore((s) => s.showNotice);
  const askForConfirmation = useAppStore((s) => s.askForConfirmation);
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [memoryHistory, setMemoryHistory] = useState<MemoryHistoryRow[]>([]);
  const [view, setView] = useState<"list" | "history">("list");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [projectFilter, setProjectFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [tidyResultMessage, setTidyResultMessage] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newCategory, setNewCategory] = useState<MemoryRow["category"]>("project");
  const [newText, setNewText] = useState("");
  const [newConfirmed, setNewConfirmed] = useState(true);
  const [newError, setNewError] = useState("");

  const loadMemories = async () => {
    try {
      const rows = await (searchQuery.trim()
        ? agentApi.searchMemories(searchQuery.trim(), projectFilter.trim())
        : agentApi.memories("", projectFilter.trim()));
      setMemories(rows);
    } catch {
      setMemories([]);
    }
    setLoaded(true);
    setMemoryHistory(await agentApi.memoryHistory().catch(() => [] as MemoryHistoryRow[]));
  };
  useEffect(() => { void loadMemories(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const visibleMemories = memories.filter((memory) => !categoryFilter || memory.category === categoryFilter);
  const countInCategory = (category: string) => (category ? memories.filter((memory) => memory.category === category).length : memories.length);

  const confirmAndDeleteMemory = (memory: MemoryRow) => askForConfirmation({
    title: "Delete this memory?",
    body: `"${memory.text.slice(0, 120)}" will no longer guide the agent. This can't be undone.`,
    confirmLabel: "Delete memory",
    run: async () => {
      try { await agentApi.deleteMemory(memory.id); setMemories((currentMemories) => currentMemories.filter((existing) => existing.id !== memory.id)); showNotice("Memory deleted"); }
      catch { showNotice("The memory service didn't answer."); }
    },
  });
  const toggleMemoryEnabled = async (memory: MemoryRow) => {
    const applyChange = () => setMemories((currentMemories) => currentMemories.map((existing) => (existing.id === memory.id ? { ...existing, enabled: existing.enabled ? 0 : 1 } : existing)));
    try { await agentApi.setMemoryEnabled(memory.id, !memory.enabled); applyChange(); }
    catch { showNotice("The memory service didn't answer."); }
  };
  const saveMemoryEdit = async (id: string) => {
    if (!editDraft.trim()) return;
    try {
      const updated = await agentApi.updateMemory(id, editDraft.trim());
      setMemories((currentMemories) => currentMemories.map((existing) => (existing.id === id ? updated : existing)));
      setEditingId(null);
    } catch { showNotice("The memory service didn't answer."); }
  };
  const addMemory = async () => {
    if (!newText.trim()) { setNewError("Write the fact you want OWL to remember."); return; }
    setNewError("");
    const memoryProject = newCategory === "global" ? "" : projectFilter.trim();
    try {
      const result = await agentApi.saveMemory(newCategory, newText.trim(), memoryProject, newConfirmed);
      if (!result.saved || !result.memory) { setNewError(result.reason ? `Not saved: ${result.reason}` : "Not saved."); return; }
      setMemories((currentMemories) => [result.memory as MemoryRow, ...currentMemories]);
      setNewText(""); setIsAdding(false);
      showNotice("Memory saved");
    } catch { setNewError("The memory service didn't answer. Start it, then save again."); }
  };
  const clearProjectMemories = async () => {
    try { const result = await agentApi.clearProjectMemory(projectFilter.trim()); showNotice(`Cleared ${result.cleared} project memories`); void loadMemories(); }
    catch { showNotice("The memory service didn't answer."); }
  };
  const tidyMemories = async () => {
    try { const result = await agentApi.maintainMemory(projectFilter.trim()); setTidyResultMessage(`Scanned ${result.scanned} memories, merged ${result.merged} duplicates.`); void loadMemories(); }
    catch { showNotice("The memory service didn't answer."); }
  };

  return (
    <div className="page pg-memory">
      <PageHeader
        icon={Brain} hue="pink" title="Memory"
        lede="Facts OWL keeps across sessions. Project memory never leaves its project, and secrets are refused when saved."
        actions={<>
          <button className="btn btn-secondary" onClick={() => void tidyMemories()}><Broom size={15} /> Tidy up</button>
          <button className="btn btn-secondary" disabled={!projectFilter.trim()} onClick={() => askForConfirmation({
            title: `Clear memory for ${projectFilter.trim()}?`,
            body: "Deletes every project memory for this project. Global and knowledge memories are kept.",
            confirmLabel: "Clear project memory",
            run: () => void clearProjectMemories(),
          })}><Trash size={15} /> Clear project</button>
          <button className="btn btn-primary" onClick={() => { setIsAdding(true); setView("list"); }}><Plus size={15} weight="bold" /> New memory</button>
        </>}
      />

      <div className="pg-cats">
        {(Object.keys(CATEGORY_STYLE)).map((category) => {
          const categoryStyle = CATEGORY_STYLE[category];
          return (
            <button key={category} className={categoryFilter === category ? "on" : ""} onClick={() => { setCategoryFilter(categoryFilter === category ? "" : category); setView("list"); }} aria-pressed={categoryFilter === category}>
              <Tile icon={categoryStyle.icon} hue={categoryStyle.hue} />
              <span><b>{countInCategory(category)}</b><span>{category[0].toUpperCase() + category.slice(1)}</span><small>{categoryStyle.desc}</small></span>
            </button>
          );
        })}
      </div>

      <div className="pg-toolbar">
        <div className="seg" aria-label="View">
          <button aria-pressed={view === "list"} onClick={() => setView("list")}><Brain size={14} /> Memories</button>
          <button aria-pressed={view === "history"} onClick={() => setView("history")}><ClockCounterClockwise size={14} /> History</button>
        </div>
        <span className="grow" />
        <div className="input-wrap">
          <MagnifyingGlass size={15} />
          <input className="input" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void loadMemories(); }}
            placeholder="Search memories, then Enter" aria-label="Search memories" />
        </div>
        <div className="input-wrap pg-projfilter">
          <FolderSimple size={15} />
          <input className="input" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void loadMemories(); }}
            placeholder="Project" aria-label="Project filter" />
        </div>
        <button className="btn btn-secondary" onClick={() => void loadMemories()}><MagnifyingGlass size={14} /> Search</button>
      </div>

      {isAdding && (
        <div className="pg-newmem surface">
          <div className="pg-newmem-head"><Tile icon={Plus} hue="pink" /><b>New memory</b><span className="grow" />
            <button className="btn btn-ghost btn-icon btn-sm" aria-label="Close" onClick={() => setIsAdding(false)}><X size={15} /></button></div>
          <div className="seg" aria-label="Category">
            {(["global", "project", "task", "knowledge"] as const).map((category) => {
              const categoryStyle = CATEGORY_STYLE[category];
              return <button key={category} aria-pressed={newCategory === category} onClick={() => setNewCategory(category)}><categoryStyle.icon size={14} /> {category[0].toUpperCase() + category.slice(1)}</button>;
            })}
          </div>
          <textarea className="input pg-textarea" rows={3} value={newText} onChange={(e) => setNewText(e.target.value)} autoFocus
            placeholder={newCategory === "global" ? "Prefer small, reviewable diffs." : "Money is stored in minor units as int64."}
            aria-label="Memory text" aria-invalid={newError ? true : undefined}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void addMemory(); }} />
          {newError && <div className="error-text" role="alert">{newError}</div>}
          <div className="pg-newmem-foot">
            <span className="pg-sm pg-muted">{newCategory === "global" ? "Applies to every project." : <>Saved to <b>{projectFilter.trim() || "no project"}</b>.</>} Secrets are refused.</span>
            <span className="grow" />
            <label className="pg-check"><input type="checkbox" checked={newConfirmed} onChange={(e) => setNewConfirmed(e.target.checked)} /> Confirmed by me</label>
            <button className="btn btn-ghost btn-sm" onClick={() => setIsAdding(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={() => void addMemory()}><Check size={13} weight="bold" /> Save memory</button>
          </div>
        </div>
      )}

      {tidyResultMessage && <p className="pg-note"><Check size={14} /> {tidyResultMessage}</p>}

      {view === "history" ? (
        memoryHistory.length === 0 ? <EmptyState icon={ClockCounterClockwise} title="No history yet" body="Every create, edit, disable, and merge is recorded here." /> : (
          <ol className="pg-steps-v pg-memhist">
            {memoryHistory.map((historyEntry) => {
              const actionStyle = HISTORY_ACTION_STYLE[historyEntry.action] ?? { hue: "gray" as Hue, icon: ClockCounterClockwise, label: historyEntry.action };
              return (
                <li key={historyEntry.id} className="done">
                  <i style={{ background: `var(--${actionStyle.hue}-bg)`, color: `var(--${actionStyle.hue})` }}><actionStyle.icon size={12} weight="bold" /></i>
                  <span><b>{actionStyle.label}</b><small>{historyEntry.text}</small></span>
                  <span className="pg-sm pg-muted">{formatShortTimeAgo(historyEntry.created_at)}</span>
                </li>
              );
            })}
          </ol>
        )
      ) : !loaded ? (
        <div className="pg-skel">{[80, 64, 72].map((width, index) => <span key={index} className="skel-line" style={{ width: `${width}%`, height: 16 }} />)}</div>
      ) : visibleMemories.length > 0 ? (
        <div className="pg-mem">
          {visibleMemories.map((memory) => {
            const categoryStyle = CATEGORY_STYLE[memory.category] ?? { hue: "gray" as Hue, icon: Brain };
            return (
              <div key={memory.id} className={`pg-memrow${memory.enabled ? "" : " off"}`}>
                <Tile icon={categoryStyle.icon} hue={categoryStyle.hue} />
                <div>
                  <div className="tags">
                    <Tag hue={categoryStyle.hue}>{memory.category}</Tag>
                    {memory.project && <Tag icon={FolderSimple}>{memory.project}</Tag>}
                    {memory.confirmed ? <Tag hue="green" icon={SealCheck}>Confirmed</Tag> : <Tag>Inferred</Tag>}
                    {!memory.enabled && <Tag icon={EyeSlash}>Disabled</Tag>}
                    <span className="pg-sm pg-muted">{formatShortTimeAgo(memory.updated_at)}</span>
                  </div>
                  {editingId === memory.id ? (
                    <div className="pg-memedit">
                      <input className="input" value={editDraft} onChange={(e) => setEditDraft(e.target.value)} aria-label="Edit memory" autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") void saveMemoryEdit(memory.id); if (e.key === "Escape") setEditingId(null); }} />
                      <button className="btn btn-primary btn-sm" onClick={() => void saveMemoryEdit(memory.id)}><Check size={13} weight="bold" /> Save</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}><X size={13} /> Cancel</button>
                    </div>
                  ) : (
                    <p>{memory.text}</p>
                  )}
                </div>
                {editingId !== memory.id && (
                  <div className="acts">
                    <button className="btn btn-ghost btn-icon btn-sm" aria-label="Edit memory" title="Edit" onClick={() => { setEditingId(memory.id); setEditDraft(memory.text); }}><PencilSimple size={15} /></button>
                    <button className="btn btn-ghost btn-icon btn-sm" aria-label={memory.enabled ? "Disable memory" : "Enable memory"} title={memory.enabled ? "Disable" : "Enable"} onClick={() => void toggleMemoryEnabled(memory)}>
                      {memory.enabled ? <EyeSlash size={15} /> : <Eye size={15} />}
                    </button>
                    <button className="btn btn-ghost btn-icon btn-sm" aria-label="Delete memory" title="Delete" onClick={() => confirmAndDeleteMemory(memory)}><Trash size={15} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={Brain} hue="pink" title={searchQuery ? `No memories match "${searchQuery}"` : categoryFilter ? `No ${categoryFilter} memories` : "No memories here yet"}
          body={searchQuery ? "Try a shorter search or another project." : "Save a rule once, like how money is stored, and every task in the project follows it."}>
          {(searchQuery || categoryFilter) && <button className="btn btn-secondary" onClick={() => { setSearchQuery(""); setCategoryFilter(""); }}>Show all</button>}
          <button className="btn btn-primary" onClick={() => setIsAdding(true)}><Plus size={14} weight="bold" /> New memory</button>
        </EmptyState>
      )}
    </div>
  );
}
