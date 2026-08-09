from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from supplyguard.gnn_features import FEATURE_CONTRACT


ARTIFACT_SCHEMA_VERSION = 6
DATASET_FILES = (
    "feature_schema.json",
    "train_nodes.jsonl",
    "train_edges.jsonl",
    "splits.json",
    "dataset_card.json",
)


def dataset_fingerprint(data_dir: str | Path) -> str:
    data_path = Path(data_dir)
    digest = hashlib.sha256()
    found = False
    for name in DATASET_FILES:
        path = data_path / name
        if not path.exists():
            continue
        found = True
        digest.update(name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    if not found:
        raise ValueError(f"no GNN dataset files found in {data_path}")
    return digest.hexdigest()


def best_effort_dataset_audit(data_dir: str | Path) -> dict[str, Any]:
    try:
        from scripts.gnn.audit_package_risk_dataset import audit_dataset

        return audit_dataset(data_dir)
    except Exception as exc:
        return {
            "ready_for_training": False,
            "warnings": [f"dataset audit unavailable: {exc}"],
        }


def build_artifact_metadata(
    data_dir: str | Path,
    *,
    model_type: str,
    dataset_audit: dict[str, Any] | None = None,
    edge_split_policy: str,
    decision_threshold: float,
    calibration_temperature: float,
    calibration_ece: float | None = None,
    calibration_verified: bool | None = None,
    ood_distance_threshold: float = 6.0,
) -> dict[str, Any]:
    data_path = Path(data_dir)
    fingerprint = dataset_fingerprint(data_path)
    audit = dataset_audit or best_effort_dataset_audit(data_path)
    trained_at = datetime.now(timezone.utc).isoformat()
    dataset_version = _dataset_version(data_path, fingerprint)
    artifact_id = f"{model_type}:{fingerprint[:12]}:{trained_at.replace(':', '').replace('+00:00', 'Z')}"
    calibration = {
        "method": "temperature",
        "temperature": float(calibration_temperature),
        "fit_split": "val" if edge_split_policy == "inductive" else "training",
    }
    if calibration_ece is not None:
        calibration["ece_val"] = round(float(calibration_ece), 6)
    if calibration_verified is not None:
        calibration["verified"] = bool(calibration_verified)
    return {
        "schema_version": ARTIFACT_SCHEMA_VERSION,
        "feature_contract": FEATURE_CONTRACT,
        "task": "malicious_package",
        "training_status": "trained",
        "data_quality_status": "passed" if audit.get("ready_for_training") else "warning",
        "edge_split_policy": edge_split_policy,
        "decision_threshold": float(decision_threshold),
        "calibration": calibration,
        "dataset_audit": audit,
        "artifact_id": artifact_id,
        "dataset_version": dataset_version,
        "dataset_hash": fingerprint,
        "trained_at": trained_at,
        "ood_distance_threshold": float(ood_distance_threshold),
        "runtime_acceptance": {"status": "pending"},
    }


def _dataset_version(data_path: Path, fingerprint: str) -> str:
    card_path = data_path / "dataset_card.json"
    if card_path.exists():
        try:
            card = json.loads(card_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            card = {}
        if isinstance(card, dict):
            value = card.get("dataset_version") or card.get("version")
            if value:
                return str(value)
    return fingerprint[:12]
