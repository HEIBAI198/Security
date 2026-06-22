import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.gnn.clean_openssf_malicious import clean_dataset, normalize_osv_payload


class OpenSSFMaliciousCleaningTests(unittest.TestCase):
    def test_normalizes_supported_osv_payload(self):
        payload = {
            "id": "MAL-2026-0001",
            "summary": "Malicious package exfiltrates tokens",
            "details": "The package runs a postinstall script.",
            "aliases": ["GHSA-test"],
            "published": "2026-01-01T00:00:00Z",
            "modified": "2026-01-02T00:00:00Z",
            "affected": [
                {
                    "package": {"ecosystem": "PyPI", "name": "Requests_Toolbelt"},
                    "ranges": [
                        {
                            "type": "ECOSYSTEM",
                            "events": [
                                {"introduced": "0"},
                                {"fixed": "1.0.1"},
                            ],
                        }
                    ],
                    "versions": ["1.0.0"],
                }
            ],
        }

        records = normalize_osv_payload(payload, ecosystems={"pypi", "npm"})

        self.assertEqual(len(records), 1)
        record = records[0]
        self.assertEqual(record["source_id"], "MAL-2026-0001")
        self.assertEqual(record["ecosystem"], "pypi")
        self.assertEqual(record["package"], "requests-toolbelt")
        self.assertEqual(record["raw_package"], "Requests_Toolbelt")
        self.assertEqual(record["label"], 1)
        self.assertEqual(record["source"], "openssf/malicious-packages")
        self.assertEqual(record["aliases"], ["GHSA-test"])
        self.assertEqual(record["affected_versions"], ["1.0.0"])
        self.assertEqual(record["introduced_versions"], ["0"])
        self.assertEqual(record["fixed_versions"], ["1.0.1"])
        self.assertIn("postinstall", record["text"])

    def test_clean_dataset_filters_unsupported_ecosystems_and_deduplicates(self):
        with tempfile.TemporaryDirectory() as tmp:
            input_dir = Path(tmp) / "osv"
            output_path = Path(tmp) / "malicious.jsonl"
            input_dir.mkdir()

            repeated = {
                "id": "MAL-2026-0002",
                "summary": "Malicious npm package",
                "details": "",
                "affected": [
                    {
                        "package": {"ecosystem": "npm", "name": "Left-Pad"},
                        "ranges": [{"events": [{"introduced": "0"}]}],
                    }
                ],
            }
            unsupported = {
                "id": "MAL-2026-0003",
                "affected": [
                    {"package": {"ecosystem": "Go", "name": "example.com/mod"}}
                ],
            }

            (input_dir / "one.json").write_text(json.dumps(repeated), encoding="utf-8")
            (input_dir / "nested").mkdir()
            (input_dir / "nested" / "duplicate.json").write_text(
                json.dumps(repeated), encoding="utf-8"
            )
            (input_dir / "nested" / "go.json").write_text(
                json.dumps(unsupported), encoding="utf-8"
            )

            stats = clean_dataset(input_dir, output_path, ecosystems={"npm"})

            lines = output_path.read_text(encoding="utf-8").splitlines()
            self.assertEqual(stats["written"], 1)
            self.assertEqual(stats["duplicates"], 1)
            self.assertEqual(len(lines), 1)
            record = json.loads(lines[0])
            self.assertEqual(record["ecosystem"], "npm")
            self.assertEqual(record["package"], "left-pad")

    def test_clean_dataset_can_limit_records_per_ecosystem(self):
        with tempfile.TemporaryDirectory() as tmp:
            input_dir = Path(tmp) / "malicious"
            output_path = Path(tmp) / "malicious.jsonl"
            (input_dir / "npm").mkdir(parents=True)
            (input_dir / "pypi").mkdir()
            (input_dir / "go").mkdir()

            def write_payload(path: Path, ecosystem: str, name: str) -> None:
                path.write_text(
                    json.dumps(
                        {
                            "id": f"MAL-{ecosystem}-{name}",
                            "affected": [
                                {"package": {"ecosystem": ecosystem, "name": name}}
                            ],
                        }
                    ),
                    encoding="utf-8",
                )

            write_payload(input_dir / "npm" / "one.json", "npm", "one")
            write_payload(input_dir / "npm" / "two.json", "npm", "two")
            write_payload(input_dir / "pypi" / "alpha.json", "PyPI", "alpha")
            write_payload(input_dir / "pypi" / "beta.json", "PyPI", "beta")
            write_payload(input_dir / "go" / "ignored.json", "Go", "mod")

            stats = clean_dataset(
                input_dir,
                output_path,
                ecosystems={"npm", "pypi"},
                max_per_ecosystem=1,
            )

            records = [
                json.loads(line)
                for line in output_path.read_text(encoding="utf-8").splitlines()
            ]
            counts = {}
            for record in records:
                counts[record["ecosystem"]] = counts.get(record["ecosystem"], 0) + 1

            self.assertEqual(stats["written"], 2)
            self.assertEqual(counts, {"npm": 1, "pypi": 1})

    def test_clean_dataset_skips_unreadable_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            input_dir = Path(tmp) / "malicious" / "npm"
            output_path = Path(tmp) / "malicious.jsonl"
            input_dir.mkdir(parents=True)
            blocked = input_dir / "blocked.json"
            readable = input_dir / "readable.json"
            blocked.write_text("{}", encoding="utf-8")
            readable.write_text("{}", encoding="utf-8")

            payload = {
                "id": "MAL-readable",
                "affected": [{"package": {"ecosystem": "npm", "name": "safe-read"}}],
            }

            def load_or_fail(path: Path):
                if path.name == "blocked.json":
                    raise PermissionError("blocked")
                return [payload]

            with patch(
                "scripts.gnn.clean_openssf_malicious._load_json_payloads",
                side_effect=load_or_fail,
            ):
                stats = clean_dataset(input_dir, output_path, ecosystems={"npm"})

            records = [
                json.loads(line)
                for line in output_path.read_text(encoding="utf-8").splitlines()
            ]
            self.assertEqual(stats["unreadable"], 1)
            self.assertEqual(stats["written"], 1)
            self.assertEqual(records[0]["package"], "safe-read")


if __name__ == "__main__":
    unittest.main()
