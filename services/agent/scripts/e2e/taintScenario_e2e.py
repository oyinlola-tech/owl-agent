from __future__ import annotations

import shutil

from scenarioHarness_e2e import (
    approve_until_task_settles,
    build_test_client,
    create_disposable_workspace,
    list_verification_runs,
    print_verification_runs,
    register_scenario,
)
from supports.scriptedProvider_support import ScriptedProvider, find_latest_proposal_id

PACKAGE_JSON = '{\n  "name": "f",\n  "scripts": {\n    "test": "node test.js"\n  }\n}\n'
TEST_JS = (
    "const { add } = require('./calc');\n"
    "if (add(2, 3) !== 5) { console.error('add is broken'); process.exit(1); }\n"
)
ALWAYS_PASSING_SCRIPT = 'node -e \\"process.exit(0)\\"'


def rewrite_test_script_action(prompt: str, state: dict) -> dict:
    if not state.get("proposed"):
        state["proposed"] = True
        return {
            "tool": "fs_propose_edit",
            "args": {"path": "package.json", "old": "node test.js", "new": ALWAYS_PASSING_SCRIPT},
            "why": "make tests pass",
        }
    pid = find_latest_proposal_id(prompt)
    if pid and not state.get("applied"):
        state["applied"] = True
        return {"tool": "fs_apply_edit", "args": {"proposal_id": pid}, "why": "apply"}
    return {"done": True, "summary": "tests pass now"}


def run_taint_task(approve: bool) -> tuple[dict, dict, list[dict], str]:
    ws = create_disposable_workspace(
        {
            "package.json": PACKAGE_JSON,
            "test.js": TEST_JS,
            "calc.js": "exports.add = (a, b) => a - b;\n",
        }
    )
    provider = ScriptedProvider(["Propose script change", "Apply it"], rewrite_test_script_action)
    client, _ = build_test_client(ws, provider)
    with client as api:
        tid = api.post("/tasks", json={"prompt": "make the tests pass", "workspace": ws}).json()[
            "id"
        ]
        seen = approve_until_task_settles(api, tid, approve_verify=approve)
        ask = next(
            a for a in api.get(f"/tasks/{tid}/approvals").json() if a["action"] == "verify_run"
        )
        return (
            seen,
            ask,
            list_verification_runs(api, tid),
            api.get(f"/tasks/{tid}").json()["status"],
        )


@register_scenario("F  task rewrites package.json test script -> warning + script body shown")
def verify_taint_warning():
    if not (shutil.which("node") and shutil.which("npm")):
        raise AssertionError("node/npm not installed; taint scenario needs them")
    seen, ask, rows, final = run_taint_task(approve=False)
    print(f"    approval command: {ask['command']!r}")
    print(f"    approval reason:  {ask['reason'][:160]!r}…")
    assert ask["reason"].startswith("Check carefully: this task changed package.json"), ask
    assert "npm run test  ->  node -e" in ask["command"], ask["command"]
    assert final == "paused" and rows == [], (final, rows)
    seen2, ask2, rows2, final2 = run_taint_task(approve=True)
    print_verification_runs(rows2)
    assert rows2 and rows2[-1]["command"] == ["npm", "run", "test"], rows2
    return (
        f"declined -> {final}, 0 runs; approved -> {final2} "
        f"(ran `npm run test`, exit {rows2[-1]['exit_code']})"
    )
