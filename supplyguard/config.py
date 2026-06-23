"""Runtime configuration for SupplyGuard KG."""

from __future__ import annotations

import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_local_env() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_local_env()


def normalize_deepseek_model(value: str) -> str:
    model = value.strip() or "deepseek-v4-flash"
    deprecated_aliases = {
        "deepseek-chat": "deepseek-v4-flash",
        "deepseek-reasoner": "deepseek-v4-pro",
    }
    return deprecated_aliases.get(model, model)


FRONTEND_DIST_DIR = Path(os.environ.get("SUPPLYGUARD_FRONTEND_DIST", ROOT / "frontend" / "dist"))
IMPORT_WORKSPACE_DIR = Path(
    os.environ.get("SUPPLYGUARD_IMPORT_WORKSPACE", ROOT / "storage" / "imports")
)
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "").strip()
DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
DEEPSEEK_MODEL = normalize_deepseek_model(os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash"))
DEEPSEEK_TIMEOUT_SECONDS = float(os.environ.get("DEEPSEEK_TIMEOUT_SECONDS", "30"))


def resolve_frontend_dir() -> tuple[Path | None, str]:
    if (FRONTEND_DIST_DIR / "index.html").exists():
        return FRONTEND_DIST_DIR, "dist"
    return None, "missing"
