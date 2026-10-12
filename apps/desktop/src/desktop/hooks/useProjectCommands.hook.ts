import { agentApi } from "../services/agentApi.service";
import type { CommandRow } from "../services/agentApi.types";
import { useAsyncResource, type ResourceState } from "./useAsyncResource.hook";

export function useProjectCommands(projectId: string | null): ResourceState<CommandRow[]> {
  return useAsyncResource<CommandRow[]>(async () => {
    if (!projectId) return [];
    return (await agentApi.commandHistory(projectId)).commands;
  }, [projectId]);
}
