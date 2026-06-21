import importlib.util
import json
import re
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np

import scripts.gnn.train_pyg_graphsage_package_risk as trainer
from scripts.gnn.train_pyg_graphsage_package_risk import (
    PYG_MODEL_TYPE,
    train_pyg_graphsage_package_risk,
)


class PyGGraphSageContractTests(unittest.TestCase):
    def _write_tiny_dataset(
        self,
        root: Path,
        *,
        labels: list[int] | None = None,
        splits: dict[str, list[str]] | None = None,
    ) -> Path:
        data = root / "features"
        data.mkdir()
        (data / "feature_schema.json").write_text(
            json.dumps({"features": ["ecosystem_npm", "ecosystem_pypi", "risk_keyword_count", "text_length"]}),
            encoding="utf-8",
        )
        node_labels = labels or [1, 1, 0, 0]
        nodes = [
            {"id": "pkg:npm:evil", "ecosystem": "npm", "package": "evil", "label": node_labels[0], "features": {"ecosystem_npm": 1, "ecosystem_pypi": 0, "risk_keyword_count": 2, "text_length": 20}},
            {"id": "pkg:npm:stealer", "ecosystem": "npm", "package": "stealer", "label": node_labels[1], "features": {"ecosystem_npm": 1, "ecosystem_pypi": 0, "risk_keyword_count": 2, "text_length": 22}},
            {"id": "pkg:pypi:requests", "ecosystem": "pypi", "package": "requests", "label": node_labels[2], "features": {"ecosystem_npm": 0, "ecosystem_pypi": 1, "risk_keyword_count": 0, "text_length": 10}},
            {"id": "pkg:pypi:flask", "ecosystem": "pypi", "package": "flask", "label": node_labels[3], "features": {"ecosystem_npm": 0, "ecosystem_pypi": 1, "risk_keyword_count": 0, "text_length": 8}},
        ]
        edges = [
            {"source": "pkg:npm:evil", "target": "signal:token", "type": "has_risk_signal"},
            {"source": "pkg:npm:stealer", "target": "signal:token", "type": "has_risk_signal"},
            {"source": "pkg:pypi:requests", "target": "source:requirements", "type": "observed_in"},
            {"source": "pkg:pypi:flask", "target": "source:requirements", "type": "observed_in"},
        ]
        default_splits = {
            "train": ["pkg:npm:evil", "pkg:pypi:requests"],
            "val": ["pkg:npm:stealer"],
            "test": ["pkg:pypi:flask"],
        }
        (data / "train_nodes.jsonl").write_text("".join(json.dumps(node) + "\n" for node in nodes), encoding="utf-8")
        (data / "train_edges.jsonl").write_text("".join(json.dumps(edge) + "\n" for edge in edges), encoding="utf-8")
        (data / "splits.json").write_text(json.dumps(splits or default_splits), encoding="utf-8")
        return data

    def _assert_rejects_before_dependency_load(
        self,
        data: Path,
        output: Path,
        message_pattern: str,
        **kwargs,
    ) -> None:
        with mock.patch.object(
            trainer,
            "_load_torch_pyg",
            side_effect=AssertionError("dependencies loaded before validation"),
        ) as load_torch_pyg:
            with self.assertRaisesRegex(ValueError, message_pattern):
                train_pyg_graphsage_package_risk(data, output, **kwargs)
        load_torch_pyg.assert_not_called()
        self.assertFalse(output.exists())

    def test_model_type_constant_is_stable(self):
        self.assertEqual(PYG_MODEL_TYPE, "pyg_graphsage_package_risk")

    def test_rejects_one_class_labels_before_dependency_load_and_artifacts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = self._write_tiny_dataset(root, labels=[1, 1, 1, 1])

            self._assert_rejects_before_dependency_load(
                data,
                root / "model",
                "at least one positive and one negative",
            )

    def test_rejects_non_binary_labels_before_dependency_load(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = self._write_tiny_dataset(root, labels=[2, 1, 0, 0])

            self._assert_rejects_before_dependency_load(
                data,
                root / "model",
                "binary 0/1",
            )

    def test_rejects_no_package_nodes_before_dependency_load(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = root / "features"
            data.mkdir()
            (data / "feature_schema.json").write_text(
                json.dumps({"features": ["risk_keyword_count"]}),
                encoding="utf-8",
            )
            nodes = [
                {"id": "signal:token", "label": 1, "features": {"risk_keyword_count": 1}},
                {"id": "source:requirements", "label": 0, "features": {"risk_keyword_count": 0}},
            ]
            (data / "train_nodes.jsonl").write_text(
                "".join(json.dumps(node) + "\n" for node in nodes),
                encoding="utf-8",
            )
            (data / "train_edges.jsonl").write_text("", encoding="utf-8")
            (data / "splits.json").write_text(
                json.dumps({"train": [], "val": [], "test": []}),
                encoding="utf-8",
            )

            self._assert_rejects_before_dependency_load(
                data,
                root / "model",
                "at least one package node",
            )

    def test_rejects_empty_train_split_before_dependency_load_and_artifacts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = self._write_tiny_dataset(
                root,
                splits={
                    "train": [],
                    "val": ["pkg:npm:stealer"],
                    "test": ["pkg:pypi:flask"],
                },
            )

            self._assert_rejects_before_dependency_load(
                data,
                root / "model",
                "train split must include at least one package node",
            )

    def test_rejects_train_split_with_one_class_before_dependency_load(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = self._write_tiny_dataset(
                root,
                splits={
                    "train": ["pkg:npm:evil", "pkg:npm:stealer"],
                    "val": ["pkg:pypi:requests"],
                    "test": ["pkg:pypi:flask"],
                },
            )

            self._assert_rejects_before_dependency_load(
                data,
                root / "model",
                "train split must include both",
            )

    def test_rejects_missing_required_split_key_before_dependency_load(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = self._write_tiny_dataset(
                root,
                splits={
                    "train": ["pkg:npm:evil", "pkg:pypi:requests"],
                    "val": ["pkg:npm:stealer"],
                },
            )

            self._assert_rejects_before_dependency_load(
                data,
                root / "model",
                "missing required split keys",
            )

    def test_rejects_unknown_split_ids_before_dependency_load(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = self._write_tiny_dataset(
                root,
                splits={
                    "train": ["pkg:npm:evil", "pkg:pypi:requests"],
                    "val": ["pkg:npm:ghost"],
                    "test": ["pkg:pypi:flask"],
                },
            )

            self._assert_rejects_before_dependency_load(
                data,
                root / "model",
                "unknown split node IDs",
            )

    def test_rejects_overlapping_split_ids_before_dependency_load(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = self._write_tiny_dataset(
                root,
                splits={
                    "train": ["pkg:npm:evil", "pkg:pypi:requests"],
                    "val": ["pkg:npm:evil"],
                    "test": ["pkg:pypi:flask"],
                },
            )

            self._assert_rejects_before_dependency_load(
                data,
                root / "model",
                "overlapping split node IDs",
            )

    def test_rejects_invalid_hyperparameters_before_dependency_load(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = self._write_tiny_dataset(root)

            self._assert_rejects_before_dependency_load(
                data,
                root / "model",
                "epochs must be > 0",
                epochs=0,
            )

    def test_empty_split_metrics_are_not_zero_scores(self):
        self.assertEqual(
            trainer._empty_split_metrics(),
            {
                "samples": 0,
                "positive_samples": 0,
                "negative_samples": 0,
                "accuracy": None,
                "precision": None,
                "recall": None,
                "f1": None,
            },
        )

    def test_missing_dependency_runtime_error_is_exact(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = self._write_tiny_dataset(root)
            with mock.patch.object(
                trainer,
                "_load_torch_pyg",
                side_effect=RuntimeError(trainer.MISSING_DEPENDENCY_MESSAGE),
            ):
                with self.assertRaisesRegex(RuntimeError, f"^{re.escape(trainer.MISSING_DEPENDENCY_MESSAGE)}$"):
                    train_pyg_graphsage_package_risk(data, root / "model")

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
            self.assertTrue((output / "graphsage_eval.json").exists())

            metadata = json.loads((output / "package_risk_graphsage_metadata.json").read_text(encoding="utf-8"))
            embeddings = np.load(output / "package_embeddings.npy")
            embedding_index = json.loads((output / "package_embedding_index.json").read_text(encoding="utf-8"))

            self.assertEqual(metadata["input_dim"], 4)
            self.assertEqual(metadata["label_mapping"], {"benign": 0, "malicious": 1})
            self.assertEqual(metadata["edge_construction"]["edge_types"], ["has_risk_signal", "observed_in"])
            self.assertEqual(metadata["split_counts"], {"train": 2, "val": 1, "test": 1})
            self.assertEqual(metadata["trained_epochs"], 3)
            self.assertEqual(metadata["training_status"], "trained")
            self.assertEqual(embeddings.shape[0], len(embedding_index))
            self.assertEqual(len(embedding_index), metadata["node_count"])


if __name__ == "__main__":
    unittest.main()
