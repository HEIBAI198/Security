"""GitHub Actions CI/CD workflow risk scanner.

The first version is intentionally local and deterministic. It parses
`.github/workflows/*.yml` and `.github/workflows/*.yaml`, then applies a small
set of high-signal rules for mutable Actions, broad permissions, remote script
execution, plaintext secrets, and unpinned Action references.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Iterable

from pydantic import BaseModel, ConfigDict, Field

from .config import ROOT
from .project_imports import ImportErrorDetail, load_import, load_latest_import

try:
    import yaml
except Exception:  # pragma: no cover - only used when runtime deps are missing.
    yaml = None  # type: ignore[assignment]


DEFAULT_TARGET = ROOT
MAX_WORKFLOWS = 200
DEFAULT_EXTERNAL_TIMEOUT_SECONDS = 30
CICD_AUDIT_STATE_DIR = ROOT / "storage" / "cicd_audit"
CICD_AUDIT_STATE_PATH = CICD_AUDIT_STATE_DIR / "state.json"
WORKFLOW_SUFFIXES = {".yml", ".yaml"}
MUTABLE_ACTION_REFS = {"main", "master", "latest", "head", "dev", "trunk"}
COMMIT_SHA_RE = re.compile(r"^[0-9a-f]{40}$", re.IGNORECASE)
GITHUB_ACTION_RE = re.compile(r"^(?P<owner>[^/\s@]+)/(?P<repo>[^@\s]+)@(?P<ref>[^\s]+)$")
GITHUB_EXPR_RE = re.compile(r"\$\{\{\s*([^}]+)\s*\}\}")
UNTRUSTED_CONTEXT_RE = re.compile(
    r"\b(?:github\.event|github\.head_ref|github\.ref|inputs\.|matrix\.|steps\.)",
    re.IGNORECASE,
)
REMOTE_SCRIPT_PIPE_RE = re.compile(
    r"\b(?:curl|wget)\b[\s\S]{0,300}\|\s*(?:sudo\s+)?(?:bash|sh|zsh)\b",
    re.IGNORECASE,
)
SAFE_EXPRESSION_RE = re.compile(r"\$\{\{\s*(?:secrets\.|github\.token\b|env\.)", re.IGNORECASE)
SENSITIVE_KEY_RE = re.compile(
    r"(?i)\b(token|secret|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key)\b"
)
SECRET_VALUE_RE = re.compile(r"^[A-Za-z0-9_./+=:-]{16,}$")
SECRET_ASSIGNMENT_RE = re.compile(
    r"(?i)\b(token|secret|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key)\b"
    r"\s*[:=]\s*[\"']?([A-Za-z0-9_./+=:-]{16,})[\"']?"
)
SECRET_TOKEN_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("github-pat", re.compile(r"\bghp_[A-Za-z0-9_]{36,}\b")),
    ("github-fine-grained-pat", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}\b")),
    ("aws-access-key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("openai-api-key", re.compile(r"\bsk-[A-Za-z0-9]{20,}\b")),
    ("jwt-token", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")),
]
WRITE_PERMISSION_KEYS = {"actions", "checks", "contents", "deployments", "id-token", "packages", "pages", "pull-requests"}
DEFAULT_TRUSTED_ACTIONS = ["actions/*", "github/*", "docker/*"]
DEFAULT_POLICY: dict[str, Any] = {
    "action_pinning": {
        "official_actions_tag_ok": True,
        "require_sha_for_third_party": True,
    },
    "trusted_actions": DEFAULT_TRUSTED_ACTIONS,
    "severity_overrides": {
        "github-actions.unpinned-action-ref": {
            "official": "low",
            "third_party": "high",
        }
    },
    "external_scanners": {
        "zizmor": True,
        "actionlint": True,
    },
}

RULE_METADATA: dict[str, dict[str, Any]] = {
    "github-actions.mutable-action-ref": {
        "title": "Action 使用可变引用",
        "severity": "high",
        "score": 86,
        "reason": "Action 引用 main/master/latest 等可变分支，第三方仓库更新或被接管后会影响构建结果。",
        "recommendation": "将第三方 Action 固定到可信完整 commit SHA，并用 Dependabot/Renovate 定期更新。",
    },
    "github-actions.unpinned-action-ref": {
        "title": "Action 未固定到完整 commit SHA",
        "severity": "medium",
        "score": 64,
        "reason": "Action 使用 tag 或短引用，版本可被移动或覆盖，无法保证构建输入不可变。",
        "recommendation": "在高安全流程中使用 40 位完整 commit SHA；普通流程至少固定可信 tag 并启用变更审查。",
    },
    "github-actions.permissions-write-all": {
        "title": "GitHub Token 权限过宽",
        "severity": "high",
        "score": 88,
        "reason": "permissions: write-all 会给 GITHUB_TOKEN 授予全部写权限，扩大凭据泄露或工作流劫持后的影响面。",
        "recommendation": "按 workflow/job 最小化声明权限，例如 contents: read；发布任务只授予必要写权限。",
    },
    "github-actions.remote-script-pipe": {
        "title": "远程脚本直接管道执行",
        "severity": "high",
        "score": 86,
        "reason": "curl/wget 下载内容直接交给 shell 执行，远程端或网络链路异常会直接污染构建环境。",
        "recommendation": "下载后校验 checksum/signature，或替换为可信 Action/包管理器，并固定来源版本。",
    },
    "github-actions.plaintext-secret": {
        "title": "Workflow 中出现明文凭据",
        "severity": "critical",
        "score": 95,
        "reason": "workflow、env、with 或 run 中出现疑似明文 token/key，可能被日志、PR 或构建上下文泄露。",
        "recommendation": "立即轮换该凭据，改用 GitHub Secrets、环境保护规则或 OIDC 短期凭据。",
    },
    "github-actions.pull-request-target-checkout": {
        "title": "pull_request_target 检出不可信 PR 代码",
        "severity": "critical",
        "score": 94,
        "reason": "pull_request_target 拥有目标仓库上下文，若同时 checkout PR head，攻击者可让不可信代码在高权限上下文运行。",
        "recommendation": "避免在 pull_request_target 中检出 PR head；改用 pull_request 或仅读取元数据，敏感步骤放到受保护 workflow。",
    },
    "github-actions.expression-in-run": {
        "title": "run 脚本直接拼接不可信表达式",
        "severity": "high",
        "score": 82,
        "reason": "run 中直接拼接 github.event、github.head_ref、inputs 等上下文，可能形成脚本注入。",
        "recommendation": "先把表达式放入 env，再在 shell 中按变量引用并做引号包裹/白名单校验。",
    },
    "github-actions.self-hosted-untrusted-pr": {
        "title": "self-hosted runner 运行不可信 PR",
        "severity": "critical",
        "score": 92,
        "reason": "self-hosted runner 可能携带内网访问或持久化状态，不可信 PR 代码运行后会扩大入侵面。",
        "recommendation": "不要让 fork/PR 任务直接使用 self-hosted runner；使用隔离 runner、审批门禁或只读检查。",
    },
    "github-actions.secrets-inherit": {
        "title": "Reusable workflow 继承全部 secrets",
        "severity": "high",
        "score": 84,
        "reason": "secrets: inherit 会把调用方全部 secrets 暴露给复用 workflow，增加横向泄露风险。",
        "recommendation": "显式传入必要 secret，避免 inherit；第三方 reusable workflow 必须固定版本并审计权限。",
    },
    "github-actions.id-token-write": {
        "title": "OIDC id-token 写权限需要确认",
        "severity": "medium",
        "score": 60,
        "reason": "id-token: write 允许请求 OIDC token，若没有明确云角色绑定和最小权限，可能被滥用换取云凭据。",
        "recommendation": "仅在需要 OIDC 联邦登录的 job 中启用，并限制云端 trust policy、audience、subject 和环境保护规则。",
    },
    "github-actions.broad-write-permission": {
        "title": "GitHub Token 写权限过宽",
        "severity": "medium",
        "score": 66,
        "reason": "contents/packages/actions/deployments 等写权限会扩大 workflow 被劫持后的仓库或制品影响面。",
        "recommendation": "把写权限收敛到发布 job，并明确声明其他权限为 read 或 none。",
    },
    "github-actions.docker-action-unpinned": {
        "title": "docker:// Action 未固定 digest",
        "severity": "medium",
        "score": 65,
        "reason": "docker:// 镜像使用 tag 而非 digest，镜像内容可随 tag 变化。",
        "recommendation": "使用 docker://image@sha256:<digest> 固定镜像，或使用受信 Action 并校验供应链证明。",
    },
    "github-actions.external-scanner": {
        "title": "外部 GitHub Actions 扫描器发现风险",
        "severity": "medium",
        "score": 62,
        "reason": "zizmor/actionlint 等外部扫描器发现 workflow 安全或语法风险。",
        "recommendation": "参考外部扫描器消息修复 workflow，并结合本平台策略确认权限、触发器和 Action 固定方式。",
    },
}


class CICDAuditRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    import_id: str | None = Field(default=None, alias="importId")
    target_path: str | None = Field(default=None, alias="targetPath")
    allow_external: bool = Field(default=False, alias="allowExternal")
    max_workflows: int = Field(default=MAX_WORKFLOWS, alias="maxWorkflows", ge=1, le=1000)
    include_zizmor: bool = Field(default=True, alias="includeZizmor")
    include_actionlint: bool = Field(default=True, alias="includeActionlint")
    timeout_seconds: int = Field(default=DEFAULT_EXTERNAL_TIMEOUT_SECONDS, alias="timeoutSeconds", ge=5, le=120)


@dataclass(frozen=True)
class CICDScannerStatus:
    name: str
    available: bool
    command: str
    version: str | None = None
    error: str | None = None
    state: str = "ok"


@dataclass(frozen=True)
class CICDFinding:
    id: str
    rule_id: str
    title: str
    severity: str
    score: int
    workflow: str
    job_id: str | None
    job_name: str | None
    step_index: int | None
    step_name: str | None
    line: int
    evidence: str
    reason: str
    recommendation: str
    fingerprint: str
    scanner: str = "SupplyGuard CI/CD"
    confidence: str = "medium"


@dataclass(frozen=True)
class CICDAuditResult:
    scan_id: str
    generated_at: str
    target_path: str
    target: dict[str, Any]
    workflows: list[str]
    findings: list[CICDFinding]
    scanners: list[CICDScannerStatus]
    summary: dict[str, Any]
    report: str
    sarif: dict[str, Any]
    state: dict[str, Any] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


@dataclass
class WorkflowContext:
    path: Path
    relative_path: str
    data: dict[str, Any]
    locator: "LineLocator"
    policy: dict[str, Any]


class LineLocator:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.lines = path.read_text(encoding="utf-8", errors="replace").splitlines()

    def find(self, *needles: str, fallback: int = 1) -> int:
        return self.find_after(1, *needles, fallback=fallback)

    def find_after(self, start_line: int, *needles: str, fallback: int = 1) -> int:
        start = max(start_line, 1)
        for raw_needle in needles:
            needle = first_meaningful_line(raw_needle)
            if not needle:
                continue
            normalized_needle = normalize_for_search(needle)
            for index, line in enumerate(self.lines, start=1):
                if index < start:
                    continue
                if normalized_needle in normalize_for_search(line):
                    return index
        return fallback


def run_cicd_audit(request: CICDAuditRequest | None = None) -> CICDAuditResult:
    started_at = time.monotonic()
    payload = request or CICDAuditRequest()
    target, target_info = resolve_cicd_target(payload)
    target_info = {**target_info, "path": str(target)}
    scan_id = datetime.now(UTC).strftime("cicd-%Y%m%d%H%M%S")
    generated_at = datetime.now(UTC).isoformat()
    warnings: list[str] = []
    scanners: list[CICDScannerStatus] = []
    policy = load_cicd_policy(target, warnings)
    workflows = discover_workflows(target, max_workflows=payload.max_workflows)

    if yaml is None:
        warnings.append("PyYAML is not installed; using text fallback scanner for GitHub Actions workflows.")
    if not workflows:
        warnings.append("未找到 .github/workflows/*.yml 或 *.yaml workflow 文件。")

    findings: list[CICDFinding] = []
    job_count = 0
    step_count = 0

    for workflow_path in workflows:
        if yaml is None:
            workflow_findings, workflow_jobs, workflow_steps = scan_workflow_text(workflow_path, target, warnings, policy)
            findings.extend(workflow_findings)
            job_count += workflow_jobs
            step_count += workflow_steps
            continue
        context = load_workflow(workflow_path, target, warnings, policy)
        if context is None:
            workflow_findings, workflow_jobs, workflow_steps = scan_workflow_text(workflow_path, target, warnings, policy)
            findings.extend(workflow_findings)
            job_count += workflow_jobs
            step_count += workflow_steps
            continue
        workflow_findings, workflow_jobs, workflow_steps = scan_workflow(context)
        findings.extend(workflow_findings)
        job_count += workflow_jobs
        step_count += workflow_steps

    if payload.include_zizmor and policy_external_scanner_enabled(policy, "zizmor"):
        zizmor_findings, status, scanner_warnings = run_zizmor(target, workflows, payload.timeout_seconds)
        findings.extend(zizmor_findings)
        scanners.append(status)
        warnings.extend(scanner_warnings)
    else:
        scanners.append(CICDScannerStatus(name="zizmor", available=False, command="zizmor", state="skipped", error="Skipped"))

    if payload.include_actionlint and policy_external_scanner_enabled(policy, "actionlint"):
        actionlint_findings, status, scanner_warnings = run_actionlint(target, workflows, payload.timeout_seconds)
        findings.extend(actionlint_findings)
        scanners.append(status)
        warnings.extend(scanner_warnings)
    else:
        scanners.append(
            CICDScannerStatus(name="actionlint", available=False, command="actionlint", state="skipped", error="Skipped")
        )

    raw_findings = dedupe_findings(findings)
    active_findings, state_summary = apply_cicd_state(raw_findings, target_info, scan_id, generated_at, scanners)
    summary = build_summary(active_findings, workflows, job_count, step_count, scanners=scanners)
    summary["duration_seconds"] = round(time.monotonic() - started_at, 2)
    summary["target"] = target_info
    summary.update(state_summary)
    report = build_cicd_report(target, [relative_posix(path, target) for path in workflows], active_findings, summary, warnings, scanners)
    sarif = build_cicd_sarif(active_findings, target_info)

    return CICDAuditResult(
        scan_id=scan_id,
        generated_at=generated_at,
        target_path=str(target),
        target=target_info,
        workflows=[relative_posix(path, target) for path in workflows],
        findings=active_findings,
        scanners=scanners,
        summary=summary,
        report=report,
        sarif=sarif,
        state=audit_state_payload(target_info),
        warnings=warnings,
    )


def resolve_cicd_target(request: CICDAuditRequest) -> tuple[Path, dict[str, Any]]:
    if request.import_id:
        return import_cicd_target(request.import_id)

    if request.target_path:
        return path_cicd_target(request.target_path, allow_external=request.allow_external)

    latest_import = load_latest_import()
    if latest_import is not None:
        source_path = Path(str(latest_import["sourcePath"]))
        if source_path.exists():
            return source_path.resolve(), {
                "importId": latest_import["importId"],
                "projectName": latest_import["projectName"],
                "sourceType": latest_import["sourceType"],
            }

    return DEFAULT_TARGET.resolve(), {"sourceType": "workspace", "projectName": DEFAULT_TARGET.name}


def import_cicd_target(import_id: str) -> tuple[Path, dict[str, Any]]:
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


def path_cicd_target(target_path: str, *, allow_external: bool = False) -> tuple[Path, dict[str, Any]]:
    candidate = Path(target_path).expanduser()
    if not candidate.is_absolute():
        candidate = ROOT / candidate
    candidate = candidate.resolve()

    if not candidate.exists():
        raise ValueError(f"CI/CD scan target does not exist: {candidate}")
    if not allow_external and not is_within_root(candidate):
        raise ValueError(f"CI/CD scan target must stay inside project root: {ROOT}")
    return candidate, {"sourceType": "path", "projectName": candidate.name}


def is_within_root(path: Path) -> bool:
    try:
        path.resolve().relative_to(ROOT.resolve())
        return True
    except ValueError:
        return False


def discover_workflows(target: Path, *, max_workflows: int) -> list[Path]:
    if target.is_file() and target.suffix.lower() in WORKFLOW_SUFFIXES:
        return [target]
    workflow_dir = target / ".github" / "workflows"
    if not workflow_dir.exists() or not workflow_dir.is_dir():
        return []
    workflows = sorted(
        path
        for suffix in WORKFLOW_SUFFIXES
        for path in workflow_dir.glob(f"*{suffix}")
        if path.is_file()
    )
    return workflows[:max_workflows]


def load_cicd_policy(target: Path, warnings: list[str]) -> dict[str, Any]:
    policy = deep_copy(DEFAULT_POLICY)
    policy_path = target / ".supplyguard" / "cicd.yml"
    if not policy_path.exists():
        policy_path = target / ".supplyguard" / "cicd.yaml"
    if not policy_path.exists():
        return policy
    if yaml is None:
        warnings.append(f"{relative_posix(policy_path, target)} 存在，但 PyYAML 不可用，已使用默认 CI/CD 策略。")
        return policy
    try:
        payload = yaml.safe_load(policy_path.read_text(encoding="utf-8", errors="replace"))
    except Exception as exc:
        warnings.append(f"{relative_posix(policy_path, target)} 策略解析失败，已使用默认策略: {exc}")
        return policy
    if isinstance(payload, dict):
        merge_dict(policy, payload)
    else:
        warnings.append(f"{relative_posix(policy_path, target)} 不是有效策略对象，已使用默认策略。")
    return policy


def deep_copy(value: dict[str, Any]) -> dict[str, Any]:
    return json.loads(json.dumps(value))


def merge_dict(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    for key, value in overlay.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            merge_dict(base[key], value)
        else:
            base[key] = value
    return base


def policy_external_scanner_enabled(policy: dict[str, Any], name: str) -> bool:
    external = policy.get("external_scanners")
    if not isinstance(external, dict):
        return True
    return bool(external.get(name, True))


def load_workflow(path: Path, root: Path, warnings: list[str], policy: dict[str, Any]) -> WorkflowContext | None:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        warnings.append(f"{relative_posix(path, root)} 读取失败: {exc}")
        return None

    try:
        data = yaml.safe_load(text) if yaml is not None else None
    except Exception as exc:
        warnings.append(f"{relative_posix(path, root)} YAML 解析失败: {exc}")
        return None

    if not isinstance(data, dict):
        warnings.append(f"{relative_posix(path, root)} 不是有效的 workflow YAML 对象。")
        return None

    return WorkflowContext(
        path=path,
        relative_path=relative_posix(path, root),
        data=data,
        locator=LineLocator(path),
        policy=policy,
    )


def scan_workflow_text(
    path: Path,
    root: Path,
    warnings: list[str],
    policy: dict[str, Any],
) -> tuple[list[CICDFinding], int, int]:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        warnings.append(f"{relative_posix(path, root)} text fallback read failed: {exc}")
        return [], 0, 0

    context = WorkflowContext(
        path=path,
        relative_path=relative_posix(path, root),
        data={},
        locator=LineLocator(path),
        policy=policy,
    )
    findings: list[CICDFinding] = []

    for line_number, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if stripped == "permissions: write-all":
            findings.append(
                build_finding(
                    rule_id="github-actions.permissions-write-all",
                    workflow=context,
                    job_id=None,
                    job_name=None,
                    step_index=None,
                    step_name=None,
                    line=line_number,
                    evidence="permissions: write-all",
                )
            )

        uses_match = re.search(r"\buses:\s*(?P<uses>[^\s#]+)", stripped)
        if uses_match:
            findings.extend(
                action_reference_findings(
                    uses_match.group("uses"),
                    workflow=context,
                    job_id=None,
                    job_name=None,
                    step_index=None,
                    step_name=None,
                    search_start=line_number,
                )
            )

    findings.extend(
        remote_script_findings(
            text,
            workflow=context,
            job_id=None,
            job_name=None,
            step_index=None,
            step_name="workflow text",
            search_start=1,
        )
    )
    findings.extend(
        secret_findings_for_value(
            text,
            workflow=context,
            job_id=None,
            job_name=None,
            step_index=None,
            step_name="workflow text",
            scope="workflow.text",
            search_start=1,
        )
    )
    job_count, step_count = estimate_workflow_counts(text)
    return findings, job_count, step_count


def estimate_workflow_counts(text: str) -> tuple[int, int]:
    in_jobs = False
    job_count = 0
    step_count = 0
    for line in text.splitlines():
        if re.match(r"^jobs:\s*$", line):
            in_jobs = True
            continue
        if not in_jobs:
            continue
        if re.match(r"^\S", line):
            in_jobs = False
            continue
        if re.match(r"^\s{2}[A-Za-z0-9_.-]+:\s*$", line):
            job_count += 1
        if re.match(r"^\s*-\s+(?:uses|name|run):", line):
            step_count += 1
    return job_count, step_count


def scan_workflow(context: WorkflowContext) -> tuple[list[CICDFinding], int, int]:
    findings: list[CICDFinding] = []
    jobs = context.data.get("jobs")
    job_count = len(jobs) if isinstance(jobs, dict) else 0
    step_count = 0
    pull_request_target = workflow_has_event(context.data, "pull_request_target")

    permissions = context.data.get("permissions")
    if is_write_all_permissions(permissions):
        findings.append(
            build_finding(
                rule_id="github-actions.permissions-write-all",
                workflow=context,
                job_id=None,
                job_name=None,
                step_index=None,
                step_name=None,
                line=context.locator.find("permissions: write-all"),
                evidence="permissions: write-all",
            )
        )
    findings.extend(permission_findings(permissions, workflow=context, job_id=None, job_name=None, search_start=1))

    findings.extend(
        secret_findings_for_value(
            context.data.get("env"),
            workflow=context,
            job_id=None,
            job_name=None,
            step_index=None,
            step_name=None,
            scope="workflow.env",
            search_start=1,
        )
    )

    if not isinstance(jobs, dict):
        return findings, job_count, step_count

    for job_id, raw_job in jobs.items():
        if not isinstance(raw_job, dict):
            continue
        job_name = str(raw_job.get("name") or job_id)
        job_line = context.locator.find(f"{job_id}:")
        job_permissions = raw_job.get("permissions")
        if is_write_all_permissions(job_permissions):
            findings.append(
                build_finding(
                    rule_id="github-actions.permissions-write-all",
                    workflow=context,
                    job_id=str(job_id),
                    job_name=job_name,
                    step_index=None,
                    step_name=None,
                    line=context.locator.find_after(job_line, "permissions: write-all", fallback=job_line),
                    evidence="permissions: write-all",
                )
            )
        findings.extend(
            permission_findings(
                job_permissions,
                workflow=context,
                job_id=str(job_id),
                job_name=job_name,
                search_start=job_line,
            )
        )

        if job_uses := raw_job.get("uses"):
            if isinstance(job_uses, str):
                findings.extend(
                    action_reference_findings(
                        job_uses,
                        workflow=context,
                        job_id=str(job_id),
                        job_name=job_name,
                        step_index=None,
                        step_name=None,
                        search_start=job_line,
                    )
                )
        job_secrets = raw_job.get("secrets")
        if is_secrets_inherit(job_secrets):
            findings.append(
                build_finding(
                    rule_id="github-actions.secrets-inherit",
                    workflow=context,
                    job_id=str(job_id),
                    job_name=job_name,
                    step_index=None,
                    step_name=None,
                    line=context.locator.find_after(job_line, "secrets: inherit", fallback=job_line),
                    evidence="secrets: inherit",
                )
            )

        if pull_request_target and job_uses_self_hosted_runner(raw_job.get("runs-on")):
            findings.append(
                build_finding(
                    rule_id="github-actions.self-hosted-untrusted-pr",
                    workflow=context,
                    job_id=str(job_id),
                    job_name=job_name,
                    step_index=None,
                    step_name=None,
                    line=context.locator.find_after(job_line, "runs-on:", "self-hosted", fallback=job_line),
                    evidence=f"on: pull_request_target; runs-on: {raw_job.get('runs-on')}",
                )
            )

        findings.extend(
            secret_findings_for_value(
                raw_job.get("env"),
                workflow=context,
                job_id=str(job_id),
                job_name=job_name,
                step_index=None,
                step_name=None,
                scope=f"jobs.{job_id}.env",
                search_start=job_line,
            )
        )
        findings.extend(
            secret_findings_for_value(
                raw_job.get("with"),
                workflow=context,
                job_id=str(job_id),
                job_name=job_name,
                step_index=None,
                step_name=None,
                scope=f"jobs.{job_id}.with",
                search_start=job_line,
            )
        )
        findings.extend(
            secret_findings_for_value(
                raw_job.get("secrets"),
                workflow=context,
                job_id=str(job_id),
                job_name=job_name,
                step_index=None,
                step_name=None,
                scope=f"jobs.{job_id}.secrets",
                search_start=job_line,
            )
        )

        steps = raw_job.get("steps")
        if not isinstance(steps, list):
            continue
        step_count += len(steps)
        for index, raw_step in enumerate(steps, start=1):
            if not isinstance(raw_step, dict):
                continue
            step_name = str(raw_step.get("name") or f"step {index}")
            step_uses = raw_step.get("uses")
            if isinstance(step_uses, str):
                findings.extend(
                    action_reference_findings(
                        step_uses,
                        workflow=context,
                        job_id=str(job_id),
                        job_name=job_name,
                        step_index=index,
                        step_name=step_name,
                        search_start=job_line,
                    )
                )
                if pull_request_target and checkout_uses_pr_head(step_uses, raw_step):
                    findings.append(
                        build_finding(
                            rule_id="github-actions.pull-request-target-checkout",
                            workflow=context,
                            job_id=str(job_id),
                            job_name=job_name,
                            step_index=index,
                            step_name=step_name,
                            line=context.locator.find_after(job_line, "github.event.pull_request.head", step_uses, fallback=job_line),
                            evidence=f"on: pull_request_target; uses: {step_uses}; with: {raw_step.get('with')}",
                        )
                    )

            run_script = raw_step.get("run")
            if isinstance(run_script, str):
                findings.extend(
                    remote_script_findings(
                        run_script,
                        workflow=context,
                        job_id=str(job_id),
                        job_name=job_name,
                        step_index=index,
                        step_name=step_name,
                        search_start=job_line,
                    )
                )
                findings.extend(
                    expression_in_run_findings(
                        run_script,
                        workflow=context,
                        job_id=str(job_id),
                        job_name=job_name,
                        step_index=index,
                        step_name=step_name,
                        search_start=job_line,
                    )
                )
                findings.extend(
                    secret_findings_for_value(
                        run_script,
                        workflow=context,
                        job_id=str(job_id),
                        job_name=job_name,
                        step_index=index,
                        step_name=step_name,
                        scope=f"jobs.{job_id}.steps[{index}].run",
                        search_start=job_line,
                    )
                )

            for field_name in ("env", "with"):
                findings.extend(
                    secret_findings_for_value(
                        raw_step.get(field_name),
                        workflow=context,
                        job_id=str(job_id),
                        job_name=job_name,
                        step_index=index,
                        step_name=step_name,
                        scope=f"jobs.{job_id}.steps[{index}].{field_name}",
                        search_start=job_line,
                    )
                )

    return findings, job_count, step_count


def action_reference_findings(
    uses_value: str,
    *,
    workflow: WorkflowContext,
    job_id: str | None,
    job_name: str | None,
    step_index: int | None,
    step_name: str | None,
    search_start: int = 1,
) -> list[CICDFinding]:
    value = uses_value.strip()
    if not value or value.startswith(("./", "../")):
        return []

    evidence = f"uses: {value}"
    line = workflow.locator.find_after(search_start, evidence, value, fallback=search_start)
    if value.lower().startswith("docker://"):
        if "@sha256:" in value.lower():
            return []
        return [
            build_finding(
                rule_id="github-actions.docker-action-unpinned",
                workflow=workflow,
                job_id=job_id,
                job_name=job_name,
                step_index=step_index,
                step_name=step_name,
                line=line,
                evidence=evidence,
            )
        ]

    if "@" not in value:
        return [
            build_finding(
                rule_id="github-actions.unpinned-action-ref",
                workflow=workflow,
                job_id=job_id,
                job_name=job_name,
                step_index=step_index,
                step_name=step_name,
                line=line,
                evidence=evidence,
            )
        ]

    ref = value.rsplit("@", 1)[1].strip()
    normalized_ref = ref.lower()
    if normalized_ref.startswith("refs/heads/"):
        normalized_ref = normalized_ref.rsplit("/", 1)[-1]

    classification = action_classification(value, workflow.policy)

    if normalized_ref in MUTABLE_ACTION_REFS:
        return [
            build_finding(
                rule_id="github-actions.mutable-action-ref",
                workflow=workflow,
                job_id=job_id,
                job_name=job_name,
                step_index=step_index,
                step_name=step_name,
                line=line,
                evidence=evidence,
            )
        ]

    if not COMMIT_SHA_RE.fullmatch(ref):
        severity_override = unpinned_action_severity(classification, workflow.policy)
        return [
            build_finding(
                rule_id="github-actions.unpinned-action-ref",
                workflow=workflow,
                job_id=job_id,
                job_name=job_name,
                step_index=step_index,
                step_name=step_name,
                line=line,
                evidence=evidence,
                severity=severity_override,
            )
        ]

    return []


def expression_in_run_findings(
    run_script: str,
    *,
    workflow: WorkflowContext,
    job_id: str | None,
    job_name: str | None,
    step_index: int | None,
    step_name: str | None,
    search_start: int = 1,
) -> list[CICDFinding]:
    findings: list[CICDFinding] = []
    for match in GITHUB_EXPR_RE.finditer(run_script):
        expression = match.group(1).strip()
        if not UNTRUSTED_CONTEXT_RE.search(expression):
            continue
        findings.append(
            build_finding(
                rule_id="github-actions.expression-in-run",
                workflow=workflow,
                job_id=job_id,
                job_name=job_name,
                step_index=step_index,
                step_name=step_name,
                line=workflow.locator.find_after(search_start, match.group(0), expression, fallback=search_start),
                evidence=f"run contains ${{{{ {expression} }}}}",
            )
        )
    return findings


def run_zizmor(
    target: Path,
    workflows: list[Path],
    timeout_seconds: int,
) -> tuple[list[CICDFinding], CICDScannerStatus, list[str]]:
    command = find_tool("zizmor")
    if command is None:
        return (
            [],
            CICDScannerStatus(
                name="zizmor",
                available=False,
                command="zizmor",
                state="missing",
                error="zizmor CLI not found. Install it to enable GitHub Actions security audits.",
            ),
            ["zizmor CLI not found"],
        )
    version = get_tool_version([command, "--version"])
    scan_target = target / ".github" / "workflows" if workflows else target
    cmd = [command, "--format=json", "--offline", str(scan_target)]
    process = run_command(cmd, target, timeout_seconds)
    if process.timeout:
        return (
            [],
            CICDScannerStatus(name="zizmor", available=True, command=command, version=version, state="failed", error="Timed out"),
            ["zizmor scan timed out"],
        )
    output = process.stdout.strip()
    if not output:
        error = process.stderr.strip() if process.returncode not in (0, 1) else None
        return (
            [],
            CICDScannerStatus(
                name="zizmor",
                available=True,
                command=command,
                version=version,
                state="failed" if error else "ok",
                error=error,
            ),
            [error] if error else [],
        )
    try:
        payload = json.loads(output)
    except json.JSONDecodeError as exc:
        return (
            [],
            CICDScannerStatus(
                name="zizmor",
                available=True,
                command=command,
                version=version,
                state="failed",
                error=f"Failed to parse JSON: {exc}",
            ),
            [f"zizmor JSON parse failed: {exc}"],
        )
    findings = external_payload_to_findings(payload, target, scanner="zizmor")
    return (
        findings,
        CICDScannerStatus(name="zizmor", available=True, command=command, version=version, state="ok"),
        [],
    )


def run_actionlint(
    target: Path,
    workflows: list[Path],
    timeout_seconds: int,
) -> tuple[list[CICDFinding], CICDScannerStatus, list[str]]:
    command = find_tool("actionlint")
    if command is None:
        return (
            [],
            CICDScannerStatus(
                name="actionlint",
                available=False,
                command="actionlint",
                state="missing",
                error="actionlint CLI not found. Install it to enable workflow syntax/expression checks.",
            ),
            ["actionlint CLI not found"],
        )
    version = get_tool_version([command, "-version"])
    files = workflows or discover_workflows(target, max_workflows=MAX_WORKFLOWS)
    if not files:
        return (
            [],
            CICDScannerStatus(
                name="actionlint",
                available=True,
                command=command,
                version=version,
                state="skipped",
                error="No workflow files found",
            ),
            [],
        )
    cmd = [command, "-format", "{{json .}}"] + [str(path) for path in files]
    process = run_command(cmd, target, timeout_seconds)
    if process.timeout:
        return (
            [],
            CICDScannerStatus(
                name="actionlint",
                available=True,
                command=command,
                version=version,
                state="failed",
                error="Timed out",
            ),
            ["actionlint scan timed out"],
        )
    findings = actionlint_output_to_findings(process.stdout, target)
    error = process.stderr.strip() if process.returncode not in (0, 1) and process.stderr.strip() else None
    return (
        findings,
        CICDScannerStatus(
            name="actionlint",
            available=True,
            command=command,
            version=version,
            state="failed" if error else "ok",
            error=error,
        ),
        [error] if error else [],
    )


@dataclass(frozen=True)
class CommandResult:
    stdout: str
    stderr: str
    returncode: int
    timeout: bool = False


def run_command(cmd: list[str], cwd: Path, timeout_seconds: int) -> CommandResult:
    try:
        process = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_seconds,
            check=False,
            env=tool_env(),
        )
    except subprocess.TimeoutExpired as exc:
        return CommandResult(
            stdout=exc.stdout or "",
            stderr=exc.stderr or "",
            returncode=124,
            timeout=True,
        )
    except OSError as exc:
        return CommandResult(stdout="", stderr=str(exc), returncode=127)
    return CommandResult(stdout=process.stdout or "", stderr=process.stderr or "", returncode=process.returncode)


def find_tool(name: str) -> str | None:
    for candidate in tool_candidates(name):
        if candidate.exists():
            return str(candidate)
    return shutil.which(name)


def tool_candidates(name: str) -> Iterable[Path]:
    suffixes = [".exe", ".cmd", ".bat", ""]
    dirs = [project_venv_scripts_dir(), Path(sys.executable).resolve().parent]
    for directory in dirs:
        if directory is None:
            continue
        for suffix in suffixes:
            yield directory / f"{name}{suffix}"


def project_venv_scripts_dir() -> Path | None:
    for name in (".venv", "venv"):
        candidate = ROOT / name / ("Scripts" if os.name == "nt" else "bin")
        if candidate.exists():
            return candidate
    return None


def tool_env() -> dict[str, str]:
    env = os.environ.copy()
    script_dirs = [path for path in (project_venv_scripts_dir(), Path(sys.executable).resolve().parent) if path]
    env["PATH"] = os.pathsep.join(str(path) for path in script_dirs) + os.pathsep + env.get("PATH", "")
    return env


def get_tool_version(cmd: list[str]) -> str | None:
    process = run_command(cmd, ROOT, 5)
    output = (process.stdout or process.stderr).strip()
    return output.splitlines()[0] if output else None


def external_payload_to_findings(payload: Any, root: Path, *, scanner: str) -> list[CICDFinding]:
    items = external_items(payload)
    findings: list[CICDFinding] = []
    for index, item in enumerate(items, start=1):
        finding = external_item_to_finding(item, index, root, scanner=scanner)
        if finding is not None:
            findings.append(finding)
    return findings


def external_items(payload: Any) -> list[Any]:
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        return []
    for key in ("findings", "alerts", "results", "audits"):
        value = payload.get(key)
        if isinstance(value, list):
            return value
    return []


def external_item_to_finding(item: Any, index: int, root: Path, *, scanner: str) -> CICDFinding | None:
    if not isinstance(item, dict):
        return None
    if scanner == "zizmor":
        return zizmor_item_to_finding(item, index, root)
    raw_path = first_string(item, "path", "file", "filename", "workflow")
    raw_path = raw_path or nested_string(item, ("location", "path")) or ".github/workflows"
    workflow = relative_external_path(raw_path, root)
    line = first_int(item, "line", "line_number", "start_line") or nested_int(item, ("location", "line")) or 1
    rule = first_string(item, "rule_id", "rule", "audit", "id", "check_id") or f"{scanner}.finding"
    title = first_string(item, "title", "name", "kind") or "外部扫描器发现风险"
    message = first_string(item, "message", "description", "details", "body") or title
    severity = normalize_external_severity(first_string(item, "severity", "level", "confidence"))
    evidence = first_string(item, "evidence", "snippet", "code") or message
    score = score_for_severity(severity, 62)
    fingerprint = stable_fingerprint(scanner, rule, workflow, line, evidence)
    return CICDFinding(
        id=f"CI-{hashlib.sha1(fingerprint.encode('utf-8')).hexdigest()[:8].upper()}",
        rule_id=f"{scanner}.{rule}",
        title=title,
        severity=severity,
        score=score,
        workflow=workflow,
        job_id=None,
        job_name=None,
        step_index=None,
        step_name=None,
        line=line,
        evidence=normalize_evidence(evidence),
        reason=message,
        recommendation=RULE_METADATA["github-actions.external-scanner"]["recommendation"],
        fingerprint=fingerprint,
        scanner=scanner,
        confidence="medium",
    )


def zizmor_item_to_finding(item: dict[str, Any], index: int, root: Path) -> CICDFinding | None:
    locations = item.get("locations")
    primary_location = None
    if isinstance(locations, list):
        primary_location = next(
            (
                location
                for location in locations
                if isinstance(location, dict)
                and nested_string(location, ("symbolic", "kind")) == "Primary"
            ),
            None,
        )
        if primary_location is None and locations:
            primary_location = locations[0] if isinstance(locations[0], dict) else None
    if primary_location is None:
        primary_location = {}

    raw_path = (
        nested_string(primary_location, ("symbolic", "key", "Local", "given_path"))
        or nested_string(primary_location, ("symbolic", "key", "Local", "prefix"))
        or ".github/workflows"
    )
    workflow = relative_external_path(raw_path, root)
    row = nested_int(primary_location, ("concrete", "location", "start_point", "row")) or 0
    line = max(row + 1, 1)
    rule = first_string(item, "ident") or "zizmor"
    desc = first_string(item, "desc") or "zizmor found a GitHub Actions issue"
    annotation = nested_string(primary_location, ("symbolic", "annotation"))
    feature = nested_string(primary_location, ("concrete", "feature"))
    severity = normalize_external_severity(nested_string(item, ("determinations", "severity")))
    confidence = (nested_string(item, ("determinations", "confidence")) or "medium").lower()
    message = f"{desc}: {annotation}" if annotation else desc
    evidence = feature or annotation or message
    fingerprint = stable_fingerprint("zizmor", rule, workflow, line, evidence)
    return CICDFinding(
        id=f"CI-{hashlib.sha1(fingerprint.encode('utf-8')).hexdigest()[:8].upper()}",
        rule_id=f"zizmor.{rule}",
        title=f"zizmor: {rule}",
        severity=severity,
        score=score_for_severity(severity, 62),
        workflow=workflow,
        job_id=route_job_id(primary_location),
        job_name=route_job_id(primary_location),
        step_index=route_step_index(primary_location),
        step_name=None,
        line=line,
        evidence=normalize_evidence(evidence),
        reason=message,
        recommendation=f"参考 zizmor 审计 {item.get('url') or ''} 修复该 GitHub Actions 风险。".strip(),
        fingerprint=fingerprint,
        scanner="zizmor",
        confidence=confidence,
    )


def route_job_id(location: dict[str, Any]) -> str | None:
    route = nested_route(location)
    for index, item in enumerate(route):
        if isinstance(item, dict) and item.get("Key") == "jobs" and index + 1 < len(route):
            next_item = route[index + 1]
            if isinstance(next_item, dict) and isinstance(next_item.get("Key"), str):
                return next_item["Key"]
    return None


def route_step_index(location: dict[str, Any]) -> int | None:
    route = nested_route(location)
    for index, item in enumerate(route):
        if isinstance(item, dict) and item.get("Key") == "steps" and index + 1 < len(route):
            next_item = route[index + 1]
            if isinstance(next_item, dict) and isinstance(next_item.get("Index"), int):
                return int(next_item["Index"]) + 1
    return None


def nested_route(location: dict[str, Any]) -> list[Any]:
    value: Any = location
    for key in ("symbolic", "route", "route"):
        if not isinstance(value, dict):
            return []
        value = value.get(key)
    return value if isinstance(value, list) else []


def actionlint_output_to_findings(output: str, root: Path) -> list[CICDFinding]:
    findings: list[CICDFinding] = []
    for index, line in enumerate(output.splitlines(), start=1):
        stripped = line.strip()
        if not stripped:
            continue
        try:
            payload = json.loads(stripped)
        except json.JSONDecodeError:
            payload = parse_actionlint_plain_line(stripped)
        finding = actionlint_item_to_finding(payload, index, root)
        if finding is not None:
            findings.append(finding)
    return findings


def actionlint_item_to_finding(item: Any, index: int, root: Path) -> CICDFinding | None:
    if not isinstance(item, dict):
        return None
    raw_path = first_string(item, "filepath", "file", "path") or nested_string(item, ("loc", "file")) or ".github/workflows"
    workflow = relative_external_path(raw_path, root)
    line = first_int(item, "line", "line_number") or nested_int(item, ("loc", "line")) or 1
    rule = first_string(item, "kind", "rule", "code") or "actionlint"
    message = first_string(item, "message", "msg", "body") or "actionlint found a workflow issue"
    severity = "medium" if "credential" in message.lower() or "injection" in message.lower() else "low"
    fingerprint = stable_fingerprint("actionlint", rule, workflow, line, message)
    return CICDFinding(
        id=f"CI-{hashlib.sha1(fingerprint.encode('utf-8')).hexdigest()[:8].upper()}",
        rule_id=f"actionlint.{rule}",
        title="actionlint workflow 检查",
        severity=severity,
        score=score_for_severity(severity, 45),
        workflow=workflow,
        job_id=None,
        job_name=None,
        step_index=None,
        step_name=None,
        line=line,
        evidence=normalize_evidence(message),
        reason=message,
        recommendation="修正 workflow 语法、表达式或脚本问题；对 run 脚本中的上下文表达式使用 env 中转并加引号。",
        fingerprint=fingerprint,
        scanner="actionlint",
        confidence="medium",
    )


def parse_actionlint_plain_line(line: str) -> dict[str, Any]:
    match = re.match(r"^(?P<file>.*?):(?P<line>\d+):(?P<col>\d+):\s*(?P<message>.*?)(?:\s+\[(?P<kind>[^\]]+)\])?$", line)
    if not match:
        return {"message": line, "kind": "actionlint"}
    return {
        "filepath": match.group("file"),
        "line": int(match.group("line")),
        "message": match.group("message"),
        "kind": match.group("kind") or "actionlint",
    }


def first_string(item: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def first_int(item: dict[str, Any], *keys: str) -> int | None:
    for key in keys:
        value = item.get(key)
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.isdigit():
            return int(value)
    return None


def nested_string(item: dict[str, Any], path: tuple[str, ...]) -> str | None:
    value: Any = item
    for key in path:
        if not isinstance(value, dict):
            return None
        value = value.get(key)
    return value.strip() if isinstance(value, str) and value.strip() else None


def nested_int(item: dict[str, Any], path: tuple[str, ...]) -> int | None:
    value: Any = item
    for key in path:
        if not isinstance(value, dict):
            return None
        value = value.get(key)
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def normalize_external_severity(value: str | None) -> str:
    if not value:
        return "medium"
    lower = value.lower()
    if lower in {"critical", "error"}:
        return "critical"
    if lower in {"high", "warning", "warn"}:
        return "high"
    if lower in {"medium", "moderate"}:
        return "medium"
    return "low"


def relative_external_path(raw_path: str, root: Path) -> str:
    candidate = Path(raw_path)
    if candidate.is_absolute():
        return relative_posix(candidate, root)
    return raw_path.replace("\\", "/")


def remote_script_findings(
    run_script: str,
    *,
    workflow: WorkflowContext,
    job_id: str | None,
    job_name: str | None,
    step_index: int | None,
    step_name: str | None,
    search_start: int = 1,
) -> list[CICDFinding]:
    findings: list[CICDFinding] = []
    for match in REMOTE_SCRIPT_PIPE_RE.finditer(run_script):
        evidence = normalize_evidence(match.group(0))
        findings.append(
            build_finding(
                rule_id="github-actions.remote-script-pipe",
                workflow=workflow,
                job_id=job_id,
                job_name=job_name,
                step_index=step_index,
                step_name=step_name,
                line=workflow.locator.find_after(
                    search_start,
                    evidence,
                    first_meaningful_line(match.group(0)),
                    fallback=search_start,
                ),
                evidence=evidence,
            )
        )
    return findings


def secret_findings_for_value(
    value: Any,
    *,
    workflow: WorkflowContext,
    job_id: str | None,
    job_name: str | None,
    step_index: int | None,
    step_name: str | None,
    scope: str,
    search_start: int = 1,
) -> list[CICDFinding]:
    findings: list[CICDFinding] = []
    seen: set[str] = set()
    for context_key, text in iter_string_values(value, scope):
        if not text or SAFE_EXPRESSION_RE.search(text):
            continue
        for secret_kind, raw_secret, raw_evidence in detect_plaintext_secrets(text, context_key):
            if raw_secret in seen:
                continue
            seen.add(raw_secret)
            evidence = f"{context_key}: {mask_secret_in_text(raw_evidence, raw_secret)}"
            line = workflow.locator.find_after(
                search_start,
                raw_secret,
                raw_evidence,
                context_key.rsplit(".", 1)[-1],
                fallback=search_start,
            )
            findings.append(
                build_finding(
                    rule_id="github-actions.plaintext-secret",
                    workflow=workflow,
                    job_id=job_id,
                    job_name=job_name,
                    step_index=step_index,
                    step_name=step_name,
                    line=line,
                    evidence=f"{secret_kind} {normalize_evidence(evidence)}",
                )
            )
    return findings


def detect_plaintext_secrets(text: str, context_key: str) -> Iterable[tuple[str, str, str]]:
    key_name = context_key.rsplit(".", 1)[-1]
    stripped = text.strip()
    if SENSITIVE_KEY_RE.search(key_name) and SECRET_VALUE_RE.fullmatch(stripped):
        yield "sensitive-key", stripped, f"{key_name}: {stripped}"

    for name, pattern in SECRET_TOKEN_PATTERNS:
        for match in pattern.finditer(text):
            yield name, match.group(0), match.group(0)

    for match in SECRET_ASSIGNMENT_RE.finditer(text):
        yield "secret-assignment", match.group(2), match.group(0)


def iter_string_values(value: Any, prefix: str) -> Iterable[tuple[str, str]]:
    if value is None:
        return
    if isinstance(value, str):
        yield prefix, value
        return
    if isinstance(value, dict):
        for key, child in value.items():
            child_prefix = f"{prefix}.{key}"
            yield from iter_string_values(child, child_prefix)
        return
    if isinstance(value, list):
        for index, child in enumerate(value, start=1):
            child_prefix = f"{prefix}[{index}]"
            yield from iter_string_values(child, child_prefix)


def is_write_all_permissions(value: Any) -> bool:
    return isinstance(value, str) and value.strip().lower() == "write-all"


def permission_findings(
    value: Any,
    *,
    workflow: WorkflowContext,
    job_id: str | None,
    job_name: str | None,
    search_start: int,
) -> list[CICDFinding]:
    if not isinstance(value, dict):
        return []
    findings: list[CICDFinding] = []
    for key, raw_permission in value.items():
        permission = str(raw_permission).strip().lower()
        permission_key = str(key).strip().lower()
        if permission != "write" or permission_key not in WRITE_PERMISSION_KEYS:
            continue
        rule_id = "github-actions.id-token-write" if permission_key == "id-token" else "github-actions.broad-write-permission"
        findings.append(
            build_finding(
                rule_id=rule_id,
                workflow=workflow,
                job_id=job_id,
                job_name=job_name,
                step_index=None,
                step_name=None,
                line=workflow.locator.find_after(search_start, f"{permission_key}: write", fallback=search_start),
                evidence=f"permissions: {permission_key}: write",
            )
        )
    return findings


def workflow_has_event(data: dict[str, Any], event_name: str) -> bool:
    raw_on = data.get("on")
    if raw_on is None and True in data:
        raw_on = data.get(True)
    if isinstance(raw_on, str):
        return raw_on == event_name
    if isinstance(raw_on, list):
        return event_name in [str(item) for item in raw_on]
    if isinstance(raw_on, dict):
        return event_name in [str(key) for key in raw_on.keys()]
    return False


def job_uses_self_hosted_runner(value: Any) -> bool:
    if isinstance(value, str):
        return value.strip().lower() == "self-hosted"
    if isinstance(value, list):
        return any(str(item).strip().lower() == "self-hosted" for item in value)
    return False


def is_secrets_inherit(value: Any) -> bool:
    return isinstance(value, str) and value.strip().lower() == "inherit"


def checkout_uses_pr_head(uses_value: str, step: dict[str, Any]) -> bool:
    lower_uses = uses_value.strip().lower()
    if not lower_uses.startswith("actions/checkout@"):
        return False
    raw_with = step.get("with")
    if not isinstance(raw_with, dict):
        return False
    for key in ("ref", "repository"):
        value = raw_with.get(key)
        if isinstance(value, str) and "github.event.pull_request.head" in value:
            return True
    return False


def action_classification(uses_value: str, policy: dict[str, Any]) -> str:
    match = GITHUB_ACTION_RE.match(uses_value)
    if not match:
        return "third_party"
    owner = match.group("owner").lower()
    repo = match.group("repo").lower()
    action_name = f"{owner}/{repo}"
    for pattern in policy.get("trusted_actions") or DEFAULT_TRUSTED_ACTIONS:
        if action_matches_pattern(action_name, str(pattern).lower()):
            return "official"
    return "third_party"


def action_matches_pattern(action_name: str, pattern: str) -> bool:
    if pattern.endswith("/*"):
        return action_name.startswith(pattern[:-1])
    return action_name == pattern


def unpinned_action_severity(classification: str, policy: dict[str, Any]) -> str | None:
    overrides = policy.get("severity_overrides")
    if isinstance(overrides, dict):
        rule_override = overrides.get("github-actions.unpinned-action-ref")
        if isinstance(rule_override, dict):
            value = rule_override.get(classification)
            if isinstance(value, str) and value in {"critical", "high", "medium", "low"}:
                return value
    pinning = policy.get("action_pinning")
    if isinstance(pinning, dict) and classification == "official" and bool(pinning.get("official_actions_tag_ok", True)):
        return "low"
    if isinstance(pinning, dict) and classification == "third_party" and bool(pinning.get("require_sha_for_third_party", True)):
        return "high"
    return None


def score_for_severity(severity: str, default_score: int) -> int:
    if severity == "critical":
        return max(default_score, 90)
    if severity == "high":
        return max(75, min(default_score, 89))
    if severity == "medium":
        return max(55, min(default_score, 74))
    return min(default_score, 45)


def build_finding(
    *,
    rule_id: str,
    workflow: WorkflowContext,
    job_id: str | None,
    job_name: str | None,
    step_index: int | None,
    step_name: str | None,
    line: int,
    evidence: str,
    severity: str | None = None,
    scanner: str = "SupplyGuard CI/CD",
    reason: str | None = None,
    recommendation: str | None = None,
    confidence: str = "medium",
) -> CICDFinding:
    metadata = RULE_METADATA[rule_id]
    finding_severity = severity or str(metadata["severity"])
    score = score_for_severity(finding_severity, int(metadata["score"]))
    fingerprint = stable_fingerprint(rule_id, workflow.relative_path, job_id, step_index, line, evidence)
    return CICDFinding(
        id=f"CI-{hashlib.sha1(fingerprint.encode('utf-8')).hexdigest()[:8].upper()}",
        rule_id=rule_id,
        title=str(metadata["title"]),
        severity=finding_severity,
        score=score,
        workflow=workflow.relative_path,
        job_id=job_id,
        job_name=job_name,
        step_index=step_index,
        step_name=step_name,
        line=max(line, 1),
        evidence=normalize_evidence(evidence),
        reason=reason or str(metadata["reason"]),
        recommendation=recommendation or str(metadata["recommendation"]),
        fingerprint=fingerprint,
        scanner=scanner,
        confidence=confidence,
    )


def build_summary(
    findings: list[CICDFinding],
    workflows: list[Path],
    job_count: int,
    step_count: int,
    *,
    scanners: list[CICDScannerStatus] | None = None,
) -> dict[str, Any]:
    severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    by_rule: dict[str, int] = {}
    for finding in findings:
        severity_counts[finding.severity] = severity_counts.get(finding.severity, 0) + 1
        by_rule[finding.rule_id] = by_rule.get(finding.rule_id, 0) + 1
    risk_score = max([finding.score for finding in findings], default=0)
    return {
        "workflow_count": len(workflows),
        "job_count": job_count,
        "total_steps": step_count,
        "finding_count": len(findings),
        "risk_score": risk_score,
        "risk_level": risk_severity(risk_score),
        "critical": severity_counts["critical"],
        "high": severity_counts["high"],
        "medium": severity_counts["medium"],
        "low": severity_counts["low"],
        "by_rule": by_rule,
        "tools": [
            {
                "name": status.name,
                "available": status.available,
                "version": status.version,
                "error": status.error,
                "state": status.state,
            }
            for status in (scanners or [])
        ],
    }


def build_cicd_report(
    target: Path,
    workflows: list[str],
    findings: list[CICDFinding],
    summary: dict[str, Any],
    warnings: list[str],
    scanners: list[CICDScannerStatus],
) -> str:
    tool_rows = "\n".join(
        f"| {scanner.name} | {'可用' if scanner.available else '不可用'} | {scanner.version or '-'} | {scanner.state} | {scanner.error or '-'} |"
        for scanner in scanners
    )
    workflow_rows = "\n".join(f"- {workflow}" for workflow in workflows)
    finding_rows = "\n".join(
        "| {scanner} | {workflow} | {job} | {step} | {severity} | {reason} | {evidence} | {recommendation} |".format(
            scanner=finding.scanner,
            workflow=finding.workflow,
            job=finding.job_id or "-",
            step=finding.step_name or "-",
            severity=finding.severity,
            reason=finding.reason.replace("|", "\\|"),
            evidence=f"{finding.evidence} (line {finding.line})".replace("|", "\\|"),
            recommendation=finding.recommendation.replace("|", "\\|"),
        )
        for finding in findings
    )
    warning_rows = "\n".join(f"- {warning}" for warning in warnings)
    return f"""# CI/CD 构建流程风险报告

生成时间：{datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC")}
扫描目标：{target}

## 摘要

- Workflow 数量：{summary['workflow_count']}
- Job 数量：{summary['job_count']}
- Step 数量：{summary['total_steps']}
- 风险数量：{summary['finding_count']}
- 严重：{summary['critical']}
- 高危：{summary['high']}
- 中危：{summary['medium']}
- 低危：{summary['low']}

## 扫描到的 Workflow

{workflow_rows or '- 未发现 GitHub Actions workflow。'}

## 扫描器

| 工具 | 状态 | 版本 | 运行状态 | 说明 |
| --- | --- | --- | --- | --- |
{tool_rows or '| SupplyGuard CI/CD | 可用 | builtin | ok | - |'}

## 风险明细

| 扫描器 | Workflow | Job | Step | 等级 | 风险原因 | 证据 | 修复建议 |
| --- | --- | --- | --- | --- | --- | --- | --- |
{finding_rows or '| - | - | - | - | - | 暂未发现匹配风险 | - | - |'}

## 扫描提示

{warning_rows or '- 扫描完成。'}
"""


def dedupe_findings(findings: list[CICDFinding]) -> list[CICDFinding]:
    seen: set[str] = set()
    result: list[CICDFinding] = []
    for finding in sorted(findings, key=lambda item: (-item.score, item.workflow, item.line, item.rule_id)):
        if finding.fingerprint in seen:
            continue
        seen.add(finding.fingerprint)
        result.append(finding)
    return result


def apply_cicd_state(
    findings: list[CICDFinding],
    target_info: dict[str, Any],
    scan_id: str,
    generated_at: str,
    scanners: list[CICDScannerStatus],
) -> tuple[list[CICDFinding], dict[str, Any]]:
    state = load_audit_state()
    target_key = audit_target_key(target_info)
    ignored = state.get("ignored", {})
    active_findings: list[CICDFinding] = []
    ignored_count = 0
    for finding in findings:
        if finding.fingerprint in ignored:
            ignored_count += 1
            continue
        active_findings.append(finding)
    state_summary = state_summary_for_findings(active_findings, target_info, ignored_count=ignored_count, state=state)
    record_audit_run(state, active_findings, target_info, scan_id, generated_at, scanners, state_summary)
    save_audit_state(state)
    state_summary["trend"] = audit_trend(target_info, state=state)
    return active_findings, state_summary


def refresh_audit_result(result: CICDAuditResult) -> CICDAuditResult:
    state = load_audit_state()
    active_findings = [
        finding
        for finding in result.findings
        if finding.fingerprint not in state.get("ignored", {})
    ]
    summary = build_summary(active_findings, [Path(item) for item in result.workflows], result.summary["job_count"], result.summary["total_steps"], scanners=result.scanners)
    summary["target"] = result.target
    summary.update(state_summary_for_findings(active_findings, result.target, state=state))
    report = build_cicd_report(Path(result.target_path), result.workflows, active_findings, summary, result.warnings, result.scanners)
    sarif = build_cicd_sarif(active_findings, result.target)
    return CICDAuditResult(
        scan_id=result.scan_id,
        generated_at=result.generated_at,
        target_path=result.target_path,
        target=result.target,
        workflows=result.workflows,
        findings=active_findings,
        scanners=result.scanners,
        summary=summary,
        report=report,
        sarif=sarif,
        state=audit_state_payload(result.target),
        warnings=result.warnings,
    )


def load_audit_state() -> dict[str, Any]:
    if not CICD_AUDIT_STATE_PATH.exists():
        return empty_audit_state()
    try:
        payload = json.loads(CICD_AUDIT_STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return empty_audit_state()
    state = empty_audit_state()
    if isinstance(payload, dict):
        for key in state:
            if isinstance(payload.get(key), type(state[key])):
                state[key] = payload[key]
    return state


def save_audit_state(state: dict[str, Any]) -> None:
    CICD_AUDIT_STATE_DIR.mkdir(parents=True, exist_ok=True)
    CICD_AUDIT_STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


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
    findings: list[CICDFinding],
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
    new_fingerprints = current_fingerprints - baseline_fingerprints if baseline_fingerprints else current_fingerprints
    fixed_fingerprints = baseline_fingerprints - current_fingerprints if baseline_fingerprints else set()
    return {
        "target_key": target_key,
        "ignored": ignored_count if ignored_count is not None else 0,
        "ignored_total": len(current_state.get("ignored", {})),
        "baseline_exists": bool(baseline_fingerprints),
        "baseline_total": len(baseline_fingerprints),
        "baseline_created_at": baseline.get("created_at") if isinstance(baseline, dict) else None,
        "new": len(new_fingerprints),
        "fixed": len(fixed_fingerprints),
        "trend": audit_trend(target_info, state=current_state),
    }


def record_audit_run(
    state: dict[str, Any],
    findings: list[CICDFinding],
    target_info: dict[str, Any],
    scan_id: str,
    generated_at: str,
    scanners: list[CICDScannerStatus],
    state_summary: dict[str, Any],
) -> None:
    runs = state.setdefault("runs", [])
    counts = finding_counts(findings)
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
            "tools": [scanner.name for scanner in scanners if scanner.available],
        }
    )
    del runs[:-80]


def finding_counts(findings: list[CICDFinding]) -> dict[str, int]:
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for finding in findings:
        counts[finding.severity] = counts.get(finding.severity, 0) + 1
    return counts


def audit_state_payload(target_info: dict[str, Any] | None = None) -> dict[str, Any]:
    state = load_audit_state()
    target_key = audit_target_key(target_info) if target_info else None
    ignored = list(state.get("ignored", {}).values())
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
        "baseline": state.get("baselines", {}).get(target_key) if target_key else None,
        "baselines": state.get("baselines", {}),
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
    finding: CICDFinding | None = None,
) -> dict[str, Any]:
    state = load_audit_state()
    now = datetime.now(UTC).isoformat()
    target_key = audit_target_key(target_info) if target_info else None
    state.setdefault("ignored", {})[fingerprint] = {
        "fingerprint": fingerprint,
        "reason": reason,
        "created_at": now,
        "target_key": target_key,
        "finding": serialize_finding(finding) if finding else None,
    }
    save_audit_state(state)
    return audit_state_payload(target_info)


def remove_ignored_finding(fingerprint: str, target_info: dict[str, Any] | None = None) -> dict[str, Any]:
    state = load_audit_state()
    state.setdefault("ignored", {}).pop(fingerprint, None)
    save_audit_state(state)
    return audit_state_payload(target_info)


def create_audit_baseline(result: CICDAuditResult, note: str = "") -> dict[str, Any]:
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


def build_cicd_sarif(findings: list[CICDFinding], target_info: dict[str, Any]) -> dict[str, Any]:
    rules: dict[str, dict[str, Any]] = {}
    results: list[dict[str, Any]] = []
    for finding in findings:
        rules.setdefault(
            finding.rule_id,
            {
                "id": finding.rule_id,
                "name": finding.title,
                "shortDescription": {"text": finding.title[:120]},
                "fullDescription": {"text": finding.reason},
                "help": {"text": finding.recommendation},
                "properties": {
                    "scanner": finding.scanner,
                    "severity": finding.severity,
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
                            "artifactLocation": {"uri": finding.workflow.replace("\\", "/")},
                            "region": {"startLine": max(finding.line, 1)},
                        }
                    }
                ],
                "partialFingerprints": {"primaryLocationLineHash": finding.fingerprint},
                "properties": {
                    "scanner": finding.scanner,
                    "confidence": finding.confidence,
                    "recommendation": finding.recommendation,
                    "job_id": finding.job_id,
                    "step_name": finding.step_name,
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
                        "name": "SupplyGuard CI/CD Audit",
                        "informationUri": "https://zizmor.sh/",
                        "rules": list(rules.values()),
                    }
                },
                "automationDetails": {"id": str(target_info.get("importId") or "workspace-cicd")},
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


def serialize_cicd_audit(result: CICDAuditResult | None) -> dict[str, Any] | None:
    if result is None:
        return None
    return {
        "scan_id": result.scan_id,
        "generated_at": result.generated_at,
        "target_path": result.target_path,
        "target": result.target,
        "workflows": result.workflows,
        "summary": result.summary,
        "findings": [serialize_finding(finding) for finding in result.findings],
        "scanners": [
            {
                "name": scanner.name,
                "available": scanner.available,
                "command": scanner.command,
                "version": scanner.version,
                "error": scanner.error,
                "state": scanner.state,
            }
            for scanner in result.scanners
        ],
        "sarif": result.sarif,
        "state": result.state,
        "report": result.report,
        "warnings": result.warnings,
    }


def serialize_finding(finding: CICDFinding) -> dict[str, Any]:
    return {
        "id": finding.id,
        "rule_id": finding.rule_id,
        "title": finding.title,
        "severity": finding.severity,
        "score": finding.score,
        "workflow": finding.workflow,
        "job_id": finding.job_id,
        "job_name": finding.job_name,
        "step_index": finding.step_index,
        "step_name": finding.step_name,
        "line": finding.line,
        "evidence": finding.evidence,
        "reason": finding.reason,
        "recommendation": finding.recommendation,
        "fingerprint": finding.fingerprint,
        "scanner": finding.scanner,
        "confidence": finding.confidence,
    }


def empty_cicd_audit_payload() -> dict[str, Any]:
    return {
        "scan_id": None,
        "summary": {
            "workflow_count": 0,
            "job_count": 0,
            "total_steps": 0,
            "finding_count": 0,
            "risk_score": 0,
            "risk_level": "low",
            "critical": 0,
            "high": 0,
            "medium": 0,
            "low": 0,
            "by_rule": {},
        },
        "workflows": [],
        "findings": [],
        "scanners": [],
        "sarif": build_cicd_sarif([], {"projectName": "workspace"}),
        "state": audit_state_payload(),
        "report": "# CI/CD 构建流程风险报告\n\n尚未执行扫描。\n",
        "warnings": [],
    }


def stable_fingerprint(*parts: Any) -> str:
    value = ":".join(str(part or "") for part in parts)
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def normalize_evidence(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip())[:500]


def normalize_for_search(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip()).lower()


def first_meaningful_line(value: str) -> str:
    for line in value.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped
    return value.strip()


def mask_secret_in_text(text: str, secret: str) -> str:
    return text.replace(secret, mask_secret(secret))


def mask_secret(secret: str) -> str:
    if len(secret) <= 10:
        return "***"
    return f"{secret[:4]}...{secret[-4:]}"


def risk_severity(score: int) -> str:
    if score >= 90:
        return "critical"
    if score >= 75:
        return "high"
    if score >= 55:
        return "medium"
    return "low"


def relative_posix(path: Path, root: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return path.as_posix()
