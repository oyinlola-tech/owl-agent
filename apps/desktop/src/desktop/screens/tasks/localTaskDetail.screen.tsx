import { ArrowLeft, ListChecks } from "@phosphor-icons/react";
import { useAppStore } from "../../state/app.store";
import { EmptyState, PageHeader } from "../../../shared/components/pageLayout.component";
import "./tasks.style.css";

export function LocalTaskDetailScreen() {
  const goToScreen = useAppStore((s) => s.goToScreen);
  return (
    <div className="page pg-detail">
      <button className="btn btn-ghost btn-sm pg-back" onClick={() => goToScreen("tasks")}><ArrowLeft size={14} /> All tasks</button>
      <PageHeader icon={ListChecks} hue="blue" title="Task" />
      <EmptyState icon={ListChecks} hue="blue" title="Open a task from the list"
        body="Every task OWL runs is stored by the local service with its plan, changes, commands, and verification. Pick one from the Tasks list to see its detail.">
        <button className="btn btn-primary" onClick={() => goToScreen("tasks")}>Go to Tasks</button>
        <button className="btn btn-secondary" onClick={() => goToScreen("workspace")}>Open workspace</button>
      </EmptyState>
    </div>
  );
}
