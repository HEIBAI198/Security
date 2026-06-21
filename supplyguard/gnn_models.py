from __future__ import annotations

import json
import pickle
from pathlib import Path
from typing import Any

import numpy as np


class PackageRiskModelRegistry:
    def __init__(self, model_dir: str | Path = Path("storage/graph_models")) -> None:
        self.model_dir = Path(model_dir)
        self.model_available = False
        self.model_type = "rule_fallback"
        self.load_error: str | None = None
        self.model: Any = None
        self.feature_names: list[str] = []
        self._load_errors: list[str] = []
        self._npz_model: dict[str, np.ndarray] | None = None
        self._raw_feature_dim = 0
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
            if self._npz_model is not None:
                score = self._predict_graphsage_score(feature_values)
            else:
                score = self._predict_sklearn_score(feature_values)
            score = self._bounded_score(score)
            return {
                "score": score,
                "model_available": True,
                "model_type": self.model_type,
                "confidence": self._confidence(score),
                "explanations": self._explanations(score, feature_values),
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
        return []

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
            # Torch stays lazy so lightweight deployments can use NumPy/sklearn artifacts.
            import torch  # type: ignore[import-not-found]

            torch.load(model_path, map_location="cpu")
            model_type = str(metadata.get("model_type") or "pyg_graphsage_package_risk")
            raise NotImplementedError(f"{model_type} inference is not implemented")
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
        except Exception as exc:  # pragma: no cover - defensive startup guard
            self._record_load_error("numpy_graphsage", str(exc))
            self._npz_model = None
            return False
        if not self.feature_names or self._raw_feature_dim <= 0:
            self._record_load_error("numpy_graphsage", "invalid graphsage model artifact")
            self._npz_model = None
            return False
        self.model = self._npz_model
        self.model_type = "numpy_graphsage_mean_aggregator"
        self.model_available = True
        self.load_error = "; ".join(self._load_errors) or None
        return True

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
    def _bounded_score(score: float) -> float:
        return max(0.0, min(1.0, float(score)))

    @staticmethod
    def _confidence(score: float) -> float:
        return max(0.0, min(1.0, abs(float(score) - 0.5) * 2.0))
