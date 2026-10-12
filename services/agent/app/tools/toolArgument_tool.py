from __future__ import annotations

from pydantic import BaseModel, Field

MAX_SEARCH_RESULTS = 100


class DirectoryListArguments(BaseModel):
    path: str = "."
    depth: int = Field(default=2, ge=1, le=5)


class FileReadArguments(BaseModel):
    path: str
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=200, ge=1, le=2000)
    allow_sensitive: bool = False


class FileSearchArguments(BaseModel):
    pattern: str = Field(min_length=1, max_length=200)
    path: str = "."
    glob: str = Field(default="*", max_length=100)
    max_results: int = Field(default=50, ge=1, le=MAX_SEARCH_RESULTS)


class FileStatArguments(BaseModel):
    path: str


class FileCreateArguments(BaseModel):
    path: str
    content: str = Field(max_length=200000)


class EditProposalArguments(BaseModel):
    path: str
    old: str = Field(min_length=1, max_length=100000)
    new: str = Field(max_length=100000)


class EditApplyArguments(BaseModel):
    proposal_id: str = Field(min_length=1, max_length=64)


class CommandRunArguments(BaseModel):
    argv: list[str] = Field(min_length=1, max_length=20)
    cwd: str = "."
    timeout: float | None = Field(default=None, ge=1, le=600)


class GitReadArguments(BaseModel):
    path: str = "."
    ref: str = Field(default="", max_length=120)
    limit: int = Field(default=10, ge=1, le=50)


class GitCommitArguments(BaseModel):
    path: str = "."
    files: list[str] = Field(min_length=1, max_length=50)
    message: str = Field(min_length=1, max_length=500)


class GitPushArguments(BaseModel):
    path: str = "."
    remote: str = Field(default="origin", max_length=60)


class BrowserOpenArguments(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    width: int = Field(default=1440)
    shot: bool = False
