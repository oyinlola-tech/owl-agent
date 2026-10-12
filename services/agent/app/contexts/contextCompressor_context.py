from __future__ import annotations

import re

from ..databases.recordStamp_database import current_utc_time
from .contextBudget_context import ContextPart

REQUIRED_SUMMARY_FIELDS = (
    "objectives",
    "decisions",
    "files",
    "completed",
    "remaining",
    "risks",
)

FILE_PATH_PATTERN = re.compile(r"[\w\-./]+\.(?:py|ts|tsx|go|js|md|toml|json|tsx?)", re.I)


def build_extractive_summary(messages: list[dict[str, str]]) -> dict[str, list[str]]:
    files: list[str] = []
    decisions: list[str] = []
    errors: list[str] = []
    objectives: list[str] = []
    for m in messages:
        text = m.get("text", "")
        for found in FILE_PATH_PATTERN.findall(text):
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


def list_missing_summary_fields(summary: dict) -> list[str]:
    missing = [f for f in REQUIRED_SUMMARY_FIELDS if f not in summary]
    if not isinstance(summary.get("files"), list):
        missing.append("files")
    return missing


class ContextCompressor:
    def remove_duplicate_parts(self, parts: list[ContextPart]) -> tuple[list[ContextPart], int]:
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

    def summarize_messages(self, messages: list[dict[str, str]]) -> dict[str, list[str]]:
        summary = build_extractive_summary(messages)
        missing = list_missing_summary_fields(summary)
        if missing:
            raise ValueError(f"summary missing required fields: {missing}")
        return summary

    def compact_to_essentials(
        self, parts: list[ContextPart], summary: dict[str, list[str]]
    ) -> list[ContextPart]:
        keep = {"safety", "user_constraints", "task_state"}
        kept = [p for p in parts if p.category in keep]
        lines = [f"{k}: {', '.join(v[:8]) if v else '-'}" for k, v in summary.items()]
        kept.append(ContextPart(category="history", text="COMPACTED SUMMARY\n" + "\n".join(lines)))
        return kept

    def record_compression(
        self, conn, task_id: str, level: int, before: int, after: int, summary: str = ""
    ) -> None:
        conn.execute(
            "INSERT INTO compressions (task_id, level, before_tokens, after_tokens,"
            " summary, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (task_id, level, before, after, summary[:2000], current_utc_time().isoformat()),
        )
        conn.commit()
