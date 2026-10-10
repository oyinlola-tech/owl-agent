"""Memory persistence, retrieval, secrets, and maintenance."""

from app.db import connect
from app.memory import SqliteMemoryStore, scrub_secrets


def store():
    return SqliteMemoryStore(connect(":memory:"))


def test_save_and_list_roundtrip():
    mem = store()
    row = mem.save("project", "Uses FastAPI with routers.", project="owl")
    assert row and row["id"]
    assert len(mem.list(project="owl")) == 1


def test_restart_persistence(tmp_path):
    path = str(tmp_path / "mem.db")
    mem = SqliteMemoryStore(connect(path))
    mem.save("global", "PreferTabsNever", source="test")
    mem2 = SqliteMemoryStore(connect(path))
    assert any(m["text"] == "PreferTabsNever" for m in mem2.list())


def test_duplicates_are_not_stored():
    mem = store()
    assert mem.save("project", "Uses FastAPI with routers.", project="owl")
    assert mem.save("project", "uses fastapi with routers!", project="owl") is None
    assert len(mem.list(project="owl")) == 1


def test_secrets_never_stored():
    cleaned, had = scrub_secrets("key: nvapi-abcdef1234567890 and password= hunter2")
    assert had
    assert "nvapi-abcdef1234567890" not in cleaned
    assert "hunter2" not in cleaned
    mem = store()
    row = mem.save("global", "token: sk-abcdefgh12345678")
    assert row is not None
    assert "sk-abcdefgh12345678" not in row["text"]


def test_search_ranks_relevant():
    mem = store()
    mem.save("knowledge", "Pytest runs with anyio marker for async tests.")
    mem.save("knowledge", "Unrelated note about lunch menus.")
    hits = mem.search("pytest async tests")
    assert hits and "Pytest" in hits[0]["text"]


def test_update_remove_disable():
    mem = store()
    row = mem.save("global", "Old preference.")
    assert row
    updated = mem.update(row["id"], "New preference.")
    assert updated and updated["text"] == "New preference."
    assert mem.set_enabled(row["id"], False)
    assert mem.list() == []
    assert len(mem.list(include_disabled=True)) == 1
    assert mem.set_enabled(row["id"], True)
    assert mem.remove(row["id"])
    assert mem.list(include_disabled=True) == []


def test_clear_project_keeps_global():
    mem = store()
    mem.save("project", "Project fact.", project="owl")
    mem.save("global", "Global fact.", project="owl")
    assert mem.clear_project("owl") == 1
    remaining = mem.list(include_disabled=True)
    assert len(remaining) == 1 and remaining[0]["category"] == "global"


def test_maintain_merges_and_logs_history():
    mem = store()
    mem.save("knowledge", "Pytest runs the suite.")
    mem.save("knowledge", "Pytest runs the suite!")  # blocked as duplicate
    mem.save("knowledge", "Pytest executes all tests.")
    result = mem.maintain()
    assert result["scanned"] >= 2
    assert len(mem.history(limit=10)) >= 2


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
    assert client.delete(f"/memory/{mid}").status_code == 404  # already cleared
    assert client.get("/memory/history").json()
