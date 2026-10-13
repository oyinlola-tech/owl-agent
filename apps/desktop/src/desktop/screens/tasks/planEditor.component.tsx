import { useState } from "react";
import { ArrowDown, ArrowUp, Check, PencilSimple, Plus, Trash, X } from "@phosphor-icons/react";
import { ApiError, requestServiceJson } from "../../services/connection/serviceRequest.service";
import { SectionTitle } from "../../../shared/components/pageLayout.component";
import { StatusTag } from "../../../shared/components/statusTag.component";

export interface EditablePlanStep {
  title: string;
  summary?: string;
  status: string;
}

interface PlanEditorProps {
  taskId: string;
  taskStatus: string;
  steps: EditablePlanStep[];
  onSaved: () => void;
}

interface DraftStep {
  title: string;
  summary: string;
  status: string;
}

function toDraft(steps: EditablePlanStep[]): DraftStep[] {
  return steps.map((step) => ({ title: step.title, summary: step.summary ?? "", status: step.status }));
}

function moveDraft(draft: DraftStep[], from: number, to: number): DraftStep[] {
  if (to < 0 || to >= draft.length) return draft;
  const next = draft.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function PlanEditor({ taskId, taskStatus, steps, onSaved }: PlanEditorProps) {
  const editable = taskStatus === "paused" || taskStatus === "created";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftStep[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const startEditing = () => {
    setDraft(toDraft(steps));
    setError("");
    setEditing(true);
  };

  const save = async () => {
    if (draft.some((step) => !step.title.trim())) {
      setError("Every step needs a title before saving.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await requestServiceJson<{ task: unknown; steps: EditablePlanStep[] }>(`/tasks/${taskId}/plan`, {
        method: "PUT",
        body: JSON.stringify({ steps: draft.map((step) => ({ title: step.title.trim(), summary: step.summary.trim() })) }),
      });
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409
        ? "The task is running again. Pause it to edit the plan."
        : e instanceof ApiError ? e.message : "The OWL service didn't answer.");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <section>
        <SectionTitle count={steps.length}>Plan</SectionTitle>
        {steps.length === 0 ? <p className="pg-muted pg-p">The agent hasn't written a plan yet.</p> : (
          <ul className="pg-todo">
            {steps.map((step, index) => {
              const done = step.status === "completed" || step.status === "done";
              return (
                <li key={index} className={done ? "done" : step.status === "running" || step.status === "awaiting_approval" ? "now" : ""}>
                  <span className="box">{done && <Check size={11} weight="bold" />}</span>
                  <span className="txt">{step.title}{step.summary ? <span className="pg-muted"> — {step.summary}</span> : null}</span>
                  {!done && <StatusTag status={step.status} />}
                </li>
              );
            })}
          </ul>
        )}
        <div className="pg-plan-bar">
          <button className="btn btn-secondary btn-sm" disabled={!editable}
            title={editable ? "Reorder or rewrite plan steps" : "Pause the task to reorder or rewrite its plan"}
            onClick={startEditing}><PencilSimple size={13} /> Edit plan</button>
          {!editable && <span className="pg-muted pg-sm">Pause the task to reorder or rewrite its plan.</span>}
        </div>
      </section>
    );
  }

  return (
    <section>
      <SectionTitle count={draft.length}>Plan</SectionTitle>
      {draft.length === 0 && <p className="pg-muted pg-p">No steps left. Add one below or save an empty plan.</p>}
      <ol className="pg-plan-edit">
        {draft.map((step, index) => (
          <li key={index}>
            <div className="pg-plan-fields">
              <label>Step {index + 1} title
                <input className="input" value={step.title} disabled={saving}
                  onChange={(e) => setDraft((d) => d.map((s, i) => (i === index ? { ...s, title: e.target.value } : s)))} />
              </label>
              <label>Step {index + 1} summary
                <input className="input" value={step.summary} disabled={saving} placeholder="Optional"
                  onChange={(e) => setDraft((d) => d.map((s, i) => (i === index ? { ...s, summary: e.target.value } : s)))} />
              </label>
            </div>
            <div className="pg-plan-row">
              <StatusTag status={step.status} />
              <span className="grow" />
              <button className="btn btn-ghost btn-sm" aria-label={`Move step ${index + 1} up`}
                disabled={saving || index === 0} onClick={() => setDraft((d) => moveDraft(d, index, index - 1))}><ArrowUp size={13} /></button>
              <button className="btn btn-ghost btn-sm" aria-label={`Move step ${index + 1} down`}
                disabled={saving || index === draft.length - 1} onClick={() => setDraft((d) => moveDraft(d, index, index + 1))}><ArrowDown size={13} /></button>
              <button className="btn btn-ghost btn-sm" aria-label={`Delete step ${index + 1}`}
                disabled={saving} onClick={() => setDraft((d) => d.filter((_, i) => i !== index))}><Trash size={13} /></button>
            </div>
          </li>
        ))}
      </ol>
      <div className="pg-plan-bar">
        <button className="btn btn-secondary btn-sm" disabled={saving}
          onClick={() => setDraft((d) => [...d, { title: "", summary: "", status: "pending" }])}><Plus size={13} /> Add step</button>
        <span className="grow" />
        <button className="btn btn-ghost btn-sm" disabled={saving}
          onClick={() => { setEditing(false); setError(""); }}><X size={13} /> Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : <><Check size={13} weight="bold" /> Save plan</>}
        </button>
      </div>
      {error && <p className="pg-err" role="alert">{error}</p>}
    </section>
  );
}
