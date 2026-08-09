import json
import tempfile
import unittest
from pathlib import Path

from scripts.gnn.audit_package_risk_dataset import audit_dataset


class PackageRiskDatasetAuditTests(unittest.TestCase):
    def test_rejects_label_and_provenance_proxy_contract(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            nodes = [
                {
                    "id": "pkg:npm:bad",
                    "type": "package",
                    "package": "bad",
                    "label": 1,
                    "label_source": "review",
                    "label_confidence": 1.0,
                    "published": "2026-01-01T00:00:00Z",
                    "features": {},
                },
                {
                    "id": "pkg:npm:good",
                    "type": "package",
                    "package": "good",
                    "label": 0,
                    "label_source": "review",
                    "label_confidence": 1.0,
                    "published": "2026-01-02T00:00:00Z",
                    "features": {},
                },
            ]
            (data / "train_nodes.jsonl").write_text(
                "\n".join(json.dumps(node) for node in nodes) + "\n",
                encoding="utf-8",
            )
            (data / "train_edges.jsonl").write_text(
                json.dumps({"source": nodes[0]["id"], "target": nodes[1]["id"], "type": "depends_on"}) + "\n",
                encoding="utf-8",
            )
            (data / "feature_schema.json").write_text(
                json.dumps(
                    {
                        "task": "malicious_package",
                        "features": ["risk_keyword_count", "evidence_source_count"],
                        "risk_keywords": ["malicious"],
                        "training_edge_types": ["depends_on", "observed_in"],
                    }
                ),
                encoding="utf-8",
            )
            (data / "splits.json").write_text(
                json.dumps({"train": [nodes[0]["id"], nodes[1]["id"]], "val": [], "test": []}),
                encoding="utf-8",
            )

            report = audit_dataset(data, max_positive_ratio=1.0, min_negative_samples=1)

            self.assertFalse(report["ready_for_training"])
            self.assertEqual(report["label_leakage_checks"]["proxy_features"], ["evidence_source_count"])
            self.assertEqual(report["label_leakage_checks"]["proxy_keywords"], ["malicious"])
            self.assertEqual(report["label_leakage_checks"]["forbidden_training_edge_types"], ["observed_in"])

    def test_reports_label_imbalance_missing_provenance_and_missing_dependencies(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            nodes = [
                {"id": f"pkg:npm:evil-{index}", "type": "package", "ecosystem": "npm", "package": f"evil-{index}", "label": 1, "features": {}}
                for index in range(4)
            ] + [
                {"id": "pkg:npm:safe", "type": "package", "ecosystem": "npm", "package": "safe", "label": 0, "features": {}}
            ]
            (data / "train_nodes.jsonl").write_text(
                "\n".join(json.dumps(node) for node in nodes) + "\n",
                encoding="utf-8",
            )
            (data / "train_edges.jsonl").write_text("", encoding="utf-8")
            (data / "feature_schema.json").write_text(
                json.dumps({"schema_version": 2, "task": "malicious_package"}),
                encoding="utf-8",
            )
            (data / "splits.json").write_text(
                json.dumps({"train": [node["id"] for node in nodes[:3]], "val": [nodes[3]["id"]], "test": [nodes[4]["id"]]}),
                encoding="utf-8",
            )

            report = audit_dataset(data, max_positive_ratio=0.7, min_negative_samples=2)

            self.assertFalse(report["ready_for_training"])
            self.assertEqual(report["task"], "malicious_package")
            self.assertEqual(report["label_counts"], {"positive": 4, "negative": 1})
            self.assertTrue(any("正样本占比" in warning for warning in report["warnings"]))
            self.assertTrue(any("标签来源" in warning for warning in report["warnings"]))
            self.assertTrue(any("depends_on" in warning for warning in report["warnings"]))
            self.assertTrue(any("高置信正常包" in warning for warning in report["warnings"]))

    def test_accepts_balanced_provenance_data_with_dependency_edges(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            nodes = []
            for index, label in enumerate([1, 0, 1, 0, 1, 0]):
                ecosystem = "pypi" if index == 3 else "npm"
                package = "example-safe" if index == 3 else f"pkg-{index}"
                nodes.append(
                    {
                        "id": f"pkg:{ecosystem}:{package}",
                        "type": "package",
                        "ecosystem": ecosystem,
                        "package": package,
                        "label": label,
                        "label_source": "人工复核",
                        "label_confidence": 1.0,
                        "review_tier": "explicit_curated",
                        "published": f"2026-01-0{index + 1}T00:00:00Z",
                        "maintainers": [{"name": "maintainer"}],
                        "repository": "https://github.com/example/pkg",
                        "license": "MIT",
                        "features": {},
                    }
                )
            (data / "train_nodes.jsonl").write_text("\n".join(json.dumps(node) for node in nodes) + "\n", encoding="utf-8")
            (data / "train_edges.jsonl").write_text(
                json.dumps({"source": nodes[0]["id"], "target": nodes[1]["id"], "type": "depends_on"}) + "\n",
                encoding="utf-8",
            )
            (data / "feature_schema.json").write_text(
                json.dumps(
                    {
                        "schema_version": 2,
                        "task": "malicious_package",
                        "split_policy": "time",
                    }
                ),
                encoding="utf-8",
            )
            (data / "splits.json").write_text(
                json.dumps({"train": [node["id"] for node in nodes[:2]], "val": [node["id"] for node in nodes[2:4]], "test": [node["id"] for node in nodes[4:]]}),
                encoding="utf-8",
            )

            report = audit_dataset(data, max_positive_ratio=0.8, min_negative_samples=3)

            self.assertTrue(report["ready_for_training"])
            self.assertEqual(report["dependency_edge_count"], 1)
            self.assertEqual(report["trusted_negative_count"], 3)
            self.assertEqual(report["hard_negative_count"], 0)
            self.assertIn("heterogeneous_relation_coverage", report)
            self.assertEqual(report["warnings"], [])
            self.assertEqual(report["split_policy"], "time")
            self.assertGreaterEqual(report["pypi_negative_coverage"], 0.25)

    def test_warns_without_pypi_negatives_or_balance(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            nodes = []
            for index, label in enumerate([1, 1, 1, 0]):
                nodes.append(
                    {
                        "id": f"pkg:npm:pkg-{index}",
                        "type": "package",
                        "ecosystem": "npm",
                        "package": f"pkg-{index}",
                        "label": label,
                        "label_source": "review",
                        "label_confidence": 1.0,
                        "published": f"2026-01-0{index + 1}T00:00:00Z",
                        "features": {},
                    }
                )
            (data / "train_nodes.jsonl").write_text(
                "\n".join(json.dumps(node) for node in nodes) + "\n",
                encoding="utf-8",
            )
            (data / "train_edges.jsonl").write_text("", encoding="utf-8")
            (data / "feature_schema.json").write_text(
                json.dumps(
                    {
                        "schema_version": 2,
                        "task": "malicious_package",
                        "split_policy": "time",
                    }
                ),
                encoding="utf-8",
            )
            (data / "splits.json").write_text(
                json.dumps(
                    {
                        "train": [node["id"] for node in nodes[:2]],
                        "val": [nodes[2]["id"]],
                        "test": [nodes[3]["id"]],
                    }
                ),
                encoding="utf-8",
            )

            report = audit_dataset(data, max_positive_ratio=1.0, min_negative_samples=1)

            self.assertFalse(report["ready_for_training"])
            self.assertTrue(any("PyPI 负样本" in warning for warning in report["warnings"]))
            self.assertTrue(any("负/正样本比" in warning for warning in report["warnings"]))


if __name__ == "__main__":
    unittest.main()
