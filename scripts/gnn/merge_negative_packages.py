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
from scripts.gnn.held_out_packages import HELD_OUT_DEMO_PACKAGES
from scripts.gnn.fetch_curated_normal_packages import (
    NPM_SEED_PACKAGES,
    PYPI_SEED_PACKAGES,
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


def _normalize_review_tier(record: dict) -> dict:
    output = dict(record)
    tier = str(output.get("review_tier") or "").strip().lower()
    if tier not in {"explicit_curated", "dependency_closure"}:
        label_source = str(output.get("label_source") or output.get("source") or "").casefold()
        package = str(output.get("package") or output.get("name") or "").casefold()
        ecosystem = str(output.get("ecosystem") or "").casefold()
        source = str(output.get("source") or "").casefold()
        npm_seeds = {name.casefold() for name in NPM_SEED_PACKAGES}
        pypi_seeds = {name.casefold() for name in PYPI_SEED_PACKAGES}
        in_seeds = (ecosystem == "npm" and package in npm_seeds) or (
            ecosystem == "pypi" and package in pypi_seeds
        )
        if source == "curated_registry_normal_packages":
            tier = "explicit_curated" if in_seeds else "dependency_closure"
        elif in_seeds:
            tier = "explicit_curated"
        elif "explicit_curated_review" in label_source:
            tier = "explicit_curated"
        else:
            tier = "dependency_closure"
    output["review_tier"] = tier
    if tier == "dependency_closure":
        output["label_confidence"] = min(
            float(output.get("label_confidence") or 0.75),
            0.75,
        )
    else:
        output["label_confidence"] = max(
            float(output.get("label_confidence") or 0.85),
            0.85,
        )
    return output


def merge_negative_packages(
    sources: list[Path],
    output: Path,
    *,
    positive_path: Path | None = None,
    exclude_pool_path: Path | None = None,
) -> dict[str, int]:
    positive_keys: set[str] = set()
    if positive_path is not None:
        positive_keys = {_key(record) for record in read_jsonl(positive_path)}
    pool_keys: set[str] = set()
    if exclude_pool_path is not None:
        pool_keys = {_key(record) for record in read_jsonl(exclude_pool_path)}
    held_out_keys = {str(key).strip().casefold() for key in HELD_OUT_DEMO_PACKAGES}

    merged: dict[str, dict] = {}
    excluded_pool = 0
    excluded_held_out = 0
    for path in sources:
        for record in read_jsonl(path):
            key = _key(record)
            if key in positive_keys:
                continue
            if key in pool_keys:
                excluded_pool += 1
                continue
            if key in held_out_keys:
                excluded_held_out += 1
                continue
            record = _normalize_review_tier(record)
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
        "excluded_pool_overlap": excluded_pool,
        "excluded_held_out": excluded_held_out,
        "merged": len(ordered),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Merge curated normal-package lists into one negative pool."
    )
    parser.add_argument("--source", action="append", type=Path, required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--positive-path", type=Path)
    parser.add_argument("--exclude-pool", type=Path)
    args = parser.parse_args()
    summary = merge_negative_packages(
        args.source,
        args.output,
        positive_path=args.positive_path,
        exclude_pool_path=args.exclude_pool,
    )
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
