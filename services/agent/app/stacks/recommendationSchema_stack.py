from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class StackConstraints(BaseModel):
    model_config = ConfigDict(extra="ignore")

    languages: list[str] = Field(default_factory=list, max_length=20)
    avoid: list[str] = Field(default_factory=list, max_length=20)
    performance: str = Field(default="", max_length=60)
    hosting: str = Field(default="", max_length=120)
    licensing: str = Field(default="", max_length=120)
    team_experience: str = Field(default="", max_length=120)


class StackRecommendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str = Field(min_length=1, max_length=4000)
    constraints: StackConstraints | None = None


class StackRecommendation(BaseModel):
    stack: dict
    fit_score: int
    why: str
    tradeoffs: list[str]
    vs_runner_up: str
    starter_command: str
    verification_commands: list[str]
    owl_support: str
    experience_note: str


class StackRecommendResponse(BaseModel):
    ranked_by: str
    recommendations: list[StackRecommendation]


class StackCatalogResponse(BaseModel):
    count: int
    stacks: list[dict]
