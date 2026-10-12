from __future__ import annotations

import json
import re

from .stackCatalog_stack import StackEntry

RANKING_JSON_PATTERN = re.compile(r"\[.*\]", re.S)


def build_ranking_prompt(
    description: str, constraints: dict | None, catalog: list[StackEntry]
) -> str:
    lines = [
        f"- {entry.id}: {entry.name} — languages {', '.join(entry.languages)};"
        f" domains {', '.join(entry.domains)}"
        for entry in catalog
    ]
    constraint_text = json.dumps(constraints or {}, ensure_ascii=False)
    allowed = ", ".join(entry.id for entry in catalog)
    return (
        "RANK-STACKS-JSON\n"
        "You are a senior engineer choosing a technology stack. From the catalog below, choose the"
        " best-fit stacks for the project, best first.\n"
        f"Project description: {description}\n"
        f"Constraints (JSON): {constraint_text}\n\n"
        "Catalog:\n" + "\n".join(lines) + "\n\n"
        "Return ONLY a JSON array of at most 5 catalog ids, most suitable first, for example"
        ' ["python-fastapi", "go-backend"]. Use ids EXACTLY as written above and invent nothing.'
        f" Allowed ids: {allowed}."
    )


def parse_model_ranking(text: str, allowed_ids: set[str]) -> list[str] | None:
    # Security: the model can hallucinate stack ids, so anything it returns is validated against
    # the real catalog and unknown ids cause the whole ranking to be rejected (caller falls back).
    if not text:
        return None
    match = RANKING_JSON_PATTERN.search(text)
    if not match:
        return None
    try:
        parsed = json.loads(match.group(0))
    except ValueError:
        return None
    if not isinstance(parsed, list) or not parsed:
        return None
    ordered: list[str] = []
    for item in parsed:
        if not isinstance(item, str):
            return None
        if item not in allowed_ids:
            return None
        if item not in ordered:
            ordered.append(item)
    return ordered or None
