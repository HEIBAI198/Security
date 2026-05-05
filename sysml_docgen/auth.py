"""Small token-based authentication helper for the local prototype."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any


SECRET = "sysml-docgen-course-design-secret"

def _hash(password: str) -> str:
    return hashlib.sha256(f"sysml-docgen:{password}".encode("utf-8")).hexdigest()


DEMO_USERS = {
    "teacher": {"password_hash": _hash("teacher123"), "role": "admin", "display": "Teacher"},
    "engineer": {"password_hash": _hash("engineer123"), "role": "author", "display": "Engineer"},
    "reviewer": {"password_hash": _hash("reviewer123"), "role": "reader", "display": "Reviewer"},
}


def login(username: str, password: str) -> dict[str, Any] | None:
    user = DEMO_USERS.get(username)
    if not user or not hmac.compare_digest(user["password_hash"], _hash(password)):
        return None
    identity = {
        "username": username,
        "role": user["role"],
        "display": user["display"],
        "exp": int(time.time()) + 8 * 60 * 60,
    }
    identity["token"] = issue_token(identity)
    return identity


def issue_token(identity: dict[str, Any]) -> str:
    payload = {
        "username": identity["username"],
        "role": identity["role"],
        "display": identity.get("display", identity["username"]),
        "exp": identity["exp"],
    }
    raw_payload = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8")).decode("ascii")
    signature = hmac.new(SECRET.encode("utf-8"), raw_payload.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{raw_payload}.{signature}"


def verify_token(token: str) -> dict[str, Any] | None:
    if "." not in token:
        return None
    raw_payload, signature = token.rsplit(".", 1)
    expected = hmac.new(SECRET.encode("utf-8"), raw_payload.encode("ascii"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        return None
    try:
        payload = json.loads(base64.urlsafe_b64decode(raw_payload.encode("ascii")).decode("utf-8"))
    except (ValueError, json.JSONDecodeError):
        return None
    if payload.get("exp", 0) < time.time():
        return None
    return payload


def identity_from_headers(headers: Any) -> dict[str, str]:
    authorization = headers.get("Authorization", "")
    if authorization.startswith("Bearer "):
        identity = verify_token(authorization.removeprefix("Bearer ").strip())
        if identity:
            return {
                "username": str(identity["username"]),
                "role": str(identity["role"]),
                "display": str(identity.get("display", identity["username"])),
            }
    username = headers.get("X-User", "engineer")
    role = headers.get("X-Role", "author")
    return {"username": username, "role": role, "display": username}
