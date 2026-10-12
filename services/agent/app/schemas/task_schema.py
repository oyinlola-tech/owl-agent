from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class TaskStatus(StrEnum):
    CREATED = "created"
    RUNNING = "running"
    AWAITING_APPROVAL = "awaiting_approval"
    PAUSED = "paused"
    COMPLETED = "completed"
    COMPLETED_UNVERIFIED = "completed_unverified"
    VERIFIED_COMPLETED = "verified_completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Role(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


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
    verification_note: str = ""
    verified_at: datetime | None = None
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


class AgentEvent(BaseModel):
    seq: int
    type: str = Field(max_length=80)
    task_id: str
    data: dict = Field(default_factory=dict)
    created_at: datetime
