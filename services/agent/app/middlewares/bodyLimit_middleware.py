from __future__ import annotations

import asyncio

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from ..schemas.service_schema import ErrorBody


class BodyLimitMiddleware:
    def __init__(self, app: FastAPI, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):  # type: ignore[no-untyped-def]
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        body = b""
        while True:
            message = await receive()
            if message["type"] != "http.request":
                await self.app(scope, receive, send)
                return
            body += message.get("body", b"")
            if len(body) > self.max_bytes:
                response = JSONResponse(
                    status_code=413,
                    content=ErrorBody(
                        detail="request body too large", code="too_large"
                    ).model_dump(),
                )
                await response(scope, receive, send)
                return
            if not message.get("more_body"):
                break

        sent = False

        async def replay_buffered_body():  # type: ignore[no-untyped-def]
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": body, "more_body": False}
            await asyncio.sleep(3600)
            return {"type": "http.disconnect"}

        await self.app(scope, replay_buffered_body, send)
