import pytest

from app.databases.databaseConnection_database import open_database
from app.executors import fileChange_executor as changes
from app.guards.workspaceAccess_guard import WorkspaceAccessGuard


def open_change_test_workspace(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    conn = open_database(":memory:")
    auth = WorkspaceAccessGuard([str(ws)])
    return conn, auth, ws


def test_propose_apply_revert_roundtrip(tmp_path):
    conn, auth, ws = open_change_test_workspace(tmp_path)
    (ws / "notes.txt").write_text("version one")
    prop = changes.propose_file_edit(conn, "t1", auth, "notes.txt", "version one", "version two")
    assert "version one" in prop["diff"] and "version two" in prop["diff"]
    applied = changes.apply_proposed_edit(conn, "t1", auth, prop["proposal_id"], "appr-1")
    assert (ws / "notes.txt").read_text() == "version two"
    assert applied["journal_id"]
    reverted = changes.revert_journaled_change(conn, auth, "t1", applied["journal_id"])
    assert reverted["path"] == "notes.txt"
    assert (ws / "notes.txt").read_text() == "version one"
    with pytest.raises(changes.ChangeError):
        changes.revert_journaled_change(conn, auth, "t1", applied["journal_id"])


def test_create_and_revert_creation(tmp_path):
    conn, auth, ws = open_change_test_workspace(tmp_path)
    journaled = changes.journal_file_creation(conn, "t1", "new.txt", "hello")
    (ws / "new.txt").write_text("hello")
    out = changes.revert_journaled_change(conn, auth, "t1", journaled["journal_id"])
    assert out["path"] == "new.txt"
    assert not (ws / "new.txt").exists()


def test_apply_detects_external_edit(tmp_path):
    conn, auth, ws = open_change_test_workspace(tmp_path)
    (ws / "notes.txt").write_text("version one")
    prop = changes.propose_file_edit(conn, "t1", auth, "notes.txt", "version one", "version two")
    (ws / "notes.txt").write_text("someone else was here")
    with pytest.raises(changes.ChangeConflictError):
        changes.apply_proposed_edit(conn, "t1", auth, prop["proposal_id"], "appr-1")
    assert (ws / "notes.txt").read_text() == "someone else was here"


def test_revert_detects_external_edit(tmp_path):
    conn, auth, ws = open_change_test_workspace(tmp_path)
    (ws / "notes.txt").write_text("v1")
    prop = changes.propose_file_edit(conn, "t1", auth, "notes.txt", "v1", "v2")
    applied = changes.apply_proposed_edit(conn, "t1", auth, prop["proposal_id"], "appr-1")
    (ws / "notes.txt").write_text("v3 by human")
    with pytest.raises(changes.ChangeConflictError):
        changes.revert_journaled_change(conn, auth, "t1", applied["journal_id"])


def test_propose_requires_anchor(tmp_path):
    conn, auth, ws = open_change_test_workspace(tmp_path)
    (ws / "notes.txt").write_text("version one")
    with pytest.raises(changes.ChangeError):
        changes.propose_file_edit(conn, "t1", auth, "notes.txt", "missing anchor", "x")


def test_journal_lists_entries(tmp_path):
    conn, auth, ws = open_change_test_workspace(tmp_path)
    (ws / "a.txt").write_text("1")
    prop = changes.propose_file_edit(conn, "t1", auth, "a.txt", "1", "2")
    changes.apply_proposed_edit(conn, "t1", auth, prop["proposal_id"], "appr-9")
    entries = changes.list_change_journal(conn, "t1")
    assert len(entries) == 1
    assert entries[0]["approval_id"] == "appr-9"
    assert entries[0]["reverted_at"] is None
