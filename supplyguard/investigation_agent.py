"""规则版安全调查 Agent。

这个模块不调用大模型，只根据工作空间、扫描输入和已有结果生成可持久化的调查状态，
并为前端或对话接口提供“为什么待补充、下一步做什么”的确定性回答。
"""

from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
from typing import Any


MODULES: list[dict[str, str]] = [
    {"id": "code_audit", "name": "代码审查", "target": "code"},
    {"id": "dependency_audit", "name": "供应链", "target": "supply"},
    {"id": "cicd_audit", "name": "CI/CD 链路", "target": "pipeline"},
    {"id": "artifact_trust", "name": "产物可信", "target": "artifact"},
    {"id": "log_audit", "name": "日志印证", "target": "logs"},
    {"id": "multimodal_audit", "name": "多模态证据", "target": "multimodal"},
    {"id": "workspace_report", "name": "图谱与报告", "target": "report"},
]


def build_investigation_state(
    workspace: dict[str, Any],
    *,
    scan_request: Any | None = None,
    errors: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    """根据当前工作空间生成规则版调查状态。"""

    request = request_to_dict(scan_request)
    errors = errors or []
    error_map = {str(item.get("module") or ""): str(item.get("message") or "") for item in errors}
    modules = [module_state(item, workspace, request, error_map) for item in MODULES]
    evidence_gaps = build_evidence_gaps(workspace, request, modules)
    next_actions = build_next_actions(modules, evidence_gaps, workspace)
    status = investigation_status(modules, evidence_gaps, errors)
    summary = build_summary(modules, evidence_gaps, next_actions, workspace)
    return {
        "agentType": "rule-based-security-investigation",
        "status": status,
        "updatedAt": datetime.now(UTC).isoformat(),
        "goal": "判断项目供应链、构建链、产物可信和运行期证据是否形成风险闭环。",
        "modules": modules,
        "evidenceGaps": evidence_gaps,
        "nextActions": next_actions,
        "summary": summary,
        "questions": build_followup_questions(evidence_gaps, next_actions),
        "lastScan": {
            "status": (workspace.get("scanSuite") or {}).get("status"),
            "errors": deepcopy(errors),
        },
    }


def request_to_dict(scan_request: Any | None) -> dict[str, Any]:
    if scan_request is None:
        return {}
    if isinstance(scan_request, dict):
        return deepcopy(scan_request)
    if hasattr(scan_request, "model_dump"):
        return scan_request.model_dump(by_alias=True)
    return {}


def module_state(
    module: dict[str, str],
    workspace: dict[str, Any],
    request: dict[str, Any],
    error_map: dict[str, str],
) -> dict[str, Any]:
    module_id = module["id"]
    if module_id in error_map:
        return {
            **module,
            "status": "failed",
            "statusLabel": "失败",
            "reason": error_map[module_id],
            "signals": 0,
        }
    if module_id == "code_audit":
        return result_module(module, workspace.get("code_audit"), "includeCodeAudit", request)
    if module_id == "dependency_audit":
        return result_module(module, workspace.get("dependency_audit"), "includeDependencyAudit", request)
    if module_id == "cicd_audit":
        return result_module(module, workspace.get("cicd_audit"), "includeCicdAudit", request)
    if module_id == "artifact_trust":
        return artifact_module(module, workspace, request)
    if module_id == "log_audit":
        return log_module(module, workspace, request)
    if module_id == "multimodal_audit":
        return multimodal_module(module, workspace)
    if module_id == "workspace_report":
        return report_module(module, workspace)
    return {**module, "status": "pending", "statusLabel": "待执行", "reason": "等待调查编排。", "signals": 0}


def result_module(module: dict[str, str], result: Any, include_key: str, request: dict[str, Any]) -> dict[str, Any]:
    if request.get(include_key) is False:
        return {**module, "status": "skipped", "statusLabel": "跳过", "reason": "本次调查请求关闭了该模块。", "signals": 0}
    payload = result if isinstance(result, dict) else {}
    if payload.get("scan_id"):
        summary = payload.get("summary") if isinstance(payload.get("summary"), dict) else {}
        return {
            **module,
            "status": "completed",
            "statusLabel": "完成",
            "reason": "该模块已经完成扫描并写入工作空间。",
            "signals": int(summary.get("finding_count") or summary.get("total") or 0),
        }
    return {**module, "status": "pending", "statusLabel": "待执行", "reason": "尚未执行该模块扫描。", "signals": 0}


def artifact_module(module: dict[str, str], workspace: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
    if request.get("includeArtifactTrust") is False:
        return {**module, "status": "skipped", "statusLabel": "跳过", "reason": "本次调查请求关闭了产物可信验证。", "signals": 0}
    payload = workspace.get("artifact_trust") if isinstance(workspace.get("artifact_trust"), dict) else {}
    if payload.get("scan_id"):
        summary = payload.get("summary") if isinstance(payload.get("summary"), dict) else {}
        return {
            **module,
            "status": "completed",
            "statusLabel": "完成",
            "reason": "已验证 artifact、provenance/attestation 和可信策略。",
            "signals": int(summary.get("finding_count") or summary.get("check_count") or 0),
        }
    missing = []
    if not request.get("artifactPath") and not request.get("artifact_path"):
        missing.append("构建产物 artifact")
    if not request.get("attestationPath") and not request.get("attestation_path"):
        missing.append("provenance/attestation 文件")
    if missing:
        return {
            **module,
            "status": "needs_input",
            "statusLabel": "待补",
            "reason": "缺少" + "、".join(missing) + "，无法判断发布产物是否来自预期构建链。",
            "signals": 0,
        }
    return {**module, "status": "pending", "statusLabel": "待执行", "reason": "材料已配置，等待执行产物可信验证。", "signals": 0}


def log_module(module: dict[str, str], workspace: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
    if request.get("includeLogAudit") is False:
        return {**module, "status": "skipped", "statusLabel": "跳过", "reason": "本次调查请求关闭了日志印证。", "signals": 0}
    payload = workspace.get("log_audit") if isinstance(workspace.get("log_audit"), dict) else {}
    if payload.get("scan_id"):
        summary = payload.get("summary") if isinstance(payload.get("summary"), dict) else {}
        return {
            **module,
            "status": "completed",
            "statusLabel": "完成",
            "reason": "已用构建或运行日志印证风险是否触发。",
            "signals": int(summary.get("finding_count") or summary.get("total_events") or 0),
        }
    if not request.get("logPaths") and not request.get("log_paths"):
        return {
            **module,
            "status": "needs_input",
            "statusLabel": "待补",
            "reason": "缺少构建日志或运行期日志，无法确认风险是否真实触发。",
            "signals": 0,
        }
    return {**module, "status": "pending", "statusLabel": "待执行", "reason": "日志路径已配置，等待执行日志印证。", "signals": 0}


def multimodal_module(module: dict[str, str], workspace: dict[str, Any]) -> dict[str, Any]:
    payload = workspace.get("multimodal_audit") if isinstance(workspace.get("multimodal_audit"), dict) else {}
    summary = payload.get("summary") if isinstance(payload.get("summary"), dict) else {}
    evidence_count = int(summary.get("evidence_count") or 0)
    if evidence_count > 0:
        return {
            **module,
            "status": "completed",
            "statusLabel": "完成",
            "reason": "已接入截图、音频、视频或人工文本证据。",
            "signals": evidence_count,
        }
    return {
        **module,
        "status": "needs_input",
        "statusLabel": "待补",
        "reason": "缺少外部告警截图、录屏、语音或人工证据，当前只能依赖静态扫描和日志。",
        "signals": 0,
    }


def report_module(module: dict[str, str], workspace: dict[str, Any]) -> dict[str, Any]:
    report_ready = bool(workspace.get("report"))
    graph = workspace.get("graph") if isinstance(workspace.get("graph"), dict) else {}
    attack_paths = graph.get("attack_paths") if isinstance(graph.get("attack_paths"), list) else workspace.get("attack_paths")
    path_count = len(attack_paths) if isinstance(attack_paths, list) else int((workspace.get("summary") or {}).get("attack_paths") or 0)
    if report_ready:
        return {
            **module,
            "status": "completed",
            "statusLabel": "完成",
            "reason": "已生成工作空间报告和图谱摘要。",
            "signals": path_count,
        }
    return {**module, "status": "pending", "statusLabel": "待执行", "reason": "等待聚合扫描结果后生成图谱与报告。", "signals": path_count}


def build_evidence_gaps(
    workspace: dict[str, Any],
    request: dict[str, Any],
    modules: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    gaps: list[dict[str, Any]] = []
    status_map = {item["id"]: item for item in modules}
    artifact = status_map.get("artifact_trust", {})
    if artifact.get("status") == "needs_input":
        missing_items = []
        if not request.get("artifactPath") and not request.get("artifact_path"):
            missing_items.append("构建产物 artifact")
        if not request.get("attestationPath") and not request.get("attestation_path"):
            missing_items.append("provenance/attestation 文件")
        gaps.append(
            evidence_gap(
                gap_id="artifact-trust-materials",
                module="产物可信",
                severity="high",
                reason=artifact.get("reason") or "缺少产物可信材料。",
                missing_items=missing_items,
                target_module="artifact",
                proves="证明发布产物来自预期仓库、commit、workflow 和 builder，排除产物替换或来源不明。",
            )
        )
    logs = status_map.get("log_audit", {})
    if logs.get("status") == "needs_input":
        gaps.append(
            evidence_gap(
                gap_id="runtime-log-materials",
                module="日志印证",
                severity="medium",
                reason=logs.get("reason") or "缺少日志材料。",
                missing_items=["构建日志", "运行期日志", "部署日志"],
                target_module="logs",
                proves="确认依赖、构建或产物风险是否在真实环境触发，例如外联、敏感接口访问、认证异常。",
            )
        )
    multimodal = status_map.get("multimodal_audit", {})
    if multimodal.get("status") == "needs_input":
        gaps.append(
            evidence_gap(
                gap_id="multimodal-evidence-materials",
                module="多模态证据",
                severity="low",
                reason=multimodal.get("reason") or "缺少多模态证据。",
                missing_items=["告警截图", "日志平台截图", "录屏", "语音说明", "人工补充文本"],
                target_module="multimodal",
                proves="补充外部告警和人工研判材料，提高报告可解释性和答辩可信度。",
            )
        )
    for item in modules:
        if item.get("status") == "failed":
            gaps.append(
                evidence_gap(
                    gap_id=f"{item.get('id')}-failed",
                    module=str(item.get("name") or item.get("id")),
                    severity="medium",
                    reason=str(item.get("reason") or "该模块执行失败。"),
                    missing_items=["可扫描输入", "运行环境", "后端错误日志"],
                    target_module=str(item.get("target") or item.get("id")),
                    proves="修复失败模块后才能补齐该调查环节的证据。",
                )
            )
    return gaps


def evidence_gap(
    *,
    gap_id: str,
    module: str,
    severity: str,
    reason: str,
    missing_items: list[str],
    target_module: str,
    proves: str,
) -> dict[str, Any]:
    return {
        "id": gap_id,
        "module": module,
        "severity": severity,
        "reason": reason,
        "question": f"当前为什么需要补充{module}材料？",
        "missingItems": missing_items,
        "whereToFind": where_to_find(module),
        "uploadTo": module,
        "targetModule": target_module,
        "proves": proves,
    }


def where_to_find(module: str) -> list[str]:
    if module == "产物可信":
        return ["release 页面", "GitHub Actions artifacts", "SLSA provenance", "cosign/gh attestation"]
    if module == "日志印证":
        return ["CI/CD 运行日志", "应用日志", "Nginx/access log", "K8s pod log", "EDR/WAF/DNS 日志"]
    if module == "多模态证据":
        return ["告警平台截图", "日志平台截图", "构建失败截图", "复现录屏", "人工研判记录"]
    return ["项目输入目录", "扫描工具日志", "后端日志"]


def build_next_actions(
    modules: list[dict[str, Any]],
    evidence_gaps: list[dict[str, Any]],
    workspace: dict[str, Any],
) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    for gap in evidence_gaps:
        priority = "high" if gap.get("severity") == "high" else "medium" if gap.get("severity") == "medium" else "low"
        actions.append(
            {
                "priority": priority,
                "title": f"补充{gap.get('module')}材料",
                "action": gap.get("reason"),
                "targetModule": gap.get("targetModule"),
                "missingItems": gap.get("missingItems", []),
                "actionKind": "request_evidence",
                "payload": {"gapId": gap.get("id")},
            }
        )
    pending = next((item for item in modules if item.get("status") == "pending"), None)
    if pending:
        actions.append(
            {
                "priority": "medium",
                "title": f"执行{pending.get('name')}",
                "action": pending.get("reason"),
                "targetModule": pending.get("target"),
                "actionKind": "run_module",
                "payload": {"moduleId": pending.get("id")},
            }
        )
    if not actions:
        risk = (workspace.get("summary") or {}).get("risk_level") or "unknown"
        actions.append(
            {
                "priority": "low",
                "title": "生成最终研判结论",
                "action": f"当前关键模块已完成，可以基于风险等级 {risk} 输出上线建议、证据链和修复优先级。",
                "targetModule": "report",
                "actionKind": "finalize_report",
                "payload": {},
            }
        )
    return actions[:8]


def investigation_status(
    modules: list[dict[str, Any]],
    evidence_gaps: list[dict[str, Any]],
    errors: list[dict[str, str]],
) -> str:
    if errors:
        return "partial"
    if evidence_gaps:
        return "need_user_input"
    if any(item.get("status") == "pending" for item in modules):
        return "planned"
    return "completed"


def build_summary(
    modules: list[dict[str, Any]],
    evidence_gaps: list[dict[str, Any]],
    next_actions: list[dict[str, Any]],
    workspace: dict[str, Any],
) -> dict[str, Any]:
    counts: dict[str, int] = {}
    for item in modules:
        status = str(item.get("status") or "unknown")
        counts[status] = counts.get(status, 0) + 1
    risk_summary = workspace.get("summary") if isinstance(workspace.get("summary"), dict) else {}
    return {
        "moduleCount": len(modules),
        "completed": counts.get("completed", 0),
        "needsInput": counts.get("needs_input", 0),
        "pending": counts.get("pending", 0),
        "failed": counts.get("failed", 0),
        "evidenceGapCount": len(evidence_gaps),
        "nextActionTitle": str((next_actions[0] or {}).get("title") or "") if next_actions else "",
        "riskScore": risk_summary.get("risk_score", 0),
        "riskLevel": risk_summary.get("risk_level", "unknown"),
    }


def build_followup_questions(evidence_gaps: list[dict[str, Any]], next_actions: list[dict[str, Any]]) -> list[str]:
    questions = ["下一步该做什么？", "现在为什么待补充？"]
    if evidence_gaps:
        questions.append(f"要补充哪些{evidence_gaps[0].get('module')}材料？")
    if next_actions:
        questions.append(f"为什么建议：{next_actions[0].get('title')}？")
    return questions[:5]


def answer_investigation_question(question: str, investigation: dict[str, Any], workspace: dict[str, Any]) -> dict[str, Any]:
    """根据调查状态回答用户问题。"""

    clean_question = question.strip()
    lower_question = clean_question.lower()
    gaps = investigation.get("evidenceGaps") if isinstance(investigation.get("evidenceGaps"), list) else []
    actions = investigation.get("nextActions") if isinstance(investigation.get("nextActions"), list) else []
    modules = investigation.get("modules") if isinstance(investigation.get("modules"), list) else []
    if any(keyword in clean_question for keyword in ["为什么", "原因", "待补", "缺少", "缺什么"]):
        answer = explain_gaps(gaps, modules)
    elif any(keyword in clean_question for keyword in ["下一步", "接下来", "上传", "补充", "怎么做"]) or "next" in lower_question:
        answer = explain_next_actions(actions, gaps)
    elif any(keyword in clean_question for keyword in ["状态", "进度", "完成"]):
        answer = explain_status(investigation)
    else:
        answer = explain_overview(investigation, workspace)
    return {
        "question": clean_question,
        "answer": answer,
        "model": "rule-based-investigation-agent",
        "investigation": investigation,
        "next_actions": actions,
        "evidence_gaps": gaps,
    }


def explain_gaps(gaps: list[dict[str, Any]], modules: list[dict[str, Any]]) -> str:
    if not gaps:
        return "当前没有阻断调查闭环的必需证据缺口。可以继续复核扫描发现、生成报告或导出证据包。"
    lines = ["当前待补充的原因是证据链还没有完全闭环："]
    for gap in gaps[:4]:
        missing = "、".join(str(item) for item in gap.get("missingItems", [])[:5]) or "相关材料"
        lines.append(f"- {gap.get('module')}：{gap.get('reason')} 需要补充：{missing}。作用：{gap.get('proves')}")
    blocked = [item for item in modules if item.get("status") in {"needs_input", "failed"}]
    if blocked:
        names = "、".join(str(item.get("name")) for item in blocked[:4])
        lines.append(f"受影响的调查模块：{names}。")
    return "\n".join(lines)


def explain_next_actions(actions: list[dict[str, Any]], gaps: list[dict[str, Any]]) -> str:
    if not actions:
        return "当前没有新的下一步动作，建议生成最终报告并导出证据包。"
    lines = ["建议按这个顺序继续："]
    for index, action in enumerate(actions[:5], start=1):
        missing = action.get("missingItems") if isinstance(action.get("missingItems"), list) else []
        suffix = f" 需要材料：{'、'.join(str(item) for item in missing[:5])}。" if missing else ""
        lines.append(f"{index}. {action.get('title')}：{action.get('action')}{suffix}")
    if gaps:
        lines.append("优先补高优先级缺口，因为这些材料会直接影响是否能证明攻击链真实成立。")
    return "\n".join(lines)


def explain_status(investigation: dict[str, Any]) -> str:
    summary = investigation.get("summary") if isinstance(investigation.get("summary"), dict) else {}
    status = investigation.get("status") or "unknown"
    return (
        f"当前调查状态是 {status}。"
        f"已完成 {summary.get('completed', 0)} 个模块，"
        f"待补 {summary.get('needsInput', 0)} 个模块，"
        f"待执行 {summary.get('pending', 0)} 个模块，"
        f"失败 {summary.get('failed', 0)} 个模块。"
        f"证据缺口数量：{summary.get('evidenceGapCount', 0)}。"
    )


def explain_overview(investigation: dict[str, Any], workspace: dict[str, Any]) -> str:
    summary = investigation.get("summary") if isinstance(investigation.get("summary"), dict) else {}
    workspace_summary = workspace.get("summary") if isinstance(workspace.get("summary"), dict) else {}
    next_title = summary.get("nextActionTitle") or "生成最终研判结论"
    return (
        "这是规则版安全调查 Agent 的当前判断："
        f"风险评分 {workspace_summary.get('risk_score', summary.get('riskScore', 0))}/100，"
        f"风险等级 {workspace_summary.get('risk_level', summary.get('riskLevel', 'unknown'))}。"
        f"已完成 {summary.get('completed', 0)} 个模块，"
        f"还有 {summary.get('evidenceGapCount', 0)} 个证据缺口。"
        f"下一步建议：{next_title}。"
    )
