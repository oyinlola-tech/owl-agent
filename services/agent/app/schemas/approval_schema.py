from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


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
    network: bool = False
    sandboxed: bool | None = None


class DecisionCreate(BaseModel):
    approved: bool
    by: str = Field(default="local-user", max_length=120)
