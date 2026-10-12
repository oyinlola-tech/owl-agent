import { agentApi } from "../services/agentApi.service";
import type { GitSummary } from "../services/agentApi.types";
import { useAsyncResource, type ResourceState } from "./useAsyncResource.hook";

export function useProjectGit(projectId: string | null): ResourceState<GitSummary> {
  return useAsyncResource<GitSummary>(async () => {
    if (!projectId) throw new Error("no project open");
    return agentApi.gitSummary(projectId);
  }, [projectId]);
}
