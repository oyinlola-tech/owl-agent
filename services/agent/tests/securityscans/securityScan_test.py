import asyncio
import os

import pytest
from supports.authorizedClient_support import open_authorized_client

from app import create_app
from app.securityscans.scannerCatalog_securityscan import build_scanner_catalog
from app.settings.serviceSettings_setting import Settings
from app.tools.handlers.security.securityScan_handler import run_security_scan
from app.tools.toolArgument_tool import SecurityScanArguments
from app.tools.toolRegistry_tool import REGISTERED_TOOLS

LEAKED_TOKEN = "ghp_012345678901234567890123456789abcdef"
ALL_SCANNERS = ("bandit", "semgrep", "pip-audit", "npm-audit", "cargo-audit", "gitleaks")


def installed_scanners() -> set[str]:
    return {spec.name for spec in build_scanner_catalog() if spec.is_installed()}


def write_file(folder: str, relative: str, text: str) -> None:
    path = os.path.join(folder, relative)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)


def build_vulnerable_project(folder: str) -> str:
    write_file(folder, "src/config.py", f'GITHUB_TOKEN = "{LEAKED_TOKEN}"\n')
    write_file(
        folder,
        "src/runner.py",
        "import subprocess\n\n\ndef run(cmd):\n    return subprocess.Popen(cmd, shell=True)\n",
    )
    write_file(folder, "README.md", "# fixture\n")
    return os.path.realpath(folder)


@pytest.fixture()
def scanned(tmp_path):
    folder = build_vulnerable_project(str(tmp_path / "proj"))
    settings = Settings(
        _env_file=None,
        nvidia_api_key="",
        provider="mock",
        db_path=str(tmp_path / "owl-data" / "owl.db"),
        exec_timeout=90.0,
    )
    with open_authorized_client(create_app(settings)) as client:
        project = client.post("/projects", json={"path": folder}).json()["project"]
        yield client, project["id"], folder


def post_scan(client, project_id: str, tools=None) -> dict:
    body = {} if tools is None else {"tools": tools}
    response = client.post(f"/projects/{project_id}/security/scan", json=body)
    assert response.status_code == 200, response.text
    return response.json()["scan"]


def test_scan_reports_a_finding_when_a_scanner_is_available(scanned):
    client, project_id, _ = scanned
    scan = post_scan(client, project_id)
    available = installed_scanners()
    assert set(scan["tools_run"]) <= available
    findings = client.get(f"/projects/{project_id}/security/findings").json()["findings"]
    if "gitleaks" in available:
        assert "gitleaks" in scan["tools_run"]
        secrets = [f for f in findings if f["tool"] == "gitleaks"]
        assert secrets and secrets[0]["severity"] == "high"
        assert scan["counts_by_severity"]["high"] >= 1
    if "bandit" in available:
        assert "bandit" in scan["tools_run"]
        assert any(f["tool"] == "bandit" for f in findings)
    if not available:
        assert scan["tools_run"] == []


def test_missing_scanners_are_skipped_never_failing_the_scan(scanned):
    client, project_id, _ = scanned
    scan = post_scan(client, project_id)
    available = installed_scanners()
    skipped = {entry["tool"]: entry["reason"] for entry in scan["tools_skipped"]}
    for name in ALL_SCANNERS:
        if name not in available:
            assert name in skipped
            assert "not installed" in skipped[name]
    assert scan["status"] == "completed"


def test_finding_status_transitions_and_validation(scanned):
    client, project_id, _ = scanned
    post_scan(client, project_id)
    findings = client.get(f"/projects/{project_id}/security/findings").json()["findings"]
    if not findings:
        pytest.skip("no scanner available in this environment produced a finding")
    finding_id = findings[0]["id"]
    for status in ("confirmed", "false_positive", "accepted_risk", "fixed", "open"):
        response = client.patch(
            f"/projects/{project_id}/security/findings/{finding_id}", json={"status": status}
        )
        assert response.status_code == 200
        assert response.json()["finding"]["status"] == status
    bad = client.patch(
        f"/projects/{project_id}/security/findings/{finding_id}", json={"status": "nope"}
    )
    assert bad.status_code == 422 and bad.json()["code"] == "invalid_status"
    missing = client.patch(
        f"/projects/{project_id}/security/findings/missing-id", json={"status": "open"}
    )
    assert missing.status_code == 404


def test_set_status_survives_a_rescan(scanned):
    client, project_id, _ = scanned
    post_scan(client, project_id)
    findings = client.get(f"/projects/{project_id}/security/findings").json()["findings"]
    if not findings:
        pytest.skip("no finding to track across rescans")
    finding_id = findings[0]["id"]
    client.patch(
        f"/projects/{project_id}/security/findings/{finding_id}",
        json={"status": "false_positive"},
    )
    post_scan(client, project_id)
    after = client.get(f"/projects/{project_id}/security/findings").json()["findings"]
    kept = [f for f in after if f["id"] == finding_id]
    assert kept and kept[0]["status"] == "false_positive"


def test_filters_reject_unknown_values(scanned):
    client, project_id, _ = scanned
    assert client.get(f"/projects/{project_id}/security/findings?severity=nope").status_code == 422
    assert client.get(f"/projects/{project_id}/security/findings?status=nope").status_code == 422


def test_secret_value_is_never_stored_verbatim(scanned):
    client, project_id, _ = scanned
    post_scan(client, project_id)
    findings = client.get(f"/projects/{project_id}/security/findings").json()["findings"]
    for finding in findings:
        for field in ("title", "message", "file"):
            assert LEAKED_TOKEN not in finding[field]


def test_scanner_output_is_parsed_as_data_not_executed(scanned, tmp_path):
    client, project_id, folder = scanned
    marker = str(tmp_path / "pwned.txt")
    payload = f'os.system("touch {marker}")  # token: {LEAKED_TOKEN}\n'
    write_file(folder, "src/payload.py", payload)
    post_scan(client, project_id)
    assert not os.path.exists(marker)


def test_scan_leaves_no_report_files_in_the_project(scanned):
    client, project_id, folder = scanned
    post_scan(client, project_id)
    assert [name for name in os.listdir(folder) if name.startswith(".owl-scan")] == []


def test_security_scan_tool_is_read_only_and_returns_findings(scanned):
    client, project_id, folder = scanned
    tool = REGISTERED_TOOLS["security_scan"]
    assert tool.requires_approval is False
    app = client.app
    ctx = {
        "auth": app.state.auth,
        "conn": app.state.manager.conn,
        "exec": app.state.exec_service,
        "task_id": "tool-test",
        "approval": {},
    }
    result = asyncio.run(run_security_scan(ctx, SecurityScanArguments(path=folder)))
    assert "scan_id" in result and "counts_by_severity" in result
    assert set(result["tools_run"]) <= installed_scanners()
    for finding in result["findings"]:
        assert LEAKED_TOKEN not in finding["message"]
