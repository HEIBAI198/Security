import json
import tempfile
import unittest
from pathlib import Path

from scripts.gnn.build_ecosystem_negatives import build_ecosystem_negatives
from scripts.gnn.build_hard_negatives import build_hard_negatives


class NegativeBuilderTests(unittest.TestCase):
    def test_builds_ecosystem_negatives_and_excludes_positives(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            metadata = root / "metadata.jsonl"
            positives = root / "positives.jsonl"
            output = root / "negatives.jsonl"
            metadata.write_text(
                "\n".join(
                    json.dumps(item)
                    for item in [
                        {
                            "ecosystem": "npm",
                            "package": "safe-lib",
                            "description": "utility package",
                        },
                        {
                            "ecosystem": "npm",
                            "package": "evil-lib",
                            "description": "known bad",
                        },
                        {
                            "ecosystem": "pypi",
                            "package": "My_Pkg",
                            "description": "python utility",
                        },
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            positives.write_text(
                json.dumps({"ecosystem": "npm", "package": "evil-lib"}) + "\n",
                encoding="utf-8",
            )

            summary = build_ecosystem_negatives(
                metadata, positives, output, limit_per_ecosystem=10
            )

            rows = [
                json.loads(line)
                for line in output.read_text(encoding="utf-8").splitlines()
            ]
            self.assertEqual(summary["written"], 2)
            self.assertEqual({row["package"] for row in rows}, {"safe-lib", "my-pkg"})
            row_by_package = {row["package"]: row for row in rows}
            self.assertIn("npm", row_by_package["safe-lib"]["text"])
            self.assertIn("safe-lib", row_by_package["safe-lib"]["text"])
            self.assertTrue(all(row["label"] == 0 for row in rows))

    def test_respects_ecosystem_limits_and_positive_id_fallbacks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            metadata = root / "metadata.jsonl"
            positives = root / "positives.jsonl"
            output = root / "negatives.jsonl"
            metadata.write_text(
                "\n".join(
                    json.dumps(item)
                    for item in [
                        {"ecosystem": "npm", "package": "alpha"},
                        {"ecosystem": "npm", "package": "beta"},
                        {"ecosystem": "npm", "package": "blocked"},
                        {"ecosystem": "pypi", "package": "First_Pkg"},
                        {"ecosystem": "pypi", "package": "Second_Pkg"},
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            positives.write_text(
                json.dumps({"id": "pkg:npm/blocked@1.0.0"}) + "\n",
                encoding="utf-8",
            )

            summary = build_ecosystem_negatives(
                metadata, positives, output, limit_per_ecosystem=1
            )

            rows = [
                json.loads(line)
                for line in output.read_text(encoding="utf-8").splitlines()
            ]
            packages = {(row["ecosystem"], row["package"]) for row in rows}
            self.assertEqual(summary["written"], 2)
            self.assertEqual(summary["excluded_positive"], 1)
            self.assertEqual(packages, {("npm", "alpha"), ("pypi", "first-pkg")})

    def test_builds_hard_negatives_from_sensitive_terms(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            negatives = root / "negatives.jsonl"
            output = root / "hard.jsonl"
            negatives.write_text(
                "\n".join(
                    json.dumps(item)
                    for item in [
                        {
                            "ecosystem": "npm",
                            "package": "token-helper",
                            "text": "token helper",
                            "label": 0,
                        },
                        {
                            "ecosystem": "npm",
                            "package": "left-pad",
                            "text": "string padding",
                            "label": 0,
                        },
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            summary = build_hard_negatives(negatives, output, keywords=["token"])

            rows = [
                json.loads(line)
                for line in output.read_text(encoding="utf-8").splitlines()
            ]
            self.assertEqual(summary["written"], 1)
            self.assertEqual(rows[0]["package"], "token-helper")
            self.assertIn("hard_negative", rows[0]["evidence_sources"])

    def test_builds_hard_negatives_with_default_keywords_without_duplicate_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            negatives = root / "negatives.jsonl"
            output = root / "hard.jsonl"
            negatives.write_text(
                "\n".join(
                    json.dumps(item)
                    for item in [
                        {
                            "ecosystem": "npm",
                            "package": "safe-auth",
                            "text": "authentication helpers",
                            "label": 0,
                            "evidence_sources": ["hard_negative"],
                        },
                        {
                            "ecosystem": "npm",
                            "package": "left-pad",
                            "text": "string padding",
                            "label": 0,
                            "evidence_sources": ["ecosystem_metadata"],
                        },
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            summary = build_hard_negatives(negatives, output)

            rows = [
                json.loads(line)
                for line in output.read_text(encoding="utf-8").splitlines()
            ]
            self.assertEqual(summary["written"], 1)
            self.assertEqual(rows[0]["source"], "hard_negative_keyword_filter")
            self.assertEqual(rows[0]["evidence_sources"], ["hard_negative"])


if __name__ == "__main__":
    unittest.main()
