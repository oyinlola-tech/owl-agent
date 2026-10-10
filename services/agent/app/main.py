"""OWL Agent service. Frontend talks HTTP/SSE here; no tool executes in Phase 2."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from .approvals import DefaultApprovalPolicy
from .browser_tools import BrowserService
from .config import Settings, get_settings
from .context import BudgetManager, ContextPart, count_tokens
from .db import conn_path, connect
from .events import EventBus
from .exec import ExecService
from .memory import SqliteMemoryStore
from .models import (
    ApprovalRequest,
    BudgetRequest,
    ChatReply,
    ChatRequest,
    DecisionCreate,
    ErrorBody,
    HealthRead,
    MemoryCreate,
    MemoryUpdate,
    MessageCreate,
    ModelEntry,
    ProviderRead,
    RouteRead,
    RouteRequest,
    TaskCreate,
    VerifyRead,
)
from .providers import (
    InvalidCredentialsError,
    ModelNotAvailableError,
    Provider,
    ProviderError,
    ProviderNetworkError,
    ProviderNotConfiguredError,
    ProviderResponseError,
    ProviderTimeoutError,
    QuotaExceededError,
    RateLimitedError,
    build_provider,
)
from .registry import ModelRegistry
from .routing import Router, RoutingError, classify
from .tasks import TaskManager
from .usage import UsageRecorder
from .workspaces import WorkspaceAuth

log = logging.getLogger("owl")


def sse_event(event: str, payload_obj: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload_obj)}\n\n"


class BodyLimitMiddleware:
    """Pure ASGI: pre-reads the body (bounded) so streaming responses pass through."""

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

        async def replay():  # type: ignore[no-untyped-def]
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": body, "more_body": False}
            await asyncio.sleep(3600)
            return {"type": "http.disconnect"}

        await self.app(scope, replay, send)


class RequestIDMiddleware:
    """Pure ASGI: logs and tags the request id without touching the body."""

    def __init__(self, app: FastAPI) -> None:
        self.app = app

    async def __call__(self, scope, receive, send):  # type: ignore[no-untyped-def]
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get("headers", []))
        raw = headers.get(b"x-request-id", b"").decode("latin1") or uuid.uuid4().hex[:12]
        log.info("%s %s rid=%s", scope["method"], scope["path"], raw)

        async def send_with_id(message):  # type: ignore[no-untyped-def]
            if message["type"] == "http.response.start":
                message.setdefault("headers", []).append((b"x-request-id", raw.encode("latin1")))
            await send(message)

        await self.app(scope, receive, send_with_id)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=settings.log_level.upper(), format="%(levelname)s owl %(message)s")
    conn = connect(settings.db_path or None)
    bus = EventBus()
    provider: Provider = build_provider(settings)
    registry = ModelRegistry(conn)
    memory = SqliteMemoryStore(conn, retention_history=settings.memory_retention)
    usage = UsageRecorder(conn)
    default_model = (
        settings.router_default_model
        or settings.nvidia_model
        or provider.describe().get("model", "")
    )
    registry.upsert(str(default_model or "mock-1"), status="available", capabilities=["chat"])
    router = Router(
        registry,
        default_model=str(default_model or ""),
        allow_fallback=settings.router_allow_fallback,
        fallback_model=settings.router_fallback_model,
    )
    manager = TaskManager(
        conn,
        bus,
        provider,
        registry,
        memory,
        usage,
        step_delay=settings.step_delay,
        allow_fallback=settings.router_allow_fallback,
        fallback_model=settings.router_fallback_model,
        context_budget=settings.context_budget,
        context_reserve=settings.context_reserve,
        max_retries=settings.max_retries,
        max_iterations=settings.max_iterations,
        max_model_calls=settings.max_model_calls,
        max_elapsed=settings.max_elapsed,
        auth=WorkspaceAuth.from_config(settings.workspaces),
        exec_service=ExecService(
            WorkspaceAuth.from_config(settings.workspaces),
            timeout=settings.exec_timeout,
            output_limit=settings.exec_output_limit,
        ),
        browser=BrowserService(os.path.join(conn_path(conn), "shots")),
    )
    policy = DefaultApprovalPolicy()
    recovered = manager.recover()
    if recovered:
        log.info("recovered %d interrupted task(s) to paused", len(recovered))

    app = FastAPI(title="OWL Agent Service", version=settings.version)

    @asynccontextmanager
    async def lifespan(app: FastAPI):  # type: ignore[no-untyped-def]
        yield
        manager.closing = True

    app.router.lifespan_context = lifespan
    app.state.manager = manager
    app.state.provider = provider
    app.state.policy = policy
    app.state.settings = settings
    app.state.registry = registry
    app.state.memory = memory
    app.state.usage = usage
    app.state.router = router
    app.state.auth = manager._auth
    app.state.exec_service = manager._exec
    app.state.browser = manager._browser
    app.state.shots_dir = os.path.join(conn_path(conn), "shots")

    app.add_middleware(BodyLimitMiddleware, max_bytes=settings.max_body_bytes)
    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-Request-ID"],
        max_age=600,
    )

    # NOTE: request-id handling lives in RequestIDMiddleware (pure ASGI) so
    # streaming responses are never buffered. Do not add @app.middleware("http")
    # handlers: Starlette implements those on BaseHTTPMiddleware, which
    # consumes streamed bodies and deadlocks infinite SSE streams.

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError):  # type: ignore[no-untyped-def]
        return JSONResponse(
            status_code=422,
            content=ErrorBody(detail="invalid request payload", code="validation").model_dump(),
        )

    @app.get("/health", response_model=HealthRead)
    async def health() -> HealthRead:
        desc = provider.describe()
        return HealthRead(
            status="ok",
            version=settings.version,
            provider=str(desc["name"]),
            provider_configured=bool(desc["configured"]),
        )

    @app.get("/provider", response_model=ProviderRead)
    async def provider_info() -> ProviderRead:
        desc = provider.describe()
        return ProviderRead(
            name=str(desc["name"]),
            configured=bool(desc["configured"]),
            model=str(desc.get("model", "")),
        )

    def provider_error(status_code: int, exc: ProviderError) -> JSONResponse:
        code = "provider_error"
        if isinstance(exc, ProviderNotConfiguredError):
            code = "not_configured"
        elif isinstance(exc, InvalidCredentialsError):
            code = "invalid_credentials"
        elif isinstance(exc, QuotaExceededError):
            code = "quota_exceeded"
        elif isinstance(exc, ModelNotAvailableError):
            code = "model_unavailable"
        elif isinstance(exc, RateLimitedError):
            code = "rate_limited"
        elif isinstance(exc, ProviderTimeoutError):
            code = "provider_timeout"
        elif isinstance(exc, ProviderNetworkError):
            code = "network_error"
        elif isinstance(exc, ProviderResponseError):
            code = "bad_response"
        return JSONResponse(
            status_code=status_code,
            content=ErrorBody(detail=str(exc), code=code).model_dump(),
        )

    @app.post("/provider/verify", response_model=VerifyRead)
    async def verify_provider(request: Request) -> VerifyRead:
        active: Provider = request.app.state.provider
        desc = active.describe()
        name = str(desc["name"])
        model = str(desc.get("model", ""))
        if name == "mock":
            return VerifyRead(ok=True, provider=name, model=model)
        try:
            await active.list_models()
        except RateLimitedError as exc:
            return VerifyRead(
                ok=False, provider=name, model=model, error=str(exc), code="rate_limited"
            )
        except ProviderError as exc:
            return VerifyRead(
                ok=False, provider=name, model=model, error=str(exc), code="unavailable"
            )
        return VerifyRead(ok=True, provider=name, model=model)

    @app.get("/provider/models")
    async def list_provider_models(request: Request):  # type: ignore[no-untyped-def]
        active: Provider = request.app.state.provider
        try:
            return {"models": await active.list_models()}
        except RateLimitedError as exc:
            return provider_error(429, exc)
        except ProviderNotConfiguredError as exc:
            return provider_error(400, exc)
        except ProviderError as exc:
            return provider_error(502, exc)

    class _RoutingFailed(Exception):
        pass

    def _resolve_model(payload_model: str, prompt: str) -> tuple[str, str]:
        active_router: Router = app.state.router
        est, _ = count_tokens(prompt)
        try:
            return active_router.route(prompt, model=payload_model or "auto", estimated_tokens=est)
        except RoutingError as exc:
            raise _RoutingFailed(str(exc)) from exc

    def _record_chat_usage(
        model: str,
        requested: str,
        reason: str,
        prompt_text: str,
        reply_text: str,
        duration_ms: int,
        active: Provider,
        error: str = "",
    ) -> dict:
        recorder: UsageRecorder = app.state.usage
        pop = getattr(active, "pop_usage", None)
        actual = pop() if callable(pop) else None
        if actual:
            recorder.record(
                model=model,
                requested_model=requested,
                routing_reason=reason,
                input_tokens=actual["input"],
                output_tokens=actual["output"],
                estimated=actual["estimated"],
                duration_ms=duration_ms,
                error=error,
            )
            return {"input": actual["input"], "output": actual["output"], "estimated": False}
        est_in, _ = count_tokens(prompt_text)
        est_out, _ = count_tokens(reply_text)
        recorder.record(
            model=model,
            requested_model=requested,
            routing_reason=reason,
            input_tokens=est_in,
            output_tokens=est_out,
            estimated=True,
            duration_ms=duration_ms,
            error=error,
        )
        return {"input": est_in, "output": est_out, "estimated": True}

    @app.post("/chat", response_model=ChatReply)
    async def chat(payload: ChatRequest, request: Request):  # type: ignore[no-untyped-def]
        active: Provider = request.app.state.provider
        messages = [{"role": m.role.value, "content": m.content} for m in payload.messages]
        prompt_text = "\n".join(m["content"] for m in messages if m["role"] == "user")
        try:
            picked, reason = _resolve_model(payload.model, prompt_text)
        except _RoutingFailed as exc:
            return provider_error(503, ProviderError(str(exc)))
        start = time.monotonic()
        try:
            reply = await active.complete(messages, picked)
        except RateLimitedError as exc:
            _record_chat_usage(picked, payload.model, reason, prompt_text, "", 0, active, str(exc))
            return provider_error(429, exc)
        except ProviderNotConfiguredError as exc:
            return provider_error(400, exc)
        except ProviderError as exc:
            _record_chat_usage(picked, payload.model, reason, prompt_text, "", 0, active, str(exc))
            return provider_error(502, exc)
        duration = int((time.monotonic() - start) * 1000)
        usage = _record_chat_usage(
            picked, payload.model, reason, prompt_text, reply, duration, active
        )
        return ChatReply(reply=reply, model=picked, routing=reason, usage=usage)

    @app.post("/chat/stream")
    async def chat_stream(payload: ChatRequest, request: Request):  # type: ignore[no-untyped-def]
        active: Provider = request.app.state.provider
        messages = [{"role": m.role.value, "content": m.content} for m in payload.messages]
        prompt_text = "\n".join(m["content"] for m in messages if m["role"] == "user")
        try:
            picked, reason = _resolve_model(payload.model, prompt_text)
        except _RoutingFailed as exc:
            message = str(exc)

            async def _failed():  # type: ignore[no-untyped-def]
                yield sse_event("chat.error", {"code": "no_usable_model", "message": message})

            return StreamingResponse(_failed(), media_type="text/event-stream")
        model = picked
        start = time.monotonic()

        async def gen():  # type: ignore[no-untyped-def]
            try:
                chunks: list[str] = []
                async for delta in active.complete_stream(messages, model):
                    chunks.append(delta)
                    yield sse_event("chat.delta", {"text": delta})
                duration = int((time.monotonic() - start) * 1000)
                usage = _record_chat_usage(
                    model, payload.model, reason, prompt_text, "".join(chunks), duration, active
                )
                yield sse_event(
                    "chat.done",
                    {"text": "".join(chunks), "model": model, "routing": reason, "usage": usage},
                )
            except RateLimitedError as exc:
                yield sse_event("chat.error", {"code": "rate_limited", "message": str(exc)})
            except ProviderNotConfiguredError as exc:
                yield sse_event("chat.error", {"code": "not_configured", "message": str(exc)})
            except ProviderError as exc:
                yield sse_event("chat.error", {"code": "unavailable", "message": str(exc)})

        return StreamingResponse(gen(), media_type="text/event-stream")

    @app.post("/tasks", status_code=201)
    async def create_task(payload: TaskCreate):  # type: ignore[no-untyped-def]
        try:
            return await manager.create(payload, model=payload.model)
        except RoutingError as exc:
            return JSONResponse(
                status_code=503,
                content=ErrorBody(detail=str(exc), code="no_usable_model").model_dump(),
            )

    @app.get("/tasks")
    async def list_tasks():  # type: ignore[no-untyped-def]
        return manager.list()

    @app.get("/tasks/{task_id}")
    async def get_task(task_id: str):  # type: ignore[no-untyped-def]
        return manager.require(task_id)

    @app.post("/tasks/{task_id}/messages", status_code=201)
    async def post_message(task_id: str, payload: MessageCreate):  # type: ignore[no-untyped-def]
        return await manager.post_message(task_id, payload)

    @app.post("/tasks/{task_id}/pause")
    async def pause_task(task_id: str):  # type: ignore[no-untyped-def]
        return await manager.pause(task_id)

    @app.post("/tasks/{task_id}/resume")
    async def resume_task(task_id: str):  # type: ignore[no-untyped-def]
        return await manager.resume(task_id)

    @app.post("/tasks/{task_id}/cancel")
    async def cancel_task(task_id: str):  # type: ignore[no-untyped-def]
        return await manager.cancel(task_id)

    @app.post("/tasks/{task_id}/approvals", status_code=201)
    async def request_approval(task_id: str, payload: ApprovalRequest):  # type: ignore[no-untyped-def]
        return await manager.request_approval(task_id, payload)

    @app.get("/tasks/{task_id}/approvals")
    async def list_approvals(task_id: str):  # type: ignore[no-untyped-def]
        return manager.approvals_for(task_id)

    @app.post("/tasks/{task_id}/approvals/{approval_id}/decision")
    async def decide(task_id: str, approval_id: str, payload: DecisionCreate):  # type: ignore[no-untyped-def]
        return await manager.decide(task_id, approval_id, payload)

    @app.get("/tasks/{task_id}/events")
    async def stream_events(task_id: str, request: Request):  # type: ignore[no-untyped-def]
        current = manager.require(task_id)

        async def gen():  # type: ignore[no-untyped-def]
            queue = await bus.subscribe(task_id)
            try:
                snapshot = {
                    "status": current.status.value,
                    "progress": current.progress,
                    "approvals": [
                        a.model_dump(mode="json") for a in manager.approvals_for(task_id)
                    ],
                    "recent": [e.type for e in bus.recent(task_id)],
                }
                yield f"event: snapshot\ndata: {json.dumps(snapshot)}\n\n"
                while True:
                    if await request.is_disconnected():
                        break
                    try:
                        event = await asyncio.wait_for(queue.get(), timeout=15.0)
                    except TimeoutError:
                        yield ": heartbeat\n\n"
                        continue
                    yield f"event: {event.type}\ndata: {event.model_dump_json()}\n\n"
            finally:
                await bus.unsubscribe(task_id, queue)

        return StreamingResponse(gen(), media_type="text/event-stream")

    # -- model registry & routing --------------------------------------
    @app.get("/models")
    async def list_models(request: Request):  # type: ignore[no-untyped-def]
        reg: ModelRegistry = request.app.state.registry
        return {"models": [ModelEntry(**m).model_dump() for m in reg.list()]}

    @app.post("/models/refresh")
    async def refresh_models(request: Request):  # type: ignore[no-untyped-def]
        reg: ModelRegistry = request.app.state.registry
        active: Provider = request.app.state.provider
        try:
            ids = await active.list_models()
        except ProviderNotConfiguredError as exc:
            return provider_error(400, exc)
        except ProviderError as exc:
            return provider_error(502, exc)
        return reg.mark_seen(ids)

    @app.post("/models/{model_id:path}/validate")
    async def validate_model(model_id: str, request: Request):  # type: ignore[no-untyped-def]
        reg: ModelRegistry = request.app.state.registry
        active: Provider = request.app.state.provider
        if active.describe().get("name") == "mock":
            reg.upsert(model_id, status="verified", capabilities=["chat"])
            return {"id": model_id, "status": "verified"}
        try:
            await active.complete(
                [{"role": "user", "content": "Reply with the single word ok."}], model_id
            )
        except ProviderError as exc:
            reg.upsert(model_id, status="unavailable")
            return JSONResponse(
                status_code=200,
                content={"id": model_id, "status": "unavailable", "error": str(exc)},
            )
        reg.upsert(model_id, status="verified", capabilities=["chat"])
        return {"id": model_id, "status": "verified"}

    @app.post("/route", response_model=RouteRead)
    async def route_prompt(payload: RouteRequest, request: Request):  # type: ignore[no-untyped-def]
        active_router: Router = request.app.state.router
        est, _ = count_tokens(payload.prompt)
        estimated = est + payload.estimated_tokens
        try:
            picked, reason = active_router.route(
                payload.prompt, model=payload.model, estimated_tokens=estimated
            )
        except RoutingError as exc:
            return JSONResponse(
                status_code=503,
                content=ErrorBody(detail=str(exc), code="no_usable_model").model_dump(),
            )
        return RouteRead(model=picked, reason=reason, category=classify(payload.prompt))

    # -- context budgets & compression -----------------------------------
    def _budget_for(model: str, parts: list[ContextPart]) -> BudgetManager:
        reg: ModelRegistry = app.state.registry
        entry = reg.get(model) if model else None
        limit = entry["context_window"] if entry and entry["context_window"] else None
        return BudgetManager(
            limit=limit,
            reserve_fraction=settings.context_reserve,
            budget_fraction=settings.context_budget,
        )

    @app.post("/context/budget")
    async def context_budget(payload: BudgetRequest):  # type: ignore[no-untyped-def]
        budgets = _budget_for(payload.model, [])
        parts = [ContextPart(category=p.category, text=p.text) for p in payload.parts]
        budgets = _budget_for(payload.model, parts)
        report = budgets.budget(payload.model or "unspecified", parts)
        return {
            "model": report.model,
            "limit": report.limit,
            "limit_source": report.limit_source,
            "used": report.used,
            "reserved": report.reserved,
            "available": report.available,
            "utilization": report.utilization,
            "over_budget": report.over_budget,
            "compress_at": report.compress_at,
            "should_compress": report.should_compress,
            "parts": report.parts,
        }

    @app.get("/context/compressions")
    async def list_compressions(task_id: str = ""):  # type: ignore[no-untyped-def]
        query = "SELECT * FROM compressions"
        args: list = []
        if task_id:
            query += " WHERE task_id = ?"
            args.append(task_id)
        query += " ORDER BY id DESC LIMIT 50"
        rows = manager.conn.execute(query, args).fetchall()
        return [dict(r) for r in rows]

    # -- checkpoints ------------------------------------------------------
    @app.post("/tasks/{task_id}/checkpoints", status_code=201)
    async def create_checkpoint(task_id: str, payload: dict):  # type: ignore[no-untyped-def]
        label = str(payload.get("label", "manual"))[:120]
        return await manager.checkpoint(task_id, label)

    @app.get("/tasks/{task_id}/checkpoints")
    async def list_checkpoints(task_id: str):  # type: ignore[no-untyped-def]
        return manager.checkpoints(task_id)

    # -- memory ------------------------------------------------------------
    def _memory() -> SqliteMemoryStore:
        return app.state.memory

    @app.post("/memory", status_code=201)
    async def save_memory(payload: MemoryCreate):  # type: ignore[no-untyped-def]
        row = _memory().save(
            payload.category,
            payload.text,
            project=payload.project,
            confirmed=payload.confirmed,
            source=payload.source,
        )
        if row is None:
            return JSONResponse(
                status_code=200,
                content={"saved": False, "reason": "duplicate or empty after secret scrubbing"},
            )
        return {"saved": True, "memory": row}

    @app.get("/memory")
    async def list_memory(category: str = "", project: str = ""):  # type: ignore[no-untyped-def]
        if category and category not in ("global", "project", "task", "knowledge"):
            return JSONResponse(
                status_code=422,
                content=ErrorBody(detail="unknown category", code="validation").model_dump(),
            )
        return _memory().list(category=category, project=project)

    @app.get("/memory/search")
    async def search_memory(q: str = "", project: str = "", limit: int = 10):  # type: ignore[no-untyped-def]
        return _memory().search(q[:200], project=project, limit=min(max(limit, 1), 50))

    @app.patch("/memory/{memory_id}")
    async def update_memory(memory_id: str, payload: MemoryUpdate):  # type: ignore[no-untyped-def]
        row = _memory().update(memory_id, payload.text)
        if row is None:
            return JSONResponse(
                status_code=404,
                content=ErrorBody(detail="memory not found", code="not_found").model_dump(),
            )
        return row

    @app.delete("/memory/{memory_id}")
    async def delete_memory(memory_id: str):  # type: ignore[no-untyped-def]
        if not _memory().remove(memory_id):
            return JSONResponse(
                status_code=404,
                content=ErrorBody(detail="memory not found", code="not_found").model_dump(),
            )
        return {"deleted": True}

    @app.post("/memory/{memory_id}/disable")
    async def disable_memory(memory_id: str):  # type: ignore[no-untyped-def]
        if not _memory().set_enabled(memory_id, False):
            return JSONResponse(
                status_code=404,
                content=ErrorBody(detail="memory not found", code="not_found").model_dump(),
            )
        return {"disabled": True}

    @app.post("/memory/{memory_id}/enable")
    async def enable_memory(memory_id: str):  # type: ignore[no-untyped-def]
        if not _memory().set_enabled(memory_id, True):
            return JSONResponse(
                status_code=404,
                content=ErrorBody(detail="memory not found", code="not_found").model_dump(),
            )
        return {"enabled": True}

    @app.post("/memory/clear-project")
    async def clear_project_memory(payload: dict):  # type: ignore[no-untyped-def]
        project = str(payload.get("project", ""))[:256]
        if not project:
            return JSONResponse(
                status_code=422,
                content=ErrorBody(detail="project is required", code="validation").model_dump(),
            )
        return {"cleared": _memory().clear_project(project)}

    @app.get("/memory/history")
    async def memory_history():  # type: ignore[no-untyped-def]
        return _memory().history()

    @app.post("/memory/maintain")
    async def maintain_memory(payload: dict):  # type: ignore[no-untyped-def]
        project = str(payload.get("project", ""))[:256]
        return _memory().maintain(project)

    # -- usage --------------------------------------------------------------
    @app.get("/usage")
    async def list_usage(task_id: str = ""):  # type: ignore[no-untyped-def]
        usage: UsageRecorder = app.state.usage
        if task_id:
            return usage.for_task(task_id)
        rows = usage.conn.execute(
            "SELECT * FROM usage_records ORDER BY id DESC LIMIT 100"
        ).fetchall()
        return [dict(r) for r in rows]

    # -- workspaces, tools, task detail --------------------------------------
    @app.get("/workspaces")
    async def list_workspaces(request: Request):  # type: ignore[no-untyped-def]
        auth: WorkspaceAuth = request.app.state.auth
        return {"roots": auth.list_roots()}

    @app.get("/tools")
    async def list_tools():  # type: ignore[no-untyped-def]
        from . import tools as _tools

        return [
            {"name": name, "description": t.description, "requires_approval": t.requires_approval}
            for name, t in sorted(_tools.TOOLS.items())
        ]

    @app.get("/tasks/{task_id}/detail")
    async def task_detail(task_id: str):  # type: ignore[no-untyped-def]
        task = manager.require(task_id)
        return {
            "task": task,
            "steps": manager.plan_steps(task_id),
            "tool_calls": manager.tool_calls(task_id),
            "checkpoints": manager.checkpoints(task_id),
            "usage": manager.usage_for(task_id),
        }

    @app.get("/tasks/{task_id}/tool-calls")
    async def list_tool_calls(task_id: str):  # type: ignore[no-untyped-def]
        manager.require(task_id)
        return manager.tool_calls(task_id)

    @app.get("/tasks/{task_id}/journal")
    async def list_journal(task_id: str):  # type: ignore[no-untyped-def]
        from . import changes as _changes

        manager.require(task_id)
        return _changes.journal_for(manager.conn, task_id)

    @app.post("/tasks/{task_id}/revert")
    async def revert_journal(task_id: str, payload: dict):  # type: ignore[no-untyped-def]
        from . import changes as _changes

        manager.require(task_id)
        journal_id = str(payload.get("journal_id", ""))[:64]
        if not journal_id:
            return JSONResponse(
                status_code=422,
                content=ErrorBody(detail="journal_id is required", code="validation").model_dump(),
            )
        try:
            result = _changes.revert_change_at(manager.conn, manager.auth, task_id, journal_id)
        except _changes.ConflictError as exc:
            return JSONResponse(
                status_code=409,
                content=ErrorBody(detail=str(exc), code="conflict").model_dump(),
            )
        except _changes.ChangeError as exc:
            return JSONResponse(
                status_code=404,
                content=ErrorBody(detail=str(exc), code="not_found").model_dump(),
            )
        await manager.bus.publish(task_id, "change.reverted", result)
        return result

    # -- browser capture --------------------------------------------------------
    class BrowserCapture(BaseModel):
        url: str = Field(min_length=1, max_length=2000)
        width: int = Field(default=1440)
        shot: bool = False

    @app.post("/browser/capture")
    async def browser_capture(payload: BrowserCapture, request: Request):  # type: ignore[no-untyped-def]
        from .browser_tools import BrowserError as _BrowserError

        service: BrowserService | None = request.app.state.browser
        if service is None:
            return JSONResponse(
                status_code=503,
                content=ErrorBody(
                    detail="browser service unavailable", code="unavailable"
                ).model_dump(),
            )
        try:
            return await service.inspect(payload.url, payload.width, payload.shot)
        except _BrowserError as exc:
            return JSONResponse(
                status_code=422,
                content=ErrorBody(detail=str(exc), code="validation").model_dump(),
            )

    @app.get("/shots/{name}")
    async def get_shot(name: str):  # type: ignore[no-untyped-def]
        from fastapi.responses import FileResponse

        if not re.fullmatch(r"shot-\d+\.png", name):
            return JSONResponse(
                status_code=404,
                content=ErrorBody(detail="unknown shot", code="not_found").model_dump(),
            )
        return FileResponse(os.path.join(app.state.shots_dir, name), media_type="image/png")

    return app


app = create_app()
