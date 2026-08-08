from __future__ import annotations

import argparse
import json
import math
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


def _validate_inputs(labels: list[Any], scores: list[Any]) -> tuple[list[int], list[float]]:
    if len(labels) != len(scores):
        raise ValueError("labels and scores must have the same length")
    if not labels:
        raise ValueError("labels and scores must contain at least one sample")

    normalized_labels: list[int] = []
    for label in labels:
        if type(label) is not int or label not in {0, 1}:
            raise ValueError("labels must be strict binary integers 0/1")
        normalized_labels.append(label)

    normalized_scores: list[float] = []
    for score in scores:
        if isinstance(score, bool) or not isinstance(score, (int, float)):
            raise ValueError("scores must be finite numeric values")
        score_value = float(score)
        if not math.isfinite(score_value):
            raise ValueError("scores must be finite numeric values")
        normalized_scores.append(score_value)

    return normalized_labels, normalized_scores


def classification_metrics(labels: list[int], scores: list[float], *, threshold: float = 0.5) -> dict[str, Any]:
    label_values, score_values = _validate_inputs(labels, scores)
    threshold_value = float(threshold)
    if not math.isfinite(threshold_value):
        raise ValueError("threshold must be finite")

    predictions = [1 if score >= threshold_value else 0 for score in score_values]
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

    clipped_scores = [min(1.0, max(0.0, score)) for score in score_values]
    metrics["brier_score"] = float(
        sum((score - label) ** 2 for score, label in zip(clipped_scores, label_values)) / len(label_values)
    )
    metrics["ece"] = expected_calibration_error(label_values, clipped_scores)

    if len(set(label_values)) == 2:
        metrics["roc_auc"] = float(roc_auc_score(label_values, score_values))
        metrics["pr_auc"] = float(average_precision_score(label_values, score_values))
    else:
        metrics["roc_auc"] = 0.0
        metrics["pr_auc"] = 0.0

    return metrics


def expected_calibration_error(labels: list[int], scores: list[float], *, bins: int = 10) -> float:
    """计算等宽分箱 ECE，数值越低表示概率越接近真实命中率。"""
    label_values, score_values = _validate_inputs(labels, scores)
    if int(bins) <= 0:
        raise ValueError("bins must be > 0")
    total = len(label_values)
    error = 0.0
    for index in range(int(bins)):
        lower = index / float(bins)
        upper = (index + 1) / float(bins)
        members = [
            (label, min(1.0, max(0.0, score)))
            for label, score in zip(label_values, score_values)
            if (lower <= score < upper) or (index == bins - 1 and score == upper)
        ]
        if not members:
            continue
        accuracy = sum(label for label, _ in members) / len(members)
        confidence = sum(score for _, score in members) / len(members)
        error += len(members) / total * abs(accuracy - confidence)
    return float(error)


def select_threshold(labels: list[int], scores: list[float]) -> float:
    """只在验证集上按 F1 选择阈值；类别不足时回退到 0.5。"""
    label_values, score_values = _validate_inputs(labels, scores)
    if len(set(label_values)) < 2:
        return 0.5
    best = (float("-inf"), 0.5, float("-inf"), float("-inf"))
    for index in range(5, 96, 5):
        threshold = index / 100.0
        candidate = classification_metrics(label_values, score_values, threshold=threshold)
        rank = (float(candidate["f1"]), threshold, float(candidate["precision"]), -abs(threshold - 0.5))
        if (rank[0], rank[2], rank[3]) > (best[0], best[2], best[3]):
            best = rank
    return float(best[1])


def fit_temperature(labels: list[int], scores: list[float]) -> float:
    """在验证集上网格搜索温度，避免把未经校准的距离当成概率。"""
    label_values, score_values = _validate_inputs(labels, scores)
    if len(set(label_values)) < 2:
        return 1.0
    import numpy as np

    logits = np.log(np.clip(score_values, 1e-6, 1 - 1e-6) / np.clip(1 - np.asarray(score_values), 1e-6, 1))
    target = np.asarray(label_values, dtype=float)
    best_temperature, best_loss = 1.0, float("inf")
    for temperature in np.linspace(0.25, 4.0, 31):
        calibrated = 1.0 / (1.0 + np.exp(-np.clip(logits / temperature, -40, 40)))
        loss = float(-np.mean(target * np.log(np.clip(calibrated, 1e-6, 1 - 1e-6)) + (1 - target) * np.log(np.clip(1 - calibrated, 1e-6, 1 - 1e-6))))
        if loss < best_loss:
            best_loss, best_temperature = loss, float(temperature)
    return best_temperature


def apply_temperature(scores: list[float], temperature: float) -> list[float]:
    import numpy as np

    temperature_value = max(0.05, float(temperature))
    values = np.asarray(scores, dtype=float)
    logits = np.log(np.clip(values, 1e-6, 1 - 1e-6) / np.clip(1 - values, 1e-6, 1))
    calibrated = 1.0 / (1.0 + np.exp(-np.clip(logits / temperature_value, -40, 40)))
    return [float(value) for value in calibrated.tolist()]


def top_k_hit_rate(labels: list[int], scores: list[float], *, k: int = 10) -> float:
    """Return the positive-label fraction among the top-k scores, also known as precision@k."""
    label_values, score_values = _validate_inputs(labels, scores)
    if int(k) <= 0:
        raise ValueError("k must be > 0")

    ranked = sorted(zip(score_values, label_values), key=lambda item: item[0], reverse=True)
    selected = ranked[: min(int(k), len(ranked))]
    if not selected:
        return 0.0
    return float(sum(label for _, label in selected) / len(selected))


def _read_labels_scores_jsonl(path: Path) -> tuple[list[Any], list[Any]]:
    labels: list[Any] = []
    scores: list[Any] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"line {line_number} must be valid JSON") from exc
        if not isinstance(payload, dict):
            raise ValueError(f"line {line_number} must be a JSON object")
        if "label" not in payload or "score" not in payload:
            raise ValueError(f"line {line_number} must contain label and score")
        labels.append(payload["label"])
        scores.append(payload["score"])
    return labels, scores


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate package risk labels and scores.")
    parser.add_argument("--labels-scores-jsonl", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--validation-labels-scores-jsonl", type=Path)
    parser.add_argument("--auto-calibrate", action="store_true")
    parser.add_argument("--top-k", type=int, default=10)
    args = parser.parse_args()

    labels, scores = _read_labels_scores_jsonl(args.labels_scores_jsonl)
    threshold = float(args.threshold)
    temperature = 1.0
    calibration_source = "fixed"
    if args.auto_calibrate:
        if args.validation_labels_scores_jsonl is None:
            raise ValueError("--auto-calibrate 需要 --validation-labels-scores-jsonl")
        validation_labels, validation_scores = _read_labels_scores_jsonl(args.validation_labels_scores_jsonl)
        validation_labels, validation_scores = _validate_inputs(validation_labels, validation_scores)
        temperature = fit_temperature(validation_labels, validation_scores)
        threshold = select_threshold(validation_labels, apply_temperature(validation_scores, temperature))
        calibration_source = "validation"
    calibrated_scores = apply_temperature(scores, temperature)
    precision_at_k = top_k_hit_rate(labels, scores, k=args.top_k)
    summary: dict[str, Any] = {
        "classification": classification_metrics(labels, calibrated_scores, threshold=threshold),
        "precision_at_k": precision_at_k,
        "top_k_hit_rate": precision_at_k,
        "top_k": int(args.top_k),
        "threshold": threshold,
        "temperature": temperature,
        "calibration_source": calibration_source,
    }

    output_json = json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(output_json + "\n", encoding="utf-8")
    print(output_json)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
