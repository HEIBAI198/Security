import json
import math
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts.gnn.evaluate_package_risk import (
    _read_labels_scores_jsonl,
    classification_metrics,
    main,
    top_k_hit_rate,
)


class PackageRiskEvaluationTests(unittest.TestCase):
    def test_classification_metrics_include_pr_auc_and_confusion_matrix(self):
        metrics = classification_metrics([1, 1, 0, 0], [0.9, 0.8, 0.4, 0.1], threshold=0.5)

        self.assertEqual(metrics["accuracy"], 1.0)
        self.assertEqual(metrics["f1"], 1.0)
        self.assertIn("pr_auc", metrics)
        self.assertEqual(metrics["confusion_matrix"], {"tp": 2, "fp": 0, "tn": 2, "fn": 0})

    def test_classification_metrics_one_class_auc_values_are_zero(self):
        metrics = classification_metrics([1, 1, 1], [0.9, 0.8, 0.7], threshold=0.5)

        self.assertEqual(metrics["roc_auc"], 0.0)
        self.assertEqual(metrics["pr_auc"], 0.0)
        self.assertEqual(metrics["confusion_matrix"], {"tp": 3, "fp": 0, "tn": 0, "fn": 0})

    def test_classification_metrics_rejects_mismatched_lengths(self):
        with self.assertRaises(ValueError):
            classification_metrics([1, 0], [0.8], threshold=0.5)

    def test_classification_metrics_rejects_non_finite_threshold(self):
        for threshold in [math.nan, math.inf]:
            with self.subTest(threshold=threshold):
                with self.assertRaises(ValueError):
                    classification_metrics([1, 0], [0.8, 0.2], threshold=threshold)

    def test_classification_metrics_rejects_non_finite_scores(self):
        for score in [math.nan, math.inf, -math.inf]:
            with self.subTest(score=score):
                with self.assertRaises(ValueError):
                    classification_metrics([1, 0], [score, 0.2], threshold=0.5)

    def test_classification_metrics_rejects_non_integer_labels(self):
        for label in [True, False, 0.0, 0.9, "1"]:
            with self.subTest(label=label):
                with self.assertRaises(ValueError):
                    classification_metrics([label, 0], [0.8, 0.2], threshold=0.5)

    def test_top_k_hit_rate_counts_positive_labels(self):
        self.assertEqual(top_k_hit_rate([0, 1, 0, 1], [0.2, 0.9, 0.8, 0.1], k=2), 0.5)

    def test_top_k_hit_rate_uses_available_rows_when_k_exceeds_sample_count(self):
        self.assertEqual(top_k_hit_rate([1, 0], [0.7, 0.6], k=5), 0.5)

    def test_top_k_hit_rate_returns_zero_for_all_negative_labels(self):
        self.assertEqual(top_k_hit_rate([0, 0, 0], [0.9, 0.8, 0.7], k=2), 0.0)

    def test_top_k_hit_rate_rejects_non_positive_k(self):
        for k in [0, -1]:
            with self.subTest(k=k):
                with self.assertRaises(ValueError):
                    top_k_hit_rate([1, 0], [0.9, 0.1], k=k)

    def test_top_k_hit_rate_rejects_mismatched_lengths(self):
        with self.assertRaises(ValueError):
            top_k_hit_rate([1, 0], [0.9], k=1)

    def test_top_k_hit_rate_rejects_non_finite_scores(self):
        for score in [math.nan, math.inf, -math.inf]:
            with self.subTest(score=score):
                with self.assertRaises(ValueError):
                    top_k_hit_rate([1, 0], [score, 0.2], k=1)

    def test_top_k_hit_rate_rejects_non_integer_labels(self):
        for label in [True, False, 0.0, 0.9, "1"]:
            with self.subTest(label=label):
                with self.assertRaises(ValueError):
                    top_k_hit_rate([label, 0], [0.8, 0.2], k=1)

    def test_cli_writes_precision_at_k_alias(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            input_path = root / "scores.jsonl"
            output_path = root / "summary.json"
            input_path.write_text(
                "\n".join(
                    [
                        json.dumps({"label": 1, "score": 0.9}),
                        json.dumps({"label": 0, "score": 0.8}),
                    ]
                ),
                encoding="utf-8",
            )

            import sys

            original_argv = sys.argv
            try:
                sys.argv = [
                    "evaluate_package_risk.py",
                    "--labels-scores-jsonl",
                    str(input_path),
                    "--output",
                    str(output_path),
                    "--top-k",
                    "2",
                ]
                with open(os.devnull, "w", encoding="utf-8") as stdout:
                    with mock.patch("sys.stdout", stdout):
                        self.assertEqual(main(), 0)
            finally:
                sys.argv = original_argv

            summary = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(summary["top_k_hit_rate"], 0.5)
            self.assertEqual(summary["precision_at_k"], 0.5)

    def test_jsonl_reader_reports_invalid_json_line_number(self):
        with tempfile.TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "bad.jsonl"
            input_path.write_text('{"label": 1, "score": 0.9}\n{bad json}\n', encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "line 2"):
                _read_labels_scores_jsonl(input_path)

    def test_jsonl_reader_reports_missing_fields_line_number(self):
        with tempfile.TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "bad.jsonl"
            input_path.write_text('{"label": 1}\n', encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "line 1"):
                _read_labels_scores_jsonl(input_path)

    def test_jsonl_reader_preserves_raw_values_for_consistent_validation(self):
        with tempfile.TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "raw.jsonl"
            input_path.write_text(json.dumps({"label": "1", "score": "0.9"}) + "\n", encoding="utf-8")

            labels, scores = _read_labels_scores_jsonl(input_path)

            self.assertEqual(labels, ["1"])
            self.assertEqual(scores, ["0.9"])


if __name__ == "__main__":
    unittest.main()
