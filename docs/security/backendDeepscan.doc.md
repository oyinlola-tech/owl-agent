# Backend deep scan — `services/agent` (2026-10-13)

Scope: `services/agent/app` (240 files), against `docs/plans/security.plan.md`,
`docs/plans/providers.plan.md` A–G, `docs/plans/roadmap.plan.md`, `docs/plans/codebase.plan.md`.
Method: direct file reads, targeted greps, full pytest run (504 passed, 273 subtests),
`ruff check` clean, `structureRule_check` 0 findings. No fixes applied in this pass.

## Severity key

- **High**: exploitable or data-loss-adjacent under realistic use.
- **Medium**: real bug with plausible trigger; needs a fix but not an emergency.
- **Low**: hardening, edge case, or latent-only.

---

## 1. Security findings

### Medium

**S1. Bubblewrap resource limits silently absent when `prlimit` is missing.**
`sandboxes/backends/bubblewrapBackend_sandbox.py:20-36` builds limits only as a
`prlimit` prefix; if the binary is missing, `build_bubblewrap_launch` returns no
`rlimits`, so `preexec_fn` is `None` and execution is unlimited. Seatbelt
(`seatbeltBackend_sandbox.py:63-69`) and container (`containerBackend_sandbox.py:51-52`)
backends set limits natively — Linux/bwrap is the weak one.
Trigger: `exec_run` of a fork bomb / memory hog on an image without `prlimit`.
Fix: fail closed (refuse or warn loudly) when limits cannot be applied; or apply
`resource.setrlimit` in `preexec_fn` instead of depending on an external binary.

**S2. Git hooks run unsandboxed on fallback.**
`executors/gitExecutor_executor.py:37-64` sets `GIT_OPTIONAL_LOCKS=0` /
`GIT_TERMINAL_PROMPT=0` but never disables hooks (`core.hooksPath`, `--no-optional-locks`
everywhere). Inside bwrap the hook is workspace-confined; on unsandboxed fallback
(Windows, `preferred` without backend) `clone/pull/checkout` executes
attacker-authored hooks with full user privileges and the network grant from the pull.
Fix: `-c core.hooksPath=/dev/null` (plus config lockdown) on clone/fetch/pull/checkout.

**S3. Approval double-spend race (check-then-consume).**
`tasks/actions/toolExecution_action.py:51,117-118`: `find_usable_approval_for_action`
(SELECT) → execute → `mark_approval_consumed` (UPDATE) with awaits in between.
Two concurrent flows can both observe `consumed_at IS NULL` and both run on one
`once` approval. Same pattern in `verificationRound_verification.py:200` and in
`record_approval_decision` (`tasks/states/taskRecord_state.py` analog — narrow window,
relies on event-loop atomicity for the 409-on-second-decide).
Fix: guarded consume (`UPDATE … WHERE id=? AND consumed_at IS NULL`, check rowcount)
or `BEGIN IMMEDIATE`.

**S4. Secret scrubber is pattern-narrow, storage is pattern-wide.**
`guards/secretScrub_guard.py:5-14` catches `key[:=]value` shapes + a few prefixes
(`nvapi-`, `sk-`, `ghp_`, `xox`, `gsk_`, `xai-`, `AIza`) + PEM headers, but misses prose
(`my password is hunter2`), bare `AKIA…` AWS keys, and other shapes. Misses persist
into memories/profile/exports/tool excerpts.
Fix: widen patterns (AWS, generic high-entropy tokens), add a length/entropy fallback,
and confirm-before-store for suspected secrets.

**S5. Legacy-DB migration trusts planted files.**
`storages/storageBootstrap_storage.py:54-67` adopts any legacy candidate file after only
an integrity check — no ownership/permission check. A pre-placed crafted SQLite file at
a legacy path becomes the live agent DB (fake approvals/tasks).
Fix: check source ownership/mode before adopt; log the adopted path loudly.

### Low

- **S6. Double-resume spawns two workers** (`tasks/states/taskLifecycle_state.py:96-121`,
  check-then-act with `await bus.publish_event` between guard and registration).
  Two `POST resume` interleaved → two `run_task_from_plan_to_finish` loops, double tool
  calls. Fix: per-task asyncio lock around resume. (Also a correctness bug — see B1.)
- **S7. Workspace TOCTOU** (`guards/workspaceAccess_guard.py:52-75`): check-then-open with
  no `O_NOFOLLOW`; a symlink swapped between approval and open escapes. Needs a writer
  racing inside an authorized root (malicious hook / concurrent step).
- **S8. DNS TOCTOU on browser fetch** (`executors/browserExecutor_executor.py:26-31`):
  validation resolves, then Chromium re-resolves at connect; sub-second TTL can swap a
  public IP for `169.254.169.254`/`127.0.0.1`. Per-hop re-validation narrows it; closing
  it needs a resolving proxy / fixed-IP dial.
- **S9. Backup snapshot permission window** (`databases/databaseBackup_database.py:48-62`):
  `.partial`/snapshot DBs created under umask, chmodded `0600` after — brief
  world-readable window on lax umasks. `write_base64_archive` already uses
  `os.open(...,0o600)`.
- **S10. Case-sensitive sensitive-component match** (`guards/workspaceAccess_guard.py:82`):
  `{".ssh",".gnupg",…}` set misses case variants on macOS mounts (regexes already `re.I`).
- **S11. Blocked-URL errors echo host→IP** (`executors/browserExecutor_executor.py:81`):
  internal DNS answers leak into transcripts/tool excerpts.
- **S12. SSE `?token=` in history/proxy logs** (`middlewares/localServiceAuth_middleware.py:76-79`):
  justified (EventSource can't set headers), file logs scrubbed, but URL persists in
  browser history and upstream proxy logs.
- **S13. Unsandboxed fallback reports `network=True`** (`executors/commandExecutor_executor.py:200`):
  honest but permissive — every command on backend-less machines gets network.
- **S14. `empty args_hash` matches any args** (`guards/approvalBinding_guard.py:58`):
  latent only (today `""` occurs solely with `action==""`, which can't match a real filter).
- **S15. Console log handler unscrubbed** (`storages/logFile_storage.py:63-70`): scrub filter
  attaches to the file handler only; bearer/`?token=` can reach stdout/container logs.
- **S16. Provider base-URL check is syntax/denylist-only**
  (`llms/connections/providerAddress_connection.py:32-73`): editable-URL providers can
  point at hostnames resolving to link-local/metadata space. Self-attack only — hardening.
- **S17. `read_text_window` decodes binaries** (`tools/handlers/fileReading_handler.py:25-32`):
  capped at 256 KiB but not refused (project layer refuses; agent-tool layer doesn't).
- **S18. OPTIONS bypasses host+token on all paths**
  (`middlewares/localServiceAuth_middleware.py:92`): preflight-only today; defense-in-depth gap.
- **S19. `extra_hosts` widens Host allowlist** (`appFactory_server.py:148`): opt-in, record it.

### Verified OK (security)

Constant-time token compare; identical 401s; Host+port rebinding block; Content-Type on
mutating routes; realpath guard + fail-closed empty roots + NUL rejection; argv-only exec
(zero `shell=True`/`os.system`/`eval`/`pickle`); env scrub + allowlist; timeout/killpg/caps;
honest `sandboxed=False` + `security.unsandboxed` events; exact SHA-256 approval binding +
TTL + task scoping; per-hit fs_search re-resolution; all-IP SSRF checks + per-hop redirect
re-validation + `untrusted` marking; git ref/remote validation + `--end-of-options` +
`--force-with-lease`; 0600/0700 key/token/db/backup/log/export; provider error redaction;
memory/profile scrub on create *and* update; parameterized SQL; zip-slip-proof import with
allowlist + caps; scrubbed export (secret columns blanked, secret tables dropped).

---

## 2. Correctness bugs

### High

- **B1. Concurrent double-resume → two workers** (same as S6,
  `tasks/states/taskLifecycle_state.py:96-121`). Fix with a per-task lock.

### Medium

- **B2. `max_elapsed` resets on every resume.** `agentRun_agent.py:13` sets
  `started_at = monotonic()` per run; iterations/model_calls persist but elapsed doesn't.
  Pause/resume cycling evades the time budget. Fix: persist cumulative elapsed.
- **B3. Generic `except Exception` can overwrite `CANCELLED` with `FAILED`**
  (`tasks/agents/agentRun_agent.py:47-49`): no terminal-state guard before
  `set_task_status(FAILED)`. Fix: check terminal state first.
- **B4. Taint false negatives on nested paths.**
  `requirements/requirementDetection_requirement.py:91-92` uses `fnmatch(path, pat)` where
  bare patterns (`package.json`, `pyproject.toml`, `go.mod`, `Makefile`, `*.bats`, `*.sh`)
  never match nested files (`frontend/package.json`). Monorepo script changes skip the
  "task changed what the check runs" warning. Fix: also match `*/<pat>`.
- **B5. Kotlin detector emits an unrunnable requirement.**
  `requirements/detectors/jvm/jvmBuild_detector.py:59-76`: bare `argv=("kotlinc",)` with no
  inputs always fails, burning verification attempts toward FAILED. Fix: mark non-required
  or drop standalone-kotlinc in favor of informational detection.
- **B6. Shell-only repos without Bats get zero requirements**
  (`requirements/detectors/scripting/shellBats_detector.py:35`): ShellCheck gated on Bats.
  Returns `[]` → `completed_unverified` when a safe lint existed. Fix: emit shellcheck
  independently.
- **B7. Unbounded task-scoped list reads**: `list_tool_calls` (`agentPrompt_agent.py:119-127`),
  `list_change_journal` (`executors/fileChange_executor.py:153-157`), `list_checkpoints`
  (`taskCheckpoint_state.py:60-73`), `list_verification_runs`
  (`verificationReport_verification.py:36-47`) — no `LIMIT`/pagination. Fix: paginate.
- **B8. Shared-provider usage slot races across tasks**
  (`llms/providers/baseProvider_provider.py:8,22-24`): `remember_usage`/`pop_usage` on a
  shared instance misattributes token counts when two tasks overlap. Billing/reporting
  wrong (not output). Fix: return usage with the call result instead of a shared slot.
- **B9. `pause_task` emits `task.paused` when it changed nothing**
  (`tasks/states/taskLifecycle_state.py:86-94`), and there is no legal path to pause an
  `awaiting_approval` task — can't pause a task stuck at the approval gate
  (`tasks/actions/toolApproval_action.py:31-35`). Fix: publish only on row change; allow
  `awaiting_approval→paused`.

### Low

- **B10 REVERTED (by design).** Stale-failure rounds spend `verification_attempts` with no
  `verification_runs` row (`tasks/verifications/verificationRound_verification.py:47-58`) —
  initially "fixed" to not burn budget, but `verificationOutcome_test.py` /
  `verificationTaint_test.py` pin budget-counts-rounds semantics (a no-fix-done loop must
  still reach FAILED), so the increment was restored. The `attempts`-vs-run-rows gap is
  cosmetic and fail-closed; left as is.
- **B11.** Requirement-ID hash ignores `required`/`timeout`
  (`requirements/verificationRequirement_requirement.py:46-51`) — duplicate argv shares an ID.
- **B12.** `requirements.txt` not scanned for pytest (`pythonProject_detector.py:41-45` covers
  `pyproject.toml` + `requirements-dev.txt` only); nested project roots never detected.
- **B13.** `wait_while_paused` is dead code with an infinite-wait bug
  (`tasks/agents/agentPrompt_agent.py:17-26`).
- **B14.** Unparseable model output burns `iterations` before validation
  (`tasks/agents/agentStep_agent.py:34-36`); `step_index` effectively dead.
- **B15.** `update_task_fields` interpolates column names (`taskRecord_state.py:35-39`) —
  literals today, add an allowlist.
- **B16.** Stale model-list cache can deprecate live models
  (`providerSwitch_llm.py:205-210` + `modelRegistry_llm.py:70-100`) — no auto-refresh.
- **B17.** Anthropic floor `max(provider_timeout, 600.0)` ignores deliberately small timeouts
  (`providerSwitch_llm.py:110`).
- **B18.** Anthropic non-`APIStatusError` errors collapse to blocking `ProviderResponseError`
  (`adapters/anthropicRequest_adapter.py:121-125`) instead of retrying like the OpenAI side.
- **B19.** `memories` table unbounded (retention caps only `memory_history`;
  `sqliteMemoryStore_memory.py:21-24`); unconfirmed `task-suggestion:*` leaks into
  `search_memories` though excluded from prompts.
- **B20.** Unbounded SSE queue per consumer (`events/eventBus_event.py:36-40`) — correct
  disconnect handling, but a slow consumer accumulates.
- **B21.** Bare `except Exception` with silent/pass in `browserSideEffect_executor.py:36`,
  `browserSessionPool_executor.py:99`, `stackAdvisor_route.py:31`.
- **B22.** Orphan-process reaper cmdline comparison can miss interpreter-wrapped forms
  (`taskCheckpoint_state.py:11-24`).
- **B23.** Go lint has no `influences`; Rust influences omit `Cargo.lock` (Swift includes
  `Package.resolved`) — taint inconsistency, informational only.
- **B24.** Pre-migration backup failure only warns and proceeds
  (`storageBootstrap_storage.py:92-99`) — "backup-first" is best-effort.

### Verified OK (correctness)

Cancelled terminality; `FAILED→RUNNING` invalidates passes via `reverify_after`;
`verified_at` only on `VERIFIED_COMPLETED`; model-suggested commands never execute
(server-built argv, `run_single_requirement` asserts argv/cwd); pass requires status +
exit 0 + matching command/cwd + `started_at > since`; `MUTATING_TOOLS` includes `git_push`;
rejection re-asks (no deadlock); expiry never consumed; base-URL re-validated every
request; env-key precedence + 409-on-edit; Anthropic `max_retries=0`; no Mock leak;
migration per-step atomicity; WAL/`foreign_keys`/`busy_timeout`; integrity-check +
restore-newest-good; Pydantic bounds + 422 handler.

---

## 3. Gaps vs plans

- **Missing: project-scan memories.** `providers.plan.md` Part C wants auto-built project
  profiles stored as `project-scan:<project>` memories, refreshed on manifest change. No
  `project-scan` source exists in `app/`. Everything else in Part C is implemented
  (`GET/PUT /profile`, single-row table, memory-into-prompts block as its own
  context-budget category, per-task used-memories, post-task suggestions, no secrets).
- **Partial: key-route response shape.** Part A says key PUT/DELETE responses expose only
  `{has_key, key_hint, key_source}`; code returns the full provider card
  (`llms/providerSetup_llm.py:118,131`). No key material leaks — spec-strictness only.
- **Implemented:** A (key CRUD, keyring/file, discovery, URL rules + request-time recheck);
  B (platformdirs, override, legacy migration, 0700/0600, migrations table, 7+4 backups,
  all five `/data` routes, scrubbed rotating logs — nit: constant reads "4", effectively
  5 files); D (full catalog, recommend + deterministic fallback, all 15 detector groups
  incl. Hardhat and Kotlin added 2026-10-13); E (all presets at exact plan URLs, live
  `/models`, full Anthropic spec); F-backend (`none` default, connect-first 409s,
  projects/files/git/commands); security-plan D (workflow, scanner configs, Schemathesis +
  Hypothesis fuzz, lab).
- **Code health:** zero files >350 lines (max `userCommand_project.py:316`); zero
  TODO/FIXME; `NotImplementedError` only in genuine interfaces. Eight `app/*` folders hold
  6 files vs the 5-file rule (`databases`, `guards`, `llms`, `memories`, `projects`,
  `routes`, `schemas`, `stacks`, plus `llms/connections`, `llms/providers`) — either
  `structureRule_check.py` exceptions or violations; the check reports 0 findings.
  Tests mirror gaps: no `tests/*` for `databases` (covered under `tests/storages`),
  `events`, `schemas`, `servers`, `settings`, `tools`; no `tests/profiles` (covered via
  `tests/memories/userProfile_test.py`).
- **Doc nits:** README "Requires Python 3.11+" vs `codebase.plan.md` mandating 3.14
  (runtime is 3.14 per `cpython-314` artifacts).

---

## 4. Fix priority

1. S3/B1 approval-consume + resume locks (correctness + security, same area).
2. S1 sandbox limits fail-closed; S2 git hooks lockdown.
3. B2 elapsed persistence; B9 pause semantics; B7 pagination; B8 usage attribution.
4. S4 scrubber widening; S5 migration ownership check; B4 taint nested paths.
5. B5 kotlinc requirement; B6 shellcheck independence; B12 `requirements.txt`.
6. S9/S15/S11/S12 log/permission hygiene; B16 model-list refresh; B13/B14/B15 cleanups.
7. Part C project-scan memories; Part A response-shape strictness; folder-count exceptions
   documented; README Python floor.
