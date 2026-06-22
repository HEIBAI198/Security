import unittest

from supplyguard.dependency_audit import DependencyAuditResult, DependencyRecord
from supplyguard.knowledge_graph import build_unified_facts


class KnowledgeGraphGnnPropertiesTests(unittest.TestCase):
    def test_dependency_asset_includes_gnn_properties(self):
        dependency = DependencyRecord(
            name="left-pad",
            ecosystem="npm",
            version="1.0.0",
            scope="runtime",
            source_file="package.json",
            manifest_type="package.json",
            signals=["install script: postinstall"],
        )
        result = DependencyAuditResult(
            scan_id="dep-test",
            generated_at="2026-06-18T00:00:00Z",
            target_path=".",
            target={},
            dependencies=[dependency],
            findings=[],
            summary={},
            sbom={},
            vex={},
            report="",
        )

        facts = build_unified_facts({}, dependency_audit=result)
        dependency_assets = [
            asset
            for asset in facts["assets"]
            if asset["type"] == "DependencyPackage"
        ]

        self.assertEqual(len(dependency_assets), 1)
        properties = dependency_assets[0]["properties"]
        self.assertIn("gnn_score", properties)
        self.assertIn("gnn_label", properties)
        self.assertIn("gnn_reasons", properties)


if __name__ == "__main__":
    unittest.main()
