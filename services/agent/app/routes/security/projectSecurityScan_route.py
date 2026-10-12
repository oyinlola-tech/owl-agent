from __future__ import annotations

from fastapi import APIRouter, FastAPI, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ...projects.projectLocation_project import ProjectError
from ...securityscans.findingStore_securityscan import (
    FINDING_STATUSES,
    SEVERITY_ORDER,
    SecurityScanStore,
)
from ...securityscans.scanRunner_securityscan import run_project_scan
from ..projects.projectList_route import read_project_store, send_project_error

SCANNER_NAMES = ("bandit", "semgrep", "pip-audit", "npm-audit", "cargo-audit", "gitleaks")


class SecurityScanRequest(BaseModel):
    tools: list[str] | None = Field(default=None, max_length=20)


class FindingStatusUpdate(BaseModel):
    status: str = Field(min_length=1, max_length=40)


def attach_security_scan_store(app: FastAPI) -> SecurityScanStore:
    store = getattr(app.state, "security_scans", None)
    if store is None:
        store = SecurityScanStore(app.state.manager.conn)
        app.state.security_scans = store
    return store


def read_security_scan_store(request: Request) -> SecurityScanStore:
    return attach_security_scan_store(request.app)


def create_project_security_router(app: FastAPI) -> APIRouter:
    attach_security_scan_store(app)
    router = APIRouter()

    @router.post("/projects/{project_id}/security/scan")
    async def scan_project(  # type: ignore[no-untyped-def]
        project_id: str, payload: SecurityScanRequest, request: Request
    ):
        projects = read_project_store(request)
        security = read_security_scan_store(request)
        try:
            project = projects.get_project(project_id)
        except ProjectError as exc:
            return send_project_error(exc)
        selected = payload.tools
        if selected is not None:
            selected = [t for t in selected if t in SCANNER_NAMES]
        summary = await run_project_scan(
            security.conn,
            request.app.state.exec_service,
            security,
            project,
            selected_tools=selected,
        )
        return {"scan": summary}

    @router.get("/projects/{project_id}/security/scans")
    async def list_project_scans(  # type: ignore[no-untyped-def]
        project_id: str, request: Request, limit: int = Query(default=50, ge=1, le=200)
    ):
        security = read_security_scan_store(request)
        return {"scans": security.list_scans(project_id, limit)}

    @router.get("/projects/{project_id}/security/findings")
    async def list_project_findings(  # type: ignore[no-untyped-def]
        project_id: str,
        request: Request,
        severity: str = Query(default=""),
        status: str = Query(default=""),
        tool: str = Query(default=""),
    ):
        if severity and severity not in SEVERITY_ORDER:
            return JSONResponse(
                status_code=422, content={"detail": "unknown severity", "code": "invalid_severity"}
            )
        if status and status not in FINDING_STATUSES:
            return JSONResponse(
                status_code=422, content={"detail": "unknown status", "code": "invalid_status"}
            )
        security = read_security_scan_store(request)
        return {
            "findings": security.list_findings(
                project_id, severity=severity, status=status, tool=tool
            )
        }

    @router.patch("/projects/{project_id}/security/findings/{finding_id}")
    async def update_finding(  # type: ignore[no-untyped-def]
        project_id: str, finding_id: str, payload: FindingStatusUpdate, request: Request
    ):
        if payload.status not in FINDING_STATUSES:
            return JSONResponse(
                status_code=422,
                content={
                    "detail": f"status must be one of {', '.join(FINDING_STATUSES)}",
                    "code": "invalid_status",
                },
            )
        security = read_security_scan_store(request)
        updated = security.update_finding_status(project_id, finding_id, payload.status)
        if updated is None:
            return JSONResponse(
                status_code=404,
                content={"detail": "no finding with that id", "code": "finding_not_found"},
            )
        return {"finding": updated}

    return router
