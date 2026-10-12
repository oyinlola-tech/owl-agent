import type { Hue } from "../../../shared/components/tag.component";
import type { Project } from "../../services/agentApi.types";

const PROJECT_HUES: Hue[] = ["blue", "purple", "green", "orange", "pink", "yellow", "brown", "red"];

export function hueForName(name: string): Hue {
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return PROJECT_HUES[hash % PROJECT_HUES.length];
}

export function stackLabel(project: Project): string {
  const languages = project.stack?.languages ?? [];
  const frameworks = project.stack?.frameworks ?? [];
  const parts = [...frameworks.slice(0, 1), ...languages.slice(0, frameworks.length ? 0 : 2)];
  return parts.join(" · ");
}
