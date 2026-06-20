from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Iterable

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[2]))

from scripts.gnn.dataset_utils import grouped_train_val_test_split


FEATURE_NAMES = [
    "ecosystem_npm",
    "ecosystem_pypi",
    "name_length",
    "name_separator_count",
    "has_scope",
    "has_digits",
    "version_count",
    "alias_count",
    "evidence_source_count",
    "risk_keyword_count",
    "text_length",
]

RISK_KEYWORDS = [
    "postinstall",
    "exfiltrat",
    "token",
    "credential",
    "backdoor",
    "malware",
    "download",
    "powershell",
    "eval",
    "obfuscat",
]


def _read_jsonl(path: str | Path | None) -> list[dict[str, Any]]:
    if path is None:
        return []
    jsonl_path = Path(path)
    if not jsonl_path.exists():
        return []
    records: list[dict[str, Any]] = []
    for line in jsonl_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        payload = json.loads(line)
        if isinstance(payload, dict):
            records.append(payload)
    return records


def _negative_paths(path_or_paths: str | Path | Iterable[str | Path] | None) -> list[Path]:
    if path_or_paths is None:
        return []
    if isinstance(path_or_paths, (str, Path)):
        return [Path(path_or_paths)]
    return [Path(path) for path in path_or_paths]


def _read_many_jsonl(paths: Iterable[str | Path]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for path in paths:
        records.extend(_read_jsonl(path))
    return records


def _package_id(ecosystem: str, package: str) -> str:
    return f"pkg:{ecosystem}:{package}"


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _risk_signals(text: str) -> list[str]:
    lowered = text.lower()
    return sorted({keyword for keyword in RISK_KEYWORDS if keyword in lowered})


def _source_signal(source: str) -> str | None:
    normalized = source.replace("\\", "/").lower()
    if "requirements" in normalized:
        return "requirements"
    if "package-lock" in normalized or normalized.endswith("package.json"):
        return "npm_manifest"
    if normalized.endswith(".cdx.json") or "sbom" in normalized:
        return "sbom"
    return None


def _features(record: dict[str, Any]) -> dict[str, float]:
    ecosystem = str(record.get("ecosystem") or "").lower()
    package = str(record.get("package") or "").lower()
    versions = _as_list(record.get("affected_versions")) or _as_list(record.get("versions"))
    aliases = _as_list(record.get("aliases"))
    evidence_sources = _as_list(record.get("evidence_sources"))
    text = str(record.get("text") or " ".join(str(item) for item in evidence_sources))
    signals = _risk_signals(text)

    return {
        "ecosystem_npm": 1.0 if ecosystem == "npm" else 0.0,
        "ecosystem_pypi": 1.0 if ecosystem == "pypi" else 0.0,
        "name_length": float(len(package)),
        "name_separator_count": float(package.count("-") + package.count("_") + package.count(".")),
        "has_scope": 1.0 if package.startswith("@") else 0.0,
        "has_digits": 1.0 if any(char.isdigit() for char in package) else 0.0,
        "version_count": float(len(versions)),
        "alias_count": float(len(aliases)),
        "evidence_source_count": float(len(evidence_sources)),
        "risk_keyword_count": float(len(signals)),
        "text_length": float(len(text)),
    }


def _node_from_record(record: dict[str, Any]) -> dict[str, Any] | None:
    ecosystem = str(record.get("ecosystem") or "").lower()
    package = str(record.get("package") or "").lower()
    if ecosystem not in {"npm", "pypi"} or not package:
        return None
    return {
        "id": _package_id(ecosystem, package),
        "type": "package",
        "ecosystem": ecosystem,
        "package": package,
        "raw_package": str(record.get("raw_package") or package),
        "label": int(record.get("label") or 0),
        "features": _features(record),
    }


def _edges_from_record(record: dict[str, Any]) -> list[dict[str, Any]]:
    ecosystem = str(record.get("ecosystem") or "").lower()
    package = str(record.get("package") or "").lower()
    if ecosystem not in {"npm", "pypi"} or not package:
        return []

    source_id = _package_id(ecosystem, package)
    edges = [
        {
            "source": source_id,
            "target": f"ecosystem:{ecosystem}",
            "type": "in_ecosystem",
            "weight": 1.0,
        }
    ]

    text = str(record.get("text") or "")
    for signal in _risk_signals(text):
        edges.append(
            {
                "source": source_id,
                "target": f"signal:{signal}",
                "type": "has_risk_signal",
                "weight": 1.0,
            }
        )

    for evidence_source in _as_list(record.get("evidence_sources")):
        signal = _source_signal(str(evidence_source))
        if signal is not None:
            edges.append(
                {
                    "source": source_id,
                    "target": f"source:{signal}",
                    "type": "observed_in",
                    "weight": 0.5,
                }
            )

    return edges


def _merge_records(records: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: dict[tuple[str, str], dict[str, Any]] = {}
    for record in records:
        ecosystem = str(record.get("ecosystem") or "").lower()
        package = str(record.get("package") or "").lower()
        key = (ecosystem, package)
        if not ecosystem or not package:
            continue
        if key not in merged or int(record.get("label") or 0) == 1:
            merged[key] = record
    return [merged[key] for key in sorted(merged)]


def build_graph_features(
    positive_path: str | Path | None,
    negative_path: str | Path | Iterable[str | Path] | None,
    output_dir: str | Path,
) -> dict[str, Any]:
    positives = _read_jsonl(positive_path)
    negative_paths = _negative_paths(negative_path)
    negatives = _read_many_jsonl(negative_paths)
    records = _merge_records([*positives, *negatives])

    nodes = [node for record in records if (node := _node_from_record(record))]
    edges: list[dict[str, Any]] = []
    seen_edges: set[tuple[str, str, str]] = set()
    for record in records:
        for edge in _edges_from_record(record):
            key = (edge["source"], edge["target"], edge["type"])
            if key in seen_edges:
                continue
            seen_edges.add(key)
            edges.append(edge)

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    with (output_path / "train_nodes.jsonl").open("w", encoding="utf-8", newline="\n") as handle:
        for node in sorted(nodes, key=lambda item: item["id"]):
            handle.write(json.dumps(node, ensure_ascii=False, sort_keys=True))
            handle.write("\n")
    with (output_path / "train_edges.jsonl").open("w", encoding="utf-8", newline="\n") as handle:
        for edge in sorted(edges, key=lambda item: (item["source"], item["target"], item["type"])):
            handle.write(json.dumps(edge, ensure_ascii=False, sort_keys=True))
            handle.write("\n")

    schema = {"features": FEATURE_NAMES, "risk_keywords": RISK_KEYWORDS}
    (output_path / "feature_schema.json").write_text(
        json.dumps(schema, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    package_nodes = [node for node in nodes if node.get("type") == "package"]
    splits = grouped_train_val_test_split(package_nodes)
    (output_path / "splits.json").write_text(
        json.dumps(splits, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    split_counts = {split_name: len(node_ids) for split_name, node_ids in splits.items()}
    negative_sources = [str(path) for path in negative_paths]
    dataset_card = {
        "positive_records": len(positives),
        "negative_records": len(negatives),
        "node_count": len(nodes),
        "edge_count": len(edges),
        "negative_sources": negative_sources,
        "split_counts": split_counts,
        "created_by": "scripts/gnn/build_graph_features.py",
    }
    (output_path / "dataset_card.json").write_text(
        json.dumps(dataset_card, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    stats = {
        "positive_records": len(positives),
        "negative_records": len(negatives),
        "package_nodes": len(nodes),
        "edges": len(edges),
        "node_count": len(nodes),
        "edge_count": len(edges),
        "negative_sources": negative_sources,
        "split_counts": split_counts,
    }
    (output_path / "stats.json").write_text(
        json.dumps(stats, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    return stats


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build package graph nodes, edges, and feature schema for risk training."
    )
    parser.add_argument("--positive", type=Path)
    parser.add_argument("--negative", action="append", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    stats = build_graph_features(args.positive, args.negative, args.output)
    print(json.dumps(stats, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
