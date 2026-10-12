import { useMemo, useState } from "react";
import {
  ArrowRight, ArrowUp, Browser, ChartBar, CheckCircle, Clock, Cpu, FolderOpen, FolderSimple, MagnifyingGlass, Plus,
  Rocket, SealCheck, ShieldWarning, SpinnerGap, Wrench, X, XCircle, type Icon,
} from "@phosphor-icons/react";
import { useAppStore } from "../../state/app.store";
import { pendingApprovalKey, usePendingApprovalsStore } from "../../state/pendingApprovals.store";
import { isFinishedStatus, hueForStatus } from "../../../shared/components/statusTag.component";
import { EmptyState } from "../../../shared/components/pageLayout.component";
import { OwlMark } from "../../../shared/components/owlMark.component";
import { Tag, Tile, type Hue } from "../../../shared/components/tag.component";
import { formatShortTimeAgo } from "../../../shared/helpers/time.helper";
import { useProjects } from "../../hooks/useProjects.hook";
import { useDisplayName } from "../../hooks/profile/useDisplayName.hook";
import { useBackendWork } from "./backendWork.hook";
import { HomeOverviewRail } from "./homeOverviewRail.component";
import { hueForName, stackLabel } from "./projectStyle.helper";
import "./styles/home.style.css";

const QUICK_START_PROMPTS: { label: string; description: string; icon: Icon; hue: Hue; prompt: string }[] = [
  { label: "Build an app", description: "Scaffold, wire up, and test a new feature", icon: Rocket, hue: "blue", prompt: "Build a new feature end to end, with tests" },
  { label: "Fix a project", description: "Reproduce a bug and land a verified fix", icon: Wrench, hue: "red", prompt: "Reproduce the failing behaviour, fix it, and prove it with a test" },
  { label: "Review code", description: "Read the diff and flag risky changes", icon: MagnifyingGlass, hue: "yellow", prompt: "Review the current diff and flag risky changes" },
  { label: "Recreate a website", description: "Study a public page, write fresh code", icon: Browser, hue: "purple", prompt: "Recreate the layout of a public page as fresh components" },
  { label: "Analyze repository", description: "Map structure, owners, and hotspots", icon: ChartBar, hue: "green", prompt: "Map the repository structure, owners, and hotspots" },
];

const BACKEND_STATUS_ACTIVITY: Record<string, [Icon, string]> = {
  completed: [CheckCircle, "Completed"], completed_unverified: [CheckCircle, "Completed, not verified"],
  verified_completed: [SealCheck, "Verified"], failed: [XCircle, "Failed"], awaiting_approval: [ShieldWarning, "Needs approval"],
  running: [SpinnerGap, "Working"], paused: [Clock, "Paused"], cancelled: [X, "Cancelled"],
};

interface ActivityItem { id: string; icon: Icon; hue: Hue; title: string; subtitle: string; when: string; open?: () => void }

function greetingForHour(hour: number) {
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export function HomeScreen() {
  const openProject = useAppStore((s) => s.openProject);
  const setCreateProjectOpen = useAppStore((s) => s.setCreateProjectOpen);
  const goToScreen = useAppStore((s) => s.goToScreen);
  const setDraft = useAppStore((s) => s.setDraft);
  const openBackendTask = useAppStore((s) => s.openBackendTask);
  const project = useAppStore((s) => s.project);
  const preferredModel = useAppStore((s) => s.preferredModel);
  const showNotice = useAppStore((s) => s.showNotice);
  const { projects } = useProjects();
  const displayName = useDisplayName();
  const { backendTasks, pendingApprovals: allBackendApprovals } = useBackendWork();
  const decidedApprovals = usePendingApprovalsStore((s) => s.decided);
  const backendPendingApprovals = allBackendApprovals.filter(
    (item) => !decidedApprovals[pendingApprovalKey(item.task.id, item.approval.id)],
  );
  const [taskText, setTaskText] = useState("");
  const greeting = greetingForHour(new Date().getHours());
  const runningCount = backendTasks.filter((task) => task.status === "running").length;
  const completedCount = backendTasks.filter((task) => isFinishedStatus(task.status)).length;
  const pendingCount = backendPendingApprovals.length;
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const startTask = (prompt?: string) => {
    const trimmedPrompt = (prompt ?? taskText).trim();
    const target = project ?? projects[0];
    if (!target) { showNotice("Add a project first, then describe a task."); setCreateProjectOpen(true); return; }
    if (trimmedPrompt) setDraft(trimmedPrompt);
    openProject(target);
  };

  const recentActivity = useMemo(() => {
    return [...backendTasks]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 6)
      .map<ActivityItem>((task) => {
        const [StatusIcon, verb] = BACKEND_STATUS_ACTIVITY[task.status] ?? [Clock, task.status];
        return {
          id: task.id, icon: StatusIcon, hue: hueForStatus(task.status), title: task.prompt,
          subtitle: `${verb} · ${task.project || "No project"}`, when: formatShortTimeAgo(task.updated_at),
          open: () => openBackendTask(task.id),
        };
      });
  }, [backendTasks, openBackendTask]);

  return (
    <div className="page pg-home">
      <div className="pg-home-grid">
        <div className="pg-home-main">
          <div className="pg-hello anim-in">
            <OwlMark size={40} />
            <p className="eyebrow">{today}</p>
            <h1>{greeting}{displayName ? `, ${displayName}` : ""}.<br /><span>What are we building?</span></h1>
            <p>Describe a task. OWL reads the project, shows a plan, and waits for your approval before changing anything.</p>
          </div>

          <div className="pg-composer">
            <textarea
              rows={2}
              value={taskText}
              onChange={(e) => setTaskText(e.target.value)}
              placeholder="Add JWT login to the API, with tests…"
              aria-label="Describe what you want to build"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); startTask(); } }}
            />
            <div className="pg-composer-foot">
              <button className="pg-chip" onClick={() => goToScreen("projects")} title="Change project"><FolderSimple size={14} /><b>Project</b> {project?.name ?? projects[0]?.name ?? "None"}</button>
              <button className="pg-chip" onClick={() => goToScreen("settings")} title="Change model"><Cpu size={14} /><b>Model</b> {preferredModel === "auto" ? "Auto" : preferredModel}</button>
              <span className="pg-chip hide-m"><ShieldWarning size={14} /><b>Approval</b> Every edit</span>
              <span className="grow" />
              <span className="pg-composer-hint hide-m"><kbd>Enter</kbd> to open · <kbd>Shift</kbd><kbd>Enter</kbd> new line</span>
              <button className="btn btn-primary pg-send" onClick={() => startTask()} aria-label="Start task"><ArrowUp size={16} weight="bold" /></button>
            </div>
          </div>

          <div className="pg-label">Start from</div>
          <div className="pg-quick">
            {QUICK_START_PROMPTS.map((quickStart) => (
              <button key={quickStart.label} onClick={() => startTask(quickStart.prompt)}>
                <Tile icon={quickStart.icon} hue={quickStart.hue} />
                <span><b>{quickStart.label}</b><span className="d">{quickStart.description}</span></span>
              </button>
            ))}
          </div>

          <div className="pg-label">
            Recent activity<span className="grow" />
            <button className="btn btn-ghost btn-sm" onClick={() => goToScreen("tasks")}>All tasks <ArrowRight size={13} /></button>
          </div>
          {recentActivity.length > 0 ? (
            <ol className="pg-feed">
              {recentActivity.map((activity) => (
                <li key={activity.id}>
                  <button onClick={activity.open}>
                    <Tile icon={activity.icon} hue={activity.hue} />
                    <span className="b"><b>{activity.title}</b><small>{activity.subtitle}</small></span>
                    <span className="when">{activity.when}</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState icon={Clock} title="Nothing has happened yet" body="Open a project and describe a task; every read, edit, and command shows up here." />
          )}

          <div className="pg-label">
            Your projects<span className="grow" />
            <button className="btn btn-ghost btn-sm" onClick={() => setCreateProjectOpen(true)}><Plus size={13} weight="bold" /> Add</button>
            <button className="btn btn-ghost btn-sm" onClick={() => goToScreen("projects")}>All projects <ArrowRight size={13} /></button>
          </div>
          {projects.length > 0 ? (
            <div className="pg-projrow">
              {projects.slice(0, 4).map((item) => {
                const label = stackLabel(item);
                const hue = hueForName(item.name);
                return (
                  <button key={item.id} className="pg-projmini" onClick={() => openProject(item)}>
                    <span className="cov" style={{ background: `var(--${hue}-bg)`, color: `var(--${hue})` }} />
                    <Tile icon={FolderOpen} hue={hue} />
                    <b>{item.name}</b>
                    <span className="meta">{label && <Tag hue={hue}>{label}</Tag>}<span>{item.last_opened_at ? formatShortTimeAgo(item.last_opened_at) : "new"}</span></span>
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={FolderOpen} hue="blue" title="No projects yet" body="Point OWL at a folder on this computer to get started. It only reads and writes inside the folders you choose.">
              <button className="btn btn-primary" onClick={() => setCreateProjectOpen(true)}><Plus size={14} weight="bold" /> Open your first project</button>
            </EmptyState>
          )}
        </div>

        <HomeOverviewRail
          backendTasks={backendTasks}
          backendPendingApprovals={backendPendingApprovals}
          pendingCount={pendingCount}
          runningCount={runningCount}
          completedCount={completedCount}
        />
      </div>
    </div>
  );
}
