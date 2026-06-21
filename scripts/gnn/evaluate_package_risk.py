from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[2]))


def _validate_inputs(labels: list[int], scores: list[float]) -> tuple[list[int], list[float]]:
    if len(labels) != len(scores):
        raise ValueError("labels and scores must have the same length")
    if not labels:
        raise ValueError("labels and scores must contain at least one sample")

    normalized_labels = [int(label) for label in labels]
    invalid_labels = sorted(set(normalized_labels) - {0, 1})
    if invalid_labels:
        raise ValueError(f"labels must be binary 0/1; found {invalid_labels}")

    return normalized_labels, [float(score) for score in scores]


def classification_metrics(labels: list[int], scores: list[float], *, threshold: float = 0.5) -> dict[str, Any]:
    label_values, score_values = _validate_inputs(labels, scores)
    predictions = [1 if score >= float(threshold) else 0 for score in score_values]
    tn, fp, fn, tp = confusion_matrix(label_values, predictions, labels=[0, 1]).ravel()

    metrics: dict[str, Any] = {
        "accuracy": float(accuracy_score(label_values, predictions)),
        "precision": float(precision_score(label_values, predictions, zero_division=0)),
        "recall": float(recall_score(label_values, predictions, zero_division=0)),
        "f1": float(f1_score(label_values, predictions, zero_division=0)),
        "confusion_matrix": {
            "tp": int(tp),
            "fp": int(fp),
            "tn": int(tn),
            "fn": int(fn),
        },
    }

    if len(set(label_values)) == 2:
        metrics["roc_auc"] = float(roc_auc_score(label_values, score_values))
        metrics["pr_auc"] = float(average_precision_score(label_values, score_values))
    else:
        metrics["roc_auc"] = 0.0
        metrics["pr_auc"] = 0.0

    return metrics


def top_k_hit_rate(labels: list[int], scores: list[float], *, k: int = 10) -> float:
    label_values, score_values = _validate_inputs(labels, scores)
    if int(k) <= 0:
        raise ValueError("k must be > 0")

    ranked = sorted(zip(score_values, label_values), key=lambda item: item[0], reverse=True)
    selected = ranked[: min(int(k), len(ranked))]
    if not selected:
        return 0.0
    return float(sum(label for _, label in selected) / len(selected))


def _read_labels_scores_jsonl(path: Path) -> tuple[list[int], list[float]]:
    labels: list[int] = []
    scores: list[float] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        payload = json.loads(line)
        if not isinstance(payload, dict):
            raise ValueError(f"line {line_number} must be a JSON object")
        if "label" not in payload or "score" not in payload:
            raise ValueError(f"line {line_number} must contain label and score")
        labels.append(int(payload["label"]))
        scores.append(float(payload["score"]))
    return labels, scores


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate package risk labels and scores.")
    parser.add_argument("--labels-scores-jsonl", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--top-k", type=int, default=10)
    args = parser.parse_args()

    labels, scores = _read_labels_scores_jsonl(args.labels_scores_jsonl)
    summary: dict[str, Any] = {
        "classification": classification_metrics(labels, scores, threshold=args.threshold),
        "top_k_hit_rate": top_k_hit_rate(labels, scores, k=args.top_k),
        "top_k": int(args.top_k),
        "threshold": float(args.threshold),
    }

    output_json = json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(output_json + "\n", encoding="utf-8")
    print(output_json)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
