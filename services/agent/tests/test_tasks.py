def test_create_retrieve_and_list(client):
    created = client.post("/tasks", json={"prompt": "Build auth", "project": "ZudoMart"})
    assert created.status_code == 201
    task_id = created.json()["id"]
    got = client.get(f"/tasks/{task_id}")
    assert got.status_code == 200
    assert got.json()["prompt"] == "Build auth"
    listed = client.get("/tasks")
    assert task_id in [t["id"] for t in listed.json()]


def test_unknown_task_is_404(client):
    assert client.get("/tasks/nope").status_code == 404
    assert client.post("/tasks/nope/cancel").status_code == 404


def test_prompt_validation(client):
    assert client.post("/tasks", json={"prompt": "", "project": "x"}).status_code == 422
    assert client.post("/tasks", json={"prompt": "x" * 8001}).status_code == 422
    res = client.post("/tasks", json={"prompt": "ok"})
    task_id = res.json()["id"]
    assert (
        client.post(f"/tasks/{task_id}/messages", json={"role": "user", "text": ""}).status_code
        == 422
    )


def test_cancel_midflight(slow_client):
    created = slow_client.post("/tasks", json={"prompt": "slow job"})
    task_id = created.json()["id"]
    cancelled = slow_client.post(f"/tasks/{task_id}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert slow_client.get(f"/tasks/{task_id}").json()["status"] == "cancelled"


def test_pause_and_resume(slow_client):
    task_id = slow_client.post("/tasks", json={"prompt": "pausable"}).json()["id"]
    paused = slow_client.post(f"/tasks/{task_id}/pause").json()["status"]
    assert paused in ("paused", "running", "awaiting_approval")
    resumed = slow_client.post(f"/tasks/{task_id}/resume")
    assert resumed.status_code == 200
