import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from scripts.gnn.train_package_risk import train_package_risk
from scripts.gnn.train_graphsage_package_risk import train_graphsage_package_risk
from scripts.gnn.train_pyg_graphsage_package_risk import train_pyg_graphsage_package_risk
from supplyguard.gnn_risk import PackageRiskScorer


HAS_TORCH_PYG = bool(importlib.util.find_spec("torch") and importlib.util.find_spec("torch_geometric"))


class PackageRiskScorerTests(unittest.TestCase):
    def _assert_common_fields(self, result):
        for key in [
            "model_available",
            "model_type",
            "gnn_model_available",
            "gnn_model_type",
            "gnn_score",
            "gnn_label",
            "gnn_reasons",
            "gnn_confidence",
            "gnn_explanations",
            "similar_malicious_packages",
        ]:
            self.assertIn(key, result)
        self.assertEqual(result["gnn_model_available"], result["model_available"])
        self.assertEqual(result["gnn_model_type"], result["model_type"])
        self.assertGreaterEqual(result["gnn_score"], 0.0)
        self.assertLessEqual(result["gnn_score"], 1.0)
        self.assertGreaterEqual(result["gnn_confidence"], 0.0)
        self.assertLessEqual(result["gnn_confidence"], 1.0)
        self.assertIsInstance(result["gnn_reasons"], list)
        self.assertIsInstance(result["gnn_explanations"], list)
        self.assertIsInstance(result["similar_malicious_packages"], list)

    def _write_graphsage_fixture(self, data_dir: Path):
        (data_dir / "feature_schema.json").write_text(
            json.dumps(
                {
                    "features": [
                        "ecosystem_npm",
                        "ecosystem_pypi",
                        "name_length",
                        "name_separator_count",
                        "has_scope",
                        "has_digits",
                        "version_count",
                        "alias_count",
                        "evidence_source_count",
                        "risk_keyword_count",
                        "text_length",
                    ]
                }
            ),
            encoding="utf-8",
        )
        nodes = [
            {
                "id": "pkg:npm:evil",
                "label": 1,
                "features": {
                    "ecosystem_npm": 1,
                    "ecosystem_pypi": 0,
                    "name_length": 4,
                    "name_separator_count": 0,
                    "has_scope": 0,
                    "has_digits": 0,
                    "version_count": 1,
                    "alias_count": 1,
                    "evidence_source_count": 1,
                    "risk_keyword_count": 3,
                    "text_length": 48,
                },
            },
            {
                "id": "pkg:npm:token-stealer",
                "label": 1,
                "features": {
                    "ecosystem_npm": 1,
                    "ecosystem_pypi": 0,
                    "name_length": 13,
                    "name_separator_count": 1,
                    "has_scope": 0,
                    "has_digits": 0,
                    "version_count": 1,
                    "alias_count": 1,
                    "evidence_source_count": 1,
                    "risk_keyword_count": 2,
                    "text_length": 52,
                },
            },
            {
                "id": "pkg:pypi:requests",
                "label": 0,
                "features": {
                    "ecosystem_npm": 0,
                    "ecosystem_pypi": 1,
                    "name_length": 8,
                    "name_separator_count": 0,
                    "has_scope": 0,
                    "has_digits": 0,
                    "version_count": 1,
                    "alias_count": 0,
                    "evidence_source_count": 1,
                    "risk_keyword_count": 0,
                    "text_length": 16,
                },
            },
            {
                "id": "pkg:pypi:flask",
                "label": 0,
                "features": {
                    "ecosystem_npm": 0,
                    "ecosystem_pypi": 1,
                    "name_length": 5,
                    "name_separator_count": 0,
                    "has_scope": 0,
                    "has_digits": 0,
                    "version_count": 1,
                    "alias_count": 0,
                    "evidence_source_count": 1,
                    "risk_keyword_count": 0,
                    "text_length": 14,
                },
            },
        ]
        edges = [
            {"source": "pkg:npm:evil", "target": "signal:token", "type": "has_risk_signal"},
            {"source": "pkg:npm:token-stealer", "target": "signal:token", "type": "has_risk_signal"},
            {"source": "pkg:pypi:requests", "target": "source:requirements", "type": "observed_in"},
            {"source": "pkg:pypi:flask", "target": "source:requirements", "type": "observed_in"},
        ]
        (data_dir / "train_nodes.jsonl").write_text(
            "\n".join(json.dumps(node) for node in nodes) + "\n",
            encoding="utf-8",
        )
        (data_dir / "train_edges.jsonl").write_text(
            "\n".join(json.dumps(edge) for edge in edges) + "\n",
            encoding="utf-8",
        )

    def _write_pyg_graphsage_fixture(self, data_dir: Path):
        self._write_graphsage_fixture(data_dir)
        splits = {
            "train": ["pkg:npm:evil", "pkg:pypi:requests"],
            "val": ["pkg:npm:token-stealer"],
            "test": ["pkg:pypi:flask"],
        }
        (data_dir / "splits.json").write_text(json.dumps(splits), encoding="utf-8")

    def test_missing_model_uses_rule_fallback(self):
        with tempfile.TemporaryDirectory() as tmp:
            scorer = PackageRiskScorer(Path(tmp) / "missing")

            result = scorer.score_package(
                ecosystem="npm",
                name="left-pad",
                version="1.0.0",
                signals=["install script: postinstall"],
                vulnerabilities=[{"id": "GHSA-test"}],
            )

            self._assert_common_fields(result)
            self.assertFalse(result["model_available"])
            self.assertFalse(result["gnn_model_available"])
            self.assertEqual(result["model_type"], "rule_fallback")
            self.assertEqual(result["gnn_model_type"], "rule_fallback")
            self.assertGreaterEqual(result["gnn_score"], 0.5)
            self.assertEqual(result["gnn_label"], "elevated")
            self.assertIn("rule fallback", result["gnn_reasons"][0])

    def test_loads_trained_model_and_scores_package(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data_dir = root / "features"
            model_dir = root / "model"
            data_dir.mkdir()
            (data_dir / "feature_schema.json").write_text(
                json.dumps(
                    {
                        "features": [
                            "ecosystem_npm",
                            "ecosystem_pypi",
                            "name_length",
                            "name_separator_count",
                            "has_scope",
                            "has_digits",
                            "version_count",
                            "alias_count",
                            "evidence_source_count",
                            "risk_keyword_count",
                            "text_length",
                        ]
                    }
                ),
                encoding="utf-8",
            )
            nodes = [
                {
                    "id": "pkg:npm:evil",
                    "label": 1,
                    "features": {
                        "ecosystem_npm": 1,
                        "ecosystem_pypi": 0,
                        "name_length": 4,
                        "name_separator_count": 0,
                        "has_scope": 0,
                        "has_digits": 0,
                        "version_count": 1,
                        "alias_count": 1,
                        "evidence_source_count": 0,
                        "risk_keyword_count": 2,
                        "text_length": 32,
                    },
                },
                {
                    "id": "pkg:pypi:requests",
                    "label": 0,
                    "features": {
                        "ecosystem_npm": 0,
                        "ecosystem_pypi": 1,
                        "name_length": 8,
                        "name_separator_count": 0,
                        "has_scope": 0,
                        "has_digits": 0,
                        "version_count": 1,
                        "alias_count": 0,
                        "evidence_source_count": 1,
                        "risk_keyword_count": 0,
                        "text_length": 16,
                    },
                },
            ]
            edges = [
                {"source": "pkg:npm:evil", "target": "signal:postinstall", "type": "has_risk_signal"},
                {"source": "pkg:pypi:requests", "target": "source:requirements", "type": "observed_in"},
            ]
            (data_dir / "train_nodes.jsonl").write_text(
                "\n".join(json.dumps(node) for node in nodes) + "\n",
                encoding="utf-8",
            )
            (data_dir / "train_edges.jsonl").write_text(
                "\n".join(json.dumps(edge) for edge in edges) + "\n",
                encoding="utf-8",
            )
            train_package_risk(data_dir, model_dir)

            scorer = PackageRiskScorer(model_dir)
            result = scorer.score_package(
                ecosystem="npm",
                name="evil",
                version="1.0.0",
                signals=["postinstall token exfiltration"],
            )

            self._assert_common_fields(result)
            self.assertTrue(result["model_available"])
            self.assertGreaterEqual(result["gnn_score"], 0.0)
            self.assertLessEqual(result["gnn_score"], 1.0)
            self.assertIn(result["gnn_label"], {"low", "elevated", "high"})

    def test_prefers_graphsage_model_when_available(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data_dir = root / "features"
            model_dir = root / "model"
            data_dir.mkdir()
            self._write_graphsage_fixture(data_dir)
            train_graphsage_package_risk(
                data_dir,
                model_dir,
                epochs=12,
                hidden_dim=6,
                random_state=3,
            )

            scorer = PackageRiskScorer(model_dir)
            result = scorer.score_package(
                ecosystem="npm",
                name="evil",
                version="1.0.0",
                signals=["postinstall token exfiltration"],
            )

            self._assert_common_fields(result)
            self.assertTrue(result["model_available"])
            self.assertEqual(result["model_type"], "numpy_graphsage_mean_aggregator")
            self.assertEqual(result["gnn_model_type"], "numpy_graphsage_mean_aggregator")
            self.assertGreaterEqual(result["gnn_score"], 0.0)
            self.assertLessEqual(result["gnn_score"], 1.0)

    def test_pyg_artifact_failure_falls_back_to_numpy_model(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            model_dir = root / "model"
            data_dir = root / "features"
            model_dir.mkdir()
            data_dir.mkdir()
            (model_dir / "package_risk_graphsage.pt").write_bytes(b"not a valid torch model")
            (model_dir / "package_risk_graphsage_metadata.json").write_text(
                json.dumps({"model_type": "pyg_graphsage_package_risk"}),
                encoding="utf-8",
            )
            self._write_graphsage_fixture(data_dir)
            train_graphsage_package_risk(data_dir, model_dir, epochs=4, hidden_dim=4, random_state=11)

            scorer = PackageRiskScorer(model_dir)
            result = scorer.score_package("npm", "evil", "1.0.0", ["postinstall token"], [])

            self._assert_common_fields(result)
            self.assertTrue(result["model_available"])
            self.assertEqual(result["gnn_model_type"], "numpy_graphsage_mean_aggregator")
            self.assertIn("gnn_confidence", result)
            self.assertIn("gnn_explanations", result)
            self.assertIn("similar_malicious_packages", result)

    @unittest.skipUnless(HAS_TORCH_PYG, "torch/PyG not installed")
    def test_valid_pyg_artifact_wins_loader_priority(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data_dir = root / "features"
            model_dir = root / "model"
            data_dir.mkdir()
            self._write_pyg_graphsage_fixture(data_dir)
            train_pyg_graphsage_package_risk(
                data_dir,
                model_dir,
                epochs=2,
                hidden_dim=4,
                dropout=0.0,
                random_state=17,
            )
            train_graphsage_package_risk(data_dir, model_dir, epochs=4, hidden_dim=4, random_state=11)

            scorer = PackageRiskScorer(model_dir)
            result = scorer.score_package("npm", "evil", "1.0.0", ["postinstall token"], [])

            self._assert_common_fields(result)
            self.assertTrue(result["model_available"])
            self.assertEqual(result["gnn_model_type"], "pyg_graphsage_package_risk")
            self.assertGreaterEqual(result["gnn_score"], 0.0)
            self.assertLessEqual(result["gnn_score"], 1.0)


if __name__ == "__main__":
    unittest.main()
