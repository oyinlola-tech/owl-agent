from __future__ import annotations

import platform

from fastapi import APIRouter, Request


def create_security_status_router() -> APIRouter:
    router = APIRouter()

    @router.get("/security/status")
    async def read_security_status(request: Request):  # type: ignore[no-untyped-def]
        sandbox = request.app.state.sandbox
        tokens = request.app.state.service_tokens
        return {
            "platform": platform.system(),
            "sandbox": sandbox.describe_status(),
            "service_token": {
                "required": True,
                "source": tokens.source,
                "dev_token_accepted": bool(tokens.dev_token),
                "token_file_written": bool(tokens.token_file),
                "host_check": "loopback only",
                "json_required_for_changes": True,
            },
            "browser": {
                "blocked": (
                    [] if request.app.state.settings.browser_allow_loopback else ["loopback"]
                )
                + [
                    "private networks",
                    "link-local",
                    "cloud metadata",
                    "multicast",
                    "unspecified",
                ],
                "schemes": ["http", "https"],
            },
        }

    return router
