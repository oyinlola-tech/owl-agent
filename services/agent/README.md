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
- `OWL_DB_PATH` — SQLite file (default `~/.local/share/owl-agent/owl.db`)
- `OWL_TRUSTED_ORIGINS` — extra CORS origins, comma-separated
- `OWL_MAX_BODY_BYTES`, `OWL_STEP_DELAY`
- `OWL_WORKSPACES` — comma-separated authorized project roots (required
  before filesystem tools, terminal, or git can touch anything)
- `OWL_EXEC_TIMEOUT`, `OWL_EXEC_OUTPUT_LIMIT`, `OWL_APPROVAL_TTL`
- `OWL_MAX_ITERATIONS`, `OWL_MAX_MODEL_CALLS`, `OWL_MAX_ELAPSED` — loop budgets
- `OWL_ROUTER_DEFAULT_MODEL`, `OWL_ROUTER_FALLBACK_MODEL`,
  `OWL_ROUTER_ALLOW_FALLBACK` — routing policy
- `OWL_CONTEXT_BUDGET`, `OWL_CONTEXT_RESERVE`, `OWL_MAX_RETRIES`
- `OWL_MEMORY_RETENTION` — memory history cap
- `NVIDIA_API_KEY` — enables the real adapter; without it the deterministic
  mock answers. The key is never logged or returned.

## Start

```bash
cd services/agent
.venv/bin/python -m uvicorn app.main:app --port 8000
```

Health: `curl localhost:8000/health`

## Test and lint

```bash
cd services/agent
.venv/bin/python -m pytest tests -q
.venv/bin/ruff check app tests
.venv/bin/ruff format --check app tests
```

## API sketch

- `GET /health`, `GET /provider` (name plus configured flag, never the key)
- `POST /provider/verify`, `GET /provider/models`
- `POST /chat`, `POST /chat/stream` (SSE `chat.delta` / `chat.done` / `chat.error`)
- `POST /tasks` (`prompt`, `project`, `workspace`, `model`),
  `GET /tasks`, `GET /tasks/{id}`, `GET /tasks/{id}/detail`
- `POST /tasks/{id}/messages`, `/pause`, `/resume`, `/cancel`
- `GET /tasks/{id}/approvals`, `POST .../approvals`,
  `POST .../approvals/{aid}/decision`
- `GET /tasks/{id}/events` (snapshot, progress, steps, tool calls and
  results, approvals, checkpoints, terminal states)
- `GET /tasks/{id}/tool-calls`, `GET /tasks/{id}/journal`,
  `POST /tasks/{id}/revert`, `POST /tasks/{id}/checkpoints`
- `GET /models`, `POST /models/refresh`, `POST /models/{id}/validate`,
  `POST /route` (explainable auto routing)
- `POST /context/budget`, `GET /context/compressions`
- `/memory` CRUD, `/memory/search`, `/memory/maintain`,
  `/memory/clear-project`, `/memory/history`, enable/disable
- `GET /usage` (actual provider tokens kept apart from estimates)
- `GET /workspaces`, `GET /tools`, `POST /browser/capture`, `GET /shots/{name}`

## Real coding loop (Phase 5)

Plan, act (validated JSON tool calls only), approve, execute, verify.
Gated tools need a backend approval bound to the exact action hash:
single-use by default, expiring, non-replayable. File edits go through
propose, diff, and apply with a journal, conflict detection, and revert.
Commands run argv-only (no shell) with a scrubbed environment, timeouts,
output caps, and process-group kill on cancel. `sudo` is refused;
destructive patterns need High-risk approval. Workspaces restrict every
path (traversal and symlink escapes rejected; sensitive files need an
explicit opt-in). The browser runs isolated Chromium with SSRF guards and
redacted snapshots. Iteration, model-call, and elapsed budgets pause
runaway tasks; recovery never repeats side effects.

## Security model

- Approvals are enforced server-side. Frontend widgets cannot advance a
  gated task; only a recorded `decision` unblocks it, and only for the exact
  approved action while fresh and unconsumed.
- Payloads are validated by Pydantic with length caps; oversized bodies get
  HTTP 413.
- CORS is restricted to the desktop dev origin plus `OWL_TRUSTED_ORIGINS`.
- Model output, browser content, files, and memories are untrusted data and
  never override policy. Everything fails closed.

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
