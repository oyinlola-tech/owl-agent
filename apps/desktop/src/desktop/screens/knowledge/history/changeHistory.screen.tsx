import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowClockwise, ArrowCounterClockwise, ClockCounterClockwise, Files, GitCommit, MagnifyingGlass,
  PencilSimpleLine, Warning,
} from "@phosphor-icons/react";
import { useAppStore } from "../../../state/app.store";
import { ApiError, agentApi } from "../../../services/agentApi.service";
import type { BackendTask, JournalRow } from "../../../services/agentApi.types";
import { SAMPLE_JOURNAL, SAMPLE_BACKEND_TASKS, sampleTaskDetailFor } from "../../../services/samples/sampleTasks.data";
import { loadWithSampleFallback, SAMPLE_SAVE_NOTICE_SHORT } from "../../../services/samples/sampleMode.helper";
import { SampleDataBanner, EmptyState, PageHeader } from "../../../../shared/components/pageLayout.component";
import { Tag } from "../../../../shared/components/tag.component";
import { FilePath } from "../../../components/filePath.component";
import { StatCard } from "../../../components/statCard.component";
import { formatByteSize, formatClockTime, formatDayLabel } from "../../../../shared/helpers/time.helper";
import "./changeHistory.style.css";

type CheckpointRow = { id: string; label: string; created_at: string };
type HistoryEntry =
  | { type: "change"; at: string; task: BackendTask; row: JournalRow }
  | { type: "checkpoint"; at: string; task: BackendTask; id: string; label: string };
type ChangeEntry = Extract<HistoryEntry, { type: "change" }>;

export function ChangeHistoryScreen() {
  const showNotice = useAppStore((s) => s.showNotice);
  const askForConfirmation = useAppStore((s) => s.askForConfirmation);
  const openBackendTask = useAppStore((s) => s.openBackendTask);
  const goToScreen = useAppStore((s) => s.goToScreen);

  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [isSampleData, setIsSampleData] = useState(false);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState("");
  const [pathFilter, setPathFilter] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "change" | "checkpoint">("all");
  const [revertedAtById, setRevertedAtById] = useState<Record<string, string>>({});
  const [errorsById, setErrorsById] = useState<Record<string, string>>({});
  const [revertingId, setRevertingId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    const taskResult = await loadWithSampleFallback(agentApi.backendTasks(), SAMPLE_BACKEND_TASKS);
    const loadedEntries: HistoryEntry[] = [];
    await Promise.all(taskResult.data.map(async (task) => {
      let journalRows: JournalRow[];
      let checkpoints: CheckpointRow[];
      if (taskResult.demo) {
        journalRows = SAMPLE_JOURNAL[task.id] ?? [];
        checkpoints = sampleTaskDetailFor(task.id).checkpoints;
      } else {
        [journalRows, checkpoints] = await Promise.all([
          agentApi.journal(task.id).catch(() => [] as JournalRow[]),
          agentApi.checkpoints(task.id).catch(() => [] as CheckpointRow[]),
        ]);
      }
      journalRows.forEach((row) => loadedEntries.push({ type: "change", at: row.applied_at, task, row }));
      checkpoints.forEach((checkpoint) => loadedEntries.push({ type: "checkpoint", at: checkpoint.created_at, task, id: checkpoint.id, label: checkpoint.label }));
    }));
    loadedEntries.sort((a, b) => b.at.localeCompare(a.at));
    setEntries(loadedEntries);
    setIsSampleData(taskResult.demo);
    setRevertedAtById({});
    setErrorsById({});
    setLoading(false);
  }, []);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const projectNames = useMemo(() => [...new Set(entries.map((entry) => entry.task.project).filter(Boolean))].sort(), [entries]);
  const visibleEntries = entries.filter((entry) =>
    (!projectFilter || entry.task.project === projectFilter) &&
    (kindFilter === "all" || entry.type === kindFilter) &&
    (!pathFilter.trim() || (entry.type === "change" ? entry.row.path : entry.label).toLowerCase().includes(pathFilter.trim().toLowerCase())),
  );
  const entriesByDay: { label: string; items: HistoryEntry[] }[] = [];
  for (const entry of visibleEntries) {
    const label = formatDayLabel(entry.at);
    const lastDay = entriesByDay[entriesByDay.length - 1];
    if (lastDay && lastDay.label === label) lastDay.items.push(entry);
    else entriesByDay.push({ label, items: [entry] });
  }

  const changeEntries = entries.filter((entry): entry is ChangeEntry => entry.type === "change");
  const isReverted = (row: JournalRow) => Boolean(row.reverted_at || revertedAtById[row.id]);
  const revertedCount = changeEntries.filter((entry) => isReverted(entry.row)).length;
  const fileCount = new Set(changeEntries.map((entry) => entry.row.path)).size;

  const confirmRevert = (entry: ChangeEntry) => askForConfirmation({
    title: `Revert ${entry.row.path}?`,
    body: "OWL puts the file back the way it was before this change. If the file has changed since, the revert stops and nothing is overwritten.",
    confirmLabel: "Revert change",
    run: () => void (async () => {
      if (isSampleData) {
        setRevertedAtById((reverted) => ({ ...reverted, [entry.row.id]: new Date().toISOString() }));
        showNotice(SAMPLE_SAVE_NOTICE_SHORT);
        return;
      }
      setRevertingId(entry.row.id);
      try {
        await agentApi.revertJournal(entry.task.id, entry.row.id);
        setRevertedAtById((reverted) => ({ ...reverted, [entry.row.id]: new Date().toISOString() }));
        setErrorsById((errors) => { const remaining = { ...errors }; delete remaining[entry.row.id]; return remaining; });
        showNotice(`Reverted ${entry.row.path}`);
      } catch (err) {
        const message = err instanceof ApiError && err.status === 409
          ? `${entry.row.path} changed after OWL applied this edit, so the revert stopped. Resolve it by hand, then try again.`
          : err instanceof Error ? err.message : "Couldn't reach the OWL service.";
        setErrorsById((errors) => ({ ...errors, [entry.row.id]: message }));
        showNotice("Revert stopped — see the note on the change");
      } finally {
        setRevertingId(null);
      }
    })(),
  });

  return (
    <div className="page x-history">
      <PageHeader
        icon={ClockCounterClockwise} hue="brown" title="Change history"
        lede="Every file OWL changed, the approval that allowed it, and the checkpoints taken before. Revert any single change."
        actions={<button className="btn btn-secondary" onClick={() => void loadHistory()} disabled={loading}><ArrowClockwise size={15} /> Refresh</button>}
      />
      {isSampleData && <SampleDataBanner what="change history" onRetry={() => void loadHistory()} />}

      <div className="x-stats">
        <StatCard icon={PencilSimpleLine} hue="yellow" label="Changes applied" value={String(changeEntries.length)} />
        <StatCard icon={ArrowCounterClockwise} hue="gray" label="Reverted" value={String(revertedCount)} />
        <StatCard icon={GitCommit} hue="brown" label="Checkpoints" value={String(entries.length - changeEntries.length)} />
        <StatCard icon={Files} hue="blue" label="Files touched" value={String(fileCount)} />
      </div>

      <div className="x-toolbar">
        <div className="seg" role="tablist" aria-label="Show">
          {([["all", "Everything"], ["change", "Changes"], ["checkpoint", "Checkpoints"]] as const).map(([kind, label]) => (
            <button key={kind} role="tab" aria-selected={kindFilter === kind} onClick={() => setKindFilter(kind)}>{label}</button>
          ))}
        </div>
        <span className="grow" />
        <select className="input x-select" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} aria-label="Project">
          <option value="">All projects</option>
          {projectNames.map((projectName) => <option key={projectName} value={projectName}>{projectName}</option>)}
        </select>
        <div className="input-wrap x-search">
          <MagnifyingGlass size={15} />
          <input className="input" value={pathFilter} onChange={(e) => setPathFilter(e.target.value)} placeholder="Filter by path" aria-label="Filter by path" />
        </div>
      </div>

      {loading && <div className="x-skel">{[0, 1, 2, 3].map((index) => <div key={index} className="x-skel-row"><span className="skel-line" style={{ width: `${50 + index * 10}%` }} /></div>)}</div>}

      {!loading && entriesByDay.length === 0 && (
        <EmptyState icon={ClockCounterClockwise} hue="brown"
          title={entries.length === 0 ? "No changes yet" : "Nothing matches these filters"}
          body={entries.length === 0
            ? "When you approve a file change, OWL records it here with a checkpoint so you can undo it later."
            : "Try another project or clear the path filter."}>
          {entries.length === 0
            ? <button className="btn btn-secondary" onClick={() => goToScreen("workspace")}>Open workspace</button>
            : <button className="btn btn-secondary" onClick={() => { setPathFilter(""); setProjectFilter(""); setKindFilter("all"); }}>Clear filters</button>}
        </EmptyState>
      )}

      {!loading && entriesByDay.map((day) => (
        <section key={day.label} className="x-day">
          <h3 className="x-day-label">{day.label}</h3>
          <ol className="x-timeline">
            {day.items.map((entry) => {
              if (entry.type === "checkpoint") {
                return (
                  <li key={`ck-${entry.task.id}-${entry.id}`} className="x-tl x-tl-ck">
                    <span className="x-tl-node brown"><GitCommit size={13} weight="bold" /></span>
                    <div className="x-tl-main">
                      <div className="x-tl-line"><b>Checkpoint</b> <span>{entry.label}</span> <span className="x-mono-dim">{entry.id}</span></div>
                      <div className="x-tl-sub">
                        <button className="x-link" onClick={() => openBackendTask(entry.task.id)}>{entry.task.prompt}</button>
                      </div>
                    </div>
                    <time className="x-tl-time">{formatClockTime(entry.at)}</time>
                  </li>
                );
              }
              const row = entry.row;
              const reverted = isReverted(row);
              const sizeDelta = row.before_bytes === null ? row.after_bytes ?? 0 : (row.after_bytes ?? 0) - row.before_bytes;
              return (
                <li key={`jr-${row.id}`} className={`x-tl${reverted ? " reverted" : ""}`}>
                  <span className={`x-tl-node ${reverted ? "gray" : "yellow"}`}><PencilSimpleLine size={13} weight="bold" /></span>
                  <div className="x-tl-main">
                    <div className="x-tl-line">
                      <FilePath path={row.path} />
                      {row.before_bytes === null ? <Tag hue="green">Created</Tag> : <Tag hue="yellow">Edited</Tag>}
                      {reverted ? <Tag hue="gray" icon={ArrowCounterClockwise}>Reverted</Tag> : <Tag hue="green" dot>Applied</Tag>}
                    </div>
                    <div className="x-tl-sub">
                      <span className="x-size">{formatByteSize(row.before_bytes)} → {formatByteSize(row.after_bytes)}
                        <i className={sizeDelta >= 0 ? "up" : "down"}>{sizeDelta >= 0 ? "+" : "−"}{formatByteSize(Math.abs(sizeDelta))}</i></span>
                      {row.approval_id && <span>Approval <span className="x-mono-dim">{row.approval_id}</span></span>}
                      <button className="x-link" onClick={() => openBackendTask(entry.task.id)}>{entry.task.project} · {entry.task.prompt}</button>
                    </div>
                    {errorsById[row.id] && <div className="callout red x-inline-err"><Warning size={15} weight="bold" />{errorsById[row.id]}</div>}
                  </div>
                  <div className="x-tl-acts">
                    <time className="x-tl-time">{formatClockTime(entry.at)}</time>
                    {!reverted && (
                      <button className="btn btn-sm btn-secondary" onClick={() => confirmRevert(entry)} disabled={revertingId === row.id}>
                        <ArrowCounterClockwise size={14} /> {revertingId === row.id ? "Reverting…" : "Revert"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
