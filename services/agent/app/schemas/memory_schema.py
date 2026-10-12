from __future__ import annotations

from pydantic import BaseModel, Field


class MemoryCreate(BaseModel):
    category: str = Field(pattern="^(global|project|task|knowledge)$")
    text: str = Field(min_length=1, max_length=4000)
    project: str = Field(default="", max_length=256)
    confirmed: bool = True
    source: str = Field(default="", max_length=256)


class MemoryUpdate(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
