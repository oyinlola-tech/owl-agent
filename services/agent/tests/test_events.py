import json as jsonlib

import httpx


def read_events(stream, wanted, limit=30):
    seen = []
    data = {}
    current = ""
    n = 0
    for line in stream.iter_lines():
        n += 1
        if line.startswith("event:"):
            current = line.removeprefix("event:").strip()
        elif line.startswith("data:"):
            try:
                data[current] = jsonlib.loads(line.removeprefix("data:").strip())
            except ValueError:
                pass
            seen.append(current)
        covered = set(seen) | set(data.get("snapshot", {}).get("recent", []))
        if any(w in covered for w in wanted) or n >= limit:
            return seen, data
    return seen, data


def test_stream_delivers_snapshot_and_events(live_server):
    with httpx.Client(base_url=live_server, timeout=10.0) as client:
        task_id = client.post("/tasks", json={"prompt": "stream me"}).json()["id"]
        with client.stream("GET", f"/tasks/{task_id}/events") as stream:
            assert stream.status_code == 200
            seen, data = read_events(stream, ("task.awaiting_approval",))
    assert seen[0] == "snapshot"
    # The runner is fast: the gate may already be reached, covered by recent.
    covered = set(seen) | set(data["snapshot"].get("recent", []))
    assert "task.started" in covered
    assert "task.progress" in covered
    assert "approval.requested" in covered
    assert "task.awaiting_approval" in covered


def test_cancel_from_gate_and_snapshot_reflects_it(live_server):
    with httpx.Client(base_url=live_server, timeout=10.0) as client:
        task_id = client.post("/tasks", json={"prompt": "cancel me"}).json()["id"]
        with client.stream("GET", f"/tasks/{task_id}/events") as stream:
            seen, data = read_events(stream, ("task.awaiting_approval",))
        covered = set(seen) | set(data["snapshot"].get("recent", []))
        assert "task.awaiting_approval" in covered
        cancelled = client.post(f"/tasks/{task_id}/cancel")
        assert cancelled.json()["status"] in ("cancelled", "completed")
        if cancelled.json()["status"] == "cancelled":
            assert client.get(f"/tasks/{task_id}").json()["status"] == "cancelled"
