from __future__ import annotations

import sqlite3
from uuid import uuid4

from .knowledgeRecord_knowledge import (
    MAX_RESULTS,
    KnowledgeCandidate,
    build_result,
    extract_terms,
    recency_bonus,
    relevance_score,
)
from .knowledgeSource_knowledge import count_by_type, load_candidates
from .projectResolver_knowledge import ProjectResolver


def fts5_is_available(conn: sqlite3.Connection) -> bool:
    name = f"owl_fts_probe_{uuid4().hex}"
    try:
        conn.execute(f'CREATE VIRTUAL TABLE temp."{name}" USING fts5(x)')
        conn.execute(f'DROP TABLE temp."{name}"')
        return True
    except sqlite3.OperationalError:
        return False


def fts_content(candidate: KnowledgeCandidate) -> str:
    parts = [candidate.title, candidate.project_token]
    parts.extend(text for _, text in candidate.fields)
    return " ".join(p for p in parts if p)


def build_fts_query(terms: list[str]) -> str:
    return " OR ".join(f"{term}*" for term in terms)


def fts_match(
    conn: sqlite3.Connection, candidates: list[KnowledgeCandidate], terms: list[str]
) -> list[tuple[str, str]]:
    name = f"knowledge_fts_{uuid4().hex}"
    conn.execute(f'CREATE VIRTUAL TABLE temp."{name}" USING fts5(ref UNINDEXED, content)')
    try:
        conn.executemany(
            f'INSERT INTO temp."{name}" (ref, content) VALUES (?, ?)',
            [(f"{c.type}\x1f{c.id}", fts_content(c)) for c in candidates],
        )
        rows = conn.execute(
            f'SELECT ref FROM temp."{name}" WHERE "{name}" MATCH ?',
            (build_fts_query(terms),),
        ).fetchall()
    finally:
        conn.execute(f'DROP TABLE temp."{name}"')
    keys: list[tuple[str, str]] = []
    for row in rows:
        type_name, _, identifier = str(row[0]).partition("\x1f")
        keys.append((type_name, identifier))
    return keys


def like_match(candidates: list[KnowledgeCandidate], terms: list[str]) -> list[tuple[str, str]]:
    keys: list[tuple[str, str]] = []
    for candidate in candidates:
        body = candidate.search_text().lower()
        if any(term in body for term in terms):
            keys.append((candidate.type, candidate.id))
    return keys


def search_knowledge(
    conn: sqlite3.Connection,
    query: str,
    *,
    types: list[str] | None = None,
    project: str = "",
    limit: int = 10,
    use_fts: bool | None = None,
) -> list[dict]:
    terms = extract_terms(query)
    if not terms:
        return []
    candidates = load_candidates(conn, types=types)
    if not candidates:
        return []
    by_key = {(c.type, c.id): c for c in candidates}
    if use_fts is None:
        use_fts = fts5_is_available(conn)
    matched = fts_match(conn, candidates, terms) if use_fts else like_match(candidates, terms)
    resolver = ProjectResolver(conn)
    results: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for key in matched:
        if key in seen:
            continue
        seen.add(key)
        candidate = by_key.get(key)
        if candidate is None:
            continue
        if not resolver.matches(candidate.project_token, candidate.project_is_id, project):
            continue
        score = round(relevance_score(candidate, terms) + recency_bonus(candidate.created_at), 4)
        label = resolver.label(candidate.project_token, candidate.project_is_id)
        results.append(build_result(candidate, terms, label, score))
    results.sort(key=lambda item: item["created_at"], reverse=True)
    results.sort(key=lambda item: item["score"], reverse=True)
    return results[: max(1, min(limit, MAX_RESULTS))]


def knowledge_stats(conn: sqlite3.Connection) -> dict:
    counts = count_by_type(conn)
    return {
        "counts": counts,
        "total": sum(counts.values()),
        "fts": fts5_is_available(conn),
    }
