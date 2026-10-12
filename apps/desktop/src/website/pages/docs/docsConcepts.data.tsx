import type { ReactNode } from "react";
import { Brain, ClockCounterClockwise, Cpu, Gauge, ListChecks, ShieldCheck } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import type { Hue } from "../../../shared/components/tag.component";

export const DOCS_CONCEPTS: { id: string; icon: Icon; hue: Hue; title: string; body: ReactNode }[] = [
  { id: "c-tasks", icon: ListChecks, hue: "blue", title: "Tasks",
    body: <>A task is one objective in one workspace, such as “add JWT auth”. It moves through <em>created</em>, <em>running</em>, <em>awaiting approval</em>, <em>paused</em>, and ends <em>completed</em>, <em>failed</em>, or <em>cancelled</em>. Every step, tool call, and model call is stored, and tasks survive a restart.</> },
  { id: "c-approvals", icon: ShieldCheck, hue: "orange", title: "Approvals",
    body: <>Tools that write files, run commands, or touch Git need an approval. The approval stores a SHA-256 of the tool and its exact arguments, so it only unlocks that action. It is used up once it runs, unless you approve for the whole task, and it expires after <code>OWL_APPROVAL_TTL</code> seconds.</> },
  { id: "c-journal", icon: ClockCounterClockwise, hue: "brown", title: "Checkpoints and the change journal",
    body: <>Before and after text for every applied edit goes into a change journal. You can revert any entry; if the file changed since, the service returns a conflict instead of overwriting your work. Checkpoints mark points in a task that resume continues from.</> },
  { id: "c-memory", icon: Brain, hue: "pink", title: "Memory",
    body: <>Facts live in four categories: <b>global</b> (all projects), <b>project</b> (one project only), <b>task</b>, and <b>knowledge</b>. Each can be edited, disabled, or deleted. Text that looks like a key, token, or password is scrubbed before it is saved.</> },
  { id: "c-routing", icon: Cpu, hue: "green", title: "Model routing",
    body: <>With the model set to Auto, each request is classified as <code>chat</code>, <code>plan</code>, <code>code</code>, <code>debug</code>, <code>big_context</code>, <code>summarize</code>, or <code>multimodal</code>. The router picks a model with the needed capabilities and enough context, avoiding ones that recently failed. The reason is stored on the task.</> },
  { id: "c-context", icon: Gauge, hue: "purple", title: "Context budget",
    body: <>Each request is measured against the model's context window minus a reserve for the reply. When usage crosses the compression threshold, older history and tool output are summarised and the before and after token counts are recorded.</> },
];
