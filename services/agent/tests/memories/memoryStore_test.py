from app.databases.databaseConnection_database import open_database
from app.guards.secretScrub_guard import redact_secrets_in_text
from app.memories.sqliteMemoryStore_memory import SqliteMemoryStore


def make_memory_store():
    return SqliteMemoryStore(open_database(":memory:"))


def test_save_and_list_roundtrip():
    mem = make_memory_store()
    row = mem.save_memory("project", "Uses FastAPI with routers.", project="owl")
    assert row and row["id"]
    assert len(mem.list_memories(project="owl")) == 1


def test_restart_persistence(tmp_path):
    path = str(tmp_path / "mem.db")
    mem = SqliteMemoryStore(open_database(path))
    mem.save_memory("global", "PreferTabsNever", source="test")
    mem2 = SqliteMemoryStore(open_database(path))
    assert any(m["text"] == "PreferTabsNever" for m in mem2.list_memories())


def test_duplicates_are_not_stored():
    mem = make_memory_store()
    assert mem.save_memory("project", "Uses FastAPI with routers.", project="owl")
    assert mem.save_memory("project", "uses fastapi with routers!", project="owl") is None
    assert len(mem.list_memories(project="owl")) == 1


def test_secrets_never_stored():
    cleaned, had = redact_secrets_in_text("key: nvapi-abcdef1234567890 and password= hunter2")
    assert had
    assert "nvapi-abcdef1234567890" not in cleaned
    assert "hunter2" not in cleaned
    mem = make_memory_store()
    row = mem.save_memory("global", "token: sk-abcdefgh12345678")
    assert row is not None
    assert "sk-abcdefgh12345678" not in row["text"]


def test_search_ranks_relevant():
    mem = make_memory_store()
    mem.save_memory("knowledge", "Pytest runs with anyio marker for async tests.")
    mem.save_memory("knowledge", "Unrelated note about lunch menus.")
    hits = mem.search_memories("pytest async tests")
    assert hits and "Pytest" in hits[0]["text"]


def test_update_remove_disable():
    mem = make_memory_store()
    row = mem.save_memory("global", "Old preference.")
    assert row
    updated = mem.update_memory_text(row["id"], "New preference.")
    assert updated and updated["text"] == "New preference."
    assert mem.set_memory_enabled(row["id"], False)
    assert mem.list_memories() == []
    assert len(mem.list_memories(include_disabled=True)) == 1
    assert mem.set_memory_enabled(row["id"], True)
    assert mem.delete_memory(row["id"])
    assert mem.list_memories(include_disabled=True) == []


def test_clear_project_keeps_global():
    mem = make_memory_store()
    mem.save_memory("project", "Project fact.", project="owl")
    mem.save_memory("global", "Global fact.", project="owl")
    assert mem.clear_project_memories("owl") == 1
    remaining = mem.list_memories(include_disabled=True)
    assert len(remaining) == 1 and remaining[0]["category"] == "global"


def test_maintain_merges_and_logs_history():
    mem = make_memory_store()
    mem.save_memory("knowledge", "Pytest runs the suite.")
    mem.save_memory("knowledge", "Pytest runs the suite!")
    mem.save_memory("knowledge", "Pytest executes all tests.")
    result = mem.merge_duplicate_memories()
    assert result["scanned"] >= 2
    assert len(mem.list_memory_history(limit=10)) >= 2


def test_memory_endpoints(client):
    created = client.post(
        "/memory", json={"category": "project", "text": "Uses SQLite.", "project": "owl"}
    )
    assert created.status_code == 201
    mid = created.json()["memory"]["id"]
    assert any(m["id"] == mid for m in client.get("/memory", params={"project": "owl"}).json())
    assert client.get("/memory/search", params={"q": "sqlite"}).json()
    updated = client.patch(f"/memory/{mid}", json={"text": "Uses SQLite via WAL."})
    assert updated.json()["text"] == "Uses SQLite via WAL."
    assert client.post(f"/memory/{mid}/disable").json() == {"disabled": True}
    assert client.post(f"/memory/{mid}/enable").json() == {"enabled": True}
    assert client.post("/memory/maintain", json={"project": "owl"}).json()["scanned"] >= 1
    assert client.post("/memory/clear-project", json={"project": "owl"}).json()["cleared"] >= 1
    assert client.delete(f"/memory/{mid}").status_code == 404
    assert client.get("/memory/history").json()
