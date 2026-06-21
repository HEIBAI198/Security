from __future__ import annotations

from typing import Any

from .graph_rag_retrievers import raw_properties


def build_evidence_table(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    paths: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    table: list[dict[str, Any]] = []
    for node in nodes:
        raw = raw_properties(node)
        row = {
            "kind": "node",
            "id": node.get("id"),
            "label": node.get("label"),
            "type": node.get("type"),
            "risk": node.get("risk"),
            "score": node.get("score"),
            "gnn_score": raw.get("gnn_score"),
            "summary": node.get("description"),
            "why_selected": list(node.get("why_selected") or []),
        }
        table.append(row)

    for edge in edges:
        row = {
            "kind": "edge",
            "id": edge.get("id"),
            "source": edge.get("source"),
            "target": edge.get("target"),
            "type": edge.get("type"),
            "summary": edge.get("reason") or edge.get("label") or edge.get("description"),
            "why_selected": list(edge.get("why_selected") or []),
        }
        table.append(row)

    for path in paths:
        row = {
            "kind": "attack_path",
            "id": path.get("id"),
            "title": path.get("title"),
            "score": path.get("score"),
            "summary": path.get("description") or path.get("conclusion"),
            "node_ids": list(path.get("node_ids") or []),
            "edge_ids": list(path.get("edge_ids") or []),
            "why_selected": list(path.get("why_selected") or []),
        }
        table.append(row)
    return table


def find_missing_evidence(
    intent: str,
    nodes: list[dict[str, Any]],
    paths: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    missing: list[dict[str, Any]] = []
    node_text = " ".join(
        f"{node.get('id')} {node.get('label')} {node.get('type')} {node.get('description')}"
        for node in nodes
    ).lower()

    if intent == "dependency_risk" and not _contains_any(node_text, ("dependency", "package", "依赖", "包")):
        missing.append(
            {
                "kind": "dependency_evidence",
                "reason": "No dependency/package node was selected for a dependency-risk question.",
            }
        )
    if intent == "build_risk" and not _contains_any(node_text, ("ci", "build", "artifact", "provenance", "构建", "产物")):
        missing.append(
            {
                "kind": "build_evidence",
                "reason": "No CI/build/artifact/provenance node was selected for a build-risk question.",
            }
        )
    if intent == "runtime_evidence" and not _contains_any(node_text, ("runtime", "log", "event", "egress", "运行", "日志", "外联")):
        missing.append(
            {
                "kind": "runtime_evidence",
                "reason": "No runtime/log/event node was selected for a runtime-evidence question.",
            }
        )
    if intent == "attack_path" and not paths:
        missing.append(
            {
                "kind": "attack_path",
                "reason": "No attack path overlapped the selected evidence.",
            }
        )
    if not nodes:
        missing.append(
            {
                "kind": "graph_evidence",
                "reason": "No graph nodes were selected for this query.",
            }
        )
    return missing


def build_graph_rag_context(
    evidence_table: list[dict[str, Any]],
    missing_evidence: list[dict[str, Any]],
    retrieval_trace: list[dict[str, Any]],
) -> str:
    lines = ["GraphRAG context:"]
    nodes = [row for row in evidence_table if row.get("kind") == "node"]
    edges = [row for row in evidence_table if row.get("kind") == "edge"]
    paths = [row for row in evidence_table if row.get("kind") == "attack_path"]

    if nodes:
        lines.append("Top nodes:")
        for row in nodes:
            gnn_text = f", gnn_score={row.get('gnn_score')}" if row.get("gnn_score") is not None else ""
            why = "; ".join(str(item) for item in row.get("why_selected", [])[:3])
            why_text = f" why={why}" if why else ""
            lines.append(
                f"- {row.get('label')} [{row.get('type')}, risk={row.get('risk')}, score={row.get('score')}{gnn_text}]: {row.get('summary')}{why_text}"
            )
    if edges:
        lines.append("Top edges:")
        for row in edges:
            why = "; ".join(str(item) for item in row.get("why_selected", [])[:2])
            why_text = f" why={why}" if why else ""
            lines.append(
                f"- {row.get('source')} -[{row.get('type')}]-> {row.get('target')}: {row.get('summary')}{why_text}"
            )
    if paths:
        lines.append("Attack paths:")
        for row in paths:
            why = "; ".join(str(item) for item in row.get("why_selected", [])[:2])
            why_text = f" why={why}" if why else ""
            lines.append(
                f"- {row.get('title')} (score={row.get('score')}): {row.get('summary')}{why_text}"
            )
    if missing_evidence:
        lines.append("Missing evidence:")
        for item in missing_evidence:
            lines.append(f"- {item.get('kind')}: {item.get('reason')}")
    if retrieval_trace:
        channel_trace = next((item for item in retrieval_trace if item.get("stage") == "channels"), None)
        if channel_trace:
            lines.append(
                "Retrieval trace: "
                f"keyword={channel_trace.get('keyword', 0)}, "
                f"risk={channel_trace.get('risk', 0)}, "
                f"attack_path={channel_trace.get('attack_path', 0)}, "
                f"embedding={channel_trace.get('embedding', 0)}"
            )
    return "\n".join(lines)


def _contains_any(text: str, needles: tuple[str, ...]) -> bool:
    return any(needle in text for needle in needles)
