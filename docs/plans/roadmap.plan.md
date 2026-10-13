# OWL product roadmap

OWL is one desktop AI engineering workstation: a single task + tool runtime where every
capability (coding, terminal, git, browser, research, QA, security, deploy, forms) reuses the
same task, approval, workspace, memory, checkpoint, verification, audit and recovery
infrastructure. Not a coding bot with extra features bolted on.

Every powerful action stays governed by: permission scopes, approvals, workspace boundaries,
the sandbox, a credential vault (keys never enter model context), untrusted-input handling
(everything from the web/files/tool output is DATA, never instructions), an audit log, and
always-available emergency Stop.

## Done
- Phase 0  Security model: workspace roots, permission intent, approvals bound to exact
  action+args, audit via tool_calls/journal/checkpoints.
- Phase 1  Desktop app (Tauri 2 + React/TS/Vite, Monaco; Python FastAPI service; SQLite).
- Phase 2  Model registry + routing + usage.
- Phase 3  Context budgeting/compression + memory (global/project/task/knowledge).
- Phase 4  Coding agent (read/propose/apply as reviewable diffs).
- Phase 5  Sandboxed terminal (bubblewrap; no-network default; no privilege escalation).
- Phase 5.1 Independent verification (runtime runs the project's own checks; verified vs
  completed_unverified; fix-and-reverify loop; recovery).
- Security hardening pass (sandbox, service token, scanners, fuzzing, lab, threat model).

## In progress (Phase 5.2)
Providers + API keys (Claude/OpenAI/Gemini/Grok/Groq/NVIDIA/local), credential vault, local
data storage, personalization, stack advisor, real projects/files/git/commands, remove mock
data, onboarding, one-click + terminal installers. See providers.plan.md.

## Next, in order (each reuses the one runtime)- Phase 6  Git agent (status/diff/branch/commit/revert; push/merge/force-push need approval).
- Phase 7  Browser agent (isolated Playwright; click/type/upload/screenshot/extract; DOM is
  untrusted data). Foundation for research, recreation, QA, web security, form automation.
- Phase 8  Internet research (search → read → compare → cite → save to memory).
- Phase 9  Website analysis (observable structure/design only; never bypass auth or steal
  private source).
- Phase 10 Website recreation (analyze → plan → build original code → screenshot → diff →
  fix → verify).
- Phase 11 QA agent (functional, UI, responsive, API) on the verification engine.
- Phase 12 Accessibility checks.
- Phase 13 Security analysis of the user's OWN project (SAST, dependency audit, secrets) —
  extends the scanners already added.
- Phase 14 Authorized security testing — see "Sensitive phases" below.
- Phase 15 Vulnerability management (findings as tracked objects).
- Phase 16 Security remediation (fix → regression test → verify → approve → apply → retest).
- Phase 17 API/backend agent.  Phase 18 Database agent (DROP/TRUNCATE/prod ALTER need approval).
- Phase 19 DevOps (Docker/CI/Vercel; prod deploy needs approval).  Phase 20 Cloud (scoped creds).
- Phase 21 Personal computer/browser use (opt-in, isolated profile by default).
- Phase 22 Job applications / Phase 23 Grants / Phase 24 forms — stop before any final submit,
  legal declaration, payment or OTP; user approves. Never fabricate eligibility/credentials.
- Phase 25 Documents.  Phase 26 Communications (sending is approval-gated).
- Phase 27 Long-running autonomy (checkpoints).  Phase 28 Scheduling.
- Phase 29 Specialized agent roles.  Phase 30 Visual diffing.  Phase 31 Network inspection.
- Phase 32 Knowledge base.  Phase 33 Unified task system.  Phase 34 Unified tool system
  (every tool: input/output schema, permission, risk, approval policy, audit, timeout, limits).
- Phase 35 Full safety architecture.  Phase 36 Internet safety.  Phase 37 Credential vault.
- Phase 38 Emergency controls (Stop/Kill/Revoke/Lock).  Phase 39 Observability.
- Phase 40 Production release.

## Locked next features (owner-approved 2026-10-13)

Built in this order (1, 2, 8 first — they compound); each reuses the one
runtime and its approvals, sandbox, audit, and verification:

1. Real Git workflows — push/pull/sync, conflict-resolution UI, branch
   compare, through the sandboxed git runner with approvals.
2. Background tasks + notifications — tasks survive project switches; OS
   notification on approval-needed, verified, or failed.
3. Editable multi-file plans — reorder/rewrite plan steps before execution
   instead of take-it-or-leave-it.
4. Built-in diff editor / merge tool — accept hunks, not just whole files.
5. Project templates / starter kits — stack advisor recommendations become
   one-click scaffold + init + first commit (approval-gated).
6. Usage/cost dashboard — per-task spend, per-model breakdown, budget caps
   with warnings.
7. Voice input + Ask OWL polish — mic in the composer.
8. Auto-update — signed `latest.json` endpoint plus in-app prompt (Tauri
   updater is half-wired). Required once users are installed.
9. Shareable task bundles — export/import a task (plan, diffs, verification
   log) as a file or link; team/shared memory follows.
10. Plugin/MCP tools — user-added custom tools (linters, deploy scripts)
    through the same permission, risk, approval, and audit system.

## Sensitive phases — handled carefully, not skipped
Scope these to clear defensive/authorized-use designs with their own gated spec before any
implementation, and keep them within what the assistant can build:
- Phase 14 security testing: defensive-only framing — your own apps / explicit written
  authorization. Requires a target-authorization record (owner confirms authorization +
  scope + out-of-scope + rate limits + time window), passive/safe checks first, no
  destructive actions, full evidence/audit. Reconnaissance/scanning tooling and exploit-style
  actions get a dedicated spec and are built only for authorized-target, non-destructive use.
- Phases 21–24 (controlling your real browser, auto-applying to jobs/grants/forms): opt-in,
  isolated by default, and hard-stop before any irreversible/external/legal/payment step for
  explicit approval. Credentials via the vault, never the model.

Some items on the original list may be partly out of scope for an AI assistant to build
(e.g. offensive exploitation tooling); those will be proposed as defensive equivalents or
flagged for you to source elsewhere, rather than silently dropped.
