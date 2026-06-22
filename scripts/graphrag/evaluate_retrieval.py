from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def evaluate_retrieval_cases(cases: list[dict[str, Any]]) -> dict[str, Any]:
    normalized_cases = [case for case in cases if isinstance(case, dict)]
    case_count = len(normalized_cases)
    if case_count == 0:
        return {
            "case_count": 0,
            "target_dependency_recall": 0.0,
            "target_attack_path_recall": 0.0,
            "evidence_coverage": 0.0,
            "retrieval_trace_completeness": 0.0,
            "embedding_channel_hit_rate": 0.0,
        }

    dependency_recalls: list[float] = []
    path_recalls: list[float] = []
    evidence_hits = 0
    trace_hits = 0
    embedding_hits = 0

    for case in normalized_cases:
        result = case.get("result") if isinstance(case.get("result"), dict) else {}
        expected_node_ids = _string_set(case.get("expected_node_ids"))
        expected_path_ids = _string_set(case.get("expected_path_ids"))
        actual_node_ids = _ids_from_rows(result.get("top_nodes"))
        actual_path_ids = _ids_from_rows(result.get("top_attack_paths"))

        dependency_recalls.append(_recall(expected_node_ids, actual_node_ids))
        path_recalls.append(_recall(expected_path_ids, actual_path_ids))
        if _non_empty_list(result.get("evidence_table")):
            evidence_hits += 1
        if _non_empty_list(result.get("retrieval_trace")):
            trace_hits += 1
        if _embedding_channel_has_hits(result):
            embedding_hits += 1

    return {
        "case_count": case_count,
        "target_dependency_recall": _average(dependency_recalls),
        "target_attack_path_recall": _average(path_recalls),
        "evidence_coverage": round(evidence_hits / case_count, 4),
        "retrieval_trace_completeness": round(trace_hits / case_count, 4),
        "embedding_channel_hit_rate": round(embedding_hits / case_count, 4),
    }


def _recall(expected: set[str], actual: set[str]) -> float:
    if not expected:
        return 1.0
    return round(len(expected & actual) / len(expected), 4)


def _average(values: list[float]) -> float:
    if not values:
        return 0.0
    return round(sum(values) / len(values), 4)


def _ids_from_rows(value: Any) -> set[str]:
    if not isinstance(value, list):
        return set()
    ids: set[str] = set()
    for item in value:
        if isinstance(item, dict) and item.get("id"):
            ids.add(str(item["id"]))
    return ids


def _string_set(value: Any) -> set[str]:
    if not isinstance(value, list):
        return set()
    return {str(item) for item in value if item is not None}


def _non_empty_list(value: Any) -> bool:
    return isinstance(value, list) and bool(value)


def _embedding_channel_has_hits(result: dict[str, Any]) -> bool:
    channels = result.get("channels")
    if not isinstance(channels, dict):
        return False
    return _non_empty_list(channels.get("embedding"))


def _load_cases(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, list):
        return [case for case in data if isinstance(case, dict)]
    if isinstance(data, dict) and isinstance(data.get("cases"), list):
        return [case for case in data["cases"] if isinstance(case, dict)]
    raise ValueError("cases JSON must be a list or an object with a cases list")


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate GraphRAG retrieval cases.")
    parser.add_argument("--cases-json", required=True, help="Path to retrieval cases JSON.")
    parser.add_argument("--output", help="Optional output path for metrics JSON.")
    args = parser.parse_args()

    metrics = evaluate_retrieval_cases(_load_cases(Path(args.cases_json)))
    text = json.dumps(metrics, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(f"{text}\n", encoding="utf-8")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
