def test_health_reports_status_and_version(client):
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["version"] == "0.1.0"
    assert body["provider"] == "mock"
    assert body["approvals_enforced"] is True


def test_provider_never_exposes_a_key(client):
    res = client.get("/provider")
    assert res.status_code == 200
    body = res.json()
    assert "key" not in " ".join(body.keys()).lower()
    assert set(body) == {"name", "configured", "model"}
