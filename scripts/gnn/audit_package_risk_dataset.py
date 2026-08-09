"""训练前审计恶意包分类数据集，防止用失真的数据评估 GNN。"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[2]))

from scripts.gnn.dataset_utils import package_group_key
from scripts.gnn.held_out_packages import HELD_OUT_DEMO_PACKAGES
from supplyguard.gnn_features import LABEL_PROXY_KEYWORDS


PROVENANCE_PROXY_FEATURES = {
    "alias_count",
    "evidence_source_count",
    "evidence_text_length",
    "has_version",
    "text_length",
    "version_count",
}
FORBIDDEN_TRAINING_EDGE_TYPES = {"has_risk_signal", "in_ecosystem", "observed_in"}


def _parses_timestamp(value: Any) -> bool:
    text = str(value or "").strip()
    if not text:
        return False
    try:
        datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return False
    return True


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
    schema_features = {str(item) for item in schema.get("features", [])}
    schema_risk_keywords = {str(item).strip().lower() for item in schema.get("risk_keywords", [])}
    training_edge_types = {str(item) for item in schema.get("training_edge_types", [])}
    proxy_features = sorted(schema_features.intersection(PROVENANCE_PROXY_FEATURES))
    proxy_keywords = sorted(schema_risk_keywords.intersection(LABEL_PROXY_KEYWORDS))
    forbidden_training_edges = sorted(training_edge_types.intersection(FORBIDDEN_TRAINING_EDGE_TYPES))
    if proxy_features:
        warnings.append(f"训练特征包含数据来源或标注格式代理变量: {', '.join(proxy_features)}")
    if proxy_keywords:
        warnings.append(f"风险关键词包含标签同义词: {', '.join(proxy_keywords)}")
    if forbidden_training_edges:
        warnings.append(f"训练投影包含标签或来源代理关系: {', '.join(forbidden_training_edges)}")
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
    negative_review_tiers = Counter(
        str(node.get("review_tier") or "unreviewed").strip().lower()
        for node in package_nodes
        if int(node.get("label") or 0) == 0
    )
    unreviewed_negatives = sum(
        int(node.get("label") or 0) == 0
        and str(node.get("review_tier") or "").strip().lower()
        not in {"explicit_curated", "dependency_closure"}
        for node in package_nodes
    )
    if unreviewed_negatives:
        warnings.append(
            f"{unreviewed_negatives} 个负样本缺少 review_tier，正常包标签来源不可审计"
        )
    held_out_keys = {str(key).strip().casefold() for key in HELD_OUT_DEMO_PACKAGES}
    held_out_overlap = sorted(
        f"{str(node.get('ecosystem') or '')}:{str(node.get('package') or '')}"
        for node in package_nodes
        if (
            f"{str(node.get('ecosystem') or '').strip().lower()}:"
            f"{str(node.get('package') or '').strip().lower()}".casefold()
            in held_out_keys
        )
    )
    if held_out_overlap:
        warnings.append(
            "演示/验收包出现在训练数据中，验收存在循环验证: "
            + ", ".join(held_out_overlap)
        )
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
    negative_nodes = [node for node in package_nodes if int(node.get("label") or 0) == 0]
    pypi_negative_count = sum(
        str(node.get("ecosystem") or "").strip().lower() == "pypi"
        for node in negative_nodes
    )
    pypi_negative_coverage = pypi_negative_count / max(1, len(negative_nodes))
    negative_positive_ratio = label_counts.get(0, 0) / max(1, label_counts.get(1, 0))
    timestamped = sum(
        _parses_timestamp(
            node.get("published")
            or node.get("modified")
            or node.get("created")
            or node.get("timestamp")
        )
        for node in package_nodes
    )
    timestamp_coverage = timestamped / max(1, len(package_nodes))
    split_policy = str(schema.get("split_policy") or "").strip().lower()
    if negative_positive_ratio < 1.0:
        warnings.append(f"负/正样本比 {negative_positive_ratio:.2f} 低于 1.0，需要补充更多独立正常包")
    if pypi_negative_coverage < 0.25:
        warnings.append(f"PyPI 负样本占比 {pypi_negative_coverage:.1%} 低于 25%，缺少独立 PyPI 正常包")
    if timestamp_coverage < 0.95:
        warnings.append(f"时间戳覆盖率 {timestamp_coverage:.1%} 低于 95%，无法进行可靠的时间外推评估")
    if split_policy != "time":
        warnings.append("切分策略不是时间外推（split_policy != time），评估可能泄漏未来信息")
    positive_nodes = [node for node in package_nodes if int(node.get("label") or 0) == 1]
    positive_metadata_present = sum(
        bool(
            node.get("maintainers")
            or node.get("repository")
            or node.get("license")
            or node.get("dependencies")
        )
        for node in positive_nodes
    )
    positive_metadata_coverage = positive_metadata_present / max(1, len(positive_nodes))
    if positive_metadata_coverage < 0.3:
        warnings.append(
            f"正样本元数据覆盖率 {positive_metadata_coverage:.1%} 低于 30%，"
            "生态特征可能退化为来源代理"
        )

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
        "negative_positive_ratio": round(negative_positive_ratio, 6),
        "pypi_negative_count": pypi_negative_count,
        "pypi_negative_coverage": round(pypi_negative_coverage, 6),
        "timestamp_coverage": round(timestamp_coverage, 6),
        "positive_metadata_coverage": round(positive_metadata_coverage, 6),
        "split_policy": split_policy,
        "split_stats": split_stats,
        "split_overlap_ids": sorted(set(overlaps)),
        "split_overlap_groups": sorted(set(group_overlaps)),
        "label_source_counts": dict(
            Counter(str(node.get("label_source") or "unknown") for node in package_nodes)
        ),
        "low_confidence_label_count": low_confidence_labels,
        "trusted_negative_count": len(trusted_negative_nodes),
        "negative_review_tiers": dict(negative_review_tiers),
        "held_out_package_overlap": held_out_overlap,
        "hard_negative_count": len(hard_negative_nodes),
        "trusted_hard_negative_count": len(trusted_hard_negative_nodes),
        "node_type_counts": dict(node_type_counts),
        "edge_counts": dict(edge_type_counts),
        "heterogeneous_relation_coverage": {
            relation: edge_type_counts.get(relation, 0)
            for relation in sorted(heterogeneous_relations)
        },
        "dependency_edge_count": len(dependency_edges),
        "label_leakage_checks": {
            "proxy_features": proxy_features,
            "proxy_keywords": proxy_keywords,
            "forbidden_training_edge_types": forbidden_training_edges,
            "passed": not proxy_features and not proxy_keywords and not forbidden_training_edges,
        },
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
