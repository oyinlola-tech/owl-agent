import { useEffect, useState } from "react";
import { ArrowClockwise, ArrowRight, ClockCounterClockwise, FolderSimple, GitBranch, Info, Pause, Play, Rows, Sparkle, SpinnerGap, Terminal, TextAa, X } from "@phosphor-icons/react";
import { useAppStore } from "../../state/app.store";
import { agentApi } from "../../services/agentApi.service";
import type { BackendTask } from "../../services/agentApi.types";
import { SAMPLE_BACKEND_TASKS } from "../../services/samples/sampleTasks.data";
import { loadWithSampleFallback, SAMPLE_SAVE_NOTICE } from "../../services/samples/sampleMode.helper";
import { isFinishedStatus, StatusTag } from "../../../shared/components/statusTag.component";
import { EmptyState, SampleDataBanner, SectionTitle } from "../../../shared/components/pageLayout.component";
import { Tag } from "../../../shared/components/tag.component";
import { formatShortTimeAgo } from "../../../shared/helpers/time.helper";

export function useBackendTasks() {
  const [rows, setRows] = useState<BackendTask[]>([]);
  const [demo, setDemo] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const load = async () => {
    const result = await loadWithSampleFallback(agentApi.backendTasks(), SAMPLE_BACKEND_TASKS);
    setRows([...result.data].sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
    setDemo(result.demo);
    setLoaded(true);
  };
  useEffect(() => { void load(); }, []);
  return { rows, setRows, demo, loaded, load };
}

type BackendTaskList = ReturnType<typeof useBackendTasks>;

export function BackendTaskTable({ backend, query }: { backend: BackendTaskList; query: string }) {
  const notify = useAppStore((s) => s.showNotice);
  const openBackendTask = useAppStore((s) => s.openBackendTask);
  const askForConfirmation = useAppStore((s) => s.askForConfirmation);
  const { rows, setRows, demo, loaded, load } = backend;
  const [checkpointsByTask, setCheckpointsByTask] = useState<Record<string, { id: string; label: string }[]>>({});
  const [prompt, setPrompt] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [authorizedRoots, setAuthorizedRoots] = useState<string[]>([]);
  useEffect(() => {
    agentApi.workspaces().then((workspaces) => {
      setAuthorizedRoots(workspaces.roots);
      if (workspaces.roots.length > 0) setWorkspace((current) => current || workspaces.roots[0]);
    }).catch(() => setWorkspace((current) => current || "~/Projects/zudomart"));
  }, []);
  const updateSampleTaskStatus = (id: string, status: string, message: string) => {
    setRows((list) => list.map((task) => (task.id === id ? { ...task, status, updated_at: new Date().toISOString() } : task)));
    notify(`${message}. ${SAMPLE_SAVE_NOTICE}`);
  };
  const runTaskAction = async (id: string, request: () => Promise<unknown>, message: string, sampleStatus: string) => {
    if (demo) { updateSampleTaskStatus(id, sampleStatus, message); return; }
    try {
      await request();
      notify(message);
      await load();
    } catch {
      notify("The OWL service didn't answer. Check that it's running, then retry.");
    }
  };
  const showCheckpoints = async (id: string) => {
    if (demo) { setCheckpointsByTask((current) => ({ ...current, [id]: [{ id: `ck_${id}`, label: "Before changes" }] })); return; }
    try {
      const checkpoints = await agentApi.checkpoints(id);
      setCheckpointsByTask((current) => ({ ...current, [id]: checkpoints }));
    } catch {
      notify("The OWL service didn't answer.");
    }
  };
  const startTask = async () => {
    if (demo) { notify(`Can't start a saved task while the service is offline. ${SAMPLE_SAVE_NOTICE}`); return; }
    try {
      const task = await agentApi.createBackendTask(prompt.trim(), "", workspace.trim());
      setPrompt("");
      notify("Task started");
      openBackendTask(task.id);
    } catch (e) {
      notify(e instanceof Error ? `Couldn't start: ${e.message}` : "Couldn't start the task.");
    }
  };
  const shownTasks = rows.filter((task) => (task.prompt + task.project + task.id).toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <SectionTitle count={shownTasks.length} actions={<button className="btn btn-ghost btn-sm" onClick={() => void load()}><ArrowClockwise size={13} /> Refresh</button>}>
        Saved tasks
      </SectionTitle>
      <p className="pg-note"><Info size={14} /> Stored by the OWL service with checkpoints. Resume continues from the last verified state.</p>
      {demo && <SampleDataBanner onRetry={() => void load()} what="this list" />}
      <div className="pg-newtask">
        <div className="input-wrap">
          <Sparkle size={15} />
          <input className="input" value={prompt} onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && prompt.trim()) void startTask(); }}
            placeholder="New task objective, e.g. Add rate limiting to the login route" aria-label="New saved task" />
        </div>
        <div className="input-wrap ws">
          <FolderSimple size={15} />
          <input className="input pg-mono" value={workspace} onChange={(e) => setWorkspace(e.target.value)}
            placeholder="Workspace path" aria-label="Workspace path"
            title={authorizedRoots.length ? `Authorized: ${authorizedRoots.join(", ")}` : "Authorized folders come from OWL_WORKSPACES on the service"} />
        </div>
        <button className="btn btn-primary" disabled={!prompt.trim()} onClick={() => void startTask()}>
          <Play size={14} weight="fill" /> Start task
        </button>
      </div>
      {!loaded ? (
        <div className="pg-skel">{[80, 64, 72].map((width, index) => <span key={index} className="skel-line" style={{ width: `${width}%`, height: 16 }} />)}</div>
      ) : shownTasks.length > 0 ? (
        <div className="pg-table-wrap">
          <table className="pg-table cards">
            <thead>
              <tr>
                <th><TextAa size={14} />Objective</th>
                <th><SpinnerGap size={14} />Status</th>
                <th style={{ minWidth: 120 }}><Rows size={14} />Progress</th>
                <th><ClockCounterClockwise size={14} />Updated</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {shownTasks.map((task) => (
                <tr key={task.id} tabIndex={0} onClick={() => openBackendTask(task.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") openBackendTask(task.id); }}>
                  <td>
                    <div className="nm">
                      <Terminal size={16} />
                      <span>
                        <b>{task.prompt.slice(0, 96) || "Untitled task"}</b>
                        <small><span className="pg-mono">{task.id}</span>{task.project && <> · {task.project}</>}{task.model && <> · {task.model.split("/").pop()}</>}</small>
                        {checkpointsByTask[task.id] && (
                          <span className="pg-ckpts">
                            {checkpointsByTask[task.id].length === 0 ? <Tag>No checkpoints yet</Tag>
                              : checkpointsByTask[task.id].map((checkpoint) => <Tag key={checkpoint.id} hue="brown" icon={GitBranch}>{checkpoint.label}</Tag>)}
                          </span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td data-label="Status"><StatusTag status={task.status} /></td>
                  <td data-label="Progress">
                    <div className="pg-progress">
                      <div className={`progress ${task.status === "failed" ? "red" : isFinishedStatus(task.status) ? "green" : ""}`}><i style={{ width: `${task.progress}%` }} /></div>
                      <span className="pg-pct">{task.progress}%</span>
                    </div>
                  </td>
                  <td className="num" data-label="Updated">{formatShortTimeAgo(task.updated_at)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="acts">
                      {task.status === "running" && (
                        <button className="btn btn-ghost btn-sm" onClick={() => void runTaskAction(task.id, () => agentApi.pauseBackendTask(task.id), "Task paused", "paused")}><Pause size={13} /> Pause</button>
                      )}
                      {(task.status === "paused" || task.status === "failed") && (
                        <button className="btn btn-secondary btn-sm" onClick={() => void runTaskAction(task.id, () => agentApi.resumeBackendTask(task.id), "Task resumed", "running")}><Play size={13} /> Resume</button>
                      )}
                      {(task.status === "running" || task.status === "awaiting_approval" || task.status === "paused") && (
                        <button className="btn btn-ghost btn-sm" onClick={() => askForConfirmation({
                          title: "Cancel this task?",
                          body: "The agent stops at its next step. Changes already approved stay, and checkpoints are kept.",
                          confirmLabel: "Cancel task",
                          run: () => void runTaskAction(task.id, () => agentApi.cancelBackendTask(task.id), "Task cancelled", "cancelled"),
                        })}><X size={13} /> Cancel</button>
                      )}
                      <button className="btn btn-ghost btn-sm btn-icon" title="Show checkpoints" aria-label="Show checkpoints" onClick={() => void showCheckpoints(task.id)}>
                        <GitBranch size={14} />
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => openBackendTask(task.id)}>Open <ArrowRight size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={Terminal} title={query ? `No saved tasks match "${query}"` : "No saved tasks yet"} body="Write an objective above and press Start task." />
      )}
    </>
  );
}
