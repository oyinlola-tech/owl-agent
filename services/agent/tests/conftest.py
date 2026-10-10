import json as jsonlib
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

AGENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIVE_PORT = 8123


@pytest.fixture()
def db_file(tmp_path):
    return str(tmp_path / "test.db")


@pytest.fixture()
def fast_settings(db_file) -> Settings:
    return Settings(step_delay=0.01, db_path=db_file)


@pytest.fixture()
def client(fast_settings: Settings):
    with TestClient(create_app(fast_settings)) as c:
        yield c


@pytest.fixture()
def slow_settings(db_file) -> Settings:
    return Settings(step_delay=5.0, db_path=db_file)


@pytest.fixture()
def slow_client(slow_settings: Settings):
    with TestClient(create_app(slow_settings)) as c:
        yield c


def wait_for(client, task_id, statuses, timeout=5.0):
    import time

    end = time.time() + timeout
    while time.time() < end:
        res = client.get(f"/tasks/{task_id}")
        assert res.status_code == 200
        if res.json()["status"] in statuses:
            return res.json()
        time.sleep(0.05)
    raise AssertionError(f"task {task_id} never reached {statuses}")


class ScriptedMock:
    """Deterministic provider: fixed plan, then a scripted action queue."""

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


def make_client(tmp_path, provider=None, workspace=None, **overrides):
    ws = workspace or str(tmp_path / "ws")
    os.makedirs(ws, exist_ok=True)
    params = {
        "step_delay": 0.01,
        "db_path": str(tmp_path / "t.db"),
        "workspaces": ws,
    }
    params.update(overrides)
    app = create_app(Settings(**params))
    if provider is not None:
        app.state.provider = provider
        app.state.manager.provider = provider
    return TestClient(app)


@pytest.fixture(scope="module")
def live_server(tmp_path_factory):
    """Real uvicorn process: the only way to test true SSE streaming."""
    import socket

    db = str(tmp_path_factory.mktemp("live") / "live.db")
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    env = dict(os.environ, OWL_STEP_DELAY="0.05", OWL_DB_PATH=db)
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(port)],
        cwd=AGENT_DIR,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    base = f"http://127.0.0.1:{port}"
    try:
        for _ in range(100):
            try:
                if httpx.get(f"{base}/health", timeout=1.0).status_code == 200:
                    break
            except httpx.ConnectError:
                time.sleep(0.1)
        else:
            raise AssertionError("live server never came up")
        yield base
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=10)
