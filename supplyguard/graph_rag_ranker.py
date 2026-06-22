from __future__ import annotations

from typing import Any

import networkx as nx

from .graph_rag_retrievers import (
    graph_gnn_score,
    graph_node_text,
    graph_path_text,
    graph_risk_score,
    query_tokens,
    safe_float,
    safe_list,
    safe_str_list,
)


INTENT_EDGE_HINTS = {
    "dependency_risk": ("DEPENDENCY_REACHES_BUILD", "FINDING_AFFECTS", "PACKAGE_HAS_VULN"),
    "build_risk": (
        "CI",
        "CD",
        "BUILD",
        "ARTIFACT",
        "PROVENANCE",
        "ATTESTATION",
        "SLSA",
        "WORKFLOW",
        "RUNNER",
        "构建",
        "产物",
        "流水线",
    ),
    "runtime_evidence": ("BUILD_TO_RUNTIME", "LOG", "EVENT", "RUNTIME", "EGRESS", "运行", "日志", "外联"),
}


def rank_graph_rag_candidates(
    graph_payload: dict[str, Any],
    channels: dict[str, list[dict[str, Any]]],
    query: str,
    intent: str,
    *,
    max_nodes: int,
    max_edges: int,
    max_paths: int,
    hops: int,
) -> dict[str, list[dict[str, Any]]]:
    graph_payload = graph_payload if isinstance(graph_payload, dict) else {}
    channels = channels if isinstance(channels, dict) else {}
    nodes = [node for node in safe_list(graph_payload.get("nodes")) if isinstance(node, dict)]
    edges = [edge for edge in safe_list(graph_payload.get("edges")) if isinstance(edge, dict)]
    attack_paths = [
        path for path in safe_list(graph_payload.get("attack_paths")) if isinstance(path, dict)
    ]
    node_by_id = {str(node.get("id")): node for node in nodes if node.get("id")}
    edge_by_id = {str(edge.get("id")): edge for edge in edges if edge.get("id")}
    path_by_id = {str(path.get("id")): path for path in attack_paths if path.get("id")}
    tokens = query_tokens(query)
    graph = _build_graph(nodes, edges)

    seed_scores = _seed_scores(nodes, tokens)
    why_by_node: dict[str, set[str]] = {
        node_id: {"keyword seed recall"}
        for node_id in seed_scores
    }

    _merge_channel_node_boosts(seed_scores, why_by_node, channels)
    if not seed_scores:
        seed_scores = {
            str(node.get("id")): graph_risk_score(node)
            for node in sorted(
                nodes,
                key=lambda node: (
                    -graph_risk_score(node),
                    str(node.get("id") or ""),
                    str(node.get("label") or ""),
                ),
            )[: max(1, max_nodes // 2)]
            if node.get("id")
        }
        why_by_node = {node_id: {"risk fallback seed"} for node_id in seed_scores}

    expanded_ids = _expand_nodes(graph, seed_scores.keys(), hops=hops)
    for node_id in expanded_ids:
        if node_id not in why_by_node and node_id not in seed_scores:
            why_by_node.setdefault(node_id, set()).add(f"within {hops}-hop graph expansion")

    selected_graph = graph.subgraph(expanded_ids).copy()
    pagerank = _pagerank(selected_graph, seed_scores)

    ranked_nodes = sorted(
        (node_by_id[node_id] for node_id in expanded_ids if node_id in node_by_id),
        key=lambda node: (
            -_ranking_score(node, tokens, seed_scores, pagerank),
            str(node.get("id") or ""),
            str(node.get("label") or ""),
        ),
    )[:max_nodes]
    ranked_node_ids = {str(node.get("id")) for node in ranked_nodes}

    selected_nodes = [
        _with_node_reasons(node, tokens, seed_scores, pagerank, why_by_node)
        for node in ranked_nodes
    ]
    path_candidates = _rank_attack_paths(attack_paths, ranked_node_ids, channels, tokens, intent)[:max_paths]
    ranked_path_ids = _channel_path_ids(channels) | {
        str(path.get("id")) for path in path_candidates if path.get("id")
    }
    selected_path_edge_ids = {
        edge_id
        for path in path_candidates
        for edge_id in safe_str_list(path.get("edge_ids"))
    }
    selected_edges = [
        _with_edge_reasons(edge, intent, ranked_path_ids, path_by_id)
        for edge in _rank_edges(
            edges,
            ranked_node_ids,
            edge_by_id,
            intent,
            path_by_id,
            ranked_path_ids,
            selected_path_edge_ids,
        )[:max_edges]
    ]
    selected_paths = [
        _with_path_reasons(path, ranked_node_ids, channels, intent)
        for path in path_candidates
    ]

    retrieval_trace = [
        {"stage": "intent", "intent": intent},
        {
            "stage": "channels",
            "keyword": len(channels.get("keyword", [])),
            "risk": len(channels.get("risk", [])),
            "attack_path": len(channels.get("attack_path", [])),
            "embedding": len(channels.get("embedding", [])),
        },
        {"stage": "seed_recall", "seed_node_ids": list(seed_scores.keys())},
        {"stage": "graph_expansion", "hops": hops, "expanded_node_count": len(expanded_ids)},
        {
            "stage": "ranking",
            "node_count": len(selected_nodes),
            "edge_count": len(selected_edges),
            "path_count": len(selected_paths),
        },
    ]

    return {
        "top_nodes": selected_nodes,
        "top_edges": selected_edges,
        "top_attack_paths": selected_paths,
        "seed_nodes": [{"id": node_id} for node_id in seed_scores.keys()],
        "expanded_nodes": [{"id": node_id} for node_id in sorted(expanded_ids)],
        "retrieval_trace": retrieval_trace,
    }


def _build_graph(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> nx.Graph:
    graph = nx.Graph()
    for node in nodes:
        node_id = str(node.get("id") or "")
        if node_id:
            graph.add_node(node_id)
    for edge in edges:
        source = str(edge.get("source") or "")
        target = str(edge.get("target") or "")
        if source and target:
            graph.add_edge(source, target, id=str(edge.get("id") or ""), type=edge.get("type"))
    return graph


def _seed_scores(nodes: list[dict[str, Any]], tokens: set[str]) -> dict[str, float]:
    if not tokens:
        return {}
    scores: dict[str, float] = {}
    for node in nodes:
        node_id = str(node.get("id") or "")
        if not node_id:
            continue
        text = graph_node_text(node)
        matches = sum(1 for token in tokens if token in text)
        if matches:
            scores[node_id] = float(matches) + graph_risk_score(node) * 0.25 + graph_gnn_score(node) * 0.5
    return dict(sorted(scores.items(), key=lambda item: (-item[1], item[0])))


def _merge_channel_node_boosts(
    seed_scores: dict[str, float],
    why_by_node: dict[str, set[str]],
    channels: dict[str, list[dict[str, Any]]],
) -> None:
    for item in channels.get("keyword", []):
        if item.get("kind") == "node" and item.get("id"):
            node_id = str(item["id"])
            seed_scores[node_id] = max(seed_scores.get(node_id, 0.0), safe_float(item.get("score")))
            why_by_node.setdefault(node_id, set()).add("keyword channel match")

    for item in channels.get("risk", [])[:8]:
        if item.get("kind") == "node" and item.get("id"):
            node_id = str(item["id"])
            seed_scores[node_id] = max(seed_scores.get(node_id, 0.0), safe_float(item.get("score")) * 0.5)
            why_by_node.setdefault(node_id, set()).add("risk channel signal")

    for item in channels.get("attack_path", [])[:5]:
        for node_id in safe_str_list(item.get("node_ids")):
            seed_scores[str(node_id)] = max(seed_scores.get(str(node_id), 0.0), safe_float(item.get("score")) * 0.25)
            why_by_node.setdefault(str(node_id), set()).add("attack-path channel overlap")


def _expand_nodes(graph: nx.Graph, seeds: Any, hops: int) -> set[str]:
    expanded: set[str] = set()
    for seed in seeds:
        if seed not in graph:
            continue
        lengths = nx.single_source_shortest_path_length(graph, seed, cutoff=max(0, hops))
        expanded.update(str(node_id) for node_id in lengths)
    return expanded


def _pagerank(graph: nx.Graph, seed_scores: dict[str, float]) -> dict[str, float]:
    if graph.number_of_nodes() == 0:
        return {}
    personalization = {
        node_id: max(seed_scores.get(node_id, 0.01), 0.01)
        for node_id in graph.nodes
    }
    try:
        return nx.pagerank(graph, personalization=personalization, max_iter=100)
    except nx.NetworkXException:
        return {node_id: 1.0 / graph.number_of_nodes() for node_id in graph.nodes}


def _ranking_score(
    node: dict[str, Any],
    tokens: set[str],
    seed_scores: dict[str, float],
    pagerank: dict[str, float],
) -> float:
    node_id = str(node.get("id") or "")
    lexical = sum(1 for token in tokens if token in graph_node_text(node))
    return (
        seed_scores.get(node_id, 0.0) * 1.2
        + pagerank.get(node_id, 0.0) * 3.0
        + graph_risk_score(node) * 0.5
        + graph_gnn_score(node) * 1.0
        + lexical * 0.25
    )


def _rank_edges(
    edges: list[dict[str, Any]],
    selected_node_ids: set[str],
    edge_by_id: dict[str, dict[str, Any]],
    intent: str,
    path_by_id: dict[str, dict[str, Any]],
    ranked_path_ids: set[str],
    selected_path_edge_ids: set[str],
) -> list[dict[str, Any]]:
    selected_edges = [
        edge_by_id.get(str(edge.get("id")), edge)
        for edge in edges
        if (
            str(edge.get("id") or "") in selected_path_edge_ids
            or (
                str(edge.get("source")) in selected_node_ids
                and str(edge.get("target")) in selected_node_ids
            )
        )
    ]
    return sorted(
        selected_edges,
        key=lambda edge: (
            -_edge_score(edge, intent, path_by_id, ranked_path_ids),
            str(edge.get("type") or ""),
            str(edge.get("source") or ""),
            str(edge.get("target") or ""),
        ),
    )


def _edge_score(
    edge: dict[str, Any],
    intent: str,
    path_by_id: dict[str, dict[str, Any]],
    ranked_path_ids: set[str],
) -> float:
    score = 0.0
    if _edge_matches_intent(edge, intent):
        score += 2.0
    edge_id = str(edge.get("id") or "")
    source = str(edge.get("source") or "")
    target = str(edge.get("target") or "")
    for path_id in ranked_path_ids:
        path = path_by_id.get(path_id, {})
        edge_ids = set(safe_str_list(path.get("edge_ids")))
        node_ids = set(safe_str_list(path.get("node_ids")))
        if edge_id and edge_id in edge_ids:
            score += 2.5
        elif source in node_ids and target in node_ids:
            score += 1.0
    return score


def _rank_attack_paths(
    attack_paths: list[dict[str, Any]],
    selected_node_ids: set[str],
    channels: dict[str, list[dict[str, Any]]],
    tokens: set[str],
    intent: str,
) -> list[dict[str, Any]]:
    channel_scores = {
        str(item.get("id")): safe_float(item.get("score"))
        for item in channels.get("attack_path", [])
        if item.get("id")
    }
    related = []
    for path in attack_paths:
        path_id = str(path.get("id") or "")
        node_ids = set(safe_str_list(path.get("node_ids")))
        overlap = len(node_ids & selected_node_ids)
        lexical = sum(1 for token in tokens if token in graph_path_text(path))
        channel_score = channel_scores.get(path_id, 0.0)
        if overlap or lexical or channel_score:
            score = (
                overlap * 10.0
                + safe_float(path.get("score")) / 10.0
                + lexical
                + channel_score
                + (2.0 if intent == "attack_path" else 0.0)
            )
            related.append((score, path))
    return [item[1] for item in sorted(related, key=lambda item: (-item[0], str(item[1].get("id") or "")))]


def _with_node_reasons(
    node: dict[str, Any],
    tokens: set[str],
    seed_scores: dict[str, float],
    pagerank: dict[str, float],
    why_by_node: dict[str, set[str]],
) -> dict[str, Any]:
    node_id = str(node.get("id") or "")
    reasons = set(why_by_node.get(node_id, set()))
    matches = [token for token in tokens if token in graph_node_text(node)]
    if matches:
        reasons.add(f"matches query terms: {', '.join(sorted(matches)[:4])}")
    if graph_risk_score(node) >= 0.75:
        reasons.add("high severity or score")
    if graph_gnn_score(node) > 0:
        reasons.add(f"GNN risk score {graph_gnn_score(node):.2f}")
    if pagerank.get(node_id, 0.0) > 0:
        reasons.add("ranked by PageRank over expanded graph")
    if seed_scores.get(node_id, 0.0) > 0:
        reasons.add("seed score contributed to ranking")
    return _copy_with_reasons(node, reasons)


def _with_edge_reasons(
    edge: dict[str, Any],
    intent: str,
    ranked_path_ids: set[str],
    path_by_id: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    reasons = {"connects selected graph evidence"}
    if _edge_matches_intent(edge, intent):
        reasons.add(f"preferred edge type for {intent}")
    edge_id = str(edge.get("id") or "")
    for path_id in ranked_path_ids:
        path = path_by_id.get(path_id, {})
        if edge_id and edge_id in set(safe_str_list(path.get("edge_ids"))):
            reasons.add("appears in recalled attack path")
            break
    return _copy_with_reasons(edge, reasons)


def _with_path_reasons(
    path: dict[str, Any],
    selected_node_ids: set[str],
    channels: dict[str, list[dict[str, Any]]],
    intent: str,
) -> dict[str, Any]:
    reasons = set()
    node_ids = set(safe_str_list(path.get("node_ids")))
    overlap = len(node_ids & selected_node_ids)
    if overlap:
        reasons.add(f"overlaps {overlap} selected graph nodes")
    channel_path_ids = _channel_path_ids(channels)
    if str(path.get("id") or "") in channel_path_ids:
        reasons.add("recalled by attack-path channel")
    if intent == "attack_path":
        reasons.add("matches attack-path intent")
    if safe_float(path.get("score")) > 0:
        reasons.add(f"path score {path.get('score')}")
    return _copy_with_reasons(path, reasons)


def _copy_with_reasons(item: dict[str, Any], reasons: set[str]) -> dict[str, Any]:
    selected = dict(item)
    existing = selected.get("why_selected")
    merged = [str(reason) for reason in existing] if isinstance(existing, list) else []
    for reason in sorted(reasons):
        if reason and reason not in merged:
            merged.append(reason)
    selected["why_selected"] = merged
    return selected


def _edge_matches_intent(edge: dict[str, Any], intent: str) -> bool:
    hints = INTENT_EDGE_HINTS.get(intent, ())
    if not hints:
        return False
    text = " ".join(
        str(edge.get(key) or "")
        for key in ("id", "type", "label", "reason", "description")
    ).upper()
    return any(hint.upper() in text for hint in hints)


def _channel_path_ids(channels: dict[str, list[dict[str, Any]]]) -> set[str]:
    return {
        str(item.get("id"))
        for item in channels.get("attack_path", [])
        if item.get("id")
    }
