# Accepted scanner findings

Findings the scanners report that we reviewed and accepted, with the reason. Anything not
listed here is either fixed or tracked as an open issue. Re-review this file when the code
at a listed location changes. Locations were checked on 2026-10-12.

CI fails only on high severity, so the entries below don't break the build. They're listed so
nobody has to triage them again.

## Bandit (services/agent/app)

| Rule | Location | Severity | Why it's accepted |
| --- | --- | --- | --- |
| B608 SQL built from strings | `app/memories/sqliteMemoryStore_memory.py` (`log_memory_history`) | Medium | The only interpolated value is `int(self.retention_history)`, a setting cast to `int`. User text always goes through `?` parameters. |
| B608 SQL built from strings | `app/tasks/states/taskRecord_state.py` (`update_task_fields`) | Medium | Column names come from keyword arguments in our own call sites, never from request data. Values go through `?` parameters. Recheck this if a route ever passes a request dict through as `**fields`. |
| B608 SQL built from strings | `app/tasks/verifications/verificationEvidence_verification.py` (mutating-tool query) | Medium | Builds a `?,?,?` placeholder list from the constant `MUTATING_TOOLS` set. Every value is still bound as a parameter. |
| B108 hard-coded /tmp | `app/sandboxes/backends/bubblewrapBackend_sandbox.py` (`--tmpfs /tmp`, `/var/tmp`) | Medium | These are mount points inside the sandbox, not host temp files. bwrap mounts a fresh private tmpfs on them. |
| B108 hard-coded /tmp | `app/sandboxes/backends/containerBackend_sandbox.py` (`--tmpfs /tmp`) | Medium | Same as above for the Docker/Podman backend: a private tmpfs inside the container. |
| B105 hard-coded password | `app/settings/serviceToken_setting.py` (`TOKEN_FILE_NAME = "service.token"` and `""` comparisons) | Low | A file name and empty-string checks. No secret is involved. |
| B105 hard-coded password | `app/sandboxes/sandboxSelfTest_sandbox.py` (`owl-sandbox-probe-secret`) | Low | A canary value the self-test plants outside the workspace to prove the sandbox can't read it. It protects nothing. |
| B404 / B603 subprocess | `app/sandboxes/sandboxSelfTest_sandbox.py` | Low | Fixed argv list, no shell, and the input is built by the self-test itself. |
| B101 assert | `app/tasks/states/taskApproval_state.py`, `taskCheckpoint_state.py`, `taskLifecycle_state.py` | Low | Asserts narrow `Optional` types after a database read of a row that was just written. They aren't access checks, so `python -O` stripping them can't bypass security. |
| B110 / B112 try-except-pass/continue | `app/tasks/agents/agentRun_agent.py`, `verificationOutcome_verification.py`, `verificationEvidence_verification.py` | Low | Best-effort cleanup and evidence gathering. Failing to collect optional evidence can't lead to a check passing that should fail, because the verification outcome needs positive evidence. |

## Semgrep

No findings from p/python, p/typescript, p/react, p/secrets or `security/scanners/owlRules.scanner.yml`
(270 rules, 0 findings on 2026-10-12).

## Gitleaks

| Finding | Location | Why it's accepted |
| --- | --- | --- |
| generic-api-key | `services/agent/tests/**` (for example `memories/memoryStore_test.py`, `tasks/agents/agentAudit_test.py`), and the pre-refactor `services/agent/tests/test_memory.py` in history | Fake values (`nvapi-abcdef…`, `sk-abcdefgh…`, `nvapi-SECRETXYZ999`) that tests use to prove redaction works. They're allowlisted by path and by value in `security/scanners/gitleaksConfig.scanner.toml`. |
| generic-api-key | `apps/desktop/src-tauri/target/**` (GNOME gschema XML, `libmuda` rmeta) | Third-party build output that's never committed (`src-tauri/.gitignore`). The matches are XML `key name="…"` attributes, not secrets. |
| generic-api-key | `services/agent/.env` (working tree only) | **Not accepted as a false positive.** It's a real provider key on the developer's machine. The file is git-ignored and was never committed (the history scan is clean). It stays flagged on purpose so local scans remind you. Keep it at mode 0600 and rotate it if it was ever shared. |

## Dependency scanners

| Finding | Package | Severity | Why it's accepted |
| --- | --- | --- | --- |
| GHSA-cmwh-pvxp-8882, GHSA-55q2-fjhq-7xh7, CVE-2026-65898 and three low advisories | `dompurify@3.4.8`, pulled in by `monaco-editor@0.56.0` | Moderate | No high advisories, so `npm audit --audit-level=high` passes. OWL doesn't call DOMPurify itself; Monaco uses it for hover markdown. Take the fix when Monaco ships `dompurify>=3.4.16`, or add an `overrides` entry once that's tested. |
| GHSA-wrw7-89jp-8q8g / RUSTSEC-2024-0429 (unsound) | `glib 0.18.5`, via the Tauri/wry GTK stack | Medium (warning) | It's a transitive Linux GUI dependency pinned by Tauri 2's gtk-rs 0.18 line. OWL code doesn't call `VariantStrIter`. Clears when Tauri moves to gtk-rs 0.20+. |
| RUSTSEC-2024-0370 (unmaintained) | `proc-macro-error 1.0.4`, build-time only | Warning | A proc-macro used at compile time by the GTK bindings. It isn't present in the shipped binary. |
| PYSEC-2026-3721 | `pip 26.1.2` in the developer venv | n/a | Packaging tool, not a runtime dependency of the service. CI upgrades pip before auditing. Run `python -m pip install -U pip` locally. |

## Trivy

The lab Dockerfiles have no misconfigurations. The only vulnerabilities are the medium-severity
`dompurify` and `glib` entries above. Nothing is HIGH or CRITICAL.
