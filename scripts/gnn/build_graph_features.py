from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[2]))

from scripts.gnn.dataset_utils import grouped_time_train_val_test_split, grouped_train_val_test_split


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
    "preinstall",
    "install script",
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
        raise FileNotFoundError(jsonl_path)
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


def _entity_id(entity_type: str, value: Any) -> str:
    serialized = json.dumps(value, ensure_ascii=False, sort_keys=True) if isinstance(value, (dict, list)) else str(value)
    digest = hashlib.sha256(serialized.casefold().encode("utf-8")).hexdigest()[:16]
    return f"{entity_type}:{digest}"


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _dependency_values(record: dict[str, Any]) -> list[tuple[str, str]]:
    """读取不同采集器输出的依赖字段，并统一为生态系统和包名。"""
    ecosystem = str(record.get("ecosystem") or "").strip().lower()
    raw_dependencies = (
        _as_list(record.get("dependencies"))
        or _as_list(record.get("dependency_names"))
        or _as_list(record.get("requires"))
    )
    dependencies: list[tuple[str, str]] = []
    for dependency in raw_dependencies:
        dependency_ecosystem = ecosystem
        dependency_name = ""
        if isinstance(dependency, dict):
            dependency_ecosystem = str(
                dependency.get("ecosystem") or dependency.get("system") or ecosystem
            ).strip().lower()
            dependency_name = str(
                dependency.get("package")
                or dependency.get("name")
                or dependency.get("id")
                or ""
            ).strip()
        else:
            dependency_name = str(dependency or "").strip()
        if dependency_name.startswith("pkg:"):
            body = dependency_name[4:]
            if ":" in body:
                dependency_ecosystem, dependency_name = body.split(":", 1)
            elif "/" in body:
                dependency_ecosystem, dependency_name = body.split("/", 1)
        dependency_ecosystem = dependency_ecosystem.lower()
        dependency_name = dependency_name.strip().lower()
        version_separator = dependency_name.rfind("@")
        if version_separator > 0:
            dependency_name = dependency_name[:version_separator]
        if dependency_ecosystem in {"npm", "pypi"} and dependency_name:
            if dependency_ecosystem == "pypi":
                dependency_name = dependency_name.replace("_", "-").replace(".", "-")
            dependencies.append((dependency_ecosystem, dependency_name))
    return sorted(set(dependencies))


def _stable_unique(values: Iterable[Any]) -> list[Any]:
    unique_values: list[Any] = []
    seen: set[str] = set()
    for value in values:
        try:
            key = json.dumps(value, ensure_ascii=False, sort_keys=True)
        except TypeError:
            key = str(value)
        if key in seen:
            continue
        seen.add(key)
        unique_values.append(value)
    return unique_values


def _unique_field_values(
    existing: dict[str, Any],
    incoming: dict[str, Any],
    field_name: str,
) -> list[Any]:
    return _stable_unique(
        [
            *_as_list(existing.get(field_name)),
            *_as_list(incoming.get(field_name)),
        ]
    )


def _text_snippets(value: Any) -> list[str]:
    text = str(value or "").strip()
    if not text:
        return []
    return [snippet.strip() for snippet in text.splitlines() if snippet.strip()]


def _combined_text(existing: dict[str, Any], incoming: dict[str, Any]) -> str:
    return "\n".join(
        _stable_unique(
            [
                *_text_snippets(existing.get("text")),
                *_text_snippets(incoming.get("text")),
            ]
        )
    )


def _is_missing_value(value: Any) -> bool:
    return value is None or value == "" or value == () or value == []


def _risk_signals(text: str) -> list[str]:
    lowered = text.lower()
    return sorted({keyword for keyword in RISK_KEYWORDS if keyword in lowered})


def _record_text(record: dict[str, Any]) -> str:
    values = [
        record.get("text"),
        record.get("description"),
        record.get("keywords"),
        record.get("install_scripts"),
        record.get("scripts"),
    ]
    return " ".join(
        json.dumps(value, ensure_ascii=False, sort_keys=True)
        if isinstance(value, (dict, list))
        else str(value or "")
        for value in values
    )


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
    text = _record_text(record) or " ".join(str(item) for item in evidence_sources)
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
    node = {
        "id": _package_id(ecosystem, package),
        "type": "package",
        "ecosystem": ecosystem,
        "package": package,
        "raw_package": str(record.get("raw_package") or package),
        "label": int(record.get("label") or 0),
        "label_source": str(record.get("label_source") or record.get("source") or "unknown"),
        "label_confidence": float(record.get("label_confidence") or 0.0),
        "hard_negative": bool(record.get("hard_negative")),
        "hard_negative_weight": float(record.get("hard_negative_weight") or 1.0),
        "published": str(record.get("published") or ""),
        "modified": str(record.get("modified") or ""),
        "created": str(record.get("created") or ""),
        "features": _features(record),
    }
    # Keep provenance and package metadata on graph nodes for audit, review,
    # and future feature extraction. These fields are intentionally optional.
    for field_name in (
        "version",
        "latest_version",
        "versions",
        "dependencies",
        "maintainers",
        "repository",
        "homepage",
        "license",
        "install_scripts",
        "scripts",
        "metadata_source",
        "hard_negative_reasons",
        "hard_negative_verification",
    ):
        value = record.get(field_name)
        if not _is_missing_value(value):
            node[field_name] = value
    return node


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

    text = _record_text(record)
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

    for dependency_ecosystem, dependency_name in _dependency_values(record):
        edges.append(
            {
                "source": source_id,
                "target": _package_id(dependency_ecosystem, dependency_name),
                "type": "depends_on",
                "weight": 1.0,
            }
        )

    return edges


def _repository_value(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("url") or value.get("web") or value.get("type") or "").strip()
    if isinstance(value, list):
        for item in value:
            candidate = _repository_value(item)
            if candidate:
                return candidate
        return ""
    return str(value or "").strip()


def _maintainer_values(value: Any) -> list[dict[str, str]]:
    maintainers: list[dict[str, str]] = []
    for item in _as_list(value):
        if isinstance(item, dict):
            name = str(item.get("name") or item.get("username") or "").strip()
            email = str(item.get("email") or "").strip()
        else:
            name, email = str(item or "").strip(), ""
        if name or email:
            maintainers.append({"name": name, "email": email})
    return maintainers


def _install_script_values(record: dict[str, Any]) -> list[tuple[str, str]]:
    scripts = record.get("install_scripts") or record.get("scripts") or {}
    if isinstance(scripts, list):
        merged: dict[str, str] = {}
        for item in scripts:
            if isinstance(item, dict):
                merged.update({str(key): str(value) for key, value in item.items()})
        scripts = merged
    if not isinstance(scripts, dict):
        return []
    return sorted(
        (str(name), str(command))
        for name, command in scripts.items()
        if str(name) in {"preinstall", "install", "postinstall"} and str(command).strip()
    )


def _entity_nodes_and_edges(record: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    ecosystem = str(record.get("ecosystem") or "").lower()
    package = str(record.get("package") or "").lower()
    if ecosystem not in {"npm", "pypi"} or not package:
        return [], []
    package_id = _package_id(ecosystem, package)
    nodes: list[dict[str, Any]] = [
        {"id": f"ecosystem:{ecosystem}", "type": "ecosystem", "name": ecosystem}
    ]
    edges: list[dict[str, Any]] = []

    for signal in _risk_signals(_record_text(record)):
        signal_id = f"signal:{signal}"
        nodes.append({"id": signal_id, "type": "risk_signal", "name": signal})

    for evidence_source in _as_list(record.get("evidence_sources")):
        source_text = str(evidence_source or "").strip()
        source_kind = _source_signal(source_text)
        if not source_text or source_kind is None:
            continue
        nodes.append({"id": f"source:{source_kind}", "type": "evidence_source", "name": source_kind})
        project_id = _entity_id("project", source_text)
        nodes.append({"id": project_id, "type": "project", "path": source_text, "source_kind": source_kind})
        edges.extend(
            [
                {"source": package_id, "target": project_id, "type": "observed_in", "weight": 0.75},
                {"source": project_id, "target": package_id, "type": "declares_dependency", "weight": 1.0},
            ]
        )

    for maintainer in _maintainer_values(record.get("maintainers")):
        maintainer_id = _entity_id("maintainer", maintainer)
        nodes.append({"id": maintainer_id, "type": "maintainer", **maintainer})
        edges.append({"source": package_id, "target": maintainer_id, "type": "maintained_by", "weight": 0.75})

    repository = _repository_value(record.get("repository"))
    if repository:
        repository_id = _entity_id("repository", repository)
        nodes.append({"id": repository_id, "type": "repository", "url": repository})
        edges.append({"source": package_id, "target": repository_id, "type": "sourced_from", "weight": 0.75})

    for script_name, command in _install_script_values(record):
        script_id = _entity_id("install_script", {"package": package_id, "name": script_name, "command": command})
        nodes.append({"id": script_id, "type": "install_script", "name": script_name, "command": command})
        edges.append({"source": package_id, "target": script_id, "type": "runs_install_script", "weight": 1.0})

    return nodes, edges


def _merge_records(records: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: dict[tuple[str, str], dict[str, Any]] = {}
    for record in records:
        ecosystem = str(record.get("ecosystem") or "").lower()
        package = str(record.get("package") or "").lower()
        key = (ecosystem, package)
        if not ecosystem or not package:
            continue
        if key not in merged:
            merged[key] = record
        else:
            merged[key] = _merge_duplicate_record(merged[key], record)
    return [merged[key] for key in sorted(merged)]


def _merge_duplicate_record(
    existing: dict[str, Any],
    incoming: dict[str, Any],
) -> dict[str, Any]:
    existing_is_positive = int(existing.get("label") or 0) == 1
    incoming_is_positive = int(incoming.get("label") or 0) == 1
    preferred = incoming if incoming_is_positive and not existing_is_positive else existing
    secondary = existing if preferred is incoming else incoming
    merged = dict(preferred)

    for field_name, value in secondary.items():
        if field_name not in merged or _is_missing_value(merged[field_name]):
            merged[field_name] = value

    merged["label"] = 1 if existing_is_positive or incoming_is_positive else 0
    for field_name in (
        "evidence_sources",
        "versions",
        "affected_versions",
        "aliases",
        "dependencies",
        "dependency_names",
        "requires",
        "maintainers",
        "repository",
        "homepage",
        "license",
        "install_scripts",
        "scripts",
    ):
        values = _unique_field_values(existing, incoming, field_name)
        if values:
            merged[field_name] = values

    text = _combined_text(existing, incoming)
    if text:
        merged["text"] = text

    return merged


def build_graph_features(
    positive_path: str | Path | None,
    negative_path: str | Path | Iterable[str | Path] | None,
    output_dir: str | Path,
) -> dict[str, Any]:
    positives = _read_jsonl(positive_path)
    negative_paths = _negative_paths(negative_path)
    negatives = _read_many_jsonl(negative_paths)
    records = _merge_records([*positives, *negatives])

    package_nodes = [node for record in records if (node := _node_from_record(record))]
    package_ids = {str(node["id"]) for node in package_nodes}
    entity_nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, Any]] = []
    seen_edges: set[tuple[str, str, str]] = set()
    for record in records:
        record_entity_nodes, record_entity_edges = _entity_nodes_and_edges(record)
        for entity_node in record_entity_nodes:
            entity_nodes.setdefault(str(entity_node["id"]), entity_node)
        for edge in [*_edges_from_record(record), *record_entity_edges]:
            key = (edge["source"], edge["target"], edge["type"])
            if key in seen_edges:
                continue
            seen_edges.add(key)
            edges.append(edge)

    for edge in edges:
        if edge.get("type") != "depends_on":
            continue
        target = str(edge.get("target") or "")
        if target and target not in package_ids:
            _, ecosystem, package = target.split(":", 2)
            entity_nodes.setdefault(
                target,
                {
                    "id": target,
                    "type": "dependency_package",
                    "ecosystem": ecosystem,
                    "package": package,
                },
            )

    nodes = [*package_nodes, *entity_nodes.values()]

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

    schema = {
        "schema_version": 3,
        "task": "malicious_package",
        "label_definition": "1=经可信来源确认的恶意或高风险包，0=独立来源确认的正常包",
        "features": FEATURE_NAMES,
        "risk_keywords": RISK_KEYWORDS,
        "node_types": [
            "package",
            "dependency_package",
            "project",
            "maintainer",
            "repository",
            "install_script",
            "risk_signal",
            "evidence_source",
            "ecosystem",
        ],
        "edge_types": [
            "depends_on",
            "in_ecosystem",
            "has_risk_signal",
            "observed_in",
            "declares_dependency",
            "maintained_by",
            "sourced_from",
            "runs_install_script",
        ],
        "training_projection": "relation-aware package projection",
    }
    (output_path / "feature_schema.json").write_text(
        json.dumps(schema, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )
    splits = grouped_time_train_val_test_split(package_nodes)
    split_strategy = "label_stratified_chronological"
    if splits is None:
        splits = grouped_train_val_test_split(package_nodes)
        split_strategy = "normalized_package_group_random"
    (output_path / "splits.json").write_text(
        json.dumps(splits, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    split_counts = {split_name: len(node_ids) for split_name, node_ids in splits.items()}
    negative_sources = [str(path) for path in negative_paths]
    label_counts = {
        "positive": sum(1 for node in package_nodes if int(node.get("label") or 0) == 1),
        "negative": sum(1 for node in package_nodes if int(node.get("label") or 0) == 0),
    }
    dependency_edge_count = sum(1 for edge in edges if edge.get("type") == "depends_on")
    dataset_card = {
        "schema_version": 3,
        "task": "malicious_package",
        "label_definition": "1=经可信来源确认的恶意或高风险包，0=独立来源确认的正常包",
        "positive_records": len(positives),
        "negative_records": len(negatives),
        "label_counts": label_counts,
        "positive_ratio": round(label_counts["positive"] / max(1, len(package_nodes)), 6),
        "node_count": len(package_nodes),
        "total_node_count": len(nodes),
        "package_node_count": len(package_nodes),
        "node_type_counts": dict(Counter(str(node.get("type") or "unknown") for node in nodes)),
        "edge_count": len(edges),
        "edge_type_counts": dict(Counter(str(edge.get("type") or "unknown") for edge in edges)),
        "dependency_edge_count": dependency_edge_count,
        "hard_negative_count": sum(bool(node.get("hard_negative")) for node in package_nodes),
        "trusted_hard_negative_count": sum(
            bool(node.get("hard_negative"))
            and float(node.get("label_confidence") or 0.0) >= 0.7
            for node in package_nodes
        ),
        "negative_sources": negative_sources,
        "split_counts": split_counts,
        "split_strategy": split_strategy,
        "created_by": "scripts/gnn/build_graph_features.py",
    }
    (output_path / "dataset_card.json").write_text(
        json.dumps(dataset_card, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    stats = {
        "positive_records": len(positives),
        "negative_records": len(negatives),
        "package_nodes": len(package_nodes),
        "edges": len(edges),
        "node_count": len(package_nodes),
        "total_node_count": len(nodes),
        "node_type_counts": dict(Counter(str(node.get("type") or "unknown") for node in nodes)),
        "edge_count": len(edges),
        "edge_type_counts": dict(Counter(str(edge.get("type") or "unknown") for edge in edges)),
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
