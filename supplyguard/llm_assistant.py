"""LLM-backed security assistant helpers."""

from __future__ import annotations

import json
from typing import Any

import httpx

from .config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL, DEEPSEEK_TIMEOUT_SECONDS


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
        "max_tokens": 900,
    }
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=DEEPSEEK_TIMEOUT_SECONDS) as client:
        response = await client.post(
            f"{DEEPSEEK_BASE_URL}/chat/completions",
            headers=headers,
            json=payload,
        )
        response.raise_for_status()

    data = response.json()
    content = extract_chat_content(data)
    if not content:
        return None

    return {
        "answer": content,
        "model": str(data.get("model") or DEEPSEEK_MODEL),
    }


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
