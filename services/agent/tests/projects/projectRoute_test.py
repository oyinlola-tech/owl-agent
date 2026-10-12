import os

import pytest
from supports.projectClient_support import (
    add_project,
    create_sample_project,
    open_local_client,
)

from app.projects.projectLocation_project import ProjectError, validate_project_folder


def test_add_existing_folder_detects_stack_and_authorizes_it(tmp_path):
    folder = create_sample_project(tmp_path / "shop")
    with open_local_client(tmp_path) as client:
        response = client.post("/projects", json={"path": folder, "name": "  My   Shop "})
        assert response.status_code == 201
        body = response.json()
        assert body["created"] is True
        project = body["project"]
        assert project["name"] == "My Shop" and project["path"] == folder
        assert project["stack"]["languages"] == ["javascript"]
        assert project["stack"]["package_manager"] == "npm"
        assert "react" in project["stack"]["frameworks"]
        assert any(c["command"] == "npm run test" for c in project["stack"]["checks"])
        assert folder in client.get("/workspaces").json()["roots"]
        assert folder in client.app.state.exec_service.auth.list_roots()
        again = client.post("/projects", json={"path": folder + "/"})
        assert again.status_code == 200 and again.json()["created"] is False
        assert len(client.get("/projects").json()["projects"]) == 1


def test_projects_survive_restart_as_authorized_roots(tmp_path):
    folder = create_sample_project(tmp_path / "persist")
    with open_local_client(tmp_path) as client:
        add_project(client, folder)
    with open_local_client(tmp_path) as client:
        assert folder in client.get("/workspaces").json()["roots"]
        assert client.get("/projects").json()["projects"][0]["path"] == folder


def test_rename_and_mark_opened(tmp_path):
    folder = create_sample_project(tmp_path / "rename")
    with open_local_client(tmp_path) as client:
        project = add_project(client, folder)
        response = client.patch(
            f"/projects/{project['id']}", json={"name": "Renamed", "opened": True}
        )
        assert response.status_code == 200
        updated = response.json()["project"]
        assert updated["name"] == "Renamed"
        assert updated["last_opened_at"] >= project["last_opened_at"]
        empty = client.patch(f"/projects/{project['id']}", json={"name": "   "})
        assert empty.status_code == 422 and empty.json()["code"] == "invalid_name"
        missing = client.patch("/projects/prj-nope", json={"name": "x"})
        assert missing.status_code == 404 and missing.json()["code"] == "project_not_found"


def test_forget_never_deletes_files_and_withdraws_access(tmp_path):
    folder = create_sample_project(tmp_path / "forget")
    with open_local_client(tmp_path) as client:
        project = add_project(client, folder)
        response = client.delete(f"/projects/{project['id']}")
        assert response.status_code == 200
        assert response.json()["files_deleted"] is False
        assert os.path.isfile(os.path.join(folder, "package.json"))
        assert os.path.isfile(os.path.join(folder, "src", "app.ts"))
        assert folder not in client.get("/workspaces").json()["roots"]
        assert folder not in client.app.state.exec_service.auth.list_roots()
        assert client.delete(f"/projects/{project['id']}").status_code == 404


def test_forget_keeps_roots_from_owl_workspaces(tmp_path):
    folder = create_sample_project(tmp_path / "envroot")
    with open_local_client(tmp_path, workspaces=folder) as client:
        project = add_project(client, folder)
        client.delete(f"/projects/{project['id']}")
        assert folder in client.get("/workspaces").json()["roots"]


@pytest.mark.parametrize(
    "path_factory, code",
    [
        (lambda tmp: "/", "protected_location"),
        (lambda tmp: os.path.expanduser("~"), "protected_location"),
        (lambda tmp: os.path.dirname(os.path.expanduser("~")), "protected_location"),
        (lambda tmp: "/etc", "protected_location"),
        (lambda tmp: "/usr/lib", "protected_location"),
        (lambda tmp: "/tmp", "protected_location"),
        (lambda tmp: os.path.join(os.path.expanduser("~"), ".ssh"), None),
        (lambda tmp: "relative/folder", "invalid_path"),
        (lambda tmp: str(tmp / "missing"), "folder_not_found"),
        (lambda tmp: str(tmp / "proj" / "package.json"), "not_a_directory"),
    ],
)
def test_protected_and_invalid_locations_are_refused(tmp_path, path_factory, code):
    create_sample_project(tmp_path / "proj")
    path = path_factory(tmp_path)
    with open_local_client(tmp_path) as client:
        response = client.post("/projects", json={"path": path})
        assert response.status_code in (403, 404, 422), path
        if code:
            assert response.json()["code"] == code
        assert client.get("/projects").json()["projects"] == []


def test_credential_folders_and_data_dir_are_refused(tmp_path, monkeypatch):
    home = tmp_path / "home"
    for name in (".ssh", ".aws/sso", ".config/gh", "code/app"):
        os.makedirs(home / name)
    monkeypatch.setenv("HOME", str(home))
    for name in (".ssh", ".aws/sso", ".config/gh"):
        with pytest.raises(ProjectError) as caught:
            validate_project_folder(str(home / name), "")
        assert caught.value.code == "protected_location"
    assert validate_project_folder(str(home / "code" / "app"), "") == str(home / "code" / "app")
    data_root = tmp_path / "data-root"
    os.makedirs(data_root / "inner")
    with pytest.raises(ProjectError):
        validate_project_folder(str(data_root / "inner"), str(data_root))
    with pytest.raises(ProjectError):
        validate_project_folder(str(tmp_path), str(data_root))


def test_symlink_to_protected_folder_is_refused(tmp_path):
    link = tmp_path / "sneaky"
    os.symlink("/etc", link)
    with open_local_client(tmp_path) as client:
        response = client.post("/projects", json={"path": str(link)})
        assert response.status_code == 403


def test_project_routes_need_the_service_token(tmp_path):
    with open_local_client(tmp_path) as client:
        assert client.get("/projects", headers={"Authorization": ""}).status_code == 401
        no_json = client.post("/projects", content=b"{}", headers={"Content-Type": "text/plain"})
        assert no_json.status_code == 415
