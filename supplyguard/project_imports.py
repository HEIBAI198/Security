"""Project import and repository preflight analysis.

The importer intentionally avoids executing project code. It only unpacks or
clones sources, walks the file tree, and detects project metadata.
"""

from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tarfile
import uuid
from typing import Any
from urllib.parse import unquote, urlparse
import zipfile

from .config import IMPORT_WORKSPACE_DIR


MAX_UPLOAD_BYTES = 100 * 1024 * 1024
MAX_ARCHIVE_ENTRIES = 20000
MAX_WALK_FILES = 100000
MAX_WINDOWS_EXTRACT_PATH = 240
GIT_CLONE_TIMEOUT_SECONDS = 300
GIT_CHECKOUT_TIMEOUT_SECONDS = 60

IGNORED_DIRS = {
    ".git",
    ".hg",
    ".svn",
    ".idea",
    ".vscode",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".tox",
    ".venv",
    ".venv-1",
    "venv",
    "env",
    "envs",
    "node_modules",
    "bower_components",
    "vendor",
    "dist",
    "build",
    "target",
    "out",
    ".next",
    ".nuxt",
    "coverage",
    "storage",
    "outputs",
    "site",
}

DEPENDENCY_FILE_NAMES = {
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
    "requirements.txt",
    "requirements-dev.txt",
    "pyproject.toml",
    "poetry.lock",
    "pipfile",
    "pipfile.lock",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "settings.gradle",
    "settings.gradle.kts",
    "go.mod",
    "go.sum",
    "cargo.toml",
    "cargo.lock",
    "composer.json",
    "composer.lock",
    "gemfile",
    "gemfile.lock",
    "mix.exs",
    "rebar.config",
    "pubspec.yaml",
    "packages.config",
    "paket.dependencies",
    "project.assets.json",
}

CI_FILE_NAMES = {
    ".gitlab-ci.yml",
    ".gitlab-ci.yaml",
    "jenkinsfile",
    "azure-pipelines.yml",
    "azure-pipelines.yaml",
    ".travis.yml",
    "appveyor.yml",
    "bitbucket-pipelines.yml",
    "circle.yml",
}

SPECIAL_LANGUAGE_FILES = {
    "Dockerfile": "Dockerfile",
    "Containerfile": "Dockerfile",
    "Makefile": "Makefile",
    "Jenkinsfile": "Groovy",
    "Gemfile": "Ruby",
    "Rakefile": "Ruby",
    "Pipfile": "Python",
}

LANGUAGE_BY_EXTENSION = {
    ".py": "Python",
    ".pyw": "Python",
    ".ipynb": "Jupyter Notebook",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".mjs": "JavaScript",
    ".cjs": "JavaScript",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".java": "Java",
    ".go": "Go",
    ".rs": "Rust",
    ".rb": "Ruby",
    ".php": "PHP",
    ".cs": "C#",
    ".c": "C",
    ".h": "C/C++",
    ".cc": "C++",
    ".cpp": "C++",
    ".cxx": "C++",
    ".hpp": "C++",
    ".kt": "Kotlin",
    ".kts": "Kotlin",
    ".swift": "Swift",
    ".scala": "Scala",
    ".sh": "Shell",
    ".bash": "Shell",
    ".zsh": "Shell",
    ".fish": "Shell",
    ".ps1": "PowerShell",
    ".psm1": "PowerShell",
    ".bat": "Batchfile",
    ".cmd": "Batchfile",
    ".html": "HTML",
    ".htm": "HTML",
    ".css": "CSS",
    ".scss": "SCSS",
    ".sass": "Sass",
    ".less": "Less",
    ".vue": "Vue",
    ".svelte": "Svelte",
    ".sql": "SQL",
    ".r": "R",
    ".m": "MATLAB",
    ".mm": "Objective-C++",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".json": "JSON",
    ".toml": "TOML",
    ".xml": "XML",
    ".gradle": "Gradle",
    ".tf": "HCL",
    ".hcl": "HCL",
    ".dockerfile": "Dockerfile",
    ".md": "Markdown",
}

BINARY_EXTENSIONS = {
    ".7z",
    ".avi",
    ".bmp",
    ".class",
    ".dll",
    ".dmg",
    ".exe",
    ".gif",
    ".gz",
    ".ico",
    ".jar",
    ".jpeg",
    ".jpg",
    ".mp3",
    ".mp4",
    ".pdf",
    ".png",
    ".pyc",
    ".rar",
    ".so",
    ".tar",
    ".tgz",
    ".webp",
    ".zip",
}


class ImportErrorDetail(ValueError):
    """Raised when an import request is invalid or cannot be processed."""


def create_upload_import(filename: str, content: bytes) -> dict[str, Any]:
    clean_filename = _clean_filename(filename)
    if not content:
        raise ImportErrorDetail("Uploaded archive is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise ImportErrorDetail("Uploaded archive exceeds the 100 MB limit.")
    if not _is_supported_archive(clean_filename):
        raise ImportErrorDetail("Only .zip, .tar, .tar.gz, and .tgz archives are supported.")

    import_id = _new_import_id()
    import_dir = _prepare_import_dir(import_id)
    archive_path = import_dir / "archive" / clean_filename
    source_dir = import_dir / "source"
    archive_path.parent.mkdir(parents=True, exist_ok=True)
    source_dir.mkdir(parents=True, exist_ok=True)
    archive_path.write_bytes(content)

    _safe_unpack_archive(archive_path, source_dir)
    project_dir = _collapse_single_root(source_dir)
    source_ref = {"filename": clean_filename, "sizeBytes": len(content)}
    summary = analyze_project(project_dir, "upload", source_ref)
    metadata = _build_import_metadata(import_id, "upload", project_dir, summary, source_ref)
    _save_metadata(import_dir, metadata)
    _save_latest_import(import_id)
    return metadata


def create_git_import(
    url: str,
    ref: str | None = None,
    commit: str | None = None,
    project_name: str | None = None,
) -> dict[str, Any]:
    git_url = url.strip()
    if not _is_allowed_git_url(git_url):
        raise ImportErrorDetail("Git URL must be http(s), ssh, or git@host:path format.")

    import_id = _new_import_id()
    import_dir = _prepare_import_dir(import_id)
    source_dir = import_dir / "source"
    clone_cmd = [
        "git",
        "clone",
        "--depth",
        "1",
        "--single-branch",
        "--filter=blob:none",
    ]
    if ref:
        clone_cmd.extend(["--branch", ref.strip()])
    clone_cmd.extend([git_url, str(source_dir)])

    try:
        subprocess.run(
            clone_cmd,
            cwd=import_dir,
            check=True,
            capture_output=True,
            text=True,
            timeout=GIT_CLONE_TIMEOUT_SECONDS,
        )
        if commit:
            subprocess.run(
                ["git", "checkout", commit.strip()],
                cwd=source_dir,
                check=True,
                capture_output=True,
                text=True,
                timeout=GIT_CHECKOUT_TIMEOUT_SECONDS,
            )
    except FileNotFoundError as exc:
        raise ImportErrorDetail("Git executable is not available on the server.") from exc
    except subprocess.CalledProcessError as exc:
        message = (exc.stderr or exc.stdout or "Git import failed.").strip()
        raise ImportErrorDetail(message) from exc
    except subprocess.TimeoutExpired as exc:
        raise ImportErrorDetail("Git import timed out.") from exc

    source_ref = {"url": git_url, "ref": ref or "", "commit": commit or ""}
    summary = analyze_project(source_dir, "git", source_ref, project_name=project_name)
    metadata = _build_import_metadata(import_id, "git", source_dir, summary, source_ref)
    _save_metadata(import_dir, metadata)
    _save_latest_import(import_id)
    return metadata


def create_local_import(path: str, project_name: str | None = None) -> dict[str, Any]:
    source_dir = Path(path).expanduser().resolve()
    if not source_dir.exists() or not source_dir.is_dir():
        raise ImportErrorDetail("Local project path does not exist or is not a directory.")

    import_id = _new_import_id()
    import_dir = _prepare_import_dir(import_id)
    source_ref = {"path": str(source_dir)}
    summary = analyze_project(source_dir, "local", source_ref, project_name=project_name)
    metadata = _build_import_metadata(import_id, "local", source_dir, summary, source_ref)
    _save_metadata(import_dir, metadata)
    _save_latest_import(import_id)
    return metadata


def load_import(import_id: str) -> dict[str, Any]:
    metadata_path = _metadata_path(import_id)
    if not metadata_path.exists():
        raise ImportErrorDetail("Project import was not found.")
    return json.loads(metadata_path.read_text(encoding="utf-8"))


def load_latest_import() -> dict[str, Any] | None:
    latest_path = _latest_import_path()
    if latest_path.exists():
        import_id = latest_path.read_text(encoding="utf-8").strip()
        if import_id:
            try:
                metadata = load_import(import_id)
                if _source_path_exists(metadata):
                    return metadata
            except ImportErrorDetail:
                pass

    latest_metadata: dict[str, Any] | None = None
    for metadata_path in IMPORT_WORKSPACE_DIR.glob("imp_*/metadata.json"):
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not _source_path_exists(metadata):
            continue
        if latest_metadata is None or metadata.get("createdAt", "") > latest_metadata.get("createdAt", ""):
            latest_metadata = metadata
    return latest_metadata


def start_scan(import_id: str, scope: str = ".") -> dict[str, Any]:
    metadata = load_import(import_id)
    now = _utc_now()
    scan_id = f"scan_{uuid.uuid4().hex[:12]}"
    scan_job = {
        "scanId": scan_id,
        "importId": import_id,
        "projectName": metadata["projectName"],
        "status": "queued",
        "scope": scope or ".",
        "engines": ["code-audit", "dependency-preflight", "ci-preflight"],
        "createdAt": now,
        "message": "Scan job queued. Scanner workers can attach Trivy, OSV-Scanner, Gitleaks, or custom engines here.",
    }
    metadata.setdefault("scanJobs", []).append(scan_job)
    metadata["status"] = "scan_queued"
    metadata["updatedAt"] = now
    _save_metadata(_import_dir(import_id), metadata)
    return scan_job


def analyze_project(
    project_dir: Path,
    source_type: str,
    source_ref: dict[str, Any],
    project_name: str | None = None,
) -> dict[str, Any]:
    root = project_dir.resolve()
    workspace_root = IMPORT_WORKSPACE_DIR.resolve().parents[1]
    language_bytes: Counter[str] = Counter()
    language_files: Counter[str] = Counter()
    dependency_files: list[str] = []
    ci_files: list[str] = []
    warnings: list[str] = []
    total_files = 0
    ignored_files = 0
    scannable_files = 0
    binary_files = 0

    for current_dir, dir_names, file_names in _walk(root):
        current_path = Path(current_dir).resolve()
        kept_dirs: list[str] = []
        for dir_name in dir_names:
            child_path = current_path / dir_name
            if _is_ignored_dir(dir_name) or _is_runtime_workspace(child_path, root, workspace_root):
                ignored_files += _count_files_limited(child_path)
            else:
                kept_dirs.append(dir_name)
        dir_names[:] = kept_dirs

        for file_name in file_names:
            path = Path(current_dir) / file_name
            total_files += 1
            if total_files > MAX_WALK_FILES:
                warnings.append(f"File walk stopped after {MAX_WALK_FILES:,} files.")
                break

            rel = _relative_posix(path, root)
            lower_name = file_name.lower()
            lower_rel = rel.lower()

            if lower_name in DEPENDENCY_FILE_NAMES:
                dependency_files.append(rel)
            if _is_ci_file(lower_rel):
                ci_files.append(rel)

            if _is_binary_file(path):
                binary_files += 1
                ignored_files += 1
                continue

            scannable_files += 1
            language = _detect_language(path)
            if language:
                size = max(path.stat().st_size, 1)
                language_bytes[language] += size
                language_files[language] += 1

    languages = _language_breakdown(language_bytes, language_files)
    dependency_files = sorted(set(dependency_files))
    ci_files = sorted(set(ci_files))

    if not dependency_files:
        warnings.append("No dependency manifest or lockfile was found.")
    if not ci_files:
        warnings.append("No CI/CD configuration file was found.")
    if _looks_like_monorepo(dependency_files):
        warnings.append("Multiple dependency manifests suggest this may be a monorepo.")
    if binary_files:
        warnings.append(f"{binary_files} binary or archive files were skipped.")
    if source_type == "local":
        warnings.append("Local path imports are server-side reads; browsers cannot safely grant arbitrary filesystem access.")

    return {
        "projectName": project_name or _infer_project_name(root) or root.name,
        "sourceType": source_type,
        "sourceRef": source_ref,
        "fileStats": {
            "total": total_files + ignored_files,
            "scannable": scannable_files,
            "ignored": ignored_files,
            "binary": binary_files,
        },
        "languages": languages,
        "dependencyFiles": dependency_files[:200],
        "ciFiles": ci_files[:200],
        "warnings": warnings,
        "scanScope": ".",
    }


def _new_import_id() -> str:
    return f"imp_{uuid.uuid4().hex[:12]}"


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _prepare_import_dir(import_id: str) -> Path:
    path = _import_dir(import_id)
    path.mkdir(parents=True, exist_ok=False)
    return path


def _import_dir(import_id: str) -> Path:
    if not import_id.startswith("imp_") or not import_id.replace("imp_", "", 1).isalnum():
        raise ImportErrorDetail("Invalid import id.")
    IMPORT_WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)
    path = (IMPORT_WORKSPACE_DIR / import_id).resolve()
    path.relative_to(IMPORT_WORKSPACE_DIR.resolve())
    return path


def _metadata_path(import_id: str) -> Path:
    return _import_dir(import_id) / "metadata.json"


def _save_metadata(import_dir: Path, metadata: dict[str, Any]) -> None:
    import_dir.mkdir(parents=True, exist_ok=True)
    (import_dir / "metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _latest_import_path() -> Path:
    IMPORT_WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)
    return IMPORT_WORKSPACE_DIR / "latest_import.txt"


def _save_latest_import(import_id: str) -> None:
    _latest_import_path().write_text(import_id, encoding="utf-8")


def _source_path_exists(metadata: dict[str, Any]) -> bool:
    source_path = metadata.get("sourcePath")
    return isinstance(source_path, str) and Path(source_path).exists()


def _build_import_metadata(
    import_id: str,
    source_type: str,
    source_dir: Path,
    summary: dict[str, Any],
    source_ref: dict[str, Any],
) -> dict[str, Any]:
    now = _utc_now()
    return {
        "importId": import_id,
        "status": "ready",
        "projectName": summary["projectName"],
        "sourceType": source_type,
        "sourceRef": source_ref,
        "sourcePath": str(source_dir.resolve()),
        "createdAt": now,
        "updatedAt": now,
        "summary": summary,
    }


def _clean_filename(filename: str) -> str:
    value = unquote(filename or "").replace("\\", "/").split("/")[-1].strip()
    return value or "project.zip"


def _is_supported_archive(filename: str) -> bool:
    lower = filename.lower()
    return lower.endswith((".zip", ".tar", ".tar.gz", ".tgz"))


def _safe_unpack_archive(archive_path: Path, destination: Path) -> None:
    lower_name = archive_path.name.lower()
    if lower_name.endswith(".zip"):
        _safe_unpack_zip(archive_path, destination)
        return
    if lower_name.endswith((".tar", ".tar.gz", ".tgz")):
        _safe_unpack_tar(archive_path, destination)
        return
    raise ImportErrorDetail("Unsupported archive type.")


def _safe_unpack_zip(archive_path: Path, destination: Path) -> None:
    with zipfile.ZipFile(archive_path) as archive:
        infos = archive.infolist()
        if len(infos) > MAX_ARCHIVE_ENTRIES:
            raise ImportErrorDetail("Archive contains too many entries.")
        for info in infos:
            target = _archive_member_target(destination, info.filename)
            if _is_windows_extract_path_too_long(target):
                continue
            if info.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as source, target.open("wb") as output:
                shutil.copyfileobj(source, output)


def _safe_unpack_tar(archive_path: Path, destination: Path) -> None:
    with tarfile.open(archive_path) as archive:
        members = archive.getmembers()
        if len(members) > MAX_ARCHIVE_ENTRIES:
            raise ImportErrorDetail("Archive contains too many entries.")
        for member in members:
            if member.issym() or member.islnk():
                raise ImportErrorDetail("Archives with symbolic or hard links are not supported.")
            target = _archive_member_target(destination, member.name)
            if _is_windows_extract_path_too_long(target):
                continue
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            if not member.isfile():
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            extracted = archive.extractfile(member)
            if extracted is None:
                continue
            with extracted, target.open("wb") as output:
                shutil.copyfileobj(extracted, output)


def _archive_member_target(destination: Path, member_name: str) -> Path:
    normalized = member_name.replace("\\", "/")
    parts = [part for part in PurePosixPath(normalized).parts if part not in ("", ".")]
    if not parts or any(part == ".." for part in parts) or ":" in parts[0]:
        raise ImportErrorDetail("Archive contains an unsafe path.")
    target = destination.joinpath(*parts).resolve()
    target.relative_to(destination.resolve())
    return target


def _is_windows_extract_path_too_long(path: Path) -> bool:
    return os.name == "nt" and len(str(path)) >= MAX_WINDOWS_EXTRACT_PATH


def _collapse_single_root(source_dir: Path) -> Path:
    entries = [entry for entry in source_dir.iterdir() if entry.name not in {".DS_Store"}]
    if len(entries) == 1 and entries[0].is_dir():
        return entries[0]
    return source_dir


def _is_allowed_git_url(url: str) -> bool:
    if url.startswith("git@") and ":" in url:
        return True
    parsed = urlparse(url)
    return parsed.scheme in {"http", "https", "ssh", "git"} and bool(parsed.netloc)


def _walk(root: Path):
    return os.walk(root)


def _is_ignored_dir(name: str) -> bool:
    lower = name.lower()
    return lower in IGNORED_DIRS or lower.startswith(".venv")


def _is_runtime_workspace(path: Path, scan_root: Path, workspace_root: Path) -> bool:
    resolved = path.resolve()
    if resolved == scan_root:
        return False
    import_workspace = IMPORT_WORKSPACE_DIR.resolve()
    try:
        scan_root.relative_to(import_workspace)
        return False
    except ValueError:
        pass
    try:
        resolved.relative_to(import_workspace)
        return True
    except ValueError:
        pass
    try:
        resolved.relative_to(workspace_root / "storage")
        return True
    except ValueError:
        return False


def _count_files_limited(path: Path, limit: int = 10000) -> int:
    count = 0
    for _, dir_names, file_names in _walk(path):
        dir_names[:] = [name for name in dir_names if not _is_ignored_dir(name)]
        count += len(file_names)
        if count >= limit:
            return limit
    return count


def _relative_posix(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root).as_posix()


def _is_ci_file(lower_rel: str) -> bool:
    if lower_rel.startswith(".github/workflows/") and lower_rel.endswith((".yml", ".yaml")):
        return True
    if lower_rel.startswith(".circleci/") and lower_rel.endswith((".yml", ".yaml")):
        return True
    return Path(lower_rel).name in CI_FILE_NAMES


def _is_binary_file(path: Path) -> bool:
    if path.suffix.lower() in BINARY_EXTENSIONS:
        return True
    try:
        with path.open("rb") as file:
            sample = file.read(1024)
    except OSError:
        return True
    return b"\x00" in sample


def _detect_language(path: Path) -> str | None:
    name = path.name
    if name in SPECIAL_LANGUAGE_FILES:
        return SPECIAL_LANGUAGE_FILES[name]
    if name.lower().startswith("dockerfile."):
        return "Dockerfile"
    return LANGUAGE_BY_EXTENSION.get(path.suffix.lower())


def _language_breakdown(
    language_bytes: Counter[str],
    language_files: Counter[str],
) -> list[dict[str, Any]]:
    total_bytes = sum(language_bytes.values())
    if not total_bytes:
        return []
    return [
        {
            "name": language,
            "percent": round((size / total_bytes) * 100, 1),
            "files": language_files[language],
            "bytes": size,
        }
        for language, size in language_bytes.most_common()
    ]


def _looks_like_monorepo(dependency_files: list[str]) -> bool:
    major_manifests = {
        "package.json",
        "pyproject.toml",
        "pom.xml",
        "build.gradle",
        "build.gradle.kts",
        "go.mod",
        "cargo.toml",
    }
    roots = {
        str(PurePosixPath(item).parent)
        for item in dependency_files
        if PurePosixPath(item).name.lower() in major_manifests
    }
    return len(roots) > 1


def _infer_project_name(root: Path) -> str | None:
    package_json = root / "package.json"
    if package_json.exists():
        try:
            name = json.loads(package_json.read_text(encoding="utf-8")).get("name")
            if isinstance(name, str) and name.strip():
                return name.strip()
        except (OSError, json.JSONDecodeError):
            pass

    pyproject = root / "pyproject.toml"
    if pyproject.exists():
        try:
            import tomllib

            data = tomllib.loads(pyproject.read_text(encoding="utf-8"))
            name = data.get("project", {}).get("name")
            if isinstance(name, str) and name.strip():
                return name.strip()
        except (OSError, ValueError, ModuleNotFoundError):
            pass

    return None
