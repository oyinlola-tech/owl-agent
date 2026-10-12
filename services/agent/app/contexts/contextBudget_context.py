from __future__ import annotations

from dataclasses import dataclass, field

from .tokenCounter_context import count_tokens

FALLBACK_CONTEXT_LIMIT = 8192
COMPRESSION_THRESHOLD = 0.8

CONTEXT_CATEGORY_PRIORITY = [
    "safety",
    "user_constraints",
    "task_state",
    "instructions",
    "recent",
    "memories",
    "files",
    "tool_outputs",
    "history",
]


@dataclass
class ContextPart:
    category: str
    text: str
    tokens: int = 0
    method: str = ""

    def __post_init__(self) -> None:
        self.tokens, self.method = count_tokens(self.text)


@dataclass
class BudgetReport:
    model: str
    limit: int
    limit_source: str
    used: int
    reserved: int
    available: int
    utilization: float
    over_budget: bool
    compress_at: float
    should_compress: bool
    parts: list[dict] = field(default_factory=list)


class ContextBudgetPlanner:
    def __init__(
        self,
        *,
        limit: int | None,
        reserve_fraction: float = 0.25,
        budget_fraction: float = 1.0,
    ) -> None:
        self.limit = limit or FALLBACK_CONTEXT_LIMIT
        self.limit_source = "verified" if limit else f"fallback-{FALLBACK_CONTEXT_LIMIT}-estimate"
        self.reserve_fraction = reserve_fraction
        self.budget_fraction = budget_fraction

    def build_budget_report(self, model: str, parts: list[ContextPart]) -> BudgetReport:
        used = sum(p.tokens for p in parts)
        reserved = int(self.limit * self.reserve_fraction)
        available = int(self.limit * self.budget_fraction) - reserved
        utilization = used / self.limit if self.limit else 1.0
        method = parts[0].method if parts else "chars/4-estimate"
        return BudgetReport(
            model=model,
            limit=self.limit,
            limit_source=f"{self.limit_source} via {method}",
            used=used,
            reserved=reserved,
            available=max(0, available),
            utilization=round(utilization, 3),
            over_budget=used > max(0, available),
            compress_at=COMPRESSION_THRESHOLD,
            should_compress=utilization >= COMPRESSION_THRESHOLD,
            parts=[{"category": p.category, "tokens": p.tokens} for p in parts],
        )

    def drop_low_priority_parts_to_fit(
        self, model: str, parts: list[ContextPart]
    ) -> tuple[list[ContextPart], list[str]]:
        report = self.build_budget_report(model, parts)
        if not report.over_budget:
            return parts, []
        keep_always = {"safety", "user_constraints", "task_state"}
        ranked = sorted(
            parts,
            key=lambda p: (
                0 if p.category in keep_always else 1,
                CONTEXT_CATEGORY_PRIORITY.index(p.category)
                if p.category in CONTEXT_CATEGORY_PRIORITY
                else 99,
                -p.tokens,
            ),
        )
        kept: list[ContextPart] = []
        dropped: list[str] = []
        for part in ranked:
            trial = kept + [part]
            if part.category in keep_always or sum(p.tokens for p in trial) <= report.available:
                kept.append(part)
            else:
                dropped.append(part.category)
        return kept, dropped
