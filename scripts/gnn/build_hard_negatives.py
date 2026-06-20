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
]


def _match_text(record: dict[str, Any]) -> str:
    ecosystem = normalize_ecosystem(record.get("ecosystem"))
    package = normalize_package_name(record.get("package") or record.get("name"), ecosystem)
    text = str(record.get("text") or "")
    return f"{package} {text}".casefold()


def _evidence_sources(value: Any) -> list[Any]:
    if isinstance(value, list):
        return list(value)
    if value is None:
        return []
    return [value]


def _with_hard_negative_source(record: dict[str, Any]) -> dict[str, Any]:
    output = dict(record)
    evidence_sources = _evidence_sources(output.get("evidence_sources"))
    if "hard_negative" not in evidence_sources:
        evidence_sources.append("hard_negative")
    output["evidence_sources"] = evidence_sources
    output["source"] = "hard_negative_keyword_filter"
    return output


def build_hard_negatives(
    negative_path: str | Path,
    output_path: str | Path,
    *,
    keywords: list[str] | None = None,
    limit: int = 5000,
) -> dict[str, int]:
    if limit < 0:
        raise ValueError("limit must be non-negative")

    keyword_values = DEFAULT_KEYWORDS if keywords is None else keywords
    normalized_keywords = [
        keyword.casefold() for keyword in keyword_values if keyword.casefold()
    ]
    records: list[dict[str, Any]] = []
    summary = {"read": 0, "written": 0, "skipped_limit": 0}

    for record in read_jsonl(negative_path):
        summary["read"] += 1
        haystack = _match_text(record)
        if not any(keyword in haystack for keyword in normalized_keywords):
            continue
        if len(records) >= limit:
            summary["skipped_limit"] += 1
            continue
        records.append(_with_hard_negative_source(record))

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
