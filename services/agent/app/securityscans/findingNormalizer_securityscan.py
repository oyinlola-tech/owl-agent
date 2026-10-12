from __future__ import annotations

import hashlib

from ..guards.secretScrub_guard import redact_secrets_in_text

MAX_FINDINGS_PER_TOOL = 500
NPM_SEVERITY_MAP = {
    "critical": "critical",
    "high": "high",
    "moderate": "medium",
    "low": "low",
    "info": "info",
}
SEMGREP_SEVERITY_MAP = {"ERROR": "high", "WARNING": "medium", "INFO": "low"}
BANDIT_SEVERITY_MAP = {"HIGH": "high", "MEDIUM": "medium", "LOW": "low"}


def build_fingerprint(tool: str, parts: list) -> str:
    raw = tool + "|" + "|".join(str(p) for p in parts)
    return hashlib.sha256(raw.encode("utf-8", "replace")).hexdigest()[:24]


def clean_text(value: object, limit: int = 600) -> str:
    # Security: scanner output can echo attacker-controlled strings from the scanned code, so
    # it is treated as data: trimmed and run through the secret redactor before it is stored.
    text = str(value if value is not None else "")[:limit]
    return redact_secrets_in_text(text)[0]


def to_int_or_none(value: object) -> int | None:
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def make_finding(
    tool: str,
    severity: str,
    category: str,
    title: str,
    file: str,
    line: object,
    message: str,
    cwe: str,
    fingerprint_parts: list,
) -> dict:
    return {
        "tool": tool,
        "severity": severity,
        "category": category,
        "title": clean_text(title, 200),
        "file": clean_text(file, 400),
        "line": to_int_or_none(line),
        "message": clean_text(message),
        "cwe": clean_text(cwe, 60),
        "fingerprint": build_fingerprint(tool, fingerprint_parts),
    }


def normalize_gitleaks(parsed: object) -> list[dict]:
    out: list[dict] = []
    for item in parsed if isinstance(parsed, list) else []:
        if not isinstance(item, dict):
            continue
        file = str(item.get("File", ""))
        if "/.owl-scan-" in "/" + file or file.startswith(".owl-scan-"):
            continue
        rule = str(item.get("RuleID", "secret"))
        out.append(
            make_finding(
                "gitleaks",
                "high",
                "secret",
                f"Leaked credential ({rule})",
                file,
                item.get("StartLine"),
                item.get("Description", ""),
                "CWE-798",
                [item.get("Fingerprint") or rule, file, item.get("StartLine")],
            )
        )
    return out[:MAX_FINDINGS_PER_TOOL]


def normalize_bandit(parsed: object) -> list[dict]:
    results = parsed.get("results", []) if isinstance(parsed, dict) else []
    out: list[dict] = []
    for item in results if isinstance(results, list) else []:
        if not isinstance(item, dict):
            continue
        cwe = item.get("issue_cwe") or {}
        cwe_id = f"CWE-{cwe.get('id')}" if isinstance(cwe, dict) and cwe.get("id") else ""
        out.append(
            make_finding(
                "bandit",
                BANDIT_SEVERITY_MAP.get(str(item.get("issue_severity", "")).upper(), "low"),
                "sast",
                str(item.get("test_name") or item.get("test_id") or "issue"),
                item.get("filename", ""),
                item.get("line_number"),
                item.get("issue_text", ""),
                cwe_id,
                [item.get("test_id"), item.get("filename"), item.get("line_number")],
            )
        )
    return out[:MAX_FINDINGS_PER_TOOL]


def extract_semgrep_cwe(metadata: object) -> str:
    if not isinstance(metadata, dict):
        return ""
    cwe = metadata.get("cwe")
    if isinstance(cwe, list):
        return str(cwe[0]) if cwe else ""
    return str(cwe or "")


def normalize_semgrep(parsed: object) -> list[dict]:
    results = parsed.get("results", []) if isinstance(parsed, dict) else []
    out: list[dict] = []
    for item in results if isinstance(results, list) else []:
        if not isinstance(item, dict):
            continue
        extra = item.get("extra", {}) if isinstance(item.get("extra"), dict) else {}
        metadata = extra.get("metadata", {})
        start = item.get("start", {}) if isinstance(item.get("start"), dict) else {}
        out.append(
            make_finding(
                "semgrep",
                SEMGREP_SEVERITY_MAP.get(str(extra.get("severity", "")).upper(), "low"),
                str((metadata or {}).get("category", "sast")),
                str(item.get("check_id", "rule")),
                item.get("path", ""),
                start.get("line"),
                extra.get("message", ""),
                extract_semgrep_cwe(metadata),
                [item.get("check_id"), item.get("path"), start.get("line")],
            )
        )
    return out[:MAX_FINDINGS_PER_TOOL]


def normalize_pip_audit(parsed: object) -> list[dict]:
    if isinstance(parsed, dict):
        dependencies = parsed.get("dependencies", [])
    else:
        dependencies = parsed
    out: list[dict] = []
    for dep in dependencies if isinstance(dependencies, list) else []:
        if not isinstance(dep, dict):
            continue
        name = str(dep.get("name", ""))
        version = str(dep.get("version", ""))
        for vuln in dep.get("vulns", []) if isinstance(dep.get("vulns"), list) else []:
            if not isinstance(vuln, dict):
                continue
            vuln_id = str(vuln.get("id", ""))
            out.append(
                make_finding(
                    "pip-audit",
                    "high",
                    "dependency",
                    f"{name} {version}: {vuln_id}",
                    name,
                    None,
                    vuln.get("description", ""),
                    "",
                    [name, version, vuln_id],
                )
            )
    return out[:MAX_FINDINGS_PER_TOOL]


def normalize_npm_audit(parsed: object) -> list[dict]:
    vulns = parsed.get("vulnerabilities", {}) if isinstance(parsed, dict) else {}
    out: list[dict] = []
    for name, info in vulns.items() if isinstance(vulns, dict) else []:
        if not isinstance(info, dict):
            continue
        severity = NPM_SEVERITY_MAP.get(str(info.get("severity", "")).lower(), "medium")
        rng = str(info.get("range", ""))
        out.append(
            make_finding(
                "npm-audit",
                severity,
                "dependency",
                f"{name}: vulnerable dependency",
                str(name),
                None,
                f"affected range {rng}",
                "",
                [name, severity, rng],
            )
        )
    return out[:MAX_FINDINGS_PER_TOOL]


def normalize_cargo_audit(parsed: object) -> list[dict]:
    block = parsed.get("vulnerabilities", {}) if isinstance(parsed, dict) else {}
    entries = block.get("list", []) if isinstance(block, dict) else []
    out: list[dict] = []
    for item in entries if isinstance(entries, list) else []:
        if not isinstance(item, dict):
            continue
        advisory = item.get("advisory", {}) if isinstance(item.get("advisory"), dict) else {}
        package = item.get("package", {}) if isinstance(item.get("package"), dict) else {}
        name = str(package.get("name", ""))
        out.append(
            make_finding(
                "cargo-audit",
                "high",
                "dependency",
                f"{name}: {advisory.get('id', 'advisory')}",
                name,
                None,
                advisory.get("title", ""),
                "",
                [advisory.get("id"), name, package.get("version")],
            )
        )
    return out[:MAX_FINDINGS_PER_TOOL]


FINDING_NORMALIZERS = {
    "bandit": normalize_bandit,
    "semgrep": normalize_semgrep,
    "pip-audit": normalize_pip_audit,
    "npm-audit": normalize_npm_audit,
    "cargo-audit": normalize_cargo_audit,
    "gitleaks": normalize_gitleaks,
}


def normalize_tool_output(tool: str, parsed: object) -> list[dict]:
    normalizer = FINDING_NORMALIZERS.get(tool)
    return normalizer(parsed) if normalizer is not None else []
