import os

import pytest

hypothesis = pytest.importorskip("hypothesis")
strategies = pytest.importorskip("hypothesis.strategies")

from app.guards.workspaceAccess_guard import (  # noqa: E402
    WorkspaceAccessGuard,
    WorkspaceError,
)

PATH_SEGMENTS = strategies.one_of(
    strategies.sampled_from(
        [
            "..",
            ".",
            "",
            "~",
            "src",
            "escape_link",
            "inner_link",
            ".env",
            ".ssh",
            "id_rsa",
            "%2e%2e",
            "..\\..",
            "…",
        ]
    ),
    strategies.text(
        alphabet=strategies.characters(blacklist_categories=("Cs",), blacklist_characters="\x00"),
        min_size=1,
        max_size=12,
    ),
)
RELATIVE_PATHS = strategies.lists(PATH_SEGMENTS, min_size=1, max_size=8).map("/".join)
ABSOLUTE_PREFIXES = strategies.sampled_from(["", "/", "~/", "/etc/", "/tmp/../", "//"])
property_settings = hypothesis.settings(
    max_examples=400,
    deadline=None,
    database=None,
    suppress_health_check=[hypothesis.HealthCheck.function_scoped_fixture],
)


@pytest.fixture()
def guarded_workspace(tmp_path):
    workspace = tmp_path / "workspace"
    (workspace / "src").mkdir(parents=True)
    (workspace / "src" / "main.py").write_text("print('hi')\n")
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.txt").write_text("outside\n")
    os.symlink(outside, workspace / "escape_link")
    os.symlink(workspace / "src", workspace / "inner_link")
    return WorkspaceAccessGuard([str(workspace)]), os.path.realpath(workspace)


def is_inside(path: str, root: str) -> bool:
    return path == root or path.startswith(root + os.sep)


@property_settings
@hypothesis.given(
    prefix=ABSOLUTE_PREFIXES, relative=RELATIVE_PATHS, sensitive=strategies.booleans()
)
def test_resolved_paths_never_escape_the_workspace(guarded_workspace, prefix, relative, sensitive):
    guard, root = guarded_workspace
    try:
        resolved = guard.resolve_authorized_path(prefix + relative, allow_sensitive=sensitive)
    except WorkspaceError:
        return
    assert is_inside(resolved, root)
    assert is_inside(os.path.realpath(resolved), root)


@property_settings
@hypothesis.given(relative=RELATIVE_PATHS)
def test_sensitive_files_need_explicit_permission(guarded_workspace, relative):
    guard, _ = guarded_workspace
    try:
        resolved = guard.resolve_authorized_path(relative)
    except WorkspaceError:
        return
    relative_path = os.path.relpath(resolved, guard.list_roots()[0])
    name = os.path.basename(relative_path)
    assert ".ssh" not in relative_path.split(os.sep)
    assert not (name == ".env" or name.startswith(".env."))
    assert name not in {"id_rsa", "id_ed25519", "id_dsa"}


@pytest.mark.parametrize(
    "credential_file",
    [".aws/credentials", ".netrc", ".git-credentials", ".pypirc", ".docker/config.json", ".ENV"],
)
@pytest.mark.xfail(
    strict=True,
    reason="Known finding: the sensitive-path list misses common credential files and "
    "case variants, so fs_read returns them without allow_sensitive",
)
def test_common_credential_files_need_explicit_permission(guarded_workspace, credential_file):
    guard, _ = guarded_workspace
    with pytest.raises(WorkspaceError):
        guard.resolve_authorized_path(credential_file)


@pytest.mark.parametrize("hostile", ["src/\x00/main.py", "src/\udcff"])
@pytest.mark.xfail(
    strict=True,
    reason="Known finding: NUL bytes and lone surrogates raise ValueError/UnicodeEncodeError "
    "instead of WorkspaceError, so a model-supplied path can crash a tool call",
)
def test_unencodable_paths_are_refused_cleanly(guarded_workspace, hostile):
    guard, _ = guarded_workspace
    with pytest.raises(WorkspaceError):
        guard.resolve_authorized_path(hostile)
