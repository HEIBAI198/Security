from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[2]))

from supplyguard.gnn_risk import PackageRiskScorer


ACCEPTANCE_CASES: list[dict[str, Any]] = [
    {
        "name": "react",
        "ecosystem": "npm",
        "version": "18.2.0",
        "signals": [],
        "vulnerabilities": [],
        "risk": 0,
        "expected": "benign",
    },
    {
        "name": "requests",
        "ecosystem": "pypi",
        "version": "2.31.0",
        "signals": [],
        "vulnerabilities": [],
        "risk": 0,
        "expected": "benign_or_abstain",
    },
    {
        "name": "x-trader-codec",
        "ecosystem": "npm",
        "version": "4.7.1",
        "signals": ["install script: postinstall", "credential exfiltration"],
        "vulnerabilities": [],
        "risk": 0,
        "expected": "malicious",
    },
    {
        "name": "event-stream",
        "ecosystem": "npm",
        "version": "3.3.6",
        "signals": ["backdoor", "download payload"],
        "vulnerabilities": [],
        "risk": 0,
        "expected": "malicious",
    },
]

INCIDENT_CASES: list[dict[str, Any]] = [
    {
        "ecosystem": "npm",
        "name": "event-stream",
        "version": "3.3.6",
        "signals": ["backdoor", "download payload", "reachable import detected"],
        "vulnerabilities": [
            {
                "id": "LOCAL-DEMO-NPM-0004",
                "source": "local",
                "summary": "Local demo malicious package incident signal.",
                "analysis": {"state": "in_triage"},
            }
        ],
        "risk": 92,
    },
    {
        "ecosystem": "npm",
        "name": "flatmap-stream",
        "version": "0.1.1",
        "signals": ["install script", "transitive dependency"],
        "vulnerabilities": [],
        "risk": 23,
    },
]


def run_runtime_acceptance(model_dir: str | Path, *, backend: str = "pyg") -> dict[str, Any]:
    model_path = Path(model_dir)
    scorer = PackageRiskScorer(model_path, prefer_pyg=backend != "numpy")
    checks: list[dict[str, Any]] = []
    if not scorer.registry.model_available:
        checks.append({"name": "artifact_load", "passed": False, "detail": scorer.load_error or "model unavailable"})
        return {"status": "failed", "checks": checks}
    checks.append(
        {
            "name": "artifact_load",
            "passed": scorer.registry.artifact_status in {"passed", "warning"},
            "detail": scorer.registry.artifact_info(),
        }
    )
    payloads = [
        {
            "ecosystem": case["ecosystem"],
            "name": case["name"],
            "version": case["version"],
            "signals": case["signals"],
            "vulnerabilities": case["vulnerabilities"],
            "risk": case["risk"],
        }
        for case in ACCEPTANCE_CASES
    ]
    calibration_predictions = scorer.score_dependencies([*payloads, *INCIDENT_CASES])
    calibration_scores = [float(item.get("gnn_score") or 0.0) for item in calibration_predictions]
    benign_max = max(calibration_scores[:2])
    malicious_min = min(calibration_scores[2:])
    runtime_threshold = float(scorer.registry.artifact_info()["online_decision_threshold"])
    calibration_decisions = [
        str(item.get("gnn_decision_status") or "")
        for item in calibration_predictions[:4]
    ]
    threshold_separates_cases = (
        calibration_decisions[0] == "benign"
        and calibration_decisions[1] in {"benign", "abstain"}
        and calibration_decisions[2] == "malicious"
        and calibration_decisions[3] == "malicious"
    )
    checks.append(
        {
            "name": "runtime_threshold_separation",
            "passed": threshold_separates_cases,
            "benign_max": benign_max,
            "malicious_min": malicious_min,
            "online_decision_threshold": runtime_threshold,
        }
    )
    predictions = scorer.score_dependencies(payloads)
    for case, prediction in zip(ACCEPTANCE_CASES, predictions):
        actual = prediction.get("gnn_decision_status")
        if case["expected"] == "benign_or_abstain":
            passed = actual in {"benign", "abstain"}
        else:
            passed = actual == case["expected"]
        checks.append(
            {
                "name": f"case:{case['name']}",
                "passed": passed,
                "expected": case["expected"],
                "actual": actual,
                "score": prediction.get("gnn_score"),
                "reliability": prediction.get("gnn_reliability"),
            }
        )

    graph_predictions = scorer.score_dependencies(
        [payloads[0], payloads[3]],
        dependency_edges=[(0, 1)],
    )
    graph_shape_passed = all(
        item.get("gnn_inference_mode") == "dependency_graph"
        and int(item.get("gnn_graph_neighbor_count") or 0) > 0
        for item in graph_predictions
    )
    graph_decisions = [item.get("gnn_decision_status") for item in graph_predictions]
    graph_passed = graph_shape_passed and graph_decisions == ["benign", "malicious"]
    checks.append(
        {
            "name": "dependency_graph_batch",
            "passed": graph_passed,
            "details": [
                {
                    "inference_mode": item.get("gnn_inference_mode"),
                    "neighbor_count": item.get("gnn_graph_neighbor_count"),
                    "decision_status": item.get("gnn_decision_status"),
                    "score": item.get("gnn_score"),
                }
                for item in graph_predictions
            ],
        }
    )
    incident_predictions = scorer.score_dependencies(INCIDENT_CASES, dependency_edges=[(0, 1)])
    incident_statuses = [item.get("gnn_decision_status") for item in incident_predictions]
    checks.append(
        {
            "name": "event_stream_dependency_graph",
            "passed": (
                incident_statuses[0] == "malicious"
                and incident_statuses[1] in {"malicious", "abstain"}
            ),
            "details": [
                {
                    "name": payload["name"],
                    "decision_status": prediction.get("gnn_decision_status"),
                    "score": prediction.get("gnn_score"),
                    "neighbor_count": prediction.get("gnn_graph_neighbor_count"),
                }
                for payload, prediction in zip(INCIDENT_CASES, incident_predictions)
            ],
        }
    )
    passed = all(bool(check.get("passed")) for check in checks)
    return {
        "status": "passed" if passed else "failed",
        "backend": backend,
        "model_type": scorer.registry.model_type,
        "artifact_id": scorer.registry.artifact_id,
        "dataset_version": scorer.registry.dataset_version,
        "online_decision_threshold": runtime_threshold,
        "checks": checks,
    }


def validate_and_record(model_dir: str | Path) -> dict[str, Any]:
    model_path = Path(model_dir)
    reports = {
        "pyg": run_runtime_acceptance(model_path, backend="pyg"),
        "numpy": {
            "status": "disabled",
            "backend": "numpy",
            "required": False,
            "checks": [
                {
                    "name": "numpy_backend",
                    "passed": True,
                    "detail": "NumPy fallback intentionally disabled; PyG is the only trusted GNN backend.",
                }
            ],
        },
    }
    reports["pyg"]["required"] = True
    report = {
        "status": "passed" if reports["pyg"].get("status") == "passed" else "failed",
        "backends": reports,
        "checks": [
            {**check, "name": f"{backend}/{check.get('name')}"}
            for backend, backend_report in reports.items()
            for check in backend_report.get("checks", [])
        ],
        "artifact_id": reports["pyg"].get("artifact_id") or "",
        "dataset_version": reports["pyg"].get("dataset_version") or "",
        "model_type": reports["pyg"].get("model_type") or "unavailable",
    }
    (model_path / "runtime_acceptance.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    for filename in ("package_risk_graphsage_metadata.json", "graphsage_model_card.json", "model_card.json"):
        path = model_path / filename
        if not path.exists():
            continue
        metadata = json.loads(path.read_text(encoding="utf-8"))
        backend = "numpy" if filename == "graphsage_model_card.json" else "pyg"
        threshold = reports.get(backend, {}).get("online_decision_threshold")
        if threshold is not None:
            metadata["online_decision_threshold"] = float(threshold)
        metadata["runtime_acceptance"] = report
        path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate the shipped GNN artifact against real runtime cases.")
    parser.add_argument("--model-dir", type=Path, default=Path("storage/graph_models"))
    args = parser.parse_args()
    report = validate_and_record(args.model_dir)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report.get("status") == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
