import unittest

from scripts.gnn.evaluate_package_risk import classification_metrics, top_k_hit_rate


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

    def test_top_k_hit_rate_counts_positive_labels(self):
        self.assertEqual(top_k_hit_rate([0, 1, 0, 1], [0.2, 0.9, 0.8, 0.1], k=2), 0.5)

    def test_top_k_hit_rate_rejects_mismatched_lengths(self):
        with self.assertRaises(ValueError):
            top_k_hit_rate([1, 0], [0.9], k=1)


if __name__ == "__main__":
    unittest.main()
