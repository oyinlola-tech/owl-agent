from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime

from ..databases.recordStamp_database import current_utc_time
from ..guards.secretScrub_guard import redact_secrets_in_text

KNOWLEDGE_TYPES = (
    "task",
    "memory",
    "finding",
    "verification",
    "change",
    "command",
    "project",
)
DEFAULT_SOURCE_LIMIT = 500
MAX_TEXT_FIELD = 4000
SNIPPET_WIDTH = 220
MAX_TERMS = 12
MAX_RESULTS = 50

TERM_PATTERN = re.compile(r"[a-z0-9]+")


@dataclass
class KnowledgeCandidate:
    type: str
    id: str
    project_token: str
    project_is_id: bool
    created_at: str
    title: str
    fields: list[tuple[str, str]] = field(default_factory=list)
    source_ref: dict = field(default_factory=dict)

    def search_text(self) -> str:
        parts = [self.title] + [text for _, text in self.fields]
        return " ".join(p for p in parts if p)


def clip_field(value: object, limit: int = MAX_TEXT_FIELD) -> str:
    return str(value or "")[:limit]


def extract_terms(query: str, limit: int = MAX_TERMS) -> list[str]:
    seen: list[str] = []
    for token in TERM_PATTERN.findall((query or "").lower()):
        if len(token) >= 2 and token not in seen:
            seen.append(token)
        if len(seen) >= limit:
            break
    return seen


def relevance_score(candidate: KnowledgeCandidate, terms: list[str]) -> int:
    title = candidate.title.lower()
    body = candidate.search_text().lower()
    score = 0
    for term in terms:
        score += body.count(term)
        score += title.count(term) * 2
    return score


def recency_bonus(created_at: str) -> float:
    try:
        moment = datetime.fromisoformat(created_at)
    except (TypeError, ValueError):
        return 0.0
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    days = max(0.0, (current_utc_time() - moment).total_seconds() / 86400.0)
    return 1.0 / (1.0 + days / 30.0)


def find_matched_field(candidate: KnowledgeCandidate, terms: list[str]) -> tuple[str, str]:
    for name, text in candidate.fields:
        low = text.lower()
        if any(term in low for term in terms):
            return name, text
    if candidate.title and any(term in candidate.title.lower() for term in terms):
        return "title", candidate.title
    if candidate.fields:
        return candidate.fields[0]
    return "title", candidate.title


def build_snippet(text: str, terms: list[str], width: int = SNIPPET_WIDTH) -> str:
    low = text.lower()
    positions = [low.find(term) for term in terms if term in low]
    start = min(positions) if positions else -1
    if start < 0:
        excerpt = text[:width]
    else:
        begin = max(0, start - width // 3)
        excerpt = text[begin : begin + width]
        if begin > 0:
            excerpt = "…" + excerpt
    excerpt = " ".join(excerpt.split())
    # Security: recorded text may embed credentials; snippets are scrubbed before return.
    cleaned, _ = redact_secrets_in_text(excerpt)
    return cleaned


def build_result(
    candidate: KnowledgeCandidate, terms: list[str], project_label: str, score: float
) -> dict:
    field_name, text = find_matched_field(candidate, terms)
    # Security: a title can carry a secret too; scrub it the same way as the snippet.
    title_clean, _ = redact_secrets_in_text(" ".join(candidate.title.split())[:200])
    return {
        "type": candidate.type,
        "id": candidate.id,
        "project": project_label,
        "title": title_clean,
        "snippet": build_snippet(text, terms),
        "matched_on": field_name,
        "source_ref": candidate.source_ref,
        "created_at": candidate.created_at,
        "score": score,
    }
