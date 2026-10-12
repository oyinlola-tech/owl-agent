from __future__ import annotations

import asyncio
import time

from ...contexts.tokenCounter_context import count_tokens
from ...databases.recordStamp_database import create_prefixed_id, current_utc_time
from ...llms.providers.providerError_provider import (
    InvalidCredentialsError,
    ModelNotAvailableError,
    ProviderNetworkError,
    ProviderNotConfiguredError,
    ProviderRefusalError,
    ProviderRequestRejectedError,
    ProviderTimeoutError,
    QuotaExceededError,
    RateLimitedError,
)
from ...llms.usageRecorder_llm import UsageRecorder
from ..taskRule_task import TaskBlockedError, TaskLimitReachedError


class ModelCallMixin:
    async def call_model_with_retries(
        self, task_id: str, messages: list[dict[str, str]], model: str, purpose: str
    ) -> str:
        row = self.fetch_task_row(task_id)
        calls = int(row["model_calls"]) + 1 if row else 1
        if row:
            self.conn.execute("UPDATE tasks SET model_calls = ? WHERE id = ?", (calls, task_id))
            self.conn.commit()
        if calls > self.max_model_calls:
            raise TaskLimitReachedError(f"model call budget exceeded ({self.max_model_calls})")
        attempts = 0
        while True:
            start = time.monotonic()
            try:
                text = await self.provider.complete(messages, model)
            except (
                InvalidCredentialsError,
                ModelNotAvailableError,
                QuotaExceededError,
                ProviderNotConfiguredError,
                ProviderRefusalError,
                ProviderRequestRejectedError,
            ) as exc:
                self.record_failed_model_attempt(task_id, model, purpose, messages, str(exc))
                raise TaskBlockedError(f"provider refused: {exc}") from exc
            except RateLimitedError as exc:
                if attempts >= self.max_retries:
                    self.record_failed_model_attempt(task_id, model, purpose, messages, str(exc))
                    raise TaskLimitReachedError(f"rate limited after {attempts} retries") from exc
                wait = self.compute_retry_wait_seconds(exc, attempts)
                await self.bus.publish_event(
                    task_id, "task.retry", {"reason": "rate_limited", "wait_s": wait}
                )
                await asyncio.sleep(wait)
                attempts += 1
                continue
            except (ProviderTimeoutError, ProviderNetworkError) as exc:
                if attempts >= self.max_retries:
                    self.record_failed_model_attempt(task_id, model, purpose, messages, str(exc))
                    raise TaskLimitReachedError(
                        f"provider unreachable after {attempts} retries"
                    ) from exc
                await self.bus.publish_event(
                    task_id, "task.retry", {"reason": "transient", "wait_s": 2**attempts}
                )
                await asyncio.sleep(2**attempts)
                attempts += 1
                continue
            duration = int((time.monotonic() - start) * 1000)
            usage = self.provider.pop_usage()
            if usage:
                self.create_usage_recorder().record_usage(
                    task_id=task_id,
                    model=model,
                    requested_model=model,
                    routing_reason=purpose,
                    input_tokens=usage["input"],
                    output_tokens=usage["output"],
                    estimated=usage["estimated"],
                    duration_ms=duration,
                )
            else:
                est, _ = count_tokens("\n".join(m["content"] for m in messages))
                self.create_usage_recorder().record_usage(
                    task_id=task_id,
                    model=model,
                    requested_model=model,
                    routing_reason=purpose,
                    input_tokens=est,
                    output_tokens=0,
                    estimated=True,
                    duration_ms=duration,
                )
            if attempts:
                self.create_usage_recorder().record_usage(
                    task_id=task_id,
                    model=model,
                    requested_model=model,
                    routing_reason=purpose,
                    input_tokens=0,
                    output_tokens=0,
                    estimated=True,
                    duration_ms=0,
                    error=f"recovered after {attempts} retries",
                )
            return text

    @staticmethod
    def compute_retry_wait_seconds(exc: RateLimitedError, attempts: int) -> float:
        try:
            hinted = float(exc.retry_after or 0)
        except ValueError:
            hinted = 0.0
        if hinted > 0:
            return min(hinted, 60.0)
        return float(min(2**attempts, 30))

    def record_failed_model_attempt(
        self, task_id: str, model: str, purpose: str, messages: list, error: str
    ) -> None:
        est, _ = count_tokens("\n".join(m["content"] for m in messages))
        self.create_usage_recorder().record_usage(
            task_id=task_id,
            model=model,
            requested_model=model,
            routing_reason=purpose,
            input_tokens=est,
            output_tokens=0,
            estimated=True,
            duration_ms=0,
            error=error[:300],
        )

    async def complete_plan_as_message(self, task_id: str, prompt: str, model: str) -> None:
        start = time.monotonic()
        text = await self.provider.complete([{"role": "user", "content": prompt}], model)
        duration = int((time.monotonic() - start) * 1000)
        usage = self.provider.pop_usage()
        if usage:
            self.create_usage_recorder().record_usage(
                task_id=task_id,
                model=model,
                requested_model=model,
                routing_reason="",
                input_tokens=usage["input"],
                output_tokens=usage["output"],
                estimated=usage["estimated"],
                duration_ms=duration,
            )
        else:
            est, _ = count_tokens(prompt)
            self.create_usage_recorder().record_usage(
                task_id=task_id,
                model=model,
                requested_model=model,
                routing_reason="",
                input_tokens=est,
                output_tokens=0,
                estimated=True,
                duration_ms=duration,
            )
        msg_id = create_prefixed_id("msg")
        self.conn.execute(
            "INSERT INTO messages (id, task_id, role, text, created_at) VALUES (?, ?, ?, ?, ?)",
            (msg_id, task_id, "assistant", text, current_utc_time().isoformat()),
        )
        self.update_task_fields(task_id)
        self.conn.commit()
        await self.bus.publish_event(task_id, "message", {"role": "assistant", "text": text})

    def create_usage_recorder(self) -> UsageRecorder:
        return UsageRecorder(self.conn)
