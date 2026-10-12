from __future__ import annotations

import re

from .modelRegistry_llm import CATEGORY_CAPABILITIES, ModelRegistry

PROMPT_CATEGORIES = ("chat", "plan", "code", "debug", "big_context", "summarize", "multimodal")

CATEGORY_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("multimodal", re.compile(r"\b(image|photo|screenshot|diagram|vision|picture)\b", re.I)),
    ("debug", re.compile(r"\b(debug|error|traceback|failing|fix|stack ?trace|exception)\b", re.I)),
    (
        "code",
        re.compile(r"\b(code|function|implement|refactor|generate|write|script|class|api)\b", re.I),
    ),
    ("plan", re.compile(r"\b(plan|architect|design|approach|strategy|roadmap)\b", re.I)),
    ("big_context", re.compile(r"\b(codebase|repository|whole|entire|all files|across)\b", re.I)),
    ("summarize", re.compile(r"\b(summar\w+|compress\w*|tldr|recap|distill)\b", re.I)),
]


def classify_prompt(prompt: str) -> str:
    for category, pattern in CATEGORY_PATTERNS:
        if pattern.search(prompt):
            return category
    return "chat"


class RoutingError(Exception):
    pass


class ModelRouter:
    def __init__(
        self,
        registry: ModelRegistry,
        *,
        default_model: str = "",
        allow_fallback: bool = True,
        fallback_model: str = "",
        recent_failures: set[str] | None = None,
    ) -> None:
        self.registry = registry
        self.default_model = default_model
        self.allow_fallback = allow_fallback
        self.fallback_model = fallback_model
        self.recent_failures = recent_failures or set()

    def choose_model(
        self,
        prompt: str,
        *,
        model: str = "auto",
        estimated_tokens: int = 0,
    ) -> tuple[str, str]:
        usable = {m["id"]: m for m in self.registry.list_models(only_usable=True)}
        if not usable:
            raise RoutingError("no usable models in the registry")

        if model != "auto":
            entry = self.registry.get_model(model)
            if entry is None or entry["status"] not in ("available", "verified"):
                if self.allow_fallback and self.fallback_model in usable:
                    return self.fallback_model, (
                        f"pinned model '{model}' is not usable; "
                        f"fallback policy selected '{self.fallback_model}'"
                    )
                raise RoutingError(f"pinned model '{model}' is not usable and fallback is disabled")
            if (
                model in self.recent_failures
                and self.allow_fallback
                and self.fallback_model in usable
            ):
                return self.fallback_model, (
                    f"pinned model '{model}' failed recently; "
                    f"fallback policy selected '{self.fallback_model}'"
                )
            return model, f"user-pinned model '{model}'"

        category = classify_prompt(prompt)
        needed = CATEGORY_CAPABILITIES[category]
        candidates = [
            m
            for m in usable.values()
            if all(c in m["capabilities"] for c in needed) and m["id"] not in self.recent_failures
        ]
        if not candidates:
            candidates = [m for m in usable.values() if m["id"] not in self.recent_failures]
        if not candidates:
            candidates = list(usable.values())
        if estimated_tokens:
            fitting = [
                m
                for m in candidates
                if not m["context_window"] or m["context_window"] >= estimated_tokens
            ]
            if fitting:
                candidates = fitting
        if self.default_model in {m["id"] for m in candidates}:
            picked = self.default_model
        else:
            picked = sorted(candidates, key=lambda m: m["id"])[0]["id"]
        return picked, (
            f"auto classified '{category}', needs {needed}; "
            f"selected '{picked}' from {len(candidates)} candidate(s)"
        )
