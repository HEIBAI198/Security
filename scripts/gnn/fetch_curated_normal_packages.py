"""Fetch independently sourced metadata for an explicit normal-package review list."""

from __future__ import annotations

import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.request import Request, urlopen


def _package_names(lockfiles: list[Path]) -> list[str]:
    names: set[str] = set()
    for path in lockfiles:
        payload = json.loads(path.read_text(encoding="utf-8"))
        packages = payload.get("packages") if isinstance(payload, dict) else None
        if isinstance(packages, dict):
            for key, item in packages.items():
                if key.startswith("node_modules/"):
                    name = key[len("node_modules/"):]
                    if name and "/node_modules/" not in name:
                        names.add(name)
        dependencies = payload.get("dependencies") if isinstance(payload, dict) else None
        if isinstance(dependencies, dict):
            names.update(str(name) for name in dependencies if str(name).strip())
    return sorted(names)


def _fetch_npm(name: str) -> dict | None:
    url_name = name.replace("/", "%2f")
    request = Request(
        f"https://registry.npmjs.org/{url_name}",
        headers={"User-Agent": "supplyguard-gnn-dataset-builder/1.0"},
    )
    try:
        with urlopen(request, timeout=20) as response:
            payload = json.load(response)
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    latest = payload.get("dist-tags", {}).get("latest") if isinstance(payload.get("dist-tags"), dict) else ""
    version_meta = payload.get("versions", {}).get(latest, {}) if latest else {}
    time_map = payload.get("time") if isinstance(payload.get("time"), dict) else {}
    repository = version_meta.get("repository") or payload.get("repository")
    scripts = version_meta.get("scripts") if isinstance(version_meta.get("scripts"), dict) else {}
    return {
        "ecosystem": "npm",
        "package": name,
        "version": latest,
        "latest_version": latest,
        "versions": sorted(payload.get("versions", {}).keys())[-20:],
        "description": version_meta.get("description") or payload.get("description") or "",
        "keywords": version_meta.get("keywords") or payload.get("keywords") or [],
        "dependencies": [
            {"ecosystem": "npm", "name": dep, "version": spec}
            for dep, spec in (version_meta.get("dependencies") or {}).items()
        ],
        "maintainers": version_meta.get("maintainers") or payload.get("maintainers") or [],
        "repository": repository,
        "homepage": version_meta.get("homepage") or payload.get("homepage") or "",
        "license": version_meta.get("license") or "",
        "install_scripts": {key: value for key, value in scripts.items() if key in {"preinstall", "install", "postinstall"}},
        "published": time_map.get(latest) or "",
        "created": time_map.get("created") or "",
        "modified": time_map.get("modified") or "",
        "metadata_source": "npm_registry_explicit_curated_review",
    }


def fetch(lockfiles: list[Path], output: Path, max_workers: int = 8, explicit_names: list[str] | None = None) -> dict[str, int]:
    names = sorted(set(_package_names(lockfiles)) | {name.strip() for name in (explicit_names or []) if name.strip()})
    records: list[dict] = []
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(_fetch_npm, name): name for name in names}
        for future in as_completed(futures):
            record = future.result()
            if record:
                record["label"] = 0
                record["label_source"] = "npm_registry_explicit_curated_review"
                record["label_confidence"] = 0.85
                record["source"] = "curated_lockfile_normal_packages"
                record["evidence_sources"] = ["npm_registry", *[str(path) for path in lockfiles]]
                records.append(record)
    records.sort(key=lambda item: str(item["package"]).lower())
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("".join(json.dumps(item, ensure_ascii=False, sort_keys=True) + "\n" for item in records), encoding="utf-8")
    return {"lockfile_packages": len(names), "fetched": len(records)}


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch reviewed normal npm package metadata from lockfiles")
    parser.add_argument("--lockfile", action="append", type=Path, required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--max-workers", type=int, default=8)
    parser.add_argument("--package", action="append", default=[])
    args = parser.parse_args()
    print(json.dumps(fetch(args.lockfile, args.output, args.max_workers, args.package), ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
