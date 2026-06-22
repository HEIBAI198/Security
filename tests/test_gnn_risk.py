import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np

from scripts.gnn.train_package_risk import train_package_risk
from scripts.gnn.train_graphsage_package_risk import train_graphsage_package_risk
from scripts.gnn.train_pyg_graphsage_package_risk import train_pyg_graphsage_package_risk
from supplyguard.gnn_models import PackageRiskModelRegistry
from supplyguard.gnn_risk import PackageRiskScorer, _risk_keyword_count


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

    def test_package_name_substrings_do_not_count_as_risk_keywords(self):
        scorer = PackageRiskScorer(Path("definitely-missing-model-dir"))

        asttokens = scorer._feature_values("pypi", "asttokens", "3.0.1", [], [], "asttokens 3.0.1")
        pure_eval = scorer._feature_values("pypi", "pure-eval", "0.2.3", [], [], "pure-eval 0.2.3")
        suspicious = scorer._feature_values(
            "npm",
            "x-trader-codec",
            "4.7.1",
            ["install script: postinstall"],
            [],
            "x-trader-codec 4.7.1 install script: postinstall",
        )

        self.assertEqual(asttokens["risk_keyword_count"], 0.0)
        self.assertEqual(pure_eval["risk_keyword_count"], 0.0)
        self.assertEqual(_risk_keyword_count("pure-eval 0.2.3"), 0)
        self.assertGreaterEqual(suspicious["risk_keyword_count"], 1.0)

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

    def _write_sklearn_fixture(self, data_dir: Path):
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

    def _write_malformed_graphsage_artifact(self, model_dir: Path):
        np.savez_compressed(
            model_dir / "package_risk_gnn.npz",
            w1=np.zeros((2, 4), dtype=np.float32),
            b1=np.zeros(4, dtype=np.float32),
            w2=np.zeros((4, 1), dtype=np.float32),
            b2=np.zeros(1, dtype=np.float32),
            mean=np.zeros(6, dtype=np.float32),
            scale=np.ones(6, dtype=np.float32),
            feature_names=np.asarray(["ecosystem_npm", "ecosystem_pypi", "name_length"], dtype=np.str_),
            raw_feature_dim=np.asarray([3], dtype=np.int64),
        )

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
            self._write_sklearn_fixture(data_dir)
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

    def test_malformed_graphsage_artifact_falls_back_to_sklearn_model(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data_dir = root / "features"
            model_dir = root / "model"
            data_dir.mkdir()
            self._write_sklearn_fixture(data_dir)
            train_package_risk(data_dir, model_dir)
            self._write_malformed_graphsage_artifact(model_dir)

            scorer = PackageRiskScorer(model_dir)
            result = scorer.score_package(
                ecosystem="npm",
                name="evil",
                version="1.0.0",
                signals=["postinstall token exfiltration"],
            )

            self._assert_common_fields(result)
            self.assertTrue(result["model_available"])
            self.assertEqual(result["gnn_model_type"], "sklearn_logistic_regression_graph_features")
            self.assertNotEqual(result["gnn_model_type"], "rule_fallback")

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

    @unittest.skipUnless(HAS_TORCH_PYG, "torch/PyG not installed")
    def test_pyg_model_returns_similar_packages_from_embeddings(self):
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
                random_state=19,
            )

            scorer = PackageRiskScorer(model_dir)
            result = scorer.score_package("npm", "evil", "1.0.0", ["postinstall token"], [])

            self._assert_common_fields(result)
            self.assertEqual(result["gnn_model_type"], "pyg_graphsage_package_risk")
            self.assertTrue(result["similar_malicious_packages"])
            similar = result["similar_malicious_packages"][0]
            self.assertIn("package", similar)
            self.assertIn("ecosystem", similar)
            self.assertIn("score", similar)
            self.assertIn("reason", similar)

    @unittest.skipUnless(HAS_TORCH_PYG, "torch/PyG not installed")
    def test_pyg_prediction_applies_metadata_feature_scaling(self):
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
                random_state=23,
            )
            metadata_path = model_dir / "package_risk_graphsage_metadata.json"
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            metadata["feature_mean"] = [0.0 for _ in metadata["feature_names"]]
            metadata["feature_scale"] = [2.0 for _ in metadata["feature_names"]]
            metadata_path.write_text(json.dumps(metadata), encoding="utf-8")

            scorer = PackageRiskScorer(model_dir)
            captured: dict[str, Any] = {}
            original_forward = scorer.registry._pyg_model.forward

            def capturing_forward(data):
                captured["x"] = data.x.detach().cpu().numpy()
                return original_forward(data)

            scorer.registry._pyg_model.forward = capturing_forward
            scorer.score_package("npm", "evil", "1.0.0", ["postinstall token"], [])

            risk_index = scorer.registry.feature_names.index("risk_keyword_count")
            self.assertEqual(captured["x"][0][risk_index], 1.0)

    def test_pyg_prediction_calibrates_high_score_without_online_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            model_dir = Path(tmp)
            (model_dir / "package_risk_graphsage_metadata.json").write_text(
                json.dumps(
                    {
                        "model_type": "pyg_graphsage_package_risk",
                        "feature_names": ["risk_keyword_count"],
                        "input_dim": 1,
                        "hidden_dim": 4,
                        "dropout": 0.0,
                    }
                ),
                encoding="utf-8",
            )

            with mock.patch.object(PackageRiskModelRegistry, "_load_pyg_model", return_value=True):
                registry = PackageRiskModelRegistry(model_dir)
            registry.model_available = True
            registry.model = object()
            registry.model_type = "pyg_graphsage_package_risk"
            registry.feature_names = ["risk_keyword_count"]
            registry._pyg_model = object()
            registry._pyg_torch = object()
            registry._pyg_data_cls = object()
            with mock.patch.object(registry, "_predict_pyg_score", return_value=0.98):
                prediction = registry.predict({"risk_keyword_count": 0.0})

            self.assertLess(prediction["score"], 0.75)
            self.assertIn("online evidence calibration", prediction["explanations"][-1])


if __name__ == "__main__":
    unittest.main()
