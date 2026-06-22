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

    def test_multi_seed_expansion_revisits_shared_node_at_shallower_depth(self):
        graph = {
            "nodes": [
                {"id": "a", "label": "alpha seed", "type": "Package", "risk": "critical", "score": 90},
                {"id": "a1", "label": "alpha bridge one", "type": "Service", "risk": "low", "score": 10},
                {"id": "shared", "label": "shared bridge", "type": "Service", "risk": "low", "score": 10},
                {"id": "b", "label": "beta seed", "type": "Package", "risk": "critical", "score": 90},
                {"id": "b_leaf", "label": "beta leaf", "type": "LogEvent", "risk": "low", "score": 10},
            ],
            "edges": [
                {"id": "e:a-a1", "source": "a", "target": "a1", "type": "RELATED"},
                {"id": "e:a1-shared", "source": "a1", "target": "shared", "type": "RELATED"},
                {"id": "e:b-shared", "source": "b", "target": "shared", "type": "RELATED"},
                {"id": "e:shared-leaf", "source": "shared", "target": "b_leaf", "type": "RELATED"},
            ],
            "attack_paths": [],
        }

        result = graph_rag_retrieve(graph, "alpha beta", max_nodes=10, hops=2)

        self.assertIn("b_leaf", result["expanded_node_ids"])

    def test_malformed_payload_and_query_return_degraded_structure(self):
        result = graph_rag_retrieve({"nodes": None, "edges": None, "attack_paths": None}, None)

        self.assertEqual(result["intent"], "general")
        self.assertEqual(result["top_nodes"], [])
        self.assertEqual(result["top_edges"], [])
        self.assertEqual(result["top_attack_paths"], [])
        self.assertEqual(result["channels"]["embedding"], [])
        self.assertIn("context", result)

        result = graph_rag_retrieve(None, None)
        self.assertEqual(result["intent"], "general")
        self.assertEqual(result["expanded_node_ids"], [])

    def test_bad_numeric_and_list_fields_do_not_crash(self):
        graph = {
            "nodes": [
                {"id": "dep:bad", "label": "bad package", "type": "DependencyPackage", "risk": "high", "score": "N/A"},
            ],
            "edges": [],
            "attack_paths": [
                {
                    "id": "path:bad",
                    "title": "bad package path",
                    "score": "bad",
                    "node_ids": None,
                    "edge_ids": None,
                }
            ],
        }

        result = graph_rag_retrieve(graph, "bad package", max_nodes=2)

        self.assertEqual(result["top_nodes"][0]["id"], "dep:bad")
        self.assertIn("path:bad", [path["id"] for path in result["top_attack_paths"]])

    def test_equal_score_node_order_uses_id_tie_breaker(self):
        graph = {
            "nodes": [
                {"id": "node:b", "label": "same token", "type": "Finding", "risk": "high", "score": 80},
                {"id": "node:a", "label": "same token", "type": "Finding", "risk": "high", "score": 80},
            ],
            "edges": [],
            "attack_paths": [],
        }

        result = graph_rag_retrieve(graph, "same token", max_nodes=2)

        self.assertEqual([node["id"] for node in result["top_nodes"]], ["node:a", "node:b"])

    def test_selected_attack_path_preserves_key_edges_when_node_limit_is_small(self):
        graph = {
            "nodes": [
                {"id": "dep:evil", "label": "evil package", "type": "DependencyPackage", "risk": "critical", "score": 95},
                {"id": "ci:build", "label": "release build", "type": "CIStep", "risk": "high", "score": 80},
                {"id": "runtime:svc", "label": "runtime service", "type": "RuntimeService", "risk": "high", "score": 80},
            ],
            "edges": [
                {"id": "edge:path", "source": "ci:build", "target": "runtime:svc", "type": "BUILD_TO_RUNTIME"},
                {"id": "edge:seed", "source": "dep:evil", "target": "ci:build", "type": "DEPENDENCY_REACHES_BUILD"},
            ],
            "attack_paths": [
                {
                    "id": "path:runtime",
                    "title": "evil package build runtime",
                    "score": 95,
                    "node_ids": ["dep:evil", "ci:build", "runtime:svc"],
                    "edge_ids": ["edge:path"],
                }
            ],
        }

        result = graph_rag_retrieve(graph, "evil package build runtime", max_nodes=1, max_edges=1, max_paths=1)

        self.assertEqual(result["top_attack_paths"][0]["id"], "path:runtime")
        self.assertEqual([edge["id"] for edge in result["top_edges"]], ["edge:path"])


if __name__ == "__main__":
    unittest.main()
