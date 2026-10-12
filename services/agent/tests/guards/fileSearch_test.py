import asyncio

from app.guards.workspaceAccess_guard import WorkspaceAccessGuard
from app.tools.toolArgument_tool import FileSearchArguments
from app.tools.toolRegistry_tool import TOOL_HANDLERS


def search(auth, pattern):
    args = FileSearchArguments(path=".", pattern=pattern)
    return asyncio.run(TOOL_HANDLERS["fs_search"]({"auth": auth}, args))


def test_search_skips_symlinks_out_of_workspace(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    (tmp_path / "outside.txt").write_text("OUTSIDE-SECRET-MARKER")
    (ws / "link.txt").symlink_to(tmp_path / "outside.txt")
    (ws / "inside.txt").write_text("INSIDE-MARKER")
    hits = search(WorkspaceAccessGuard([str(ws)]), "MARKER")["hits"]
    assert [h["path"] for h in hits] == ["inside.txt"]


def test_search_skips_sensitive_files(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    (ws / ".env").write_text("API_KEY=FIND-ME")
    (ws / "server.pem").write_text("FIND-ME")
    (ws / "notes.txt").write_text("FIND-ME here")
    hits = search(WorkspaceAccessGuard([str(ws)]), "FIND-ME")["hits"]
    assert [h["path"] for h in hits] == ["notes.txt"]
