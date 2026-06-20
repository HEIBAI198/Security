import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from scripts.gnn.train_pyg_graphsage_package_risk import (
    PYG_MODEL_TYPE,
    train_pyg_graphsage_package_risk,
)


class PyGGraphSageContractTests(unittest.TestCase):
    def _write_tiny_dataset(self, root: Path) -> Path:
        data = root / "features"
        data.mkdir()
        (data / "feature_schema.json").write_text(
            json.dumps({"features": ["ecosystem_npm", "ecosystem_pypi", "risk_keyword_count", "text_length"]}),
            encoding="utf-8",
        )
        nodes = [
            {"id": "pkg:npm:evil", "ecosystem": "npm", "package": "evil", "label": 1, "features": {"ecosystem_npm": 1, "ecosystem_pypi": 0, "risk_keyword_count": 2, "text_length": 20}},
            {"id": "pkg:npm:stealer", "ecosystem": "npm", "package": "stealer", "label": 1, "features": {"ecosystem_npm": 1, "ecosystem_pypi": 0, "risk_keyword_count": 2, "text_length": 22}},
            {"id": "pkg:pypi:requests", "ecosystem": "pypi", "package": "requests", "label": 0, "features": {"ecosystem_npm": 0, "ecosystem_pypi": 1, "risk_keyword_count": 0, "text_length": 10}},
            {"id": "pkg:pypi:flask", "ecosystem": "pypi", "package": "flask", "label": 0, "features": {"ecosystem_npm": 0, "ecosystem_pypi": 1, "risk_keyword_count": 0, "text_length": 8}},
        ]
        edges = [
            {"source": "pkg:npm:evil", "target": "signal:token", "type": "has_risk_signal"},
            {"source": "pkg:npm:stealer", "target": "signal:token", "type": "has_risk_signal"},
            {"source": "pkg:pypi:requests", "target": "source:requirements", "type": "observed_in"},
            {"source": "pkg:pypi:flask", "target": "source:requirements", "type": "observed_in"},
        ]
        splits = {
            "train": ["pkg:npm:evil", "pkg:pypi:requests"],
            "val": ["pkg:npm:stealer"],
            "test": ["pkg:pypi:flask"],
        }
        (data / "train_nodes.jsonl").write_text("".join(json.dumps(node) + "\n" for node in nodes), encoding="utf-8")
        (data / "train_edges.jsonl").write_text("".join(json.dumps(edge) + "\n" for edge in edges), encoding="utf-8")
        (data / "splits.json").write_text(json.dumps(splits), encoding="utf-8")
        return data

    def test_model_type_constant_is_stable(self):
        self.assertEqual(PYG_MODEL_TYPE, "pyg_graphsage_package_risk")

    @unittest.skipUnless(importlib.util.find_spec("torch") and importlib.util.find_spec("torch_geometric"), "torch/PyG not installed")
    def test_trains_tiny_graph_and_writes_artifacts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = self._write_tiny_dataset(root)
            output = root / "model"

            metrics = train_pyg_graphsage_package_risk(data, output, epochs=3, hidden_dim=8, random_state=5)

            self.assertEqual(metrics["model_type"], PYG_MODEL_TYPE)
            self.assertTrue((output / "package_risk_graphsage.pt").exists())
            self.assertTrue((output / "package_risk_graphsage_metadata.json").exists())
            self.assertTrue((output / "package_embeddings.npy").exists())
            self.assertTrue((output / "package_embedding_index.json").exists())


if __name__ == "__main__":
    unittest.main()
