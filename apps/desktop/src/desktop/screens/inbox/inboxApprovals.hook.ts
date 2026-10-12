import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore } from "../../state/app.store";
import { usePendingApprovalsStore } from "../../state/pendingApprovals.store";
import { agentApi } from "../../services/agentApi.service";
import type { ApprovalRead, BackendTask } from "../../services/agentApi.types";
import { SAMPLE_APPROVALS_BY_TASK, SAMPLE_BACKEND_TASKS } from "../../services/samples/sampleTasks.data";
import { loadWithSampleFallback } from "../../services/samples/sampleMode.helper";
import type { InboxGroup } from "./inboxApproval.types";

export function useInboxApprovals() {
  const localApprovals = useAppStore((s) => s.approvals);
  const agentStatus = useAppStore((s) => s.agentStatus);
  const project = useAppStore((s) => s.project);
  const decidedApprovals = usePendingApprovalsStore((s) => s.decided);
  const [backendTasks, setBackendTasks] = useState<BackendTask[]>([]);
  const [approvalsByTask, setApprovalsByTask] = useState<Record<string, ApprovalRead[]>>({});
  const [isSampleData, setIsSampleData] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadApprovals = useCallback(async () => {
    setLoading(true);
    const taskResult = await loadWithSampleFallback(agentApi.backendTasks(), SAMPLE_BACKEND_TASKS);
    const approvalLists = await Promise.all(
      taskResult.data.map((task) =>
        taskResult.demo
          ? Promise.resolve({ data: SAMPLE_APPROVALS_BY_TASK[task.id] ?? [], demo: true })
          : loadWithSampleFallback(agentApi.approvals(task.id), [] as ApprovalRead[]),
      ),
    );
    const approvalsMap: Record<string, ApprovalRead[]> = {};
    taskResult.data.forEach((task, index) => { approvalsMap[task.id] = approvalLists[index].data; });
    setBackendTasks(taskResult.data);
    setApprovalsByTask(approvalsMap);
    setIsSampleData(taskResult.demo);
    setLoading(false);
  }, []);

  useEffect(() => { void loadApprovals(); }, [loadApprovals]);

  const groups = useMemo<InboxGroup[]>(() => {
    const result: InboxGroup[] = [];
    if (localApprovals.length > 0) {
      result.push({
        taskId: "local",
        title: "Sample replay in the workspace",
        project: project?.name ?? "ZudoMart",
        status: agentStatus === "awaiting" ? "awaiting_approval" : agentStatus === "working" ? "running" : agentStatus === "done" ? "completed" : agentStatus,
        source: "local",
        items: localApprovals.map((approval) => ({
          key: `local:${approval.id}`, source: "local", taskId: "local", id: approval.id, kind: approval.kind, title: approval.title,
          reason: approval.reason ?? "", command: approval.command ?? null, files: approval.files ?? [], dir: approval.dir ?? "",
          risk: approval.risk ?? "Low", scope: "once", expires_at: null, status: approval.status,
          decided_by: approval.status === "pending" ? "" : "you", decided_at: null, created_at: new Date().toISOString(),
        })),
      });
    }
    for (const task of backendTasks) {
      const taskApprovals = approvalsByTask[task.id] ?? [];
      if (taskApprovals.length === 0) continue;
      result.push({
        taskId: task.id, title: task.prompt, project: task.project, status: task.status, source: "backend",
        items: taskApprovals.map((approval) => {
          const localDecision = decidedApprovals[`${task.id}:${approval.id}`];
          return {
            key: `${task.id}:${approval.id}`, source: "backend", taskId: task.id, id: approval.id, kind: approval.kind,
            title: approval.title, reason: approval.reason, command: approval.command, files: approval.files, dir: "",
            risk: approval.risk, scope: approval.scope, expires_at: approval.expires_at,
            status: localDecision?.status ?? approval.status, decided_by: localDecision ? "you" : approval.decided_by,
            decided_at: localDecision?.at ?? approval.decided_at, created_at: approval.created_at,
          };
        }),
      });
    }
    return result;
  }, [localApprovals, backendTasks, approvalsByTask, decidedApprovals, agentStatus, project]);

  return { groups, loading, isSampleData, loadApprovals };
}
