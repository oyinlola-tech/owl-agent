import { useRef, useState } from "react";
import { Columns, DownloadSimple, ListChecks, MagnifyingGlass, Plus, ShieldWarning, Table, UploadSimple } from "@phosphor-icons/react";
import { useAppStore } from "../../state/app.store";
import { PageHeader } from "../../../shared/components/pageLayout.component";
import { formatShortTimeAgo } from "../../../shared/helpers/time.helper";
import { readStoredValue, writeStoredValue } from "../../../shared/helpers/storage.helper";
import { fetchFromService, isServiceAuthError, requestServiceJson } from "../../services/connection/serviceRequest.service";
import type { BackendTask } from "../../services/agentApi.types";
import { BackendTaskTable, useBackendTasks } from "./backendTaskTable.component";
import { TaskBoard, type TaskBoardCard } from "./taskBoard.component";
import "./tasks.style.css";

type TaskListView = "table" | "board";

const TASK_VIEW_STORAGE_KEY = "owl-tasks-view";

export function TaskListScreen() {
  const startNewTask = useAppStore((s) => s.startNewTask);
  const goToScreen = useAppStore((s) => s.goToScreen);
  const openBackendTask = useAppStore((s) => s.openBackendTask);
  const project = useAppStore((s) => s.project);
  const notify = useAppStore((s) => s.showNotice);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<TaskListView>(() => (readStoredValue(TASK_VIEW_STORAGE_KEY) === "board" ? "board" : "table"));
  const selectView = (nextView: TaskListView) => { setView(nextView); writeStoredValue(TASK_VIEW_STORAGE_KEY, nextView); };
  const backend = useBackendTasks();
  const importFileRef = useRef<HTMLInputElement>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [bundleError, setBundleError] = useState("");
  const [bundleUnauthorized, setBundleUnauthorized] = useState(false);
  const matchesQuery = (text: string) => text.toLowerCase().includes(query.toLowerCase());
  const boardCards: TaskBoardCard[] = backend.rows
    .filter((task) => matchesQuery(task.prompt + task.project))
    .map((task) => ({
      key: task.id, title: task.prompt, project: task.project, status: task.status, progress: task.progress,
      model: task.model, when: formatShortTimeAgo(task.updated_at), open: () => openBackendTask(task.id),
    }));
  const bundleRows = backend.rows.filter((task) =>
    (task.prompt + task.project + task.id).toLowerCase().includes(query.toLowerCase()));
  const exportBundle = async (task: BackendTask) => {
    setExportingId(task.id);
    setBundleError("");
    setBundleUnauthorized(false);
    try {
      const response = await fetchFromService(`/tasks/${encodeURIComponent(task.id)}/bundle`);
      if (!response.ok) {
        if (response.status === 401) setBundleUnauthorized(true);
        else setBundleError(`Couldn't export ${task.id}. The OWL service answered ${response.status}.`);
        return;
      }
      const text = await response.text();
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `task-${task.id}.owl.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      notify("Task bundle exported");
    } catch (error) {
      if (isServiceAuthError(error)) setBundleUnauthorized(true);
      else setBundleError("The OWL service didn't answer. Check that it's running, then retry.");
    } finally {
      setExportingId(null);
    }
  };
  const importBundleFile = async (file: File) => {
    setImporting(true);
    setBundleError("");
    setBundleUnauthorized(false);
    try {
      let bundle: unknown;
      try {
        bundle = JSON.parse(await file.text()) as unknown;
      } catch {
        setBundleError("That file isn't a valid task bundle.");
        return;
      }
      const rawWorkspace = (bundle as { workspace?: unknown }).workspace;
      const workspace = (typeof rawWorkspace === "string" && rawWorkspace.trim())
        || project?.path
        || "";
      const created = await requestServiceJson<BackendTask>("/tasks/import", {
        method: "POST",
        body: JSON.stringify({ bundle, project: project?.name ?? "", workspace }),
      });
      notify("Task bundle imported as a paused task");
      openBackendTask(created.id);
    } catch (error) {
      if (isServiceAuthError(error)) setBundleUnauthorized(true);
      else setBundleError(error instanceof Error ? error.message : "Couldn't import that bundle.");
    } finally {
      setImporting(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };
  return (
    <div className="page pg-tasks">
      <PageHeader
        icon={ListChecks} hue="blue" title="Tasks"
        lede="Running and past agent work. Open a task for its plan, changes, commands, and test results."
        actions={<>
          <button className="btn btn-secondary" onClick={() => goToScreen("inbox")}><ShieldWarning size={15} /> Approvals</button>
          <button className="btn btn-secondary" disabled={importing} onClick={() => importFileRef.current?.click()}>
            <UploadSimple size={15} /> {importing ? "Importing…" : "Import bundle"}
          </button>
          <button className="btn btn-primary" onClick={startNewTask}><Plus size={15} weight="bold" /> New task</button>
        </>}
      />
      <input
        ref={importFileRef} type="file" accept=".json,application/json" className="sr-only"
        aria-label="Import task bundle" tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importBundleFile(file);
        }}
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

      <section aria-label="Task bundles">
        <p className="pg-note">Share a task as a file. Export downloads a bundle; importing it starts a new paused task.</p>
        {bundleUnauthorized && (
          <p role="alert" className="pg-note">Sign in to the local service to share task bundles.</p>
        )}
        {bundleError && (
          <p role="alert" className="pg-note">{bundleError}</p>
        )}
        {backend.loaded && bundleUnauthorized === false && bundleRows.length > 0 && (
          <ul className="pg-bundle-list">
            {bundleRows.map((task) => (
              <li key={task.id}>
                <span>{task.prompt.slice(0, 96) || "Untitled task"}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  aria-label={`Export ${task.id} bundle`}
                  disabled={exportingId !== null || importing}
                  onClick={() => void exportBundle(task)}
                >
                  <DownloadSimple size={13} /> {exportingId === task.id ? "Exporting…" : "Export"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
