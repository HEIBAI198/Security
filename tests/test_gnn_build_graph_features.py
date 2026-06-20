import json
import tempfile
import unittest
from pathlib import Path

from scripts.gnn.build_graph_features import build_graph_features


class GraphFeatureBuilderTests(unittest.TestCase):
    def test_builds_package_nodes_edges_and_feature_schema(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            positive_path = root / "positives.jsonl"
            negative_path = root / "negatives.jsonl"
            output_dir = root / "features"

            positive_path.write_text(
                json.dumps(
                    {
                        "ecosystem": "npm",
                        "package": "evil-pkg",
                        "raw_package": "evil-pkg",
                        "label": 1,
                        "aliases": ["MAL-TEST"],
                        "affected_versions": ["1.0.0", "1.0.1"],
                        "text": "postinstall script exfiltrates tokens",
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            negative_path.write_text(
                json.dumps(
                    {
                        "ecosystem": "pypi",
                        "package": "requests",
                        "raw_package": "requests",
                        "label": 0,
                        "versions": ["2.31.0"],
                        "evidence_sources": ["requirements.txt"],
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            stats = build_graph_features(positive_path, negative_path, output_dir)

            nodes = [
                json.loads(line)
                for line in (output_dir / "train_nodes.jsonl")
                .read_text(encoding="utf-8")
                .splitlines()
            ]
            edges = [
                json.loads(line)
                for line in (output_dir / "train_edges.jsonl")
                .read_text(encoding="utf-8")
                .splitlines()
            ]
            schema = json.loads((output_dir / "feature_schema.json").read_text())

            self.assertEqual(stats["package_nodes"], 2)
            self.assertIn("risk_keyword_count", schema["features"])

            node_by_id = {node["id"]: node for node in nodes}
            evil = node_by_id["pkg:npm:evil-pkg"]
            requests = node_by_id["pkg:pypi:requests"]
            self.assertEqual(evil["label"], 1)
            self.assertEqual(requests["label"], 0)
            self.assertGreater(
                evil["features"]["risk_keyword_count"],
                requests["features"]["risk_keyword_count"],
            )

            edge_keys = {(edge["source"], edge["target"], edge["type"]) for edge in edges}
            self.assertIn(("pkg:npm:evil-pkg", "ecosystem:npm", "in_ecosystem"), edge_keys)
            self.assertIn(
                ("pkg:npm:evil-pkg", "signal:postinstall", "has_risk_signal"),
                edge_keys,
            )
            self.assertIn(
                ("pkg:pypi:requests", "source:requirements", "observed_in"),
                edge_keys,
            )

    def test_builds_features_from_multiple_negative_files_and_writes_splits(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            positive = root / "positive.jsonl"
            weak_negative = root / "weak.jsonl"
            ecosystem_negative = root / "ecosystem.jsonl"
            output = root / "features"
            positive.write_text(
                json.dumps(
                    {
                        "ecosystem": "npm",
                        "package": "evil",
                        "text": "postinstall token",
                        "label": 1,
                        "evidence_sources": ["osv"],
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            weak_negative.write_text(
                json.dumps(
                    {
                        "ecosystem": "npm",
                        "package": "safe",
                        "text": "safe package",
                        "label": 0,
                        "evidence_sources": ["local"],
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            ecosystem_negative.write_text(
                json.dumps(
                    {
                        "ecosystem": "pypi",
                        "package": "requests",
                        "text": "http client",
                        "label": 0,
                        "evidence_sources": ["ecosystem_metadata"],
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            summary = build_graph_features(positive, [weak_negative, ecosystem_negative], output)

            self.assertEqual(summary["negative_records"], 2)
            self.assertTrue((output / "splits.json").exists())
            self.assertTrue((output / "dataset_card.json").exists())
            splits = json.loads((output / "splits.json").read_text(encoding="utf-8"))
            self.assertEqual(set(splits), {"train", "val", "test"})


if __name__ == "__main__":
    unittest.main()
