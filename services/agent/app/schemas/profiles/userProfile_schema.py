from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

ONBOARDING_STEPS = (
    "welcome",
    "about_you",
    "connect_model",
    "first_project",
    "safety_check",
    "done",
)

ChipText = Annotated[str, StringConstraints(min_length=1, max_length=60)]


class UserProfileWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(default="", max_length=80)
    role: str = Field(default="", max_length=120)
    experience: str = Field(default="", max_length=60)
    languages: list[ChipText] = Field(default_factory=list, max_length=30)
    package_managers: list[ChipText] = Field(default_factory=list, max_length=15)
    code_style: str = Field(default="", max_length=300)
    test_framework: str = Field(default="", max_length=120)
    commit_style: str = Field(default="", max_length=200)
    tone: str = Field(default="", max_length=120)
    projects_folder: str = Field(default="", max_length=1024)


class UserProfileRead(UserProfileWrite):
    updated_at: str | None = None
    is_empty: bool = True


class OnboardingWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    step: str = Field(pattern="^(" + "|".join(ONBOARDING_STEPS) + ")$")
    completed: bool = False
    skipped_steps: list[ChipText] = Field(default_factory=list, max_length=len(ONBOARDING_STEPS))


class OnboardingRead(BaseModel):
    step: str = "welcome"
    completed: bool = False
    skipped_steps: list[str] = Field(default_factory=list)
    updated_at: str | None = None
    profile_empty: bool = True
    provider_configured: bool = False
