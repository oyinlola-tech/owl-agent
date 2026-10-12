from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from typing import Literal

RequirementKind = Literal["tests", "typecheck", "lint", "build", "custom"]
RequirementSource = Literal[
    "project_manifest",
    "project_configuration",
    "task_requirement",
    "user_requested",
    "owl_inferred",
]

REQUIREMENT_KIND_ORDER: dict[str, int] = {
    "typecheck": 0,
    "tests": 1,
    "build": 2,
    "lint": 3,
    "custom": 4,
}

VERIFICATION_ENVIRONMENT = {"CI": "1", "FORCE_COLOR": "0", "NO_COLOR": "1"}


@dataclass(frozen=True)
class VerificationRequirement:
    kind: RequirementKind
    argv: tuple[str, ...]
    cwd: str
    source: RequirementSource
    detail: str
    required: bool = True
    timeout: float = 600.0
    safe: bool = True
    unsafe_reason: str = ""
    # Security: workspace files (fnmatch patterns) that decide what this check actually does.
    # If the task itself changed one of them, the check is no longer independent evidence.
    influences: tuple[str, ...] = ()
    # Security: what will really execute (e.g. the package.json script body), shown to the user.
    runs: str = ""
    id: str = field(default="")

    def __post_init__(self) -> None:
        if not self.id:
            digest = hashlib.sha256(
                json.dumps([self.kind, list(self.argv), self.cwd]).encode()
            ).hexdigest()[:12]
            object.__setattr__(self, "id", f"req-{digest}")

    @property
    def label(self) -> str:
        return " ".join(self.argv)

    def to_plain_dict(self) -> dict:
        data = asdict(self)
        data["argv"] = list(self.argv)
        data["influences"] = list(self.influences)
        return data

    @classmethod
    def from_plain_dict(cls, data: dict) -> VerificationRequirement:
        data = dict(data)
        data["argv"] = tuple(data.get("argv", ()))
        data["influences"] = tuple(data.get("influences", ()))
        return cls(**data)


@dataclass
class DetectionResult:
    requirements: list[VerificationRequirement]
    reason: str = ""

    @property
    def safe_requirements(self) -> list[VerificationRequirement]:
        return [r for r in self.requirements if r.safe]
