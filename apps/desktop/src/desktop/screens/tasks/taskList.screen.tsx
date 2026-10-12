import { useState } from "react";
import { CalendarBlank, Columns, FolderSimple, ListChecks, MagnifyingGlass, Plus, Rows, ShieldWarning, SpinnerGap, Table, TextAa, Timer } from "@phosphor-icons/react";
import { useAppStore } from "../../state/app.store";
import type { TaskFilter } from "../../state/workspace.types";
import { isFinishedStatus, StatusTag } from "../../../shared/components/statusTag.component";
import { EmptyState, PageHeader, SampleDataBanner, SectionTitle } from "../../../shared/components/pageLayout.component";
import { Tag } from "../../../shared/components/tag.component";
import { formatShortTimeAgo } from "../../../shared/helpers/time.helper";
import { readStoredValue, writeStoredValue } from "../../../shared/helpers/storage.helper";
import { BackendTaskTable, useBackendTasks } from "./backendTaskTable.component";
import { TaskBoard, type TaskBoardCard } from "./taskBoard.component";
import "./tasks.style.css";

type TaskListView = "table" | "board";

const TASK_FILTERS: TaskFilter[] = ["all", "running", "completed", "failed", "cancelled"];
const TASK_VIEW_STORAGE_KEY = "owl-tasks-view";

export function TaskListScreen() {
  const tasks = useAppStore((s) => s.tasks);
  const filter = useAppStore((s) => s.taskFilter);
  const setFilter = useAppStore((s) => s.setTaskFilter);
  const openTask = useAppStore((s) => s.openTask);
  const openBackendTask = useAppStore((s) => s.openBackendTask);
  const startNewTask = useAppStore((s) => s.startNewTask);
  const goToScreen = useAppStore((s) => s.goToScreen);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<TaskListView>(() => (readStoredValue(TASK_VIEW_STORAGE_KEY) === "board" ? "board" : "table"));
  const selectView = (nextView: TaskListView) => { setView(nextView); writeStoredValue(TASK_VIEW_STORAGE_KEY, nextView); };
  const backend = useBackendTasks();
  const matchesQuery = (text: string) => text.toLowerCase().includes(query.toLowerCase());
  const filteredTasks = tasks.filter((task) => (filter === "all" || task.status === filter) && matchesQuery(task.name + task.project));
  const countForFilter = (taskFilter: TaskFilter) => (taskFilter === "all" ? tasks.length : tasks.filter((task) => task.status === taskFilter).length);
  const boardCards: TaskBoardCard[] = [
    ...tasks.filter((task) => matchesQuery(task.name + task.project)).map((task) => ({
      key: task.id, title: task.name, project: task.project, status: task.status, progress: task.progress, when: `Started ${task.started}`, open: () => openTask(task.id),
    })),
    ...backend.rows.filter((task) => matchesQuery(task.prompt + task.project)).map((task) => ({
      key: task.id, title: task.prompt, project: task.project, status: task.status, progress: task.progress, model: task.model, when: formatShortTimeAgo(task.updated_at), open: () => openBackendTask(task.id),
    })),
  ];
  return (
    <div className="page pg-tasks">
      <PageHeader
        icon={ListChecks} hue="blue" title="Tasks"
        lede="Running and past agent work. Open a task for its plan, changes, commands, and test results."
        actions={<>
          <button className="btn btn-secondary" onClick={() => goToScreen("inbox")}><ShieldWarning size={15} /> Approvals</button>
          <button className="btn btn-primary" onClick={startNewTask}><Plus size={15} weight="bold" /> New task</button>
        </>}
      />
      <div className="pg-toolbar">
        <div className="seg" aria-label="View">
          <button aria-pressed={view === "table"} onClick={() => selectView("table")}><Table size={14} /> Table</button>
          <button aria-pressed={view === "board"} onClick={() => selectView("board")}><Columns size={14} /> Board</button>
        </div>
        {view === "table" && (
          <div className="seg" role="tablist" aria-label="Filter tasks">
            {TASK_FILTERS.map((taskFilter) => (
              <button key={taskFilter} role="tab" aria-selected={filter === taskFilter} onClick={() => setFilter(taskFilter)}>
                {taskFilter[0].toUpperCase() + taskFilter.slice(1)} <span className="pg-count">{countForFilter(taskFilter)}</span>
              </button>
            ))}
          </div>
        )}
        <span className="grow" />
        <div className="input-wrap">
          <MagnifyingGlass size={15} />
          <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks" aria-label="Search tasks" />
        </div>
      </div>

      {view === "board" ? (
        <>
          {backend.demo && <SampleDataBanner onRetry={() => void backend.load()} what="the board" />}
          <TaskBoard cards={boardCards} />
        </>
      ) : (
        <>
          <SectionTitle count={filteredTasks.length}>This session</SectionTitle>
          {filteredTasks.length > 0 ? (
            <div className="pg-table-wrap">
              <table className="pg-table cards">
                <thead>
                  <tr>
                    <th><TextAa size={14} />Name</th>
                    <th><FolderSimple size={14} />Project</th>
                    <th><SpinnerGap size={14} />Status</th>
                    <th style={{ minWidth: 140 }}><Rows size={14} />Progress</th>
                    <th><CalendarBlank size={14} />Started</th>
                    <th><Timer size={14} />Elapsed</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map((task) => (
                    <tr key={task.id} tabIndex={0} onClick={() => openTask(task.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openTask(task.id); } }}>
                      <td>
                        <div className="nm">
                          <ListChecks size={16} />
                          <span><b>{task.name}</b><small>{task.note}</small></span>
                        </div>
                      </td>
                      <td data-label="Project"><Tag>{task.project}</Tag></td>
                      <td data-label="Status"><StatusTag status={task.status} /></td>
                      <td data-label="Progress">
                        <div className="pg-progress">
                          <div className={`progress ${task.status === "failed" ? "red" : isFinishedStatus(task.status) ? "green" : ""}`}><i style={{ width: `${task.progress}%` }} /></div>
                          <span className="pg-pct">{task.progress}%</span>
                        </div>
                      </td>
                      <td className="num" data-label="Started">{task.started}</td>
                      <td className="num" data-label="Elapsed">{task.elapsed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={ListChecks} hue="blue"
              title={query ? `No tasks match "${query}"` : filter === "all" ? "No tasks yet" : `No ${filter} tasks`}
              body={query || filter !== "all" ? "Try another filter or clear the search." : "Tell OWL what you want to build and it will appear here."}>
              {(query || filter !== "all") && <button className="btn btn-secondary" onClick={() => { setQuery(""); setFilter("all"); }}>Show all tasks</button>}
              <button className="btn btn-primary" onClick={startNewTask}><Plus size={14} weight="bold" /> New task</button>
            </EmptyState>
          )}
          <BackendTaskTable backend={backend} query={query} />
        </>
      )}
    </div>
  );
}
