from __future__ import annotations

from collections.abc import AsyncIterator


class ModelProvider:
    name = "base"
    _usage: dict | None = None

    async def complete(self, messages: list[dict[str, str]], model: str | None = None) -> str:
        raise NotImplementedError

    async def complete_stream(
        self, messages: list[dict[str, str]], model: str | None = None
    ) -> AsyncIterator[str]:
        yield await self.complete(messages, model)

    async def list_models(self) -> list[str]:
        return []

    def pop_usage(self) -> dict | None:
        usage, self._usage = self._usage, None
        return usage

    def describe(self) -> dict[str, object]:
        return {"name": self.name, "configured": False, "model": ""}
