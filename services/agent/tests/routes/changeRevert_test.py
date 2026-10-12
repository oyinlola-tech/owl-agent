from supports.taskClient_support import ScriptedMockProvider, make_test_client, wait_for_task_status
from supports.verificationDriver_support import DONE, approve_until_task_settles


def test_revert_endpoint_restores_the_file_on_disk(tmp_path):
    workspace = tmp_path / "ws"
    workspace.mkdir()
    target = workspace / "note.txt"
    script = [
        {"tool": "fs_create", "args": {"path": "note.txt", "content": "made by owl\n"}, "why": "w"},
        {"done": True, "summary": "wrote note"},
    ]
    with make_test_client(tmp_path, provider=ScriptedMockProvider(["A"], script)) as client:
        task_id = client.post(
            "/tasks", json={"prompt": "write a note", "workspace": str(workspace)}
        ).json()["id"]
        approve_until_task_settles(client, task_id, stop=DONE)
        wait_for_task_status(client, task_id, DONE, timeout=10.0)
        assert target.read_text() == "made by owl\n"
        journal = client.get(f"/tasks/{task_id}/journal").json()
        assert len(journal) == 1
        response = client.post(f"/tasks/{task_id}/revert", json={"journal_id": journal[0]["id"]})
        assert response.status_code == 200, response.text
        assert not target.exists()
        assert client.get(f"/tasks/{task_id}/journal").json()[0]["reverted_at"]


def test_revert_with_unknown_journal_id_is_404(tmp_path):
    with make_test_client(tmp_path, provider=ScriptedMockProvider(["A"], [])) as client:
        task_id = client.post("/tasks", json={"prompt": "noop"}).json()["id"]
        response = client.post(f"/tasks/{task_id}/revert", json={"journal_id": "missing"})
        assert response.status_code == 404
