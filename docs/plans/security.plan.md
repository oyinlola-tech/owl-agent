# Phase 5.3 plan: security hardening, sandbox, security testing

Rules in `docs/plans/codebase.plan.md` apply. Machine: Kali Linux, bubblewrap 0.12
(/usr/bin/bwrap) with working user namespaces, docker, gitleaks.

## A. Sandboxed command execution (backend)

Every command OWL runs (agent `exec_run`, verification requirements, git tools) goes through
one sandbox layer in front of CommandExecutor.
- Backends: Linux bubblewrap; macOS `sandbox-exec` profile; optional Docker/Podman
  (`OWL_SANDBOX=docker`). Windows has no OS sandbox: fall back as below and say so.
- bwrap policy: new user/pid/ipc/uts namespaces, `--die-with-parent`, `--new-session`,
  read-only system dirs, read-write ONLY the task workspace, private /tmp, read-only allowed
  toolchain caches (~/.cargo/registry, ~/.npm, ~/.cache/pip, ~/.m2, ~/.gradle; configurable).
  Never bind ~/.ssh, ~/.gnupg, ~/.aws, browser profiles, keyrings, the OWL data dir, or the
  docker socket. A virtualenv outside the workspace is bound read-only.
- Network off by default (`--unshare-net`). Only commands the risk assessor marks as needing
  network AND approved "with network access" get it. Verification never gets network unless
  `OWL_VERIFY_NETWORK=1`.
- Resource limits: timeout plus rlimits for CPU, memory, open files, processes.
- `OWL_SANDBOX=required|preferred|off` (default preferred). required: refuse without a backend.
  preferred: run unsandboxed only if no backend works, record `sandboxed=false`, say so in the
  approval text, emit an event. off: env var only, never from the UI.
- Startup self-test (read outside workspace and open a socket must both fail), exposed at
  `GET /security/status`. Persist `sandboxed` + `sandbox_backend` on tool_calls and
  verification_runs.
- Tests (skip cleanly without bwrap): outside writes fail, fake ~/.ssh unreadable, network
  blocked by default and allowed only with the approved flag, workspace writes work, a real
  pytest project verifies inside the sandbox, required mode refuses without a backend,
  preferred mode records sandboxed=false, a fork bomb is contained.

## B. Close the known holes (backend)

1. Local service token: `OWL_SERVICE_TOKEN` (Tauri passes a random 32-byte token), else
   generated and written to `<data_dir>/service.token` (0600). All requests except
   `GET /health` need `Authorization: Bearer <token>` (constant-time compare) → 401. Mutating
   routes need `Content-Type: application/json` → 415. Host must be 127.0.0.1/localhost with
   the bound port → reject otherwise (DNS rebinding). SSE events route accepts `?token=`.
   `OWL_DEV_TOKEN` is accepted for dev and QA.
2. `fs_search`: resolve each file through the workspace guard, skip symlinks leaving the
   workspace and sensitive files (.env*, keys, credentials).
3. Browser URL check: resolve DNS and re-check every IP; block loopback, private, link-local,
   cloud metadata, multicast, unspecified; http/https only; fix the error message; re-check
   redirects.
4. Git tools use the scrubbed environment and the sandbox.
5. Data dir 0700, db/token files 0600 on POSIX.
6. Pin backend dependencies; frontend uses the lockfile.

## C. Desktop side of the token

- src-tauri: CSPRNG token at launch → sidecar env; webview gets it only via a Tauri command
  `get_service_token` (main window capability). Reused existing service → read
  `<data_dir>/service.token`.
- Frontend client: `Authorization: Bearer` on every request, `?token=` for EventSource. Browser
  dev uses `VITE_OWL_DEV_TOKEN`. On 401 show "Can't authenticate with the local OWL service"
  instead of silently falling back to sample data.
- Settings → Security shows `/security/status` in plain language. QA passes the token.

## D. Security testing tooling

- `.github/workflows/security-scans.yml` (pinned SHAs; push/PR + weekly; fail on high):
  Bandit, Semgrep (p/python, p/typescript, p/react, p/secrets + custom OWL rules: no
  shell=True, create_subprocess_shell, os.system, eval/exec, pickle loads, unsafe yaml.load,
  dangerouslySetInnerHTML), pip-audit, npm audit (high), cargo-audit, gitleaks, Trivy fs.
- Configs under `security/scanners/`; accepted findings in `security/accepted-findings.md`.
- Fuzzing in `services/agent/tests/fuzzing/`: Schemathesis over the OpenAPI spec (no 500s,
  no unauthenticated success), Hypothesis property tests for the path guard and risk assessor.

## E. Lab and docs

- `security/lab/`: Docker Compose lab (non-root, read-only rootfs, no-new-privileges, cap_drop
  ALL, resource limits), internal-only network, disposable workspace, attacker container,
  nothing published beyond 127.0.0.1. Scripts `startLab.lab.sh` / `stopLab.lab.sh`.
- `SECURITY.md`: supported versions, private reporting via GitHub, scope, safe harbour;
  maintainer Oluwayemi Oyinlola (https://portfolio.oyinlola.site/), no invented email.
- `docs/security/threatModel.doc.md` (assets, trust boundaries, attackers, STRIDE with code
  locations, residual risks) and `docs/security/testingGuide.doc.md`.
