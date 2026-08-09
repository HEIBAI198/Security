"""Merge curated normal-package lists into one ecosystem-negative pool."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[2]))

from scripts.gnn.dataset_utils import (
    normalize_ecosystem,
    normalize_package_name,
    read_jsonl,
    write_jsonl,
)


def _key(record: dict) -> str:
    ecosystem = normalize_ecosystem(record.get("ecosystem"))
    package = normalize_package_name(record.get("package") or record.get("name"), ecosystem)
    return f"{ecosystem}:{package}"


def _prefer(existing: dict, incoming: dict) -> bool:
    existing_score = len(existing)
    incoming_score = len(incoming)
    existing_evidence = len(existing.get("evidence_sources") or [])
    incoming_evidence = len(incoming.get("evidence_sources") or [])
    if incoming_score != existing_score:
        return incoming_score > existing_score
    return incoming_evidence > existing_evidence


def merge_negative_packages(
    sources: list[Path],
    output: Path,
    *,
    positive_path: Path | None = None,
) -> dict[str, int]:
    positive_keys: set[str] = set()
    if positive_path is not None:
        positive_keys = {_key(record) for record in read_jsonl(positive_path)}

    merged: dict[str, dict] = {}
    for path in sources:
        for record in read_jsonl(path):
            key = _key(record)
            if key in positive_keys:
                continue
            existing = merged.get(key)
            if existing is None:
                merged[key] = record
            elif _prefer(existing, record):
                merged[key] = record

    ordered = sorted(
        merged.values(),
        key=lambda record: (
            str(record.get("ecosystem")),
            str(record.get("package") or record.get("name") or "").lower(),
        ),
    )
    write_jsonl(output, ordered)
    return {
        "sources": len(sources),
        "excluded_positive_overlap": len(positive_keys),
        "merged": len(ordered),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Merge curated normal-package lists into one negative pool."
    )
    parser.add_argument("--source", action="append", type=Path, required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--positive-path", type=Path)
    args = parser.parse_args()
    summary = merge_negative_packages(
        args.source,
        args.output,
        positive_path=args.positive_path,
    )
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
