from __future__ import annotations

import argparse
import json
import random
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[2]))


PYG_MODEL_TYPE = "pyg_graphsage_package_risk"
MISSING_DEPENDENCY_MESSAGE = (
    "PyTorch and PyTorch Geometric are required for PyG GraphSAGE training. "
    "See docs/graphrag-gnn-environment.md."
)
PACKAGE_EDGE_TYPES = ["has_risk_signal", "observed_in"]
REQUIRED_SPLIT_KEYS = {"train", "val", "test"}
RISK_KEYWORDS = (
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
)


def _load_torch_pyg() -> tuple[Any, type[Any], type[Any]]:
    try:
        import torch
        from torch_geometric.data import Data
        from torch_geometric.nn import SAGEConv
    except ImportError as exc:
        raise RuntimeError(MISSING_DEPENDENCY_MESSAGE) from exc

    return torch, Data, SAGEConv


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
    package_nodes: list[dict[str, Any]] = []
    for node in nodes:
        node_id = str(node.get("id") or "")
        if node_id.startswith("pkg:") and isinstance(node.get("features"), dict):
            package_nodes.append(node)
    return package_nodes


def _label_from_node(node: dict[str, Any]) -> int:
    label = node.get("label")
    if label not in {0, 1}:
        raise ValueError("supervised package labels must be binary 0/1")
    return int(label)


def _matrix_from_package_nodes(
    nodes: list[dict[str, Any]],
    feature_names: list[str],
) -> tuple[np.ndarray, np.ndarray, list[str], list[dict[str, Any]]]:
    rows: list[list[float]] = []
    labels: list[int] = []
    node_ids: list[str] = []
    package_nodes: list[dict[str, Any]] = []

    for node in _package_nodes(nodes):
        node_id = str(node.get("id") or "")
        features = node.get("features")
        if not node_id or not isinstance(features, dict):
            continue
        rows.append([float(features.get(name, 0.0) or 0.0) for name in feature_names])
        labels.append(_label_from_node(node))
        node_ids.append(node_id)
        package_nodes.append(node)

    if not rows:
        return (
            np.zeros((0, len(feature_names)), dtype=np.float32),
            np.asarray([], dtype=np.int64),
            [],
            [],
        )
    return (
        np.asarray(rows, dtype=np.float32),
        np.asarray(labels, dtype=np.int64),
        node_ids,
        package_nodes,
    )


def _package_package_edges(
    node_ids: list[str],
    edges: list[dict[str, Any]],
    *,
    max_group_size: int | None = None,
) -> list[tuple[int, int]]:
    index = {node_id: idx for idx, node_id in enumerate(node_ids)}
    shared_targets: dict[tuple[str, str], list[int]] = defaultdict(list)

    for edge in edges:
        source = str(edge.get("source") or "")
        target = str(edge.get("target") or "")
        edge_type = str(edge.get("type") or "")
        if source not in index or edge_type not in set(PACKAGE_EDGE_TYPES) or not target:
            continue
        shared_targets[(edge_type, target)].append(index[source])

    package_edges: set[tuple[int, int]] = set()
    for group in shared_targets.values():
        unique_group = sorted(set(group))
        if max_group_size is not None and int(max_group_size) > 0 and len(unique_group) > int(max_group_size):
            continue
        for left in unique_group:
            for right in unique_group:
                if left != right:
                    package_edges.add((left, right))

    return sorted(package_edges)


def _validate_hyperparameters(
    *,
    hidden_dim: int,
    epochs: int,
    learning_rate: float,
    dropout: float,
) -> None:
    if int(epochs) <= 0:
        raise ValueError("epochs must be > 0")
    if int(hidden_dim) <= 0:
        raise ValueError("hidden_dim must be > 0")
    if float(learning_rate) <= 0:
        raise ValueError("learning_rate must be > 0")
    if not 0 <= float(dropout) < 1:
        raise ValueError("dropout must satisfy 0 <= dropout < 1")


def _validate_labels(labels: np.ndarray) -> None:
    label_values = set(int(label) for label in labels.tolist())
    if not label_values.issubset({0, 1}):
        raise ValueError("supervised package labels must be binary 0/1")
    if label_values != {0, 1}:
        raise ValueError("training data must include at least one positive and one negative package")


def _validate_splits(splits: dict[str, Any], node_ids: list[str], labels: np.ndarray) -> dict[str, list[str]]:
    split_keys = set(splits)
    missing_keys = REQUIRED_SPLIT_KEYS - split_keys
    if missing_keys:
        raise ValueError(f"splits.json missing required split keys: {sorted(missing_keys)}")

    valid_node_ids = set(node_ids)
    normalized: dict[str, list[str]] = {}
    owner_by_node_id: dict[str, str] = {}
    overlaps: dict[str, list[str]] = defaultdict(list)

    for split_name in sorted(REQUIRED_SPLIT_KEYS):
        raw_split = splits.get(split_name)
        if not isinstance(raw_split, list):
            raise ValueError(f"split {split_name} must be a list of node IDs")
        normalized_ids = [str(node_id) for node_id in raw_split]
        unknown_ids = sorted(set(normalized_ids) - valid_node_ids)
        if unknown_ids:
            raise ValueError(f"unknown split node IDs: {unknown_ids}")
        for node_id in normalized_ids:
            existing_owner = owner_by_node_id.get(node_id)
            if existing_owner and existing_owner != split_name:
                overlaps[node_id].extend([existing_owner, split_name])
            owner_by_node_id[node_id] = split_name
        normalized[split_name] = normalized_ids

    if overlaps:
        overlap_ids = sorted(overlaps)
        raise ValueError(f"overlapping split node IDs: {overlap_ids}")

    train_ids = normalized["train"]
    if not train_ids:
        raise ValueError("train split must include at least one package node")

    labels_by_node_id = {node_id: int(labels[idx]) for idx, node_id in enumerate(node_ids)}
    train_label_values = {labels_by_node_id[node_id] for node_id in train_ids}
    if train_label_values != {0, 1}:
        raise ValueError("train split must include both benign and malicious package labels")

    return normalized


def _load_training_inputs(
    data_path: Path,
    *,
    hidden_dim: int,
    epochs: int,
    learning_rate: float,
    dropout: float,
    max_edge_group_size: int | None = None,
) -> dict[str, Any]:
    _validate_hyperparameters(
        hidden_dim=hidden_dim,
        epochs=epochs,
        learning_rate=learning_rate,
        dropout=dropout,
    )
    schema = _read_json(data_path / "feature_schema.json")
    feature_names = [str(item) for item in schema.get("features", [])]
    nodes = _read_jsonl(data_path / "train_nodes.jsonl")
    edges = _read_jsonl(data_path / "train_edges.jsonl")
    splits = _read_json(data_path / "splits.json")

    features, labels, node_ids, package_nodes = _matrix_from_package_nodes(nodes, feature_names)
    if len(features) == 0:
        raise ValueError("training data must include at least one package node")
    _validate_labels(labels)
    normalized_splits = _validate_splits(splits, node_ids, labels)
    package_edges = _package_package_edges(node_ids, edges, max_group_size=max_edge_group_size)

    return {
        "feature_names": feature_names,
        "features": features,
        "labels": labels,
        "node_ids": node_ids,
        "package_nodes": package_nodes,
        "package_edges": package_edges,
        "splits": normalized_splits,
    }


def _mask_from_split(torch: Any, node_ids: list[str], split_ids: list[Any]) -> Any:
    selected = {str(node_id) for node_id in split_ids}
    values = [node_id in selected for node_id in node_ids]
    return torch.tensor(values, dtype=torch.bool)


def _select_device(torch: Any, requested: str) -> str:
    normalized = str(requested or "auto").strip().lower()
    if normalized == "auto":
        return "cuda" if torch.cuda.is_available() else "cpu"
    if normalized == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested but torch.cuda.is_available() is false")
    if normalized not in {"cpu", "cuda"}:
        raise ValueError("device must be one of: auto, cpu, cuda")
    return normalized


def _balanced_training_mask(
    torch: Any,
    node_ids: list[str],
    train_ids: list[Any],
    labels: np.ndarray,
    *,
    max_positive_ratio: float | None,
    random_state: int,
) -> Any:
    if max_positive_ratio is None or float(max_positive_ratio) <= 0:
        return _mask_from_split(torch, node_ids, train_ids)

    selected = {str(node_id) for node_id in train_ids}
    positive_indices = [
        idx
        for idx, node_id in enumerate(node_ids)
        if node_id in selected and int(labels[idx]) == 1
    ]
    negative_indices = [
        idx
        for idx, node_id in enumerate(node_ids)
        if node_id in selected and int(labels[idx]) == 0
    ]
    if not positive_indices or not negative_indices:
        return _mask_from_split(torch, node_ids, train_ids)

    positive_limit = max(1, int(len(negative_indices) * float(max_positive_ratio)))
    rng = random.Random(int(random_state))
    if len(positive_indices) > positive_limit:
        positive_indices = sorted(rng.sample(positive_indices, positive_limit))
    selected_indices = set(positive_indices + negative_indices)
    return torch.tensor([idx in selected_indices for idx in range(len(node_ids))], dtype=torch.bool)


def _empty_split_metrics() -> dict[str, float | int | None]:
    return {
        "samples": 0,
        "positive_samples": 0,
        "negative_samples": 0,
        "accuracy": None,
        "precision": None,
        "recall": None,
        "f1": None,
    }


def _split_metrics(torch: Any, logits: Any, labels: Any, mask: Any) -> dict[str, float | int | None]:
    sample_count = int(mask.sum().item())
    if sample_count == 0:
        return _empty_split_metrics()

    split_logits = logits[mask]
    split_labels = labels[mask]
    predictions = split_logits.argmax(dim=1)
    true_positive = int(((predictions == 1) & (split_labels == 1)).sum().item())
    false_positive = int(((predictions == 1) & (split_labels == 0)).sum().item())
    false_negative = int(((predictions == 0) & (split_labels == 1)).sum().item())
    correct = int((predictions == split_labels).sum().item())
    positive_samples = int((split_labels == 1).sum().item())
    negative_samples = int((split_labels == 0).sum().item())

    precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
    recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "samples": sample_count,
        "positive_samples": positive_samples,
        "negative_samples": negative_samples,
        "accuracy": float(correct / sample_count),
        "precision": float(precision),
        "recall": float(recall),
        "f1": float(f1),
    }


def _feature_scaler(features: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    mean = features.mean(axis=0).astype(np.float32)
    scale = features.std(axis=0).astype(np.float32)
    scale = np.where(np.abs(scale) < 1e-6, 1.0, scale).astype(np.float32)
    return mean, scale


def _online_case_feature_values(
    feature_names: list[str],
    *,
    ecosystem: str,
    package: str,
    version: str = "",
    signals: list[str] | None = None,
    vulnerabilities: list[dict[str, Any]] | None = None,
) -> list[float]:
    normalized_ecosystem = ecosystem.strip().lower()
    normalized_package = package.strip().lower()
    if normalized_ecosystem == "pypi":
        normalized_package = normalized_package.replace("_", "-").replace(".", "-")
    signal_values = signals or []
    vulnerability_values = vulnerabilities or []
    signal_text = " ".join(str(item) for item in signal_values)
    vulnerability_text = " ".join(
        " ".join(str(value) for value in item.values())
        for item in vulnerability_values
        if isinstance(item, dict)
    )
    text = f"{normalized_package} {version} {signal_text} {vulnerability_text}"
    lowered = text.lower()
    values = {
        "ecosystem_npm": 1.0 if normalized_ecosystem == "npm" else 0.0,
        "ecosystem_pypi": 1.0 if normalized_ecosystem == "pypi" else 0.0,
        "name_length": float(len(normalized_package)),
        "name_separator_count": float(
            normalized_package.count("-")
            + normalized_package.count("_")
            + normalized_package.count(".")
        ),
        "has_scope": 1.0 if normalized_package.startswith("@") else 0.0,
        "has_digits": 1.0 if any(char.isdigit() for char in normalized_package) else 0.0,
        "version_count": 1.0 if version else 0.0,
        "alias_count": float(len(vulnerability_values)),
        "evidence_source_count": 1.0,
        "risk_keyword_count": float(sum(1 for keyword in RISK_KEYWORDS if keyword in lowered)),
        "text_length": float(len(text)),
    }
    return [float(values.get(name, 0.0)) for name in feature_names]


def _online_sanity_case_scores(
    torch: Any,
    Data: type[Any],
    model: Any,
    feature_names: list[str],
    device: str,
    feature_mean: np.ndarray,
    feature_scale: np.ndarray,
) -> dict[str, float]:
    cases = {
        "react": {"ecosystem": "npm", "package": "react", "version": "18.2.0"},
        "requests": {"ecosystem": "pypi", "package": "requests", "version": "2.31.0"},
        "flask": {"ecosystem": "pypi", "package": "flask", "version": "3.0.0"},
        "numpy": {"ecosystem": "pypi", "package": "numpy", "version": "1.26.0"},
        "left-pad": {"ecosystem": "npm", "package": "left-pad", "version": "1.3.0"},
        "x-trader-codec": {
            "ecosystem": "npm",
            "package": "x-trader-codec",
            "version": "4.7.1",
            "signals": ["install script: postinstall"],
        },
    }
    rows = [
        _online_case_feature_values(feature_names, **payload)
        for payload in cases.values()
    ]
    scaled_rows = (np.asarray(rows, dtype=np.float32) - feature_mean) / feature_scale
    case_data = Data(
        x=torch.tensor(scaled_rows, dtype=torch.float32, device=device),
        edge_index=torch.empty((2, 0), dtype=torch.long, device=device),
    )
    with torch.no_grad():
        logits = model(case_data)
        probabilities = torch.softmax(logits, dim=1)[:, 1].detach().cpu().numpy()
    return {
        case_name: round(float(probability), 6)
        for case_name, probability in zip(cases, probabilities)
    }


def _online_no_edge_metrics(
    torch: Any,
    Data: type[Any],
    model: Any,
    x: Any,
    labels: Any,
    feature_names: list[str],
    device: str,
    feature_mean: np.ndarray,
    feature_scale: np.ndarray,
) -> dict[str, Any]:
    empty_edge_index = torch.empty((2, 0), dtype=torch.long, device=device)
    no_edge_data = Data(x=x, edge_index=empty_edge_index, y=labels)
    with torch.no_grad():
        logits = model(no_edge_data)
        probabilities = torch.softmax(logits, dim=1)[:, 1]

    benign_mask = labels == 0
    malicious_mask = labels == 1

    def _mean(mask: Any) -> float | None:
        if int(mask.sum().item()) == 0:
            return None
        return float(probabilities[mask].mean().detach().cpu().item())

    def _high_rate(mask: Any) -> float | None:
        if int(mask.sum().item()) == 0:
            return None
        return float((probabilities[mask] >= 0.75).to(dtype=torch.float32).mean().detach().cpu().item())

    return {
        "benign_mean_score": _mean(benign_mask),
        "malicious_mean_score": _mean(malicious_mask),
        "benign_high_score_rate": _high_rate(benign_mask),
        "malicious_high_score_rate": _high_rate(malicious_mask),
        "sanity_cases": _online_sanity_case_scores(
            torch,
            Data,
            model,
            feature_names,
            device,
            feature_mean,
            feature_scale,
        ),
    }


def _class_weights(torch: Any, labels: Any, train_mask: Any) -> Any:
    if int(train_mask.sum().item()) == 0:
        return torch.ones(2, dtype=torch.float32)

    counts = torch.bincount(labels[train_mask], minlength=2).to(dtype=torch.float32)
    total = counts.sum().clamp(min=1.0)
    weights = total / (2.0 * counts.clamp(min=1.0))
    return weights


def _build_model(torch: Any, SAGEConv: type[Any], input_dim: int, hidden_dim: int, dropout: float) -> Any:
    class PackageRiskGraphSAGE(torch.nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.conv1 = SAGEConv(input_dim, hidden_dim)
            self.conv2 = SAGEConv(hidden_dim, hidden_dim)
            self.classifier = torch.nn.Linear(hidden_dim, 2)
            self.dropout = torch.nn.Dropout(dropout)

        def encode(self, x: Any, edge_index: Any, *, apply_dropout: bool = False) -> Any:
            hidden = self.conv1(x, edge_index)
            hidden = torch.nn.functional.relu(hidden)
            if apply_dropout:
                hidden = self.dropout(hidden)
            hidden = self.conv2(hidden, edge_index)
            hidden = torch.nn.functional.relu(hidden)
            if apply_dropout:
                hidden = self.dropout(hidden)
            return hidden

        def forward(self, data: Any) -> Any:
            return self.classifier(self.encode(data.x, data.edge_index, apply_dropout=True))

    return PackageRiskGraphSAGE()


def train_pyg_graphsage_package_risk(
    data_dir: str | Path,
    output_dir: str | Path,
    *,
    hidden_dim: int = 64,
    epochs: int = 80,
    learning_rate: float = 0.01,
    dropout: float = 0.3,
    random_state: int = 42,
    max_train_positive_ratio: float | None = None,
    online_loss_weight: float = 0.0,
    device: str = "auto",
    max_edge_group_size: int | None = None,
) -> dict[str, Any]:
    data_path = Path(data_dir)
    output_path = Path(output_dir)
    training_inputs = _load_training_inputs(
        data_path,
        hidden_dim=hidden_dim,
        epochs=epochs,
        learning_rate=learning_rate,
        dropout=dropout,
        max_edge_group_size=max_edge_group_size,
    )
    torch, Data, SAGEConv = _load_torch_pyg()

    random.seed(random_state)
    np.random.seed(random_state)
    torch.manual_seed(random_state)
    selected_device = _select_device(torch, device)
    if selected_device == "cuda":
        torch.cuda.manual_seed_all(random_state)

    feature_names = training_inputs["feature_names"]
    features = training_inputs["features"]
    labels = training_inputs["labels"]
    node_ids = training_inputs["node_ids"]
    package_nodes = training_inputs["package_nodes"]
    package_edges = training_inputs["package_edges"]
    splits = training_inputs["splits"]
    feature_mean, feature_scale = _feature_scaler(features)
    scaled_features = (features - feature_mean) / feature_scale

    x = torch.tensor(scaled_features, dtype=torch.float32, device=selected_device)
    y = torch.tensor(labels, dtype=torch.long, device=selected_device)
    if package_edges:
        edge_index = torch.tensor(package_edges, dtype=torch.long, device=selected_device).t().contiguous()
    else:
        edge_index = torch.empty((2, 0), dtype=torch.long, device=selected_device)
    data = Data(x=x, edge_index=edge_index, y=y)
    online_data = Data(
        x=x,
        edge_index=torch.empty((2, 0), dtype=torch.long, device=selected_device),
        y=y,
    )

    train_mask = _balanced_training_mask(
        torch,
        node_ids,
        splits["train"],
        labels,
        max_positive_ratio=max_train_positive_ratio,
        random_state=random_state,
    ).to(selected_device)
    val_mask = _mask_from_split(torch, node_ids, splits["val"]).to(selected_device)
    test_mask = _mask_from_split(torch, node_ids, splits["test"]).to(selected_device)

    model = _build_model(torch, SAGEConv, x.shape[1], int(hidden_dim), float(dropout)).to(selected_device)
    optimizer = torch.optim.Adam(model.parameters(), lr=float(learning_rate))
    criterion = torch.nn.CrossEntropyLoss(weight=_class_weights(torch, y, train_mask))
    online_weight = max(0.0, float(online_loss_weight))

    final_loss = 0.0
    trained_epochs = 0
    for _ in range(int(epochs)):
        model.train()
        optimizer.zero_grad()
        logits = model(data)
        loss = criterion(logits[train_mask], data.y[train_mask])
        if online_weight > 0:
            online_logits = model(online_data)
            online_loss = criterion(online_logits[train_mask], online_data.y[train_mask])
            loss = loss + online_loss * online_weight
        loss.backward()
        optimizer.step()
        final_loss = float(loss.detach().item())
        trained_epochs += 1

    model.eval()
    with torch.no_grad():
        logits = model(data)
        embeddings = model.encode(data.x, data.edge_index, apply_dropout=False).detach().cpu().numpy()

    split_metrics = {
        "train": _split_metrics(torch, logits, y, train_mask),
        "val": _split_metrics(torch, logits, y, val_mask),
        "test": _split_metrics(torch, logits, y, test_mask),
    }
    online_metrics = _online_no_edge_metrics(
        torch,
        Data,
        model,
        x,
        y,
        feature_names,
        selected_device,
        feature_mean,
        feature_scale,
    )
    cuda_device_name = None
    if torch.cuda.is_available():
        try:
            cuda_device_name = torch.cuda.get_device_name(0)
        except Exception:
            cuda_device_name = None
    metrics: dict[str, Any] = {
        "model_type": PYG_MODEL_TYPE,
        "samples": int(len(node_ids)),
        "positive_samples": int(np.sum(labels == 1)),
        "negative_samples": int(np.sum(labels == 0)),
        "edge_count": int(edge_index.shape[1]),
        "epochs": int(epochs),
        "trained_epochs": int(trained_epochs),
        "training_status": "trained",
        "hidden_dim": int(hidden_dim),
        "dropout": float(dropout),
        "learning_rate": float(learning_rate),
        "random_state": int(random_state),
        "max_train_positive_ratio": max_train_positive_ratio,
        "online_loss_weight": online_weight,
        "max_edge_group_size": max_edge_group_size,
        "feature_mean": [float(value) for value in feature_mean.tolist()],
        "feature_scale": [float(value) for value in feature_scale.tolist()],
        "device": selected_device,
        "cuda_available": bool(torch.cuda.is_available()),
        "cuda_device_name": cuda_device_name,
        "torch_version": str(getattr(torch, "__version__", "")),
        "torch_cuda_version": str(getattr(torch.version, "cuda", "")),
        "final_loss": final_loss,
        "splits": split_metrics,
        "online_no_edge": online_metrics,
    }

    output_path.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), output_path / "package_risk_graphsage.pt")

    metadata = {
        "model_type": PYG_MODEL_TYPE,
        "feature_names": feature_names,
        "input_dim": int(features.shape[1]),
        "feature_mean": [float(value) for value in feature_mean.tolist()],
        "feature_scale": [float(value) for value in feature_scale.tolist()],
        "label_mapping": {"benign": 0, "malicious": 1},
        "edge_construction": {
            "method": "package-package edges by shared targets",
            "edge_types": PACKAGE_EDGE_TYPES,
            "max_group_size": max_edge_group_size,
        },
        "hidden_dim": int(hidden_dim),
        "dropout": float(dropout),
        "node_count": int(len(node_ids)),
        "edge_count": int(edge_index.shape[1]),
        "split_counts": {
            split_name: int(len(split_node_ids))
            for split_name, split_node_ids in splits.items()
        },
        "random_state": int(random_state),
        "max_train_positive_ratio": max_train_positive_ratio,
        "online_loss_weight": online_weight,
        "max_edge_group_size": max_edge_group_size,
        "device": selected_device,
        "cuda_available": bool(torch.cuda.is_available()),
        "cuda_device_name": cuda_device_name,
        "torch_version": str(getattr(torch, "__version__", "")),
        "torch_cuda_version": str(getattr(torch.version, "cuda", "")),
        "epochs": int(epochs),
        "trained_epochs": int(trained_epochs),
        "training_status": "trained",
        "learning_rate": float(learning_rate),
        "artifact_files": {
            "model": "package_risk_graphsage.pt",
            "embeddings": "package_embeddings.npy",
            "embedding_index": "package_embedding_index.json",
            "metrics": "graphsage_eval.json",
        },
    }
    (output_path / "package_risk_graphsage_metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    np.save(output_path / "package_embeddings.npy", embeddings)

    embedding_index = [
        {
            "index": idx,
            "id": node_id,
            "ecosystem": str(package_nodes[idx].get("ecosystem") or ""),
            "label": int(labels[idx]),
            "package": str(package_nodes[idx].get("package") or ""),
        }
        for idx, node_id in enumerate(node_ids)
    ]
    (output_path / "package_embedding_index.json").write_text(
        json.dumps(embedding_index, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    (output_path / "graphsage_eval.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    return metrics


def main() -> int:
    parser = argparse.ArgumentParser(description="Train a PyG GraphSAGE package risk model.")
    parser.add_argument("--data", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--hidden-dim", type=int, default=64)
    parser.add_argument("--epochs", type=int, default=80)
    parser.add_argument("--learning-rate", type=float, default=0.01)
    parser.add_argument("--dropout", type=float, default=0.3)
    parser.add_argument("--random-state", type=int, default=42)
    parser.add_argument("--max-train-positive-ratio", type=float, default=None)
    parser.add_argument("--online-loss-weight", type=float, default=0.0)
    parser.add_argument("--device", choices=["auto", "cpu", "cuda"], default="auto")
    parser.add_argument("--max-edge-group-size", type=int, default=None)
    args = parser.parse_args()

    metrics = train_pyg_graphsage_package_risk(
        args.data,
        args.output,
        hidden_dim=args.hidden_dim,
        epochs=args.epochs,
        learning_rate=args.learning_rate,
        dropout=args.dropout,
        random_state=args.random_state,
        max_train_positive_ratio=args.max_train_positive_ratio,
        online_loss_weight=args.online_loss_weight,
        device=args.device,
        max_edge_group_size=args.max_edge_group_size,
    )
    print(json.dumps(metrics, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
