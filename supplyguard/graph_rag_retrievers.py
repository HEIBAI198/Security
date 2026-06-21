from __future__ import annotations

import json
import re
from typing import Any


TOKEN_RE = re.compile(r"[@A-Za-z0-9_.:/-]+")
SEVERITY_WEIGHT = {"critical": 1.0, "high": 0.75, "medium": 0.45, "low": 0.2}
CHINESE_HINTS = (
    "依赖",
    "恶意包",
    "构建",
    "流水线",
    "产物",
    "运行",
    "日志",
    "外联",
    "攻击路径",
    "链路",
    "漏洞",
    "风险",
)


def retrieve_channels(
    graph_payload: dict[str, Any],
    query: str,
    intent: str,
) -> dict[str, list[dict[str, Any]]]:
    nodes = [node for node in graph_payload.get("nodes", []) if isinstance(node, dict)]
    attack_paths = [
        path for path in graph_payload.get("attack_paths", []) if isinstance(path, dict)
    ]
    tokens = query_tokens(query)

    return {
        "keyword": _keyword_channel(nodes, attack_paths, tokens),
        "risk": _risk_channel(nodes),
        "attack_path": _attack_path_channel(attack_paths, tokens, intent),
        "embedding": _embedding_channel(),
    }


def query_tokens(query: str) -> set[str]:
    lowered = query.lower()
    tokens = {
        token.lower()
        for token in TOKEN_RE.findall(lowered)
        if len(token) >= 3
    }
    tokens.update(hint for hint in CHINESE_HINTS if hint in lowered)
    return tokens


def graph_node_text(node: dict[str, Any]) -> str:
    parts = [
        node.get("id"),
        node.get("label"),
        node.get("type"),
        node.get("risk"),
        node.get("description"),
        json.dumps(node.get("properties") or {}, ensure_ascii=False, sort_keys=True),
    ]
    return " ".join(str(part) for part in parts if part is not None).lower()


def graph_path_text(path: dict[str, Any]) -> str:
    parts = [
        path.get("id"),
        path.get("title"),
        path.get("description"),
        path.get("conclusion"),
        json.dumps(path.get("node_ids") or [], ensure_ascii=False),
        json.dumps(path.get("edge_ids") or [], ensure_ascii=False),
    ]
    return " ".join(str(part) for part in parts if part is not None).lower()


def graph_risk_score(node: dict[str, Any]) -> float:
    score = float(node.get("score") or 0) / 100.0
    severity = SEVERITY_WEIGHT.get(str(node.get("risk") or "").lower(), 0.0)
    return max(score, severity)


def graph_gnn_score(node: dict[str, Any]) -> float:
    raw = raw_properties(node).get("gnn_score")
    try:
        return max(0.0, min(1.0, float(raw)))
    except (TypeError, ValueError):
        return 0.0


def raw_properties(node: dict[str, Any]) -> dict[str, Any]:
    properties = node.get("properties")
    if not isinstance(properties, dict):
        return {}
    nested = properties.get("properties")
    if isinstance(nested, dict):
        return nested
    return properties


def _keyword_channel(
    nodes: list[dict[str, Any]],
    attack_paths: list[dict[str, Any]],
    tokens: set[str],
) -> list[dict[str, Any]]:
    if not tokens:
        return []

    candidates: list[dict[str, Any]] = []
    for node in nodes:
        node_id = str(node.get("id") or "")
        if not node_id:
            continue
        matches = sorted(token for token in tokens if token in graph_node_text(node))
        if matches:
            candidates.append(
                {
                    "kind": "node",
                    "id": node_id,
                    "score": float(len(matches)) + graph_risk_score(node) * 0.25 + graph_gnn_score(node) * 0.5,
                    "matches": matches,
                    "reason": "keyword_match",
                }
            )

    for path in attack_paths:
        path_id = str(path.get("id") or "")
        if not path_id:
            continue
        matches = sorted(token for token in tokens if token in graph_path_text(path))
        if matches:
            candidates.append(
                {
                    "kind": "attack_path",
                    "id": path_id,
                    "score": float(len(matches)) + float(path.get("score") or 0) / 100.0,
                    "matches": matches,
                    "reason": "keyword_match",
                }
            )

    return sorted(candidates, key=lambda item: (-float(item["score"]), str(item["id"])))


def _risk_channel(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    candidates = []
    for node in nodes:
        node_id = str(node.get("id") or "")
        if not node_id:
            continue
        risk_score = graph_risk_score(node)
        gnn_score = graph_gnn_score(node)
        if risk_score > 0 or gnn_score > 0:
            candidates.append(
                {
                    "kind": "node",
                    "id": node_id,
                    "score": risk_score + gnn_score * 0.5,
                    "risk": node.get("risk"),
                    "gnn_score": gnn_score,
                    "reason": "risk_or_gnn_signal",
                }
            )
    return sorted(candidates, key=lambda item: (-float(item["score"]), str(item["id"])))


def _attack_path_channel(
    attack_paths: list[dict[str, Any]],
    tokens: set[str],
    intent: str,
) -> list[dict[str, Any]]:
    candidates = []
    for path in attack_paths:
        path_id = str(path.get("id") or "")
        if not path_id:
            continue
        matches = sorted(token for token in tokens if token in graph_path_text(path))
        score = float(path.get("score") or 0) / 100.0
        if matches:
            score += float(len(matches))
        if intent == "attack_path":
            score += 1.0
        if matches or intent == "attack_path" or score > 0:
            candidates.append(
                {
                    "kind": "attack_path",
                    "id": path_id,
                    "score": score,
                    "matches": matches,
                    "reason": "attack_path_recall",
                    "node_ids": [str(node_id) for node_id in path.get("node_ids", [])],
                    "edge_ids": [str(edge_id) for edge_id in path.get("edge_ids", [])],
                }
            )
    return sorted(candidates, key=lambda item: (-float(item["score"]), str(item["id"])))


def _embedding_channel() -> list[dict[str, Any]]:
    return []
