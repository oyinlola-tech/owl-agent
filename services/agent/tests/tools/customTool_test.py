import pytest

from app.databases.databaseConnection_database import open_database
from app.tools.customTool_tool import (
    create_custom_tool,
    delete_custom_tool,
    expand_custom_tool_argv,
    get_custom_tool,
    list_custom_tools,
    set_custom_tool_enabled,
    sync_custom_tools_into_registry,
    update_custom_tool,
)
from app.tools.toolError_tool import ToolError
from app.tools.toolRegistry_tool import REGISTERED_TOOLS, TOOL_HANDLERS


def make_conn():
    return open_database(":memory:")


def make_tool(conn, **overrides):
    fields = {
        "name": "lint",
        "description": "Run the linter.",
        "argv": ["make", "lint", "{args}"],
        "risk": "high",
        "project": "",
    }
    fields.update(overrides)
    return create_custom_tool(conn, **fields)


def test_create_is_disabled_by_default():
    conn = make_conn()
    tool = make_tool(conn)
    assert tool["enabled"] is False
    assert tool["risk"] == "high"
    assert tool["argv"] == ["make", "lint", "{args}"]


def test_create_rejects_bad_names_and_argv():
    conn = make_conn()
    with pytest.raises(ValueError):
        make_tool(conn, name="Bad Name!")
    with pytest.raises(ValueError):
        make_tool(conn, name="ok", argv=["/bin/ls"])
    with pytest.raises(ValueError):
        make_tool(conn, name="ok", argv=["sh", "-c", "ls"])
    with pytest.raises(ValueError):
        make_tool(conn, name="ok", argv=["make", "a;b"])
    with pytest.raises(ValueError):
        make_tool(conn, name="ok", risk="extreme")


def test_create_rejects_duplicates_in_same_scope():
    conn = make_conn()
    make_tool(conn)
    with pytest.raises(ValueError):
        make_tool(conn)
    scoped = make_tool(conn, name="lint", project="owl")
    assert scoped["project"] == "owl"


def test_update_delete_and_enable_roundtrip():
    conn = make_conn()
    tool = make_tool(conn)
    updated = update_custom_tool(conn, tool["id"], description="Lint everything.")
    assert updated and updated["description"] == "Lint everything."
    assert update_custom_tool(conn, "ctool-missing", description="x") is None
    assert set_custom_tool_enabled(conn, tool["id"], True) is True
    assert get_custom_tool(conn, tool["id"])["enabled"] is True
    assert set_custom_tool_enabled(conn, "ctool-missing", True) is False
    assert delete_custom_tool(conn, tool["id"]) is True
    assert get_custom_tool(conn, tool["id"]) is None
    assert delete_custom_tool(conn, tool["id"]) is False


def test_expand_argv_substitutes_placeholder():
    assert expand_custom_tool_argv(["pytest", "{args}"], "-q tests/") == ["pytest", "-q", "tests/"]
    assert expand_custom_tool_argv(["make", "lint"], "--fix") == ["make", "lint", "--fix"]
    assert expand_custom_tool_argv(["echo", "--opt={args}"], "x") == ["echo", "--opt=x"]
    with pytest.raises(ToolError):
        expand_custom_tool_argv(["echo", "{args}"], '"unbalanced')


def test_sync_registers_only_enabled_tools():
    conn = make_conn()
    make_tool(conn)
    scoped = make_tool(conn, name="tests", argv=["pytest", "{args}"], project="owl")
    assert "custom-lint" not in REGISTERED_TOOLS
    try:
        assert sync_custom_tools_into_registry(conn) == []
        set_custom_tool_enabled(conn, scoped["id"], True)
        synced = sync_custom_tools_into_registry(conn)
        assert [t["name"] for t in synced] == ["tests"]
        assert REGISTERED_TOOLS["custom-tests"].requires_approval is True
        assert "custom-tests" in TOOL_HANDLERS
        assert "custom-lint" not in REGISTERED_TOOLS
        set_custom_tool_enabled(conn, scoped["id"], False)
        sync_custom_tools_into_registry(conn)
        assert "custom-tests" not in REGISTERED_TOOLS
        assert "custom-tests" not in TOOL_HANDLERS
    finally:
        REGISTERED_TOOLS.pop("custom-tests", None)
        TOOL_HANDLERS.pop("custom-tests", None)
        REGISTERED_TOOLS.pop("custom-lint", None)
        TOOL_HANDLERS.pop("custom-lint", None)


def test_list_filters_project_scope():
    conn = make_conn()
    make_tool(conn)
    make_tool(conn, name="tests", project="owl")
    assert {t["name"] for t in list_custom_tools(conn)} == {"lint", "tests"}
    assert {t["name"] for t in list_custom_tools(conn, project="owl")} == {"lint", "tests"}
    assert {t["name"] for t in list_custom_tools(conn, project="other")} == {"lint"}
