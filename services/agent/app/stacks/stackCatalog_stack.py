from __future__ import annotations

from dataclasses import asdict, dataclass, field


@dataclass(frozen=True)
class StackEntry:
    id: str
    name: str
    languages: tuple[str, ...]
    frameworks: tuple[str, ...]
    domains: tuple[str, ...]
    strengths: tuple[str, ...]
    tradeoffs: tuple[str, ...]
    performance: str
    learning_curve: str
    ecosystem: str
    hosting: tuple[str, ...]
    licensing: str
    starter_command: str
    verification_commands: tuple[str, ...]
    owl_support: str
    keywords: tuple[str, ...] = field(default=())

    def to_dict(self) -> dict:
        data = asdict(self)
        for key, value in list(data.items()):
            if isinstance(value, tuple):
                data[key] = list(value)
        data.pop("keywords", None)
        return data


def load_catalog() -> list[StackEntry]:
    from .catalog import collect_all_stacks

    seen: dict[str, StackEntry] = {}
    for entry in collect_all_stacks():
        seen[entry.id] = entry
    return sorted(seen.values(), key=lambda e: e.id)


def catalog_by_id() -> dict[str, StackEntry]:
    return {entry.id: entry for entry in load_catalog()}


def get_stack(stack_id: str) -> StackEntry | None:
    return catalog_by_id().get(stack_id)


def known_stack_ids() -> set[str]:
    return set(catalog_by_id())
