import { agentApi } from "../services/agentApi.service";
import type { ProjectFileContent } from "../services/agentApi.types";
import { useAsyncResource, type ResourceState } from "./useAsyncResource.hook";

export function useProjectFile(projectId: string | null, path: string): ResourceState<ProjectFileContent> {
  return useAsyncResource<ProjectFileContent>(async () => {
    if (!projectId || !path) throw new Error("no file open");
    return agentApi.projectFile(projectId, path);
  }, [projectId, path]);
}
