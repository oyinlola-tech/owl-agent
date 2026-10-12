import { useCallback, useEffect, useMemo, useState } from "react";
import { usePendingApprovalsStore } from "../../state/pendingApprovals.store";
import { agentApi } from "../../services/agentApi.service";
import { isServiceAuthError } from "../../services/connection/serviceRequest.service";
import type { ApprovalRead, BackendTask } from "../../services/agentApi.types";
import type { InboxGroup } from "./inboxApproval.types";

export function useInboxApprovals() {
  const decidedApprovals = usePendingApprovalsStore((s) => s.decided);
  const [backendTasks, setBackendTasks] = useState<BackendTask[]>([]);
  const [approvalsByTask, setApprovalsByTask] = useState<Record<string, ApprovalRead[]>>({});
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<"none" | "offline" | "unauthorized">("none");

  const loadApprovals = useCallback(async () => {
    setLoading(true);
    let tasks: BackendTask[];
    try {
      tasks = await agentApi.backendTasks();
    } catch (error) {
      setFailure(isServiceAuthError(error) ? "unauthorized" : "offline");
      setLoading(false);
      return;
    }
    const approvalLists = await Promise.all(
      tasks.map((task) => agentApi.approvals(task.id).catch(() => [] as ApprovalRead[])),
    );
    const approvalsMap: Record<string, ApprovalRead[]> = {};
    tasks.forEach((task, index) => { approvalsMap[task.id] = approvalLists[index]; });
    setBackendTasks(tasks);
    setApprovalsByTask(approvalsMap);
    setFailure("none");
    setLoading(false);
  }, []);

  useEffect(() => { void loadApprovals(); }, [loadApprovals]);

  const groups = useMemo<InboxGroup[]>(() => {
    const result: InboxGroup[] = [];
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
  }, [backendTasks, approvalsByTask, decidedApprovals]);

  return { groups, loading, failure, loadApprovals };
}
