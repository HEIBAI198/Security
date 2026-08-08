import json
import tempfile
import unittest
from pathlib import Path

from scripts.gnn.audit_package_risk_dataset import audit_dataset


class PackageRiskDatasetAuditTests(unittest.TestCase):
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
                nodes.append(
                    {
                        "id": f"pkg:npm:pkg-{index}",
                        "type": "package",
                        "ecosystem": "npm",
                        "package": f"pkg-{index}",
                        "label": label,
                        "label_source": "人工复核",
                        "label_confidence": 1.0,
                        "published": f"2026-01-0{index + 1}T00:00:00Z",
                        "features": {},
                    }
                )
            (data / "train_nodes.jsonl").write_text("\n".join(json.dumps(node) for node in nodes) + "\n", encoding="utf-8")
            (data / "train_edges.jsonl").write_text(
                json.dumps({"source": nodes[0]["id"], "target": nodes[1]["id"], "type": "depends_on"}) + "\n",
                encoding="utf-8",
            )
            (data / "feature_schema.json").write_text(json.dumps({"schema_version": 2, "task": "malicious_package"}), encoding="utf-8")
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


if __name__ == "__main__":
    unittest.main()
