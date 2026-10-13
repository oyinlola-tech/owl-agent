import { useCallback } from "react";
import { agentApi } from "../services/agentApi.service";
import type { GitSummary } from "../services/agentApi.types";
import { useAsyncResource, type ResourceState } from "./useAsyncResource.hook";

export interface ProjectGitSyncBody {
  remote?: string;
  branch?: string;
  confirm: boolean;
}

export interface ProjectGitSyncResult {
  branch: string;
  remote: string;
  ahead: number;
  behind: number;
  pushed?: boolean;
  pulled?: boolean;
}

export interface ProjectGit extends ResourceState<GitSummary> {
  push: (body: ProjectGitSyncBody) => Promise<ProjectGitSyncResult>;
  pull: (body: ProjectGitSyncBody) => Promise<ProjectGitSyncResult>;
  sync: (body: ProjectGitSyncBody) => Promise<{ pulled: ProjectGitSyncResult; pushed: ProjectGitSyncResult }>;
}

export function useProjectGit(projectId: string | null): ProjectGit {
  const resource = useAsyncResource<GitSummary>(async () => {
    if (!projectId) throw new Error("no project open");
    return agentApi.gitSummary(projectId);
  }, [projectId]);
  const push = useCallback(async (body: ProjectGitSyncBody) => {
    if (!projectId) throw new Error("no project open");
    const result = await agentApi.gitPush(projectId, body);
    resource.reload();
    return result;
  }, [projectId, resource.reload]);
  const pull = useCallback(async (body: ProjectGitSyncBody) => {
    if (!projectId) throw new Error("no project open");
    const result = await agentApi.gitPull(projectId, body);
    resource.reload();
    return result;
  }, [projectId, resource.reload]);
  const sync = useCallback(async (body: ProjectGitSyncBody) => {
    if (!projectId) throw new Error("no project open");
    const result = await agentApi.gitSync(projectId, body);
    resource.reload();
    return result;
  }, [projectId, resource.reload]);
  return { ...resource, push, pull, sync };
}
