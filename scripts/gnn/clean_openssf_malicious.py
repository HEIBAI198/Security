from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Iterable


DEFAULT_ECOSYSTEMS = {"npm", "pypi"}


def normalize_ecosystem(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    if normalized == "pypi":
        return "pypi"
    if normalized == "npm":
        return "npm"
    return None


def normalize_package_name(name: Any, ecosystem: str) -> str | None:
    if not isinstance(name, str):
        return None
    stripped = name.strip()
    if not stripped:
        return None
    lowered = stripped.lower()
    if ecosystem == "pypi":
        return re.sub(r"[-_.]+", "-", lowered)
    return lowered


def _string_list(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    return [str(value) for value in values if value is not None and str(value).strip()]


def _range_features(ranges: Any) -> tuple[list[dict[str, Any]], list[str], list[str]]:
    if not isinstance(ranges, list):
        return [], [], []

    version_ranges: list[dict[str, Any]] = []
    introduced_versions: list[str] = []
    fixed_versions: list[str] = []

    for range_item in ranges:
        if not isinstance(range_item, dict):
            continue
        events: list[dict[str, str]] = []
        for event in range_item.get("events", []):
            if not isinstance(event, dict):
                continue
            normalized_event: dict[str, str] = {}
            for key in ("introduced", "fixed", "last_affected", "limit"):
                if event.get(key) is None:
                    continue
                value = str(event[key])
                normalized_event[key] = value
                if key == "introduced":
                    introduced_versions.append(value)
                elif key == "fixed":
                    fixed_versions.append(value)
            if normalized_event:
                events.append(normalized_event)

        if events:
            version_ranges.append(
                {
                    "type": str(range_item.get("type") or "ECOSYSTEM"),
                    "events": events,
                }
            )

    return version_ranges, introduced_versions, fixed_versions


def normalize_osv_payload(
    payload: dict[str, Any], ecosystems: Iterable[str] | None = None
) -> list[dict[str, Any]]:
    allowed = {item.lower() for item in (ecosystems or DEFAULT_ECOSYSTEMS)}
    source_id = str(payload.get("id") or "").strip()
    if not source_id:
        return []

    summary = str(payload.get("summary") or "").strip()
    details = str(payload.get("details") or "").strip()
    text = "\n\n".join(part for part in (summary, details) if part)

    records: list[dict[str, Any]] = []
    affected_items = payload.get("affected")
    if not isinstance(affected_items, list):
        return []

    for affected in affected_items:
        if not isinstance(affected, dict):
            continue
        package_info = affected.get("package")
        if not isinstance(package_info, dict):
            continue

        ecosystem = normalize_ecosystem(package_info.get("ecosystem"))
        if ecosystem is None or ecosystem not in allowed:
            continue

        raw_package = package_info.get("name")
        package = normalize_package_name(raw_package, ecosystem)
        if package is None:
            continue

        version_ranges, introduced_versions, fixed_versions = _range_features(
            affected.get("ranges")
        )

        records.append(
            {
                "source": "openssf/malicious-packages",
                "source_id": source_id,
                "ecosystem": ecosystem,
                "package": package,
                "raw_package": str(raw_package).strip(),
                "label": 1,
                "summary": summary,
                "details": details,
                "text": text,
                "aliases": _string_list(payload.get("aliases")),
                "published": str(payload.get("published") or "").strip(),
                "modified": str(payload.get("modified") or "").strip(),
                "affected_versions": _string_list(affected.get("versions")),
                "version_ranges": version_ranges,
                "introduced_versions": introduced_versions,
                "fixed_versions": fixed_versions,
            }
        )

    return records


def _candidate_roots(
    input_path: Path, ecosystems: set[str]
) -> list[tuple[str | None, Path]]:
    if input_path.is_file():
        return [(None, input_path)]

    direct_children = [child for child in input_path.iterdir() if child.is_dir()]
    ecosystem_roots: list[tuple[str, Path]] = []
    for child in direct_children:
        ecosystem = normalize_ecosystem(child.name)
        if ecosystem in ecosystems:
            ecosystem_roots.append((ecosystem, child))

    if ecosystem_roots:
        return sorted(ecosystem_roots, key=lambda item: item[0])
    return [(None, input_path)]


def _load_json_payloads(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if isinstance(payload, dict):
        return [payload]
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    return []


def clean_dataset(
    input_path: str | Path,
    output_path: str | Path,
    ecosystems: Iterable[str] | None = None,
    max_per_ecosystem: int | None = None,
) -> dict[str, int]:
    input_root = Path(input_path)
    output_file = Path(output_path)
    allowed = {normalize_ecosystem(item) for item in (ecosystems or DEFAULT_ECOSYSTEMS)}
    allowed.discard(None)

    stats = {
        "files": 0,
        "records": 0,
        "written": 0,
        "duplicates": 0,
        "invalid_json": 0,
        "unreadable": 0,
        "limit_skipped": 0,
    }
    seen: set[tuple[str, str, str]] = set()
    cleaned_records: list[dict[str, Any]] = []
    written_by_ecosystem = {ecosystem: 0 for ecosystem in allowed}

    for hinted_ecosystem, root in _candidate_roots(input_root, allowed):
        iterator = [root] if root.is_file() else root.rglob("*.json")
        for json_file in iterator:
            if (
                hinted_ecosystem
                and max_per_ecosystem is not None
                and written_by_ecosystem[hinted_ecosystem] >= max_per_ecosystem
            ):
                break
            stats["files"] += 1
            try:
                payloads = _load_json_payloads(json_file)
            except json.JSONDecodeError:
                stats["invalid_json"] += 1
                continue
            except OSError:
                stats["unreadable"] += 1
                continue

            for payload in payloads:
                for record in normalize_osv_payload(payload, ecosystems=allowed):
                    stats["records"] += 1
                    ecosystem = record["ecosystem"]
                    if (
                        max_per_ecosystem is not None
                        and written_by_ecosystem[ecosystem] >= max_per_ecosystem
                    ):
                        stats["limit_skipped"] += 1
                        continue
                    key = (
                        ecosystem,
                        record["package"],
                        record["source_id"],
                    )
                    if key in seen:
                        stats["duplicates"] += 1
                        continue
                    seen.add(key)
                    cleaned_records.append(record)
                    written_by_ecosystem[ecosystem] += 1
                    if (
                        hinted_ecosystem
                        and max_per_ecosystem is not None
                        and written_by_ecosystem[hinted_ecosystem] >= max_per_ecosystem
                    ):
                        break
                if (
                    hinted_ecosystem
                    and max_per_ecosystem is not None
                    and written_by_ecosystem[hinted_ecosystem] >= max_per_ecosystem
                ):
                    continue

    cleaned_records.sort(
        key=lambda item: (item["ecosystem"], item["package"], item["source_id"])
    )
    output_file.parent.mkdir(parents=True, exist_ok=True)
    with output_file.open("w", encoding="utf-8", newline="\n") as handle:
        for record in cleaned_records:
            handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True))
            handle.write("\n")

    stats["written"] = len(cleaned_records)
    return stats


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Clean OpenSSF malicious-packages OSV JSON into package JSONL."
    )
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--ecosystems", nargs="+", default=sorted(DEFAULT_ECOSYSTEMS))
    parser.add_argument("--max-per-ecosystem", type=int)
    args = parser.parse_args()

    stats = clean_dataset(
        args.input,
        args.output,
        ecosystems=args.ecosystems,
        max_per_ecosystem=args.max_per_ecosystem,
    )
    print(json.dumps(stats, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
