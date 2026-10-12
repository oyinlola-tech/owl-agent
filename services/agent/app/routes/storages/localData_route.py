from __future__ import annotations

import os

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from ...databases.databaseBackup_database import DatabaseBackupError, list_database_backups
from ...storages.dataArchive_storage import (
    DataArchiveError,
    export_local_data,
    import_local_data,
    write_base64_archive,
)
from ...storages.dataMaintenance_storage import (
    RESET_CONFIRMATION_PHRASE,
    create_backup_now,
    describe_backup_for_client,
    read_data_status,
    reset_local_data,
)


class DataImport(BaseModel):
    path: str = Field(default="", max_length=4096)
    archive_base64: str = Field(default="")


class DataReset(BaseModel):
    confirmation: str = Field(default="", max_length=100)


def send_data_error(status: int, code: str, detail: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"detail": detail, "code": code})


def are_tasks_running(request: Request) -> bool:
    workers = request.app.state.manager.running_workers
    return any(not worker.done() for worker in workers.values())


def resync_project_access(request: Request) -> None:
    store = getattr(request.app.state, "projects", None)
    if store is not None:
        store.sync_authorized_project_roots()


def create_local_data_router() -> APIRouter:
    router = APIRouter()

    @router.get("/data/status")
    async def read_status(request: Request):  # type: ignore[no-untyped-def]
        return read_data_status(request.app.state.local_storage)

    @router.post("/data/backup")
    async def back_up_now(request: Request):  # type: ignore[no-untyped-def]
        storage = request.app.state.local_storage
        if storage.in_memory:
            return send_data_error(409, "in_memory", "an in-memory database can't be backed up")
        try:
            backup = create_backup_now(storage)
        except DatabaseBackupError as exc:
            return send_data_error(500, "backup_failed", str(exc))
        backups = list_database_backups(storage.layout.backups_dir)
        return {
            "backup": describe_backup_for_client(backup),
            "backups": [describe_backup_for_client(b) for b in backups],
        }

    @router.get("/data/export")
    async def export_data(request: Request):  # type: ignore[no-untyped-def]
        exported = export_local_data(request.app.state.local_storage)
        return FileResponse(
            exported["path"],
            media_type="application/zip",
            filename=exported["name"],
            headers={"Cache-Control": "no-store"},
        )

    @router.post("/data/import")
    async def import_data(payload: DataImport, request: Request):  # type: ignore[no-untyped-def]
        storage = request.app.state.local_storage
        if bool(payload.path) == bool(payload.archive_base64):
            return send_data_error(422, "validation", "send either path or archive_base64")
        if are_tasks_running(request):
            return send_data_error(409, "tasks_running", "stop running tasks before importing")
        uploaded = ""
        try:
            if payload.archive_base64:
                uploaded = write_base64_archive(storage, payload.archive_base64)
            archive = uploaded or os.path.abspath(os.path.expanduser(payload.path))
            result = import_local_data(storage, archive)
        except DataArchiveError as exc:
            return send_data_error(422, exc.code, exc.detail)
        except DatabaseBackupError as exc:
            return send_data_error(500, "backup_failed", str(exc))
        finally:
            if uploaded and os.path.exists(uploaded):
                os.remove(uploaded)
        resync_project_access(request)
        result["backup"] = describe_backup_for_client(result["backup"])
        return result

    @router.post("/data/reset")
    async def reset_data(payload: DataReset, request: Request):  # type: ignore[no-untyped-def]
        if payload.confirmation != RESET_CONFIRMATION_PHRASE:
            return send_data_error(
                422, "confirmation_mismatch", f"type {RESET_CONFIRMATION_PHRASE} to confirm"
            )
        if are_tasks_running(request):
            return send_data_error(409, "tasks_running", "stop running tasks before resetting")
        try:
            result = reset_local_data(request.app.state.local_storage)
        except DatabaseBackupError as exc:
            return send_data_error(500, "backup_failed", str(exc))
        resync_project_access(request)
        return result

    return router
