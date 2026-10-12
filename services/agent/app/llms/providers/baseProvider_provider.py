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
