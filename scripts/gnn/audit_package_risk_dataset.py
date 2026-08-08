"""训练前审计恶意包分类数据集，防止用失真的数据评估 GNN。"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[2]))

from scripts.gnn.dataset_utils import package_group_key


def _read_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path} 必须是 JSON 对象")
    return payload


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        payload = json.loads(line)
        if not isinstance(payload, dict):
            raise ValueError(f"{path} 第 {line_number} 行不是 JSON 对象")
        records.append(payload)
    return records


def audit_dataset(
    data_dir: str | Path,
    *,
    max_positive_ratio: float = 0.8,
    min_negative_samples: int = 50,
    min_label_confidence: float = 0.7,
) -> dict[str, Any]:
    data_path = Path(data_dir)
    nodes = _read_jsonl(data_path / "train_nodes.jsonl")
    splits = _read_json(data_path / "splits.json")
    schema = _read_json(data_path / "feature_schema.json")
    edges_path = data_path / "train_edges.jsonl"
    edges = _read_jsonl(edges_path) if edges_path.exists() else []

    package_nodes = [
        node
        for node in nodes
        if node.get("type") in {None, "package"}
        and str(node.get("id") or "").startswith("pkg:")
    ]
    labels = [int(node.get("label") or 0) for node in package_nodes]
    label_counts = Counter(labels)
    ids = [str(node.get("id") or "") for node in package_nodes]
    groups = [package_group_key(node) for node in package_nodes]

    split_stats: dict[str, Any] = {}
    split_owner: dict[str, str] = {}
    split_group_owner: dict[str, str] = {}
    overlaps: list[str] = []
    group_overlaps: list[str] = []
    by_id = {str(node.get("id") or ""): node for node in package_nodes}
    for split_name in ("train", "val", "test"):
        split_ids = [str(node_id) for node_id in splits.get(split_name, [])]
        split_nodes = [by_id[node_id] for node_id in split_ids if node_id in by_id]
        split_labels = [int(node.get("label") or 0) for node in split_nodes]
        split_stats[split_name] = {
            "samples": len(split_nodes),
            "positive_samples": sum(label == 1 for label in split_labels),
            "negative_samples": sum(label == 0 for label in split_labels),
            "positive_ratio": round(sum(label == 1 for label in split_labels) / max(1, len(split_nodes)), 6),
        }
        for node_id in split_ids:
            if node_id in split_owner and split_owner[node_id] != split_name:
                overlaps.append(node_id)
            split_owner[node_id] = split_name
        for node in split_nodes:
            group = package_group_key(node)
            if group in split_group_owner and split_group_owner[group] != split_name:
                group_overlaps.append(group)
            split_group_owner[group] = split_name

    warnings: list[str] = []
    positive_ratio = label_counts.get(1, 0) / max(1, len(package_nodes))
    if positive_ratio > float(max_positive_ratio):
        warnings.append(
            f"正样本占比 {positive_ratio:.1%} 高于 {float(max_positive_ratio):.1%}，需要补充独立正常包"
        )
    if label_counts.get(0, 0) < int(min_negative_samples):
        warnings.append(f"负样本只有 {label_counts.get(0, 0)} 条，低于建议下限 {int(min_negative_samples)}")
    if len(ids) != len(set(ids)):
        warnings.append("节点 ID 重复，可能造成同一包被重复计权")
    if overlaps:
        warnings.append(f"发现 {len(set(overlaps))} 个节点跨数据集重复")
    if group_overlaps:
        warnings.append(f"发现 {len(set(group_overlaps))} 个规范化包名跨数据集重复")
    missing_label_source = sum(
        not str(node.get("label_source") or "").strip() or str(node.get("label_source")) == "unknown"
        for node in package_nodes
    )
    if missing_label_source:
        warnings.append(f"{missing_label_source} 个节点缺少可信标签来源")
    low_confidence_labels = sum(
        float(node.get("label_confidence") or 0.0) < float(min_label_confidence)
        for node in package_nodes
    )
    if low_confidence_labels:
        warnings.append(
            f"{low_confidence_labels} 个节点的标签置信度低于 {float(min_label_confidence):.0%}，需要人工或可信数据源复核"
        )
    trusted_negative_nodes = [
        node
        for node in package_nodes
        if int(node.get("label") or 0) == 0
        and float(node.get("label_confidence") or 0.0) >= float(min_label_confidence)
        and not any(
            marker in str(node.get("label_source") or "").strip().lower()
            for marker in ("unverified", "weak", "local_dependency_baseline")
        )
    ]
    if label_counts.get(0, 0) and not trusted_negative_nodes:
        warnings.append("没有独立来源或人工复核的高置信正常包，禁止用弱负样本替代 ecosystem negatives")
    missing_timestamp = sum(
        not str(
            node.get("published")
            or node.get("modified")
            or node.get("created")
            or node.get("timestamp")
            or ""
        ).strip()
        for node in package_nodes
    )
    if missing_timestamp:
        warnings.append(f"{missing_timestamp} 个节点缺少发布时间，当前只能做分组切分，不能做时间外推评估")
    dependency_edges = [edge for edge in edges if edge.get("type") == "depends_on"]
    if not dependency_edges:
        warnings.append("没有 depends_on 真实依赖边，图模型只能学习共享信号关系")

    node_type_counts = Counter(str(node.get("type") or "unknown") for node in nodes)
    edge_type_counts = Counter(str(edge.get("type") or "unknown") for edge in edges)
    hard_negative_nodes = [node for node in package_nodes if bool(node.get("hard_negative"))]
    trusted_hard_negative_nodes = [
        node
        for node in hard_negative_nodes
        if float(node.get("label_confidence") or 0.0) >= float(min_label_confidence)
        and str(node.get("hard_negative_verification") or "") == "trusted_normal_source"
    ]
    heterogeneous_relations = {
        "declares_dependency",
        "maintained_by",
        "sourced_from",
        "runs_install_script",
        "has_risk_signal",
    }

    return {
        "task": str(schema.get("task") or "unknown"),
        "schema_version": schema.get("schema_version"),
        "samples": len(package_nodes),
        "label_counts": {"positive": label_counts.get(1, 0), "negative": label_counts.get(0, 0)},
        "positive_ratio": round(positive_ratio, 6),
        "split_stats": split_stats,
        "split_overlap_ids": sorted(set(overlaps)),
        "split_overlap_groups": sorted(set(group_overlaps)),
        "label_source_counts": dict(
            Counter(str(node.get("label_source") or "unknown") for node in package_nodes)
        ),
        "low_confidence_label_count": low_confidence_labels,
        "trusted_negative_count": len(trusted_negative_nodes),
        "hard_negative_count": len(hard_negative_nodes),
        "trusted_hard_negative_count": len(trusted_hard_negative_nodes),
        "node_type_counts": dict(node_type_counts),
        "edge_counts": dict(edge_type_counts),
        "heterogeneous_relation_coverage": {
            relation: edge_type_counts.get(relation, 0)
            for relation in sorted(heterogeneous_relations)
        },
        "dependency_edge_count": len(dependency_edges),
        "warnings": warnings,
        "ready_for_training": not warnings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="审计恶意包 GNN 数据集质量")
    parser.add_argument("--data", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--max-positive-ratio", type=float, default=0.8)
    parser.add_argument("--min-negative-samples", type=int, default=50)
    parser.add_argument("--min-label-confidence", type=float, default=0.7)
    parser.add_argument("--fail-on-warning", action="store_true")
    args = parser.parse_args()
    report = audit_dataset(
        args.data,
        max_positive_ratio=args.max_positive_ratio,
        min_negative_samples=args.min_negative_samples,
        min_label_confidence=args.min_label_confidence,
    )
    output = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output + "\n", encoding="utf-8")
    print(output)
    return 2 if args.fail_on_warning and report["warnings"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
