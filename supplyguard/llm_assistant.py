"""LLM-backed security assistant helpers."""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from .config import (
    DEEPSEEK_API_KEY,
    DEEPSEEK_ASSISTANT_MAX_TOKENS,
    DEEPSEEK_ASSISTANT_RETRY_MAX_TOKENS,
    DEEPSEEK_BASE_URL,
    DEEPSEEK_MODEL,
    DEEPSEEK_TIMEOUT_SECONDS,
)


logger = logging.getLogger(__name__)


DEEPSEEK_SYSTEM_PROMPT = (
    "\u4f60\u662f SupplyGuard KG \u7684\u5b89\u5168\u5206\u6790\u52a9\u624b\u3002\n"
    "\u4f60\u9700\u8981\u57fa\u4e8e\u7ed9\u5b9a\u7684\u4f9b\u5e94\u94fe\u5b89\u5168"
    "\u5de5\u4f5c\u53f0\u4e0a\u4e0b\u6587\u56de\u7b54\u95ee\u9898\uff0c"
    "\u91cd\u70b9\u8bf4\u660e\u8bc1\u636e\u94fe\u3001\u653b\u51fb\u8def\u5f84\u3001"
    "\u4fee\u590d\u4f18\u5148\u7ea7\u548c\u8bef\u62a5\u5224\u65ad\u3002\n"
    "\u56de\u7b54\u8981\u6c42\uff1a\n"
    "- \u4f7f\u7528\u4e2d\u6587\uff0c\u8bed\u6c14\u4e13\u4e1a\u3001\u76f4\u63a5\u3002\n"
    "- \u5148\u7ed9\u7ed3\u8bba\uff0c\u518d\u7ed9\u5173\u952e\u8bc1\u636e\u548c"
    "\u5904\u7f6e\u5efa\u8bae\u3002\n"
    "- \u4e0d\u8981\u7f16\u9020\u4e0a\u4e0b\u6587\u91cc\u6ca1\u6709\u7684"
    "\u8d44\u4ea7\u3001CVE\u3001IP \u6216\u547d\u4ee4\u3002\n"
    "- \u5982\u679c\u8bc1\u636e\u4e0d\u8db3\uff0c\u660e\u786e\u6307\u51fa\u7f3a\u53e3"
    "\u5e76\u5efa\u8bae\u4e0b\u4e00\u6b65\u9a8c\u8bc1\u3002"
)

DEEPSEEK_INVESTIGATION_AGENT_PROMPT = (
    "你是 SupplyGuard KG 的安全调查 Agent 规划器。\n"
    "你的职责是基于后端已经生成的 investigationAgent 状态，用中文解释调查计划、"
    "证据缺口、下一步动作和报告结论。\n"
    "严格限制：\n"
    "- 你不能要求执行任意 shell 命令，不能编造不存在的扫描器。\n"
    "- 底层扫描只能由后端已注册工具完成：code_audit、dependency_audit、"
    "cicd_audit、artifact_trust、log_audit、multimodal_audit、workspace_report。\n"
    "- 如果需要继续调查，只能建议调用这些工具或补充对应材料。\n"
    "- 不要编造工作空间里没有的 CVE、IP、commit、文件路径或扫描结论。\n"
    "- 如果证据不足，要明确说明缺口、缺口作用和下一步补证顺序。\n"
    "- 必须区分模块风险分、证据完整度和攻击路径置信度；它们都不是攻击发生概率。\n"
    "- 用户询问整个项目、真实供应链攻击、调用模块或证据链时，必须进行全局研判，"
    "不能仅回答代码、依赖或其他单一模块。\n"
    "- 只有 attack_paths 和跨模块证据能够闭环时，才能称为已确认或高可信攻击路径；"
    "否则必须使用疑似、待补证或不能确认。\n"
    "输出要求：先给直接结论，再按“关键证据、攻击证据链、复用模块、仍需确认、下一步建议”组织；"
    "证据链应列出路径名称或 ID、关系顺序、置信度及证据数量。\n"
    "- 控制回答篇幅，确保每个列表项和 Markdown 加粗标记完整闭合；不要输出半句话。"
)


def deepseek_enabled() -> bool:
    return bool(DEEPSEEK_API_KEY)


async def ask_deepseek_security_assistant(
    question: str,
    workspace: dict[str, Any],
    retrieval: list[str],
    graph_rag: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    if not deepseek_enabled():
        return None

    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": DEEPSEEK_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "\u8bf7\u56de\u7b54\u4e0b\u9762\u7684\u5b89\u5168\u5206\u6790\u95ee\u9898\u3002\n\n"
                    f"\u95ee\u9898\uff1a{question}\n\n"
                    "\u5de5\u4f5c\u53f0\u4e0a\u4e0b\u6587\uff1a\n"
                    f"{build_assistant_context(workspace, retrieval, graph_rag=graph_rag)}"
                ),
            },
        ],
        "thinking": {"type": "disabled"},
        "temperature": 0.2,
        "max_tokens": DEEPSEEK_ASSISTANT_MAX_TOKENS,
    }
    return await request_deepseek_completion_with_retry(payload)


async def ask_deepseek_investigation_agent(
    question: str,
    workspace: dict[str, Any],
    investigation: dict[str, Any],
) -> dict[str, Any] | None:
    """用大模型解释规则 Agent 状态，但不让大模型直接执行底层扫描。"""

    if not deepseek_enabled():
        return None

    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": DEEPSEEK_INVESTIGATION_AGENT_PROMPT},
            {
                "role": "user",
                "content": (
                    "请基于当前调查状态回答用户问题。\n\n"
                    f"用户问题：{question}\n\n"
                    "可用后端工具：\n"
                    "- code_audit：代码审查\n"
                    "- dependency_audit：供应链/SBOM/VEX 分析\n"
                    "- cicd_audit：CI/CD 链路分析\n"
                    "- artifact_trust：产物可信和 provenance/attestation 验证\n"
                    "- log_audit：构建/运行日志印证\n"
                    "- multimodal_audit：截图、录屏、语音、人工文本证据\n"
                    "- workspace_report：图谱与报告生成\n\n"
                    "调查状态与工作空间摘要：\n"
                    f"{build_investigation_context(workspace, investigation)}"
                ),
            },
        ],
        "thinking": {"type": "disabled"},
        "temperature": 0.2,
        "max_tokens": 1800,
    }
    return await request_deepseek_completion_with_retry(payload)


async def request_deepseek_completion_with_retry(payload: dict[str, Any]) -> dict[str, Any] | None:
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=DEEPSEEK_TIMEOUT_SECONDS) as client:
        data, content = await request_deepseek_completion(client, headers, payload)
        if not content:
            logger.warning("DeepSeek 返回空回答，准备使用离线回答")
            return None
        if not chat_completion_is_incomplete(data, content):
            return deepseek_answer_payload(data, content)

        logger.warning(
            "DeepSeek 回答不完整，将 max_tokens 从 %s 提升到 %s 后重试",
            payload.get("max_tokens"),
            DEEPSEEK_ASSISTANT_RETRY_MAX_TOKENS,
        )
        retry_payload = {**payload, "max_tokens": DEEPSEEK_ASSISTANT_RETRY_MAX_TOKENS}
        try:
            retry_data, retry_content = await request_deepseek_completion(client, headers, retry_payload)
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("DeepSeek 重试失败，保留首次生成内容：%s", exc)
            return deepseek_answer_payload(
                data,
                preserve_partial_chat_content(content),
                partial=True,
                retried=True,
            )

    if retry_content and not chat_completion_is_incomplete(retry_data, retry_content):
        return deepseek_answer_payload(retry_data, retry_content, retried=True)

    best_data = retry_data if retry_content else data
    best_content = retry_content or content
    logger.warning("DeepSeek 重试后回答仍不完整，保留当前已生成内容")
    return deepseek_answer_payload(
        best_data,
        preserve_partial_chat_content(best_content),
        partial=True,
        retried=True,
    )


async def request_deepseek_completion(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    payload: dict[str, Any],
) -> tuple[dict[str, Any], str]:
    response = await client.post(
        f"{DEEPSEEK_BASE_URL}/chat/completions",
        headers=headers,
        json=payload,
    )
    response.raise_for_status()
    data = response.json()
    if not isinstance(data, dict):
        raise ValueError("DeepSeek 响应必须是 JSON 对象")
    return data, extract_chat_content(data)


def deepseek_answer_payload(
    data: dict[str, Any],
    content: str,
    *,
    partial: bool = False,
    retried: bool = False,
) -> dict[str, Any]:
    return {
        "answer": content,
        "model": str(data.get("model") or DEEPSEEK_MODEL),
        "partial": partial,
        "retried": retried,
    }


def preserve_partial_chat_content(content: str) -> str:
    text = content.rstrip()
    if text.count("**") % 2 == 1:
        text += "**"
    if text.count("```") % 2 == 1:
        text += "\n```"
    return f"{text}\n\n> 回答达到输出上限，以上为模型已生成的有效内容。"


def build_assistant_context(
    workspace: dict[str, Any],
    retrieval: list[str],
    graph_rag: dict[str, Any] | None = None,
) -> str:
    context = {
        "workspace": workspace.get("workspace"),
        "summary": workspace.get("summary"),
        "top_findings": safe_slice(workspace.get("findings"), limit=8),
        "pipeline": safe_slice(workspace.get("pipeline"), limit=8),
        "attack_paths": safe_slice(
            (workspace.get("graph") or {}).get("attack_paths") if isinstance(workspace.get("graph"), dict) else None,
            limit=5,
        ),
        "retrieval": retrieval[:8],
        "assistant_next_actions": (workspace.get("assistant") or {}).get("next_actions"),
    }
    if isinstance(graph_rag, dict):
        context["graph_rag"] = {
            "context": graph_rag.get("context"),
            "intent": graph_rag.get("intent"),
            "explanation": graph_rag.get("explanation"),
            "evidence_table": safe_slice(graph_rag.get("evidence_table"), limit=8),
            "missing_evidence": safe_slice(graph_rag.get("missing_evidence"), limit=6),
            "retrieval_trace": safe_slice(graph_rag.get("retrieval_trace"), limit=8),
            "top_nodes": safe_slice(graph_rag.get("top_nodes"), limit=6),
            "top_edges": safe_slice(graph_rag.get("top_edges"), limit=6),
            "top_attack_paths": safe_slice(graph_rag.get("top_attack_paths"), limit=3),
        }
    return short_json(context, limit=12000)


def build_investigation_context(workspace: dict[str, Any], investigation: dict[str, Any]) -> str:
    context = {
        "workspace": workspace.get("workspace"),
        "summary": workspace.get("summary"),
        "scan_suite": workspace.get("scanSuite"),
        "investigation": {
            "status": investigation.get("status"),
            "goal": investigation.get("goal"),
            "summary": investigation.get("summary"),
            "modules": safe_slice(investigation.get("modules"), limit=10),
            "evidenceGaps": safe_slice(investigation.get("evidenceGaps"), limit=8),
            "nextActions": safe_slice(investigation.get("nextActions"), limit=8),
            "questions": safe_slice(investigation.get("questions"), limit=6),
        },
        "top_findings": safe_slice(workspace.get("findings"), limit=6),
        "attack_paths": safe_slice(
            (workspace.get("graph") or {}).get("attack_paths") if isinstance(workspace.get("graph"), dict) else None,
            limit=3,
        ),
    }
    return short_json(context, limit=12000)


def assistant_retrieval_with_graph_rag(
    retrieval: list[str],
    graph_rag: dict[str, Any] | None,
) -> list[str]:
    merged: list[str] = []
    graph_context = ""
    if isinstance(graph_rag, dict):
        graph_context = str(graph_rag.get("context") or "").strip()
    if graph_context:
        merged.append(graph_context)
    for item in retrieval:
        text = str(item).strip()
        if text and text not in merged:
            merged.append(text)
    return merged


def safe_slice(value: Any, *, limit: int) -> list[Any]:
    if isinstance(value, list):
        return value[:limit]
    return []


def short_json(value: Any, *, limit: int) -> str:
    text = json.dumps(value, ensure_ascii=False, default=str, indent=2)
    if len(text) <= limit:
        return text
    return f"{text[:limit]}\n...\uff08\u4e0a\u4e0b\u6587\u5df2\u622a\u65ad\uff09"


def extract_chat_content(data: dict[str, Any]) -> str:
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    first = choices[0]
    if not isinstance(first, dict):
        return ""
    message = first.get("message")
    if isinstance(message, dict):
        return str(message.get("content") or "").strip()
    return str(first.get("text") or "").strip()


def chat_completion_is_incomplete(data: dict[str, Any], content: str) -> bool:
    """识别长度截断或明显未闭合的 Markdown，避免向前端返回半句话。"""

    choices = data.get("choices")
    first = choices[0] if isinstance(choices, list) and choices and isinstance(choices[0], dict) else {}
    if str(first.get("finish_reason") or "").lower() == "length":
        return True

    return content.count("```") % 2 == 1 or content.count("**") % 2 == 1
