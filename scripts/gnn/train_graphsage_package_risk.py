from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split

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


def _package_nodes(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [node for node in nodes if str(node.get("id") or "").startswith("pkg:")]


def _graph_feature_map(edges: list[dict[str, Any]]) -> dict[str, dict[str, float]]:
    counters: dict[str, Counter[str]] = defaultdict(Counter)
    for edge in edges:
        source = str(edge.get("source") or "")
        edge_type = str(edge.get("type") or "")
        if not source.startswith("pkg:"):
            continue
        counters[source]["graph_degree"] += 1
        if edge_type == "has_risk_signal":
            counters[source]["graph_risk_signal_degree"] += 1
        elif edge_type == "observed_in":
            counters[source]["graph_observed_in_degree"] += 1
        elif edge_type == "in_ecosystem":
            counters[source]["graph_ecosystem_degree"] += 1
    return {
        node_id: {name: float(counter.get(name, 0)) for name in GRAPH_FEATURES}
        for node_id, counter in counters.items()
    }


def _feature_matrix(
    nodes: list[dict[str, Any]],
    feature_names: list[str],
    graph_features: dict[str, dict[str, float]],
) -> tuple[np.ndarray, np.ndarray, list[str]]:
    rows: list[list[float]] = []
    labels: list[int] = []
    node_ids: list[str] = []
    full_features = [*feature_names, *GRAPH_FEATURES]
    for node in _package_nodes(nodes):
        node_id = str(node.get("id") or "")
        features = node.get("features")
        if not node_id or not isinstance(features, dict):
            continue
        graph_values = graph_features.get(node_id, {})
        row = [float(features.get(name, 0.0) or 0.0) for name in feature_names]
        row.extend(float(graph_values.get(name, 0.0) or 0.0) for name in GRAPH_FEATURES)
        rows.append(row)
        labels.append(int(node.get("label") or 0))
        node_ids.append(node_id)
    if not rows:
        return np.zeros((0, len(full_features)), dtype=np.float32), np.asarray([], dtype=np.int64), []
    return np.asarray(rows, dtype=np.float32), np.asarray(labels, dtype=np.int64), node_ids


def _adjacency(node_ids: list[str], edges: list[dict[str, Any]]) -> list[list[int]]:
    index = {node_id: idx for idx, node_id in enumerate(node_ids)}
    signal_neighbors: dict[str, list[int]] = defaultdict(list)
    source_neighbors: dict[str, list[int]] = defaultdict(list)

    for edge in edges:
        source = str(edge.get("source") or "")
        target = str(edge.get("target") or "")
        edge_type = str(edge.get("type") or "")
        if source not in index:
            continue
        if edge_type == "has_risk_signal":
            signal_neighbors[target].append(index[source])
        elif edge_type == "observed_in":
            source_neighbors[target].append(index[source])

    adjacency: list[set[int]] = [set() for _ in node_ids]
    for group in list(signal_neighbors.values()) + list(source_neighbors.values()):
        for left in group:
            for right in group:
                if left != right:
                    adjacency[left].add(right)

    return [sorted(items) for items in adjacency]


def _mean_neighbor_features(features: np.ndarray, adjacency: list[list[int]]) -> np.ndarray:
    aggregated = np.zeros_like(features)
    for idx, neighbors in enumerate(adjacency):
        if neighbors:
            aggregated[idx] = features[neighbors].mean(axis=0)
        else:
            aggregated[idx] = features[idx]
    return aggregated


def _standardize(features: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    mean = features.mean(axis=0)
    scale = features.std(axis=0)
    scale[scale == 0] = 1.0
    return (features - mean) / scale, mean, scale


def _sigmoid(values: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(values, -40, 40)))


def _train_network(
    features: np.ndarray,
    labels: np.ndarray,
    train_idx: np.ndarray,
    *,
    hidden_dim: int,
    epochs: int,
    learning_rate: float,
    random_state: int,
) -> dict[str, np.ndarray]:
    rng = np.random.default_rng(random_state)
    input_dim = features.shape[1]
    w1 = rng.normal(0.0, 0.08, size=(input_dim, hidden_dim)).astype(np.float32)
    b1 = np.zeros(hidden_dim, dtype=np.float32)
    w2 = rng.normal(0.0, 0.08, size=(hidden_dim, 1)).astype(np.float32)
    b2 = np.zeros(1, dtype=np.float32)

    train_y = labels[train_idx].astype(np.float32).reshape(-1, 1)
    positive = max(float(train_y.sum()), 1.0)
    negative = max(float(len(train_y) - train_y.sum()), 1.0)
    pos_weight = negative / positive

    for _ in range(epochs):
        x = features[train_idx]
        hidden_pre = x @ w1 + b1
        hidden = np.maximum(hidden_pre, 0.0)
        logits = hidden @ w2 + b2
        probs = _sigmoid(logits)
        weights = np.where(train_y == 1.0, pos_weight, 1.0)
        grad_logits = (probs - train_y) * weights / len(train_y)

        grad_w2 = hidden.T @ grad_logits
        grad_b2 = grad_logits.sum(axis=0)
        grad_hidden = grad_logits @ w2.T
        grad_hidden[hidden_pre <= 0] = 0.0
        grad_w1 = x.T @ grad_hidden
        grad_b1 = grad_hidden.sum(axis=0)

        w1 -= learning_rate * grad_w1
        b1 -= learning_rate * grad_b1
        w2 -= learning_rate * grad_w2
        b2 -= learning_rate * grad_b2

    return {"w1": w1, "b1": b1, "w2": w2, "b2": b2}


def _predict(features: np.ndarray, weights: dict[str, np.ndarray]) -> np.ndarray:
    hidden = np.maximum(features @ weights["w1"] + weights["b1"], 0.0)
    return _sigmoid(hidden @ weights["w2"] + weights["b2"]).reshape(-1)


def _split_indices(labels: np.ndarray, random_state: int) -> tuple[np.ndarray, np.ndarray, str]:
    indices = np.arange(len(labels))
    counts = Counter(int(label) for label in labels)
    if len(labels) >= 8 and len(counts) == 2 and min(counts.values()) >= 2:
        train_idx, test_idx = train_test_split(
            indices,
            test_size=0.25,
            random_state=random_state,
            stratify=labels,
        )
        return np.asarray(train_idx), np.asarray(test_idx), "holdout"
    return indices, indices, "training"


def _metrics(labels: np.ndarray, probs: np.ndarray) -> dict[str, float]:
    preds = (probs >= 0.5).astype(np.int64)
    result = {
        "accuracy": float(accuracy_score(labels, preds)),
        "precision": float(precision_score(labels, preds, zero_division=0)),
        "recall": float(recall_score(labels, preds, zero_division=0)),
        "f1": float(f1_score(labels, preds, zero_division=0)),
    }
    if len(set(int(label) for label in labels)) == 2:
        try:
            result["roc_auc"] = float(roc_auc_score(labels, probs))
        except ValueError:
            result["roc_auc"] = 0.0
    else:
        result["roc_auc"] = 0.0
    return result


def train_graphsage_package_risk(
    data_dir: str | Path,
    output_dir: str | Path,
    *,
    hidden_dim: int = 32,
    epochs: int = 80,
    learning_rate: float = 0.05,
    random_state: int = 42,
) -> dict[str, Any]:
    data_path = Path(data_dir)
    output_path = Path(output_dir)
    schema = _read_json(data_path / "feature_schema.json")
    feature_names = [str(item) for item in schema.get("features", [])]
    nodes = _read_jsonl(data_path / "train_nodes.jsonl")
    edges = _read_jsonl(data_path / "train_edges.jsonl")
    graph_features = _graph_feature_map(edges)
    raw_features, labels, node_ids = _feature_matrix(nodes, feature_names, graph_features)
    if len(raw_features) == 0 or len(set(labels.tolist())) < 2:
        raise ValueError("training data must include at least one positive and one negative package")

    adjacency = _adjacency(node_ids, edges)
    neighbor_features = _mean_neighbor_features(raw_features, adjacency)
    sage_features = np.concatenate([raw_features, neighbor_features], axis=1)
    features, mean, scale = _standardize(sage_features)
    train_idx, test_idx, evaluation = _split_indices(labels, random_state)
    weights = _train_network(
        features,
        labels,
        train_idx,
        hidden_dim=hidden_dim,
        epochs=epochs,
        learning_rate=learning_rate,
        random_state=random_state,
    )
    probs = _predict(features[test_idx], weights)
    metrics = {
        **_metrics(labels[test_idx], probs),
        "samples": int(len(labels)),
        "positive_samples": int(np.sum(labels == 1)),
        "negative_samples": int(np.sum(labels == 0)),
        "evaluation": evaluation,
        "epochs": int(epochs),
        "hidden_dim": int(hidden_dim),
        "model_type": "numpy_graphsage_mean_aggregator",
    }

    output_path.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        output_path / "package_risk_gnn.npz",
        w1=weights["w1"],
        b1=weights["b1"],
        w2=weights["w2"],
        b2=weights["b2"],
        mean=mean,
        scale=scale,
        feature_names=np.asarray([*feature_names, *GRAPH_FEATURES], dtype=np.str_),
        node_ids=np.asarray(node_ids, dtype=np.str_),
        raw_feature_dim=np.asarray([raw_features.shape[1]], dtype=np.int64),
    )
    (output_path / "graphsage_metrics.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    model_card = {
        "model_type": metrics["model_type"],
        "description": "Two-layer NumPy neural network over package features concatenated with mean neighbor features.",
        "feature_source": "self package features + mean aggregated graph-neighbor features",
        "training_samples": metrics["samples"],
        "positive_samples": metrics["positive_samples"],
        "negative_samples": metrics["negative_samples"],
        "notes": [
            "This is a lightweight GraphSAGE-style neural baseline for environments without torch.",
            "It uses graph neighborhood aggregation, but is not a PyTorch Geometric implementation.",
            "Use as a competition demo risk-ranking signal, not a production malicious package detector.",
        ],
    }
    (output_path / "graphsage_model_card.json").write_text(
        json.dumps(model_card, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    return metrics


def main() -> int:
    parser = argparse.ArgumentParser(description="Train a NumPy GraphSAGE-style package risk model.")
    parser.add_argument("--data", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--hidden-dim", type=int, default=32)
    parser.add_argument("--epochs", type=int, default=80)
    parser.add_argument("--learning-rate", type=float, default=0.05)
    parser.add_argument("--random-state", type=int, default=42)
    args = parser.parse_args()
    metrics = train_graphsage_package_risk(
        args.data,
        args.output,
        hidden_dim=args.hidden_dim,
        epochs=args.epochs,
        learning_rate=args.learning_rate,
        random_state=args.random_state,
    )
    print(json.dumps(metrics, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
