import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

from supplyguard.gnn_risk import PackageRiskScorer


class GnnAcceptanceCaseTests(unittest.TestCase):
    def _scorer(self, prediction):
        scorer = PackageRiskScorer(Path(tempfile.mkdtemp()))
        registry = Mock()
        registry.model_available = True
        registry.model_type = "numpy_graphsage_mean_aggregator"
        registry.artifact_status = "passed"
        registry.score_kind = "probability"
        registry.artifact_id = "candidate:test"
        registry.dataset_version = "dataset-test"
        registry.dataset_hash = "hash-test"
        registry.trained_at = "2026-08-08T00:00:00Z"
        registry.predict.return_value = {
            "model_available": True,
            "score": prediction["score"],
            "confidence": prediction.get("confidence", 0.9),
            "raw_confidence": prediction.get("confidence", 0.9),
            "reliability": prediction.get("reliability", "model"),
            "inference_mode": "package_features_only",
            "model_type": registry.model_type,
            "decision_threshold": 0.5,
            "calibration_temperature": 1.0,
            "artifact_id": registry.artifact_id,
            "data_quality_status": registry.artifact_status,
            "score_kind": registry.score_kind,
            "explanations": [],
        }
        registry.similar_packages.return_value = []
        scorer.registry = registry
        scorer.model_available = True
        return scorer

    def test_confirmed_malicious_package_is_malicious(self):
        result = self._scorer({"score": 0.96}).score_package("npm", "confirmed-malware", "1.0.0")
        self.assertEqual(result["gnn_decision_status"], "malicious")
        self.assertEqual(result["gnn_score_kind"], "probability")

    def test_normal_popular_package_is_benign_without_risk_evidence(self):
        result = self._scorer({"score": 0.04}).score_package("npm", "popular-normal", "1.0.0")
        self.assertEqual(result["gnn_decision_status"], "benign")
        self.assertFalse(result["gnn_evidence_conflict"])

    def test_axios_low_probability_conflicts_with_high_comprehensive_risk(self):
        result = self._scorer({"score": 0.0283, "confidence": 0.8}).score_package(
            "npm", "axios", "1.6.8", vulnerabilities=[{"id": "GHSA-test", "status": "active"}], existing_risk=100
        )
        self.assertEqual(result["gnn_decision_status"], "conflict")
        self.assertTrue(result["gnn_evidence_conflict"])
        self.assertEqual(result["gnn_score"], 0.0283)

    def test_unseen_abnormal_package_is_abstained(self):
        result = self._scorer({"score": 0.99, "reliability": "out_of_distribution"}).score_package(
            "npm", "unseen-abnormal-package-999", "99.0.0"
        )
        self.assertEqual(result["gnn_decision_status"], "abstain")
        self.assertEqual(result["gnn_reliability"], "out_of_distribution")

    def test_builtin_demo_package_is_not_abstained_when_ood(self):
        result = self._scorer({"score": 0.31, "reliability": "out_of_distribution"}).score_package(
            "npm", "event-stream", "3.3.6", vulnerabilities=[{"id": "DEMO", "status": "active"}], existing_risk=100
        )
        self.assertEqual(result["gnn_decision_status"], "conflict")
        self.assertEqual(result["gnn_reliability"], "demo_calibrated")
        self.assertEqual(result["gnn_score_kind"], "similarity")


if __name__ == "__main__":
    unittest.main()
