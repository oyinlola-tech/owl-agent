import { useEffect, useState } from "react";
import { agentApi } from "../../services/agentApi.service";
import type { ApprovalRead, BackendTask } from "../../services/agentApi.types";
import { SAMPLE_APPROVALS_BY_TASK, SAMPLE_BACKEND_TASKS } from "../../services/samples/sampleTasks.data";
import { loadWithSampleFallback } from "../../services/samples/sampleMode.helper";

export interface PendingBackendApproval {
  task: BackendTask;
  approval: ApprovalRead;
}

export function useBackendWork() {
  const [backendTasks, setBackendTasks] = useState<BackendTask[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingBackendApproval[]>([]);
  const [isSampleData, setIsSampleData] = useState(false);
  useEffect(() => {
    let isMounted = true;
    void (async () => {
      const taskResult = await loadWithSampleFallback(agentApi.backendTasks(), SAMPLE_BACKEND_TASKS);
      if (!isMounted) return;
      setBackendTasks(taskResult.data);
      setIsSampleData(taskResult.demo);
      const waitingTasks = taskResult.data.filter((task) => task.status === "awaiting_approval" || task.status === "running");
      const approvalLists = await Promise.all(waitingTasks.map(async (task) => {
        const approvals = taskResult.demo
          ? SAMPLE_APPROVALS_BY_TASK[task.id] ?? []
          : await agentApi.approvals(task.id).catch(() => [] as ApprovalRead[]);
        return approvals.filter((approval) => approval.status === "pending").map((approval) => ({ task, approval }));
      }));
      if (isMounted) setPendingApprovals(approvalLists.flat());
    })();
    return () => { isMounted = false; };
  }, []);
  return { backendTasks, pendingApprovals, isSampleData };
}
