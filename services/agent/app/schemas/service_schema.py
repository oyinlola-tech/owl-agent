from __future__ import annotations

from pydantic import BaseModel, Field


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


class VerifyRead(BaseModel):
    ok: bool
    provider: str
    model: str = ""
    error: str = ""
    code: str = ""


class ErrorBody(BaseModel):
    detail: str
    code: str


class BrowserCapture(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    width: int = Field(default=1440)
    shot: bool = False
