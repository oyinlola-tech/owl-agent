import {
  Broom, Browser, Bug, ChatCircleText, Cube, FileText, Flask, GitPullRequest, Key, MagnifyingGlass, Package, Pulse,
  Rocket, ShieldCheck, TestTube, TreeStructure, type Icon,
} from "@phosphor-icons/react";
import type { Hue } from "../../../../shared/components/tag.component";

export type PlaybookCategory = "Build" | "Fix" | "Review" | "Maintain" | "Explore";

export interface PlaybookField { key: string; label: string; value: string }
export interface Playbook {
  id: string;
  cat: PlaybookCategory;
  title: string;
  outcome: string;
  icon: Icon;
  hue: Hue;
  tools: string[];
  approvals: number;
  steps: string[];
  fields: PlaybookField[];
  template: string;
}

export const PLAYBOOK_CATEGORIES: { id: PlaybookCategory; icon: Icon; hue: Hue }[] = [
  { id: "Build", icon: Rocket, hue: "blue" },
  { id: "Fix", icon: Bug, hue: "red" },
  { id: "Review", icon: MagnifyingGlass, hue: "yellow" },
  { id: "Maintain", icon: Broom, hue: "brown" },
  { id: "Explore", icon: TreeStructure, hue: "green" },
];

export const PLAYBOOKS: Playbook[] = [
  {
    id: "jwt", cat: "Build", title: "Add JWT auth to a Go API", icon: Key, hue: "blue",
    outcome: "Login, token issue and refresh, a route guard, and tests.",
    tools: ["fs_read", "fs_apply_edit", "exec_run"], approvals: 2,
    steps: ["Read the user model and routes", "Propose the auth package as a diff", "Write files after approval", "Run go test ./...", "Checkpoint and summarise"],
    fields: [{ key: "ttl", label: "Access token lifetime", value: "15 minutes" }],
    template: "In {project}, add JWT authentication to the HTTP API. Hash passwords with bcrypt, issue access tokens that expire after {ttl} plus a refresh token, and protect /api routes with middleware. Add table-driven tests and run go test ./... before finishing.",
  },
  {
    id: "e2e", cat: "Build", title: "Add end-to-end tests", icon: TestTube, hue: "blue",
    outcome: "Browser tests for the critical path, runnable locally and in CI.",
    tools: ["fs_read", "fs_create", "exec_run"], approvals: 2,
    steps: ["Find the main user journey", "Pick the existing test runner or propose Playwright", "Write tests for the journey", "Run them and fix flakes"],
    fields: [{ key: "flow", label: "Journey to cover", value: "sign up, add to cart, and checkout" }],
    template: "In {project}, add end-to-end tests that cover {flow}. Reuse the existing test tooling if there is one. Keep selectors stable (roles and labels, not CSS classes). Run the suite and report anything flaky.",
  },
  {
    id: "logging", cat: "Build", title: "Add structured logging", icon: Pulse, hue: "blue",
    outcome: "JSON logs with request IDs and consistent levels across handlers.",
    tools: ["fs_search", "fs_apply_edit", "exec_run"], approvals: 2,
    steps: ["Find current logging calls", "Introduce one logger with fields", "Add a request ID middleware", "Replace ad-hoc prints", "Run the tests"],
    fields: [{ key: "lib", label: "Logger", value: "the standard library slog package" }],
    template: "In {project}, replace ad-hoc logging with structured JSON logging using {lib}. Every request should carry a request ID. Keep log levels consistent: debug for internals, info for lifecycle, warn for recoverable problems, error for failures.",
  },
  {
    id: "test", cat: "Fix", title: "Fix a failing test", icon: Bug, hue: "red",
    outcome: "The test passes for the right reason, with the root cause explained.",
    tools: ["exec_run", "fs_read", "fs_apply_edit"], approvals: 2,
    steps: ["Run the failing test and read the output", "Find the root cause", "Propose the smallest fix", "Rerun the full suite"],
    fields: [{ key: "test", label: "Test name or path", value: "TestCheckoutTotals" }],
    template: "In {project}, the test {test} is failing. Run it, find the root cause, and propose the smallest change that fixes the code (not the test) unless the test itself is wrong. Explain why it failed, then run the whole suite.",
  },
  {
    id: "timeout", cat: "Fix", title: "Fix a slow or timing-out request", icon: Flask, hue: "red",
    outcome: "A measured fix with timeouts, retries, and a regression test.",
    tools: ["fs_search", "fs_apply_edit", "exec_run"], approvals: 2,
    steps: ["Locate the call path", "Measure where time goes", "Add timeout and retry with backoff", "Add a test for the slow path"],
    fields: [{ key: "endpoint", label: "Endpoint or call", value: "the OCR upload client" }],
    template: "In {project}, {endpoint} is slow or times out. Find where the time goes, set an explicit timeout, add retry with jittered backoff for idempotent calls only, and add a test that simulates a slow upstream.",
  },
  {
    id: "pr", cat: "Review", title: "Review a pull request diff", icon: GitPullRequest, hue: "yellow",
    outcome: "Findings ranked by severity, each with file, line, and a suggested fix.",
    tools: ["git_diff", "git_log", "fs_read"], approvals: 0,
    steps: ["Read the diff against the base branch", "Read the touched files in full", "Check for bugs, security, and missing tests", "Rank findings"],
    fields: [{ key: "base", label: "Base branch", value: "main" }],
    template: "In {project}, review the changes on the current branch against {base}. Report correctness bugs, security problems, and missing tests first, then smaller issues. For each finding give the file, the line, why it matters, and a concrete fix. Do not edit files.",
  },
  {
    id: "security", cat: "Review", title: "Audit for secrets and unsafe input", icon: ShieldCheck, hue: "yellow",
    outcome: "A list of risky spots: secrets in code, injection, and unchecked input.",
    tools: ["fs_search", "fs_read", "git_log"], approvals: 0,
    steps: ["Search for keys and tokens in code and history", "Trace user input to queries and commands", "Check auth on every route", "Write up findings"],
    fields: [{ key: "area", label: "Focus area", value: "the HTTP handlers" }],
    template: "In {project}, audit {area} for security problems: hardcoded secrets, SQL or command injection, missing authorization checks, and unvalidated input. Report findings with severity and a fix. Do not change files.",
  },
  {
    id: "upgrade", cat: "Maintain", title: "Upgrade a dependency safely", icon: Package, hue: "brown",
    outcome: "The new version in place, breaking changes handled, tests green.",
    tools: ["fs_read", "fs_apply_edit", "exec_run", "git_commit"], approvals: 3,
    steps: ["Read the changelog between versions", "Find every call site affected", "Upgrade and adapt code", "Run tests", "Commit with a clear message"],
    fields: [{ key: "dep", label: "Dependency", value: "react to the latest 19.x" }],
    template: "In {project}, upgrade {dep}. Read the release notes for breaking changes first, list the call sites they affect, then upgrade and adapt the code. Run the test suite and commit only if it passes.",
  },
  {
    id: "dead", cat: "Maintain", title: "Find dead code", icon: Broom, hue: "brown",
    outcome: "Unused exports, files, and flags, with proof each one is unused.",
    tools: ["fs_search", "fs_read"], approvals: 0,
    steps: ["List exports and entry points", "Search for references", "Check dynamic uses and config", "Report candidates with evidence"],
    fields: [{ key: "dir", label: "Folder", value: "src" }],
    template: "In {project}, find dead code under {dir}: unused exports, unreachable files, and stale feature flags. For each candidate show the search that proves it is unused and note any dynamic loading that could hide a reference. Do not delete anything yet.",
  },
  {
    id: "docs", cat: "Maintain", title: "Write API docs from code", icon: FileText, hue: "brown",
    outcome: "A reference page for every endpoint, generated from the handlers.",
    tools: ["fs_read", "fs_create"], approvals: 1,
    steps: ["Find the router and handlers", "Read request and response types", "Write one section per endpoint", "Add examples"],
    fields: [{ key: "out", label: "Output file", value: "docs/API.md" }],
    template: "In {project}, write API reference documentation to {out}. Cover every endpoint: method, path, auth, request body, response, and error codes, with one curl example each. Derive everything from the code, and mark anything you had to guess.",
  },
  {
    id: "recreate", cat: "Build", title: "Recreate a landing page", icon: Browser, hue: "blue",
    outcome: "Fresh, responsive components that match the reference's structure.",
    tools: ["browser_open", "fs_create", "exec_run"], approvals: 2,
    steps: ["Capture the reference at three widths", "Map sections and components", "Write fresh code", "Compare side by side"],
    fields: [{ key: "url", label: "Reference URL", value: "https://example.com" }],
    template: "In {project}, recreate the structure and responsive behaviour of {url} as new components. Study the layout at 1440, 768, and 390 pixels wide. Write original code and copy, not the site's assets or text.",
  },
  {
    id: "explain", cat: "Explore", title: "Explain this repository", icon: ChatCircleText, hue: "green",
    outcome: "An onboarding guide: structure, data flow, and where to start.",
    tools: ["fs_list", "fs_read", "git_log"], approvals: 0,
    steps: ["Map the folder structure", "Find entry points and data flow", "Read recent history for hot spots", "Write the guide"],
    fields: [{ key: "reader", label: "Written for", value: "a new backend engineer" }],
    template: "Explain the {project} repository for {reader}. Cover the folder structure, how a request flows through the system, where data is stored, how to run it locally, and the five files to read first. Do not change any files.",
  },
  {
    id: "arch", cat: "Explore", title: "Map the architecture", icon: Cube, hue: "green",
    outcome: "Modules, their dependencies, and the riskiest coupling points.",
    tools: ["fs_list", "fs_search", "fs_read"], approvals: 0,
    steps: ["List modules and packages", "Trace imports between them", "Find cycles and heavy coupling", "Summarise with a diagram in text"],
    fields: [{ key: "depth", label: "Detail level", value: "package level" }],
    template: "Map the architecture of {project} at {depth}. List the modules, what each owns, and how they depend on each other. Point out import cycles and the places where a change would ripple the most.",
  },
];

export function fillPlaybookTemplate(template: string, project: string, fields: PlaybookField[]) {
  return fields.reduce(
    (prompt, field) => prompt.split(`{${field.key}}`).join(field.value),
    template.split("{project}").join(project),
  );
}
