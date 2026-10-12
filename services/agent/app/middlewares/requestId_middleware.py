from __future__ import annotations

import logging
import uuid

from fastapi import FastAPI

log = logging.getLogger("owl")


class RequestIDMiddleware:
    def __init__(self, app: FastAPI) -> None:
        self.app = app

    async def __call__(self, scope, receive, send):  # type: ignore[no-untyped-def]
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get("headers", []))
        raw = headers.get(b"x-request-id", b"").decode("latin1") or uuid.uuid4().hex[:12]
        log.info("%s %s rid=%s", scope["method"], scope["path"], raw)

        async def send_with_request_id(message):  # type: ignore[no-untyped-def]
            if message["type"] == "http.response.start":
                message.setdefault("headers", []).append((b"x-request-id", raw.encode("latin1")))
            await send(message)

        await self.app(scope, receive, send_with_request_id)
