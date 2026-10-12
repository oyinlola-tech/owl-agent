from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from ..events.eventBus_event import EventBus
from ..executors.browserExecutor_executor import BrowserPageInspector
from ..executors.commandExecutor_executor import CommandExecutor
from ..guards.approvalBinding_guard import DefaultApprovalPolicy
from ..guards.workspaceAccess_guard import WorkspaceAccessGuard
from ..llms.modelRegistry_llm import ModelRegistry
from ..llms.modelRouter_llm import ModelRouter
from ..llms.providers.baseProvider_provider import ModelProvider
from ..llms.providerSetup_llm import create_provider_setup
from ..llms.usageRecorder_llm import UsageRecorder
from ..memories.sqliteMemoryStore_memory import SqliteMemoryStore
from ..middlewares.bodyLimit_middleware import BodyLimitMiddleware
from ..middlewares.localServiceAuth_middleware import LocalServiceAuthMiddleware
from ..middlewares.requestId_middleware import RequestIDMiddleware
from ..sandboxes.sandboxPolicy_sandbox import build_sandbox_policy
from ..sandboxes.sandboxRunner_sandbox import SandboxRunner
from ..schemas.service_schema import ErrorBody
from ..settings.serviceSettings_setting import Settings, load_settings_once
from ..settings.serviceToken_setting import resolve_service_tokens
from ..storages.logFile_storage import add_known_secret_to_log_filter
from ..storages.storageBootstrap_storage import prepare_local_storage
from ..tasks.taskManager_task import TaskManager
from .routeRegistry_server import include_all_routers

log = logging.getLogger("owl")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings_once()
    logging.basicConfig(level=settings.log_level.upper(), format="%(levelname)s owl %(message)s")
    storage = prepare_local_storage(settings.data_dir, settings.db_path)
    conn = storage.conn
    data_dir = storage.layout.root
    tokens = resolve_service_tokens(settings, data_dir)
    for secret in tokens.list_accepted_tokens():
        add_known_secret_to_log_filter(secret)
    sandbox = SandboxRunner(build_sandbox_policy(settings, data_dir), data_dir)
    sandbox.run_startup_self_test()
    log.info(
        "sandbox mode=%s backend=%s active=%s",
        sandbox.policy.mode,
        sandbox.backend or "none",
        sandbox.is_active,
    )
    bus = EventBus()
    registry = ModelRegistry(conn)
    provider_setup = create_provider_setup(settings, conn, data_dir, registry)
    provider: ModelProvider = provider_setup.holder
    memory = SqliteMemoryStore(conn, retention_history=settings.memory_retention)
    usage = UsageRecorder(conn)
    default_model = (
        settings.router_default_model
        or settings.nvidia_model
        or provider.describe().get("model", "")
    )
    registry.save_model(str(default_model or "mock-1"), status="available", capabilities=["chat"])
    router = ModelRouter(
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
        max_verification_attempts=settings.max_verification_attempts,
        verify_timeout=settings.verify_timeout,
        approval_ttl=settings.approval_ttl,
        auth=WorkspaceAccessGuard.from_comma_separated_roots(settings.workspaces),
        exec_service=CommandExecutor(
            WorkspaceAccessGuard.from_comma_separated_roots(settings.workspaces),
            timeout=settings.exec_timeout,
            output_limit=settings.exec_output_limit,
            sandbox=sandbox,
        ),
        browser=BrowserPageInspector(
            storage.layout.screenshots_dir, allow_loopback=settings.browser_allow_loopback
        ),
    )
    provider_setup.attach_routers([router, manager.router])
    policy = DefaultApprovalPolicy()
    recovered = manager.recover_interrupted_tasks()
    if recovered:
        log.info("recovered %d interrupted task(s) to paused", len(recovered))

    app = FastAPI(title="OWL Agent Service", version=settings.version)

    @asynccontextmanager
    async def close_manager_on_shutdown(app: FastAPI):  # type: ignore[no-untyped-def]
        yield
        manager.is_shutting_down = True

    app.router.lifespan_context = close_manager_on_shutdown
    app.state.manager = manager
    app.state.provider = provider
    app.state.provider_setup = provider_setup
    app.state.policy = policy
    app.state.settings = settings
    app.state.registry = registry
    app.state.memory = memory
    app.state.usage = usage
    app.state.router = router
    app.state.auth = manager.workspace_guard
    app.state.exec_service = manager.command_executor
    app.state.browser = manager.browser_inspector
    app.state.shots_dir = storage.layout.screenshots_dir
    app.state.local_storage = storage
    app.state.sandbox = sandbox
    app.state.service_tokens = tokens

    app.add_middleware(BodyLimitMiddleware, max_bytes=settings.max_body_bytes)
    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(
        LocalServiceAuthMiddleware, tokens=tokens, extra_hosts=settings.allowed_hosts
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_cors_origins,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        max_age=600,
    )

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError):  # type: ignore[no-untyped-def]
        return JSONResponse(
            status_code=422,
            content=ErrorBody(detail="invalid request payload", code="validation").model_dump(),
        )

    include_all_routers(app, settings, provider, manager, bus)
    return app
