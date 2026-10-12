import type { Hue } from "../../../shared/components/tag.component";

const PROJECT_HUES: Hue[] = ["blue", "purple", "green", "orange", "pink", "yellow", "brown", "red"];

export function hueForName(name: string): Hue {
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return PROJECT_HUES[hash % PROJECT_HUES.length];
}

export const PROJECT_STACKS: Record<string, { label: string; hue: Hue }> = {
  ZudoMart: { label: "Go", hue: "blue" },
  ProofLens: { label: "TypeScript", hue: "purple" },
  Scriptune: { label: "React", hue: "green" },
  "Owl Agent": { label: "Python + React", hue: "yellow" },
};
