import { agentApi } from "../services/agentApi.service";
import type { Project } from "../services/agentApi.types";
import { useAsyncResource, type ResourceState } from "./useAsyncResource.hook";

export interface ProjectsResource extends ResourceState<Project[]> {
  projects: Project[];
}

export function useProjects(): ProjectsResource {
  const resource = useAsyncResource<Project[]>(async () => (await agentApi.listProjects()).projects, []);
  return { ...resource, projects: resource.data ?? [] };
}
