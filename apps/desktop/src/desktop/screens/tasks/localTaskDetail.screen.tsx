import { ArrowLeft, ListChecks } from "@phosphor-icons/react";
import { useAppStore } from "../../state/app.store";
import { EmptyState, PageHeader } from "../../../shared/components/pageLayout.component";
import "./tasks.style.css";

export function LocalTaskDetailScreen() {
  const goToScreen = useAppStore((s) => s.goToScreen);
  return (
    <div className="page pg-detail">
      <button className="btn btn-ghost btn-sm pg-back" onClick={() => goToScreen("tasks")}><ArrowLeft size={14} /> All tasks</button>
      <PageHeader icon={ListChecks} hue="blue" title="Task detail" />
      <EmptyState icon={ListChecks} hue="blue" title="Open a task from the list"
        body="Every task now lives with the local service. Pick one from the Tasks page to see its plan, changes, commands, and verification.">
        <button className="btn btn-primary" onClick={() => goToScreen("tasks")}>Go to tasks</button>
        <button className="btn btn-secondary" onClick={() => goToScreen("workspace")}>Open workspace</button>
      </EmptyState>
    </div>
  );
}
