import { useEffect, useState } from "react";
import { CaretDown, CaretRight, MagnifyingGlass, Plus, Rows, SidebarSimple, Sparkle } from "@phosphor-icons/react";
import { useAppStore } from "../../state/app.store";
import { agentApi } from "../../services/agentApi.service";
import type { BackendTask } from "../../services/agentApi.types";
import type { AppScreen } from "../../state/workspace.types";
import { usePendingApprovalCount } from "../../state/pendingApprovals.store";
import { hueForStatus } from "../../../shared/components/statusTag.component";
import { readStoredValue, writeStoredFlag } from "../../../shared/helpers/storage.helper";
import { NAV_GROUPS, SCREEN_META } from "../screenCatalog.data";
import { useSidebarCollapsed } from "./sidebarCollapsed.hook";
import { ProjectSwitcher } from "./projectSwitcher.component";
import { AccountMenu } from "./accountMenu.component";
import "./sidebar.style.css";

const RECENT_TASKS_STORAGE_KEY = "owl-sb-recent";

export function Sidebar() {
  const screen = useAppStore((s) => s.screen);
  const goToScreen = useAppStore((s) => s.goToScreen);
  const openBackendTask = useAppStore((s) => s.openBackendTask);
  const openBackendTaskId = useAppStore((s) => s.openBackendTaskId);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const setAskOwlOpen = useAppStore((s) => s.setAskOwlOpen);
  const startNewTask = useAppStore((s) => s.startNewTask);
  const pendingCount = usePendingApprovalCount();
  const { collapsed, narrow, toggle } = useSidebarCollapsed();
  const [recentTasks, setRecentTasks] = useState<BackendTask[]>([]);
  const [recentOpen, setRecentOpen] = useState(() => readStoredValue(RECENT_TASKS_STORAGE_KEY) !== "0");
  useEffect(() => {
    let alive = true;
    agentApi.backendTasks()
      .then((tasks) => { if (alive) setRecentTasks([...tasks].sort((a, b) => b.updated_at.localeCompare(a.updated_at))); })
      .catch(() => { if (alive) setRecentTasks([]); });
    return () => { alive = false; };
  }, [screen]);
  const toggleRecentTasks = () => {
    const next = !recentOpen;
    setRecentOpen(next);
    writeStoredFlag(RECENT_TASKS_STORAGE_KEY, next);
  };

  const isScreenActive = (item: AppScreen) => screen === item || (item === "tasks" && (screen === "task" || screen === "btask"));

  return (
    <nav className={`sb${collapsed ? " sb-collapsed" : ""}`} aria-label="Primary">
      <div className="sb-top">
        <ProjectSwitcher collapsed={collapsed} />
        {!narrow && (
          <button className="sb-collapse" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            data-tip={collapsed ? "Expand sidebar" : undefined} title={collapsed ? undefined : "Collapse sidebar"}>
            <SidebarSimple size={16} />
          </button>
        )}
      </div>

      <div className="sb-actions">
        <button className="btn btn-primary sb-new" onClick={startNewTask} data-tip={collapsed ? "New task" : undefined} aria-label="New task">
          <Plus size={15} weight="bold" /><span className="sb-label">New task</span>
        </button>
        <button className="sb-item" onClick={() => setCommandPaletteOpen(true)} data-tip={collapsed ? "Search  Ctrl Shift P" : undefined} aria-label="Search">
          <MagnifyingGlass size={17} /><span className="sb-label">Search</span>
          <span className="sb-kbd sb-hide"><kbd>Ctrl</kbd><kbd>⇧</kbd><kbd>P</kbd></span>
        </button>
        <button className="sb-item" onClick={() => setAskOwlOpen(true)} data-tip={collapsed ? "Ask OWL  Ctrl K" : undefined} aria-label="Ask OWL">
          <Sparkle size={17} weight="fill" className="sb-spark" /><span className="sb-label">Ask OWL</span>
          <span className="sb-kbd sb-hide"><kbd>Ctrl</kbd><kbd>K</kbd></span>
        </button>
      </div>

      {NAV_GROUPS.map((group) => (
        <div key={group.title} className="sb-group" role="group" aria-label={group.title}>
          <div className="sb-head sb-hide"><span>{group.title}</span></div>
          {group.items.map((item) => {
            const screenMeta = SCREEN_META[item];
            const active = isScreenActive(item);
            return (
              <button key={item} className={`sb-item${active ? " on" : ""}`} onClick={() => goToScreen(item)}
                aria-current={active ? "page" : undefined} aria-label={screenMeta.label} data-tip={collapsed ? screenMeta.label : undefined}>
                <screenMeta.icon size={17} weight={active ? "fill" : "regular"} />
                <span className="sb-label">{screenMeta.label}</span>
                {item === "inbox" && pendingCount > 0 && <span className="sb-badge" aria-label={`${pendingCount} waiting`}>{pendingCount}</span>}
              </button>
            );
          })}
        </div>
      ))}

      <div className="sb-section sb-hide">
        <div className="sb-head">
          <button className="sb-head-btn" onClick={toggleRecentTasks} aria-expanded={recentOpen}>
            {recentOpen ? <CaretDown size={10} weight="bold" /> : <CaretRight size={10} weight="bold" />} Recent tasks
          </button>
          <button className="sb-mini" onClick={() => goToScreen("tasks")} aria-label="All tasks" title="All tasks"><Rows size={13} /></button>
        </div>
        {recentOpen && recentTasks.length === 0 && <div className="sb-empty sb-hide">No tasks yet</div>}
        {recentOpen && recentTasks.slice(0, 5).map((task) => (
          <button key={task.id} className={`sb-item sb-task${screen === "btask" && openBackendTaskId === task.id ? " on" : ""}`}
            onClick={() => openBackendTask(task.id)} title={`${task.prompt} · ${task.status}`}>
            <span className={`live-dot${task.status === "running" ? " pulse" : ""}`} style={{ color: `var(--${hueForStatus(task.status)})`, width: 7, height: 7 }} />
            <span className="sb-label">{task.prompt}</span>
            <span className="sb-meta">{task.project || "No project"}</span>
          </button>
        ))}
      </div>

      <div className="sb-grow" />

      <div className="sb-bottom">
        <AccountMenu collapsed={collapsed} />
      </div>
    </nav>
  );
}
