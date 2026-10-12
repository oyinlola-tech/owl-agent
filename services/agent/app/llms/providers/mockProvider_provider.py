from __future__ import annotations

import json
from collections.abc import AsyncIterator

from .baseProvider_provider import ModelProvider


class MockProvider(ModelProvider):
    name = "mock"

    MOCK_PLAN = {
        "plan": [
            {"title": "Inspect project"},
            {"title": "Run verification command"},
            {"title": "Report results"},
        ],
        "summary": "mock plan",
    }

    def __init__(self) -> None:
        pass

    async def complete(self, messages: list[dict[str, str]], model: str | None = None) -> str:
        last = messages[-1]["content"] if messages else ""
        if "RETURN-JSON-PLAN" in last:
            return json.dumps(self.MOCK_PLAN)
        if "NEXT-ACTION" in last:
            return json.dumps(
                {
                    "tool": "exec_run",
                    "args": {"argv": ["echo", "owl-mock-ok"], "cwd": "."},
                    "why": "smoke check",
                }
            )
        return f"Mock plan for: {last[:120]} (1 index, 2 propose, 3 verify)"

    async def complete_stream(
        self, messages: list[dict[str, str]], model: str | None = None
    ) -> AsyncIterator[str]:
        text = await self.complete(messages, model)
        for word in text.split(" "):
            yield word + " "

    async def list_models(self) -> list[str]:
        return ["mock-1"]

    def describe(self) -> dict[str, object]:
        return {"name": self.name, "configured": True, "model": "mock-1"}
