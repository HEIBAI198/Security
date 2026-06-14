"""Local account authentication API for the SupplyGuard frontend."""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field, field_validator


AuthMethod = Literal["phone", "email", "github"]

router = APIRouter(prefix="/api/auth", tags=["Auth"])

STORAGE_DIR = Path("storage")
USERS_FILE = STORAGE_DIR / "auth_users.json"
SESSIONS_FILE = STORAGE_DIR / "auth_sessions.json"
TOKEN_TTL = timedelta(days=30)


class AuthRequest(BaseModel):
    method: AuthMethod
    identifier: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=6, max_length=128)
    display_name: str | None = Field(default=None, max_length=80)

    @field_validator("identifier")
    @classmethod
    def normalize_identifier(cls, value: str) -> str:
        return value.strip()

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str | None) -> str | None:
        return value.strip() if value else value


class AuthUserResponse(BaseModel):
    accountNo: str
    email: str
    displayName: str
    method: AuthMethod
    identifier: str
    role: list[str]
    exp: int


class AuthResponse(BaseModel):
    accessToken: str
    user: AuthUserResponse


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_storage() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    if not USERS_FILE.exists():
        USERS_FILE.write_text("[]", encoding="utf-8")
    if not SESSIONS_FILE.exists():
        SESSIONS_FILE.write_text("[]", encoding="utf-8")


def _read_json(path: Path) -> list[dict]:
    _ensure_storage()
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _write_json(path: Path, payload: list[dict]) -> None:
    _ensure_storage()
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _normalize_identifier(method: AuthMethod, identifier: str) -> str:
    value = identifier.strip()
    if method == "phone":
        return "".join(value.split())
    return value.lower()


def _validate_identifier(method: AuthMethod, identifier: str) -> None:
    if method == "phone" and not identifier.isdigit():
        raise HTTPException(status_code=422, detail="请输入有效手机号。")
    if method == "email" and ("@" not in identifier or "." not in identifier.rsplit("@", 1)[-1]):
        raise HTTPException(status_code=422, detail="请输入有效邮箱地址。")


def _hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    password_salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(password_salt),
        120_000,
    )
    return password_salt, digest.hex()


def _verify_password(password: str, salt: str, password_hash: str) -> bool:
    _, candidate = _hash_password(password, salt)
    return hmac.compare_digest(candidate, password_hash)


def _response_user(user: dict, expires_at: datetime) -> AuthUserResponse:
    identifier = str(user["identifier"])
    method = user["method"]
    email = identifier if method == "email" else f"{identifier}@{method}.supplyguard.local"
    return AuthUserResponse(
        accountNo=str(user["id"]),
        email=email,
        displayName=str(user.get("displayName") or "Security Analyst"),
        method=method,
        identifier=identifier,
        role=["security-analyst"],
        exp=int(expires_at.timestamp()),
    )


def _create_session(user: dict) -> AuthResponse:
    sessions = _read_json(SESSIONS_FILE)
    expires_at = _now() + TOKEN_TTL
    token = f"sg_{secrets.token_urlsafe(32)}"
    sessions.append(
        {
            "token": token,
            "userId": user["id"],
            "createdAt": _now().isoformat(),
            "expiresAt": expires_at.isoformat(),
        }
    )
    _write_json(SESSIONS_FILE, sessions)
    return AuthResponse(accessToken=token, user=_response_user(user, expires_at))


@router.post("/register", response_model=AuthResponse)
async def register(payload: AuthRequest) -> AuthResponse:
    identifier = _normalize_identifier(payload.method, payload.identifier)
    _validate_identifier(payload.method, identifier)
    users = _read_json(USERS_FILE)
    if any(user["method"] == payload.method and user["identifier"] == identifier for user in users):
        raise HTTPException(status_code=409, detail="该账号已注册，请直接登录。")

    salt, password_hash = _hash_password(payload.password)
    user = {
        "id": str(uuid.uuid4()),
        "method": payload.method,
        "identifier": identifier,
        "displayName": payload.display_name or f"Security Analyst {identifier[-4:]}",
        "salt": salt,
        "passwordHash": password_hash,
        "createdAt": _now().isoformat(),
    }
    users.append(user)
    _write_json(USERS_FILE, users)
    return _create_session(user)


@router.post("/login", response_model=AuthResponse)
async def login(payload: AuthRequest) -> AuthResponse:
    identifier = _normalize_identifier(payload.method, payload.identifier)
    users = _read_json(USERS_FILE)
    user = next(
        (item for item in users if item["method"] == payload.method and item["identifier"] == identifier),
        None,
    )
    if user is None:
        raise HTTPException(status_code=404, detail="该账号尚未注册，请先注册。")
    if not _verify_password(payload.password, str(user["salt"]), str(user["passwordHash"])):
        raise HTTPException(status_code=401, detail="账号或密码不正确。")
    return _create_session(user)


@router.get("/me", response_model=AuthUserResponse)
async def me(authorization: str = Header(default="")) -> AuthUserResponse:
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="未登录。")

    sessions = _read_json(SESSIONS_FILE)
    session = next((item for item in sessions if item["token"] == token), None)
    if not session:
        raise HTTPException(status_code=401, detail="登录已失效。")

    expires_at = datetime.fromisoformat(session["expiresAt"])
    if expires_at < _now():
        raise HTTPException(status_code=401, detail="登录已过期。")

    users = _read_json(USERS_FILE)
    user = next((item for item in users if item["id"] == session["userId"]), None)
    if not user:
        raise HTTPException(status_code=401, detail="账号不存在。")
    return _response_user(user, expires_at)
