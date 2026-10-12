import type {
  ActEvent, AgentStatus, Approval, ChangeFile, ChatMsg, TermLine,
} from "../state/workspace.types";
import { SAMPLE_APPROVALS, SAMPLE_CHANGES } from "./samples/sampleWorkspace.data";

interface AgentSink {
  reset(): void;
  steps(events: ActEvent[]): void;
  chat(msg: Omit<ChatMsg, "id">): void;
  lines(lines: Omit<TermLine, "id">[]): void;
  approvals(list: Approval[]): void;
  changes(list: ChangeFile[]): void;
  status(s: AgentStatus, step: number): void;
  notice(n: string): void;
}

export interface AgentService {
  start(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  decide(id: string, v: "approved" | "rejected"): void;
  send(text: string): void;
  runCommand(cmd: string): void;
}

interface SampleTaskStep {
  events: ActEvent[];
  chat?: Omit<ChatMsg, "id">;
  lines?: Omit<TermLine, "id">[];
  approvals?: Approval[];
  changes?: ChangeFile[];
  progress?: number;
  status?: AgentStatus;
}

const SAMPLE_TASK_SCRIPT: SampleTaskStep[] = [
  {
    events: [
      { id: "e1", label: "Indexed project", state: "done" },
      { id: "e2", label: "Read 14 files", state: "done" },
      { id: "e3", label: "Found existing User model", state: "done" },
      { id: "e4", label: "Inspecting database", state: "active" },
      { id: "e5", label: "Writing implementation", state: "queued" },
      { id: "e6", label: "Running tests", state: "queued" },
    ],
    chat: { from: "owl", text: "Plan approved in this replay. Starting with the project index." },
    lines: [{ kind: "agent", text: "agent: indexing ZudoMart (14 files)" }],
  },
  {
    events: [
      { id: "e1", label: "Indexed project", state: "done" },
      { id: "e2", label: "Read 14 files", state: "done" },
      { id: "e3", label: "Found existing User model", state: "done" },
      { id: "e4", label: "Inspecting database", state: "done", detail: "postgres, users table, no auth columns" },
      { id: "e5", label: "Writing implementation", state: "active" },
      { id: "e6", label: "Running tests", state: "queued" },
    ],
    approvals: SAMPLE_APPROVALS,
    changes: SAMPLE_CHANGES,
    lines: [{ kind: "agent", text: "agent: proposed 4 files, waiting for approval" }],
    progress: 38,
    status: "awaiting",
  },
  {
    events: [
      { id: "e1", label: "Indexed project", state: "done" },
      { id: "e2", label: "Read 14 files", state: "done" },
      { id: "e3", label: "Found existing User model", state: "done" },
      { id: "e4", label: "Inspecting database", state: "done" },
      { id: "e5", label: "Writing implementation", state: "done" },
      { id: "e6", label: "Running tests", state: "active" },
    ],
    chat: { from: "owl", text: "Approvals granted. Files written. Running the test suite now." },
    lines: [
      { kind: "cmd", text: "$ go test ./..." },
      { kind: "ok", text: "ok internal/auth, internal/users, internal/payments" },
    ],
    progress: 72,
    status: "working",
  },
  {
    events: [
      { id: "e1", label: "Indexed project", state: "done" },
      { id: "e2", label: "Read 14 files", state: "done" },
      { id: "e3", label: "Found existing User model", state: "done" },
      { id: "e4", label: "Inspecting database", state: "done" },
      { id: "e5", label: "Writing implementation", state: "done" },
      { id: "e6", label: "Running tests", state: "done" },
    ],
    chat: { from: "owl", text: "Tests pass. Review the Changes tab, then approve the commit when ready." },
    lines: [{ kind: "ok", text: "build successful, 12 files changed" }],
    progress: 100,
    status: "done",
  },
];

export class MockAgentService implements AgentService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private approvals: Approval[] = [];
  private halted: "paused" | "stopped" | null = null;

  constructor(private sink: AgentSink) {}

  start() {
    this.stopTimer();
    this.step = 0;
    this.halted = null;
    this.approvals = [];
    this.sink.reset();
    this.applyScriptStep(0);
    this.schedule(1);
  }

  pause() {
    this.halted = "paused";
    this.sink.status("paused", this.step);
    this.sink.notice("Task paused");
  }

  resume() {
    if (this.halted !== "paused") return;
    this.halted = null;
    const pending = this.approvals.some((a) => a.status === "pending");
    this.sink.status(pending ? "awaiting" : "working", this.step);
    this.sink.notice("");
  }

  stop() {
    this.stopTimer();
    this.halted = "stopped";
    this.sink.status("stopped", this.step);
    this.sink.notice("Task stopped");
  }

  decide(id: string, v: "approved" | "rejected") {
    this.approvals = this.approvals.map((a) => (a.id === id ? { ...a, status: v } : a));
    this.sink.approvals(this.approvals);
    this.sink.lines([{
      kind: v === "approved" ? "ok" : "err",
      text: v === "approved" ? "approved, continuing" : "rejected, agent held",
    }]);
    this.sink.notice("");
    if (this.approvals.every((a) => a.status !== "pending")) {
      const next = this.step + 1;
      if (next < SAMPLE_TASK_SCRIPT.length) {
        this.applyScriptStep(next);
        this.schedule(next + 1);
      }
    }
  }

  send(text: string) {
    const clean = text.trim();
    if (!clean) return;
    this.sink.chat({ from: "you", text: clean });
    this.sink.lines([{ kind: "cmd", text: `$ owl ask "${clean.slice(0, 48)}"` }]);
    this.sink.chat({ from: "owl", text: "Noted. Press Run to replay the sample task, or approve the pending plan." });
  }

  runCommand(cmd: string) {
    const text = cmd.trim();
    if (!text) return;
    const out: Omit<TermLine, "id">[] = [{ kind: "cmd", text: `$ ${text}` }];
    if (/go test/.test(text)) {
      out.push(
        { kind: "out", text: "ok internal/auth 0.42s" },
        { kind: "out", text: "ok internal/users 0.18s" },
        { kind: "ok", text: "PASS" },
      );
    } else if (/go build|npm run build/.test(text)) {
      out.push({ kind: "ok", text: "build successful" });
    } else if (/^ls/.test(text)) {
      out.push({ kind: "out", text: "src  frontend  tests  README.md" });
    } else {
      out.push({ kind: "out", text: "(mock) ran in project sandbox, exit 0" });
    }
    this.sink.lines(out);
  }

  private stopTimer() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private applyScriptStep(i: number) {
    const s = SAMPLE_TASK_SCRIPT[i];
    if (!s) return;
    this.step = i;
    this.sink.steps(s.events);
    if (s.chat) this.sink.chat(s.chat);
    if (s.lines) this.sink.lines(s.lines);
    if (s.approvals) {
      this.approvals = s.approvals.map((a) => ({ ...a }));
      this.sink.approvals(this.approvals);
    }
    if (s.changes) this.sink.changes(s.changes);
    this.sink.status(s.status ?? "working", i);
    if (s.status === "awaiting") {
      this.stopTimer();
      this.sink.notice("Agent needs approval");
    }
    if (i === SAMPLE_TASK_SCRIPT.length - 1) {
      this.stopTimer();
      this.sink.notice("Tests passed");
    }
  }

  private schedule(from: number) {
    let i = from;
    this.timer = setInterval(() => {
      if (this.halted) return;
      if (i >= SAMPLE_TASK_SCRIPT.length) { this.stopTimer(); return; }
      this.applyScriptStep(i);
      i += 1;
    }, 2200);
  }
}
