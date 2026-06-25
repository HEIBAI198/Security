"""SupplyGuard 门禁执行器，用于 Git Hook、CI Gate 和发布前产物门禁。"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
from typing import Any

from .artifact_trust import ArtifactTrustRequest, run_artifact_trust_scan
from .cicd_audit import CICDAuditRequest, run_cicd_audit
from .code_audit import (
    CodeAuditRequest,
    SECRET_ASSIGNMENT_RE,
    SECRET_TOKEN_PATTERNS,
    looks_like_secret,
    run_code_audit,
)
from .dependency_audit import DependencyAuditRequest, run_dependency_audit

try:
    import yaml
except Exception:  # pragma: no cover - PyYAML 缺失时仍可使用默认策略。
    yaml = None  # type: ignore[assignment]


DEFAULT_POLICY: dict[str, Any] = {
    "profile": "vibe-coding",
    "fail_on_critical": True,
    "max_high": 0,
    "fail_on_scan_error": False,
    "block_on": [
        "sensitive_file",
        "hardcoded_secret",
        "malicious_dependency",
        "suspicious_postinstall",
        "dangerous_cicd_script",
        "untrusted_workflow",
        "artifact_provenance_mismatch",
    ],
    "scans": {
        "code": True,
        "dependencies": True,
        "cicd": True,
        "include_osv": False,
        "include_zizmor": False,
        "include_actionlint": False,
    },
    "artifact_trust": {
        "require_provenance": True,
        "require_signature": False,
        "allow_self_hosted_runner": False,
        "allowed_workflows": [".github/workflows/release.yml"],
        "allowed_builders": ["https://github.com/actions/runner"],
    },
}

SEVERITIES = ("critical", "high", "medium", "low")
SENSITIVE_FILE_RE = re.compile(
    r"(^|/)(\.env|\.env\..+|id_rsa|id_dsa|id_ed25519|.*\.(pem|key|p12|pfx|keystore))$",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class GateFinding:
    module: str
    rule_id: str
    title: str
    severity: str
    category: str
    location: str = ""
    evidence: str = ""
    recommendation: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "module": self.module,
            "rule_id": self.rule_id,
            "title": self.title,
            "severity": normalize_severity(self.severity),
            "category": self.category,
            "location": self.location,
            "evidence": self.evidence,
            "recommendation": self.recommendation,
        }


@dataclass
class GateResult:
    passed: bool
    mode: str
    target: str
    policy_path: str
    summary: dict[str, Any]
    findings: list[GateFinding] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    reports: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "mode": self.mode,
            "target": self.target,
            "policy_path": self.policy_path,
            "summary": self.summary,
            "findings": [finding.to_dict() for finding in self.findings],
            "errors": self.errors,
            "reports": self.reports,
        }


def run_gate(
    *,
    target: str | Path,
    policy_path: str | Path | None = None,
    mode: str = "ci",
    staged: bool = False,
    artifact: str | Path | None = None,
    attestation: str | Path | None = None,
    timeout_seconds: int = 90,
) -> GateResult:
    target_path = Path(target).expanduser().resolve()
    if not target_path.exists():
        raise ValueError(f"扫描目标不存在: {target_path}")

    resolved_policy_path = resolve_policy_path(target_path, policy_path)
    policy = load_gate_policy(target_path, resolved_policy_path)
    findings: list[GateFinding] = []
    errors: list[str] = []
    reports: dict[str, str] = {}

    if staged:
        findings.extend(scan_staged_changes(target_path))

    scans = policy.get("scans") if isinstance(policy.get("scans"), dict) else {}
    if truthy(scans.get("code"), default=True):
        try:
            result = run_code_audit(
                CodeAuditRequest(
                    target_path=str(target_path),
                    allow_external=True,
                    timeout_seconds=timeout_seconds,
                ),
                timeout_seconds=timeout_seconds,
            )
            reports["code_audit"] = result.report
            findings.extend(code_findings(result.findings))
        except Exception as exc:
            errors.append(f"代码审计失败: {exc}")

    if truthy(scans.get("dependencies"), default=True) and target_path.is_dir():
        try:
            result = run_dependency_audit(
                DependencyAuditRequest(
                    target_path=str(target_path),
                    allow_external=True,
                    include_osv=truthy(scans.get("include_osv"), default=False),
                )
            )
            reports["dependency_audit"] = result.report
            findings.extend(dependency_findings(result.findings))
        except Exception as exc:
            errors.append(f"依赖审计失败: {exc}")

    if truthy(scans.get("cicd"), default=True):
        try:
            result = run_cicd_audit(
                CICDAuditRequest(
                    target_path=str(target_path),
                    allow_external=True,
                    include_zizmor=truthy(scans.get("include_zizmor"), default=False),
                    include_actionlint=truthy(scans.get("include_actionlint"), default=False),
                )
            )
            reports["cicd_audit"] = result.report
            findings.extend(cicd_findings(result.findings))
        except Exception as exc:
            errors.append(f"CI/CD 审计失败: {exc}")

    should_check_artifact = artifact is not None or mode == "release"
    if should_check_artifact:
        artifact_path = Path(artifact).expanduser().resolve() if artifact else None
        attestation_path = Path(attestation).expanduser().resolve() if attestation else None
        if artifact_path is None or not artifact_path.exists():
            findings.append(
                GateFinding(
                    module="artifact_trust",
                    rule_id="supplyguard.artifact.missing",
                    title="发布门禁未找到待发布产物",
                    severity="critical",
                    category="artifact_provenance_mismatch",
                    location=str(artifact or ""),
                    recommendation="在 release workflow 中传入 --artifact，且确保构建步骤已生成该文件。",
                )
            )
        elif attestation_path is None or not attestation_path.exists():
            severity = "critical" if artifact_policy(policy).get("require_provenance", True) else "medium"
            findings.append(
                GateFinding(
                    module="artifact_trust",
                    rule_id="supplyguard.artifact.attestation_missing",
                    title="发布产物缺少 provenance/attestation 证明文件",
                    severity=severity,
                    category="artifact_provenance_mismatch",
                    location=str(artifact_path),
                    recommendation="生成 in-toto/SLSA provenance，或在策略中显式关闭 require_provenance。",
                )
            )
        else:
            try:
                result = run_artifact_trust_scan(
                    ArtifactTrustRequest(
                        artifact_path=str(artifact_path),
                        attestation_path=str(attestation_path),
                        allow_external=True,
                        **artifact_request_kwargs(policy),
                    )
                )
                reports["artifact_trust"] = result.report
                findings.extend(artifact_findings(result.findings))
            except Exception as exc:
                findings.append(
                    GateFinding(
                        module="artifact_trust",
                        rule_id="supplyguard.artifact.scan_failed",
                        title="产物可信校验执行失败",
                        severity="critical",
                        category="artifact_provenance_mismatch",
                        location=str(artifact_path),
                        evidence=str(exc),
                        recommendation="检查 artifact、attestation 和 gate.yml 中的 artifact_trust 配置。",
                    )
                )

    summary = evaluate_policy(policy, findings, errors)
    return GateResult(
        passed=not summary["blocked"],
        mode=mode,
        target=str(target_path),
        policy_path=str(resolved_policy_path),
        summary=summary,
        findings=findings,
        errors=errors,
        reports=reports,
    )


def resolve_policy_path(target: Path, policy_path: str | Path | None) -> Path:
    if policy_path:
        candidate = Path(policy_path).expanduser()
        if not candidate.is_absolute():
            candidate = target / candidate
        return candidate.resolve()
    return (target / ".supplyguard" / "gate.yml").resolve()


def load_gate_policy(target: Path, policy_path: Path) -> dict[str, Any]:
    policy = json.loads(json.dumps(DEFAULT_POLICY))
    if not policy_path.exists():
        return policy
    if yaml is None:
        return policy
    payload = yaml.safe_load(policy_path.read_text(encoding="utf-8", errors="replace"))
    if not isinstance(payload, dict):
        return policy
    if isinstance(payload.get("policy"), dict):
        payload = {**payload, **payload["policy"]}
        payload.pop("policy", None)
    merge_dict(policy, payload)
    return policy


def merge_dict(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    for key, value in overlay.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            merge_dict(base[key], value)
        else:
            base[key] = value
    return base


def scan_staged_changes(target: Path) -> list[GateFinding]:
    paths = git_staged_paths(target)
    findings: list[GateFinding] = []
    for rel_path in paths:
        normalized = rel_path.replace("\\", "/")
        if SENSITIVE_FILE_RE.search(normalized):
            findings.append(
                GateFinding(
                    module="git_hook",
                    rule_id="supplyguard.staged.sensitive-file",
                    title="暂存区包含敏感文件",
                    severity="critical",
                    category="sensitive_file",
                    location=normalized,
                    recommendation="不要提交 .env、私钥、证书或密钥库文件；改用 .env.example 和密钥管理服务。",
                )
            )
        findings.extend(scan_staged_text_for_secrets(target, normalized))
    return findings


def git_staged_paths(target: Path) -> list[str]:
    try:
        process = subprocess.run(
            ["git", "-C", str(target), "diff", "--cached", "--name-only", "-z"],
            capture_output=True,
            check=False,
        )
    except OSError:
        return []
    if process.returncode != 0:
        return []
    text = process.stdout.decode("utf-8", errors="replace")
    return [item for item in text.split("\0") if item]


def scan_staged_text_for_secrets(target: Path, rel_path: str) -> list[GateFinding]:
    if not is_text_like(rel_path):
        return []
    try:
        process = subprocess.run(
            ["git", "-C", str(target), "show", f":{rel_path}"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=5,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return []
    if process.returncode != 0:
        return []

    findings: list[GateFinding] = []
    for line_number, line in enumerate(process.stdout.splitlines(), start=1):
        evidence = secret_evidence(line)
        if not evidence:
            continue
        findings.append(
            GateFinding(
                module="git_hook",
                rule_id="supplyguard.staged.hardcoded-secret",
                title="暂存区疑似包含硬编码密钥",
                severity="critical",
                category="hardcoded_secret",
                location=f"{rel_path}:{line_number}",
                evidence=evidence,
                recommendation="撤销并轮换该密钥，移出提交内容，改用运行时环境变量或密钥管理服务。",
            )
        )
    return findings


def secret_evidence(line: str) -> str:
    for rule_id, pattern in SECRET_TOKEN_PATTERNS:
        match = pattern.search(line)
        if match:
            return f"{rule_id}: {mask_secret(match.group(0))}"
    assignment = SECRET_ASSIGNMENT_RE.search(line)
    if assignment and looks_like_secret(assignment.group(2)):
        return mask_secret(assignment.group(0))
    return ""


def is_text_like(path: str) -> bool:
    suffix = Path(path).suffix.lower()
    return suffix in {
        "",
        ".env",
        ".cfg",
        ".conf",
        ".ini",
        ".json",
        ".js",
        ".jsx",
        ".py",
        ".sh",
        ".toml",
        ".ts",
        ".tsx",
        ".txt",
        ".yaml",
        ".yml",
    } or Path(path).name.startswith(".env")


def mask_secret(value: str) -> str:
    stripped = value.strip()
    if len(stripped) <= 12:
        return "***"
    return f"{stripped[:4]}...{stripped[-4:]}"


def code_findings(findings: list[Any]) -> list[GateFinding]:
    return [
        GateFinding(
            module="code_audit",
            rule_id=str(item.rule_id),
            title=str(item.title),
            severity=str(item.severity),
            category=code_category(item),
            location=f"{item.risk_file}:{item.line}" if item.line else str(item.risk_file),
            evidence=str(item.evidence),
            recommendation=str(item.recommendation),
        )
        for item in findings
    ]


def dependency_findings(findings: list[Any]) -> list[GateFinding]:
    return [
        GateFinding(
            module="dependency_audit",
            rule_id=str(item.id),
            title=str(item.title),
            severity=str(item.severity),
            category=dependency_category(item),
            location=str(item.source_file),
            evidence=str(item.evidence),
            recommendation=str(item.recommendation),
        )
        for item in findings
    ]


def cicd_findings(findings: list[Any]) -> list[GateFinding]:
    return [
        GateFinding(
            module="cicd_audit",
            rule_id=str(item.rule_id),
            title=str(item.title),
            severity=str(item.severity),
            category=cicd_category(item),
            location=f"{item.workflow}:{item.line}" if item.line else str(item.workflow),
            evidence=str(item.evidence or item.reason),
            recommendation=str(item.recommendation),
        )
        for item in findings
    ]


def artifact_findings(findings: list[Any]) -> list[GateFinding]:
    return [
        GateFinding(
            module="artifact_trust",
            rule_id=str(item.check),
            title=str(item.title),
            severity=str(item.severity),
            category=artifact_category(item),
            evidence=str(item.evidence),
            recommendation=str(item.recommendation),
        )
        for item in findings
    ]


def code_category(item: Any) -> str:
    text = " ".join([str(item.rule_id), str(item.title), str(item.category), str(item.scanner)]).lower()
    if (
        "secret" in text
        or "password" in text
        or "passwd" in text
        or "token" in text
        or "credential" in text
        or "key" in text
        or "密钥" in text
        or "凭据" in text
    ):
        return "hardcoded_secret"
    if "sql" in text:
        return "code_injection"
    if "command" in text or "subprocess" in text or "os.system" in text or "命令" in text:
        return "dangerous_code"
    return "code_risk"


def dependency_category(item: Any) -> str:
    text = " ".join([str(item.title), str(item.evidence), str(item.dependency)]).lower()
    if "postinstall" in text or "install script" in text or "安装脚本" in text:
        return "suspicious_postinstall"
    if "malicious" in text or "compromised" in text or "恶意" in text or "污染" in text:
        return "malicious_dependency"
    if "typosquat" in text or "dependency confusion" in text or "混淆" in text:
        return "malicious_dependency"
    return "dependency_risk"


def cicd_category(item: Any) -> str:
    text = " ".join([str(item.rule_id), str(item.title), str(item.reason), str(item.evidence)]).lower()
    if "secret" in text or "token" in text or "凭据" in text:
        return "hardcoded_secret"
    if "curl" in text or "bash" in text or "remote" in text or "远程" in text:
        return "dangerous_cicd_script"
    if "permission" in text or "unpinned" in text or "action" in text or "workflow" in text:
        if normalize_severity(str(item.severity)) in {"critical", "high"}:
            return "untrusted_workflow"
        return "workflow_hardening"
    return "cicd_risk"


def artifact_category(item: Any) -> str:
    text = " ".join([str(item.check), str(item.title), str(item.evidence)]).lower()
    if "signature" in text or "签名" in text:
        return "artifact_signature_missing"
    if "digest" in text or "provenance" in text or "attestation" in text:
        if normalize_severity(str(item.severity)) in {"critical", "high"}:
            return "artifact_provenance_mismatch"
        return "artifact_trust_warning"
    if "workflow" in text:
        return "untrusted_workflow"
    if "builder" in text or "runner" in text:
        return "untrusted_builder"
    return "artifact_trust_risk"


def evaluate_policy(policy: dict[str, Any], findings: list[GateFinding], errors: list[str]) -> dict[str, Any]:
    counts = {severity: 0 for severity in SEVERITIES}
    categories: dict[str, int] = {}
    for finding in findings:
        severity = normalize_severity(finding.severity)
        counts[severity] = counts.get(severity, 0) + 1
        categories[finding.category] = categories.get(finding.category, 0) + 1

    reasons: list[str] = []
    if policy.get("fail_on_critical", True) and counts.get("critical", 0) > 0:
        reasons.append(f"存在 {counts['critical']} 个 critical 风险")
    max_high = int(policy.get("max_high", 0))
    if counts.get("high", 0) > max_high:
        reasons.append(f"high 风险数量 {counts['high']} 超过阈值 {max_high}")
    for category in policy.get("block_on") or []:
        if categories.get(str(category), 0) > 0:
            reasons.append(f"命中阻断类别 {category}: {categories[str(category)]} 个")
    if errors and policy.get("fail_on_scan_error", False):
        reasons.append(f"扫描器执行错误: {len(errors)} 个")

    return {
        "blocked": bool(reasons),
        "reasons": reasons,
        "total": len(findings),
        "critical": counts.get("critical", 0),
        "high": counts.get("high", 0),
        "medium": counts.get("medium", 0),
        "low": counts.get("low", 0),
        "categories": categories,
        "errors": len(errors),
    }


def artifact_policy(policy: dict[str, Any]) -> dict[str, Any]:
    value = policy.get("artifact_trust")
    return value if isinstance(value, dict) else {}


def artifact_request_kwargs(policy: dict[str, Any]) -> dict[str, Any]:
    config = artifact_policy(policy)
    kwargs: dict[str, Any] = {}
    mapping = {
        "expected_repo": "expected_repo",
        "expected_commit": "expected_commit",
        "allowed_branches": "allowed_branches",
        "allowed_workflows": "allowed_workflows",
        "allowed_builders": "allowed_builders",
        "require_signature": "require_signature",
        "require_provenance": "require_provenance",
        "allow_self_hosted_runner": "allow_self_hosted_runner",
        "max_age_hours": "max_age_hours",
        "subject_name": "subject_name",
        "expected_digest": "expected_digest",
    }
    for source, target in mapping.items():
        if source in config:
            kwargs[target] = config[source]
    return kwargs


def truthy(value: Any, *, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() not in {"0", "false", "no", "off"}
    return bool(value)


def normalize_severity(value: str) -> str:
    lowered = str(value or "").strip().lower()
    return lowered if lowered in SEVERITIES else "low"


def render_text_result(result: GateResult) -> str:
    status = "PASSED" if result.passed else "FAILED"
    lines = [
        f"SupplyGuard Gate {status}",
        f"mode: {result.mode}",
        f"target: {result.target}",
        (
            "summary: "
            f"critical={result.summary['critical']} "
            f"high={result.summary['high']} "
            f"medium={result.summary['medium']} "
            f"low={result.summary['low']} "
            f"total={result.summary['total']}"
        ),
    ]
    if result.summary["reasons"]:
        lines.append("阻断原因:")
        lines.extend(f"- {reason}" for reason in result.summary["reasons"])
    if result.errors:
        lines.append("扫描错误:")
        lines.extend(f"- {error}" for error in result.errors)
    if result.findings:
        lines.append("关键发现:")
        for finding in sorted(result.findings, key=lambda item: severity_rank(item.severity))[:20]:
            location = f" ({finding.location})" if finding.location else ""
            lines.append(f"- [{finding.severity}] {finding.title}{location}")
    return "\n".join(lines)


def severity_rank(value: str) -> int:
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    return order.get(normalize_severity(value), 4)


def create_provenance(
    *,
    artifact: str | Path,
    output: str | Path,
    workflow: str = ".github/workflows/release.yml",
    repo: str | None = None,
    commit: str | None = None,
    ref: str | None = None,
    builder: str = "https://github.com/actions/runner/github-hosted",
    runner: str | None = None,
) -> Path:
    artifact_path = Path(artifact).expanduser().resolve()
    if not artifact_path.exists() or not artifact_path.is_file():
        raise ValueError(f"产物不存在: {artifact_path}")
    output_path = Path(output).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    digest = sha256_file(artifact_path)
    now = datetime.now(UTC).isoformat()
    repo_value = repo or os.environ.get("GITHUB_REPOSITORY", "")
    commit_value = commit or os.environ.get("GITHUB_SHA", "")
    ref_value = ref or os.environ.get("GITHUB_REF", "")
    runner_value = runner or os.environ.get("RUNNER_ENVIRONMENT", "github-hosted")
    workflow_ref = os.environ.get("GITHUB_WORKFLOW_REF", workflow)
    run_id = os.environ.get("GITHUB_RUN_ID", "")
    statement = {
        "_type": "https://in-toto.io/Statement/v1",
        "subject": [
            {
                "name": artifact_path.name,
                "digest": {"sha256": digest},
            }
        ],
        "predicateType": "https://slsa.dev/provenance/v1",
        "predicate": {
            "buildDefinition": {
                "buildType": "https://github.com/ActionsWorkflow",
                "externalParameters": {
                    "workflow": {"path": workflow, "ref": ref_value},
                    "workflow_path": workflow,
                    "ref": ref_value,
                    "repository": repo_value,
                },
                "internalParameters": {
                    "github": {
                        "workflow_ref": workflow_ref,
                        "job_workflow_ref": workflow_ref,
                        "ref": ref_value,
                        "commit": commit_value,
                        "runner_environment": runner_value,
                    }
                },
            },
            "runDetails": {
                "builder": {"id": builder},
                "metadata": {"invocationId": run_id},
            },
            "metadata": {
                "buildStartedOn": now,
                "buildFinishedOn": now,
            },
            "materials": [
                {
                    "uri": f"git+https://github.com/{repo_value}" if repo_value else "",
                    "digest": {"sha1": commit_value},
                }
            ],
        },
    }
    output_path.write_text(json.dumps(statement, ensure_ascii=False, indent=2), encoding="utf-8")
    return output_path


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def exit_code_for(result: GateResult) -> int:
    return 0 if result.passed else 1
