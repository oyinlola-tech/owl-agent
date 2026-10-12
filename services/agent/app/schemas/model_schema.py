from __future__ import annotations

from pydantic import BaseModel, Field

from .task_schema import Role


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
