import asyncio
import time

import pytest
from supports.browser.browserLocalSite_support import serve_local_site
from supports.taskClient_support import ScriptedMockProvider, make_test_client, wait_for_task_status

from app.guards.workspaceAccess_guard import WorkspaceAccessGuard, WorkspaceError
from app.tools.handlers.browser.browserSideEffect_handler import upload_browser_file
from app.tools.toolArgument_tool import BrowserUploadArguments

SETTLED = ("completed_unverified", "verified_completed", "failed", "paused")


def pending(client, task_id):
    rows = [a for a in client.get(f"/tasks/{task_id}/approvals").json() if a["status"] == "pending"]
    assert rows, "expected a pending approval"
    return rows[-1]


def test_browser_submit_is_gated_by_approval_then_runs(tmp_path):
    with serve_local_site() as base:
        script = [
            {"tool": "browser_session_open", "args": {"url": base + "/"}, "why": "open"},
            {"tool": "browser_submit", "args": {"target": "form"}, "why": "submit the form"},
            {"done": True, "summary": "submitted"},
        ]
        with make_test_client(
            tmp_path,
            provider=ScriptedMockProvider(["Open", "Submit"], script),
            browser_allow_loopback=True,
        ) as client:
            task_id = client.post("/tasks", json={"prompt": "submit a form"}).json()["id"]
            wait_for_task_status(client, task_id, ("awaiting_approval",), timeout=25.0)
            approval = pending(client, task_id)
            assert approval["action"] == "browser_submit"
            assert approval["risk"] == "High"
            assert approval["network"] is True
            assert "with network access" in approval["title"]
            # Security: before approval the submit has not run.
            calls = client.get(f"/tasks/{task_id}/tool-calls").json()
            assert not any(c["tool"] == "browser_submit" for c in calls)
            client.post(
                f"/tasks/{task_id}/approvals/{approval['id']}/decision", json={"approved": True}
            )
            wait_for_task_status(client, task_id, SETTLED, timeout=25.0)
            end = time.time() + 10
            submit_call = None
            while time.time() < end:
                for c in client.get(f"/tasks/{task_id}/tool-calls").json():
                    if c["tool"] == "browser_submit":
                        submit_call = c
                if submit_call:
                    break
                time.sleep(0.1)
            assert submit_call is not None and submit_call["status"] == "ok"
            assert "/submit" in submit_call["output_excerpt"]


def test_browser_upload_rejects_path_outside_workspace(tmp_path):
    workspace = tmp_path / "ws"
    workspace.mkdir()
    guard = WorkspaceAccessGuard([str(workspace)])
    ctx = {"auth": guard, "task_id": "t", "browser_sessions": None}
    args = BrowserUploadArguments(target="input[type=file]", path="/etc/passwd")

    # Security: uploads may only read files inside the authorized workspace, so a host path
    # is rejected before any browser action runs.
    with pytest.raises(WorkspaceError):
        asyncio.run(upload_browser_file(ctx, args))
