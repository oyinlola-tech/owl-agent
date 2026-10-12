from app.databases.databaseConnection_database import open_database
from app.databases.recordStamp_database import current_utc_time
from app.securityscans.findingStore_securityscan import SECURITY_SCAN_SCHEMA_SQL

LEAKED_TOKEN = "ghp_abcdefghijklmno12345"


def seed_via_second_connection(db_file: str) -> None:
    conn = open_database(db_file)
    now = current_utc_time().isoformat()
    conn.execute(
        "INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        ("proj-1", "owl-web", "/tmp/owl-web-route", now, now),
    )
    conn.execute(
        "INSERT INTO tasks (id, prompt, project, status, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        ("task-1", "Set up Redis caching for the gateway", "owl-web", "done", now, now),
    )
    conn.execute(
        "INSERT INTO memories (id, category, project, text, enabled, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            "mem-redis",
            "project",
            "owl-web",
            f"Chose Redis for sessions; the deploy token {LEAKED_TOKEN} was involved",
            1,
            now,
            now,
        ),
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
            "Hardcoded Redis password",
            "src/config.py",
            "A Redis secret was committed",
            "CWE-798",
            "open",
            "fp-1",
            now,
            now,
        ),
    )
    conn.commit()
    conn.close()


def test_knowledge_search_route(client, db_file):
    seed_via_second_connection(db_file)
    response = client.get(
        "/knowledge/search", params={"q": "why did we choose Redis", "project": "owl-web"}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["query"] == "why did we choose Redis"
    ids = [r["id"] for r in body["results"]]
    assert "mem-redis" in ids
    assert "find-1" in ids
    memory = next(r for r in body["results"] if r["id"] == "mem-redis")
    assert LEAKED_TOKEN not in memory["snippet"]


def test_knowledge_search_route_type_filter(client, db_file):
    seed_via_second_connection(db_file)
    response = client.get("/knowledge/search", params={"q": "Redis", "types": "memory"})
    assert response.status_code == 200, response.text
    results = response.json()["results"]
    assert results
    assert {r["type"] for r in results} == {"memory"}


def test_knowledge_stats_route(client, db_file):
    seed_via_second_connection(db_file)
    response = client.get("/knowledge/stats")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["counts"]["memory"] == 1
    assert body["counts"]["finding"] == 1
    assert body["total"] >= 3
    assert "fts" in body


def test_knowledge_route_requires_token(client, db_file):
    seed_via_second_connection(db_file)
    unauth = client.get("/knowledge/search", params={"q": "Redis"}, headers={"Authorization": ""})
    assert unauth.status_code in (401, 403)
