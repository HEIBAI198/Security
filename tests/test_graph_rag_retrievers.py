import unittest
import tempfile
from pathlib import Path

import json
import numpy as np

from supplyguard.package_embeddings import PackageEmbeddingIndex
from supplyguard.graph_rag_retrievers import retrieve_channels


class GraphRagRetrieverTests(unittest.TestCase):
    def test_retrieves_keyword_risk_and_path_channels(self):
        graph = {
            "nodes": [
                {"id": "dep:evil", "label": "npm:evil", "type": "DependencyPackage", "risk": "critical", "score": 90, "description": "postinstall token", "properties": {"properties": {"gnn_score": 0.95}}},
                {"id": "ci:build", "label": "release build", "type": "CIStep", "risk": "high", "score": 70, "description": "build step", "properties": {}},
            ],
            "edges": [
                {"id": "edge:1", "source": "dep:evil", "target": "ci:build", "type": "DEPENDENCY_REACHES_BUILD"}
            ],
            "attack_paths": [
                {"id": "path:1", "title": "evil reaches build", "score": 88, "node_ids": ["dep:evil", "ci:build"]}
            ],
        }

        channels = retrieve_channels(graph, "evil build risk", intent="dependency_risk")

        self.assertTrue(channels["keyword"])
        self.assertTrue(channels["risk"])
        self.assertTrue(channels["attack_path"])
        self.assertIn("embedding", channels)

    def test_general_intent_does_not_recall_unrelated_scored_paths(self):
        graph = {
            "nodes": [],
            "edges": [],
            "attack_paths": [
                {"id": "path:unrelated", "title": "unrelated chain", "score": 99, "node_ids": ["a", "b"]}
            ],
        }

        channels = retrieve_channels(graph, "plain question", intent="general")

        self.assertEqual(channels["attack_path"], [])

    def test_malformed_payload_fields_return_empty_channels(self):
        channels = retrieve_channels({"nodes": None, "edges": None, "attack_paths": None}, None, intent="general")

        self.assertEqual(channels["keyword"], [])
        self.assertEqual(channels["risk"], [])
        self.assertEqual(channels["attack_path"], [])
        self.assertEqual(channels["embedding"], [])

    def test_missing_embedding_artifacts_return_empty_embedding_channel(self):
        with tempfile.TemporaryDirectory() as tmp:
            channels = retrieve_channels(
                {
                    "nodes": [
                        {"id": "pkg:npm:evil", "label": "npm:evil", "type": "DependencyPackage", "risk": "high"}
                    ],
                    "attack_paths": [],
                },
                "evil dependency",
                intent="dependency_risk",
                embedding_index=PackageEmbeddingIndex(tmp),
            )

        self.assertEqual(channels["embedding"], [])

    def test_bad_embedding_shape_returns_empty_embedding_channel(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            np.save(root / "package_embeddings.npy", np.ones((1, 2), dtype=np.float32))
            (root / "package_embedding_index.json").write_text(
                json.dumps(
                    [
                        {"index": 0, "id": "pkg:npm:evil", "ecosystem": "npm", "package": "evil"},
                        {"index": 1, "id": "pkg:npm:near", "ecosystem": "npm", "package": "near"},
                    ]
                ),
                encoding="utf-8",
            )

            channels = retrieve_channels(
                {"nodes": [{"id": "pkg:npm:evil", "label": "npm:evil", "type": "DependencyPackage"}]},
                "evil dependency",
                intent="dependency_risk",
                embedding_index=PackageEmbeddingIndex(root),
            )

        self.assertEqual(channels["embedding"], [])

    def test_embedding_channel_recalls_existing_similar_package_node(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            np.save(
                root / "package_embeddings.npy",
                np.asarray(
                    [
                        [1.0, 0.0],
                        [0.95, 0.05],
                        [0.0, 1.0],
                    ],
                    dtype=np.float32,
                ),
            )
            (root / "package_embedding_index.json").write_text(
                json.dumps(
                    [
                        {"index": 0, "id": "pkg:npm:evil", "ecosystem": "npm", "package": "evil"},
                        {"index": 1, "id": "pkg:npm:near", "ecosystem": "npm", "package": "near"},
                        {"index": 2, "id": "pkg:npm:far", "ecosystem": "npm", "package": "far"},
                    ]
                ),
                encoding="utf-8",
            )

            channels = retrieve_channels(
                {
                    "nodes": [
                        {"id": "pkg:npm:evil", "label": "npm:evil", "type": "DependencyPackage", "risk": "critical", "properties": {"properties": {"gnn_score": 0.9}}},
                        {"id": "pkg:npm:near", "label": "npm:near", "type": "DependencyPackage", "risk": "low"},
                        {"id": "pkg:npm:far", "label": "npm:far", "type": "DependencyPackage", "risk": "low"},
                    ],
                    "attack_paths": [],
                },
                "evil dependency",
                intent="dependency_risk",
                embedding_index=PackageEmbeddingIndex(root),
            )

        self.assertEqual(channels["embedding"][0]["id"], "pkg:npm:near")
        self.assertEqual(channels["embedding"][0]["reason"], "embedding_similarity")
        self.assertGreater(channels["embedding"][0]["similarity"], 0.9)


if __name__ == "__main__":
    unittest.main()
