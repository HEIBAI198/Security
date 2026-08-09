import importlib.util
import json
import unittest
from pathlib import Path

from scripts.gnn.validate_runtime_artifact import run_runtime_acceptance


MODEL_DIR = Path("storage/graph_models")
HAS_TORCH_PYG = bool(importlib.util.find_spec("torch") and importlib.util.find_spec("torch_geometric"))


class GnnRealArtifactAcceptanceTests(unittest.TestCase):
    def test_shipped_artifact_has_passed_runtime_gate(self):
        report = json.loads((MODEL_DIR / "runtime_acceptance.json").read_text(encoding="utf-8"))
        metadata = json.loads((MODEL_DIR / "package_risk_graphsage_metadata.json").read_text(encoding="utf-8"))

        self.assertEqual(report["status"], "passed")
        self.assertTrue(all(check["passed"] for check in report["backends"]["pyg"]["checks"]))
        self.assertEqual(report["backends"]["numpy"]["status"], "disabled")
        self.assertEqual(metadata["runtime_acceptance"]["status"], "passed")
        self.assertEqual(metadata["feature_contract"], "runtime_package_features_v3")

    @unittest.skipUnless(HAS_TORCH_PYG, "torch/PyG not installed")
    def test_real_model_still_passes_runtime_gate(self):
        report = run_runtime_acceptance(MODEL_DIR)

        self.assertEqual(report["status"], "passed")
        self.assertTrue(all(check["passed"] for check in report["checks"]))


if __name__ == "__main__":
    unittest.main()
