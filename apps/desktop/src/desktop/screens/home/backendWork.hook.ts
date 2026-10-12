import { useEffect, useState } from "react";
import { agentApi } from "../../services/agentApi.service";
import type { ApprovalRead, BackendTask } from "../../services/agentApi.types";

export interface PendingBackendApproval {
  task: BackendTask;
  approval: ApprovalRead;
}

export function useBackendWork() {
  const [backendTasks, setBackendTasks] = useState<BackendTask[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingBackendApproval[]>([]);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let isMounted = true;
    void (async () => {
      let tasks: BackendTask[];
      try {
        tasks = await agentApi.backendTasks();
      } catch {
        if (isMounted) setOffline(true);
        return;
      }
      if (!isMounted) return;
      setBackendTasks(tasks);
      setOffline(false);
      const waitingTasks = tasks.filter((task) => task.status === "awaiting_approval" || task.status === "running");
      const approvalLists = await Promise.all(waitingTasks.map(async (task) => {
        const approvals = await agentApi.approvals(task.id).catch(() => [] as ApprovalRead[]);
        return approvals.filter((approval) => approval.status === "pending").map((approval) => ({ task, approval }));
      }));
      if (isMounted) setPendingApprovals(approvalLists.flat());
    })();
    return () => { isMounted = false; };
  }, []);
  return { backendTasks, pendingApprovals, offline };
}
