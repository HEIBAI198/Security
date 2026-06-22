from __future__ import annotations

import argparse
import json
import pickle
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[2]))


GRAPH_FEATURES = [
    "graph_degree",
    "graph_risk_signal_degree",
    "graph_observed_in_degree",
    "graph_ecosystem_degree",
]


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        payload = json.loads(line)
        if isinstance(payload, dict):
            records.append(payload)
    return records


def _graph_feature_map(edges: list[dict[str, Any]]) -> dict[str, dict[str, float]]:
    counters: dict[str, Counter[str]] = defaultdict(Counter)
    for edge in edges:
        source = str(edge.get("source") or "")
        edge_type = str(edge.get("type") or "")
        if not source.startswith("pkg:") or not edge_type:
            continue
        counters[source]["graph_degree"] += 1
        if edge_type == "has_risk_signal":
            counters[source]["graph_risk_signal_degree"] += 1
        elif edge_type == "observed_in":
            counters[source]["graph_observed_in_degree"] += 1
        elif edge_type == "in_ecosystem":
            counters[source]["graph_ecosystem_degree"] += 1

    return {
        node_id: {feature: float(counter.get(feature, 0)) for feature in GRAPH_FEATURES}
        for node_id, counter in counters.items()
    }


def _matrix_from_nodes(
    nodes: list[dict[str, Any]],
    feature_names: list[str],
    graph_features: dict[str, dict[str, float]],
) -> tuple[np.ndarray, np.ndarray, list[str]]:
    full_feature_names = [*feature_names, *GRAPH_FEATURES]
    rows: list[list[float]] = []
    labels: list[int] = []
    node_ids: list[str] = []
    for node in nodes:
        node_id = str(node.get("id") or "")
        features = node.get("features")
        if not node_id or not isinstance(features, dict):
            continue
        graph_values = graph_features.get(node_id, {})
        row = [
            float(features.get(feature, 0.0) or 0.0)
            for feature in feature_names
        ]
        row.extend(float(graph_values.get(feature, 0.0) or 0.0) for feature in GRAPH_FEATURES)
        rows.append(row)
        labels.append(int(node.get("label") or 0))
        node_ids.append(node_id)

    return np.asarray(rows, dtype=np.float32), np.asarray(labels, dtype=np.int64), node_ids


def _split_data(
    features: np.ndarray, labels: np.ndarray, random_state: int
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, str]:
    class_counts = Counter(int(label) for label in labels)
    if len(labels) >= 8 and len(class_counts) == 2 and min(class_counts.values()) >= 2:
        return (*train_test_split(
            features,
            labels,
            test_size=0.25,
            random_state=random_state,
            stratify=labels,
        ), "holdout")
    return features, features, labels, labels, "training"


def _metrics(labels: np.ndarray, predictions: np.ndarray, probabilities: np.ndarray) -> dict[str, float]:
    metrics = {
        "accuracy": float(accuracy_score(labels, predictions)),
        "precision": float(precision_score(labels, predictions, zero_division=0)),
        "recall": float(recall_score(labels, predictions, zero_division=0)),
        "f1": float(f1_score(labels, predictions, zero_division=0)),
    }
    if len(set(int(label) for label in labels)) == 2:
        try:
            metrics["roc_auc"] = float(roc_auc_score(labels, probabilities))
        except ValueError:
            metrics["roc_auc"] = 0.0
    else:
        metrics["roc_auc"] = 0.0
    return metrics


def train_package_risk(
    data_dir: str | Path,
    output_dir: str | Path,
    random_state: int = 42,
) -> dict[str, Any]:
    data_path = Path(data_dir)
    output_path = Path(output_dir)
    schema = _read_json(data_path / "feature_schema.json")
    feature_names = [str(feature) for feature in schema.get("features", [])]
    nodes = _read_jsonl(data_path / "train_nodes.jsonl")
    edges = _read_jsonl(data_path / "train_edges.jsonl")

    graph_features = _graph_feature_map(edges)
    features, labels, node_ids = _matrix_from_nodes(nodes, feature_names, graph_features)
    if len(features) == 0 or len(set(labels.tolist())) < 2:
        raise ValueError("training data must include at least one positive and one negative sample")

    train_x, test_x, train_y, test_y, evaluation = _split_data(features, labels, random_state)
    model = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            (
                "classifier",
                LogisticRegression(
                    class_weight="balanced",
                    max_iter=1000,
                    random_state=random_state,
                ),
            ),
        ]
    )
    model.fit(train_x, train_y)
    predictions = model.predict(test_x)
    probabilities = model.predict_proba(test_x)[:, 1]

    full_feature_names = [*feature_names, *GRAPH_FEATURES]
    metrics = {
        **_metrics(test_y, predictions, probabilities),
        "samples": int(len(features)),
        "positive_samples": int(np.sum(labels == 1)),
        "negative_samples": int(np.sum(labels == 0)),
        "evaluation": evaluation,
        "model_type": "sklearn_logistic_regression_graph_features",
    }

    output_path.mkdir(parents=True, exist_ok=True)
    artifact = {
        "model": model,
        "feature_names": full_feature_names,
        "node_ids": node_ids,
        "model_type": metrics["model_type"],
    }
    with (output_path / "package_risk.pkl").open("wb") as handle:
        pickle.dump(artifact, handle)

    (output_path / "metrics.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    model_card = {
        "model_type": metrics["model_type"],
        "feature_names": full_feature_names,
        "training_samples": metrics["samples"],
        "positive_samples": metrics["positive_samples"],
        "negative_samples": metrics["negative_samples"],
        "notes": [
            "Lightweight graph-feature risk model for one-week demo scope.",
            "Uses package metadata features plus graph edge statistics.",
            "Torch/PyG GraphSAGE can replace this artifact when installed.",
        ],
    }
    (output_path / "model_card.json").write_text(
        json.dumps(model_card, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    return metrics


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Train a lightweight graph-feature package risk model."
    )
    parser.add_argument("--data", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--random-state", type=int, default=42)
    args = parser.parse_args()

    metrics = train_package_risk(args.data, args.output, random_state=args.random_state)
    print(json.dumps(metrics, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
