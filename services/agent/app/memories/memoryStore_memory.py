from __future__ import annotations

import re
from abc import ABC, abstractmethod

MEMORY_CATEGORIES = ("global", "project", "task", "knowledge")


def normalize_memory_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


class MemoryStore(ABC):
    @abstractmethod
    def save_memory(
        self,
        category: str,
        text: str,
        *,
        project: str = "",
        confirmed: bool = True,
        source: str = "",
    ) -> dict | None: ...

    @abstractmethod
    def list_memories(
        self, *, category: str = "", project: str = "", include_disabled: bool = False
    ) -> list[dict]: ...

    @abstractmethod
    def search_memories(self, query: str, *, project: str = "", limit: int = 10) -> list[dict]: ...

    @abstractmethod
    def update_memory_text(self, memory_id: str, text: str) -> dict | None: ...

    @abstractmethod
    def delete_memory(self, memory_id: str) -> bool: ...

    @abstractmethod
    def set_memory_enabled(self, memory_id: str, enabled: bool) -> bool: ...

    @abstractmethod
    def clear_project_memories(self, project: str) -> int: ...

    @abstractmethod
    def list_memory_history(self, limit: int = 50) -> list[dict]: ...
