"""Context budgets and layered compression. Estimates are always labeled."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .models import utcnow

FALLBACK_LIMIT = 8192
COMPRESS_AT = 0.8


def _counter():
    try:
        import tiktoken  # type: ignore[import-not-found]

        enc = tiktoken.get_encoding("cl100k_base")

        def count(text: str) -> tuple[int, str]:
            return len(enc.encode(text)), "tiktoken-cl100k"

        return count
    except Exception:  # noqa: BLE001 - tokenizer is best-effort

        def estimate(text: str) -> tuple[int, str]:
            return max(1, len(text) // 4), "chars/4-estimate"

        return estimate


count_tokens = _counter()

CATEGORY_PRIORITY = [
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


class BudgetManager:
    def __init__(
        self,
        *,
        limit: int | None,
        reserve_fraction: float = 0.25,
        budget_fraction: float = 1.0,
    ) -> None:
        self.limit = limit or FALLBACK_LIMIT
        self.limit_source = "verified" if limit else f"fallback-{FALLBACK_LIMIT}-estimate"
        self.reserve_fraction = reserve_fraction
        self.budget_fraction = budget_fraction

    def budget(self, model: str, parts: list[ContextPart]) -> BudgetReport:
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
            compress_at=COMPRESS_AT,
            should_compress=utilization >= COMPRESS_AT,
            parts=[{"category": p.category, "tokens": p.tokens} for p in parts],
        )

    def trim_to_budget(
        self, model: str, parts: list[ContextPart]
    ) -> tuple[list[ContextPart], list[str]]:
        """Drop lowest-priority categories first. Never drops safety/constraints/state."""
        report = self.budget(model, parts)
        if not report.over_budget:
            return parts, []
        keep_always = {"safety", "user_constraints", "task_state"}
        ranked = sorted(
            parts,
            key=lambda p: (
                0 if p.category in keep_always else 1,
                CATEGORY_PRIORITY.index(p.category) if p.category in CATEGORY_PRIORITY else 99,
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


REQUIRED_SUMMARY_FIELDS = (
    "objectives",
    "decisions",
    "files",
    "completed",
    "remaining",
    "risks",
)

FILE_RE = re.compile(r"[\w\-./]+\.(?:py|ts|tsx|go|js|md|toml|json|tsx?)", re.I)


def extractive_summary(messages: list[dict[str, str]]) -> dict[str, list[str]]:
    """Deterministic L2 summary. No model calls; originals are always kept."""
    files: list[str] = []
    decisions: list[str] = []
    errors: list[str] = []
    objectives: list[str] = []
    for m in messages:
        text = m.get("text", "")
        for found in FILE_RE.findall(text):
            if found not in files:
                files.append(found)
        low = text.lower()
        if any(k in low for k in ("decided", "decision", "chose", "will use", "agreed")):
            decisions.append(text[:200])
        if any(k in low for k in ("error", "failed", "traceback", "exception")):
            errors.append(text[:200])
        if m.get("role") == "user" and text not in objectives:
            objectives.append(text[:200])
    return {
        "objectives": objectives[:5],
        "decisions": decisions[:5],
        "files": files[:20],
        "completed": [],
        "remaining": [],
        "risks": errors[:5],
    }


def validate_summary(summary: dict) -> list[str]:
    """Returns missing required fields. Empty means the summary is usable."""
    missing = [f for f in REQUIRED_SUMMARY_FIELDS if f not in summary]
    if not isinstance(summary.get("files"), list):
        missing.append("files")
    return missing


class Compressor:
    """L1 dedupe, L2 summary, L3 retrieval assist, L4 emergency compaction."""

    def level1_dedupe(self, parts: list[ContextPart]) -> tuple[list[ContextPart], int]:
        seen: set[str] = set()
        kept: list[ContextPart] = []
        saved = 0
        for part in parts:
            key = f"{part.category}:{part.text}"
            if key in seen and part.category in ("tool_outputs", "history", "files"):
                saved += part.tokens
                continue
            seen.add(key)
            kept.append(part)
        return kept, saved

    def level2_summarize(self, messages: list[dict[str, str]]) -> dict[str, list[str]]:
        summary = extractive_summary(messages)
        missing = validate_summary(summary)
        if missing:
            raise ValueError(f"summary missing required fields: {missing}")
        return summary

    def level4_compact(
        self, parts: list[ContextPart], summary: dict[str, list[str]]
    ) -> list[ContextPart]:
        """Keep safety, constraints, state, and the summary. Drop the rest."""
        keep = {"safety", "user_constraints", "task_state"}
        kept = [p for p in parts if p.category in keep]
        lines = [f"{k}: {', '.join(v[:8]) if v else '-'}" for k, v in summary.items()]
        kept.append(ContextPart(category="history", text="COMPACTED SUMMARY\n" + "\n".join(lines)))
        return kept

    def record(
        self, conn, task_id: str, level: int, before: int, after: int, summary: str = ""
    ) -> None:
        conn.execute(
            "INSERT INTO compressions (task_id, level, before_tokens, after_tokens,"
            " summary, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (task_id, level, before, after, summary[:2000], utcnow().isoformat()),
        )
        conn.commit()
