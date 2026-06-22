from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[2]))

from scripts.gnn.dataset_utils import (
    normalize_ecosystem,
    normalize_package_name,
    package_group_key,
    read_jsonl,
    write_jsonl,
)


OPTIONAL_FIELDS = (
    "description",
    "keywords",
    "maintainers",
    "versions",
    "latest_version",
)


def _split_group_key(value: str) -> tuple[str, str]:
    if ":" not in value:
        return "generic", value
    ecosystem, package = value.split(":", 1)
    return ecosystem, package


def _first_present(*values: Any) -> Any:
    for value in values:
        if isinstance(value, str):
            if value.strip():
                return value
            continue
        if value is not None:
            return value
    return ""


def _package_identity(record: dict[str, Any]) -> tuple[str, str] | None:
    identity_record = {
        key: value
        for key, value in record.items()
        if key != "package" or _first_present(value)
    }
    group_ecosystem, group_package = _split_group_key(package_group_key(identity_record))
    ecosystem = normalize_ecosystem(
        _first_present(record.get("ecosystem"), group_ecosystem)
    )
    package = normalize_package_name(
        _first_present(record.get("package"), record.get("name"), group_package),
        ecosystem,
    )
    if not package:
        return None
    return ecosystem, package


def _keyword_text(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _sample_text(ecosystem: str, package: str, record: dict[str, Any]) -> str:
    parts = [ecosystem, package]
    description = record.get("description")
    if description is not None and str(description).strip():
        parts.append(str(description).strip())
    parts.extend(_keyword_text(record.get("keywords")))
    return " ".join(parts)


def _has_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return True


def _negative_record(
    ecosystem: str,
    package: str,
    record: dict[str, Any],
) -> dict[str, Any]:
    output: dict[str, Any] = {
        "ecosystem": ecosystem,
        "package": package,
        "label": 0,
        "source": "ecosystem_metadata_negative",
        "evidence_sources": ["ecosystem_metadata"],
        "text": _sample_text(ecosystem, package, record),
    }
    for field in OPTIONAL_FIELDS:
        if field in record and _has_value(record[field]):
            output[field] = record[field]
    return output


def _load_positive_keys(path: str | Path) -> set[tuple[str, str]]:
    positive_path = Path(path)
    if not positive_path.exists():
        raise FileNotFoundError(positive_path)

    keys: set[tuple[str, str]] = set()
    for record in read_jsonl(positive_path):
        key = _package_identity(record)
        if key is not None:
            keys.add(key)
    return keys


def build_ecosystem_negatives(
    metadata_path: str | Path,
    positive_path: str | Path,
    output_path: str | Path,
    *,
    limit_per_ecosystem: int = 10000,
) -> dict[str, int]:
    if limit_per_ecosystem < 0:
        raise ValueError("limit_per_ecosystem must be non-negative")

    positive_keys = _load_positive_keys(positive_path)
    per_ecosystem_counts: dict[str, int] = defaultdict(int)
    seen_keys: set[tuple[str, str]] = set()
    records: list[dict[str, Any]] = []
    summary = {
        "read": 0,
        "written": 0,
        "excluded_positive": 0,
        "skipped_duplicate": 0,
        "skipped_missing_package": 0,
        "skipped_limit": 0,
    }

    for metadata_record in read_jsonl(metadata_path):
        summary["read"] += 1
        key = _package_identity(metadata_record)
        if key is None:
            summary["skipped_missing_package"] += 1
            continue

        ecosystem, package = key
        if key in positive_keys:
            summary["excluded_positive"] += 1
            continue
        if key in seen_keys:
            summary["skipped_duplicate"] += 1
            continue
        if per_ecosystem_counts[ecosystem] >= limit_per_ecosystem:
            summary["skipped_limit"] += 1
            continue

        records.append(_negative_record(ecosystem, package, metadata_record))
        per_ecosystem_counts[ecosystem] += 1
        seen_keys.add(key)

    write_jsonl(output_path, records)
    summary["written"] = len(records)
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build negative package samples from local ecosystem metadata."
    )
    parser.add_argument("--metadata", required=True, type=Path)
    parser.add_argument("--positive-path", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--limit-per-ecosystem", type=int, default=10000)
    args = parser.parse_args()

    summary = build_ecosystem_negatives(
        args.metadata,
        args.positive_path,
        args.output,
        limit_per_ecosystem=args.limit_per_ecosystem,
    )
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
