"""自动发现案例目录中的产物、attestation 和日志证据。"""

from __future__ import annotations

from pathlib import Path

from .config import ROOT


ARTIFACT_SUFFIXES = (".tar.gz", ".tgz", ".zip", ".jar", ".whl", ".exe", ".dmg")
ATTESTATION_SUFFIXES = (".intoto.jsonl", ".intoto.json", ".attestation.jsonl", ".attestation.json")
LOG_SUFFIXES = (".jsonl", ".json", ".log", ".txt")


def resolve_local_path(value: str | Path) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = ROOT / path
    return path.resolve()


def infer_case_evidence_paths(target_path: str | Path | None) -> dict[str, object]:
    if not target_path:
        return {}
    target = resolve_local_path(target_path)
    case_root = infer_case_root(target)
    if case_root is None:
        return {}

    artifact_path, attestation_path = discover_artifact_pair(case_root)
    log_paths = discover_log_paths(case_root)
    result: dict[str, object] = {}
    if artifact_path is not None:
        result["artifact_path"] = str(artifact_path)
    if attestation_path is not None:
        result["attestation_path"] = str(attestation_path)
    if log_paths:
        result["log_paths"] = [str(path) for path in log_paths]
    return result


def infer_case_root(target: Path) -> Path | None:
    start = target.parent if target.is_file() else target
    root_resolved = ROOT.resolve()
    for candidate in [start, *start.parents]:
        try:
            candidate.resolve().relative_to(root_resolved)
        except ValueError:
            break
        if (candidate / "artifacts").is_dir() or (candidate / "logs").is_dir():
            return candidate.resolve()
    return None


def discover_artifact_pair(case_root: Path) -> tuple[Path | None, Path | None]:
    artifact_dir = case_root / "artifacts"
    if not artifact_dir.is_dir():
        return None, None
    artifacts = sorted(path for path in artifact_dir.iterdir() if path.is_file() and has_suffix(path, ARTIFACT_SUFFIXES))
    attestations = sorted(path for path in artifact_dir.iterdir() if path.is_file() and has_suffix(path, ATTESTATION_SUFFIXES))
    if not artifacts or not attestations:
        return artifacts[0] if artifacts else None, attestations[0] if attestations else None

    for artifact in artifacts:
        stem = artifact_stem(artifact.name)
        for attestation in attestations:
            if attestation.name.startswith(stem):
                return artifact.resolve(), attestation.resolve()
    return artifacts[0].resolve(), attestations[0].resolve()


def discover_log_paths(case_root: Path) -> list[Path]:
    log_dir = case_root / "logs"
    if not log_dir.is_dir():
        return []
    return sorted(path.resolve() for path in log_dir.iterdir() if path.is_file() and has_suffix(path, LOG_SUFFIXES))


def has_suffix(path: Path, suffixes: tuple[str, ...]) -> bool:
    name = path.name.lower()
    return any(name.endswith(suffix) for suffix in suffixes)


def artifact_stem(name: str) -> str:
    lowered = name.lower()
    for suffix in ARTIFACT_SUFFIXES:
        if lowered.endswith(suffix):
            return name[: -len(suffix)]
    return Path(name).stem
