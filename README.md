# OWL Agent

Local-first desktop AI coding agent (Tauri + React frontend, FastAPI service).

## Start both applications

Terminal 1 — backend (http://127.0.0.1:8000):

```bash
cd services/agent
.venv/bin/python -m uvicorn app.main:app --port 8000
```

Terminal 2 — frontend (http://localhost:1420/, app at `/app`):

```bash
cd apps/desktop
npm install
npm run dev
```

The desktop status bar shows `Service online` when the backend answers
`/health`, otherwise the UI keeps running on mock services. Settings → AI
verifies the model provider; the Live model replies switch sends chat
through the backend (mock reply without a key, NVIDIA with one). The chat
toolbar selects Auto or a pinned model (persisted locally); the inspector
Context tab shows the live budget; the Memory rail page browses durable
memory. Tasks lists resumable backend tasks with checkpoints; opening one
shows the plan, live activity, backend approval buttons, tool calls,
checkpoints, and usage. New backend tasks run the real tool loop inside an
authorized `OWL_WORKSPACES` root — every modifying action waits for a
backend approval first.

## Layout

- `apps/desktop/` — React + TypeScript + Vite frontend (`src/app/` holds the
  desktop screens, `src/app/agent/service.ts` is the agent boundary)
- `services/agent/` — Python backend foundation (tasks, approvals, SSE events)

## Checks

```bash
cd apps/desktop && npx tsc --noEmit && npm run build
cd services/agent && .venv/bin/python -m pytest tests -q
cd services/agent && .venv/bin/ruff check app tests
```
