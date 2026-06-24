"""Persistent conversation history for the agent-style workspace."""

from __future__ import annotations

from datetime import UTC, datetime
import json
from pathlib import Path
import re
import uuid
from typing import Any

from .config import ROOT
from .project_imports import ImportErrorDetail, load_import
from .workspaces import load_workspace


CONVERSATION_STORAGE_DIR = ROOT / "storage" / "conversations"


class ConversationError(ValueError):
    """Raised when a conversation request is invalid."""


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def new_conversation_id() -> str:
    stamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    return f"conv_{stamp}_{uuid.uuid4().hex[:8]}"


def validate_conversation_id(conversation_id: str) -> str:
    value = conversation_id.strip()
    if not re.fullmatch(r"conv_[A-Za-z0-9_\-]+", value):
        raise ConversationError("conversationId format is invalid.")
    return value


def conversation_path(conversation_id: str) -> Path:
    return CONVERSATION_STORAGE_DIR / f"{validate_conversation_id(conversation_id)}.json"


def list_conversations() -> list[dict[str, Any]]:
    CONVERSATION_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, Any]] = []
    for path in CONVERSATION_STORAGE_DIR.glob("conv_*.json"):
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
            records.append(refresh_conversation_record(record))
        except (OSError, json.JSONDecodeError):
            continue
    return sorted(records, key=lambda item: str(item.get("updatedAt") or ""), reverse=True)


def refresh_conversation_record(record: dict[str, Any]) -> dict[str, Any]:
    workspace_id = str(record.get("workspaceId") or "")
    if not workspace_id:
        return record
    try:
        workspace = load_workspace(workspace_id)
    except (FileNotFoundError, ValueError):
        return record
    import_record: dict[str, Any] | None = None
    import_id = record.get("importId") or workspace.get("workspace", {}).get("importId")
    if import_id:
        try:
            import_record = load_import(str(import_id))
        except ImportErrorDetail:
            import_record = None
    refreshed = conversation_from_workspace(
        workspace,
        import_record=import_record,
        conversation_id=str(record.get("conversationId") or new_conversation_id()),
        title=str(record.get("title") or ""),
    )
    refreshed["createdAt"] = record.get("createdAt") or refreshed["createdAt"]
    refreshed["updatedAt"] = record.get("updatedAt") or refreshed["updatedAt"]
    return refreshed


def load_conversation(conversation_id: str) -> dict[str, Any]:
    path = conversation_path(conversation_id)
    if not path.exists():
        raise ConversationError("Conversation does not exist.")
    return json.loads(path.read_text(encoding="utf-8"))


def create_conversation(
    *,
    workspace_id: str,
    import_id: str | None = None,
    title: str | None = None,
) -> dict[str, Any]:
    workspace = load_workspace(workspace_id)
    import_record: dict[str, Any] | None = None
    if import_id:
        try:
            import_record = load_import(import_id)
        except ImportErrorDetail:
            import_record = None
    record = conversation_from_workspace(
        workspace,
        import_record=import_record,
        conversation_id=new_conversation_id(),
        title=title,
    )
    save_conversation(record)
    return record


def update_conversation(conversation_id: str, *, title: str | None = None) -> dict[str, Any]:
    record = load_conversation(conversation_id)
    if title is not None:
        value = title.strip()
        if not value:
            raise ConversationError("Conversation title cannot be empty.")
        record["title"] = value[:120]
    record["updatedAt"] = now_iso()
    save_conversation(record)
    return record


def delete_conversation(conversation_id: str) -> None:
    path = conversation_path(conversation_id)
    if not path.exists():
        raise ConversationError("Conversation does not exist.")
    path.unlink()


def conversation_from_workspace(
    workspace: dict[str, Any],
    *,
    import_record: dict[str, Any] | None = None,
    conversation_id: str,
    title: str | None = None,
) -> dict[str, Any]:
    workspace_meta = workspace.get("workspace") if isinstance(workspace.get("workspace"), dict) else {}
    summary = workspace.get("summary") if isinstance(workspace.get("summary"), dict) else {}
    import_payload = import_record or workspace.get("import") if isinstance(workspace.get("import"), dict) else None
    import_summary = (
        import_payload.get("summary")
        if isinstance(import_payload, dict) and isinstance(import_payload.get("summary"), dict)
        else {}
    )
    file_stats = import_summary.get("fileStats") if isinstance(import_summary.get("fileStats"), dict) else {}
    dependency_files = import_summary.get("dependencyFiles") if isinstance(import_summary.get("dependencyFiles"), list) else []
    ci_files = import_summary.get("ciFiles") if isinstance(import_summary.get("ciFiles"), list) else []
    languages = import_summary.get("languages") if isinstance(import_summary.get("languages"), list) else []
    scan_suite = workspace.get("scanSuite") if isinstance(workspace.get("scanSuite"), dict) else {}
    scan_status = str(scan_suite.get("status") or summary.get("risk_level") or "preflight")
    scan_complete = scan_status in {"completed", "partial", "failed"}
    source_ref = import_payload.get("sourceRef") if isinstance(import_payload, dict) and isinstance(import_payload.get("sourceRef"), dict) else {}
    source_path = (
        workspace_meta.get("repository")
        or source_ref.get("url")
        or source_ref.get("path")
        or (import_payload or {}).get("sourcePath")
        or ""
    )
    created_at = now_iso()
    return {
        "conversationId": conversation_id,
        "title": (title or workspace_meta.get("name") or (import_payload or {}).get("projectName") or "新建溯源对话")[:120],
        "workspaceId": workspace.get("workspaceId") or workspace.get("workspace_id") or workspace_meta.get("workspaceId"),
        "importId": workspace_meta.get("importId") or (import_payload or {}).get("importId"),
        "projectName": workspace_meta.get("name") or (import_payload or {}).get("projectName"),
        "sourceType": workspace_meta.get("sourceType") or (import_payload or {}).get("sourceType"),
        "sourcePath": source_path,
        "createdAt": created_at,
        "updatedAt": created_at,
        "summary": {
            "scanStatus": scan_status,
            "riskScore": summary.get("risk_score", 0) if scan_complete else None,
            "riskLevel": summary.get("risk_level", "unknown") if scan_complete else "preflight",
            "attackPaths": summary.get("attack_paths", 0) if scan_complete else None,
            "dependencies": summary.get("dependencies", 0),
            "findings": summary.get("open_findings", 0),
            "preflightFiles": file_stats.get("total", 0),
            "preflightScannable": file_stats.get("scannable", 0),
            "dependencyFiles": len(dependency_files),
            "ciFiles": len(ci_files),
            "primaryLanguage": str((languages[0] or {}).get("name") or "") if languages and isinstance(languages[0], dict) else "",
        },
    }


def save_conversation(record: dict[str, Any]) -> None:
    conversation_id = validate_conversation_id(str(record.get("conversationId") or ""))
    CONVERSATION_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = conversation_path(conversation_id).with_suffix(".json.tmp")
    tmp.write_text(json.dumps(record, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    tmp.replace(conversation_path(conversation_id))
