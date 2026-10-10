"""Typed API contracts. These mirror the frontend agent types."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from uuid import uuid4

from pydantic import BaseModel, Field


def utcnow() -> datetime:
    return datetime.now(UTC)


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:12]}"


class TaskStatus(StrEnum):
    CREATED = "created"
    RUNNING = "running"
    AWAITING_APPROVAL = "awaiting_approval"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Role(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class ApprovalKind(StrEnum):
    FILES = "files"
    COMMAND = "command"
    PRIVILEGED = "privileged"


class ApprovalState(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"


class Risk(StrEnum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"


class TaskCreate(BaseModel):
    prompt: str = Field(min_length=1, max_length=8000)
    project: str = Field(default="", max_length=256)
    model: str = Field(default="auto", max_length=120)
    workspace: str = Field(default="", max_length=1024)


class TaskRead(BaseModel):
    id: str
    prompt: str
    project: str
    status: TaskStatus
    progress: int = Field(ge=0, le=100)
    message_count: int = 0
    model: str = ""
    routing: str = ""
    created_at: datetime
    updated_at: datetime


class MessageCreate(BaseModel):
    role: Role = Role.USER
    text: str = Field(min_length=1, max_length=4000)


class MessageRead(BaseModel):
    id: str
    role: Role
    text: str
    created_at: datetime


class ApprovalRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    kind: ApprovalKind = ApprovalKind.COMMAND
    command: str | None = Field(default=None, max_length=2000)
    files: list[str] = Field(default_factory=list, max_length=50)
    reason: str = Field(default="", max_length=1000)
    risk: Risk = Risk.LOW
    action: str = Field(default="", max_length=80)
    args: dict = Field(default_factory=dict)
    scope: str = Field(default="once", pattern="^(once|task)$")
    ttl_seconds: float = Field(default=1800.0, ge=60, le=86400)


class ApprovalRead(BaseModel):
    id: str
    title: str
    kind: ApprovalKind
    command: str | None = None
    files: list[str] = Field(default_factory=list)
    reason: str = ""
    risk: Risk = Risk.LOW
    action: str = ""
    args_hash: str = ""
    scope: str = "once"
    targets: list[str] = Field(default_factory=list)
    expires_at: datetime | None = None
    consumed_at: datetime | None = None
    status: ApprovalState = ApprovalState.PENDING
    decided_by: str = ""
    created_at: datetime
    decided_at: datetime | None = None


class DecisionCreate(BaseModel):
    approved: bool
    by: str = Field(default="local-user", max_length=120)


class AgentEvent(BaseModel):
    seq: int
    type: str = Field(max_length=80)
    task_id: str
    data: dict = Field(default_factory=dict)
    created_at: datetime


class HealthRead(BaseModel):
    status: str
    version: str
    provider: str
    provider_configured: bool
    approvals_enforced: bool = True


class ProviderRead(BaseModel):
    name: str
    configured: bool
    model: str = ""


class ErrorBody(BaseModel):
    detail: str
    code: str


class ChatMessage(BaseModel):
    role: Role
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=20)
    model: str = Field(default="auto", max_length=120)


class ChatReply(BaseModel):
    reply: str
    model: str
    routing: str = ""
    usage: dict = Field(default_factory=dict)


class VerifyRead(BaseModel):
    ok: bool
    provider: str
    model: str = ""
    error: str = ""
    code: str = ""


class ModelEntry(BaseModel):
    id: str
    context_window: int | None = None
    context_source: str = ""
    capabilities: list[str] = Field(default_factory=list)
    status: str = "untested"
    last_seen: str = ""
    updated_at: str = ""


class RouteRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=8000)
    model: str = Field(default="auto", max_length=120)
    estimated_tokens: int = Field(default=0, ge=0)


class RouteRead(BaseModel):
    model: str
    reason: str
    category: str


class BudgetPart(BaseModel):
    category: str
    text: str = Field(max_length=20000)


class BudgetRequest(BaseModel):
    model: str = Field(default="", max_length=120)
    parts: list[BudgetPart] = Field(max_length=30)


class MemoryCreate(BaseModel):
    category: str = Field(pattern="^(global|project|task|knowledge)$")
    text: str = Field(min_length=1, max_length=4000)
    project: str = Field(default="", max_length=256)
    confirmed: bool = True
    source: str = Field(default="", max_length=256)


class MemoryUpdate(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
