from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[2]))

from scripts.gnn.dataset_utils import (
    normalize_ecosystem,
    normalize_package_name,
    read_jsonl,
    write_jsonl,
)


DEFAULT_KEYWORDS = [
    "token",
    "auth",
    "crypto",
    "shell",
    "install",
    "download",
    "proxy",
    "credential",
    "password",
    "secret",
    "postinstall",
    "preinstall",
    "eval",
    "obfuscat",
    "binary",
]


def _match_text(record: dict[str, Any]) -> str:
    ecosystem = normalize_ecosystem(record.get("ecosystem"))
    package = normalize_package_name(record.get("package") or record.get("name"), ecosystem)
    values = [
        package,
        record.get("text"),
        record.get("description"),
        record.get("homepage"),
        record.get("repository"),
        record.get("keywords"),
        record.get("install_scripts"),
        record.get("scripts"),
    ]
    return " ".join(
        json.dumps(value, ensure_ascii=False, sort_keys=True)
        if isinstance(value, (dict, list))
        else str(value or "")
        for value in values
    ).casefold()


def _evidence_sources(value: Any) -> list[Any]:
    if isinstance(value, list):
        return list(value)
    if value is None:
        return []
    return [value]


def _is_trusted_negative(record: dict[str, Any]) -> bool:
    label_source = str(record.get("label_source") or record.get("source") or "").casefold()
    return (
        int(record.get("label") or 0) == 0
        and float(record.get("label_confidence") or 0.0) >= 0.7
        and not any(marker in label_source for marker in ("unverified", "weak", "local_dependency_baseline"))
    )


def _with_hard_negative_source(
    record: dict[str, Any],
    *,
    matched_keywords: list[str],
) -> dict[str, Any]:
    output = dict(record)
    evidence_sources = _evidence_sources(output.get("evidence_sources"))
    if "hard_negative" not in evidence_sources:
        evidence_sources.append("hard_negative")
    output["evidence_sources"] = evidence_sources
    output["source"] = "hard_negative_keyword_filter"
    output["hard_negative"] = True
    output["hard_negative_reasons"] = [f"keyword:{keyword}" for keyword in matched_keywords]
    output["hard_negative_weight"] = 1.5 if _is_trusted_negative(record) else 0.5
    if _is_trusted_negative(record):
        output["hard_negative_verification"] = "trusted_normal_source"
    else:
        output["hard_negative_verification"] = "heuristic_unverified"
        output["label_source"] = "hard_negative_heuristic_unverified"
        output["label_confidence"] = min(float(record.get("label_confidence") or 0.2), 0.2)
    return output


def _normalize_keywords(values: list[str] | None) -> list[str]:
    keyword_values = DEFAULT_KEYWORDS if values is None else values
    return [
        normalized
        for keyword in keyword_values
        if (normalized := str(keyword).strip().casefold())
    ]


def build_hard_negatives(
    negative_path: str | Path,
    output_path: str | Path,
    *,
    keywords: list[str] | None = None,
    limit: int = 5000,
) -> dict[str, int]:
    if limit < 0:
        raise ValueError("limit must be non-negative")

    normalized_keywords = _normalize_keywords(keywords)
    records: list[dict[str, Any]] = []
    summary = {"read": 0, "written": 0, "trusted_written": 0, "skipped_limit": 0}

    for record in read_jsonl(negative_path):
        summary["read"] += 1
        haystack = _match_text(record)
        matched_keywords = [keyword for keyword in normalized_keywords if keyword in haystack]
        if not matched_keywords:
            continue
        if len(records) >= limit:
            summary["skipped_limit"] += 1
            continue
        hard_negative = _with_hard_negative_source(
            record,
            matched_keywords=matched_keywords,
        )
        records.append(hard_negative)
        if hard_negative["hard_negative_verification"] == "trusted_normal_source":
            summary["trusted_written"] += 1

    write_jsonl(output_path, records)
    summary["written"] = len(records)
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Filter local negative samples into keyword-based hard negatives."
    )
    parser.add_argument("--negative-path", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--keyword", action="append", dest="keywords")
    parser.add_argument("--limit", type=int, default=5000)
    args = parser.parse_args()

    summary = build_hard_negatives(
        args.negative_path,
        args.output,
        keywords=args.keywords,
        limit=args.limit,
    )
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
