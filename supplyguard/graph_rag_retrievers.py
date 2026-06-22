from __future__ import annotations

import json
import re
from typing import Any

from .package_embeddings import PackageEmbeddingIndex


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
    *,
    embedding_index: PackageEmbeddingIndex | None = None,
) -> dict[str, list[dict[str, Any]]]:
    graph_payload = graph_payload if isinstance(graph_payload, dict) else {}
    nodes = [node for node in safe_list(graph_payload.get("nodes")) if isinstance(node, dict)]
    attack_paths = [
        path for path in safe_list(graph_payload.get("attack_paths")) if isinstance(path, dict)
    ]
    tokens = query_tokens(query)

    return {
        "keyword": _keyword_channel(nodes, attack_paths, tokens),
        "risk": _risk_channel(nodes),
        "attack_path": _attack_path_channel(attack_paths, tokens, intent),
        "embedding": _embedding_channel(nodes, embedding_index=embedding_index),
    }


def query_tokens(query: str) -> set[str]:
    lowered = str(query or "").lower()
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
        json.dumps(safe_str_list(path.get("node_ids")), ensure_ascii=False),
        json.dumps(safe_str_list(path.get("edge_ids")), ensure_ascii=False),
    ]
    return " ".join(str(part) for part in parts if part is not None).lower()


def graph_risk_score(node: dict[str, Any]) -> float:
    score = safe_float(node.get("score")) / 100.0
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


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def safe_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def safe_str_list(value: Any) -> list[str]:
    return [str(item) for item in value] if isinstance(value, list) else []


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
                    "score": float(len(matches)) + safe_float(path.get("score")) / 100.0,
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
        score = safe_float(path.get("score")) / 100.0
        if matches:
            score += float(len(matches))
        if intent == "attack_path":
            score += 1.0
        if matches or intent == "attack_path":
            candidates.append(
                {
                    "kind": "attack_path",
                    "id": path_id,
                    "score": score,
                    "matches": matches,
                    "reason": "attack_path_recall",
                    "node_ids": safe_str_list(path.get("node_ids")),
                    "edge_ids": safe_str_list(path.get("edge_ids")),
                }
            )
    return sorted(candidates, key=lambda item: (-float(item["score"]), str(item["id"])))


def _embedding_channel(
    nodes: list[dict[str, Any]],
    *,
    embedding_index: PackageEmbeddingIndex | None = None,
) -> list[dict[str, Any]]:
    index = embedding_index or PackageEmbeddingIndex()
    if not index.available:
        return []

    node_by_record_id = {
        record.id: node
        for node in nodes
        if (record := index.record_for_node(node)) is not None
    }
    if not node_by_record_id:
        return []

    candidate_nodes = [
        node for node in node_by_record_id.values()
        if graph_gnn_score(node) > 0 or graph_risk_score(node) >= 0.75
    ] or list(node_by_record_id.values())
    seed_nodes = sorted(
        candidate_nodes,
        key=lambda node: (
            -(graph_gnn_score(node) + graph_risk_score(node)),
            str(node.get("id") or ""),
        ),
    )[:5]
    allowed_ids = set(node_by_record_id)
    hits: dict[str, dict[str, Any]] = {}
    for seed_node in seed_nodes:
        seed_record = index.record_for_node(seed_node)
        if seed_record is None:
            continue
        seed_vector = index.vector_for_record(seed_record)
        if seed_vector is None:
            continue
        similar = index.similar_to_vector(
            seed_vector,
            limit=8,
            allowed_ids=allowed_ids,
            exclude_ids={seed_record.id},
        )
        source_package = _display_package(seed_record.ecosystem, seed_record.package)
        for item in similar:
            node_id = str(item.get("id") or "")
            if not node_id:
                continue
            score = float(item.get("score") or 0.0)
            existing = hits.get(node_id)
            if existing and float(existing.get("score") or 0.0) >= score:
                continue
            hits[node_id] = {
                "kind": "node",
                "id": node_id,
                "score": score,
                "similarity": float(item.get("similarity") or 0.0),
                "reason": "embedding_similarity",
                "source_package": source_package,
                "matched_package": _display_package(str(item.get("ecosystem") or ""), str(item.get("package") or "")),
            }

    return sorted(hits.values(), key=lambda item: (-float(item["score"]), str(item["id"])))[:10]


def _display_package(ecosystem: str, package: str) -> str:
    return f"{ecosystem}:{package}" if ecosystem and package else package or ecosystem
