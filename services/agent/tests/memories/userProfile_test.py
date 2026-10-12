import json

from supports.taskClient_support import make_test_client

from app.databases.databaseConnection_database import open_database
from app.databases.recordStamp_database import current_utc_time
from app.memories.memorySuggestion_memory import (
    list_memory_suggestions,
    propose_memories_after_task,
)
from app.memories.sqliteMemoryStore_memory import SqliteMemoryStore

PROFILE = {
    "display_name": "Ada",
    "role": "Founder",
    "experience": "senior",
    "languages": ["TypeScript", "Python", "python"],
    "package_managers": ["pnpm"],
    "code_style": "small functions",
    "test_framework": "vitest",
    "commit_style": "conventional commits",
    "tone": "brief",
    "projects_folder": "~/code",
}


def test_profile_roundtrip_dedupes_and_scrubs_secrets(tmp_path):
    with make_test_client(tmp_path) as client:
        empty = client.get("/profile").json()
        assert empty["is_empty"] is True and empty["display_name"] == ""
        saved = client.put(
            "/profile", json={**PROFILE, "code_style": "token: sk-abcdefgh12345678"}
        ).json()
        assert saved["is_empty"] is False
        assert saved["languages"] == ["TypeScript", "Python"]
        assert "sk-abcdefgh12345678" not in json.dumps(saved)
        assert client.get("/profile").json()["display_name"] == "Ada"
        assert client.put("/profile", json={"unknown": 1}).status_code == 422
        assert client.put("/profile", json={"display_name": "x" * 81}).status_code == 422


def test_onboarding_progress_persists(tmp_path):
    with make_test_client(tmp_path) as client:
        first = client.get("/onboarding").json()
        assert first["step"] == "welcome" and first["completed"] is False
        assert first["profile_empty"] is True and first["provider_configured"] is True
        saved = client.put(
            "/onboarding", json={"step": "connect_model", "skipped_steps": ["about_you"]}
        ).json()
        assert saved["step"] == "connect_model" and saved["skipped_steps"] == ["about_you"]
        assert client.put("/onboarding", json={"step": "nowhere"}).status_code == 422
    with make_test_client(tmp_path) as client:
        assert client.get("/onboarding").json()["step"] == "connect_model"
        done = client.put("/onboarding", json={"step": "done", "completed": True}).json()
        assert done["completed"] is True


def seed_finished_task(conn, task_id="task-1", project="owl"):
    now = current_utc_time().isoformat()
    conn.execute(
        "INSERT INTO tasks (id, prompt, project, status, created_at, updated_at)"
        " VALUES (?, 'p', ?, 'verified_completed', ?, ?)",
        (task_id, project, now, now),
    )
    conn.execute(
        "INSERT INTO approvals (id, task_id, title, kind, command, status, created_at)"
        " VALUES ('ap-1', ?, 'Run install', 'command', 'npm install left-pad', 'rejected', ?)",
        (task_id, now),
    )
    conn.execute(
        "INSERT INTO verification_runs (id, task_id, requirement_id, kind, command_json,"
        " working_directory, status, started_at, created_at)"
        " VALUES ('vr-1', ?, 'r1', 'test', ?, '.', 'passed', ?, ?)",
        (task_id, json.dumps(["npm", "run", "test"]), now, now),
    )
    conn.commit()


def test_post_task_suggestions_are_unconfirmed_and_secret_free():
    conn = open_database(":memory:")
    memory = SqliteMemoryStore(conn)
    seed_finished_task(conn)
    conn.execute(
        "UPDATE approvals SET command = 'deploy --token=ghp_abcdefghijklmnop123' WHERE id = 'ap-1'"
    )
    saved = propose_memories_after_task(conn, memory, "task-1")
    texts = [m["text"] for m in saved]
    assert any("npm run test" in t for t in texts)
    assert any("declined" in t for t in texts)
    assert all(m["confirmed"] == 0 and m["project"] == "owl" for m in saved)
    assert all("ghp_abcdefghijklmnop123" not in t for t in texts)
    assert len(list_memory_suggestions(conn, "task-1")) == len(saved)
    assert propose_memories_after_task(conn, memory, "task-1") == []


def test_suggestions_can_be_confirmed_edited_or_deleted(tmp_path):
    with make_test_client(tmp_path) as client:
        conn = client.app.state.manager.conn
        seed_finished_task(conn)
        propose_memories_after_task(conn, client.app.state.memory, "task-1")
        listed = client.get("/memory/suggestions").json()
        assert len(listed) == 2
        task_view = client.get("/tasks/task-1/memories").json()
        assert len(task_view["suggestions"]) == 2 and task_view["used"] == []
        first, second = listed
        confirmed = client.post(
            f"/memory/{first['id']}/confirm", json={"text": "Run npm run test before done."}
        ).json()
        assert confirmed["confirmed"] == 1 and confirmed["text"] == "Run npm run test before done."
        assert client.delete(f"/memory/{second['id']}").json() == {"deleted": True}
        assert client.get("/memory/suggestions").json() == []
        assert client.post("/memory/nope/confirm").status_code == 404
