from __future__ import annotations

import logging
import os
import re

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import FileResponse

from ..executors.browserExecutor_executor import BrowserError, BrowserPageInspector
from ..schemas.service_schema import BrowserCapture
from .providers.providerErrorResponse_route import build_error_response

log = logging.getLogger("owl")


def create_browser_capture_router(app: FastAPI) -> APIRouter:
    router = APIRouter()

    @router.post("/browser/capture")
    async def browser_capture(payload: BrowserCapture, request: Request):  # type: ignore[no-untyped-def]
        service: BrowserPageInspector | None = request.app.state.browser
        if service is None:
            return build_error_response(503, "browser service unavailable", "unavailable")
        try:
            return await service.inspect_page(payload.url, payload.width, payload.shot)
        except BrowserError as exc:
            return build_error_response(422, str(exc), "validation")
        except Exception as exc:  # noqa: BLE001 - browser backends fail in varied ways
            log.warning("browser capture failed: %s", type(exc).__name__)
            return build_error_response(502, "browser capture failed", "unavailable")

    @router.get("/shots/{name}")
    async def get_shot(name: str):  # type: ignore[no-untyped-def]
        # Security: only files named like OWL's own screenshots are served, so the name can
        # never point outside the screenshot folder.
        if not re.fullmatch(r"shot-\d+\.png", name):
            return build_error_response(404, "unknown shot", "not_found")
        return FileResponse(os.path.join(app.state.shots_dir, name), media_type="image/png")

    return router
