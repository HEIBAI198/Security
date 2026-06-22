from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import unquote

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[2]))

from scripts.gnn.clean_openssf_malicious import normalize_package_name


DEPENDENCY_SECTIONS = (
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
)
SKIP_DIR_NAMES = {
    ".git",
    ".worktrees",
    "__pycache__",
    "node_modules",
    "dist",
}
SKIP_PATH_PREFIXES = {"storage/gnn_datasets", "storage/graph_models"}


def _safe_load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _iter_candidate_files(root: Path) -> Iterable[Path]:
    if root.is_file():
        yield root
        return

    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(root).as_posix()
        relative_parts = set(path.relative_to(root).parts)
        if relative_parts & SKIP_DIR_NAMES:
            continue
        if any(relative.startswith(prefix + "/") for prefix in SKIP_PATH_PREFIXES):
            continue
        name = path.name.lower()
        if name in {"package.json", "package-lock.json"}:
            yield path
        elif name.startswith("requirements") and path.suffix.lower() == ".txt":
            yield path
        elif name.endswith(".cdx.json"):
            yield path


def _record(
    ecosystem: str,
    raw_package: Any,
    version: Any,
    source_path: Path,
    source_type: str,
) -> dict[str, Any] | None:
    package = normalize_package_name(raw_package, ecosystem)
    if package is None:
        return None
    return {
        "source": "local_dependency_baseline",
        "source_type": source_type,
        "evidence_sources": [str(source_path)],
        "ecosystem": ecosystem,
        "package": package,
        "raw_package": str(raw_package).strip(),
        "versions": [str(version).strip()] if version is not None and str(version).strip() else [],
        "label": 0,
    }


def _records_from_package_json(path: Path) -> list[dict[str, Any]]:
    payload = _safe_load_json(path)
    if not isinstance(payload, dict):
        return []

    records: list[dict[str, Any]] = []
    for section in DEPENDENCY_SECTIONS:
        dependencies = payload.get(section)
        if not isinstance(dependencies, dict):
            continue
        for name, version in dependencies.items():
            record = _record("npm", name, version, path, f"package.json:{section}")
            if record is not None:
                records.append(record)
    return records


def _package_name_from_lock_path(lock_path: str) -> str | None:
    prefix = "node_modules/"
    if not lock_path.startswith(prefix):
        return None
    name = lock_path[len(prefix) :]
    if name.startswith("@"):
        parts = name.split("/")
        if len(parts) >= 2:
            return "/".join(parts[:2])
    return name.split("/")[0]


def _records_from_package_lock(path: Path) -> list[dict[str, Any]]:
    payload = _safe_load_json(path)
    if not isinstance(payload, dict):
        return []

    records: list[dict[str, Any]] = []
    packages = payload.get("packages")
    if isinstance(packages, dict):
        for lock_path, package_info in packages.items():
            if not isinstance(package_info, dict) or not lock_path:
                continue
            name = package_info.get("name") or _package_name_from_lock_path(str(lock_path))
            record = _record("npm", name, package_info.get("version"), path, "package-lock")
            if record is not None:
                records.append(record)
        return records

    dependencies = payload.get("dependencies")
    if isinstance(dependencies, dict):
        for name, package_info in dependencies.items():
            version = package_info.get("version") if isinstance(package_info, dict) else None
            record = _record("npm", name, version, path, "package-lock")
            if record is not None:
                records.append(record)
    return records


REQUIREMENT_RE = re.compile(r"^\s*([A-Za-z0-9_.-]+)(?:\[[^\]]+\])?\s*(.*)$")


def _records_from_requirements(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or line.startswith("-"):
            continue
        line = line.split("#", 1)[0].strip()
        match = REQUIREMENT_RE.match(line)
        if not match:
            continue
        name, version_spec = match.groups()
        record = _record("pypi", name, version_spec.strip(), path, "requirements")
        if record is not None:
            records.append(record)
    return records


def _parse_purl(purl: Any) -> tuple[str | None, str | None, str | None]:
    if not isinstance(purl, str) or not purl.startswith("pkg:"):
        return None, None, None
    body = purl[4:].split("?", 1)[0].split("#", 1)[0]
    if "/" not in body:
        return None, None, None
    purl_type, name_and_version = body.split("/", 1)
    version = None
    if "@" in name_and_version:
        name_part, version = name_and_version.rsplit("@", 1)
    else:
        name_part = name_and_version
    ecosystem = purl_type.lower()
    if ecosystem == "pypi":
        ecosystem = "pypi"
    elif ecosystem == "npm":
        ecosystem = "npm"
    else:
        return None, None, None
    return ecosystem, unquote(name_part), unquote(version) if version else None


def _records_from_cyclonedx(path: Path) -> list[dict[str, Any]]:
    payload = _safe_load_json(path)
    if not isinstance(payload, dict):
        return []

    records: list[dict[str, Any]] = []
    components = payload.get("components")
    if not isinstance(components, list):
        return []

    for component in components:
        if not isinstance(component, dict):
            continue
        ecosystem, purl_name, purl_version = _parse_purl(component.get("purl"))
        if ecosystem is None:
            continue
        record = _record(
            ecosystem,
            purl_name or component.get("name"),
            purl_version or component.get("version"),
            path,
            "cyclonedx",
        )
        if record is not None:
            records.append(record)
    return records


def _records_from_file(path: Path) -> list[dict[str, Any]]:
    name = path.name.lower()
    if name == "package.json":
        return _records_from_package_json(path)
    if name == "package-lock.json":
        return _records_from_package_lock(path)
    if name.startswith("requirements") and path.suffix.lower() == ".txt":
        return _records_from_requirements(path)
    if name.endswith(".cdx.json"):
        return _records_from_cyclonedx(path)
    return []


def _load_positive_keys(path: str | Path | None) -> set[tuple[str, str]]:
    if path is None:
        return set()
    positive_path = Path(path)
    if not positive_path.exists():
        return set()
    keys: set[tuple[str, str]] = set()
    for line in positive_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        ecosystem = payload.get("ecosystem")
        package = payload.get("package")
        if isinstance(ecosystem, str) and isinstance(package, str):
            keys.add((ecosystem.lower(), package.lower()))
    return keys


def _merge_record(
    merged: dict[tuple[str, str], dict[str, Any]], record: dict[str, Any]
) -> None:
    key = (record["ecosystem"], record["package"])
    if key not in merged:
        merged[key] = record
        return

    existing = merged[key]
    existing["versions"] = sorted(set(existing["versions"]) | set(record["versions"]))
    existing["evidence_sources"] = sorted(
        set(existing["evidence_sources"]) | set(record["evidence_sources"])
    )


def build_weak_negatives(
    roots: Iterable[str | Path],
    output_path: str | Path,
    positive_path: str | Path | None = None,
) -> dict[str, int]:
    positive_keys = _load_positive_keys(positive_path)
    merged: dict[tuple[str, str], dict[str, Any]] = {}
    stats = {
        "files": 0,
        "candidates": 0,
        "excluded_positive": 0,
        "written": 0,
    }

    for root in roots:
        for candidate_file in _iter_candidate_files(Path(root)):
            stats["files"] += 1
            try:
                records = _records_from_file(candidate_file)
            except (OSError, json.JSONDecodeError, UnicodeDecodeError):
                continue
            for record in records:
                stats["candidates"] += 1
                key = (record["ecosystem"], record["package"])
                if key in positive_keys:
                    stats["excluded_positive"] += 1
                    continue
                _merge_record(merged, record)

    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    records = [merged[key] for key in sorted(merged)]
    with output_file.open("w", encoding="utf-8", newline="\n") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True))
            handle.write("\n")

    stats["written"] = len(records)
    return stats


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build weak negative package samples from local manifests and SBOMs."
    )
    parser.add_argument("--root", nargs="+", default=["."])
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--positive-path", type=Path)
    args = parser.parse_args()

    stats = build_weak_negatives(args.root, args.output, positive_path=args.positive_path)
    print(json.dumps(stats, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
