from __future__ import annotations

import asyncio
import sqlite3

from ..contexts.contextCompressor_context import ContextCompressor
from ..events.eventBus_event import EventBus
from ..guards.approvalBinding_guard import DefaultApprovalPolicy
from ..llms.modelRegistry_llm import ModelRegistry
from ..llms.modelRouter_llm import ModelRouter
from ..llms.providers.baseProvider_provider import ModelProvider
from ..llms.usageRecorder_llm import UsageRecorder
from ..memories.sqliteMemoryStore_memory import SqliteMemoryStore
from .actions.toolApproval_action import ToolApprovalMixin
from .actions.toolExecution_action import ToolExecutionMixin
from .agents.agentPrompt_agent import AgentPromptMixin
from .agents.agentRun_agent import AgentRunMixin
from .agents.agentStep_agent import AgentStepMixin
from .agents.modelCall_agent import ModelCallMixin
from .states.taskApproval_state import TaskApprovalMixin
from .states.taskCheckpoint_state import TaskCheckpointMixin
from .states.taskLifecycle_state import TaskLifecycleMixin
from .states.taskRecord_state import TaskRecordMixin
from .verifications.requirementRun_verification import RequirementRunMixin
from .verifications.verificationEvidence_verification import VerificationEvidenceMixin
from .verifications.verificationOutcome_verification import VerificationOutcomeMixin
from .verifications.verificationReport_verification import VerificationReportMixin
from .verifications.verificationRound_verification import VerificationRoundMixin


class TaskManager(
    TaskRecordMixin,
    TaskLifecycleMixin,
    TaskApprovalMixin,
    TaskCheckpointMixin,
    AgentPromptMixin,
    ModelCallMixin,
    AgentRunMixin,
    AgentStepMixin,
    ToolApprovalMixin,
    ToolExecutionMixin,
    VerificationOutcomeMixin,
    VerificationRoundMixin,
    VerificationEvidenceMixin,
    RequirementRunMixin,
    VerificationReportMixin,
):
    def __init__(
        self,
        conn: sqlite3.Connection,
        bus: EventBus,
        provider: ModelProvider,
        registry: ModelRegistry,
        memory: SqliteMemoryStore,
        usage: UsageRecorder,
        *,
        step_delay: float = 1.0,
        default_model: str = "",
        fallback_model: str = "",
        allow_fallback: bool = True,
        context_budget: float = 0.8,
        context_reserve: float = 0.25,
        max_retries: int = 2,
        max_iterations: int = 25,
        max_model_calls: int = 40,
        max_elapsed: float = 1800.0,
        max_verification_attempts: int = 3,
        verify_timeout: float = 600.0,
        approval_ttl: float = 1800.0,
        auth=None,
        exec_service=None,
        browser=None,
    ) -> None:
        self.conn = conn
        self.bus = bus
        self.provider = provider
        self.registry = registry
        self.memory = memory
        self.usage = usage
        self.step_delay = step_delay
        self.router = ModelRouter(
            registry,
            default_model=default_model,
            allow_fallback=allow_fallback,
            fallback_model=fallback_model,
        )
        self.context_budget = context_budget
        self.context_reserve = context_reserve
        self.max_retries = max_retries
        self.max_iterations = max_iterations
        self.max_model_calls = max_model_calls
        self.max_elapsed = max_elapsed
        self.max_verification_attempts = max(1, max_verification_attempts)
        self.verify_timeout = verify_timeout
        self.approval_ttl = min(max(float(approval_ttl), 60.0), 86400.0)
        self.workspace_guard = auth
        self.command_executor = exec_service
        self.browser_inspector = browser
        self.policy = DefaultApprovalPolicy()
        self.compressor = ContextCompressor()
        self.is_shutting_down = False
        self.running_workers: dict[str, asyncio.Task] = {}
        self.approval_gates: dict[str, asyncio.Event] = {}
        self.insert_lock = asyncio.Lock()
