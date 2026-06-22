from __future__ import annotations

import json
import pickle
from pathlib import Path
from typing import Any

import numpy as np

from .package_embeddings import PackageEmbeddingIndex, feature_vector_from_values


class PackageRiskModelRegistry:
    def __init__(self, model_dir: str | Path = Path("storage/graph_models")) -> None:
        self.model_dir = Path(model_dir)
        self.model_available = False
        self.model_type = "rule_fallback"
        self.load_error: str | None = None
        self.model: Any = None
        self.feature_names: list[str] = []
        self._load_errors: list[str] = []
        self._pyg_model: Any = None
        self._pyg_torch: Any = None
        self._pyg_data_cls: type[Any] | None = None
        self._npz_model: dict[str, np.ndarray] | None = None
        self._raw_feature_dim = 0
        self._embedding_index: PackageEmbeddingIndex | None = None
        self._pyg_feature_mean: np.ndarray | None = None
        self._pyg_feature_scale: np.ndarray | None = None
        self._load_model()

    def predict(self, feature_values: dict[str, float]) -> dict[str, Any]:
        if not self.model_available or self.model is None:
            return {
                "score": 0.0,
                "model_available": self.model_available,
                "model_type": self.model_type,
                "confidence": 0.0,
                "explanations": [],
                "model_error": self.load_error,
            }

        try:
            if self._pyg_model is not None:
                raw_score = self._predict_pyg_score(feature_values)
                score, calibration_note = self._calibrate_pyg_online_score(raw_score, feature_values)
            elif self._npz_model is not None:
                score = self._predict_graphsage_score(feature_values)
                calibration_note = None
            else:
                score = self._predict_sklearn_score(feature_values)
                calibration_note = None
            score = self._bounded_score(score)
            explanations = self._explanations(score, feature_values)
            if calibration_note:
                explanations.append(calibration_note)
            return {
                "score": score,
                "model_available": True,
                "model_type": self.model_type,
                "confidence": self._confidence(score),
                "explanations": explanations,
                "model_error": self.load_error,
            }
        except Exception as exc:  # pragma: no cover - defensive runtime guard
            self._record_load_error("prediction", str(exc))
            return {
                "score": 0.0,
                "model_available": False,
                "model_type": "rule_fallback",
                "confidence": 0.0,
                "explanations": [],
                "model_error": self.load_error,
            }

    def similar_packages(self, feature_values: dict[str, float], *, limit: int = 3) -> list[dict[str, Any]]:
        if limit <= 0:
            return []
        vector = self._embedding_for_features(feature_values)
        index = self._package_embedding_index()
        if not index.available:
            return []
        hits: list[dict[str, Any]] = []
        if vector is not None and float(np.linalg.norm(vector)) > 1e-12:
            hits = index.similar_to_vector(vector, limit=limit, malicious_only=True)
            if not hits:
                hits = index.similar_to_vector(vector, limit=limit)
        if not hits:
            hits = self._similar_packages_by_feature_values(feature_values, index, limit=limit)
        return [
            {
                "package": str(item.get("package") or ""),
                "ecosystem": str(item.get("ecosystem") or ""),
                "score": round(float(item.get("score") or 0.0), 4),
                "reason": (
                    "embedding similarity to malicious training package"
                    if item.get("label") == 1
                    else "embedding similarity to training package"
                ),
            }
            for item in hits[:limit]
        ]

    def _similar_packages_by_feature_values(
        self,
        feature_values: dict[str, float],
        index: PackageEmbeddingIndex,
        *,
        limit: int,
    ) -> list[dict[str, Any]]:
        query = self._scaled_pyg_row(feature_vector_from_values(self.feature_names, feature_values))
        query_norm = float(np.linalg.norm(query))
        if query_norm <= 1e-12:
            return []
        candidates: list[dict[str, Any]] = []
        for record in index.records:
            values = self._feature_values_from_record(record)
            if values is None:
                continue
            similarity = float(values @ query / max(float(np.linalg.norm(values)) * query_norm, 1e-12))
            if not np.isfinite(similarity):
                continue
            candidates.append(
                {
                    "id": record.id,
                    "ecosystem": record.ecosystem,
                    "package": record.package,
                    "score": max(0.0, min(1.0, similarity)),
                    "similarity": similarity,
                    "label": record.label,
                }
            )
        malicious = [item for item in candidates if item.get("label") == 1]
        pool = malicious or candidates
        return sorted(pool, key=lambda item: (-float(item["similarity"]), str(item["id"])))[:limit]

    def _feature_values_from_record(self, record: Any) -> np.ndarray | None:
        ecosystem = str(getattr(record, "ecosystem", "") or "")
        package = str(getattr(record, "package", "") or "")
        record_id = str(getattr(record, "id", "") or "")
        if not ecosystem and record_id.startswith("pkg:npm:"):
            ecosystem = "npm"
        elif not ecosystem and record_id.startswith("pkg:pypi:"):
            ecosystem = "pypi"
        if not package and record_id.startswith("pkg:npm:"):
            package = record_id.removeprefix("pkg:npm:")
        elif not package and record_id.startswith("pkg:pypi:"):
            package = record_id.removeprefix("pkg:pypi:")
        if not ecosystem or not package:
            return None
        values = {
            "ecosystem_npm": 1.0 if ecosystem == "npm" else 0.0,
            "ecosystem_pypi": 1.0 if ecosystem == "pypi" else 0.0,
            "name_length": float(len(package)),
            "name_separator_count": float(package.count("-") + package.count("_") + package.count(".")),
            "has_scope": 1.0 if package.startswith("@") else 0.0,
            "has_digits": 1.0 if any(char.isdigit() for char in package) else 0.0,
            "version_count": 0.0,
            "alias_count": 0.0,
            "evidence_source_count": 1.0,
            "risk_keyword_count": 0.0,
            "text_length": float(len(package)),
        }
        return self._scaled_pyg_row(feature_vector_from_values(self.feature_names, values))

    def _load_model(self) -> None:
        if self._load_pyg_model():
            return
        if self._load_graphsage_model():
            return
        self._load_sklearn_model()

    def _load_pyg_model(self) -> bool:
        model_path = self.model_dir / "package_risk_graphsage.pt"
        metadata_path = self.model_dir / "package_risk_graphsage_metadata.json"
        if not model_path.exists() or not metadata_path.exists():
            return False

        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            model_type = str(metadata.get("model_type") or "pyg_graphsage_package_risk")
            if model_type != "pyg_graphsage_package_risk":
                raise ValueError(f"unsupported PyG model type: {model_type}")

            feature_names = [str(item) for item in metadata.get("feature_names", [])]
            input_dim = int(metadata.get("input_dim") or len(feature_names))
            hidden_dim = int(metadata.get("hidden_dim") or 0)
            dropout = float(metadata.get("dropout") or 0.0)
            if not feature_names or input_dim <= 0 or hidden_dim <= 0:
                raise ValueError("invalid PyG metadata")
            if input_dim != len(feature_names):
                raise ValueError("PyG metadata input_dim does not match feature_names")
            feature_mean = _optional_float_array(metadata.get("feature_mean"), input_dim, default=0.0)
            feature_scale = _optional_float_array(metadata.get("feature_scale"), input_dim, default=1.0)
            feature_scale = np.where(np.abs(feature_scale) < 1e-6, 1.0, feature_scale).astype(np.float32)

            torch, Data, SAGEConv = self._load_torch_pyg()
            model = self._build_pyg_model(torch, SAGEConv, input_dim, hidden_dim, dropout)
            state_dict = torch.load(model_path, map_location="cpu")
            if not isinstance(state_dict, dict):
                raise ValueError("invalid PyG model state dict")
            model.load_state_dict(state_dict)
            model.eval()

            self.model = model
            self._pyg_model = model
            self._pyg_torch = torch
            self._pyg_data_cls = Data
            self.feature_names = feature_names
            self._pyg_feature_mean = feature_mean
            self._pyg_feature_scale = feature_scale
            self.model_type = model_type
            self.model_available = True
            self.load_error = "; ".join(self._load_errors) or None
            return True
        except Exception as exc:
            self._record_load_error("pyg_graphsage", str(exc))
            return False

    def _load_graphsage_model(self) -> bool:
        model_path = self.model_dir / "package_risk_gnn.npz"
        if not model_path.exists():
            self._record_load_error("numpy_graphsage", f"model not found: {model_path}")
            return False
        try:
            with np.load(model_path, allow_pickle=False) as artifact:
                self._npz_model = {
                    "w1": artifact["w1"],
                    "b1": artifact["b1"],
                    "w2": artifact["w2"],
                    "b2": artifact["b2"],
                    "mean": artifact["mean"],
                    "scale": artifact["scale"],
                }
                self.feature_names = [str(item) for item in artifact["feature_names"].tolist()]
                self._raw_feature_dim = int(artifact["raw_feature_dim"][0])
            self._validate_graphsage_model()
        except Exception as exc:  # pragma: no cover - defensive startup guard
            self._record_load_error("numpy_graphsage", str(exc))
            self._clear_graphsage_model()
            return False
        self.model = self._npz_model
        self.model_type = "numpy_graphsage_mean_aggregator"
        self.model_available = True
        self.load_error = "; ".join(self._load_errors) or None
        return True

    def _validate_graphsage_model(self) -> None:
        if self._npz_model is None:
            raise ValueError("missing graphsage model arrays")
        if self._raw_feature_dim <= 0:
            raise ValueError("invalid graphsage raw_feature_dim")
        if len(self.feature_names) < self._raw_feature_dim:
            raise ValueError("graphsage feature_names shorter than raw_feature_dim")

        expected_width = self._raw_feature_dim * 2
        w1 = self._npz_model["w1"]
        b1 = self._npz_model["b1"]
        w2 = self._npz_model["w2"]
        b2 = self._npz_model["b2"]
        mean = self._npz_model["mean"]
        scale = self._npz_model["scale"]

        if mean.shape != (expected_width,):
            raise ValueError("graphsage mean shape does not match online feature width")
        if scale.shape != (expected_width,):
            raise ValueError("graphsage scale shape does not match online feature width")
        if not np.all(np.isfinite(mean)):
            raise ValueError("graphsage mean contains non-finite values")
        if not np.all(np.isfinite(scale)) or np.any(np.abs(scale) < 1e-12):
            raise ValueError("graphsage scale contains non-finite or zero values")
        if w1.ndim != 2 or w1.shape[0] != expected_width:
            raise ValueError("graphsage w1 shape does not match online feature width")
        hidden_dim = int(w1.shape[1])
        if hidden_dim <= 0:
            raise ValueError("graphsage hidden dimension must be positive")
        if b1.shape != (hidden_dim,):
            raise ValueError("graphsage b1 shape does not match w1 output dimension")
        if w2.ndim != 2 or w2.shape != (hidden_dim, 1):
            raise ValueError("graphsage w2 shape must produce one output logit")
        if b2.shape != (1,):
            raise ValueError("graphsage b2 must contain one bias value")
        for name, value in self._npz_model.items():
            if not np.all(np.isfinite(value)):
                raise ValueError(f"graphsage {name} contains non-finite values")

    def _clear_graphsage_model(self) -> None:
        self._npz_model = None
        self._raw_feature_dim = 0
        self.feature_names = []

    def _predict_pyg_score(self, values: dict[str, float]) -> float:
        if self._pyg_model is None or self._pyg_torch is None or self._pyg_data_cls is None:
            raise RuntimeError("PyG GraphSAGE model is not loaded")
        row = self._scaled_pyg_row([
            float(values.get(name, 0.0) or 0.0)
            for name in self.feature_names
        ])
        torch = self._pyg_torch
        data = self._pyg_data_cls(
            x=torch.tensor(row.reshape(1, -1), dtype=torch.float32),
            edge_index=torch.empty((2, 0), dtype=torch.long),
        )
        self._pyg_model.eval()
        with torch.no_grad():
            logits = self._pyg_model(data)
            probabilities = torch.softmax(logits, dim=1)
        return float(probabilities[0, 1].detach().cpu().item())

    def _calibrate_pyg_online_score(self, score: float, values: dict[str, float]) -> tuple[float, str | None]:
        evidence_strength = (
            float(values.get("risk_keyword_count", 0.0) or 0.0)
            + float(values.get("alias_count", 0.0) or 0.0)
            + max(0.0, float(values.get("graph_degree", 1.0) or 1.0) - 1.0)
        )
        if score >= 0.75 and evidence_strength <= 0:
            return 0.6, "online evidence calibration reduced an unsupported high PyG score"
        return score, None

    def _embedding_for_features(self, values: dict[str, float]) -> np.ndarray | None:
        if self._pyg_model is None or self._pyg_torch is None or self._pyg_data_cls is None:
            return None
        row = self._scaled_pyg_row(feature_vector_from_values(self.feature_names, values))
        torch = self._pyg_torch
        data = self._pyg_data_cls(
            x=torch.tensor(row.reshape(1, -1), dtype=torch.float32),
            edge_index=torch.empty((2, 0), dtype=torch.long),
        )
        self._pyg_model.eval()
        with torch.no_grad():
            embedding = self._pyg_model.encode(data.x, data.edge_index, apply_dropout=False)
        return embedding.detach().cpu().numpy().reshape(-1)

    def _scaled_pyg_row(self, row: Any) -> np.ndarray:
        values = np.asarray(row, dtype=np.float32).reshape(-1)
        if self._pyg_feature_mean is None or self._pyg_feature_scale is None:
            return values
        if values.shape != self._pyg_feature_mean.shape:
            return values
        return (values - self._pyg_feature_mean) / self._pyg_feature_scale

    def _package_embedding_index(self) -> PackageEmbeddingIndex:
        if self._embedding_index is None:
            self._embedding_index = PackageEmbeddingIndex(self.model_dir)
        return self._embedding_index

    def _load_sklearn_model(self) -> bool:
        model_path = self.model_dir / "package_risk.pkl"
        if not model_path.exists():
            self._record_load_error("sklearn", f"model not found: {model_path}")
            return False
        try:
            with model_path.open("rb") as handle:
                artifact = pickle.load(handle)
        except Exception as exc:  # pragma: no cover - defensive startup guard
            self._record_load_error("sklearn", str(exc))
            return False
        if not isinstance(artifact, dict) or "model" not in artifact:
            self._record_load_error("sklearn", "invalid model artifact")
            return False

        feature_names = [str(item) for item in artifact.get("feature_names", [])]
        if not feature_names:
            self._record_load_error("sklearn", "invalid model feature schema")
            return False

        self.model = artifact["model"]
        self.feature_names = feature_names
        self.model_type = str(artifact.get("model_type") or "sklearn_graph_features")
        self.model_available = True
        self.load_error = "; ".join(self._load_errors) or None
        return True

    def _predict_graphsage_score(self, values: dict[str, float]) -> float:
        if self._npz_model is None:
            raise RuntimeError("GraphSAGE model is not loaded")
        raw_feature_names = self.feature_names[: self._raw_feature_dim]
        raw = np.asarray([float(values.get(name, 0.0)) for name in raw_feature_names], dtype=np.float32)
        sage_row = np.concatenate([raw, raw]).reshape(1, -1)
        normalized = (sage_row - self._npz_model["mean"]) / self._npz_model["scale"]
        hidden = np.maximum(normalized @ self._npz_model["w1"] + self._npz_model["b1"], 0.0)
        logits = hidden @ self._npz_model["w2"] + self._npz_model["b2"]
        probability = 1.0 / (1.0 + np.exp(-np.clip(logits, -40, 40)))
        return float(probability.reshape(-1)[0])

    def _predict_sklearn_score(self, values: dict[str, float]) -> float:
        row = np.asarray([[float(values.get(name, 0.0)) for name in self.feature_names]], dtype=np.float32)
        return float(self.model.predict_proba(row)[0][1])

    def _explanations(self, score: float, values: dict[str, float]) -> list[str]:
        explanations = [
            f"{self.model_type} model produced score {score:.2f}",
            f"confidence {self._confidence(score):.2f} from distance to decision threshold",
        ]
        risk_keywords = float(values.get("risk_keyword_count", 0.0) or 0.0)
        if risk_keywords > 0:
            explanations.append(f"risk_keyword_count={risk_keywords:g}")
        graph_degree = float(values.get("graph_degree", 0.0) or 0.0)
        if graph_degree > 0:
            explanations.append(f"graph_degree={graph_degree:g}")
        return explanations

    def _record_load_error(self, source: str, message: str) -> None:
        item = f"{source}: {message}"
        if item not in self._load_errors:
            self._load_errors.append(item)
        self.load_error = "; ".join(self._load_errors)

    @staticmethod
    def _load_torch_pyg() -> tuple[Any, type[Any], type[Any]]:
        try:
            import torch
            from torch_geometric.data import Data
            from torch_geometric.nn import SAGEConv
        except ImportError as exc:
            raise RuntimeError("PyTorch and PyTorch Geometric are required for PyG GraphSAGE inference") from exc
        return torch, Data, SAGEConv

    @staticmethod
    def _build_pyg_model(
        torch: Any,
        SAGEConv: type[Any],
        input_dim: int,
        hidden_dim: int,
        dropout: float,
    ) -> Any:
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
                return self.classifier(self.encode(data.x, data.edge_index, apply_dropout=False))

        return PackageRiskGraphSAGE()

    @staticmethod
    def _bounded_score(score: float) -> float:
        return max(0.0, min(1.0, float(score)))

    @staticmethod
    def _confidence(score: float) -> float:
        return max(0.0, min(1.0, abs(float(score) - 0.5) * 2.0))


def _optional_float_array(value: Any, size: int, *, default: float) -> np.ndarray:
    if not isinstance(value, list) or len(value) != size:
        return np.full(size, float(default), dtype=np.float32)
    try:
        array = np.asarray([float(item) for item in value], dtype=np.float32)
    except (TypeError, ValueError):
        return np.full(size, float(default), dtype=np.float32)
    if not np.all(np.isfinite(array)):
        return np.full(size, float(default), dtype=np.float32)
    return array
