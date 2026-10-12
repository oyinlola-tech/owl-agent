import { useState } from "react";
import { Columns, ListChecks, MagnifyingGlass, Plus, ShieldWarning, Table } from "@phosphor-icons/react";
import { useAppStore } from "../../state/app.store";
import { PageHeader } from "../../../shared/components/pageLayout.component";
import { formatShortTimeAgo } from "../../../shared/helpers/time.helper";
import { readStoredValue, writeStoredValue } from "../../../shared/helpers/storage.helper";
import { BackendTaskTable, useBackendTasks } from "./backendTaskTable.component";
import { TaskBoard, type TaskBoardCard } from "./taskBoard.component";
import "./tasks.style.css";

type TaskListView = "table" | "board";

const TASK_VIEW_STORAGE_KEY = "owl-tasks-view";

export function TaskListScreen() {
  const openBackendTask = useAppStore((s) => s.openBackendTask);
  const goToScreen = useAppStore((s) => s.goToScreen);
  const setCreateProjectOpen = useAppStore((s) => s.setCreateProjectOpen);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<TaskListView>(() => (readStoredValue(TASK_VIEW_STORAGE_KEY) === "board" ? "board" : "table"));
  const selectView = (nextView: TaskListView) => { setView(nextView); writeStoredValue(TASK_VIEW_STORAGE_KEY, nextView); };
  const backend = useBackendTasks();
  const matchesQuery = (text: string) => text.toLowerCase().includes(query.toLowerCase());
  const boardCards: TaskBoardCard[] = backend.rows
    .filter((task) => matchesQuery(task.prompt + task.project))
    .map((task) => ({
      key: task.id, title: task.prompt, project: task.project, status: task.status, progress: task.progress,
      model: task.model, when: formatShortTimeAgo(task.updated_at), open: () => openBackendTask(task.id),
    }));
  return (
    <div className="page pg-tasks">
      <PageHeader
        icon={ListChecks} hue="blue" title="Tasks"
        lede="Running and past agent work. Open a task for its plan, changes, commands, and test results."
        actions={<>
          <button className="btn btn-secondary" onClick={() => goToScreen("inbox")}><ShieldWarning size={15} /> Approvals</button>
          <button className="btn btn-primary" onClick={() => setCreateProjectOpen(true)}><Plus size={15} weight="bold" /> Open a project</button>
        </>}
      />
      <div className="pg-toolbar">
        <div className="seg" aria-label="View">
          <button aria-pressed={view === "table"} onClick={() => selectView("table")}><Table size={14} /> Table</button>
          <button aria-pressed={view === "board"} onClick={() => selectView("board")}><Columns size={14} /> Board</button>
        </div>
        <span className="grow" />
        <div className="input-wrap">
          <MagnifyingGlass size={15} />
          <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks" aria-label="Search tasks" />
        </div>
      </div>

      {view === "board" ? <TaskBoard cards={boardCards} /> : <BackendTaskTable backend={backend} query={query} />}
    </div>
  );
}
