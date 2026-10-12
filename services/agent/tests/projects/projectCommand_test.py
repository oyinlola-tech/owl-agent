import asyncio
import os

import pytest
from supports.projectClient_support import (
    add_project,
    create_sample_project,
    open_local_client,
    read_sse_events,
    write_text_file,
)

from app.projects.userCommand_project import prepare_user_command, stream_user_command


@pytest.fixture()
def opened(tmp_path):
    folder = create_sample_project(tmp_path / "cmd")
    with open_local_client(tmp_path, exec_timeout=5.0) as client:
        yield client, add_project(client, folder), folder


def run_command(client, project_id: str, **payload):
    return client.post(f"/projects/{project_id}/commands", json=payload)


def test_command_output_streams_as_sse_and_is_kept_in_history(opened):
    client, project, _ = opened
    response = run_command(client, project["id"], command="ls 'src'")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    events = read_sse_events(response.text)
    names = [name for name, _ in events]
    assert names[0] == "command.started" and names[-1] == "command.completed"
    started = events[0][1]
    assert started["argv"] == ["ls", "src"] and started["interactive"] is False
    output = "".join(d["text"] for n, d in events if n == "command.output")
    assert "app.ts" in output
    assert events[-1][1]["exit_code"] == 0 and events[-1][1]["status"] == "completed"
    history = client.get(f"/projects/{project['id']}/commands").json()["commands"]
    assert history[0]["status"] == "completed" and "app.ts" in history[0]["stdout"]
    assert history[0]["argv"] == ["ls", "src"]


def test_failing_command_reports_exit_code_and_stderr(opened):
    client, project, _ = opened
    events = read_sse_events(run_command(client, project["id"], command="ls missing-dir").text)
    assert events[-1][0] == "command.completed"
    assert events[-1][1]["status"] == "failed" and events[-1][1]["exit_code"] != 0
    assert any(d.get("stream") == "stderr" for n, d in events if n == "command.output")


def test_refused_commands_stay_refused_even_with_confirmation(opened):
    client, project, _ = opened
    for command in ("sudo ls", "/usr/bin/sudo ls", "env sudo ls", "sh -c 'sudo id'"):
        response = run_command(client, project["id"], command=command, confirm_high_risk=True)
        assert response.status_code == 403, command
        assert response.json()["code"] == "command_refused"
    history = client.get(f"/projects/{project['id']}/commands").json()["commands"]
    assert {h["status"] for h in history} == {"refused"}


def test_high_risk_commands_need_confirmation(opened):
    client, project, folder = opened
    write_text_file(os.path.join(folder, "junk", "a.txt"), "x")
    response = run_command(client, project["id"], command="rm -rf junk")
    assert response.status_code == 409
    assert response.json()["code"] == "confirmation_required"
    assert response.json()["risk"] == "high"
    assert os.path.isdir(os.path.join(folder, "junk"))
    confirmed = run_command(client, project["id"], command="rm -rf junk", confirm_high_risk=True)
    assert read_sse_events(confirmed.text)[-1][1]["exit_code"] == 0
    assert not os.path.exists(os.path.join(folder, "junk"))


def test_network_commands_need_their_own_confirmation(opened):
    client, project, _ = opened
    response = run_command(client, project["id"], command="git fetch origin")
    assert response.status_code == 409
    assert response.json()["code"] == "network_confirmation_required"


def test_shell_syntax_and_bad_input_are_rejected(opened):
    client, project, _ = opened
    for command, code in (
        ("ls | grep x", "shell_syntax_unsupported"),
        ("ls && rm -rf /", "shell_syntax_unsupported"),
        ("echo hi > out.txt", "shell_syntax_unsupported"),
        ("echo 'unterminated", "invalid_command"),
        ("definitely-not-a-real-program-owl", "executable_not_found"),
    ):
        response = run_command(client, project["id"], command=command)
        assert response.status_code == 422, command
        assert response.json()["code"] == code, command


def test_working_folder_must_stay_inside_the_project(opened):
    client, project, _ = opened
    escaped = run_command(client, project["id"], command="ls", cwd="../..")
    assert escaped.status_code == 403 and escaped.json()["code"] == "path_outside_project"
    inside = run_command(client, project["id"], command="ls", cwd="src")
    assert read_sse_events(inside.text)[0][1]["cwd"] == "src"


def test_commands_run_with_a_scrubbed_environment(opened, monkeypatch):
    client, project, _ = opened
    monkeypatch.setenv("OWL_TEST_SECRET_TOKEN", "should-never-leak-123456")
    events = read_sse_events(run_command(client, project["id"], command="env").text)
    output = "".join(d["text"] for n, d in events if n == "command.output")
    assert "should-never-leak-123456" not in output


def test_long_running_command_times_out_and_is_killed(tmp_path):
    folder = create_sample_project(tmp_path / "slow")
    with open_local_client(tmp_path, exec_timeout=1.0) as client:
        project = add_project(client, folder)
        events = read_sse_events(run_command(client, project["id"], command="sleep 30").text)
        assert events[-1][0] == "command.error"
        assert events[-1][1]["code"] == "timed_out"
        history = client.get(f"/projects/{project['id']}/commands").json()["commands"]
        assert history[0]["status"] == "timed_out"
        assert client.app.state.exec_service.list_running_command_keys() == []


def test_closing_the_stream_kills_the_command_and_records_it(opened):
    client, project, _ = opened
    store = client.app.state.projects
    executor = client.app.state.exec_service

    async def start_then_disconnect() -> None:
        prepared = prepare_user_command(store.conn, executor, project, "sleep 30")
        stream = stream_user_command(store.conn, executor, prepared)
        assert (await anext(stream)).startswith("event: command.started")
        pending = asyncio.ensure_future(anext(stream))
        await asyncio.sleep(0.3)
        assert executor.list_running_command_keys()
        pending.cancel()
        with pytest.raises(asyncio.CancelledError):
            await pending
        await stream.aclose()

    asyncio.run(start_then_disconnect())
    assert executor.list_running_command_keys() == []
    history = client.get(f"/projects/{project['id']}/commands").json()["commands"]
    assert history[0]["status"] == "cancelled"
