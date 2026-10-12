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
    ref: str = Field(default="", max_length=120, pattern=r"^([^-\s\x00][^\s\x00]*)?$")
    limit: int = Field(default=10, ge=1, le=50)


class GitCommitArguments(BaseModel):
    path: str = "."
    files: list[str] = Field(min_length=1, max_length=50)
    message: str = Field(min_length=1, max_length=500)


class GitPushArguments(BaseModel):
    path: str = "."
    remote: str = Field(default="origin", max_length=60)
    force: bool = False


REF_NAME_PATTERN = r"^[^-\s\x00][^\s\x00]*$"


class GitBranchNameArguments(BaseModel):
    path: str = "."
    name: str = Field(min_length=1, max_length=200, pattern=REF_NAME_PATTERN)


class GitDeleteBranchArguments(BaseModel):
    path: str = "."
    name: str = Field(min_length=1, max_length=200, pattern=REF_NAME_PATTERN)
    force: bool = False


class GitCheckoutArguments(BaseModel):
    path: str = "."
    ref: str = Field(min_length=1, max_length=200, pattern=REF_NAME_PATTERN)
    confirm_discard: bool = False


class GitMergeArguments(BaseModel):
    path: str = "."
    ref: str = Field(min_length=1, max_length=200, pattern=REF_NAME_PATTERN)


class GitPullArguments(BaseModel):
    path: str = "."
    remote: str = Field(default="origin", max_length=60)


class GitCommitMessageArguments(BaseModel):
    path: str = "."


class BrowserOpenArguments(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    width: int = Field(default=1440)
    shot: bool = False


class SecurityScanArguments(BaseModel):
    path: str = "."
    tools: list[str] = Field(default_factory=list, max_length=20)


class KnowledgeSearchArguments(BaseModel):
    query: str = Field(min_length=1, max_length=400)
    types: list[str] = Field(default_factory=list, max_length=10)
    project: str = Field(default="", max_length=256)
    limit: int = Field(default=10, ge=1, le=50)


class BrowserSessionOpenArguments(BaseModel):
    url: str = Field(min_length=1, max_length=2000)


class BrowserNavigateArguments(BaseModel):
    session_id: str = Field(default="", max_length=64)
    url: str = Field(min_length=1, max_length=2000)


class BrowserSessionRefArguments(BaseModel):
    session_id: str = Field(default="", max_length=64)


class BrowserExtractArguments(BaseModel):
    session_id: str = Field(default="", max_length=64)
    what: str = Field(default="text", pattern="^(text|links|forms|structure|title)$")


class BrowserClickArguments(BaseModel):
    session_id: str = Field(default="", max_length=64)
    target: str = Field(min_length=1, max_length=400)


class BrowserTypeArguments(BaseModel):
    session_id: str = Field(default="", max_length=64)
    target: str = Field(min_length=1, max_length=400)
    text: str = Field(default="", max_length=20000)


class BrowserSelectArguments(BaseModel):
    session_id: str = Field(default="", max_length=64)
    target: str = Field(min_length=1, max_length=400)
    value: str = Field(default="", max_length=2000)


class BrowserScrollArguments(BaseModel):
    session_id: str = Field(default="", max_length=64)
    direction: str = Field(default="down", pattern="^(up|down|top|bottom)$")


class BrowserHoverArguments(BaseModel):
    session_id: str = Field(default="", max_length=64)
    target: str = Field(min_length=1, max_length=400)


class BrowserWaitArguments(BaseModel):
    session_id: str = Field(default="", max_length=64)
    selector: str = Field(default="", max_length=400)
    timeout_ms: int = Field(default=2000, ge=0, le=30000)


class BrowserSubmitArguments(BaseModel):
    session_id: str = Field(default="", max_length=64)
    target: str = Field(min_length=1, max_length=400)


class BrowserUploadArguments(BaseModel):
    session_id: str = Field(default="", max_length=64)
    target: str = Field(min_length=1, max_length=400)
    path: str = Field(min_length=1, max_length=2000)


class BrowserDownloadArguments(BaseModel):
    session_id: str = Field(default="", max_length=64)
    target: str = Field(default="", max_length=400)


class DocumentReadArguments(BaseModel):
    path: str = Field(min_length=1, max_length=4096)
    max_chars: int | None = Field(default=None, ge=1, le=1_000_000)
