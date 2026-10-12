# Contributing to OWL

Thanks for helping. OWL is licensed under the [GNU GPL v3.0](LICENSE). By opening a pull
request you agree that your contribution is released under the same license.

Security issues: do not open a public issue. Follow [SECURITY.md](SECURITY.md).

## Set up

```bash
# Backend: Python 3.11+
cd services/agent
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
OWL_DEV_TOKEN=local-dev-token-change-me .venv/bin/python -m uvicorn --factory app:create_app --port 8000

# Frontend: Node 22.12+ (the test runner needs it)
cd apps/desktop
npm install
VITE_OWL_DEV_TOKEN=local-dev-token-change-me npm run dev
```

The local service accepts requests only with its token. In the desktop app the token is
generated for you; in a browser dev session both commands above must use the same value
(16 characters or more).

Building the desktop app also needs Rust and, on Linux, the WebKitGTK development packages.
See [docs/INSTALL.md](docs/INSTALL.md).

## Code rules

These rules are enforced in review and by the structure checker, so please follow them:

- A file stays at 350 lines or fewer, unless splitting it would make it harder to follow.
- A folder holds at most 5 files (`__init__.py` doesn't count). Use subfolders by
  responsibility.
- File names are `whatItIs` in camelCase plus the folder's role:
  - Frontend: `taskList.screen.tsx`, `sidebar.style.css`, `agentApi.service.ts`
  - Backend (Python can't import dotted names): `fileRead_tool.py`, `taskApproval_route.py`
  - Tests: `statusTag.test.tsx`, `taskVerification_test.py`
- Names say what the code does, even when long: `run_task_from_plan_to_finish`,
  `execute_tool_with_approval_check`.
- No comments, except `Security:` notes that explain why a security check exists.
- HTTP routes, JSON fields, database columns, event names and environment variables are part
  of the contract between the app and the service. Don't rename them in passing.

## Before you open a pull request

Run everything your change touches:

```bash
# Backend
cd services/agent
.venv/bin/python -m pytest tests -q
.venv/bin/ruff check app tests scripts
.venv/bin/ruff format --check app tests scripts
.venv/bin/python scripts/checks/structureRule_check.py app tests scripts
.venv/bin/python scripts/e2e/verifyEndToEnd_e2e.py

# Frontend
cd apps/desktop
npm run typecheck
npm test
npm run build
npm run qa
```

CI runs the same checks on every pull request, plus the security scans.

## Pull requests

- Keep one change per pull request, with a short description of what changed and why.
- New behaviour comes with tests. Bug fixes come with a test that fails before the fix.
- Anything that changes how OWL runs commands, handles approvals, verifies work, or stores
  keys needs a note on its security impact.
