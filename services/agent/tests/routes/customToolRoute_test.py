PAYLOAD = {
    "name": "lint",
    "description": "Run the linter.",
    "argv": ["make", "lint", "{args}"],
    "risk": "high",
    "project": "",
}


def test_custom_tool_crud_roundtrip(client):
    created = client.post("/custom-tools", json=PAYLOAD)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["enabled"] is False
    tool_id = body["id"]

    listed = client.get("/custom-tools")
    assert listed.status_code == 200
    assert [t["name"] for t in listed.json()] == ["lint"]

    patched = client.patch("/custom-tools/" + tool_id, json={"description": "Lint all."})
    assert patched.status_code == 200
    assert patched.json()["description"] == "Lint all."

    enabled = client.post(f"/custom-tools/{tool_id}/enable")
    assert enabled.status_code == 200
    assert enabled.json() == {"enabled": True}

    tools = client.get("/tools")
    assert tools.status_code == 200
    custom = [t for t in tools.json() if t["name"] == "custom-lint"]
    assert len(custom) == 1
    assert custom[0]["requires_approval"] is True
    assert custom[0]["custom"] is True
    assert set(custom[0]) == {
        "name",
        "description",
        "requires_approval",
        "custom",
        "id",
        "argv",
        "risk",
        "project",
        "enabled",
    }

    disabled = client.post(f"/custom-tools/{tool_id}/disable")
    assert disabled.json() == {"disabled": True}
    names = [t["name"] for t in client.get("/tools").json()]
    assert "custom-lint" not in names

    removed = client.delete("/custom-tools/" + tool_id)
    assert removed.json() == {"deleted": True}
    assert client.get("/custom-tools").json() == []


def test_custom_tool_validation_and_duplicates(client):
    bad = client.post("/custom-tools", json={**PAYLOAD, "name": "Bad Name!"})
    assert bad.status_code == 422
    shell = client.post("/custom-tools", json={**PAYLOAD, "name": "sh", "argv": ["sh", "-c", "x"]})
    assert shell.status_code == 422
    absolute = client.post("/custom-tools", json={**PAYLOAD, "name": "ls", "argv": ["/bin/ls"]})
    assert absolute.status_code == 422
    first = client.post("/custom-tools", json=PAYLOAD)
    assert first.status_code == 201
    duplicate = client.post("/custom-tools", json=PAYLOAD)
    assert duplicate.status_code == 409
    scoped = client.post("/custom-tools", json={**PAYLOAD, "project": "owl"})
    assert scoped.status_code == 201


def test_custom_tool_missing_ids_are_404(client):
    assert client.patch("/custom-tools/ctool-missing", json={"risk": "low"}).status_code == 404
    assert client.post("/custom-tools/ctool-missing/enable").status_code == 404
    assert client.post("/custom-tools/ctool-missing/disable").status_code == 404
    assert client.delete("/custom-tools/ctool-missing").status_code == 404


def test_builtin_tool_shape_is_stable(client):
    tools = client.get("/tools")
    assert tools.status_code == 200
    builtin = [t for t in tools.json() if not t.get("custom")]
    assert builtin
    for entry in builtin:
        assert set(entry) == {"name", "description", "requires_approval"}
