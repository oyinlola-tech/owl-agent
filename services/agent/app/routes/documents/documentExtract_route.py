from __future__ import annotations

import os

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from ...documents.documentExtraction_document import extract_document
from ...documents.documentResult_document import DocumentError
from ...projects.projectFile_project import resolve_project_path, to_project_relative
from ...projects.projectLocation_project import ProjectError
from ..projects.projectList_route import read_project_store, send_project_error

DOCUMENT_ERROR_STATUS = {"file_too_large": 413, "unsupported_type": 422, "parse_failed": 422}


def send_document_error(exc: DocumentError) -> JSONResponse:
    status = DOCUMENT_ERROR_STATUS.get(exc.code, 422)
    return JSONResponse(status_code=status, content={"detail": exc.detail, "code": exc.code})


def create_project_document_router() -> APIRouter:
    router = APIRouter()

    @router.get("/projects/{project_id}/document")
    async def read_document(  # type: ignore[no-untyped-def]
        project_id: str, request: Request, path: str = Query(min_length=1, max_length=4096)
    ):
        try:
            project = read_project_store(request).get_project(project_id)
            # Security: the path resolves through the workspace guard (traversal, symlink escape,
            # sensitive files) and must stay inside this project before any bytes are read.
            canonical = resolve_project_path(request.app.state.auth, project["path"], path)
            if not os.path.exists(canonical):
                raise ProjectError(404, "path_not_found", "that file doesn't exist")
            if not os.path.isfile(canonical):
                raise ProjectError(422, "not_a_file", "that path is a folder")
            extracted = extract_document(canonical)
        except ProjectError as exc:
            return send_project_error(exc)
        except DocumentError as exc:
            return send_document_error(exc)
        return {
            "path": to_project_relative(project["path"], canonical),
            "type": extracted["type"],
            "text": extracted["text"],
            "structure": extracted["structure"],
            "truncated": extracted["truncated"],
            "redacted": extracted["redacted"],
            "bytes": extracted["bytes"],
            "sha256": extracted["sha256"],
            "untrusted": True,
        }

    return router
