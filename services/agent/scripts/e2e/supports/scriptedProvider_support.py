from __future__ import annotations

import json
import os
import re
import sys
from collections.abc import Callable

AGENT_DIR = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)
sys.path.insert(0, AGENT_DIR)

from app import create_app  # noqa: E402
from app.settings.serviceSettings_setting import Settings  # noqa: E402

Act = Callable[[str, dict], dict]
E2E_SERVICE_TOKEN = "owl-e2e-service-token-0123456789"
E2E_HEADERS = {
    "Authorization": f"Bearer {E2E_SERVICE_TOKEN}",
    "Content-Type": "application/json",
}


class ScriptedProvider:
    name = "mock"

    def __init__(self, plan: list[str], act: Act, claim: str = "Done. All tests pass.") -> None:
        self.plan = plan
        self.act = act
        self.claim = claim
        self.prompts: list[str] = []
        self.state: dict = {}

    async def complete(self, messages, model=None):
        last = messages[-1]["content"] if messages else ""
        self.prompts.append(last)
        if "RETURN-JSON-PLAN" in last:
            return json.dumps({"plan": [{"title": t} for t in self.plan], "summary": "plan"})
        if last.startswith("VERIFY."):
            return json.dumps({"done": True, "summary": self.claim})
        return json.dumps(self.act(last, self.state))

    async def complete_stream(self, messages, model=None):
        yield await self.complete(messages, model)

    async def list_models(self):
        return ["mock-1"]

    def describe(self):
        return {"name": "mock", "configured": True, "model": "mock-1"}

    def pop_usage(self):
        return None


def find_latest_proposal_id(prompt: str) -> str | None:
    found = re.findall(r"proposal_id\\*': \\*'(prop-[0-9a-f]+)", prompt)
    return found[-1] if found else None


def build_e2e_settings(db: str, workspace: str, **extra) -> Settings:
    params = dict(
        step_delay=0.01,
        db_path=db,
        workspaces=workspace,
        _env_file=None,
        nvidia_api_key="",
        provider="mock",
        verify_timeout=120.0,
        service_token=E2E_SERVICE_TOKEN,
    )
    params.update(extra)
    return Settings(**params)


def open_e2e_client(app):
    from fastapi.testclient import TestClient

    return TestClient(app, base_url="http://127.0.0.1:8000", headers=E2E_HEADERS)


def build_e2e_app(db: str, workspace: str, provider: ScriptedProvider, **extra):
    app = create_app(build_e2e_settings(db, workspace, **extra))
    app.state.provider = provider
    app.state.manager.provider = provider
    return app


CALC_OK = "def add(a, b):\n    return a + b\n"


def create_calc_then_finish(prompt: str, state: dict) -> dict:
    if not state.get("created"):
        state["created"] = True
        return {"tool": "fs_create", "args": {"path": "calc.py", "content": CALC_OK}, "why": "impl"}
    return {"done": True, "summary": "implemented"}
