import unittest

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


if __name__ == "__main__":
    unittest.main()
