from __future__ import annotations

import os
import shutil
from collections.abc import Callable
from dataclasses import dataclass, field

_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(_HERE))))
OWL_SEMGREP_RULES_PATH = os.path.join(_REPO_ROOT, "security", "scanners", "owlRules.scanner.yml")

PYTHON_MANIFEST_FILES = ("requirements.txt", "pyproject.toml", "setup.py", "setup.cfg", "Pipfile")


@dataclass
class ScannerPlan:
    argv: list[str]
    report_file: str | None = None
    aux_files: list[tuple[str, str]] = field(default_factory=list)


@dataclass
class ScannerSpec:
    name: str
    binary: str
    build_plan: Callable[[str, str], ScannerPlan]
    applies: Callable[[str], bool]
    not_applicable_reason: str

    def is_installed(self) -> bool:
        return shutil.which(self.binary) is not None


def project_has_python_sources(project_path: str) -> bool:
    for _dirpath, dirnames, filenames in os.walk(project_path):
        dirnames[:] = [
            d for d in dirnames if not d.startswith(".") and d not in ("node_modules", "target")
        ]
        if any(name.endswith(".py") for name in filenames):
            return True
    return False


def project_has_any_of(project_path: str, names: tuple[str, ...]) -> bool:
    return any(os.path.isfile(os.path.join(project_path, name)) for name in names)


def read_owl_semgrep_rules() -> str:
    try:
        with open(OWL_SEMGREP_RULES_PATH, encoding="utf-8") as handle:
            return handle.read()
    except OSError:
        return ""


def build_bandit_plan(project_path: str, slug: str) -> ScannerPlan:
    report = f".owl-scan-{slug}.json"
    return ScannerPlan(["bandit", "-r", ".", "-f", "json", "-o", report, "-q"], report_file=report)


def build_semgrep_plan(project_path: str, slug: str) -> ScannerPlan:
    report = f".owl-scan-{slug}.json"
    rules = f".owl-scan-{slug}-rules.yml"
    argv = [
        "semgrep",
        "scan",
        "--quiet",
        "--metrics",
        "off",
        "--disable-version-check",
        "--no-git-ignore",
        "--json",
        "--output",
        report,
        "--config",
        rules,
        ".",
    ]
    return ScannerPlan(argv, report_file=report, aux_files=[(rules, read_owl_semgrep_rules())])


def build_pip_audit_plan(project_path: str, slug: str) -> ScannerPlan:
    return ScannerPlan(["pip-audit", "-f", "json", "--progress-spinner", "off"])


def build_npm_audit_plan(project_path: str, slug: str) -> ScannerPlan:
    return ScannerPlan(["npm", "audit", "--json", "--package-lock-only"])


def build_cargo_audit_plan(project_path: str, slug: str) -> ScannerPlan:
    return ScannerPlan(["cargo", "audit", "--json"])


def build_gitleaks_plan(project_path: str, slug: str) -> ScannerPlan:
    report = f".owl-scan-{slug}.json"
    argv = ["gitleaks", "dir", "--no-banner", "--redact", "-f", "json", "-r", report, "."]
    return ScannerPlan(argv, report_file=report)


def build_scanner_catalog() -> list[ScannerSpec]:
    return [
        ScannerSpec(
            "bandit", "bandit", build_bandit_plan, project_has_python_sources, "no Python sources"
        ),
        ScannerSpec("semgrep", "semgrep", build_semgrep_plan, lambda _p: True, ""),
        ScannerSpec(
            "pip-audit",
            "pip-audit",
            build_pip_audit_plan,
            lambda p: project_has_any_of(p, PYTHON_MANIFEST_FILES),
            "no Python dependency manifest",
        ),
        ScannerSpec(
            "npm-audit",
            "npm",
            build_npm_audit_plan,
            lambda p: project_has_any_of(p, ("package-lock.json",)),
            "no package-lock.json",
        ),
        ScannerSpec(
            "cargo-audit",
            "cargo",
            build_cargo_audit_plan,
            lambda p: project_has_any_of(p, ("Cargo.lock",)),
            "no Cargo.lock",
        ),
        ScannerSpec("gitleaks", "gitleaks", build_gitleaks_plan, lambda _p: True, ""),
    ]
