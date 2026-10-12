import json as jsonlib
import os
import time

from app import create_app
from app.settings.serviceSettings_setting import Settings
from supports.authorizedClient_support import open_authorized_client


def wait_for_task_status(client, task_id, statuses, timeout=5.0):
    end = time.time() + timeout
    while time.time() < end:
        res = client.get(f"/tasks/{task_id}")
        assert res.status_code == 200
        if res.json()["status"] in statuses:
            return res.json()
        time.sleep(0.05)
    raise AssertionError(f"task {task_id} never reached {statuses}")


class ScriptedMockProvider:
    name = "mock"

    def __init__(self, plan, actions):
        self._plan = plan
        self._actions = list(actions)

    async def complete(self, messages, model=None):
        last = messages[-1]["content"] if messages else ""
        if "RETURN-JSON-PLAN" in last:
            return jsonlib.dumps(
                {"plan": [{"title": t} for t in self._plan], "summary": "scripted"}
            )
        if self._actions:
            return jsonlib.dumps(self._actions.pop(0))
        return jsonlib.dumps({"done": True, "summary": "scripted done"})

    async def complete_stream(self, messages, model=None):
        yield await self.complete(messages, model)

    async def list_models(self):
        return ["mock-1"]

    def describe(self):
        return {"name": "mock", "configured": True, "model": "mock-1"}

    def pop_usage(self):
        return None


def make_test_client(tmp_path, provider=None, workspace=None, **overrides):
    ws = workspace or str(tmp_path / "ws")
    os.makedirs(ws, exist_ok=True)
    params = {
        "step_delay": 0.01,
        "db_path": str(tmp_path / "t.db"),
        "workspaces": ws,
        "_env_file": None,
        "nvidia_api_key": "",
        "provider": "mock",
    }
    params.update(overrides)
    app = create_app(Settings(**params))
    if provider is not None:
        app.state.provider = provider
        app.state.manager.provider = provider
    return open_authorized_client(app)
