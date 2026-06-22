import json
import tempfile
import unittest
from pathlib import Path

from scripts.gnn.train_graphsage_package_risk import train_graphsage_package_risk


class NumpyGraphSageTrainingTests(unittest.TestCase):
    def test_trains_neighbor_aggregation_network_and_writes_artifacts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data_dir = root / "features"
            output_dir = root / "model"
            data_dir.mkdir()

            (data_dir / "feature_schema.json").write_text(
                json.dumps(
                    {
                        "features": [
                            "ecosystem_npm",
                            "ecosystem_pypi",
                            "name_length",
                            "risk_keyword_count",
                        ]
                    }
                ),
                encoding="utf-8",
            )
            nodes = [
                {
                    "id": "pkg:npm:evil-one",
                    "label": 1,
                    "features": {
                        "ecosystem_npm": 1,
                        "ecosystem_pypi": 0,
                        "name_length": 8,
                        "risk_keyword_count": 2,
                    },
                },
                {
                    "id": "pkg:npm:evil-two",
                    "label": 1,
                    "features": {
                        "ecosystem_npm": 1,
                        "ecosystem_pypi": 0,
                        "name_length": 8,
                        "risk_keyword_count": 1,
                    },
                },
                {
                    "id": "pkg:pypi:requests",
                    "label": 0,
                    "features": {
                        "ecosystem_npm": 0,
                        "ecosystem_pypi": 1,
                        "name_length": 8,
                        "risk_keyword_count": 0,
                    },
                },
                {
                    "id": "pkg:pypi:django",
                    "label": 0,
                    "features": {
                        "ecosystem_npm": 0,
                        "ecosystem_pypi": 1,
                        "name_length": 6,
                        "risk_keyword_count": 0,
                    },
                },
            ]
            edges = [
                {
                    "source": "pkg:npm:evil-one",
                    "target": "signal:postinstall",
                    "type": "has_risk_signal",
                },
                {
                    "source": "pkg:npm:evil-two",
                    "target": "signal:token",
                    "type": "has_risk_signal",
                },
                {
                    "source": "pkg:pypi:requests",
                    "target": "source:requirements",
                    "type": "observed_in",
                },
                {
                    "source": "pkg:pypi:django",
                    "target": "source:requirements",
                    "type": "observed_in",
                },
            ]
            (data_dir / "train_nodes.jsonl").write_text(
                "\n".join(json.dumps(node) for node in nodes) + "\n",
                encoding="utf-8",
            )
            (data_dir / "train_edges.jsonl").write_text(
                "\n".join(json.dumps(edge) for edge in edges) + "\n",
                encoding="utf-8",
            )

            metrics = train_graphsage_package_risk(
                data_dir,
                output_dir,
                epochs=12,
                hidden_dim=6,
                random_state=7,
            )

            self.assertEqual(metrics["model_type"], "numpy_graphsage_mean_aggregator")
            self.assertEqual(metrics["samples"], 4)
            self.assertIn("f1", metrics)
            self.assertTrue((output_dir / "package_risk_gnn.npz").exists())
            self.assertTrue((output_dir / "graphsage_metrics.json").exists())
            self.assertTrue((output_dir / "graphsage_model_card.json").exists())


if __name__ == "__main__":
    unittest.main()
