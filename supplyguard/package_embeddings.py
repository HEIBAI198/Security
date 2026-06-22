from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np


DEFAULT_MODEL_DIR = Path("storage/graph_models")


@dataclass(frozen=True)
class PackageEmbeddingRecord:
    index: int
    id: str
    ecosystem: str
    package: str
    label: int | None = None


class PackageEmbeddingIndex:
    def __init__(self, model_dir: str | Path = DEFAULT_MODEL_DIR) -> None:
        self.model_dir = Path(model_dir)
        self.embeddings: np.ndarray | None = None
        self.records: list[PackageEmbeddingRecord] = []
        self.by_id: dict[str, PackageEmbeddingRecord] = {}
        self.by_package_key: dict[tuple[str, str], PackageEmbeddingRecord] = {}
        self.load_error: str | None = None
        self._load()

    @property
    def available(self) -> bool:
        return self.embeddings is not None and bool(self.records)

    def record_for_node(self, node: dict[str, Any]) -> PackageEmbeddingRecord | None:
        node_id = str(node.get("id") or "")
        if node_id in self.by_id:
            return self.by_id[node_id]
        ecosystem, package = package_identity_from_node(node)
        if ecosystem and package:
            return self.by_package_key.get((ecosystem, package))
        return None

    def vector_for_record(self, record: PackageEmbeddingRecord) -> np.ndarray | None:
        if self.embeddings is None or record.index < 0 or record.index >= len(self.embeddings):
            return None
        return self.embeddings[record.index]

    def similar_to_vector(
        self,
        vector: np.ndarray,
        *,
        limit: int = 5,
        allowed_ids: set[str] | None = None,
        malicious_only: bool = False,
        exclude_ids: set[str] | None = None,
    ) -> list[dict[str, Any]]:
        if self.embeddings is None or not self.records:
            return []
        query = np.asarray(vector, dtype=np.float32).reshape(-1)
        if query.size != self.embeddings.shape[1] or not np.all(np.isfinite(query)):
            return []
        query_norm = float(np.linalg.norm(query))
        if query_norm <= 1e-12:
            return []

        matrix = self.embeddings.astype(np.float32, copy=False)
        norms = np.linalg.norm(matrix, axis=1)
        similarities = (matrix @ query) / np.maximum(norms * query_norm, 1e-12)

        candidates: list[dict[str, Any]] = []
        excluded = exclude_ids or set()
        for record in self.records:
            if record.id in excluded:
                continue
            if allowed_ids is not None and record.id not in allowed_ids:
                continue
            if malicious_only and record.label != 1:
                continue
            similarity = float(similarities[record.index])
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
        return sorted(candidates, key=lambda item: (-float(item["similarity"]), str(item["id"])))[:limit]

    def _load(self) -> None:
        embeddings_path = self.model_dir / "package_embeddings.npy"
        index_path = self.model_dir / "package_embedding_index.json"
        if not embeddings_path.exists() or not index_path.exists():
            self.load_error = "package embedding artifacts not found"
            return
        try:
            embeddings = np.load(embeddings_path)
            raw_index = json.loads(index_path.read_text(encoding="utf-8"))
            if not isinstance(raw_index, list):
                raise ValueError("package embedding index must be a list")
            if embeddings.ndim != 2 or embeddings.shape[0] != len(raw_index):
                raise ValueError("package embedding shape does not match index length")

            records = [_record_from_payload(item) for item in raw_index if isinstance(item, dict)]
            if len(records) != len(raw_index):
                raise ValueError("package embedding index contains invalid rows")
            self.embeddings = np.asarray(embeddings, dtype=np.float32)
            self.records = records
            self.by_id = {record.id: record for record in records if record.id}
            self.by_package_key = {
                (record.ecosystem, record.package): record
                for record in records
                if record.ecosystem and record.package
            }
        except Exception as exc:
            self.embeddings = None
            self.records = []
            self.by_id = {}
            self.by_package_key = {}
            self.load_error = str(exc)


def package_identity_from_node(node: dict[str, Any]) -> tuple[str, str]:
    raw = _raw_properties(node)
    ecosystem = normalize_ecosystem(raw.get("ecosystem") or node.get("ecosystem"))
    package = normalize_package_name(
        raw.get("package")
        or raw.get("name")
        or node.get("package")
        or _package_from_purl(str(node.get("id") or ""))
        or _package_from_label(str(node.get("label") or "")),
        ecosystem,
    )
    return ecosystem, package


def normalize_ecosystem(value: Any) -> str:
    text = str(value or "").strip().lower()
    if text in {"npm", "pypi"}:
        return text
    if str(value or "").startswith("pkg:npm:"):
        return "npm"
    if str(value or "").startswith("pkg:pypi:"):
        return "pypi"
    return text


def normalize_package_name(value: Any, ecosystem: str = "") -> str:
    package = str(value or "").strip().lower()
    if "@" in package and not package.startswith("@"):
        package = package.split("@", 1)[0]
    if package.startswith("pkg:npm:"):
        package = package.removeprefix("pkg:npm:")
    if package.startswith("pkg:pypi:"):
        package = package.removeprefix("pkg:pypi:")
    if ecosystem == "pypi":
        package = package.replace("_", "-").replace(".", "-")
    return package


def feature_vector_from_values(feature_names: list[str], values: dict[str, float]) -> np.ndarray:
    return np.asarray([float(values.get(name, 0.0) or 0.0) for name in feature_names], dtype=np.float32)


def _record_from_payload(payload: dict[str, Any]) -> PackageEmbeddingRecord:
    ecosystem = normalize_ecosystem(payload.get("ecosystem"))
    return PackageEmbeddingRecord(
        index=int(payload.get("index") or 0),
        id=str(payload.get("id") or ""),
        ecosystem=ecosystem,
        package=normalize_package_name(payload.get("package"), ecosystem),
        label=_optional_int(payload.get("label")),
    )


def _optional_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _raw_properties(node: dict[str, Any]) -> dict[str, Any]:
    properties = node.get("properties")
    if not isinstance(properties, dict):
        return {}
    nested = properties.get("properties")
    if isinstance(nested, dict):
        return nested
    return properties


def _package_from_purl(value: str) -> str:
    if value.startswith("pkg:npm:"):
        return value.removeprefix("pkg:npm:")
    if value.startswith("pkg:pypi:"):
        return value.removeprefix("pkg:pypi:")
    return ""


def _package_from_label(value: str) -> str:
    text = value.strip()
    if not text:
        return ""
    if text.startswith("npm:"):
        return text.removeprefix("npm:")
    if text.startswith("pypi:"):
        return text.removeprefix("pypi:")
    return text
