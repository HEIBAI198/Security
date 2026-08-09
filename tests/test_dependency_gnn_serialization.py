import unittest
from unittest import mock

from supplyguard.dependency_audit import DependencyRecord, serialize_dependencies, serialize_dependency


class DependencyGnnSerializationTests(unittest.TestCase):
    def test_serialized_dependency_includes_gnn_risk_fields(self):
        dependency = DependencyRecord(
            name="left-pad",
            ecosystem="npm",
            version="1.0.0",
            scope="runtime",
            source_file="package.json",
            manifest_type="package.json",
            risk=40,
            signals=["install script: postinstall"],
            vulnerabilities=[{"id": "GHSA-test", "source": "osv"}],
        )

        payload = serialize_dependency(dependency)

        self.assertIn("gnn_score", payload)
        self.assertIn("gnn_label", payload)
        self.assertIn("gnn_reasons", payload)
        self.assertGreaterEqual(payload["gnn_score"], 0.0)
        self.assertLessEqual(payload["gnn_score"], 1.0)
        self.assertIn(payload["gnn_label"], {"low", "elevated", "high"})
        self.assertTrue(payload["gnn_reasons"])

    def test_batch_serialization_passes_real_dependency_edges_to_gnn(self):
        parent = DependencyRecord(
            name="parent",
            ecosystem="npm",
            version="1.0.0",
            scope="runtime",
            source_file="package-lock.json",
            manifest_type="package-lock.json",
            dependencies=["child"],
        )
        child = DependencyRecord(
            name="child",
            ecosystem="npm",
            version="1.0.0",
            scope="runtime",
            source_file="package-lock.json",
            manifest_type="package-lock.json",
            dependency_type="transitive",
        )
        scorer = mock.Mock()
        scorer.score_dependencies.return_value = [
            {
                "gnn_score": 0.1,
                "gnn_label": "low",
                "gnn_reasons": ["ok"],
                "model_available": True,
                "model_type": "test",
                "gnn_inference_mode": "dependency_graph",
                "gnn_graph_neighbor_count": 1,
            },
            {
                "gnn_score": 0.2,
                "gnn_label": "low",
                "gnn_reasons": ["ok"],
                "model_available": True,
                "model_type": "test",
                "gnn_inference_mode": "dependency_graph",
                "gnn_graph_neighbor_count": 1,
            },
        ]

        with mock.patch("supplyguard.dependency_audit.dependency_gnn_scorer", return_value=scorer):
            payloads = serialize_dependencies([parent, child])

        scorer.score_dependencies.assert_called_once()
        _, edges = scorer.score_dependencies.call_args.args
        self.assertEqual(edges, [(0, 1)])
        self.assertEqual(payloads[0]["dependency_names"], ["child"])
        self.assertEqual(payloads[0]["gnn_inference_mode"], "dependency_graph")

    def test_serialize_dependency_with_subgraph_scores_inside_project_graph(self):
        parent = DependencyRecord(
            name="parent",
            ecosystem="npm",
            version="1.0.0",
            scope="runtime",
            source_file="package-lock.json",
            manifest_type="package-lock.json",
            dependencies=["child"],
        )
        child = DependencyRecord(
            name="child",
            ecosystem="npm",
            version="1.0.0",
            scope="runtime",
            source_file="package-lock.json",
            manifest_type="package-lock.json",
            dependency_type="transitive",
        )
        scorer = mock.Mock()
        scorer.score_dependencies.return_value = [
            {
                "gnn_score": 0.1,
                "gnn_label": "low",
                "gnn_reasons": ["ok"],
                "model_available": True,
                "model_type": "test",
                "gnn_inference_mode": "dependency_graph",
                "gnn_graph_neighbor_count": 1,
            },
            {
                "gnn_score": 0.9,
                "gnn_label": "high",
                "gnn_reasons": ["bad"],
                "model_available": True,
                "model_type": "test",
                "gnn_inference_mode": "dependency_graph",
                "gnn_graph_neighbor_count": 1,
            },
        ]

        with mock.patch("supplyguard.dependency_audit.dependency_gnn_scorer", return_value=scorer):
            payload = serialize_dependency(child, subgraph=[parent, child])

        scorer.score_dependencies.assert_called_once()
        _, edges = scorer.score_dependencies.call_args.args
        self.assertEqual(edges, [(0, 1)])
        self.assertEqual(payload["gnn_inference_mode"], "dependency_graph")
        self.assertEqual(payload["gnn_score"], 0.9)


if __name__ == "__main__":
    unittest.main()
