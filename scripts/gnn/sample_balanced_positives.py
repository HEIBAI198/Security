"""Sample a balanced malicious-package set (npm + pypi) from the OpenSSF pool.

The full OpenSSF malicious-packages pool contains both ecosystems; the previous
balanced file used npm only, which taught the classifier that PyPI implies
benign. This sampler keeps the same record schema and a fixed random seed so
the training split is reproducible.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[2]))

from scripts.gnn.dataset_utils import read_jsonl, write_jsonl
from scripts.gnn.held_out_packages import HELD_OUT_DEMO_PACKAGES


def _key(record: dict) -> str:
    ecosystem = str(record.get("ecosystem") or "").strip().lower()
    package = str(record.get("package") or record.get("raw_package") or "").strip().lower()
    if ecosystem == "pypi":
        package = package.replace("_", "-").replace(".", "-")
    return f"{ecosystem}:{package}"


def sample_balanced_positives(
    source: str | Path,
    output: str | Path,
    *,
    per_ecosystem: int = 1200,
    random_state: int = 42,
) -> dict[str, int]:
    records = read_jsonl(source)
    by_ecosystem: dict[str, list[dict]] = {}
    held_out = {str(key).strip().casefold() for key in HELD_OUT_DEMO_PACKAGES}
    excluded_held_out = 0
    for record in records:
        ecosystem = str(record.get("ecosystem") or "").strip().lower()
        if _key(record) in held_out:
            excluded_held_out += 1
            continue
        by_ecosystem.setdefault(ecosystem, []).append(record)

    rng = random.Random(random_state)
    selected: list[dict] = []
    for ecosystem in ("npm", "pypi"):
        pool = by_ecosystem.get(ecosystem, [])
        if len(pool) < int(per_ecosystem):
            raise ValueError(
                f"only {len(pool)} {ecosystem} records available, need {int(per_ecosystem)}"
            )
        selected.extend(rng.sample(pool, int(per_ecosystem)))

    selected.sort(
        key=lambda item: (
            str(item.get("ecosystem")),
            str(item.get("package") or item.get("raw_package") or "").lower(),
        )
    )
    write_jsonl(output, selected)
    return {
        "npm": int(per_ecosystem),
        "pypi": int(per_ecosystem),
        "total": len(selected),
        "excluded_held_out": excluded_held_out,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Sample balanced npm+pypi malicious packages from the OpenSSF pool."
    )
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--per-ecosystem", type=int, default=1200)
    parser.add_argument("--random-state", type=int, default=42)
    args = parser.parse_args()
    summary = sample_balanced_positives(
        args.source,
        args.output,
        per_ecosystem=args.per_ecosystem,
        random_state=args.random_state,
    )
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
