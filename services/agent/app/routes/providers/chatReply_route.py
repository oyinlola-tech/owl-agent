from __future__ import annotations

import json
import time

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import StreamingResponse

from ...contexts.tokenCounter_context import count_tokens
from ...llms.modelRouter_llm import ModelRouter, RoutingError
from ...llms.providers.baseProvider_provider import ModelProvider
from ...llms.providers.providerError_provider import (
    ProviderError,
    ProviderNotConfiguredError,
    RateLimitedError,
)
from ...llms.usageRecorder_llm import UsageRecorder
from ...schemas.model_schema import ChatReply, ChatRequest
from .providerErrorResponse_route import build_provider_error_response


class RoutingFailedError(Exception):
    pass


def format_sse_event(event: str, payload_obj: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload_obj)}\n\n"


def create_chat_router(app: FastAPI) -> APIRouter:
    router = APIRouter()

    def choose_model_for_prompt(payload_model: str, prompt: str) -> tuple[str, str]:
        active_router: ModelRouter = app.state.router
        est, _ = count_tokens(prompt)
        try:
            return active_router.choose_model(
                prompt, model=payload_model or "auto", estimated_tokens=est
            )
        except RoutingError as exc:
            raise RoutingFailedError(str(exc)) from exc

    def record_chat_usage(
        model: str,
        requested: str,
        reason: str,
        prompt_text: str,
        reply_text: str,
        duration_ms: int,
        active: ModelProvider,
        error: str = "",
    ) -> dict:
        recorder: UsageRecorder = app.state.usage
        pop = getattr(active, "pop_usage", None)
        actual = pop() if callable(pop) else None
        if actual:
            recorder.record_usage(
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
        recorder.record_usage(
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

    @router.post("/chat", response_model=ChatReply)
    async def chat(payload: ChatRequest, request: Request):  # type: ignore[no-untyped-def]
        active: ModelProvider = request.app.state.provider
        messages = [{"role": m.role.value, "content": m.content} for m in payload.messages]
        prompt_text = "\n".join(m["content"] for m in messages if m["role"] == "user")
        try:
            picked, reason = choose_model_for_prompt(payload.model, prompt_text)
        except RoutingFailedError as exc:
            return build_provider_error_response(503, ProviderError(str(exc)))
        start = time.monotonic()
        try:
            reply = await active.complete(messages, picked)
        except RateLimitedError as exc:
            record_chat_usage(picked, payload.model, reason, prompt_text, "", 0, active, str(exc))
            return build_provider_error_response(429, exc)
        except ProviderNotConfiguredError as exc:
            return build_provider_error_response(400, exc)
        except ProviderError as exc:
            record_chat_usage(picked, payload.model, reason, prompt_text, "", 0, active, str(exc))
            return build_provider_error_response(502, exc)
        duration = int((time.monotonic() - start) * 1000)
        usage = record_chat_usage(
            picked, payload.model, reason, prompt_text, reply, duration, active
        )
        return ChatReply(reply=reply, model=picked, routing=reason, usage=usage)

    @router.post("/chat/stream")
    async def chat_stream(payload: ChatRequest, request: Request):  # type: ignore[no-untyped-def]
        active: ModelProvider = request.app.state.provider
        messages = [{"role": m.role.value, "content": m.content} for m in payload.messages]
        prompt_text = "\n".join(m["content"] for m in messages if m["role"] == "user")
        try:
            picked, reason = choose_model_for_prompt(payload.model, prompt_text)
        except RoutingFailedError as exc:
            message = str(exc)

            async def stream_routing_failure():  # type: ignore[no-untyped-def]
                yield format_sse_event(
                    "chat.error", {"code": "no_usable_model", "message": message}
                )

            return StreamingResponse(stream_routing_failure(), media_type="text/event-stream")
        model = picked
        start = time.monotonic()

        async def stream_chat_deltas():  # type: ignore[no-untyped-def]
            try:
                chunks: list[str] = []
                async for delta in active.complete_stream(messages, model):
                    chunks.append(delta)
                    yield format_sse_event("chat.delta", {"text": delta})
                duration = int((time.monotonic() - start) * 1000)
                usage = record_chat_usage(
                    model, payload.model, reason, prompt_text, "".join(chunks), duration, active
                )
                yield format_sse_event(
                    "chat.done",
                    {"text": "".join(chunks), "model": model, "routing": reason, "usage": usage},
                )
            except RateLimitedError as exc:
                yield format_sse_event("chat.error", {"code": "rate_limited", "message": str(exc)})
            except ProviderNotConfiguredError as exc:
                yield format_sse_event(
                    "chat.error", {"code": "not_configured", "message": str(exc)}
                )
            except ProviderError as exc:
                yield format_sse_event("chat.error", {"code": "unavailable", "message": str(exc)})

        return StreamingResponse(stream_chat_deltas(), media_type="text/event-stream")

    return router
