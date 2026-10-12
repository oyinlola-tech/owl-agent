from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ProviderKeyWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str = Field(min_length=1, max_length=512)


class ProviderSettingsWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    base_url: str | None = Field(default=None, max_length=512)
    model: str | None = Field(default=None, max_length=200)
    server_fallbacks: bool | None = None


class ProviderActiveWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider_id: str = Field(min_length=1, max_length=40)
    model: str | None = Field(default=None, max_length=200)


class ProviderTestWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str | None = Field(default=None, max_length=512)
    base_url: str | None = Field(default=None, max_length=512)


class ProviderTestRead(BaseModel):
    ok: bool
    provider: str
    latency_ms: int | None = None
    model_count: int = 0
    models: list[str] = Field(default_factory=list)
    error: str = ""
    code: str = ""
