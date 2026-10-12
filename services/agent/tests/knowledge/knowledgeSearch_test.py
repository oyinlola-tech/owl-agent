import asyncio

from app.databases.databaseConnection_database import open_database
from app.databases.recordStamp_database import current_utc_time
from app.knowledge.knowledgeSearch_knowledge import (
    fts5_is_available,
    knowledge_stats,
    search_knowledge,
)
from app.securityscans.findingStore_securityscan import SECURITY_SCAN_SCHEMA_SQL
from app.tools.handlers.knowledge.knowledgeSearch_handler import run_knowledge_search
from app.tools.toolArgument_tool import KnowledgeSearchArguments
from app.tools.toolRegistry_tool import REGISTERED_TOOLS, TOOL_HANDLERS

LEAKED_TOKEN = "ghp_abcdefghijklmno12345"
REDIS_MEMORY = (
    f"Chose Redis for sessions because the shared deploy token {LEAKED_TOKEN} unlocked the cache"
)


def seed_database(conn) -> None:
    now = current_utc_time().isoformat()
    older = "2023-01-01T00:00:00+00:00"
    conn.execute(
        "INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        ("proj-1", "owl-web", "/tmp/owl-web", now, now),
    )
    conn.execute(
        "INSERT INTO tasks (id, prompt, project, status, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        ("task-1", "Set up Redis caching for the API gateway", "owl-web", "done", older, older),
    )
    conn.execute(
        "INSERT INTO tasks (id, prompt, project, status, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        ("task-2", "Write the download page copy", "owl-web", "done", now, now),
    )
    conn.execute(
        "INSERT INTO memories (id, category, project, text, enabled, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("mem-redis", "project", "owl-web", REDIS_MEMORY, 1, now, now),
    )
    conn.execute(
        "INSERT INTO memories (id, category, project, text, enabled, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("mem-off", "project", "owl-web", "Redis was rejected in an old draft", 0, now, now),
    )
    conn.executescript(SECURITY_SCAN_SCHEMA_SQL)
    conn.execute(
        "INSERT INTO security_findings (id, project_id, scan_id, tool, severity, category, title,"
        " file, message, cwe, status, fingerprint, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            "find-1",
            "proj-1",
            "scan-1",
            "gitleaks",
            "high",
            "secret",
            "Hardcoded Redis password in config",
            "src/config.py",
            "A Redis connection secret was committed to the repository",
            "CWE-798",
            "open",
            "fp-1",
            now,
            now,
        ),
    )
    conn.commit()


def make_seeded_connection():
    conn = open_database(":memory:")
    seed_database(conn)
    return conn


def test_search_returns_ranked_memory_and_finding():
    conn = make_seeded_connection()
    results = search_knowledge(conn, "why did we choose Redis", project="owl-web")
    ids = [r["id"] for r in results]
    assert "mem-redis" in ids
    assert "find-1" in ids
    assert "mem-off" not in ids
    scores = [r["score"] for r in results]
    assert scores == sorted(scores, reverse=True)


def test_source_ref_and_type_are_correct():
    conn = make_seeded_connection()
    results = search_knowledge(conn, "Redis")
    by_id = {r["id"]: r for r in results}
    assert by_id["mem-redis"]["type"] == "memory"
    assert by_id["mem-redis"]["source_ref"] == {"memory_id": "mem-redis"}
    assert by_id["find-1"]["type"] == "finding"
    assert by_id["find-1"]["source_ref"] == {
        "finding_id": "find-1",
        "scan_id": "scan-1",
        "project_id": "proj-1",
    }
    assert by_id["find-1"]["project"] == "owl-web"


def test_type_filter_limits_sources():
    conn = make_seeded_connection()
    results = search_knowledge(conn, "Redis", types=["memory"])
    assert results
    assert {r["type"] for r in results} == {"memory"}


def test_project_filter_matches_name_and_id():
    conn = make_seeded_connection()
    results = search_knowledge(conn, "Redis", project="owl-web")
    assert {r["id"] for r in results} >= {"mem-redis", "find-1", "task-1"}
    empty = search_knowledge(conn, "Redis", project="not-a-project")
    assert empty == []


def test_disabled_memory_excluded():
    conn = make_seeded_connection()
    results = search_knowledge(conn, "rejected draft Redis")
    assert all(r["id"] != "mem-off" for r in results)


def test_secret_is_redacted_in_snippet():
    conn = make_seeded_connection()
    results = search_knowledge(conn, "Redis sessions")
    memory = next(r for r in results if r["id"] == "mem-redis")
    assert LEAKED_TOKEN not in memory["snippet"]
    assert "[redacted-secret]" in memory["snippet"]


def test_fts_fallback_path_matches():
    conn = make_seeded_connection()
    assert fts5_is_available(conn) is True
    fallback = search_knowledge(conn, "Redis", use_fts=False)
    fts = search_knowledge(conn, "Redis", use_fts=True)
    assert {r["id"] for r in fallback} == {r["id"] for r in fts}
    assert any(r["id"] == "mem-redis" for r in fallback)


def test_empty_query_returns_nothing():
    conn = make_seeded_connection()
    assert search_knowledge(conn, "   ") == []


def test_stats_counts_each_type():
    conn = make_seeded_connection()
    stats = knowledge_stats(conn)
    assert stats["counts"]["task"] == 2
    assert stats["counts"]["memory"] == 1
    assert stats["counts"]["finding"] == 1
    assert stats["counts"]["project"] == 1
    assert stats["total"] == stats["counts"]["task"] + stats["counts"]["memory"] + 2
    assert isinstance(stats["fts"], bool)


def test_tool_is_registered_without_approval():
    tool = REGISTERED_TOOLS["knowledge_search"]
    assert tool.requires_approval is False
    assert TOOL_HANDLERS["knowledge_search"] is run_knowledge_search


def test_tool_handler_returns_results_as_data():
    conn = make_seeded_connection()
    ctx = {"conn": conn}
    args = KnowledgeSearchArguments(query="why did we choose Redis", project="owl-web")
    out = asyncio.run(run_knowledge_search(ctx, args))
    assert out["query"] == "why did we choose Redis"
    assert out["count"] == len(out["results"])
    assert any(r["id"] == "mem-redis" for r in out["results"])
    assert all(LEAKED_TOKEN not in r["snippet"] for r in out["results"])
