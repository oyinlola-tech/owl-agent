from __future__ import annotations

import hmac
import urllib.parse

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from ..schemas.service_schema import ErrorBody
from ..settings.serviceToken_setting import ServiceTokens

LOOPBACK_HOST_NAMES = {"127.0.0.1", "localhost", "[::1]", "::1"}
MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
OPEN_PATHS = {("GET", "/health")}
EVENT_STREAM_PREFIX = "/tasks/"
EVENT_STREAM_SUFFIX = "/events"


def split_host_header(value: str) -> tuple[str, int | None]:
    value = value.strip().lower()
    if value.startswith("["):
        host, _, rest = value.partition("]")
        host += "]"
        port_text = rest[1:] if rest.startswith(":") else ""
    else:
        host, _, port_text = value.partition(":")
    try:
        return host, int(port_text) if port_text else None
    except ValueError:
        return host, -1


def is_event_stream_path(path: str) -> bool:
    return path.startswith(EVENT_STREAM_PREFIX) and path.endswith(EVENT_STREAM_SUFFIX)


def send_error(status: int, detail: str, code: str):  # type: ignore[no-untyped-def]
    headers = {"WWW-Authenticate": "Bearer"} if status == 401 else None
    return JSONResponse(
        status_code=status,
        content=ErrorBody(detail=detail, code=code).model_dump(),
        headers=headers,
    )


class LocalServiceAuthMiddleware:
    # Security: the service listens on localhost, but any website open in a browser and any
    # local process can reach localhost. Every request must carry the per-install token, use
    # a loopback Host (blocks DNS rebinding), and send JSON when it changes state.

    def __init__(self, app: FastAPI, tokens: ServiceTokens, extra_hosts: str = "") -> None:
        self.app = app
        self.tokens = tokens
        self.allowed_hosts = LOOPBACK_HOST_NAMES | {
            h.strip().lower() for h in extra_hosts.split(",") if h.strip()
        }

    def is_host_allowed(self, scope) -> bool:  # type: ignore[no-untyped-def]
        headers = dict(scope.get("headers", []))
        host, port = split_host_header(headers.get(b"host", b"").decode("latin1"))
        if host not in self.allowed_hosts:
            return False
        server = scope.get("server") or (None, None)
        bound_port = server[1] if len(server) > 1 else None
        if port is None:
            port = 443 if scope.get("scheme") == "https" else 80
        return bound_port is None or port == bound_port

    def is_token_valid(self, scope) -> bool:  # type: ignore[no-untyped-def]
        headers = dict(scope.get("headers", []))
        presented = ""
        auth = headers.get(b"authorization", b"").decode("latin1")
        scheme, _, value = auth.partition(" ")
        if scheme.lower() == "bearer":
            presented = value.strip()
        if not presented and scope["method"] == "GET" and is_event_stream_path(scope["path"]):
            # Security: EventSource can't set headers, so only the event stream accepts ?token=.
            query = urllib.parse.parse_qs(scope.get("query_string", b"").decode("latin1"))
            presented = (query.get("token") or [""])[0]
        if not presented:
            return False
        matched = False
        for accepted in self.tokens.list_accepted_tokens():
            matched |= hmac.compare_digest(presented.encode(), accepted.encode())
        return matched

    async def __call__(self, scope, receive, send):  # type: ignore[no-untyped-def]
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        method = scope["method"]
        if (method, scope["path"]) in OPEN_PATHS or method == "OPTIONS":
            await self.app(scope, receive, send)
            return
        if not self.is_host_allowed(scope):
            await send_error(421, "unexpected Host header", "bad_host")(scope, receive, send)
            return
        if not self.is_token_valid(scope):
            await send_error(401, "missing or invalid service token", "unauthorized")(
                scope, receive, send
            )
            return
        if method in MUTATING_METHODS:
            headers = dict(scope.get("headers", []))
            ctype = headers.get(b"content-type", b"").decode("latin1").split(";")[0].strip()
            if ctype.lower() != "application/json":
                await send_error(415, "Content-Type must be application/json", "media_type")(
                    scope, receive, send
                )
                return
        await self.app(scope, receive, send)
