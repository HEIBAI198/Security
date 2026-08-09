"""Evaluate the shipped GNN on independent business cases built from real manifests.

Each case points at a real lockfile (npm package-lock.json v3). The evaluator
builds the project dependency subgraph from the lockfile tree, scores every
package with the PyG model, and checks:

- known-good packages in the manifest are never judged malicious;
- known-bad demo fixtures (not in the manifest) are judged malicious;
- the online graph path actually engaged (dependency_graph mode) for a
  meaningful share of the scanned packages.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[2]))

from supplyguard.gnn_risk import PackageRiskScorer


def _name_from_key(key: str) -> str:
    segments = [segment for segment in key.split("node_modules/") if segment]
    return segments[-1].lstrip("/") if segments else ""


def lockfile_payloads(
    manifest_path: str | Path,
    *,
    ecosystem: str = "npm",
) -> tuple[list[dict[str, Any]], list[tuple[int, int]]]:
    """Parse a package-lock.json v3 into dependency payloads and real edges."""
    payload = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    packages = payload.get("packages") if isinstance(payload, dict) else None
    if not isinstance(packages, dict):
        raise ValueError(f"{manifest_path} has no packages section")

    entries: list[dict[str, Any]] = []
    for key, item in packages.items():
        if not key or not isinstance(item, dict):
            continue
        name = _name_from_key(str(key))
        if not name:
            continue
        entries.append(
            {
                "key": str(key),
                "name": name,
                "version": str(item.get("version") or ""),
                "license": str(item.get("license") or ""),
            }
        )

    by_key = {entry["key"]: entry for entry in entries}
    parent_edges: set[tuple[str, str]] = set()
    for entry in entries:
        prefix = entry["key"] + "/node_modules/"
        for child in entries:
            if child["key"].startswith(prefix) and "/node_modules/" not in child["key"][len(prefix):]:
                parent_edges.add((entry["name"], child["name"]))

    payloads: list[dict[str, Any]] = []
    ids_by_name: dict[str, list[int]] = {}
    for index, entry in enumerate(entries):
        payloads.append(
            {
                "ecosystem": ecosystem,
                "name": entry["name"],
                "version": entry["version"],
                "signals": [],
                "vulnerabilities": [],
                "risk": 0,
                "license": entry["license"],
            }
        )
        ids_by_name.setdefault(entry["name"], []).append(index)

    edge_pairs: set[tuple[int, int]] = set()
    for parent, child in sorted(parent_edges):
        for parent_id in ids_by_name.get(parent, []):
            for child_id in ids_by_name.get(child, []):
                if parent_id != child_id:
                    edge_pairs.add((parent_id, child_id))
    return payloads, sorted(edge_pairs)


def evaluate_case(
    case: dict[str, Any],
    scorer: Any,
) -> dict[str, Any]:
    ecosystem = str(case.get("ecosystem") or "npm")
    payloads, edges = lockfile_payloads(case["manifest"], ecosystem=ecosystem)
    results = scorer.score_dependencies(payloads, edges)
    by_name: dict[str, dict[str, Any]] = {}
    for payload, result in zip(payloads, results):
        by_name.setdefault(str(payload["name"]), result)

    graph_mode_count = sum(
        1
        for result in results
        if result.get("gnn_inference_mode") == "dependency_graph"
    )
    checks: list[dict[str, Any]] = []
    for name in case.get("must_not_be_malicious", []):
        result = by_name.get(str(name))
        if result is None:
            checks.append({"name": name, "passed": False, "reason": "not found in manifest"})
            continue
        passed = result.get("gnn_decision_status") in {"benign", "abstain"}
        checks.append(
            {
                "name": name,
                "passed": passed,
                "decision": result.get("gnn_decision_status"),
                "score": result.get("gnn_score"),
                "mode": result.get("gnn_inference_mode"),
            }
        )
    for fixture in case.get("must_be_malicious", []):
        name = str(fixture["name"])
        result = scorer.score_package(
            ecosystem,
            name,
            str(fixture.get("version") or ""),
            signals=list(fixture.get("signals") or []),
        )
        passed = result.get("gnn_decision_status") == "malicious"
        checks.append(
            {
                "name": name,
                "passed": passed,
                "decision": result.get("gnn_decision_status"),
                "score": result.get("gnn_score"),
                "mode": result.get("gnn_inference_mode"),
            }
        )

    min_graph = (
        int(case["min_graph_packages"])
        if "min_graph_packages" in case
        else 1
    )
    graph_ok = graph_mode_count >= min_graph
    if not graph_ok:
        checks.append(
            {
                "name": "graph_mode_coverage",
                "passed": False,
                "graph_mode_packages": graph_mode_count,
                "min_graph_packages": min_graph,
            }
        )
    passed = all(bool(check.get("passed")) for check in checks)
    return {
        "name": str(case.get("name") or Path(str(case["manifest"])).name),
        "manifest": str(case["manifest"]),
        "packages": len(payloads),
        "edges": len(edges),
        "graph_mode_packages": graph_mode_count,
        "checks": checks,
        "passed": passed,
    }


def evaluate_cases(
    cases_path: str | Path,
    *,
    model_dir: str | Path = "storage/graph_models",
    scorer: Any | None = None,
) -> dict[str, Any]:
    cases = json.loads(Path(cases_path).read_text(encoding="utf-8"))
    if not isinstance(cases, list) or not cases:
        raise ValueError("business cases file must be a non-empty JSON array")
    active_scorer = scorer or PackageRiskScorer(model_dir)
    reports = [evaluate_case(case, active_scorer) for case in cases]
    return {
        "status": "passed" if all(report["passed"] for report in reports) else "failed",
        "cases": reports,
        "model_type": active_scorer.model_type,
        "artifact_id": active_scorer.registry.artifact_id,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Evaluate the shipped GNN on independent business cases."
    )
    parser.add_argument("--cases", required=True, type=Path)
    parser.add_argument("--model-dir", type=Path, default=Path("storage/graph_models"))
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = evaluate_cases(args.cases, model_dir=args.model_dir)
    text = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text + "\n", encoding="utf-8")
    print(text)
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
