import unittest

from supplyguard.dependency_audit import DependencyRecord, serialize_dependency


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


if __name__ == "__main__":
    unittest.main()
