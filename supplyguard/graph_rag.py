from __future__ import annotations

from typing import Any

from .graph_rag_context import (
    build_evidence_table,
    build_graph_rag_context,
    find_missing_evidence,
)
from .graph_rag_intent import classify_graph_rag_intent
from .graph_rag_ranker import rank_graph_rag_candidates
from .graph_rag_retrievers import retrieve_channels


def graph_rag_retrieve(
    graph_payload: dict[str, Any],
    query: str,
    *,
    max_nodes: int = 8,
    max_edges: int = 12,
    max_paths: int = 3,
    hops: int = 2,
) -> dict[str, Any]:
    intent = classify_graph_rag_intent(query)
    channels = retrieve_channels(graph_payload, query, intent=intent)
    ranked = rank_graph_rag_candidates(
        graph_payload,
        channels,
        query,
        intent,
        max_nodes=max_nodes,
        max_edges=max_edges,
        max_paths=max_paths,
        hops=hops,
    )
    ranked_nodes = ranked["top_nodes"]
    ranked_edges = ranked["top_edges"]
    ranked_paths = ranked["top_attack_paths"]
    retrieval_trace = ranked["retrieval_trace"]
    evidence_table = build_evidence_table(ranked_nodes, ranked_edges, ranked_paths)
    missing_evidence = find_missing_evidence(intent, ranked_nodes, ranked_paths)
    context = build_graph_rag_context(evidence_table, missing_evidence, retrieval_trace)

    return {
        "query": query,
        "intent": intent,
        "seed_node_ids": [item["id"] for item in ranked.get("seed_nodes", []) if item.get("id")],
        "expanded_node_ids": [item["id"] for item in ranked.get("expanded_nodes", []) if item.get("id")],
        "channels": channels,
        "top_nodes": ranked_nodes,
        "top_edges": ranked_edges,
        "top_attack_paths": ranked_paths,
        "evidence_table": evidence_table,
        "retrieval_trace": retrieval_trace,
        "missing_evidence": missing_evidence,
        "context": context,
        "explanation": {
            "method": "GraphRAG",
            "intent": intent,
            "seed_count": len(ranked.get("seed_nodes", [])),
            "hop_limit": hops,
            "ranking": "multi-channel recall + 2-hop graph expansion + PageRank + GNN score boost",
        },
    }
