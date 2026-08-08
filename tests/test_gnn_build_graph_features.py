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
            dataset_card = json.loads(
                (output / "dataset_card.json").read_text(encoding="utf-8")
            )
            expected_split_counts = {
                split_name: len(node_ids) for split_name, node_ids in splits.items()
            }
            self.assertEqual(dataset_card["positive_records"], 1)
            self.assertEqual(dataset_card["negative_records"], 2)
            self.assertEqual(dataset_card["node_count"], 3)
            self.assertEqual(dataset_card["edge_count"], summary["edge_count"])
            self.assertEqual(
                dataset_card["negative_sources"],
                [str(weak_negative), str(ecosystem_negative)],
            )
            self.assertEqual(dataset_card["split_counts"], expected_split_counts)
            self.assertEqual(
                dataset_card["created_by"],
                "scripts/gnn/build_graph_features.py",
            )
            self.assertEqual(dataset_card["task"], "malicious_package")
            self.assertIn("label_definition", dataset_card)

    def test_builds_real_dependency_edges_and_label_provenance(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            positive = root / "positive.jsonl"
            negative = root / "negative.jsonl"
            output = root / "features"
            positive.write_text(
                json.dumps(
                    {
                        "ecosystem": "npm",
                        "package": "app",
                        "label": 1,
                        "label_source": "OpenSSF malicious-packages",
                        "label_confidence": 1.0,
                        "version": "1.2.3",
                        "published": "2024-01-01T00:00:00Z",
                        "maintainers": [{"name": "maintainer"}],
                        "repository": "https://github.com/example/app",
                        "install_scripts": {"postinstall": "node install.js"},
                        "dependencies": ["@scope/core@2.0.0", {"name": "left-pad", "ecosystem": "npm"}],
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            negative.write_text(
                json.dumps(
                    {
                        "ecosystem": "npm",
                        "package": "left-pad",
                        "label": 0,
                        "label_source": "npm_registry_review",
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            build_graph_features(positive, negative, output)

            nodes = [json.loads(line) for line in (output / "train_nodes.jsonl").read_text(encoding="utf-8").splitlines()]
            edges = [json.loads(line) for line in (output / "train_edges.jsonl").read_text(encoding="utf-8").splitlines()]
            app = next(node for node in nodes if node["id"] == "pkg:npm:app")
            edge_keys = {(edge["source"], edge["target"], edge["type"]) for edge in edges}

            self.assertEqual(app["label_source"], "OpenSSF malicious-packages")
            self.assertEqual(app["label_confidence"], 1.0)
            self.assertEqual(app["version"], "1.2.3")
            self.assertEqual(app["maintainers"], [{"name": "maintainer"}])
            self.assertEqual(app["repository"], "https://github.com/example/app")
            self.assertEqual(app["install_scripts"], {"postinstall": "node install.js"})
            self.assertIn(("pkg:npm:app", "pkg:npm:@scope/core", "depends_on"), edge_keys)
            self.assertIn(("pkg:npm:app", "pkg:npm:left-pad", "depends_on"), edge_keys)
            node_types = {node["type"] for node in nodes}
            self.assertIn("dependency_package", node_types)
            self.assertIn("maintainer", node_types)
            self.assertIn("repository", node_types)
            self.assertIn("install_script", node_types)
            self.assertTrue(any(edge["type"] == "maintained_by" for edge in edges))
            self.assertTrue(any(edge["type"] == "sourced_from" for edge in edges))
            self.assertTrue(any(edge["type"] == "runs_install_script" for edge in edges))
            schema = json.loads((output / "feature_schema.json").read_text(encoding="utf-8"))
            self.assertIn("depends_on", schema["edge_types"])
            self.assertEqual(schema["schema_version"], 3)
            self.assertEqual(schema["training_projection"], "relation-aware package projection")

    def test_missing_positive_path_raises_file_not_found(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)

            with self.assertRaises(FileNotFoundError):
                build_graph_features(root / "missing-positive.jsonl", None, root / "features")

    def test_missing_negative_path_raises_file_not_found(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            positive = root / "positive.jsonl"
            positive.write_text("", encoding="utf-8")

            with self.assertRaises(FileNotFoundError):
                build_graph_features(positive, root / "missing-negative.jsonl", root / "features")

    def test_overlapping_negative_records_merge_risk_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            weak_negative = root / "weak.jsonl"
            hard_negative = root / "hard.jsonl"
            output = root / "features"
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
            hard_negative.write_text(
                json.dumps(
                    {
                        "ecosystem": "npm",
                        "package": "safe",
                        "text": "token download",
                        "label": 0,
                        "evidence_sources": ["hard_negative"],
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            summary = build_graph_features(None, [weak_negative, hard_negative], output)

            nodes = [
                json.loads(line)
                for line in (output / "train_nodes.jsonl")
                .read_text(encoding="utf-8")
                .splitlines()
            ]
            edges = [
                json.loads(line)
                for line in (output / "train_edges.jsonl")
                .read_text(encoding="utf-8")
                .splitlines()
            ]

            self.assertEqual(summary["negative_records"], 2)
            self.assertEqual(summary["package_nodes"], 1)
            safe_nodes = [node for node in nodes if node["id"] == "pkg:npm:safe"]
            self.assertEqual(len(safe_nodes), 1)
            self.assertGreater(safe_nodes[0]["features"]["risk_keyword_count"], 0)
            self.assertEqual(safe_nodes[0]["features"]["evidence_source_count"], 2)

            edge_keys = {(edge["source"], edge["target"], edge["type"]) for edge in edges}
            self.assertIn(
                ("pkg:npm:safe", "signal:token", "has_risk_signal"),
                edge_keys,
            )
            self.assertIn(
                ("pkg:npm:safe", "signal:download", "has_risk_signal"),
                edge_keys,
            )


if __name__ == "__main__":
    unittest.main()
