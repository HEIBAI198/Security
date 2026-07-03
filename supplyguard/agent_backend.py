"""同步编排型 Agent 后端。

本模块只负责把现有扫描能力按供应链溯源主线串起来，不替代具体扫描器。
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from datetime import UTC, datetime
import json
from pathlib import Path
import time
from typing import Any, Callable
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

from .artifact_trust import ArtifactTrustRequest, ArtifactTrustResult, run_artifact_trust_scan
from .cicd_audit import CICDAuditRequest, CICDAuditResult, run_cicd_audit
from .code_audit import CodeAuditRequest, CodeAuditResult, run_code_audit
from .config import ROOT
from .dependency_audit import DependencyAuditRequest, DependencyAuditResult, run_dependency_audit
from .evidence_discovery import infer_case_evidence_paths, resolve_local_path
from .log_audit import LogAuditResult, LogFileInput, run_log_audit


AGENT_RUN_STORAGE_DIR = ROOT / "storage" / "agent_runs"

AGENT_MODULE_FLAGS: dict[str, tuple[str, str]] = {
    "code_audit": ("include_code_audit", "代码可达性"),
    "dependency_audit": ("include_dependency_audit", "供应链组件"),
    "cicd_audit": ("include_cicd_audit", "CI/CD 构建链"),
    "artifact_trust": ("include_artifact_trust", "产物可信"),
    "log_audit": ("include_log_audit", "日志印证"),
}


class AgentRunRequest(BaseModel):
    """Agent 编排入口参数。"""

    model_config = ConfigDict(populate_by_name=True)

    workspace_id: str | None = Field(default=None, alias="workspaceId")
    import_id: str | None = Field(default=None, alias="importId")
    question: str | None = Field(default=None, alias="question")
    target_path: str | None = Field(default=None, alias="targetPath")
    artifact_path: str | None = Field(default=None, alias="artifactPath")
    attestation_path: str | None = Field(default=None, alias="attestationPath")
    expected_repo: str | None = Field(default=None, alias="expectedRepo")
    expected_commit: str | None = Field(default=None, alias="expectedCommit")
    allowed_workflows: list[str] | None = Field(default=None, alias="allowedWorkflows")
    allowed_builders: list[str] | None = Field(default=None, alias="allowedBuilders")
    allow_self_hosted_runner: bool | None = Field(default=None, alias="allowSelfHostedRunner")
    require_signature: bool | None = Field(default=None, alias="requireSignature")
    log_paths: list[str] = Field(default_factory=list, alias="logPaths")
    include_code_audit: bool = Field(default=True, alias="includeCodeAudit")
    include_dependency_audit: bool = Field(default=True, alias="includeDependencyAudit")
    include_cicd_audit: bool = Field(default=True, alias="includeCicdAudit")
    include_artifact_trust: bool = Field(default=True, alias="includeArtifactTrust")
    include_log_audit: bool = Field(default=True, alias="includeLogAudit")
    timeout_seconds: int = Field(default=180, alias="timeoutSeconds", ge=10, le=600)


@dataclass
class AgentInternalResults:
    code_audit: CodeAuditResult | None = None
    dependency_audit: DependencyAuditResult | None = None
    cicd_audit: CICDAuditResult | None = None
    artifact_trust: ArtifactTrustResult | None = None
    log_audit: LogAuditResult | None = None


@dataclass
class AgentRunBundle:
    payload: dict[str, Any]
    results: AgentInternalResults


AgentProgressCallback = Callable[[dict[str, Any]], None]


def run_agent_backend(
    request: AgentRunRequest,
    run_id: str | None = None,
    progress: AgentProgressCallback | None = None,
) -> AgentRunBundle:
    """执行一次同步 Agent 编排。"""

    started_at = time.monotonic()
    started_at_iso = datetime.now(UTC).isoformat()
    original_request = request
    request, plan = plan_agent_request(request)
    request = apply_inferred_evidence(request)
    run_id = run_id or new_agent_run_id()
    results = AgentInternalResults()
    steps: list[dict[str, Any]] = [
        new_step("code_audit", "代码可达性", "扫描代码、密钥和配置风险"),
        new_step("dependency_audit", "供应链组件", "生成 SBOM/VEX 并识别依赖风险"),
        new_step("cicd_audit", "CI/CD 构建链", "检查 workflow、权限、Action 引用和构建链路"),
        new_step("artifact_trust", "产物可信", "校验 artifact、provenance、commit、workflow 和 builder"),
        new_step("log_audit", "日志印证", "用运行期日志印证可疑行为"),
        new_step("workspace_report", "图谱与报告汇总", "汇总工作台、攻击路径和溯源报告"),
    ]
    step_map = {step["id"]: step for step in steps}
    evidence_gaps: list[dict[str, Any]] = []
    events: list[dict[str, Any]] = []

    target_input = shared_target_input(request)

    def publish(status: str = "running") -> None:
        if progress is None:
            return
        progress(
            build_agent_run_payload(
                run_id=run_id,
                status=status,
                started_at=started_at_iso,
                started_at_monotonic=started_at,
                request=request,
                plan=plan,
                steps=steps,
                events=events,
                evidence_gaps=evidence_gaps,
                results=results,
            )
        )

    def start_step(step_id: str, message: str) -> None:
        step_map[step_id]["status"] = "running"
        append_agent_event(events, step_id, "step_started", message)
        publish("running")

    def finish_step(step_id: str) -> None:
        step = step_map[step_id]
        if step["status"] == "success":
            append_agent_event(events, step_id, "step_succeeded", step_success_message(step))
        elif step["status"] == "skipped":
            append_agent_event(events, step_id, "step_skipped", step.get("error") or "该阶段已跳过。", "warning")
        elif step["status"] == "failed":
            append_agent_event(events, step_id, "step_failed", step.get("error") or "该阶段执行失败。", "error")
        publish("running")

    def observe(step_id: str) -> None:
        nonlocal request
        request = observe_and_replan(request, original_request, plan, results, evidence_gaps, step_id, events)

    def planned_skip_reason(step_id: str, fallback: str) -> str:
        for item in plan.get("skippedModules", []):
            if isinstance(item, dict) and item.get("id") == step_id and item.get("reason"):
                return str(item["reason"])
        return fallback

    append_agent_event(events, "agent", "job_started", "Agent 已创建任务，开始按供应链溯源主线调查。")
    publish("running")

    if request.include_code_audit:
        start_step("code_audit", "正在扫描代码可达性、密钥泄露和配置风险。")
        results.code_audit = run_step(
            step_map["code_audit"],
            lambda: run_code_audit(
                CodeAuditRequest(
                    **target_input,
                    timeout_seconds=request.timeout_seconds,
                ),
                timeout_seconds=request.timeout_seconds,
            ),
            summarize_code_audit,
        )
        finish_step("code_audit")
        observe("code_audit")
    else:
        skip_step(step_map["code_audit"], planned_skip_reason("code_audit", "请求中关闭代码可达性扫描。"))
        finish_step("code_audit")
        observe("code_audit")

    if request.include_dependency_audit:
        start_step("dependency_audit", "正在解析 package-lock、requirements 等清单并生成 SBOM/VEX。")
        results.dependency_audit = run_step(
            step_map["dependency_audit"],
            lambda: run_dependency_audit(
                DependencyAuditRequest(
                    **target_input,
                    include_osv=True,
                    include_cdxgen=False,
                    include_cyclonedx_py=False,
                    mode="auto",
                )
            ),
            summarize_dependency_audit,
        )
        finish_step("dependency_audit")
        observe("dependency_audit")
    else:
        skip_step(step_map["dependency_audit"], planned_skip_reason("dependency_audit", "请求中关闭供应链组件扫描。"))
        finish_step("dependency_audit")
        observe("dependency_audit")

    if request.include_cicd_audit:
        start_step("cicd_audit", "正在分析 workflow、GITHUB_TOKEN 权限、Action 固定版本和 runner 风险。")
        results.cicd_audit = run_step(
            step_map["cicd_audit"],
            lambda: run_cicd_audit(
                CICDAuditRequest(
                    **target_input,
                    include_zizmor=False,
                    include_actionlint=False,
                    timeout_seconds=min(120, max(10, request.timeout_seconds)),
                )
            ),
            summarize_cicd_audit,
        )
        finish_step("cicd_audit")
        observe("cicd_audit")
    else:
        skip_step(step_map["cicd_audit"], planned_skip_reason("cicd_audit", "请求中关闭 CI/CD 构建链扫描。"))
        finish_step("cicd_audit")
        observe("cicd_audit")

    if request.include_artifact_trust:
        artifact_gap = artifact_trust_gap(request)
        if artifact_gap is None:
            start_step("artifact_trust", "正在校验 artifact hash、provenance、commit、workflow、builder 和签名。")
            results.artifact_trust = run_step(
                step_map["artifact_trust"],
                lambda: run_artifact_trust_scan(build_artifact_request(request)),
                summarize_artifact_trust,
            )
            finish_step("artifact_trust")
            observe("artifact_trust")
        else:
            skip_step(step_map["artifact_trust"], artifact_gap["reason"])
            evidence_gaps.append(artifact_gap)
            finish_step("artifact_trust")
            observe("artifact_trust")
    else:
        skip_step(step_map["artifact_trust"], planned_skip_reason("artifact_trust", "请求中关闭产物可信验证。"))
        finish_step("artifact_trust")
        observe("artifact_trust")

    if request.include_log_audit:
        log_gap = log_audit_gap(request)
        if log_gap is None:
            start_step("log_audit", "正在读取构建日志和运行期日志，匹配外联、敏感接口和异常行为。")
            results.log_audit = run_step(
                step_map["log_audit"],
                lambda: run_log_audit(load_log_inputs(request.log_paths)),
                summarize_log_audit,
            )
            finish_step("log_audit")
            observe("log_audit")
        else:
            skip_step(step_map["log_audit"], log_gap["reason"])
            evidence_gaps.append(log_gap)
            finish_step("log_audit")
            observe("log_audit")
    else:
        skip_step(step_map["log_audit"], planned_skip_reason("log_audit", "请求中关闭日志印证。"))
        finish_step("log_audit")
        observe("log_audit")

    start_step("workspace_report", "正在汇总组件、构建链、产物和日志证据，生成攻击路径与溯源报告。")
    finish_workspace_step(step_map["workspace_report"])
    finish_step("workspace_report")
    evidence_gaps.extend(gaps_from_step_failures(steps))
    next_actions = build_agent_next_actions(steps, evidence_gaps, results)
    status = agent_run_status(steps, evidence_gaps, results)
    append_agent_event(events, "agent", "job_finished", "Agent 调查完成，已形成阶段摘要、证据缺口和下一步动作。")
    payload = build_agent_run_payload(
        run_id=run_id,
        status=status,
        started_at=started_at_iso,
        started_at_monotonic=started_at,
        request=request,
        plan=plan,
        steps=steps,
        events=events,
        evidence_gaps=evidence_gaps,
        results=results,
        next_actions=next_actions,
    )
    persist_agent_run(payload)
    publish(status)
    return AgentRunBundle(payload=payload, results=results)


def new_agent_run_id() -> str:
    return f"agent-{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}-{uuid4().hex[:8]}"


def build_agent_run_payload(
    *,
    run_id: str,
    status: str,
    started_at: str,
    started_at_monotonic: float,
    request: AgentRunRequest,
    steps: list[dict[str, Any]],
    events: list[dict[str, Any]],
    evidence_gaps: list[dict[str, Any]],
    results: AgentInternalResults,
    next_actions: list[dict[str, Any]] | None = None,
    workspace: dict[str, Any] | None = None,
    report: str | None = None,
    plan: dict[str, Any] | None = None,
) -> dict[str, Any]:
    actions = next_actions if next_actions is not None else build_agent_next_actions(steps, evidence_gaps, results)
    summary = summarize_agent_run(steps, evidence_gaps, results)
    verdict = build_agent_verdict(steps, evidence_gaps, results, actions, summary)
    payload = {
        "runId": run_id,
        "status": status,
        "startedAt": started_at,
        "durationSeconds": round(time.monotonic() - started_at_monotonic, 2),
        "input": request.model_dump(by_alias=True),
        "plan": deepcopy(plan) if plan is not None else build_default_agent_plan(request),
        "steps": deepcopy(steps),
        "events": deepcopy(events),
        "summary": summary,
        "verdict": verdict,
        "evidenceGaps": deepcopy(evidence_gaps),
        "nextActions": deepcopy(actions),
        "narrative": build_agent_narrative(steps, evidence_gaps, results, verdict),
    }
    if workspace is not None:
        payload["workspace"] = workspace
    if report is not None:
        payload["report"] = report
    return payload


def append_agent_event(
    events: list[dict[str, Any]],
    step_id: str,
    kind: str,
    message: str,
    level: str = "info",
) -> None:
    events.append(
        {
            "id": f"evt-{len(events) + 1:04d}",
            "stepId": step_id,
            "kind": kind,
            "level": level,
            "message": message,
            "createdAt": datetime.now(UTC).isoformat(),
        }
    )


def step_success_message(step: dict[str, Any]) -> str:
    summary = step.get("summary") if isinstance(step.get("summary"), dict) else {}
    if step.get("id") == "dependency_audit":
        return f"依赖解析完成：识别 {summary.get('dependencies', 0)} 个依赖，发现 {summary.get('findings', 0)} 个风险。"
    if step.get("id") == "cicd_audit":
        return f"CI/CD 分析完成：发现 {summary.get('workflows', 0)} 个 workflow、{summary.get('steps', 0)} 个 step、{summary.get('findings', 0)} 项风险。"
    if step.get("id") == "artifact_trust":
        return f"产物可信校验完成：可信评分 {summary.get('trustScore', 0)}/100，发现 {summary.get('findings', 0)} 项异常。"
    if step.get("id") == "log_audit":
        return f"日志印证完成：解析 {summary.get('events', 0)} 条事件，命中 {summary.get('findings', 0)} 个风险。"
    if step.get("id") == "workspace_report":
        return "图谱与报告汇总完成，攻击路径和溯源报告已更新。"
    if step.get("id") == "code_audit":
        return f"代码可达性扫描完成：发现 {summary.get('total', 0)} 项风险。"
    return f"{step.get('name')}完成。"


def new_step(step_id: str, name: str, description: str) -> dict[str, Any]:
    return {
        "id": step_id,
        "name": name,
        "description": description,
        "status": "pending",
        "durationSeconds": 0,
        "input": {},
        "summary": {},
        "error": "",
    }


def run_step(
    step: dict[str, Any],
    action: Callable[[], Any],
    summarize: Callable[[Any], dict[str, Any]],
) -> Any | None:
    started = time.monotonic()
    step["status"] = "running"
    try:
        result = action()
    except Exception as exc:  # noqa: BLE001 - Agent 需要把单步失败收敛成状态。
        step["status"] = "failed"
        step["error"] = str(exc)
        step["durationSeconds"] = round(time.monotonic() - started, 2)
        return None
    step["status"] = "success"
    step["summary"] = summarize(result)
    step["durationSeconds"] = round(time.monotonic() - started, 2)
    return result


def skip_step(step: dict[str, Any], reason: str) -> None:
    step["status"] = "skipped"
    step["error"] = reason
    step["summary"] = {"reason": reason}


def finish_workspace_step(step: dict[str, Any]) -> None:
    step["status"] = "success"
    step["summary"] = {"message": "扫描结果已交给工作台聚合，接口会返回 workspace 和 report。"}


def shared_target_input(request: AgentRunRequest) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    if request.import_id:
        payload["import_id"] = request.import_id
    if request.target_path:
        payload["target_path"] = request.target_path
    return payload


def build_artifact_request(request: AgentRunRequest) -> ArtifactTrustRequest:
    return ArtifactTrustRequest(
        artifact_path=request.artifact_path or "",
        attestation_path=request.attestation_path or "",
        expected_repo=request.expected_repo,
        expected_commit=request.expected_commit,
        allowed_workflows=request.allowed_workflows,
        allowed_builders=request.allowed_builders,
        allow_self_hosted_runner=request.allow_self_hosted_runner,
        require_signature=request.require_signature,
        timeout_seconds=min(120, max(5, request.timeout_seconds)),
    )


def artifact_trust_gap(request: AgentRunRequest) -> dict[str, Any] | None:
    missing: list[str] = []
    if not request.artifact_path:
        missing.append("构建产物 artifact")
    elif not resolve_local_path(request.artifact_path).is_file():
        missing.append(f"构建产物不存在：{request.artifact_path}")
    if not request.attestation_path:
        missing.append("provenance/attestation 文件")
    elif not resolve_local_path(request.attestation_path).is_file():
        missing.append(f"attestation 不存在：{request.attestation_path}")
    if not missing:
        return None
    return {
        "id": "artifact-trust-input-missing",
        "module": "产物可信",
        "severity": "high",
        "question": "我还不能判断发布产物是否被替换，因为缺少 release artifact 或 provenance/attestation。",
        "missingItems": missing,
        "reason": "缺少产物可信验证材料：" + "；".join(missing),
        "whereToFind": ["release artifact", "GitHub Actions artifacts", "SLSA provenance", "cosign/gh attestation"],
        "uploadTo": "产物可信",
        "proves": "证明发布产物是否来自预期仓库、commit、workflow 和 builder，判断产物是否被替换或来源不明。",
        "keywords": compact_keywords([request.expected_repo, request.expected_commit, request.target_path]),
        "examplePaths": artifact_gap_examples(request),
        "actionButtons": [
            {"label": "去产物可信上传", "actionKind": "open_module", "targetModule": "产物可信"},
            {"label": "复制检索关键词", "actionKind": "copy_keywords"},
            {"label": "查看样例文件", "actionKind": "show_examples"},
        ],
    }


def log_audit_gap(request: AgentRunRequest) -> dict[str, Any] | None:
    if not request.log_paths:
        return {
            "id": "runtime-log-input-missing",
            "module": "日志印证",
            "severity": "medium",
            "question": "我还不能确认风险是否真的触发，因为缺少运行期或构建期日志。",
            "missingItems": ["运行期日志", "构建日志或部署日志"],
            "reason": "未提供运行期日志，无法验证构建或依赖风险是否在运行环境触发。",
            "whereToFind": ["Nginx/access log", "应用日志", "K8s pod log", "EDR/WAF", "DNS/VPC Flow Log"],
            "uploadTo": "日志印证",
            "proves": "证明可疑依赖、外联 IP、敏感接口访问或异常登录是否真实发生。",
            "keywords": compact_keywords([request.expected_repo, request.target_path]),
            "examplePaths": log_gap_examples(request),
            "actionButtons": [
                {"label": "去日志印证", "actionKind": "open_module", "targetModule": "日志印证"},
                {"label": "复制检索关键词", "actionKind": "copy_keywords"},
                {"label": "查看样例文件", "actionKind": "show_examples"},
            ],
        }
    missing = [item for item in request.log_paths if not resolve_local_path(item).is_file()]
    if not missing:
        return None
    return {
        "id": "runtime-log-file-missing",
        "module": "日志印证",
        "severity": "medium",
        "question": "我找不到你提供的部分日志文件，需要重新选择或导出这些日志。",
        "missingItems": missing[:6],
        "reason": "部分日志文件不存在：" + "；".join(missing[:4]),
        "whereToFind": ["本地日志目录", "日志平台导出文件", "案例 logs 目录"],
        "uploadTo": "日志印证",
        "proves": "补齐日志后可验证运行期异常是否与供应链风险同源。",
        "keywords": compact_keywords(missing),
        "examplePaths": log_gap_examples(request),
        "actionButtons": [
            {"label": "去日志印证", "actionKind": "open_module", "targetModule": "日志印证"},
            {"label": "复制检索关键词", "actionKind": "copy_keywords"},
            {"label": "查看样例文件", "actionKind": "show_examples"},
        ],
    }


def artifact_gap_examples(request: AgentRunRequest) -> list[str]:
    target = str(request.target_path or "").lower()
    if "3cx" in target:
        return [
            "cases/3cx-supply-chain/artifacts/3cx-desktop-app.tar.gz",
            "cases/3cx-supply-chain/artifacts/3cx-desktop-app.intoto.jsonl",
        ]
    if "solarwinds" in target or "sunburst" in target:
        return [
            "cases/solarwinds-sunburst/artifacts/orion-update.tar.gz",
            "cases/solarwinds-sunburst/artifacts/orion-update.intoto.jsonl",
        ]
    return ["release artifact", "provenance/attestation JSON 或 JSONL"]


def log_gap_examples(request: AgentRunRequest) -> list[str]:
    target = str(request.target_path or "").lower()
    if "3cx" in target:
        return [
            "cases/3cx-supply-chain/logs/build-runner.jsonl",
            "cases/3cx-supply-chain/logs/customer-endpoint.jsonl",
        ]
    if "solarwinds" in target or "sunburst" in target:
        return [
            "cases/solarwinds-sunburst/logs/orion-build-runner.log",
            "cases/solarwinds-sunburst/logs/orion-runtime.jsonl",
        ]
    return ["Nginx/access log", "应用日志", "K8s pod log", "EDR/WAF/DNS 日志"]


def load_log_inputs(log_paths: list[str]) -> list[LogFileInput]:
    inputs: list[LogFileInput] = []
    for raw_path in log_paths:
        path = resolve_local_path(raw_path)
        inputs.append(LogFileInput(filename=path.name, content=path.read_bytes()))
    return inputs


def plan_agent_request(request: AgentRunRequest) -> tuple[AgentRunRequest, dict[str, Any]]:
    question = str(request.question or "").strip()
    if not question:
        return request, build_default_agent_plan(request)

    selected = agent_modules_for_question(question)
    updates: dict[str, object] = {}
    skipped: list[dict[str, str]] = []
    selected_modules: list[dict[str, str]] = []
    for module_id, (flag, name) in AGENT_MODULE_FLAGS.items():
        user_enabled = bool(getattr(request, flag))
        planned_enabled = user_enabled and module_id in selected
        updates[flag] = planned_enabled
        if planned_enabled:
            selected_modules.append({"id": module_id, "name": name})
        else:
            skipped.append(
                {
                    "id": module_id,
                    "name": name,
                    "reason": "请求关闭该模块" if not user_enabled else "问题意图本轮未选择该模块",
                }
            )

    selected_modules.append({"id": "workspace_report", "name": "图谱与报告汇总"})
    planned_request = request.model_copy(update=updates)
    return planned_request, {
        "plannerType": "question-driven-observe-replan-planner",
        "objective": question,
        "selectedModules": selected_modules,
        "skippedModules": skipped,
        "observations": [],
        "replans": [],
        "reason": agent_plan_reason(question, selected),
    }


def build_default_agent_plan(request: AgentRunRequest) -> dict[str, Any]:
    selected = [
        {"id": module_id, "name": name}
        for module_id, (flag, name) in AGENT_MODULE_FLAGS.items()
        if bool(getattr(request, flag))
    ]
    selected.append({"id": "workspace_report", "name": "图谱与报告汇总"})
    skipped = [
        {"id": module_id, "name": name, "reason": "请求关闭该模块"}
        for module_id, (flag, name) in AGENT_MODULE_FLAGS.items()
        if not bool(getattr(request, flag))
    ]
    return {
        "plannerType": "fixed-sequence-observe-replan",
        "objective": request.question or "执行默认供应链溯源调查",
        "selectedModules": selected,
        "skippedModules": skipped,
        "observations": [],
        "replans": [],
        "reason": "未提供具体问题，按默认供应链溯源主线执行。",
    }


def agent_modules_for_question(question: str) -> set[str]:
    text = question.lower()
    all_modules = set(AGENT_MODULE_FLAGS)
    selected: set[str] = set()
    if any(keyword in text for keyword in ["代码", "可达", "密钥", "配置", "source", "code"]):
        selected.add("code_audit")
    if any(keyword in text for keyword in ["依赖", "供应链组件", "sbom", "vex", "包", "dependency", "package"]):
        selected.add("dependency_audit")
    if any(keyword in text for keyword in ["ci/cd", "cicd", "workflow", "runner", "action", "构建", "流水线"]):
        selected.add("cicd_audit")
    if any(keyword in text for keyword in ["产物", "artifact", "provenance", "attestation", "签名", "builder", "发布"]):
        selected.add("artifact_trust")
    if any(keyword in text for keyword in ["日志", "运行期", "外联", "回连", "异常访问", "log", "runtime", "egress"]):
        selected.add("log_audit")

    full_investigation_keywords = [
        "有风险",
        "有危险",
        "危险吗",
        "风险吗",
        "是否危险",
        "是否有风险",
        "攻击路径",
        "影响发布",
        "投毒",
        "溯源",
        "全量",
        "整体",
        "综合",
        "修复优先级",
        "risk",
        "attack path",
    ]
    global_scope_keywords = ["项目", "整体", "综合", "全量", "全局", "攻击路径", "溯源"]
    has_full_intent = any(keyword in text for keyword in full_investigation_keywords)
    has_global_scope = any(keyword in text for keyword in global_scope_keywords)
    if has_full_intent and (not selected or has_global_scope):
        return all_modules
    return selected or all_modules


def agent_plan_reason(question: str, selected: set[str]) -> str:
    if selected == set(AGENT_MODULE_FLAGS):
        return "问题需要整体风险判断，选择依赖、CI/CD、产物可信和日志等关键模块形成证据闭环。"
    names = [name for module_id, (_, name) in AGENT_MODULE_FLAGS.items() if module_id in selected]
    return f"问题聚焦于{'、'.join(names)}，本轮优先调用相关模块。"


def observe_and_replan(
    request: AgentRunRequest,
    original_request: AgentRunRequest,
    plan: dict[str, Any],
    results: AgentInternalResults,
    evidence_gaps: list[dict[str, Any]],
    step_id: str,
    events: list[dict[str, Any]],
) -> AgentRunRequest:
    observation = build_agent_observation(step_id, results, evidence_gaps)
    plan.setdefault("observations", []).append(observation)
    modules_to_enable = modules_to_enable_after_observation(step_id, observation)
    if not modules_to_enable:
        refresh_agent_plan_modules(plan, request)
        return request

    updates: dict[str, object] = {}
    enabled_modules: list[str] = []
    blocked_modules: list[str] = []
    for module_id in modules_to_enable:
        if not module_allowed_by_user(original_request, module_id):
            blocked_modules.append(module_id)
            continue
        flag = AGENT_MODULE_FLAGS[module_id][0]
        if not bool(getattr(request, flag)):
            updates[flag] = True
            enabled_modules.append(module_id)

    if not enabled_modules and not blocked_modules:
        refresh_agent_plan_modules(plan, request)
        return request

    next_request = request.model_copy(update=updates) if updates else request
    replan = {
        "afterStep": step_id,
        "reason": observation["summary"],
        "enabledModules": module_briefs(enabled_modules),
        "blockedModules": module_briefs(blocked_modules),
        "createdAt": datetime.now(UTC).isoformat(),
    }
    plan.setdefault("replans", []).append(replan)
    refresh_agent_plan_modules(plan, next_request)
    if enabled_modules:
        append_agent_event(
            events,
            "planner",
            "planner_replanned",
            "Planner 观察到风险信号，追加后续调查模块：" + "、".join(module_name(item) for item in enabled_modules),
        )
    if blocked_modules:
        append_agent_event(
            events,
            "planner",
            "planner_blocked",
            "Planner 建议追加模块，但请求中已关闭：" + "、".join(module_name(item) for item in blocked_modules),
            "warning",
        )
    return next_request


def build_agent_observation(
    step_id: str,
    results: AgentInternalResults,
    evidence_gaps: list[dict[str, Any]],
) -> dict[str, Any]:
    signals = agent_verdict_signals(results)
    latest_gaps = [gap for gap in evidence_gaps if isinstance(gap, dict)][-3:]
    summary = "未观察到需要扩大调查范围的新信号。"
    if step_id == "dependency_audit" and signals["dependency_findings"] > 0:
        summary = f"供应链组件发现 {signals['dependency_findings']} 个风险，需要验证构建链、产物和运行期影响。"
    elif step_id == "cicd_audit" and signals["cicd_findings"] > 0:
        summary = f"CI/CD 发现 {signals['cicd_findings']} 个风险，需要继续验证产物可信和运行日志。"
    elif step_id == "artifact_trust" and signals["artifact_impacted"]:
        summary = "产物可信存在异常，需要运行期或构建日志继续印证。"
    elif latest_gaps:
        summary = "当前出现证据缺口：" + "；".join(str(gap.get("reason") or gap.get("module")) for gap in latest_gaps)
    return {
        "afterStep": step_id,
        "summary": summary,
        "signals": signals,
        "evidenceGapCount": len(evidence_gaps),
        "createdAt": datetime.now(UTC).isoformat(),
    }


def modules_to_enable_after_observation(step_id: str, observation: dict[str, Any]) -> set[str]:
    signals = observation.get("signals") if isinstance(observation.get("signals"), dict) else {}
    if step_id == "dependency_audit" and int(signals.get("dependency_findings") or 0) > 0:
        return {"cicd_audit", "artifact_trust", "log_audit"}
    if step_id == "cicd_audit" and int(signals.get("cicd_findings") or 0) > 0:
        return {"artifact_trust", "log_audit"}
    if step_id == "artifact_trust" and bool(signals.get("artifact_impacted")):
        return {"log_audit"}
    if step_id == "code_audit" and int(signals.get("code_findings") or 0) > 0:
        return {"dependency_audit", "cicd_audit", "log_audit"}
    return set()


def module_allowed_by_user(original_request: AgentRunRequest, module_id: str) -> bool:
    flag = AGENT_MODULE_FLAGS.get(module_id, ("", ""))[0]
    return bool(flag and getattr(original_request, flag))


def refresh_agent_plan_modules(plan: dict[str, Any], request: AgentRunRequest) -> None:
    selected: list[dict[str, str]] = []
    skipped: list[dict[str, str]] = []
    for module_id, (flag, name) in AGENT_MODULE_FLAGS.items():
        if bool(getattr(request, flag)):
            selected.append({"id": module_id, "name": name})
        else:
            skipped.append({"id": module_id, "name": name, "reason": "当前计划未选择该模块"})
    selected.append({"id": "workspace_report", "name": "图谱与报告汇总"})
    plan["selectedModules"] = selected
    plan["skippedModules"] = skipped


def module_briefs(module_ids: list[str]) -> list[dict[str, str]]:
    return [{"id": module_id, "name": module_name(module_id)} for module_id in module_ids]


def module_name(module_id: str) -> str:
    return AGENT_MODULE_FLAGS.get(module_id, ("", module_id))[1]


def apply_inferred_evidence(request: AgentRunRequest) -> AgentRunRequest:
    inferred = infer_case_evidence_paths(request.target_path)
    updates: dict[str, object] = {}
    if not request.artifact_path and isinstance(inferred.get("artifact_path"), str):
        updates["artifact_path"] = inferred["artifact_path"]
    if not request.attestation_path and isinstance(inferred.get("attestation_path"), str):
        updates["attestation_path"] = inferred["attestation_path"]
    if not request.log_paths and isinstance(inferred.get("log_paths"), list):
        updates["log_paths"] = inferred["log_paths"]
    if not updates:
        return request
    return request.model_copy(update=updates)


def summarize_code_audit(result: CodeAuditResult) -> dict[str, Any]:
    return {
        "scanId": result.scan_id,
        "target": result.target,
        "total": result.summary.get("total", 0),
        "critical": result.summary.get("critical", 0),
        "high": result.summary.get("high", 0),
        "riskScore": result.summary.get("risk_score", 0),
    }


def summarize_dependency_audit(result: DependencyAuditResult) -> dict[str, Any]:
    return {
        "scanId": result.scan_id,
        "target": result.target,
        "dependencies": result.summary.get("total_dependencies", 0),
        "findings": result.summary.get("finding_count", 0),
        "riskScore": result.summary.get("risk_score", 0),
        "riskLevel": result.summary.get("risk_level", "low"),
    }


def summarize_cicd_audit(result: CICDAuditResult) -> dict[str, Any]:
    return {
        "scanId": result.scan_id,
        "target": result.target,
        "workflows": result.summary.get("workflow_count", 0),
        "steps": result.summary.get("total_steps", 0),
        "findings": result.summary.get("finding_count", 0),
        "riskScore": result.summary.get("risk_score", 0),
        "riskLevel": result.summary.get("risk_level", "low"),
    }


def summarize_artifact_trust(result: ArtifactTrustResult) -> dict[str, Any]:
    return {
        "scanId": result.scan_id,
        "artifact": result.artifact,
        "digest": result.digest,
        "trustScore": result.trust_score,
        "level": result.level,
        "checks": result.summary.get("check_count", 0),
        "findings": result.summary.get("finding_count", 0),
    }


def summarize_log_audit(result: LogAuditResult) -> dict[str, Any]:
    return {
        "scanId": result.scan_id,
        "files": len(result.files),
        "events": result.summary.get("total_events", 0),
        "findings": result.summary.get("finding_count", 0),
        "riskScore": result.summary.get("risk_score", 0),
        "riskLevel": result.summary.get("risk_level", "low"),
    }


def gaps_from_step_failures(steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    gaps: list[dict[str, Any]] = []
    for step in steps:
        if step.get("status") != "failed":
            continue
        gaps.append(
            {
                "id": f"{step.get('id')}-failed",
                "module": step.get("name"),
                "severity": "medium",
                "question": f"{step.get('name')}没有执行成功，需要先修复该阶段输入或运行环境。",
                "missingItems": ["可用输入路径", "扫描工具运行环境", "后端错误日志"],
                "reason": f"{step.get('name')} 执行失败：{step.get('error')}",
                "whereToFind": ["检查输入路径", "检查依赖工具", "查看后端日志"],
                "uploadTo": step.get("name"),
                "proves": "修复失败项后才能补齐该模块证据。",
                "keywords": compact_keywords([step.get("id"), step.get("error")]),
                "examplePaths": [],
                "actionButtons": [
                    {"label": "复制检索关键词", "actionKind": "copy_keywords"},
                    {"label": "查看对应模块", "actionKind": "open_module", "targetModule": step.get("name")},
                ],
            }
        )
    return gaps


def build_agent_next_actions(
    steps: list[dict[str, Any]],
    evidence_gaps: list[dict[str, Any]],
    results: AgentInternalResults,
) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    for gap in evidence_gaps:
        actions.append(
            {
                "priority": "high" if gap.get("severity") == "high" else "medium",
                "title": f"补充{gap.get('module')}证据",
                "action": gap.get("reason"),
                "targetModule": gap.get("uploadTo"),
                "keywords": gap.get("keywords", []),
                "actionKind": "open_evidence_gap",
                "payload": {"gapId": gap.get("id")},
            }
        )
    if results.artifact_trust is not None and results.artifact_trust.trust_score < 70:
        actions.append(
            {
                "priority": "high",
                "title": "阻断低可信产物发布",
                "action": "重新生成 artifact 和 provenance，核对 digest、仓库、commit、workflow、builder 与 runner 策略。",
                "targetModule": "产物可信",
                "keywords": compact_keywords([results.artifact_trust.artifact, results.artifact_trust.digest]),
                "actionKind": "rerun_artifact_trust",
                "payload": {
                    "artifact": results.artifact_trust.artifact,
                    "digest": results.artifact_trust.digest,
                },
            }
        )
    if results.dependency_audit is not None and int(results.dependency_audit.summary.get("finding_count") or 0) > 0:
        actions.append(
            {
                "priority": "medium",
                "title": "复核高风险依赖",
                "action": "优先确认高风险依赖是否被代码 import、是否进入构建产物、是否在运行日志中出现。",
                "targetModule": "供应链组件",
                "keywords": compact_keywords([finding.dependency for finding in results.dependency_audit.findings[:5]]),
                "actionKind": "review_high_risk_dependencies",
                "payload": {"findingCount": results.dependency_audit.summary.get("finding_count", 0)},
            }
        )
    if results.log_audit is not None and int(results.log_audit.summary.get("finding_count") or 0) > 0:
        actions.append(
            {
                "priority": "medium",
                "title": "复核日志异常",
                "action": "核对异常外联、敏感接口访问或认证异常的源主机、进程、时间窗和目标地址，并与发布记录对齐。",
                "targetModule": "日志印证",
                "keywords": compact_keywords([finding.signal for finding in results.log_audit.findings[:5]]),
                "actionKind": "scan_logs",
                "payload": {"findingCount": results.log_audit.summary.get("finding_count", 0)},
            }
        )
    actions.append(
        {
            "priority": "medium",
            "title": "生成答辩讲解",
            "action": "把当前调查结论整理成案例背景、检测流程、关键证据、攻击路径和处置建议。",
            "targetModule": "智能研判",
            "keywords": [],
            "actionKind": "generate_defense_brief",
            "payload": {},
        }
    )
    actions.append(
        {
            "priority": "low",
            "title": "导出证据包",
            "action": "导出本次 Agent 任务、workspace、溯源报告、证据缺口和调查叙事，便于复现和答辩。",
            "targetModule": "溯源报告",
            "keywords": [],
            "actionKind": "export_evidence_package",
            "payload": {},
        }
    )
    if not actions:
        actions.append(
            {
                "priority": "low",
                "title": "生成溯源报告",
                "action": "当前 Agent 流程已完成，可查看攻击路径图谱和溯源报告。",
                "targetModule": "溯源报告",
                "keywords": [],
                "actionKind": "generate_defense_brief",
                "payload": {},
            }
        )
    return actions[:8]


def agent_run_status(
    steps: list[dict[str, Any]],
    evidence_gaps: list[dict[str, Any]],
    results: AgentInternalResults,
) -> str:
    """把任务状态表达成业务语义，而不只是步骤是否执行结束。"""

    if any(step.get("status") == "failed" for step in steps):
        return "failed"
    if evidence_gaps:
        return "needs_input"
    if any(step.get("status") == "skipped" and not is_planner_scope_skip(step) for step in steps):
        return "partial"
    summary = summarize_agent_run(steps, evidence_gaps, results)
    if int(summary.get("riskScore") or 0) >= 55 or agent_risk_signal_count(results) > 0:
        return "completed_with_risk"
    return "success"


def is_planner_scope_skip(step: dict[str, Any]) -> bool:
    reason = str(step.get("error") or step.get("summary", {}).get("reason") or "")
    return "问题意图" in reason or "当前计划未选择" in reason


def agent_risk_signal_count(results: AgentInternalResults) -> int:
    signals = 0
    signals += int((results.code_audit.summary if results.code_audit else {}).get("total") or 0)
    signals += int((results.dependency_audit.summary if results.dependency_audit else {}).get("finding_count") or 0)
    signals += int((results.cicd_audit.summary if results.cicd_audit else {}).get("finding_count") or 0)
    signals += int((results.artifact_trust.summary if results.artifact_trust else {}).get("finding_count") or 0)
    signals += int((results.log_audit.summary if results.log_audit else {}).get("finding_count") or 0)
    return signals


def build_agent_verdict(
    steps: list[dict[str, Any]],
    evidence_gaps: list[dict[str, Any]],
    results: AgentInternalResults,
    actions: list[dict[str, Any]],
    summary: dict[str, Any],
) -> dict[str, Any]:
    """生成前后端共用的唯一 Agent 研判结论。"""

    signals = agent_verdict_signals(results)
    failed_steps = [str(step.get("name") or step.get("id")) for step in steps if step.get("status") == "failed"]
    skipped_steps = [
        str(step.get("name") or step.get("id"))
        for step in steps
        if step.get("status") == "skipped" and step.get("id") != "workspace_report"
    ]
    supported_claims = supported_agent_claims(signals)
    unsupported_claims = unsupported_agent_claims(signals, evidence_gaps, failed_steps, skipped_steps)
    gap_texts = [str(gap.get("reason") or gap.get("question") or gap.get("module")) for gap in evidence_gaps[:6]]
    chain_closed = (
        signals["dependency_findings"] > 0
        and signals["cicd_findings"] > 0
        and signals["artifact_impacted"]
        and signals["log_findings"] > 0
        and not evidence_gaps
        and not failed_steps
    )
    risk_score = int(summary.get("riskScore") or 0)
    risk_signal_count = agent_risk_signal_count(results)

    if chain_closed and risk_score >= 80:
        level = "confirmed_attack"
        label = "已确认供应链攻击路径"
        conclusion = "依赖、构建链、产物可信和运行日志四类证据已形成闭环，应按真实供应链攻击路径处置。"
    elif risk_signal_count > 0:
        level = "suspected_risk"
        label = "疑似供应链风险"
        conclusion = "已发现供应链风险信号，但证据链尚未完全闭环，不能直接宣称攻击已经成立。"
    elif evidence_gaps or failed_steps or skipped_steps:
        level = "insufficient_evidence"
        label = "证据不足"
        conclusion = "当前材料不足以判断项目是否存在真实供应链攻击，需要先补齐关键证据或修复失败步骤。"
    else:
        level = "clean"
        label = "暂未发现明确风险"
        conclusion = "本轮已执行模块暂未发现明确供应链攻击证据，仍建议保留产物和日志证明用于复核。"

    return {
        "level": level,
        "label": label,
        "riskScore": risk_score,
        "riskLevel": summary.get("riskLevel") or risk_level(risk_score),
        "confidence": verdict_confidence(level, signals, evidence_gaps, failed_steps, skipped_steps),
        "conclusion": conclusion,
        "supportedClaims": supported_claims,
        "unsupportedClaims": unsupported_claims,
        "evidenceGaps": gap_texts,
        "nextActions": [
            f"{item.get('title')}：{item.get('action')}"
            for item in actions
            if item.get("actionKind") not in {"export_evidence_package", "generate_defense_brief"}
        ][:5],
    }


def agent_verdict_signals(results: AgentInternalResults) -> dict[str, Any]:
    artifact_summary = results.artifact_trust.summary if results.artifact_trust else {}
    artifact_score = int(
        artifact_summary.get("trust_score")
        or artifact_summary.get("trustScore")
        or getattr(results.artifact_trust, "trust_score", 0)
        or 0
    )
    artifact_findings = int(artifact_summary.get("finding_count") or 0)
    return {
        "code_findings": int((results.code_audit.summary if results.code_audit else {}).get("total") or 0),
        "dependency_findings": int((results.dependency_audit.summary if results.dependency_audit else {}).get("finding_count") or 0),
        "dependency_count": int((results.dependency_audit.summary if results.dependency_audit else {}).get("total_dependencies") or 0),
        "cicd_findings": int((results.cicd_audit.summary if results.cicd_audit else {}).get("finding_count") or 0),
        "artifact_evaluated": results.artifact_trust is not None,
        "artifact_trust_score": artifact_score,
        "artifact_findings": artifact_findings,
        "artifact_impacted": results.artifact_trust is not None and (artifact_findings > 0 or (0 < artifact_score < 70)),
        "log_evaluated": results.log_audit is not None,
        "log_findings": int((results.log_audit.summary if results.log_audit else {}).get("finding_count") or 0),
    }


def supported_agent_claims(signals: dict[str, Any]) -> list[str]:
    claims: list[str] = []
    if signals["dependency_findings"] > 0:
        claims.append(f"供应链组件存在 {signals['dependency_findings']} 个风险信号。")
    if signals["cicd_findings"] > 0:
        claims.append(f"CI/CD 构建链存在 {signals['cicd_findings']} 个风险信号。")
    if signals["artifact_impacted"]:
        claims.append(
            f"产物可信存在异常，可信评分 {signals['artifact_trust_score']}/100，异常项 {signals['artifact_findings']} 个。"
        )
    if signals["log_findings"] > 0:
        claims.append(f"运行或构建日志命中 {signals['log_findings']} 个异常行为。")
    if not claims:
        claims.append("当前已执行模块未提供明确攻击证据。")
    return claims


def unsupported_agent_claims(
    signals: dict[str, Any],
    evidence_gaps: list[dict[str, Any]],
    failed_steps: list[str],
    skipped_steps: list[str],
) -> list[str]:
    claims: list[str] = []
    if signals["dependency_findings"] <= 0:
        claims.append("尚未证明存在高风险依赖或依赖投毒入口。")
    if signals["cicd_findings"] <= 0:
        claims.append("尚未证明风险进入 CI/CD workflow、runner 或发布链路。")
    if not signals["artifact_impacted"]:
        claims.append("尚未证明发布产物已经被替换、污染或来源异常。")
    if signals["log_findings"] <= 0:
        claims.append("尚未获得运行期异常日志来证明风险真实触发。")
    if evidence_gaps:
        claims.append("存在证据缺口，当前不能把所有风险信号宣称为已闭环攻击。")
    if failed_steps:
        claims.append("存在失败步骤：" + "、".join(failed_steps[:4]) + "。")
    if skipped_steps:
        claims.append("存在跳过步骤：" + "、".join(skipped_steps[:4]) + "。")
    return claims[:8]


def verdict_confidence(
    level: str,
    signals: dict[str, Any],
    evidence_gaps: list[dict[str, Any]],
    failed_steps: list[str],
    skipped_steps: list[str],
) -> int:
    if level == "clean":
        return 82 if not evidence_gaps and not failed_steps and not skipped_steps else 45
    score = 20
    if signals["dependency_findings"] > 0:
        score += 15
    if signals["cicd_findings"] > 0:
        score += 15
    if signals["artifact_impacted"]:
        score += 25
    if signals["log_findings"] > 0:
        score += 20
    score -= min(24, len(evidence_gaps) * 8)
    score -= min(20, len(failed_steps) * 10)
    score -= min(12, len(skipped_steps) * 4)
    if level == "confirmed_attack":
        return max(80, min(95, score))
    if level == "insufficient_evidence":
        return max(10, min(55, score))
    return max(35, min(78, score))


def build_agent_narrative(
    steps: list[dict[str, Any]],
    evidence_gaps: list[dict[str, Any]],
    results: AgentInternalResults,
    verdict: dict[str, Any],
) -> dict[str, Any]:
    dep_findings = int((results.dependency_audit.summary if results.dependency_audit else {}).get("finding_count") or 0)
    dep_count = int((results.dependency_audit.summary if results.dependency_audit else {}).get("total_dependencies") or 0)
    cicd_findings = int((results.cicd_audit.summary if results.cicd_audit else {}).get("finding_count") or 0)
    artifact_score = int((results.artifact_trust.summary if results.artifact_trust else {}).get("trust_score") or 0)
    artifact_findings = int((results.artifact_trust.summary if results.artifact_trust else {}).get("finding_count") or 0)
    log_findings = int((results.log_audit.summary if results.log_audit else {}).get("finding_count") or 0)
    risk_score = int(summarize_agent_run(steps, evidence_gaps, results).get("riskScore") or 0)
    confidence = narrative_confidence(dep_findings, cicd_findings, artifact_score, artifact_findings, log_findings, evidence_gaps)

    timeline = [
        dependency_narrative(dep_count, dep_findings),
        cicd_narrative(cicd_findings),
        artifact_narrative(results.artifact_trust is not None, artifact_score, artifact_findings),
        log_narrative(results.log_audit is not None, log_findings),
        path_narrative(confidence, evidence_gaps),
    ]
    key_evidence = [item for item in timeline if "待补证" not in item]
    verdict_label = str(verdict.get("label") or narrative_verdict(confidence, risk_score, evidence_gaps))
    summary = f"{verdict_label}：{' → '.join(timeline)}"
    gap_summary = "；".join(str(gap.get("reason")) for gap in evidence_gaps[:3]) or "当前未发现阻断调查的核心证据缺口。"
    defense_brief = (
        "【案例背景】本次 Agent 围绕软件供应链攻击检测与溯源展开，重点核查依赖、构建链、产物可信和运行期证据。\n\n"
        f"【检测流程】系统按顺序完成依赖异常、CI/CD 构建风险、产物可信异常、日志印证和攻击路径生成。综合风险评分为 {risk_score}/100。\n\n"
        f"【关键证据】{'；'.join(key_evidence[:4]) or '当前关键证据仍需补充。'}\n\n"
        f"【攻击路径】{summary}\n\n"
        f"【处置建议】{gap_summary} 建议先补齐高优先级证据，再阻断低可信产物发布、复核高风险依赖并导出证据包。"
    )
    return {
        "summary": summary,
        "timeline": timeline,
        "verdict": verdict_label,
        "confidence": int(verdict.get("confidence") or confidence),
        "keyEvidence": key_evidence[:6],
        "defenseBrief": defense_brief,
    }


def dependency_narrative(dep_count: int, finding_count: int) -> str:
    if finding_count > 0:
        return f"解析 {dep_count} 个依赖并发现 {finding_count} 个供应链风险"
    if dep_count > 0:
        return f"解析 {dep_count} 个依赖，暂未发现高风险依赖"
    return "依赖证据待补证"


def cicd_narrative(finding_count: int) -> str:
    if finding_count > 0:
        return f"CI/CD 检出 {finding_count} 项构建链风险"
    return "CI/CD 构建链暂未发现高危配置"


def artifact_narrative(has_result: bool, trust_score: int, finding_count: int) -> str:
    if not has_result:
        return "产物可信待补证"
    if trust_score < 70 or finding_count > 0:
        return f"产物可信校验异常，可信评分 {trust_score}/100"
    return f"产物可信校验通过，可信评分 {trust_score}/100"


def log_narrative(has_result: bool, finding_count: int) -> str:
    if not has_result:
        return "运行期日志待补证"
    if finding_count > 0:
        return f"运行日志命中 {finding_count} 个异常行为"
    return "运行日志暂未发现异常印证"


def path_narrative(confidence: int, evidence_gaps: list[dict[str, Any]]) -> str:
    if evidence_gaps:
        return f"形成待补证攻击路径，当前可信度约 {confidence}%"
    return f"形成可解释攻击路径，当前可信度约 {confidence}%"


def narrative_confidence(
    dep_findings: int,
    cicd_findings: int,
    artifact_score: int,
    artifact_findings: int,
    log_findings: int,
    evidence_gaps: list[dict[str, Any]],
) -> int:
    score = 35
    if dep_findings > 0:
        score += 15
    if cicd_findings > 0:
        score += 15
    if artifact_score and artifact_score < 70:
        score += 15
    if artifact_findings > 0:
        score += 10
    if log_findings > 0:
        score += 15
    score -= min(20, len(evidence_gaps) * 8)
    return max(0, min(95, score))


def narrative_verdict(confidence: int, risk_score: int, evidence_gaps: list[dict[str, Any]]) -> str:
    if confidence >= 80 and risk_score >= 80 and not evidence_gaps:
        return "高可信供应链攻击路径"
    if confidence >= 70:
        return "较高可信供应链攻击路径"
    if evidence_gaps:
        return "待补证供应链攻击路径"
    return "可疑供应链风险路径"


def summarize_agent_run(
    steps: list[dict[str, Any]],
    evidence_gaps: list[dict[str, Any]],
    results: AgentInternalResults,
) -> dict[str, Any]:
    success_count = sum(1 for step in steps if step["status"] == "success")
    skipped_count = sum(1 for step in steps if step["status"] == "skipped")
    failed_count = sum(1 for step in steps if step["status"] == "failed")
    risk_score = max(
        int((results.code_audit.summary if results.code_audit else {}).get("risk_score") or 0),
        int((results.dependency_audit.summary if results.dependency_audit else {}).get("risk_score") or 0),
        int((results.cicd_audit.summary if results.cicd_audit else {}).get("risk_score") or 0),
        int((results.artifact_trust.summary if results.artifact_trust else {}).get("risk_score") or 0),
        int((results.log_audit.summary if results.log_audit else {}).get("risk_score") or 0),
    )
    return {
        "stepCount": len(steps),
        "success": success_count,
        "skipped": skipped_count,
        "failed": failed_count,
        "evidenceGapCount": len(evidence_gaps),
        "riskScore": risk_score,
        "riskLevel": risk_level(risk_score),
    }


def risk_level(score: int) -> str:
    if score >= 90:
        return "critical"
    if score >= 75:
        return "high"
    if score >= 55:
        return "medium"
    return "low"


def compact_keywords(values: list[Any]) -> list[str]:
    keywords: list[str] = []
    for value in values:
        if value is None:
            continue
        if isinstance(value, (list, tuple, set)):
            keywords.extend(compact_keywords(list(value)))
            continue
        text = str(value).strip()
        if text and text not in keywords:
            keywords.append(text[:160])
    return keywords[:12]


def persist_agent_run(payload: dict[str, Any]) -> None:
    AGENT_RUN_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    path = AGENT_RUN_STORAGE_DIR / f"{payload['runId']}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
