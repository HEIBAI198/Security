"""Application security code audit scanner.

The scanner wraps Semgrep CE for application security rules and Gitleaks for
secret discovery, then normalizes both outputs into the platform finding model.
"""

from __future__ import annotations

import base64
import gzip
import hashlib
import importlib.metadata
import json
import math
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from pydantic import BaseModel, ConfigDict, Field

from .config import IMPORT_WORKSPACE_DIR, ROOT
from .project_imports import ImportErrorDetail, load_import, load_latest_import


RULES_DIR = Path(__file__).resolve().parent / "rules" / "semgrep"
DEFAULT_TARGET = ROOT
CODE_AUDIT_STATE_DIR = ROOT / "storage" / "code_audit"
CODE_AUDIT_STATE_PATH = CODE_AUDIT_STATE_DIR / "state.json"
GITHUB_API_URL = os.environ.get("GITHUB_API_URL", "https://api.github.com").rstrip("/")
GITHUB_API_VERSION = os.environ.get("GITHUB_API_VERSION", "2022-11-28")
DEFAULT_SCAN_TIMEOUT_SECONDS = 90
MAX_SCAN_TIMEOUT_SECONDS = 600
MIN_SCANNER_TIMEOUT_SECONDS = 8
STANDARD_SCANNER_TIMEOUT_SECONDS = 45
GITLEAKS_SCANNER_TIMEOUT_SECONDS = 30
BANDIT_SCANNER_TIMEOUT_SECONDS = 30
CHECKOV_SCANNER_TIMEOUT_SECONDS = 45
VERSION_TIMEOUT_SECONDS = 3
CHECKOV_FRAMEWORKS = ("dockerfile", "github_actions", "terraform", "kubernetes", "cloudformation")
CHECKOV_TARGET_FILENAMES = {
    "Dockerfile",
    ".dockerignore",
}
CHECKOV_TARGET_PREFIXES = (
    ".github/workflows/",
)
CHECKOV_TARGET_SUFFIXES = (
    ".Dockerfile",
    ".tf",
    ".tfvars",
)
DEFAULT_EXCLUDES = {
    ".git",
    ".venv",
    ".venv-1",
    ".venv-cyclonedx",
    "venv",
    "env",
    "__pycache__",
    "node_modules",
    "dist",
    "build",
    "coverage",
}
WORKSPACE_EXCLUDES = {"storage", "server-8000.err.log", "server-8000.out.log", "server-8001.err.log", "server-8001.out.log"}
TEXT_FILE_SUFFIXES = {
    ".cfg",
    ".conf",
    ".config",
    ".env",
    ".ini",
    ".java",
    ".js",
    ".json",
    ".jsx",
    ".properties",
    ".py",
    ".rb",
    ".sh",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".yaml",
    ".yml",
}
SECRET_ASSIGNMENT_RE = re.compile(
    r"(?i)\b(aws_access_key_id|aws_secret_access_key|api[_-]?key|access[_-]?token|auth[_-]?token|"
    r"secret|client[_-]?secret|password|passwd|private[_-]?key)\b\s*[:=]\s*[\"']?([A-Za-z0-9_./+=:-]{16,})[\"']?"
)
SECRET_TOKEN_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("aws-access-token", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("github-pat", re.compile(r"\bghp_[A-Za-z0-9_]{36,}\b")),
    ("openai-api-key", re.compile(r"\bsk-[A-Za-z0-9]{20,}\b")),
    ("jwt-token", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")),
]
GITLEAKS_PATH_ALLOWLISTS = [
    r"(^|[\\/])\.git([\\/]|$)",
    r"(^|[\\/])\.venv([\\/]|$)",
    r"(^|[\\/])\.venv-[^\\/]+([\\/]|$)",
    r"(^|[\\/])venv([\\/]|$)",
    r"(^|[\\/])env([\\/]|$)",
    r"(^|[\\/])__pycache__([\\/]|$)",
    r"(^|[\\/])node_modules([\\/]|$)",
    r"(^|[\\/])dist([\\/]|$)",
    r"(^|[\\/])build([\\/]|$)",
    r"(^|[\\/])coverage([\\/]|$)",
    r"(^|[\\/])storage([\\/]|$)",
    r"package-lock\.json$",
]

SEMGREP_RULE_METADATA: dict[str, dict[str, Any]] = {
    "supplyguard.python.sql-string-concat": {
        "category": "SQL 拼接",
        "severity": "high",
        "score": 82,
        "cwe": "CWE-89",
        "recommendation": "使用参数化查询；动态排序、字段名、表名等不能参数化的位置必须使用白名单映射。",
    },
    "supplyguard.python.sql-f-string": {
        "category": "SQL 拼接",
        "severity": "high",
        "score": 82,
        "cwe": "CWE-89",
        "recommendation": "使用参数化查询替代 f-string 拼接 SQL；动态字段使用白名单映射。",
    },
    "supplyguard.javascript.sql-template-expression": {
        "category": "SQL 拼接",
        "severity": "high",
        "score": 82,
        "cwe": "CWE-89",
        "recommendation": "使用数据库驱动或 ORM 的参数化查询接口，禁止把用户输入插入 SQL 模板字符串。",
    },
    "supplyguard.python.os-system": {
        "category": "命令执行风险",
        "severity": "high",
        "score": 86,
        "cwe": "CWE-78",
        "recommendation": "避免直接拼接系统命令；改用参数数组、白名单命令和最小权限执行环境。",
    },
    "supplyguard.python.subprocess-shell-true": {
        "category": "命令执行风险",
        "severity": "high",
        "score": 88,
        "cwe": "CWE-78",
        "recommendation": "禁用 shell=True，使用参数数组调用 subprocess，并对白名单参数做严格校验。",
    },
    "supplyguard.javascript.child-process-exec": {
        "category": "命令执行风险",
        "severity": "high",
        "score": 86,
        "cwe": "CWE-78",
        "recommendation": "避免 child_process.exec 执行可拼接命令；使用 execFile/spawn 参数数组并验证输入。",
    },
    "supplyguard.javascript.child-process-spawn-shell": {
        "category": "命令执行风险",
        "severity": "high",
        "score": 86,
        "cwe": "CWE-78",
        "recommendation": "不要在 spawn/execFile 中启用 shell；如必须启用，需要白名单命令和参数。",
    },
    "supplyguard.python.pickle-load": {
        "category": "危险反序列化",
        "severity": "critical",
        "score": 92,
        "cwe": "CWE-502",
        "recommendation": "不要反序列化不可信 pickle 数据；改用 JSON 等安全格式，或加入签名校验和隔离执行。",
    },
    "supplyguard.python.yaml-load": {
        "category": "危险反序列化",
        "severity": "high",
        "score": 84,
        "cwe": "CWE-502",
        "recommendation": "使用 yaml.safe_load 或显式 SafeLoader，避免加载可构造任意对象的 YAML。",
    },
    "supplyguard.javascript.deserialize": {
        "category": "危险反序列化",
        "severity": "critical",
        "score": 90,
        "cwe": "CWE-502",
        "recommendation": "不要反序列化不可信输入；替换为 JSON.parse 并对 schema 做校验。",
    },
    "supplyguard.react.dangerously-set-inner-html": {
        "category": "XSS 简单规则",
        "severity": "high",
        "score": 80,
        "cwe": "CWE-79",
        "recommendation": "避免 dangerouslySetInnerHTML；如确需渲染 HTML，先使用可信 HTML sanitizer 并限制输入来源。",
    },
    "supplyguard.javascript.dom-inner-html": {
        "category": "XSS 简单规则",
        "severity": "medium",
        "score": 70,
        "cwe": "CWE-79",
        "recommendation": "不要把未净化输入赋给 innerHTML/outerHTML；使用 textContent 或模板自动转义。",
    },
    "supplyguard.javascript.document-write": {
        "category": "XSS 简单规则",
        "severity": "medium",
        "score": 68,
        "cwe": "CWE-79",
        "recommendation": "避免 document.write；使用安全 DOM API，并对任何 HTML 输入做净化。",
    },
}
SEVERITY_SCORE = {
    "critical": 95,
    "high": 82,
    "medium": 62,
    "low": 38,
}


class CodeAuditRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    import_id: str | None = Field(default=None, alias="importId")
    target_path: str | None = Field(
        default=None,
        description="Path to scan. Relative paths are resolved from the project root.",
    )
    allow_external: bool = Field(default=False, alias="allowExternal")
    include_gitleaks: bool = True
    include_semgrep: bool = True
    include_bandit: bool = True
    include_checkov: bool = True
    timeout_seconds: int | None = Field(default=None, ge=10, le=MAX_SCAN_TIMEOUT_SECONDS)


class GitHubCodeScanningUploadRequest(BaseModel):
    owner: str = Field(min_length=1, max_length=100)
    repo: str = Field(min_length=1, max_length=100)
    ref: str = Field(default="refs/heads/main", min_length=1, max_length=300)
    commit_sha: str | None = Field(default=None, min_length=7, max_length=80)
    checkout_uri: str | None = Field(default=None, max_length=500)
    token: str | None = Field(default=None, min_length=1, max_length=400)


class GitHubCodeScanningStatusRequest(BaseModel):
    owner: str = Field(min_length=1, max_length=100)
    repo: str = Field(min_length=1, max_length=100)
    sarif_id: str = Field(min_length=1, max_length=120)
    token: str | None = Field(default=None, min_length=1, max_length=400)


@dataclass(frozen=True)
class CodeAuditFinding:
    id: str
    rule_id: str
    title: str
    category: str
    severity: str
    score: int
    risk_file: str
    line: int
    end_line: int | None
    evidence: str
    recommendation: str
    scanner: str
    confidence: str = "medium"
    cwe: str | None = None
    fingerprint: str = ""


@dataclass(frozen=True)
class ScannerStatus:
    name: str
    available: bool
    command: str
    version: str | None = None
    error: str | None = None
    state: str = "ok"


@dataclass(frozen=True)
class CodeAuditResult:
    scan_id: str
    generated_at: str
    target_path: str
    target: dict[str, Any]
    findings: list[CodeAuditFinding]
    scanners: list[ScannerStatus]
    summary: dict[str, Any]
    report: str
    sarif: dict[str, Any]
    errors: list[str] = field(default_factory=list)


def run_code_audit(
    payload: CodeAuditRequest | None = None,
    *,
    timeout_seconds: int = DEFAULT_SCAN_TIMEOUT_SECONDS,
) -> CodeAuditResult:
    started_at = time.monotonic()
    request = payload or CodeAuditRequest()
    requested_timeout = request.timeout_seconds or timeout_seconds
    scan_timeout = max(10, min(MAX_SCAN_TIMEOUT_SECONDS, int(requested_timeout)))
    deadline = started_at + scan_timeout
    target, target_info = resolve_scan_target(request)
    target_info = {**target_info, "path": str(target)}
    scan_id = datetime.now(UTC).strftime("audit-%Y%m%d%H%M%S")
    generated_at = datetime.now(UTC).isoformat()
    errors: list[str] = []
    statuses: list[ScannerStatus] = []
    findings: list[CodeAuditFinding] = []

    if request.include_semgrep:
        tool_timeout = scanner_timeout(deadline, STANDARD_SCANNER_TIMEOUT_SECONDS)
        if tool_timeout is None:
            semgrep_findings, status, semgrep_errors = scanner_budget_exhausted("Semgrep CE", "semgrep")
        else:
            semgrep_findings, status, semgrep_errors = run_semgrep(target, tool_timeout, deadline=deadline)
        findings.extend(semgrep_findings)
        statuses.append(status)
        errors.extend(semgrep_errors)
    else:
        statuses.append(skipped_scanner_status("Semgrep CE", "semgrep"))

    if request.include_gitleaks:
        tool_timeout = scanner_timeout(deadline, GITLEAKS_SCANNER_TIMEOUT_SECONDS)
        if tool_timeout is None:
            gitleaks_findings, status, gitleaks_errors = scanner_budget_exhausted("Gitleaks", "gitleaks")
        else:
            gitleaks_findings, status, gitleaks_errors = run_gitleaks(target, tool_timeout, deadline=deadline)
        findings.extend(gitleaks_findings)
        statuses.append(status)
        errors.extend(gitleaks_errors)
    else:
        statuses.append(skipped_scanner_status("Gitleaks", "gitleaks"))

    if request.include_bandit:
        tool_timeout = scanner_timeout(deadline, BANDIT_SCANNER_TIMEOUT_SECONDS)
        if tool_timeout is None:
            bandit_findings, status, bandit_errors = scanner_budget_exhausted("Bandit", "bandit")
        else:
            bandit_findings, status, bandit_errors = run_bandit(target, tool_timeout, deadline=deadline)
        findings.extend(bandit_findings)
        statuses.append(status)
        errors.extend(bandit_errors)
    else:
        statuses.append(skipped_scanner_status("Bandit", "bandit"))

    if request.include_checkov:
        tool_timeout = scanner_timeout(deadline, CHECKOV_SCANNER_TIMEOUT_SECONDS)
        if tool_timeout is None:
            checkov_findings, status, checkov_errors = scanner_budget_exhausted("Checkov", "checkov")
        else:
            checkov_findings, status, checkov_errors = run_checkov(target, tool_timeout, deadline=deadline)
        findings.extend(checkov_findings)
        statuses.append(status)
        errors.extend(checkov_errors)
    else:
        statuses.append(skipped_scanner_status("Checkov", "checkov"))

    unique_findings = [
        finding
        for finding in dedupe_findings(findings)
        if not finding_path_is_excluded(finding, target)
    ]
    active_findings, state_summary = apply_audit_state(
        unique_findings,
        target_info,
        scan_id,
        generated_at,
        statuses,
    )
    summary = build_summary(active_findings, statuses)
    summary["target"] = target_info
    summary["duration_seconds"] = round(time.monotonic() - started_at, 2)
    summary["timeout_seconds"] = scan_timeout
    summary.update(state_summary)
    report = build_code_audit_report(target, active_findings, summary, statuses, errors)
    sarif = build_sarif(active_findings, target_info)

    return CodeAuditResult(
        scan_id=scan_id,
        generated_at=generated_at,
        target_path=str(target),
        target=target_info,
        findings=active_findings,
        scanners=statuses,
        summary=summary,
        report=report,
        sarif=sarif,
        errors=errors,
    )

def resolve_scan_target(request: CodeAuditRequest) -> tuple[Path, dict[str, Any]]:
    if request.import_id:
        return import_scan_target(request.import_id)

    if request.target_path:
        return path_scan_target(request.target_path, allow_external=request.allow_external)

    latest_import = load_latest_import()
    if latest_import is not None:
        source_path = Path(str(latest_import["sourcePath"]))
        if source_path.exists():
            return source_path.resolve(), {
                "importId": latest_import["importId"],
                "projectName": latest_import["projectName"],
                "sourceType": latest_import["sourceType"],
            }

    return DEFAULT_TARGET, {"sourceType": "workspace", "projectName": DEFAULT_TARGET.name}


def import_scan_target(import_id: str) -> tuple[Path, dict[str, Any]]:
    try:
        metadata = load_import(import_id)
    except ImportErrorDetail as exc:
        raise ValueError(str(exc)) from exc

    source_path = Path(str(metadata["sourcePath"])).resolve()
    if not source_path.exists() or not source_path.is_dir():
        raise ValueError(f"Imported project source path is not available: {source_path}")
    return source_path, {
        "importId": metadata["importId"],
        "projectName": metadata["projectName"],
        "sourceType": metadata["sourceType"],
    }


def path_scan_target(target_path: str, *, allow_external: bool = False) -> tuple[Path, dict[str, Any]]:
    candidate = Path(target_path).expanduser()
    if not candidate.is_absolute():
        candidate = ROOT / candidate
    candidate = candidate.resolve()

    if not candidate.exists():
        raise ValueError(f"Scan target does not exist: {candidate}")
    if not allow_external and not is_within_root(candidate):
        raise ValueError(f"Scan target must stay inside project root: {ROOT}")
    return candidate, {"sourceType": "path", "projectName": candidate.name}


def is_within_root(path: Path) -> bool:
    try:
        path.resolve().relative_to(ROOT.resolve())
        return True
    except ValueError:
        return False


def skipped_scanner_status(name: str, command: str) -> ScannerStatus:
    return ScannerStatus(name=name, available=False, command=command, error="Skipped", state="skipped")


def scanner_timeout(deadline: float, cap_seconds: int) -> int | None:
    remaining_seconds = int(max(0, deadline - time.monotonic()))
    timeout = min(cap_seconds, remaining_seconds)
    if timeout < MIN_SCANNER_TIMEOUT_SECONDS:
        return None
    return timeout


def scanner_budget_exhausted(
    name: str,
    command: str,
) -> tuple[list[CodeAuditFinding], ScannerStatus, list[str]]:
    message = "Time budget exhausted"
    return (
        [],
        ScannerStatus(name=name, available=False, command=command, error=message, state="skipped"),
        [f"{name}: {message}"],
    )


def run_semgrep(
    target: Path,
    timeout_seconds: int,
    *,
    deadline: float | None = None,
) -> tuple[list[CodeAuditFinding], ScannerStatus, list[str]]:
    command = find_python_tool("semgrep")
    if command is None:
        return (
            [],
            ScannerStatus(
                name="Semgrep CE",
                available=False,
                command="semgrep",
                error="Semgrep CLI not found. Install with `python -m pip install semgrep`.",
                state="missing",
            ),
            ["Semgrep CLI not found"],
        )

    local_deadline = min(deadline or (time.monotonic() + timeout_seconds), time.monotonic() + timeout_seconds)
    version_timeout = max(1, min(VERSION_TIMEOUT_SECONDS, timeout_seconds))
    version = None if os.name == "nt" else get_tool_version(semgrep_command([command, "--version"]), timeout_seconds=version_timeout)
    command_timeout = scanner_timeout(local_deadline, timeout_seconds)
    if command_timeout is None:
        return scanner_budget_exhausted("Semgrep CE", command)
    cmd = [
        command,
        "scan",
        "--config",
        str(RULES_DIR),
        "--json",
        "--no-git-ignore",
        "--disable-version-check",
        "--metrics",
        "off",
    ]
    for excluded in sorted(excludes_for_target(target)):
        cmd.extend(["--exclude", excluded])
    cmd.append(str(target))

    process = run_command(semgrep_command(cmd), command_timeout)
    if process.timeout:
        return (
            [],
            ScannerStatus(name="Semgrep CE", available=True, command=command, version=version, error="Timed out", state="failed"),
            ["Semgrep scan timed out"],
        )
    if process.stdout.strip() == "":
        error = process.stderr.strip() or "Semgrep returned no JSON output"
        return (
            [],
            ScannerStatus(name="Semgrep CE", available=True, command=command, version=version, error=error, state="failed"),
            [error],
        )

    try:
        payload = json.loads(process.stdout)
    except json.JSONDecodeError as exc:
        error = f"Failed to parse Semgrep JSON: {exc}"
        return (
            [],
            ScannerStatus(name="Semgrep CE", available=True, command=command, version=version, error=error, state="failed"),
            [error],
        )

    errors = [str(item) for item in payload.get("errors", [])]
    findings = [semgrep_to_finding(item, index) for index, item in enumerate(payload.get("results", []), start=1)]
    status_error = None
    if process.returncode not in (0, 1):
        status_error = process.stderr.strip() or f"Semgrep exited with {process.returncode}"
        errors.append(status_error)

    return (
        findings,
        ScannerStatus(
            name="Semgrep CE",
            available=True,
            command=command,
            version=version,
            error=status_error,
            state="failed" if status_error else "ok",
        ),
        errors,
    )


def run_gitleaks(
    target: Path,
    timeout_seconds: int,
    *,
    deadline: float | None = None,
) -> tuple[list[CodeAuditFinding], ScannerStatus, list[str]]:
    command = find_gitleaks_command()
    if command is None:
        fallback_findings = run_builtin_secret_scan(target)
        return (
            fallback_findings,
            ScannerStatus(
                name="Gitleaks",
                available=False,
                command="gitleaks",
                error="Gitleaks CLI not found; used built-in secret patterns as a fallback.",
                state="fallback",
            ),
            ["Gitleaks CLI not found; built-in secret fallback executed"],
        )

    local_deadline = min(deadline or (time.monotonic() + timeout_seconds), time.monotonic() + timeout_seconds)
    version_timeout = max(1, min(VERSION_TIMEOUT_SECONDS, timeout_seconds))
    version = get_tool_version([command, "version"], timeout_seconds=version_timeout)
    command_timeout = scanner_timeout(local_deadline, timeout_seconds)
    if command_timeout is None:
        return scanner_budget_exhausted("Gitleaks", command)
    with tempfile.NamedTemporaryFile(prefix="supplyguard-gitleaks-", suffix=".json", delete=False) as handle:
        report_path = Path(handle.name)
    with tempfile.NamedTemporaryFile(prefix="supplyguard-gitleaks-", suffix=".toml", delete=False) as handle:
        config_path = Path(handle.name)

    try:
        config_path.write_text(build_gitleaks_config(), encoding="utf-8")
        cmd = [
            command,
            "dir",
            str(target),
            "--config",
            str(config_path),
            "--no-banner",
            "--log-level",
            "error",
            "--redact",
            "--report-format",
            "json",
            "--report-path",
            str(report_path),
        ]

        process = run_command(cmd, command_timeout)
        if process.timeout:
            return (
                [],
                ScannerStatus(name="Gitleaks", available=True, command=command, version=version, error="Timed out", state="failed"),
                ["Gitleaks scan timed out"],
            )

        if report_path.exists() and report_path.stat().st_size > 0:
            try:
                payload = json.loads(report_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                error = f"Failed to parse Gitleaks JSON: {exc}"
                return (
                    [],
                    ScannerStatus(name="Gitleaks", available=True, command=command, version=version, error=error, state="failed"),
                    [error],
                )
        else:
            payload = []

        findings = [gitleaks_to_finding(item, index) for index, item in enumerate(payload, start=1)]
        status_error = None
        if process.returncode not in (0, 1):
            status_error = process.stderr.strip() or f"Gitleaks exited with {process.returncode}"

        return (
            findings,
            ScannerStatus(
                name="Gitleaks",
                available=True,
                command=command,
                version=version,
                error=status_error,
                state="failed" if status_error else "ok",
            ),
            [status_error] if status_error else [],
        )
    finally:
        try:
            report_path.unlink(missing_ok=True)
        except OSError:
            pass
        try:
            config_path.unlink(missing_ok=True)
        except OSError:
            pass


def run_bandit(
    target: Path,
    timeout_seconds: int,
    *,
    deadline: float | None = None,
) -> tuple[list[CodeAuditFinding], ScannerStatus, list[str]]:
    command = find_python_tool("bandit")
    if command is None:
        return (
            [],
            ScannerStatus(
                name="Bandit",
                available=False,
                command="bandit",
                error="Bandit CLI not found. Install with `python -m pip install bandit`.",
                state="missing",
            ),
            ["Bandit CLI not found"],
        )

    local_deadline = min(deadline or (time.monotonic() + timeout_seconds), time.monotonic() + timeout_seconds)
    version_timeout = max(1, min(VERSION_TIMEOUT_SECONDS, timeout_seconds))
    version = get_tool_version([command, "--version"], timeout_seconds=version_timeout)
    target_files = bandit_target_files(target)
    if not target_files:
        return (
            [],
            ScannerStatus(
                name="Bandit",
                available=True,
                command=command,
                version=version,
                error="No Python source files found",
                state="skipped",
            ),
            [],
        )
    command_timeout = scanner_timeout(local_deadline, timeout_seconds)
    if command_timeout is None:
        return scanner_budget_exhausted("Bandit", command)
    cmd = [
        command,
        "-f",
        "json",
        "-q",
        *[str(path) for path in target_files],
    ]

    process = run_command(cmd, command_timeout)
    if process.timeout:
        return (
            [],
            ScannerStatus(name="Bandit", available=True, command=command, version=version, error="Timed out", state="failed"),
            ["Bandit scan timed out"],
        )

    output = process.stdout.strip()
    if not output:
        status_error = None if process.returncode in (0, 1) else (process.stderr.strip() or f"Bandit exited with {process.returncode}")
        return (
            [],
            ScannerStatus(
                name="Bandit",
                available=True,
                command=command,
                version=version,
                error=status_error,
                state="failed" if status_error else "ok",
            ),
            [status_error] if status_error else [],
        )

    try:
        payload = json.loads(output)
    except json.JSONDecodeError as exc:
        error = f"Failed to parse Bandit JSON: {exc}"
        return (
            [],
            ScannerStatus(name="Bandit", available=True, command=command, version=version, error=error, state="failed"),
            [error],
        )

    findings = [bandit_to_finding(item, index) for index, item in enumerate(payload.get("results", []), start=1)]
    errors = [str(item) for item in payload.get("errors", [])]
    status_error = None
    if process.returncode not in (0, 1):
        status_error = process.stderr.strip() or f"Bandit exited with {process.returncode}"
        errors.append(status_error)

    return (
        findings,
        ScannerStatus(
            name="Bandit",
            available=True,
            command=command,
            version=version,
            error=status_error,
            state="failed" if status_error else "ok",
        ),
        errors,
    )


def run_checkov(
    target: Path,
    timeout_seconds: int,
    *,
    deadline: float | None = None,
) -> tuple[list[CodeAuditFinding], ScannerStatus, list[str]]:
    command = find_python_tool("checkov")
    if command is None:
        return (
            [],
            ScannerStatus(
                name="Checkov",
                available=False,
                command="checkov",
                error="Checkov CLI not found. Install with `python -m pip install checkov`.",
                state="missing",
            ),
            ["Checkov CLI not found"],
        )

    target_files = checkov_target_files(target)
    local_deadline = min(deadline or (time.monotonic() + timeout_seconds), time.monotonic() + timeout_seconds)
    version_timeout = max(1, min(VERSION_TIMEOUT_SECONDS, timeout_seconds))
    version = get_checkov_version(command, timeout_seconds=version_timeout)
    if not target_files:
        return (
            [],
            ScannerStatus(
                name="Checkov",
                available=True,
                command=command,
                version=version,
                error="No Docker/CI/IaC configuration files found",
                state="skipped",
            ),
            [],
        )

    command_timeout = scanner_timeout(local_deadline, timeout_seconds)
    if command_timeout is None:
        return scanner_budget_exhausted("Checkov", command)
    cmd = [
        *checkov_command(command),
        "-f",
        *[str(path) for path in target_files],
        "-o",
        "json",
        "--quiet",
        "--compact",
        "--skip-download",
        "--framework",
        *CHECKOV_FRAMEWORKS,
    ]

    process = run_command(cmd, command_timeout)
    if process.timeout:
        return (
            [],
            ScannerStatus(name="Checkov", available=True, command=command, version=version, error="Timed out", state="failed"),
            ["Checkov scan timed out"],
        )

    output = process.stdout.strip()
    if not output:
        status_error = None if process.returncode in (0, 1) else (process.stderr.strip() or f"Checkov exited with {process.returncode}")
        return (
            [],
            ScannerStatus(
                name="Checkov",
                available=True,
                command=command,
                version=version,
                error=status_error,
                state="failed" if status_error else "ok",
            ),
            [status_error] if status_error else [],
        )

    try:
        payload = json.loads(output)
    except json.JSONDecodeError as exc:
        error = f"Failed to parse Checkov JSON: {exc}"
        return (
            [],
            ScannerStatus(name="Checkov", available=True, command=command, version=version, error=error, state="failed"),
            [error],
        )

    raw_results = flatten_checkov_results(payload)
    findings = [checkov_to_finding(item, index, target) for index, item in enumerate(raw_results, start=1)]
    status_error = None
    if process.returncode not in (0, 1):
        status_error = process.stderr.strip() or f"Checkov exited with {process.returncode}"

    return (
        findings,
        ScannerStatus(
            name="Checkov",
            available=True,
            command=command,
            version=version,
            error=status_error,
            state="failed" if status_error else "ok",
        ),
        [status_error] if status_error else [],
    )


def build_gitleaks_config() -> str:
    paths = "\n".join(f"  '''{item}'''," for item in GITLEAKS_PATH_ALLOWLISTS)
    return f"""title = "SupplyGuard Gitleaks Config"

[extend]
useDefault = true

[[allowlists]]
description = "Skip generated, dependency, and local storage directories"
paths = [
{paths}
]
"""


def excludes_for_target(target: Path) -> set[str]:
    excludes = set(DEFAULT_EXCLUDES)
    try:
        target.resolve().relative_to(IMPORT_WORKSPACE_DIR.resolve())
    except ValueError:
        excludes.update(WORKSPACE_EXCLUDES)
    return excludes


def excluded_child_paths(target: Path) -> list[Path]:
    if target.is_file():
        return []
    return [
        target / excluded
        for excluded in sorted(excludes_for_target(target))
        if (target / excluded).exists()
    ]


def finding_path_is_excluded(finding: CodeAuditFinding, target: Path) -> bool:
    if not finding.risk_file:
        return False
    normalized = finding.risk_file.replace("\\", "/").lstrip("/")
    if should_exclude_workspace_storage(target) and (normalized == "storage" or normalized.startswith("storage/")):
        return True
    path = Path(finding.risk_file)
    if not path.is_absolute():
        path = ROOT / path
    return should_skip_path_for_target(path, target)


def find_gitleaks_command() -> str | None:
    command = shutil.which("gitleaks")
    if command:
        return command

    local_app_data = os.environ.get("LOCALAPPDATA")
    if not local_app_data:
        return None

    package_root = Path(local_app_data) / "Microsoft" / "WinGet" / "Packages"
    candidates = sorted(
        package_root.glob("Gitleaks.Gitleaks_*/*gitleaks.exe"),
        key=lambda path: path.stat().st_mtime if path.exists() else 0,
        reverse=True,
    )
    return str(candidates[0]) if candidates else None


def run_builtin_secret_scan(target: Path) -> list[CodeAuditFinding]:
    findings: list[CodeAuditFinding] = []
    index = 1
    for path in iter_text_files(target):
        try:
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            continue

        for line_number, line in enumerate(lines, start=1):
            matches: list[tuple[str, str]] = []
            for rule_id, pattern in SECRET_TOKEN_PATTERNS:
                for match in pattern.finditer(line):
                    matches.append((rule_id, match.group(0)))

            assignment = SECRET_ASSIGNMENT_RE.search(line)
            if not matches and assignment and looks_like_secret(assignment.group(2)):
                matches.append(("hardcoded-secret-assignment", assignment.group(0)))

            for rule_id, evidence in matches:
                risk_file = relative_path(str(path))
                masked = mask_secret(normalize_evidence(evidence))
                findings.append(
                    CodeAuditFinding(
                        id=f"KEY-{index:04d}",
                        rule_id=f"builtin.{rule_id}",
                        title=f"硬编码密钥或敏感凭据：{rule_id}",
                        category="硬编码密钥",
                        severity="critical",
                        score=90,
                        risk_file=risk_file,
                        line=line_number,
                        end_line=None,
                        evidence=masked,
                        recommendation=(
                            "立即撤销并轮换该密钥，移出代码仓库，改用密钥管理服务或运行时环境变量注入，"
                            "并清理 Git 历史中的泄露记录。"
                        ),
                        scanner="builtin-secret-fallback",
                        confidence="medium",
                        cwe="CWE-798",
                        fingerprint=stable_fingerprint("builtin-secret", rule_id, risk_file, line_number, masked),
                    )
                )
                index += 1
    return findings

def iter_text_files(target: Path) -> list[Path]:
    if target.is_file():
        return [target] if should_scan_file(target) else []
    files: list[Path] = []
    for path in target.rglob("*"):
        if path.is_dir() or should_skip_path(path) or not should_scan_file(path):
            continue
        files.append(path)
    return files


def should_skip_path(path: Path) -> bool:
    try:
        relative_parts = path.resolve().relative_to(ROOT.resolve()).parts
    except ValueError:
        relative_parts = path.parts
    return any(part in DEFAULT_EXCLUDES or is_virtualenv_dir(part) for part in relative_parts)


def should_skip_path_for_target(path: Path, target: Path) -> bool:
    try:
        relative_parts = path.resolve().relative_to(target.resolve()).parts
    except ValueError:
        return should_skip_path(path)

    excludes = excludes_for_target(target)
    return any(part in excludes or is_virtualenv_dir(part) for part in relative_parts)


def is_virtualenv_dir(name: str) -> bool:
    lowered = name.lower()
    return lowered in {"venv", "env"} or lowered.startswith(".venv") or lowered.startswith("venv-")


def should_exclude_workspace_storage(target: Path) -> bool:
    try:
        target.resolve().relative_to(IMPORT_WORKSPACE_DIR.resolve())
        return False
    except ValueError:
        return True


def should_scan_file(path: Path) -> bool:
    if path.name == ".env" or path.name.endswith(".env"):
        return True
    if path.suffix.lower() not in TEXT_FILE_SUFFIXES:
        return False
    try:
        return path.stat().st_size <= 1024 * 1024
    except OSError:
        return False


def looks_like_secret(value: str) -> bool:
    if len(value) < 16:
        return False
    lowered = value.lower()
    if lowered in {"changeme", "password", "secret", "example", "placeholder"}:
        return False
    return shannon_entropy(value) >= 3.0


def shannon_entropy(value: str) -> float:
    if not value:
        return 0.0
    length = len(value)
    return -sum((count / length) * math.log2(count / length) for count in {char: value.count(char) for char in set(value)}.values())


@dataclass(frozen=True)
class CommandResult:
    returncode: int
    stdout: str
    stderr: str
    timeout: bool = False


def run_command(cmd: list[str], timeout_seconds: int) -> CommandResult:
    creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    try:
        process = subprocess.Popen(
            cmd,
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=tool_env(),
            creationflags=creationflags,
        )
        stdout, stderr = process.communicate(timeout=timeout_seconds)
        return CommandResult(process.returncode, stdout, stderr)
    except subprocess.TimeoutExpired as exc:
        kill_process_tree(process)
        stdout, stderr = process.communicate()
        return CommandResult(
            -1,
            _process_output_text(exc.stdout) or stdout or "",
            _process_output_text(exc.stderr) or stderr or "",
            timeout=True,
        )
    except OSError as exc:
        return CommandResult(-1, "", str(exc))


def kill_process_tree(process: subprocess.Popen[str]) -> None:
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        return

    try:
        os.killpg(process.pid, signal.SIGKILL)
    except OSError:
        process.kill()


def _process_output_text(value: str | bytes | None) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


def short_process_error(process: CommandResult, fallback: str) -> str:
    output = " ".join((process.stderr or process.stdout or "").split())
    if not output:
        return f"{fallback}: exited with {process.returncode}"
    return f"{fallback}: {output[:420]}"


def get_tool_version(cmd: list[str], *, timeout_seconds: int = 10) -> str | None:
    try:
        process = subprocess.run(
            cmd,
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_seconds,
            check=False,
            env=tool_env(),
        )
    except (OSError, subprocess.TimeoutExpired):
        return None

    output = (process.stdout or process.stderr).strip()
    return output.splitlines()[0] if output else None


def get_checkov_version(command: str, *, timeout_seconds: int = 10) -> str | None:
    output = ""
    try:
        process = subprocess.run(
            [*checkov_command(command), "--version"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_seconds,
            check=False,
            env=tool_env(),
        )
        output = f"{process.stdout}\n{process.stderr}"
    except (OSError, subprocess.TimeoutExpired):
        pass

    match = re.search(r"\b\d+\.\d+\.\d+\b", output)
    if match:
        return match.group(0)

    try:
        return importlib.metadata.version("checkov")
    except importlib.metadata.PackageNotFoundError:
        return None


def tool_env() -> dict[str, str]:
    env = os.environ.copy()
    script_dirs = [path for path in (project_venv_scripts_dir(), Path(sys.executable).resolve().parent) if path]
    env["PATH"] = os.pathsep.join(str(path) for path in script_dirs) + os.pathsep + env.get("PATH", "")
    venv_dir = project_venv_dir() or Path(sys.executable).resolve().parents[1]
    env["VIRTUAL_ENV"] = str(venv_dir)
    env.setdefault("SEMGREP_SEND_METRICS", "off")
    return env


def find_python_tool(name: str) -> str | None:
    script_dirs = [path for path in (project_venv_scripts_dir(), Path(sys.executable).resolve().parent) if path]
    suffixes = [".exe", ".cmd", ".bat", ""]
    for scripts_dir in script_dirs:
        for suffix in suffixes:
            candidate = scripts_dir / f"{name}{suffix}"
            if candidate.exists():
                return str(candidate)
    return shutil.which(name, path=tool_env().get("PATH"))


def semgrep_command(cmd: list[str]) -> list[str]:
    if os.name != "nt":
        return cmd
    executable = cmd[0]
    try:
        executable = str(Path(executable).resolve().relative_to(ROOT.resolve()))
    except (OSError, ValueError):
        pass
    command = " ".join(["$env:SEMGREP_SEND_METRICS='off';", "&", powershell_quote(executable), *[powershell_quote(arg) for arg in cmd[1:]]])
    return ["powershell", "-NoProfile", "-Command", command]


def powershell_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def project_venv_dir() -> Path | None:
    candidate = ROOT / ".venv"
    return candidate if candidate.exists() else None


def project_venv_scripts_dir() -> Path | None:
    venv_dir = project_venv_dir()
    if venv_dir is None:
        return None
    scripts_dir = venv_dir / ("Scripts" if os.name == "nt" else "bin")
    return scripts_dir if scripts_dir.exists() else None


def bandit_target_files(target: Path) -> list[Path]:
    if target.is_file():
        return [target] if target.suffix.lower() == ".py" else []

    files: list[Path] = []
    excludes = excludes_for_target(target)
    for current, dirnames, filenames in os.walk(target):
        current_path = Path(current)
        dirnames[:] = [
            dirname
            for dirname in dirnames
            if dirname not in excludes and not should_skip_path_for_target(current_path / dirname, target)
        ]
        for filename in filenames:
            path = current_path / filename
            if path.suffix.lower() == ".py":
                files.append(path)
    return sorted(files)


def checkov_command(command: str) -> list[str]:
    command_path = Path(command)
    if os.name == "nt" and command_path.suffix.lower() in {".cmd", ".bat", ""}:
        script = command_path.with_suffix("")
        if script.exists():
            tool_python = command_path.parent / "python.exe"
            return [str(tool_python if tool_python.exists() else sys.executable), str(script)]
    return [command]


def checkov_target_files(target: Path) -> list[Path]:
    if target.is_file():
        return [target] if is_checkov_target_file(target, target.parent) else []

    files: list[Path] = []
    excludes = excludes_for_target(target)
    for current, dirnames, filenames in os.walk(target):
        current_path = Path(current)
        dirnames[:] = [
            dirname
            for dirname in dirnames
            if dirname not in excludes and not should_skip_path_for_target(current_path / dirname, target)
        ]
        for filename in filenames:
            path = current_path / filename
            if is_checkov_target_file(path, target):
                files.append(path)
    return sorted(files)


def is_checkov_target_file(path: Path, root: Path) -> bool:
    try:
        relative = path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        relative = path.as_posix()

    if any(relative.startswith(prefix) for prefix in CHECKOV_TARGET_PREFIXES):
        return path.suffix.lower() in {".yaml", ".yml"}
    if path.name in CHECKOV_TARGET_FILENAMES:
        return True
    if path.name.startswith("docker-compose") and path.suffix.lower() in {".yaml", ".yml"}:
        return True
    if path.suffix in CHECKOV_TARGET_SUFFIXES:
        return True
    return False


def semgrep_to_finding(item: dict[str, Any], index: int) -> CodeAuditFinding:
    check_id = item.get("check_id", "semgrep.unknown")
    canonical_rule_id = canonical_semgrep_rule_id(check_id)
    metadata = SEMGREP_RULE_METADATA.get(canonical_rule_id, {})
    extra = item.get("extra", {})
    start = item.get("start", {})
    end = item.get("end", {})
    path = relative_path(item.get("path", ""))
    severity = metadata.get("severity") or normalize_semgrep_severity(extra.get("severity"))
    category = metadata.get("category") or extra.get("metadata", {}).get("category") or "应用安全风险"
    title = extra.get("message") or category
    raw_evidence = extra.get("lines")
    if not raw_evidence or str(raw_evidence).strip().lower() == "requires login":
        raw_evidence = read_line(path, start.get("line", 0))
    evidence = normalize_evidence(raw_evidence)
    recommendation = metadata.get("recommendation") or extra.get("metadata", {}).get(
        "recommendation",
        "请结合上下文确认输入来源，使用安全 API、参数化接口或显式白名单策略修复。",
    )
    cwe = metadata.get("cwe") or first_cwe(extra.get("metadata", {}).get("cwe"))
    fingerprint = stable_fingerprint("semgrep", canonical_rule_id, path, start.get("line", 0), evidence)

    return CodeAuditFinding(
        id=f"APP-{index:04d}",
        rule_id=canonical_rule_id,
        title=title,
        category=category,
        severity=severity,
        score=int(metadata.get("score") or SEVERITY_SCORE.get(severity, 60)),
        risk_file=path,
        line=int(start.get("line") or 1),
        end_line=int(end.get("line")) if end.get("line") else None,
        evidence=evidence,
        recommendation=recommendation,
        scanner="semgrep",
        confidence="medium",
        cwe=cwe,
        fingerprint=fingerprint,
    )


def canonical_semgrep_rule_id(check_id: str) -> str:
    marker = "supplyguard."
    position = check_id.rfind(marker)
    if position >= 0:
        return check_id[position:]
    return check_id


def gitleaks_to_finding(item: dict[str, Any], index: int) -> CodeAuditFinding:
    rule_id = item.get("RuleID") or item.get("RuleId") or "gitleaks.secret"
    path = relative_path(item.get("File", ""))
    line = int(item.get("StartLine") or item.get("Line") or 1)
    evidence = item.get("Match") or item.get("Secret") or read_line(path, line)
    evidence = mask_secret(normalize_evidence(evidence))
    fingerprint = item.get("Fingerprint") or stable_fingerprint("gitleaks", rule_id, path, line, evidence)

    return CodeAuditFinding(
        id=f"KEY-{index:04d}",
        rule_id=rule_id,
        title=f"硬编码密钥或敏感凭据：{rule_id}",
        category="硬编码密钥",
        severity="critical",
        score=94,
        risk_file=path,
        line=line,
        end_line=int(item.get("EndLine")) if item.get("EndLine") else None,
        evidence=evidence,
        recommendation="立即撤销并轮换该密钥，移出代码仓库，改用密钥管理服务或运行时环境变量注入，并清理 Git 历史中的泄露记录。",
        scanner="gitleaks",
        confidence="high",
        cwe="CWE-798",
        fingerprint=fingerprint,
    )

def bandit_to_finding(item: dict[str, Any], index: int) -> CodeAuditFinding:
    rule_id = item.get("test_id") or "bandit.unknown"
    path = relative_path(item.get("filename", ""))
    line = int(item.get("line_number") or 1)
    issue_severity = normalize_bandit_severity(item.get("issue_severity"))
    confidence = (item.get("issue_confidence") or "medium").lower()
    title = item.get("test_name") or item.get("issue_text") or "Bandit Python security finding"
    evidence = normalize_evidence(item.get("code") or read_line(path, line))
    fingerprint = stable_fingerprint("bandit", rule_id, path, line, evidence)

    return CodeAuditFinding(
        id=f"PY-{index:04d}",
        rule_id=rule_id,
        title=str(title),
        category="Python 安全规则",
        severity=issue_severity,
        score=bandit_score(issue_severity, confidence),
        risk_file=path,
        line=line,
        end_line=None,
        evidence=evidence,
        recommendation=bandit_recommendation(str(rule_id), str(item.get("issue_text") or "")),
        scanner="bandit",
        confidence=confidence,
        cwe=first_cwe(item.get("issue_cwe")),
        fingerprint=fingerprint,
    )


def checkov_to_finding(item: dict[str, Any], index: int, target: Path) -> CodeAuditFinding:
    rule_id = item.get("check_id") or "checkov.unknown"
    path = checkov_relative_path(item, target)
    start_line, end_line = checkov_line_range(item)
    title = item.get("check_name") or rule_id
    severity = normalize_checkov_severity(item.get("severity"))
    evidence = normalize_evidence(checkov_evidence(item) or read_line(path, start_line))
    fingerprint = stable_fingerprint("checkov", str(rule_id), path, start_line, evidence)

    return CodeAuditFinding(
        id=f"CFG-{index:04d}",
        rule_id=str(rule_id),
        title=str(title),
        category="Docker/CI/IaC 配置风险",
        severity=severity,
        score=SEVERITY_SCORE.get(severity, 62),
        risk_file=path,
        line=start_line,
        end_line=end_line,
        evidence=evidence,
        recommendation=checkov_recommendation(str(title)),
        scanner="checkov",
        confidence="medium",
        cwe=None,
        fingerprint=fingerprint,
    )


def checkov_relative_path(item: dict[str, Any], target: Path) -> str:
    file_abs_path = item.get("file_abs_path")
    if isinstance(file_abs_path, str) and file_abs_path:
        return relative_path(file_abs_path)

    file_path = str(item.get("file_path") or "").lstrip("/\\")
    candidate = target / file_path
    if candidate.exists():
        return relative_path(str(candidate))
    return relative_path(file_path)


def checkov_evidence(item: dict[str, Any]) -> str:
    code_block = item.get("code_block")
    if isinstance(code_block, list):
        lines: list[str] = []
        for row in code_block:
            if isinstance(row, list) and len(row) >= 2:
                lines.append(str(row[1]).strip())
            elif isinstance(row, str):
                lines.append(row.strip())
        return " ".join(line for line in lines if line)
    return str(code_block or "")


def flatten_checkov_results(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        results: list[dict[str, Any]] = []
        for item in payload:
            results.extend(flatten_checkov_results(item))
        return results
    if not isinstance(payload, dict):
        return []

    failed = payload.get("results", {}).get("failed_checks")
    if isinstance(failed, list):
        return failed

    results: list[dict[str, Any]] = []
    for value in payload.values():
        if isinstance(value, dict):
            failed_checks = value.get("results", {}).get("failed_checks")
            if isinstance(failed_checks, list):
                results.extend(failed_checks)
    return results


def checkov_line_range(item: dict[str, Any]) -> tuple[int, int | None]:
    lines = item.get("file_line_range")
    if isinstance(lines, list) and lines:
        start = int(lines[0] or 1)
        end = int(lines[1]) if len(lines) > 1 and lines[1] else None
        return start, end

    code_block = item.get("code_block")
    if isinstance(code_block, list) and code_block:
        first = code_block[0]
        last = code_block[-1]
        if isinstance(first, list) and first:
            start = int(first[0] or 1)
            end = int(last[0]) if isinstance(last, list) and last else None
            return start, end
    return 1, None


def normalize_bandit_severity(value: str | None) -> str:
    normalized = (value or "").lower()
    if normalized == "high":
        return "high"
    if normalized == "medium":
        return "medium"
    return "low"


def bandit_score(severity: str, confidence: str) -> int:
    base = SEVERITY_SCORE.get(severity, 50)
    if confidence == "high":
        return min(98, base + 6)
    if confidence == "low":
        return max(20, base - 8)
    return base


def bandit_recommendation(rule_id: str, issue_text: str) -> str:
    hints = {
        "B101": "移除生产代码中的 assert，改用显式异常处理或校验逻辑。",
        "B102": "避免 exec 执行动动态代码；如确需执行，隔离环境并严格限制输入。",
        "B105": "移除硬编码密码，改用密钥管理服务或运行时环境变量。",
        "B106": "不要在函数默认参数中硬编码密码或 token。",
        "B107": "不要在类或构造函数默认参数中硬编码密码或 token。",
        "B301": "不要反序列化不可信 pickle 数据，改用 JSON 等安全格式。",
        "B302": "不要使用 marshal 处理不可信数据，改用安全序列化格式。",
        "B303": "替换过时或弱哈希算法，使用 SHA-256/Argon2/bcrypt 等合适方案。",
        "B307": "避免 eval 执行动态表达式，改用显式解析或安全映射。",
        "B602": "禁用 shell=True，使用参数数组并对白名单参数做校验。",
        "B603": "执行外部命令前校验命令和参数，并使用最小权限。",
        "B608": "使用参数化 SQL 查询，动态字段使用白名单映射。",
    }
    fallback = f"依据 Bandit 规则 {rule_id} 修复该 Python 安全问题"
    return hints.get(rule_id, f"{fallback}；{issue_text}" if issue_text else fallback)

def normalize_checkov_severity(value: str | None) -> str:
    normalized = (value or "").lower()
    if normalized in {"critical", "high"}:
        return "high"
    if normalized == "medium":
        return "medium"
    return "low"


def checkov_recommendation(title: str) -> str:
    return f"按 Checkov 策略修复配置项：{title}。优先使用最小权限、安全默认值、固定版本和显式加固配置。"

def normalize_semgrep_severity(value: str | None) -> str:
    normalized = (value or "").lower()
    if normalized in {"error", "critical", "high"}:
        return "high"
    if normalized == "warning":
        return "medium"
    return "low"


def first_cwe(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, list) and value:
        return str(value[0])
    return None


def relative_path(value: str) -> str:
    if not value:
        return ""
    path = Path(value)
    if not path.is_absolute():
        path = ROOT / path
    try:
        return path.resolve().relative_to(ROOT.resolve()).as_posix()
    except ValueError:
        return str(value).replace(os.sep, "/")


def read_line(path: str, line: int) -> str:
    if line <= 0 or not path:
        return ""
    candidate = ROOT / path
    try:
        lines = candidate.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return ""
    if line > len(lines):
        return ""
    return lines[line - 1]


def normalize_evidence(value: str) -> str:
    collapsed = " ".join(str(value).strip().split())
    return collapsed[:360]


def mask_secret(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 12:
        return "[REDACTED]"
    return re.sub(r"([A-Za-z0-9_./+=:-]{6})[A-Za-z0-9_./+=:-]{6,}([A-Za-z0-9_./+=:-]{4})", r"\1...[REDACTED]...\2", value)


def stable_fingerprint(scanner: str, rule_id: str, path: str, line: int, evidence: str) -> str:
    value = f"{scanner}:{rule_id}:{path}:{line}:{evidence}"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]


def git_current_ref() -> str:
    process = run_command(["git", "rev-parse", "--abbrev-ref", "HEAD"], 10)
    branch = process.stdout.strip()
    if process.returncode == 0 and branch and branch != "HEAD":
        return f"refs/heads/{branch}"

    process = run_command(["git", "rev-parse", "HEAD"], 10)
    sha = process.stdout.strip()
    return sha if process.returncode == 0 and sha else "refs/heads/main"


def git_current_commit() -> str | None:
    process = run_command(["git", "rev-parse", "HEAD"], 10)
    sha = process.stdout.strip()
    return sha if process.returncode == 0 and sha else None


def git_checkout_uri() -> str | None:
    process = run_command(["git", "remote", "get-url", "origin"], 10)
    uri = process.stdout.strip()
    return uri if process.returncode == 0 and uri else None


def github_token(provided_token: str | None = None) -> str:
    token = provided_token or os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not token:
        raise ValueError("Missing GitHub token. Provide token or set GITHUB_TOKEN/GH_TOKEN.")
    return token


def github_headers(token: str) -> dict[str, str]:
    return {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": "SupplyGuard-Code-Audit",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
    }


def github_request(method: str, path: str, token: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(
        f"{GITHUB_API_URL}{path}",
        data=data,
        headers=github_headers(token),
        method=method,
    )
    try:
        with urlopen(request, timeout=30) as response:
            body = response.read().decode("utf-8", errors="replace")
            return json.loads(body) if body else {}
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            details = json.loads(body)
            message = details.get("message") or body
        except json.JSONDecodeError:
            message = body or exc.reason
        raise ValueError(f"GitHub API returned {exc.code}: {message}") from exc
    except URLError as exc:
        raise ValueError(f"GitHub API request failed: {exc.reason}") from exc


def sarif_upload_content(sarif: dict[str, Any]) -> str:
    raw = json.dumps(sarif, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    compressed = gzip.compress(raw)
    return base64.b64encode(compressed).decode("ascii")


def upload_code_scanning_sarif(
    result: CodeAuditResult,
    payload: GitHubCodeScanningUploadRequest,
) -> dict[str, Any]:
    commit_sha = payload.commit_sha or git_current_commit()
    if not commit_sha:
        raise ValueError("Unable to resolve commit SHA. Provide commit_sha in the request.")

    request_payload: dict[str, Any] = {
        "commit_sha": commit_sha,
        "ref": payload.ref or git_current_ref(),
        "sarif": sarif_upload_content(result.sarif),
        "checkout_uri": payload.checkout_uri or git_checkout_uri(),
        "tool_name": "SupplyGuard Code Audit",
        "started_at": result.generated_at,
    }
    request_payload = {key: value for key, value in request_payload.items() if value is not None}

    token = github_token(payload.token)
    owner = quote(payload.owner, safe="")
    repo = quote(payload.repo, safe="")
    response = github_request("POST", f"/repos/{owner}/{repo}/code-scanning/sarifs", token, request_payload)
    return {
        "repository": f"{payload.owner}/{payload.repo}",
        "ref": request_payload["ref"],
        "commit_sha": commit_sha,
        "sarif_id": response.get("id"),
        "url": response.get("url"),
        "status": response.get("processing_status") or "pending",
        "raw": response,
    }


def code_scanning_sarif_status(payload: GitHubCodeScanningStatusRequest) -> dict[str, Any]:
    token = github_token(payload.token)
    owner = quote(payload.owner, safe="")
    repo = quote(payload.repo, safe="")
    sarif_id = quote(payload.sarif_id, safe="")
    response = github_request("GET", f"/repos/{owner}/{repo}/code-scanning/sarifs/{sarif_id}", token)
    return {
        "repository": f"{payload.owner}/{payload.repo}",
        "sarif_id": payload.sarif_id,
        "status": response.get("processing_status"),
        "analyses_url": response.get("analyses_url"),
        "errors": response.get("errors") or [],
        "raw": response,
    }


def dedupe_findings(findings: list[CodeAuditFinding]) -> list[CodeAuditFinding]:
    seen: set[str] = set()
    result: list[CodeAuditFinding] = []
    for finding in sorted(findings, key=lambda item: (-item.score, item.risk_file, item.line, item.rule_id)):
        key = finding.fingerprint or f"{finding.scanner}:{finding.rule_id}:{finding.risk_file}:{finding.line}"
        if key in seen:
            continue
        seen.add(key)
        result.append(finding)
    return result


def apply_audit_state(
    findings: list[CodeAuditFinding],
    target_info: dict[str, Any],
    scan_id: str,
    generated_at: str,
    statuses: list[ScannerStatus],
) -> tuple[list[CodeAuditFinding], dict[str, Any]]:
    state = load_audit_state()
    target_key = audit_target_key(target_info)
    ignored = state.get("ignored", {})
    active_findings: list[CodeAuditFinding] = []
    ignored_count = 0

    for finding in findings:
        if finding.fingerprint and finding.fingerprint in ignored:
            ignored_count += 1
            continue
        active_findings.append(finding)

    state_summary = state_summary_for_findings(active_findings, target_info, ignored_count=ignored_count, state=state)
    record_audit_run(state, active_findings, target_info, scan_id, generated_at, statuses, state_summary)
    save_audit_state(state)
    state_summary["trend"] = audit_trend(target_info, state=state)
    return active_findings, state_summary


def refresh_audit_result(result: CodeAuditResult) -> CodeAuditResult:
    state = load_audit_state()
    active_findings = [
        finding
        for finding in result.findings
        if not finding.fingerprint or finding.fingerprint not in state.get("ignored", {})
    ]
    summary = build_summary(active_findings, result.scanners)
    summary["target"] = result.target
    summary.update(state_summary_for_findings(active_findings, result.target, state=state))
    report = build_code_audit_report(Path(result.target_path), active_findings, summary, result.scanners, result.errors)
    sarif = build_sarif(active_findings, result.target)
    return CodeAuditResult(
        scan_id=result.scan_id,
        generated_at=result.generated_at,
        target_path=result.target_path,
        target=result.target,
        findings=active_findings,
        scanners=result.scanners,
        summary=summary,
        report=report,
        sarif=sarif,
        errors=result.errors,
    )


def load_audit_state() -> dict[str, Any]:
    if not CODE_AUDIT_STATE_PATH.exists():
        return empty_audit_state()
    try:
        payload = json.loads(CODE_AUDIT_STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return empty_audit_state()

    state = empty_audit_state()
    if isinstance(payload, dict):
        for key in state:
            if isinstance(payload.get(key), type(state[key])):
                state[key] = payload[key]
    return state


def save_audit_state(state: dict[str, Any]) -> None:
    CODE_AUDIT_STATE_DIR.mkdir(parents=True, exist_ok=True)
    CODE_AUDIT_STATE_PATH.write_text(
        json.dumps(state, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def empty_audit_state() -> dict[str, Any]:
    return {"ignored": {}, "baselines": {}, "runs": []}


def audit_target_key(target_info: dict[str, Any] | None) -> str:
    if not target_info:
        return "workspace"
    if target_info.get("importId"):
        return f"import:{target_info['importId']}"
    if target_info.get("path"):
        digest = hashlib.sha256(str(target_info["path"]).encode("utf-8")).hexdigest()[:16]
        return f"path:{digest}"
    return f"project:{target_info.get('projectName') or 'workspace'}"


def state_summary_for_findings(
    findings: list[CodeAuditFinding],
    target_info: dict[str, Any],
    *,
    ignored_count: int | None = None,
    state: dict[str, Any] | None = None,
) -> dict[str, Any]:
    current_state = state or load_audit_state()
    target_key = audit_target_key(target_info)
    baseline = current_state.get("baselines", {}).get(target_key)
    baseline_fingerprints = set(baseline.get("fingerprints", [])) if isinstance(baseline, dict) else set()
    current_fingerprints = {finding.fingerprint for finding in findings if finding.fingerprint}
    ignored_for_target = [
        item
        for item in current_state.get("ignored", {}).values()
        if not isinstance(item, dict) or item.get("target_key") in {None, target_key}
    ]
    new_fingerprints = current_fingerprints - baseline_fingerprints if baseline_fingerprints else current_fingerprints
    fixed_fingerprints = baseline_fingerprints - current_fingerprints if baseline_fingerprints else set()

    return {
        "target_key": target_key,
        "ignored": ignored_count if ignored_count is not None else len(ignored_for_target),
        "ignored_total": len(ignored_for_target),
        "baseline_exists": bool(baseline_fingerprints),
        "baseline_total": len(baseline_fingerprints),
        "baseline_created_at": baseline.get("created_at") if isinstance(baseline, dict) else None,
        "new": len(new_fingerprints),
        "fixed": len(fixed_fingerprints),
        "trend": audit_trend(target_info, state=current_state),
    }


def record_audit_run(
    state: dict[str, Any],
    findings: list[CodeAuditFinding],
    target_info: dict[str, Any],
    scan_id: str,
    generated_at: str,
    statuses: list[ScannerStatus],
    state_summary: dict[str, Any],
) -> None:
    counts = finding_counts(findings)
    runs = state.setdefault("runs", [])
    runs.append(
        {
            "scan_id": scan_id,
            "generated_at": generated_at,
            "target_key": audit_target_key(target_info),
            "projectName": target_info.get("projectName"),
            "total": len(findings),
            "critical": counts["critical"],
            "high": counts["high"],
            "medium": counts["medium"],
            "low": counts["low"],
            "new": state_summary.get("new", 0),
            "fixed": state_summary.get("fixed", 0),
            "ignored": state_summary.get("ignored", 0),
            "tools": [status.name for status in statuses if status.available],
        }
    )
    del runs[:-80]


def finding_counts(findings: list[CodeAuditFinding]) -> dict[str, int]:
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for finding in findings:
        counts[finding.severity] = counts.get(finding.severity, 0) + 1
    return counts


def audit_state_payload(target_info: dict[str, Any] | None = None) -> dict[str, Any]:
    state = load_audit_state()
    target_key = audit_target_key(target_info) if target_info else None
    ignored = list(state.get("ignored", {}).values())
    baselines = state.get("baselines", {})
    runs = state.get("runs", [])
    if target_key:
        ignored = [
            item
            for item in ignored
            if not isinstance(item, dict) or item.get("target_key") in {None, target_key}
        ]
        runs = [item for item in runs if item.get("target_key") == target_key]
    return {
        "target_key": target_key,
        "ignored": ignored,
        "baseline": baselines.get(target_key) if target_key else None,
        "baselines": baselines,
        "trend": runs[-20:],
    }


def audit_trend(target_info: dict[str, Any], *, state: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    current_state = state or load_audit_state()
    target_key = audit_target_key(target_info)
    return [item for item in current_state.get("runs", []) if item.get("target_key") == target_key][-12:]


def add_ignored_finding(
    fingerprint: str,
    *,
    reason: str = "",
    target_info: dict[str, Any] | None = None,
    finding: CodeAuditFinding | None = None,
) -> dict[str, Any]:
    state = load_audit_state()
    now = datetime.now(UTC).isoformat()
    target_key = audit_target_key(target_info) if target_info else None
    state.setdefault("ignored", {})[fingerprint] = {
        "fingerprint": fingerprint,
        "reason": reason,
        "created_at": now,
        "target_key": target_key,
        "finding": finding_snapshot(finding) if finding else None,
    }
    save_audit_state(state)
    return audit_state_payload(target_info)


def remove_ignored_finding(fingerprint: str, target_info: dict[str, Any] | None = None) -> dict[str, Any]:
    state = load_audit_state()
    state.setdefault("ignored", {}).pop(fingerprint, None)
    save_audit_state(state)
    return audit_state_payload(target_info)


def create_audit_baseline(result: CodeAuditResult, note: str = "") -> dict[str, Any]:
    state = load_audit_state()
    target_key = audit_target_key(result.target)
    fingerprints = sorted({finding.fingerprint for finding in result.findings if finding.fingerprint})
    counts = finding_counts(result.findings)
    state.setdefault("baselines", {})[target_key] = {
        "target_key": target_key,
        "created_at": datetime.now(UTC).isoformat(),
        "scan_id": result.scan_id,
        "note": note,
        "fingerprints": fingerprints,
        "summary": {
            "total": len(fingerprints),
            "critical": counts["critical"],
            "high": counts["high"],
            "medium": counts["medium"],
            "low": counts["low"],
        },
    }
    save_audit_state(state)
    return audit_state_payload(result.target)


def finding_snapshot(finding: CodeAuditFinding | None) -> dict[str, Any] | None:
    if finding is None:
        return None
    return {
        "id": finding.id,
        "rule_id": finding.rule_id,
        "title": finding.title,
        "category": finding.category,
        "severity": finding.severity,
        "risk_file": finding.risk_file,
        "line": finding.line,
        "scanner": finding.scanner,
    }


def build_summary(findings: list[CodeAuditFinding], statuses: list[ScannerStatus]) -> dict[str, Any]:
    by_severity = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    by_category: dict[str, int] = {}
    for finding in findings:
        by_severity[finding.severity] = by_severity.get(finding.severity, 0) + 1
        by_category[finding.category] = by_category.get(finding.category, 0) + 1

    return {
        "total": len(findings),
        "critical": by_severity.get("critical", 0),
        "high": by_severity.get("high", 0),
        "medium": by_severity.get("medium", 0),
        "low": by_severity.get("low", 0),
        "by_category": by_category,
        "tools": [
            {
                "name": status.name,
                "available": status.available,
                "version": status.version,
                "error": status.error,
                "state": status.state,
            }
            for status in statuses
        ],
    }


def build_code_audit_report(
    target: Path,
    findings: list[CodeAuditFinding],
    summary: dict[str, Any],
    statuses: list[ScannerStatus],
    errors: list[str],
) -> str:
    tool_rows = "\n".join(
        f"| {status.name} | {'可用' if status.available else '不可用'} | {status.version or '-'} | {status.error or '-'} |"
        for status in statuses
    )
    finding_rows = "\n".join(
        "| {id} | {severity} | {category} | {file}:{line} | {evidence} |".format(
            id=finding.id,
            severity=finding.severity,
            category=finding.category,
            file=finding.risk_file,
            line=finding.line,
            evidence=finding.evidence.replace("|", "\\|"),
        )
        for finding in findings
    )
    action_rows = "\n".join(
        f"- **{finding.risk_file}:{finding.line}**：{finding.recommendation}"
        for finding in findings[:12]
    )
    error_rows = "\n".join(f"- {error}" for error in errors if error)

    return f"""# 代码安全审计报告

生成时间：{datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC")}
扫描目标：{target}

## 摘要

- 风险总数：{summary['total']}
- 严重：{summary['critical']}
- 高危：{summary['high']}
- 中危：{summary['medium']}
- 低危：{summary['low']}

## 扫描器

| 工具 | 状态 | 版本 | 说明 |
| --- | --- | --- | --- |
{tool_rows or '| - | - | - | - |'}

## 风险明细

| 编号 | 等级 | 类型 | 位置 | 证据 |
| --- | --- | --- | --- | --- |
{finding_rows or '| - | - | - | - | 未发现匹配风险 |'}

## 修复建议

{action_rows or '- 暂未发现需要修复的应用安全风险。'}

## 扫描提示

{error_rows or '- 扫描完成。'}
"""

def build_sarif(findings: list[CodeAuditFinding], target_info: dict[str, Any]) -> dict[str, Any]:
    rules: dict[str, dict[str, Any]] = {}
    results: list[dict[str, Any]] = []

    for finding in findings:
        rules.setdefault(
            finding.rule_id,
            {
                "id": finding.rule_id,
                "name": finding.category,
                "shortDescription": {"text": finding.title[:120]},
                "fullDescription": {"text": finding.recommendation},
                "help": {"text": finding.recommendation},
                "properties": {
                    "category": finding.category,
                    "scanner": finding.scanner,
                    "severity": finding.severity,
                    **({"cwe": finding.cwe} if finding.cwe else {}),
                },
            },
        )
        results.append(
            {
                "ruleId": finding.rule_id,
                "level": sarif_level(finding.severity),
                "message": {"text": f"{finding.title}: {finding.evidence}"},
                "locations": [
                    {
                        "physicalLocation": {
                            "artifactLocation": {"uri": finding.risk_file.replace("\\", "/")},
                            "region": {
                                "startLine": max(finding.line, 1),
                                **({"endLine": finding.end_line} if finding.end_line else {}),
                            },
                        }
                    }
                ],
                "partialFingerprints": {
                    "primaryLocationLineHash": finding.fingerprint,
                },
                "properties": {
                    "category": finding.category,
                    "scanner": finding.scanner,
                    "confidence": finding.confidence,
                    "recommendation": finding.recommendation,
                    **({"cwe": finding.cwe} if finding.cwe else {}),
                },
            }
        )

    return {
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "version": "2.1.0",
        "runs": [
            {
                "tool": {
                    "driver": {
                        "name": "SupplyGuard Code Audit",
                        "informationUri": "https://github.com/semgrep/semgrep",
                        "rules": list(rules.values()),
                    }
                },
                "automationDetails": {"id": str(target_info.get("importId") or "workspace")},
                "results": results,
            }
        ],
    }


def sarif_level(severity: str) -> str:
    if severity in {"critical", "high"}:
        return "error"
    if severity == "medium":
        return "warning"
    return "note"

