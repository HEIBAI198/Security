"""Backfill registry metadata for malicious-package positives.

OpenSSF malicious-packages records do not carry maintainers/repository/license/
dependencies, while curated registry negatives do. Without backfill, features
like has_repository or maintainer_count act as label-source proxies. This
script fetches npm/PyPI metadata for each positive and merges it into the
record while preserving the original label and provenance fields.
"""

from __future__ import annotations

import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[2]))

from scripts.gnn.dataset_utils import read_jsonl, write_jsonl
from scripts.gnn.fetch_curated_normal_packages import (
    _fetch_npm,
    _fetch_pypi,
    _fetch_with_retry,
)


MERGE_FIELDS = (
    "version",
    "latest_version",
    "versions",
    "description",
    "keywords",
    "dependencies",
    "maintainers",
    "repository",
    "homepage",
    "license",
    "install_scripts",
    "scripts",
    "published",
    "created",
    "modified",
    "metadata_source",
)


def _enrich_record(record: dict, metadata: dict | None) -> dict:
    output = dict(record)
    if not metadata:
        return output
    for field_name in MERGE_FIELDS:
        value = metadata.get(field_name)
        if value not in (None, "", [], {}) and output.get(field_name) in (None, "", [], {}):
            output[field_name] = value
    return output


def enrich_positives_metadata(
    source: str | Path,
    output: str | Path,
    *,
    max_workers: int = 8,
) -> dict[str, int]:
    records = read_jsonl(source)
    fetchers = {"npm": _fetch_npm, "pypi": _fetch_pypi}
    enriched: dict[int, dict] = {}
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {}
        for index, record in enumerate(records):
            ecosystem = str(record.get("ecosystem") or "").strip().lower()
            package = str(record.get("package") or record.get("raw_package") or "").strip()
            fetcher = fetchers.get(ecosystem)
            if fetcher is None or not package:
                enriched[index] = record
                continue
            futures[pool.submit(_fetch_with_retry, fetcher, package)] = index
        for future in as_completed(futures):
            index = futures[future]
            enriched[index] = _enrich_record(records[index], future.result())

    ordered = [enriched[index] for index in range(len(records))]
    write_jsonl(output, ordered)
    enriched_count = sum(
        bool(
            record.get("maintainers")
            or record.get("repository")
            or record.get("license")
            or record.get("dependencies")
        )
        for record in ordered
    )
    return {"records": len(ordered), "metadata_enriched": enriched_count}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Backfill registry metadata for malicious-package positives."
    )
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--max-workers", type=int, default=8)
    args = parser.parse_args()
    summary = enrich_positives_metadata(
        args.source,
        args.output,
        max_workers=args.max_workers,
    )
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
