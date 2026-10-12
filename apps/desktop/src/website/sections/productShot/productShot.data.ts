import {
  BookOpenText, Brain, ClockCounterClockwise, Cpu, FileMagnifyingGlass, GearSix, Globe, House, Kanban, Layout,
  ListChecks, MagnifyingGlass, PencilSimple, ShieldCheck, TerminalWindow, Tray, Wrench,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import type { Hue } from "../../../shared/components/tag.component";

export const SHOT_NAV: { group: string; items: { icon: Icon; label: string; on?: boolean; badge?: string }[] }[] = [
  { group: "", items: [
    { icon: House, label: "Home" },
    { icon: Tray, label: "Inbox", badge: "2" },
    { icon: Layout, label: "Workspace" },
    { icon: Kanban, label: "Tasks", on: true },
    { icon: Globe, label: "Browser Studio" },
  ] },
  { group: "Knowledge", items: [
    { icon: Brain, label: "Memory" },
    { icon: BookOpenText, label: "Playbooks" },
    { icon: ClockCounterClockwise, label: "Change history" },
  ] },
  { group: "System", items: [
    { icon: Cpu, label: "Models & usage" },
    { icon: Wrench, label: "Agent tools" },
    { icon: GearSix, label: "Settings" },
  ] },
];

export const SHOT_TASKS: { name: string; note: string; project: string; status: { hue: Hue; label: string; pulse?: boolean }; p: number; when: string }[] = [
  { name: "Add JWT authentication", note: "Waiting for approval to write 3 files", project: "ZudoMart", status: { hue: "orange", label: "Needs approval", pulse: true }, p: 64, when: "9:12" },
  { name: "Fix checkout rounding", note: "VAT applied after coupon, rounding once", project: "ZudoMart", status: { hue: "blue", label: "Running", pulse: true }, p: 38, when: "10:05" },
  { name: "Raise API client timeout", note: "Retry with jittered backoff, tests pass", project: "ProofLens", status: { hue: "green", label: "Completed" }, p: 100, when: "Yesterday" },
  { name: "Onboarding repo summary", note: "Wrote docs/ONBOARDING.md", project: "Scriptune", status: { hue: "green", label: "Completed" }, p: 100, when: "Mon" },
  { name: "Recreate pricing page", note: "Paused at component breakdown", project: "Scriptune", status: { hue: "gray", label: "Paused" }, p: 52, when: "Sun" },
  { name: "Deploy staging", note: "Push to release/staging rejected", project: "ZudoMart", status: { hue: "red", label: "Failed" }, p: 41, when: "Sat" },
];

export const SHOT_TIMELINE: { hue: Hue; icon: Icon; t: string; d: string; state: "done" | "active" | "wait" }[] = [
  { hue: "blue", icon: FileMagnifyingGlass, t: "Indexed repository", d: "212 files, 14 packages", state: "done" },
  { hue: "blue", icon: MagnifyingGlass, t: "Read user model", d: "src/users/model.go", state: "done" },
  { hue: "gray", icon: ListChecks, t: "Wrote a 6-step plan", d: "Auth service, tokens, guard", state: "done" },
  { hue: "yellow", icon: PencilSimple, t: "Proposed 3 files", d: "+148 −6 lines", state: "done" },
  { hue: "orange", icon: ShieldCheck, t: "Waiting for you", d: "fs_create · expires in 25m", state: "active" },
  { hue: "purple", icon: TerminalWindow, t: "Run go test ./...", d: "Queued after approval", state: "wait" },
];
