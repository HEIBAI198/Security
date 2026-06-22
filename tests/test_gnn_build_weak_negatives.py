import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from scripts.gnn.build_weak_negatives import build_weak_negatives


class WeakNegativeBuilderTests(unittest.TestCase):
    def test_builds_weak_negatives_from_manifests_and_sbom(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            output_path = root / "weak_negatives.jsonl"

            (root / "package.json").write_text(
                json.dumps(
                    {
                        "dependencies": {
                            "React": "19.0.0",
                            "@Scope/Tool": "^1.0.0",
                        }
                    }
                ),
                encoding="utf-8",
            )
            (root / "requirements.txt").write_text(
                "requests==2.31.0\nDjango>=4.2\n# ignored\n",
                encoding="utf-8",
            )
            (root / "manual.cdx.json").write_text(
                json.dumps(
                    {
                        "bomFormat": "CycloneDX",
                        "components": [
                            {
                                "type": "library",
                                "name": "Requests_Toolbelt",
                                "version": "1.0.0",
                                "purl": "pkg:pypi/Requests_Toolbelt@1.0.0",
                            },
                            {
                                "type": "library",
                                "name": "@scope/pkg",
                                "version": "2.0.0",
                                "purl": "pkg:npm/%40scope/pkg@2.0.0",
                            },
                        ],
                    }
                ),
                encoding="utf-8",
            )

            stats = build_weak_negatives([root], output_path)

            records = [
                json.loads(line)
                for line in output_path.read_text(encoding="utf-8").splitlines()
            ]
            packages = {(record["ecosystem"], record["package"]) for record in records}

            self.assertEqual(stats["written"], 6)
            self.assertIn(("npm", "react"), packages)
            self.assertIn(("npm", "@scope/tool"), packages)
            self.assertIn(("npm", "@scope/pkg"), packages)
            self.assertIn(("pypi", "requests"), packages)
            self.assertIn(("pypi", "django"), packages)
            self.assertIn(("pypi", "requests-toolbelt"), packages)
            self.assertTrue(all(record["label"] == 0 for record in records))

    def test_excludes_packages_that_appear_in_positive_dataset(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            output_path = root / "weak_negatives.jsonl"
            positive_path = root / "positives.jsonl"

            (root / "package.json").write_text(
                json.dumps({"dependencies": {"react": "19.0.0", "vite": "8.0.0"}}),
                encoding="utf-8",
            )
            positive_path.write_text(
                json.dumps({"ecosystem": "npm", "package": "react"}) + "\n",
                encoding="utf-8",
            )

            stats = build_weak_negatives([root], output_path, positive_path=positive_path)

            records = [
                json.loads(line)
                for line in output_path.read_text(encoding="utf-8").splitlines()
            ]
            self.assertEqual(stats["excluded_positive"], 1)
            self.assertEqual([record["package"] for record in records], ["vite"])

    def test_script_can_run_from_file_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            output_path = root / "weak_negatives.jsonl"
            (root / "package.json").write_text(
                json.dumps({"dependencies": {"vite": "8.0.0"}}),
                encoding="utf-8",
            )

            result = subprocess.run(
                [
                    sys.executable,
                    "scripts/gnn/build_weak_negatives.py",
                    "--root",
                    str(root),
                    "--output",
                    str(output_path),
                ],
                cwd=Path(__file__).resolve().parents[1],
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('"written": 1', result.stdout)
            self.assertTrue(output_path.exists())


if __name__ == "__main__":
    unittest.main()
