import json
import tempfile
import unittest
from pathlib import Path

from scripts.gnn.evaluate_business_cases import evaluate_case, lockfile_payloads


class FakeScorer:
    def __init__(self, decisions: dict[str, str], modes: dict[str, str] | None = None) -> None:
        self.decisions = decisions
        self.modes = modes or {}
        self.model_type = "fake"

    def score_dependencies(self, payloads, edges=None):
        results = []
        for payload in payloads:
            name = str(payload["name"])
            results.append(
                {
                    "gnn_decision_status": self.decisions.get(name, "abstain"),
                    "gnn_inference_mode": self.modes.get(name, "dependency_graph"),
                    "gnn_score": 0.5,
                }
            )
        return results

    def score_package(self, ecosystem, name, version="", signals=None):
        return {
            "gnn_decision_status": self.decisions.get(str(name), "abstain"),
            "gnn_inference_mode": "package_features_only",
            "gnn_score": 0.9,
        }


def _write_lockfile(root: Path) -> Path:
    manifest = root / "package-lock.json"
    manifest.write_text(
        json.dumps(
            {
                "name": "app",
                "version": "1.0.0",
                "lockfileVersion": 3,
                "packages": {
                    "": {"name": "app", "version": "1.0.0"},
                    "node_modules/axios": {"version": "1.6.8", "license": "MIT"},
                    "node_modules/left-pad": {"version": "1.3.0", "license": "WTFPL"},
                    "node_modules/axios/node_modules/follow-redirects": {
                        "version": "1.15.5",
                        "license": "MIT",
                    },
                },
            }
        ),
        encoding="utf-8",
    )
    return manifest


class BusinessCaseEvaluatorTests(unittest.TestCase):
    def test_lockfile_payloads_builds_real_nested_edges(self):
        with tempfile.TemporaryDirectory() as tmp:
            manifest = _write_lockfile(Path(tmp))

            payloads, edges = lockfile_payloads(manifest, ecosystem="npm")

        names = {payload["name"] for payload in payloads}
        self.assertEqual(names, {"axios", "left-pad", "follow-redirects"})
        self.assertIn(("axios", "follow-redirects"), {(payloads[a]["name"], payloads[b]["name"]) for a, b in edges})

    def test_evaluate_case_requires_non_malicious_goods_and_malicious_fixtures(self):
        with tempfile.TemporaryDirectory() as tmp:
            manifest = _write_lockfile(Path(tmp))
            case = {
                "name": "synthetic",
                "manifest": str(manifest),
                "ecosystem": "npm",
                "min_graph_packages": 2,
                "must_not_be_malicious": ["axios", "left-pad"],
                "must_be_malicious": [
                    {"name": "event-stream", "signals": ["backdoor"]}
                ],
            }
            scorer = FakeScorer(
                decisions={"axios": "benign", "left-pad": "benign", "event-stream": "malicious"},
            )

            report = evaluate_case(case, scorer)

        self.assertTrue(report["passed"])
        self.assertGreaterEqual(report["graph_mode_packages"], 2)

    def test_evaluate_case_fails_when_good_package_is_malicious(self):
        with tempfile.TemporaryDirectory() as tmp:
            manifest = _write_lockfile(Path(tmp))
            case = {
                "name": "synthetic",
                "manifest": str(manifest),
                "ecosystem": "npm",
                "min_graph_packages": 0,
                "must_not_be_malicious": ["axios"],
                "must_be_malicious": [],
            }
            scorer = FakeScorer(decisions={"axios": "malicious"})

            report = evaluate_case(case, scorer)

        self.assertFalse(report["passed"])


if __name__ == "__main__":
    unittest.main()
