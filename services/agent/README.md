# OWL Agent Service

FastAPI service behind the OWL desktop app: a real tool-using coding agent
with server-enforced approvals. No live NVIDIA key has been used here; all
provider tests use mocked HTTP.

## Install

```bash
cd services/agent
python3 -m venv .venv  # or reuse the existing one
.venv/bin/pip install -e ".[dev]"
cp .env.example .env   # placeholders only, never commit real keys
```

Requires Python 3.11+ (developed on 3.14).

## Configure

All settings are environment variables (`OWL_` prefix), see `.env.example`:

- `OWL_HOST` / `OWL_PORT` (default `127.0.0.1:8000`)
- `OWL_DATA_DIR` — data folder (default from `platformdirs`: Linux `$XDG_DATA_HOME/owl`,
  macOS `~/Library/Application Support/OWL`, Windows `%APPDATA%\OWL`). It holds `data/owl.db`,
  `screenshots/`, `backups/`, `logs/`, `exports/` and `service.token`. An old
  `~/.local/share/owl-agent/owl.db` is copied in automatically on first start (old file kept).
- `OWL_DB_PATH` — SQLite file override (tests; the data folder is then its parent)
- `OWL_TRUSTED_ORIGINS` — extra CORS origins, comma-separated
- `OWL_MAX_BODY_BYTES`, `OWL_STEP_DELAY`
- `OWL_WORKSPACES` — comma-separated authorized project roots (required
  before filesystem tools, terminal, or git can touch anything)
- `OWL_EXEC_TIMEOUT`, `OWL_EXEC_OUTPUT_LIMIT`, `OWL_APPROVAL_TTL` (lifetime of
  every agent approval, verification included)
- `OWL_MAX_ITERATIONS`, `OWL_MAX_MODEL_CALLS`, `OWL_MAX_ELAPSED` — loop budgets
- `OWL_ROUTER_DEFAULT_MODEL`, `OWL_ROUTER_FALLBACK_MODEL`,
  `OWL_ROUTER_ALLOW_FALLBACK` — routing policy
- `OWL_CONTEXT_BUDGET`, `OWL_CONTEXT_RESERVE`, `OWL_MAX_RETRIES`
- `OWL_MEMORY_RETENTION` — memory history cap
- `OWL_MAX_VERIFICATION_ATTEMPTS` (default 3) — verify-then-fix rounds before
  a task fails; `OWL_VERIFY_TIMEOUT` (default 600s) — per verification command
- `NVIDIA_API_KEY` — enables the NVIDIA adapter (shown as "from environment",
  read-only). The key is never logged or returned.
- `OWL_PROVIDER` — `mock` selects the deterministic mock model (tests and QA
  only); a preset id (`openai`, `anthropic`, `ollama`, ...) forces that
  provider. With nothing configured the active provider is `none` and chat or
  task creation return 409 `provider_not_configured` ("Connect a model first").
- `OWL_SECRET_STORE` — `auto` (system keychain via `keyring`, service
  `owl-agent`, falling back to a 0600 `provider-keys.json` in the data folder),
  `keyring`, or `file`. `OWL_ANTHROPIC_BASE_URL` overrides the Claude API URL
  for proxies; `OWL_PROVIDER_TIMEOUT`, `OWL_PROVIDER_MAX_TOKENS` tune the
  OpenAI-compatible adapter.

## Start

```bash
cd services/agent
.venv/bin/python -m uvicorn --factory app:create_app --port 8000
```

Health: `curl localhost:8000/health` (the only route that needs no token).
Every other request needs the service token, see "Local service token" below:

```bash
TOKEN=$(cat ~/.local/share/owl/service.token)
curl -H "Authorization: Bearer $TOKEN" localhost:8000/security/status
```

In code, `from app import create_app`.

## Test and lint

```bash
cd services/agent
.venv/bin/python -m pytest tests -q -p no:cacheprovider -p no:logging
.venv/bin/ruff check app tests scripts
.venv/bin/ruff format --check app tests scripts
.venv/bin/python scripts/e2e/verifyEndToEnd_e2e.py   # real end-to-end verification run
.venv/bin/python scripts/checks/structureRule_check.py app tests scripts   # size/naming rules
```

## Layout

Every folder holds at most five files (plus `__init__.py`), each named
`<whatItIs>_<role>.py` where the role is the folder's singular.

| Folder | What lives there |
| --- | --- |
| `app/__init__.py` | exports `create_app` |
| `app/servers/` | `create_app` wiring and router registration |
| `app/routes/` (+ `tasks/`, `providers/`) | HTTP routes, one module per domain |
| `app/middlewares/` | body limit and request id (pure ASGI) |
| `app/settings/` | `Settings` from the environment |
| `app/tasks/` (+ `states/`, `agents/`, `actions/`, `verifications/`) | `TaskManager`, assembled from one mixin per concern |
| `app/requirements/` (+ `detectors/`) | verification requirement model and per-toolchain detection |
| `app/tools/` (+ `handlers/`) | tool registry, argument models, handlers for files, git, terminal, browser |
| `app/executors/` | command execution, git, browser, file change journal |
| `app/guards/` | workspace access, approval binding, command risk, env and secret scrubbing |
| `app/llms/` (+ `providers/`, `adapters/`, `connections/`) | model registry, router, usage, provider switching; OpenAI-compatible and Claude adapters, presets, URL rules, key storage, local discovery |
| `app/contexts/`, `app/memories/`, `app/events/` | context budgets, memory store, SSE event bus |
| `app/databases/`, `app/schemas/` | SQLite schema, numbered migrations, backups; Pydantic shapes by domain |
| `app/storages/` | data-folder bootstrap, integrity/restore, export/import/reset, scrubbed rotating logs |
| `app/projects/` | saved projects (persisted workspace roots), file tree/read/save/search, user commands |

`tests/` mirrors `app/` with `*_test.py` files; shared helpers live in
`tests/supports/`. `scripts/e2e/` holds the end-to-end verification run and
`scripts/checks/` the live provider check and the structure rule checker.

## API sketch

- `GET /health`, `GET /provider` (name plus configured flag, never the key)
- `GET /providers`, `GET /providers/local`, `PUT /providers/active`,
  `PUT|DELETE /providers/{id}/key`, `PUT /providers/{id}/settings`,
  `POST /providers/{id}/test`, `GET /providers/{id}/models`
- `GET|PUT /profile`, `GET|PUT /onboarding`, `GET /tasks/{id}/memories`,
  `GET /memory/suggestions`, `POST /memory/{id}/confirm`
- `POST /provider/verify`, `GET /provider/models`
- `POST /chat`, `POST /chat/stream` (SSE `chat.delta` / `chat.done` / `chat.error`)
- `POST /tasks` (`prompt`, `project`, `workspace`, `model`),
  `GET /tasks`, `GET /tasks/{id}` (includes `verification_note`,
  `verified_at`), `GET /tasks/{id}/detail` (adds `verifications`, every
  recorded run, and `verification`, the summary and detected checks)
- `POST /tasks/{id}/messages`, `/pause`, `/resume`, `/cancel`
- `GET /tasks/{id}/approvals`, `POST .../approvals`,
  `POST .../approvals/{aid}/decision`
- `GET /tasks/{id}/events` (snapshot, progress, steps, tool calls and
  results, approvals, checkpoints, terminal states, and `verification.*`)
- `GET /tasks/{id}/tool-calls`, `GET /tasks/{id}/journal`,
  `POST /tasks/{id}/revert`, `POST /tasks/{id}/checkpoints`
- `GET /models`, `POST /models/refresh`, `POST /models/{id}/validate`,
  `POST /route` (explainable auto routing)
- `POST /context/budget`, `GET /context/compressions`
- `/memory` CRUD, `/memory/search`, `/memory/maintain`,
  `/memory/clear-project`, `/memory/history`, enable/disable
- `GET /usage` (actual provider tokens kept apart from estimates)
- `GET /workspaces`, `GET /tools`, `POST /browser/capture`, `GET /shots/{name}`
- `GET /data/status`, `POST /data/backup`, `GET /data/export`, `POST /data/import`,
  `POST /data/reset` (`{"confirmation": "RESET"}`, backs up first)
- `GET/POST /projects`, `GET/PATCH/DELETE /projects/{id}`, `GET /projects/{id}/tree`,
  `GET/PUT /projects/{id}/file`, `GET /projects/{id}/search`, `GET /projects/{id}/git`,
  `GET/POST /projects/{id}/commands` (POST streams SSE `command.started` /
  `command.output` / `command.completed` / `command.error`)

## Real coding loop (Phase 5)

Plan, act (validated JSON tool calls only), approve, execute, verify.
Gated tools need a backend approval bound to the exact action hash:
single-use by default, expiring, non-replayable. File edits go through
propose, diff, and apply with a journal, conflict detection, and revert.
Commands run argv-only (no shell) with a scrubbed environment (names
containing KEY, TOKEN, SECRET, PASSWORD, CREDENTIAL, AUTH, COOKIE, SESSION,
PRIVATE, or PAT, and values with embedded credentials, are dropped),
timeouts, incrementally capped output, and process-group kill on cancel. `sudo` is refused;
destructive patterns need High-risk approval. Workspaces restrict every
path (traversal and symlink escapes rejected; sensitive files need an
explicit opt-in). The browser runs isolated Chromium with SSRF guards and
redacted snapshots. Iteration, model-call, and elapsed budgets pause
runaway tasks; recovery never repeats side effects.

## Independent verification (Phase 5.1)

A model can claim the work is done; only OWL can prove it is verified. The
model's "done" and "tests pass" are recorded as claims and never change the
outcome. The rule is enforced in `app/tasks/verifications/`, not in prompts.

Two finished states:

- `verified_completed` — OWL itself ran every required check after the last
  change and saw each one exit 0.
- `completed_unverified` — finished, but nothing proved it: no change was
  made, no reliable check was detected, the toolchain isn't installed (for
  example "`go` isn't installed…"), or no workspace was authorized. The
  reason is stored in `verification_note`. (`completed` remains only on
  tasks finished before 5.1.)

**Detection** (`app/requirements/`) reads project files and never executes:

| Toolchain | Checks | Source |
| --- | --- | --- |
| Node | `<pm> run typecheck`, `test`, `build`; `lint` optional | `package.json` scripts; pm from lockfile (pnpm, yarn, bun, else npm) |
| Python | `pytest` (config, conftest, dependency, or test files); `mypy`; `ruff` optional | `pyproject.toml`, `pytest.ini`, `setup.cfg`, `tox.ini`; project `.venv` preferred |
| Go | `go test ./...`; `go vet` optional | `go.mod` |
| Rust | `cargo test` | `Cargo.toml` |
| Make | `make test` (only if nothing else found tests) | `Makefile` |

Each requirement records kind, exact argv, working directory, source
(`project_manifest`, `project_configuration`, `owl_inferred`, …), whether it
is required, a timeout, what it really `runs` (a package script's body), and
the files that `influence` it (manifests, `conftest.py`, the virtualenv).
npm's placeholder test script is ignored. A package script whose body hits
the executor's risk rules (`rm -r`, `curl`, `sudo`, installs) is marked
unsafe and never run. If no check is detected, OWL says so rather than
inventing one. Commands the model suggests are never added.

**Tainted checks.** If the task itself changed a file that decides what a
check does (`package.json` only when its `scripts` changed), the check is
`tainted_by` that file: the approval opens with "Check carefully: this task
changed …" and shows each command as `npm run test  ->  <script body>`. A
tainted check still runs, but only after you approve exactly that.

**Running.** When the model says done, the runtime asks for one approval
(`action: verify_run`) bound to the exact list of commands for that
attempt. It is single-use, expires after `OWL_APPROVAL_TTL`, and is consumed
before anything runs. An expired request pauses the task ("expired before it
was approved"); deciding an expired approval returns 409. Commands then run
in order through the normal `CommandExecutor`: argv only, no shell,
workspace-scoped, scrubbed environment plus `CI=1`, output read
incrementally and capped, secrets scrubbed, and the process group killed on
timeout or cancel (only this task's processes). The first failing required
check stops the round.

**Persistence and freshness.** Every run is a row in `verification_runs`
(command, cwd, status, exit code, stdout, stderr, pid, timings, attempt,
source). Task columns hold the detected plan, attempt count, note,
`verified_at`, and `reverify_after`. A result counts only if it is the same
argv and cwd as the requirement and started after the last thing that could
change the workspace: a journal apply or revert, any successful write,
command, or git tool call, or a resume (you may have edited files by hand).
A test the model ran itself is just a tool call: it never counts.

**Failure.** The real output goes back to the model as an observation
headed `UNTRUSTED TOOL OUTPUT`, and a "Fix failing …" step is added that
stays open until the model says done, so it can read, propose, and apply in
several actions. Then OWL verifies again. If nothing changed since the last
failure, nothing is rerun and the round still counts. After
`OWL_MAX_VERIFICATION_ATTEMPTS` failed rounds the task becomes `failed`;
resuming it resets the budget. Declining the verification approval pauses
the task, unverified.

**Recovery.** At startup, a run still `running` becomes `interrupted` and
never counts. If its process outlived the service, it is killed, but only
when `/proc/<pid>/cmdline` still matches the recorded command (pids get
reused). Checks that already passed and are still fresh are not rerun.

**Events:** `verification.started`, `verification.requirement.started`,
`verification.requirement.completed`, `verification.failed`,
`verification.completed` (with `verified` and `reason`), plus
`task.completed` carrying the same `verified` flag. Checkpoints mark the
same points (`verification-started`, `verification-requirement-*`,
`verification-failed`, `verification-completed`). Verification runs are
local execution and are never recorded as provider tokens.

**Adding a toolchain:** write `detect_<name>_requirements(workspace) ->
list[VerificationRequirement]` in a new `app/requirements/detectors/<name>_detector.py`,
derive commands only from files the project contains, set `influences` to
every file that can change what the check does, mark optional checks
`required=False`, and add it to `LANGUAGE_DETECTORS` in
`app/requirements/requirementDetection_requirement.py`. Add a detection test
in `tests/requirements/`.

## Security model

- Approvals are enforced server-side. Frontend widgets cannot advance a
  gated task; only a recorded `decision` unblocks it, and only for the exact
  approved action while fresh and unconsumed.
- Payloads are validated by Pydantic with length caps; oversized bodies get
  HTTP 413.
- CORS is restricted to the desktop dev origin plus `OWL_TRUSTED_ORIGINS`.
- Model output, browser content, files, and memories are untrusted data and
  never override policy. Everything fails closed.
- The data folder and its subfolders are `0700`; the database, backups, logs and
  `service.token` are `0600`. SQLite runs with WAL, `foreign_keys=ON` and `busy_timeout`; an
  integrity check at start restores the newest good backup if the file is damaged (the damaged
  file is kept). Backups use the SQLite backup API daily and before every migration, import
  and reset (7 daily + 4 weekly kept). Exports never include API keys or the service token.
- `fs_search` resolves every file through the workspace guard: symlinks out of
  the workspace and sensitive files (`.env*`, keys, credentials) are skipped.
- `browser_open` only reaches public http/https hosts. Every DNS answer is
  checked (loopback, private, link-local, cloud metadata, multicast and
  unspecified addresses are blocked), and so is every redirect hop. Set
  `OWL_BROWSER_ALLOW_LOOPBACK=1` to let it open your own local dev server.

### Local service token

Any website open in a browser, and any local process, can reach localhost, so
the service requires a per-install token:

- Token source, in order: `OWL_SERVICE_TOKEN` (the desktop shell passes a
  random 32-byte token at sidecar launch), `OWL_SERVICE_TOKEN_FILE`, else a
  fresh random token generated at startup. The active token is always written
  to `<data dir>/service.token` (mode 0600) so a second app instance can reuse
  a running service.
- Send `Authorization: Bearer <token>` on every request except `GET /health`
  (401 otherwise, constant-time compare).
- `GET /tasks/{id}/events` (SSE) also accepts `?token=<token>` because
  `EventSource` can't set headers. No other route accepts the query form.
- `POST`/`PUT`/`PATCH`/`DELETE` must send `Content-Type: application/json`,
  even with an empty body (415 otherwise).
- The `Host` header must be `127.0.0.1`, `localhost` or `[::1]` with the bound
  port (421 otherwise; blocks DNS rebinding). Extra names: `OWL_ALLOWED_HOSTS`.
- Dev/QA: when no token is configured, `OWL_DEV_TOKEN` (16+ chars) is also
  accepted next to the generated one. `OWL_REQUIRE_TOKEN=1` turns that off.
  For a browser dev session, start the service with
  `OWL_SERVICE_TOKEN=<same value as VITE_OWL_DEV_TOKEN>` or `OWL_DEV_TOKEN=...`.

### Command sandbox

Every command OWL runs (agent `exec_run`, verification runs, and git tools,
which can execute repository hooks) goes through one sandbox layer
(`app/sandboxes`) in front of `CommandExecutor`, with a scrubbed environment.

- Backends, picked automatically: Linux bubblewrap (`bwrap`), macOS
  `sandbox-exec` with a generated profile, or Docker/Podman with
  `OWL_SANDBOX_BACKEND=docker|podman` (image: `OWL_SANDBOX_IMAGE`; the
  command then uses the image's toolchain). Windows has no OS sandbox.
- bubblewrap policy: new user/pid/ipc/uts/cgroup namespaces, no network,
  `--die-with-parent`, `--new-session`; system folders read-only; the task
  workspace is the only writable bind; private `/tmp`; `$HOME` is an empty
  in-memory folder with only toolchain folders and caches bound back
  read-only (`OWL_SANDBOX_CACHE_PATHS`, default
  `~/.cargo/registry,~/.npm,~/.cache/pip,~/.m2,~/.gradle`, plus
  `~/.gitconfig`, rustup/nvm/pyenv/uv toolchains and the Python venv in use).
  `~/.ssh`, `~/.gnupg`, `~/.aws`, browser profiles, keyrings, the OWL data
  folder and the docker socket are never bound and are masked if a bound
  folder contains them. Extra read-only system paths:
  `OWL_SANDBOX_READONLY_PATHS`.
- Network: off by default. A command gets network only when the risk
  assessor says it needs it (installs, curl/wget, git push/fetch, ...) AND its
  approval, created by the server, says "with network access". Verification
  runs never get network unless `OWL_VERIFY_NETWORK=1`.
- Limits (inside the sandbox): `OWL_SANDBOX_MAX_PROCESSES` (256),
  `OWL_SANDBOX_CPU_SECONDS` (900), `OWL_SANDBOX_MEMORY_MB` (16384 address
  space), `OWL_SANDBOX_OPEN_FILES` (4096), plus the existing wall-clock timeout
  and output caps.
- `OWL_SANDBOX=preferred` (default): sandboxed when possible, otherwise the
  command runs unsandboxed, the approval says "runs WITHOUT a sandbox on this
  system", `sandboxed=0` is stored on the tool call / verification run and a
  `security.unsandboxed` event is emitted. `required`: refuse to run without a
  working sandbox (unknown values also mean `required`). `off`: environment
  variable only, never from the UI.
- At startup a self-test runs a probe in the sandbox that tries to read a file
  outside the workspace and connect to a host socket; both must fail and the
  workspace must stay writable, otherwise the backend counts as unavailable.
  The result is at `GET /security/status`.
- Git hooks that call tools installed under `$HOME` (e.g. a pipx tool) need
  that folder added to `OWL_SANDBOX_CACHE_PATHS`, otherwise the hook can't run
  and the commit fails closed.

## NVIDIA Build

Verified against the official docs (`docs.api.nvidia.com`,
`build.nvidia.com`): base URL `https://integrate.api.nvidia.com/v1`,
Bearer key auth, OpenAI-compatible chat completions with SSE streaming,
public model catalog.

```bash
export NVIDIA_API_KEY=...   # or add to .env; never commit it
export NVIDIA_MODEL=nvidia/llama-3.1-nemotron-70b-instruct  # optional
```

Upstream failures map to safe codes: `invalid_credentials` (401),
`quota_exceeded` (402), `model_unavailable` (404), `rate_limited` (429 with
retry hint), `provider_timeout`, `network_error`, `bad_response`.

## Live NVIDIA verification (requires a key; never paste one into chat)

The service never needs the key in files: export it only in the shell that
starts the backend, and no endpoint, log, or event ever returns it.

```bash
export NVIDIA_API_KEY=...          # your key, shell only
export NVIDIA_MODEL=nvidia/llama-3.1-nemotron-70b-instruct  # optional
cd services/agent
.venv/bin/python -m uvicorn --factory app:create_app --port 8000
.venv/bin/python scripts/checks/liveProvider_check.py   # exits 0 only if all steps pass
```

What the script proves, in order: the provider reports configured without
exposing key material; `POST /provider/verify` returns ok against the live
catalog; `POST /chat` returns a real completion that follows conversation
history; `POST /chat/stream` delivers deltas through to `chat.done`.

Then run the live coding task (disposable project, approve each step):

1. `mkdir /tmp/owl-live && cd /tmp/owl-live` with a small failing test.
2. `export OWL_WORKSPACES=/tmp/owl-live` and restart the service.
3. Create the task: `POST /tasks` with `prompt`, `workspace: /tmp/owl-live`.
4. Poll `GET /tasks/{id}`; for each pending approval, inspect it with
   `GET /tasks/{id}/approvals` and decide via the decision endpoint.
5. Confirm: a real plan in `GET /tasks/{id}/detail`, the file change on
   disk, journal entries, `plan-ready` and `final` checkpoints, the test
   command passing for real, completion status, and measured (not
   estimated) tokens in `GET /usage?task_id=...`.
6. Do not mark success unless the files exist and the verification command
   actually passes.

Status: no live-key run has been performed in this environment (no key
configured). The scripted rehearsal in `tests/tasks/agents/codingRehearsal_test.py` exercises
the identical workflow with a deterministic stand-in.

## Live result (2026-10-10, real key, verified run)

`scripts/live_verify.py` (now `scripts/checks/liveProvider_check.py`) exited 0 (7/7): provider reports configured with no
key material exposed, verify ok, history-aware chat reply, usage reported,
and streaming deltas through to `chat.done`. Notes:

- The default `nvidia/llama-3.1-nemotron-70b-instruct` returned 404 for this
  key, so the run used `z-ai/glm-5.3-flash` (confirmed enabled with a
  1-token probe). Auto-routing cannot know per-key enablement; pin the
  model when Auto picks an unavailable one.
- `glm-5.3-flash` emits usage-only SSE chunks (empty `choices`); the parser
  tolerates them (regression test included).
- Live coding task on a disposable project (`test_calc.py` failing,
  `mult.py` missing): the model produced a 3-step plan, listed and read
  files, and requested a bound file-creation approval with a correct
  reason. After one manual approval it wrote a correct `multiply`,
  completed, and left journal, `plan-ready`/`final` checkpoints, and
  measured (not estimated) token usage. Project `pytest` passes for real.
- Diligence gap observed: the model marked its own test step done without
  running the test command. Fixed in Phase 5.1: see "Independent
  verification" above.
