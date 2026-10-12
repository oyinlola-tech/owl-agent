import { useState } from "react";
import { BookOpenText, ListChecks, MagnifyingGlass, ShieldCheck } from "@phosphor-icons/react";
import { useAppStore } from "../../../state/app.store";
import { agentApi } from "../../../services/agentApi.service";
import type { Project } from "../../../services/agentApi.types";
import { useProjects } from "../../../hooks/useProjects.hook";
import { PageHeader } from "../../../../shared/components/pageLayout.component";
import { copyTextAndNotify } from "../../../../shared/helpers/clipboard.helper";
import { PLAYBOOK_CATEGORIES, PLAYBOOKS, type Playbook, type PlaybookCategory } from "./playbookCatalog.data";
import { PlaybookDrawer } from "./playbookDrawer.component";
import "./playbooks.style.css";

export function PlaybooksScreen() {
  const goToScreen = useAppStore((s) => s.goToScreen);
  const showNotice = useAppStore((s) => s.showNotice);
  const setDraft = useAppStore((s) => s.setDraft);
  const setCenterTab = useAppStore((s) => s.setCenterTab);
  const openProject = useAppStore((s) => s.openProject);
  const openBackendTask = useAppStore((s) => s.openBackendTask);
  const currentProject = useAppStore((s) => s.project);
  const { projects } = useProjects();

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<PlaybookCategory | "All">("All");
  const [openPlaybook, setOpenPlaybook] = useState<Playbook | null>(null);

  const matchingPlaybooks = PLAYBOOKS.filter((playbook) =>
    (categoryFilter === "All" || playbook.cat === categoryFilter) &&
    (playbook.title + playbook.outcome + playbook.tools.join(" ")).toLowerCase().includes(searchQuery.trim().toLowerCase()),
  );
  const playbooksByCategory = PLAYBOOK_CATEGORIES
    .map((category) => ({ ...category, items: matchingPlaybooks.filter((playbook) => playbook.cat === category.id) }))
    .filter((group) => group.items.length > 0);

  const runInWorkspace = (prompt: string, project: Project | null) => {
    if (!project) { showNotice("Add a project first, then run a playbook"); return; }
    if (currentProject?.id !== project.id) openProject(project);
    setDraft(prompt);
    setCenterTab("chat");
    goToScreen("workspace");
    showNotice("Prompt ready in the workspace — press Enter to send");
  };

  const startBackendTask = async (prompt: string, project: Project | null) => {
    if (!project) { showNotice("Add a project first, then run a playbook"); return; }
    try {
      const task = await agentApi.createBackendTask(prompt, project.name, project.path);
      showNotice("Task started");
      openBackendTask(task.id);
    } catch {
      showNotice("The OWL service isn't running — run it in the workspace or copy the prompt");
    }
  };

  return (
    <div className="page x-playbooks">
      <PageHeader
        icon={BookOpenText} hue="green" title="Playbooks"
        lede="Tested starting points for common jobs. Each one is a prompt and a plan you can edit before OWL starts."
      />
      <div className="x-toolbar">
        <div className="seg x-seg-scroll" role="tablist" aria-label="Category">
          {(["All", ...PLAYBOOK_CATEGORIES.map((category) => category.id)] as const).map((category) => (
            <button key={category} role="tab" aria-selected={categoryFilter === category} onClick={() => setCategoryFilter(category)}>
              {category} <span className="x-count">{category === "All" ? PLAYBOOKS.length : PLAYBOOKS.filter((playbook) => playbook.cat === category).length}</span>
            </button>
          ))}
        </div>
        <span className="grow" />
        <div className="input-wrap x-search">
          <MagnifyingGlass size={15} />
          <input className="input" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search playbooks" aria-label="Search playbooks" />
        </div>
      </div>

      {playbooksByCategory.length === 0 && (
        <div className="empty-state">
          <span className="tile tile-lg green"><BookOpenText size={20} weight="duotone" /></span>
          <h4>No playbook matches “{searchQuery}”</h4>
          <p>Describe the job in your own words on the Home screen instead.</p>
          <div className="row"><button className="btn btn-secondary" onClick={() => { setSearchQuery(""); setCategoryFilter("All"); }}>Clear search</button></div>
        </div>
      )}

      {playbooksByCategory.map((group) => (
        <section key={group.id} className="x-pb-group">
          <h3 className="x-pb-cat"><group.icon size={16} weight="duotone" className={`x-hue-${group.hue}`} /> {group.id}</h3>
          <div className="x-pb-grid">
            {group.items.map((playbook) => (
              <button key={playbook.id} className="x-pb-card" onClick={() => setOpenPlaybook(playbook)}>
                <span className={`tile tile-lg ${playbook.hue}`}><playbook.icon size={20} weight="duotone" /></span>
                <b>{playbook.title}</b>
                <span className="x-pb-out">{playbook.outcome}</span>
                <span className="x-pb-meta">
                  <span><ListChecks size={13} /> {playbook.steps.length} steps</span>
                  <span className={playbook.approvals ? "x-orange" : "x-green"}>
                    <ShieldCheck size={13} /> {playbook.approvals ? `${playbook.approvals} approval${playbook.approvals > 1 ? "s" : ""}` : "Read-only"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}

      {openPlaybook && (
        <PlaybookDrawer
          playbook={openPlaybook}
          projects={projects}
          defaultProjectId={currentProject?.id ?? projects[0]?.id ?? ""}
          onClose={() => setOpenPlaybook(null)}
          onRunInWorkspace={runInWorkspace}
          onStartBackendTask={startBackendTask}
          onCopyPrompt={(prompt) => copyTextAndNotify(prompt, showNotice, "Prompt copied", "Copy failed — select the text instead")}
        />
      )}
    </div>
  );
}
