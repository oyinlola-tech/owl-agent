# Codebase rules (refactor spec)

Repo: /home/oyinlola/Desktop/owl-agent
- Backend (Python 3.14, FastAPI, SQLite): services/agent (venv: services/agent/.venv)
- Frontend (React 19 + TS + Vite 8, Tauri 2 shell): apps/desktop

Behaviour, HTTP API paths/payloads, DB schema, SSE event names, env vars, localStorage keys and
every security check stay stable unless a plan explicitly changes them. Never commit.

## Rules (mandatory)

1. File size: no source file over 350 lines unless a single cohesive unit would be worse split.
   List every exception with the reason. Target 120–300 lines.
2. Folder size: at most 5 files per folder. `__init__.py` doesn't count. Subfolders don't count.
3. File naming: `<whatItIs>` in camelCase plus the folder's role, singular.
   - Frontend: `walletMemory.tool.tsx`, `taskList.screen.tsx`, `sidebar.style.css`,
     `agentApi.service.ts`. Tests: `statusTag.test.tsx`.
   - Backend (Python can't import dotted names): `walletMemory_tool.py`. Tests:
     `taskVerification_test.py`.
   - Folder names: short, lower-case, plural nouns (`tools`, `routes`, `screens`).
4. Names say plainly what the code does, even if long (`run_task_from_plan_to_finish`,
   `execute_tool_with_approval_check`). Keep language conventions. Never rename anything that
   crosses a boundary (routes, JSON fields, DB tables/columns, event names, env vars, storage
   keys).
5. No comments or docstrings, except security notes starting with `Security:` that explain why
   a security check exists. Keep functional pragmas (`# noqa`, `# type: ignore`, `// @ts-…`).

## Entry point contract

- `from app import create_app`; run with `uvicorn --factory app:create_app --port 8000`.

## Checks that must stay green

- Backend: `cd services/agent && .venv/bin/python -m pytest tests -q -p no:cacheprovider
  -p no:logging`, `.venv/bin/ruff check app tests scripts`, `.venv/bin/ruff format --check app
  tests scripts`, `.venv/bin/python scripts/e2e/verifyEndToEnd_e2e.py` (6/6),
  `.venv/bin/python scripts/checks/structureRule_check.py app tests scripts` (0 findings).
- Frontend: `cd apps/desktop && npm run typecheck && npm test && npm run build && npm run qa`.

## QA automation

Playwright suite in `apps/desktop/qa/` selects by role/label/text only (never CSS classes).
It covers the website, every app screen, palette, shortcuts, theme, inbox, tasks, verification
states, workspace flow, settings, mobile width, and a service-online smoke test.
