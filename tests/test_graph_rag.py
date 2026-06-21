import unittest

from supplyguard.graph_rag import graph_rag_retrieve


class GraphRagRetrievalTests(unittest.TestCase):
    def test_retrieves_seed_neighbors_and_attack_paths(self):
        graph = {
            "nodes": [
                {
                    "id": "dep:evil",
                    "label": "npm:evil@1.0.0",
                    "type": "DependencyPackage",
                    "risk": "critical",
                    "score": 60,
                    "description": "Suspicious install script package",
                    "properties": {
                        "properties": {
                            "gnn_score": 0.92,
                            "gnn_label": "high",
                            "signals": ["postinstall"],
                        }
                    },
                },
                {
                    "id": "ci:build",
                    "label": "release build",
                    "type": "CIStep",
                    "risk": "high",
                    "score": 70,
                    "description": "Build step",
                    "properties": {},
                },
                {
                    "id": "log:egress",
                    "label": "runtime egress",
                    "type": "LogEvent",
                    "risk": "high",
                    "score": 80,
                    "description": "Outbound runtime signal",
                    "properties": {},
                },
            ],
            "edges": [
                {
                    "id": "edge:1",
                    "source": "dep:evil",
                    "target": "ci:build",
                    "type": "DEPENDENCY_REACHES_BUILD",
                    "label": "reaches build",
                    "reason": "Package can affect build",
                },
                {
                    "id": "edge:2",
                    "source": "ci:build",
                    "target": "log:egress",
                    "type": "BUILD_TO_RUNTIME",
                    "label": "runtime evidence",
                    "reason": "Build artifact later egressed",
                },
            ],
            "attack_paths": [
                {
                    "id": "path:1",
                    "title": "evil package reaches runtime",
                    "score": 95,
                    "node_ids": ["dep:evil", "ci:build", "log:egress"],
                    "edge_ids": ["edge:1", "edge:2"],
                    "description": "Dependency to runtime attack path",
                }
            ],
        }

        result = graph_rag_retrieve(graph, "evil package build risk", max_nodes=3)

        node_ids = [node["id"] for node in result["top_nodes"]]
        self.assertEqual(node_ids[0], "dep:evil")
        self.assertIn("ci:build", node_ids)
        self.assertIn("log:egress", node_ids)
        self.assertEqual(result["top_attack_paths"][0]["id"], "path:1")
        self.assertIn("GraphRAG", result["context"])
        self.assertIn("gnn_score=0.92", result["context"])
        self.assertIn("channels", result)
        self.assertIn("retrieval_trace", result)
        self.assertIn("evidence_table", result)
        self.assertIn("missing_evidence", result)
        self.assertTrue(result["top_nodes"][0].get("why_selected"))


if __name__ == "__main__":
    unittest.main()
