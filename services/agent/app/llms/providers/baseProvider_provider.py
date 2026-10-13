from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator


class ModelProvider:
    name = "base"
    _usage: dict | None = None

    def _usage_slots(self) -> dict:
        slots = self.__dict__.get("_usage_slot_map")
        if slots is None:
            slots = {}
            self.__dict__["_usage_slot_map"] = slots
        return slots

    @staticmethod
    def _usage_slot_key() -> object:
        try:
            task = asyncio.current_task()
        except RuntimeError:
            return None
        return task

    def _store_usage(self, usage: dict | None) -> None:
        if usage is None:
            return
        slots = self._usage_slots()
        for key in list(slots):
            if key is not None and getattr(key, "done", None) is not None:
                try:
                    finished = bool(key.done())  # type: ignore[union-attr]
                except RuntimeError:
                    finished = True
                if finished:
                    slots.pop(key, None)
        slots[self._usage_slot_key()] = usage

    async def complete(self, messages: list[dict[str, str]], model: str | None = None) -> str:
        raise NotImplementedError

    async def complete_stream(
        self, messages: list[dict[str, str]], model: str | None = None
    ) -> AsyncIterator[str]:
        yield await self.complete(messages, model)

    async def list_models(self) -> list[str]:
        return []

    def pop_usage(self) -> dict | None:
        slots = self.__dict__.get("_usage_slot_map")
        if slots:
            key = self._usage_slot_key()
            if key in slots:
                return slots.pop(key)  # type: ignore[no-any-return]
        usage, self._usage = self._usage, None
        return usage

    def describe(self) -> dict[str, object]:
        return {"name": self.name, "configured": False, "model": ""}


class UnconfiguredProvider(ModelProvider):
    name = "none"

    async def complete(self, messages: list[dict[str, str]], model: str | None = None) -> str:
        from .providerError_provider import ProviderNotConfiguredError

        raise ProviderNotConfiguredError("Connect a model first.")

    async def complete_stream(
        self, messages: list[dict[str, str]], model: str | None = None
    ) -> AsyncIterator[str]:
        yield await self.complete(messages, model)

    async def list_models(self) -> list[str]:
        from .providerError_provider import ProviderNotConfiguredError

        raise ProviderNotConfiguredError("Connect a model first.")

    def describe(self) -> dict[str, object]:
        return {"name": self.name, "configured": False, "model": ""}


class ActiveProvider(ModelProvider):
    def __init__(self, current: ModelProvider, provider_id: str = "") -> None:
        self.current = current
        self.provider_id = provider_id or str(current.describe().get("name", ""))

    @property
    def name(self) -> str:  # type: ignore[override]
        return str(self.current.describe().get("name", ""))

    def replace_provider(self, provider: ModelProvider, provider_id: str) -> ModelProvider:
        previous, self.current = self.current, provider
        self.provider_id = provider_id
        return previous

    async def complete(self, messages: list[dict[str, str]], model: str | None = None) -> str:
        return await self.current.complete(messages, model)

    async def complete_stream(
        self, messages: list[dict[str, str]], model: str | None = None
    ) -> AsyncIterator[str]:
        async for delta in self.current.complete_stream(messages, model):
            yield delta

    async def list_models(self) -> list[str]:
        return await self.current.list_models()

    def pop_usage(self) -> dict | None:
        pop = getattr(self.current, "pop_usage", None)
        return pop() if callable(pop) else None

    def describe(self) -> dict[str, object]:
        return self.current.describe()
