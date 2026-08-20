"""Agent 附件的受控保存、类型识别和读取辅助。"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import hashlib
from pathlib import Path
import re
from uuid import uuid4

from .config import ROOT


AGENT_ATTACHMENT_DIR = ROOT / "storage" / "agent_attachments"
MAX_AGENT_ATTACHMENTS = 12
MAX_AGENT_ATTACHMENT_BYTES = 100 * 1024 * 1024
IMAGE_SUFFIXES = {".bmp", ".gif", ".jpeg", ".jpg", ".png", ".tif", ".tiff", ".webp"}
LOG_SUFFIXES = {".log", ".jsonl", ".ndjson", ".out", ".err", ".access", ".audit"}
TEXT_SUFFIXES = {
    ".txt",
    ".md",
    ".csv",
    ".json",
    ".yaml",
    ".yml",
    ".xml",
    ".conf",
    ".cfg",
    ".ini",
    ".diff",
    ".patch",
}


@dataclass(frozen=True)
class AgentAttachment:
    """一次上传附件的可序列化描述。"""

    attachment_id: str
    filename: str
    path: str
    kind: str
    content_type: str
    size_bytes: int
    sha256: str
    uploaded_at: str

    def payload(self) -> dict[str, object]:
        return {
            "attachmentId": self.attachment_id,
            "filename": self.filename,
            "path": self.path,
            "kind": self.kind,
            "contentType": self.content_type,
            "sizeBytes": self.size_bytes,
            "sha256": self.sha256,
            "uploadedAt": self.uploaded_at,
        }


def classify_attachment(filename: str, content_type: str | None = None) -> str:
    """根据 MIME 和扩展名推断附件要交给哪个 Agent 模块。"""

    mime = (content_type or "").split(";", 1)[0].strip().lower()
    suffix = Path(filename).suffix.lower()
    lowered = filename.lower()
    if mime.startswith("image/") or suffix in IMAGE_SUFFIXES:
        return "image"
    if (
        lowered.endswith((".intoto.json", ".intoto.jsonl", ".attestation.json", ".attestation.jsonl"))
        or suffix in {".intoto", ".sig", ".pem", ".asc", ".attestation"}
        or "provenance" in lowered
    ):
        return "attestation"
    if (
        suffix in LOG_SUFFIXES
        or "log" in lowered
        or "trace" in lowered
        or "event" in lowered
    ):
        return "log"
    if suffix in TEXT_SUFFIXES or mime.startswith("text/") or mime in {"application/json", "application/yaml"}:
        return "text"
    if suffix in {".zip", ".gz", ".tgz", ".tar", ".jar", ".whl", ".exe", ".dmg"}:
        return "artifact"
    return "file"


def safe_attachment_filename(filename: str | None) -> str:
    """去掉路径片段和危险字符，保留用户可识别的原始文件名。"""

    raw = Path(filename or "attachment.bin").name
    cleaned = re.sub(r"[^A-Za-z0-9_.\-\u4e00-\u9fff]+", "_", raw).strip("._")
    return cleaned[:180] or "attachment.bin"


def save_agent_attachment(filename: str | None, content: bytes, content_type: str | None = None) -> AgentAttachment:
    """把附件保存到 Agent 专用目录，不接受客户端提供的目标路径。"""

    if len(content) > MAX_AGENT_ATTACHMENT_BYTES:
        limit = MAX_AGENT_ATTACHMENT_BYTES // (1024 * 1024)
        raise ValueError(f"附件超过 {limit} MiB 限制")
    original_name = safe_attachment_filename(filename)
    kind = classify_attachment(original_name, content_type)
    digest = hashlib.sha256(content).hexdigest()
    attachment_id = f"AAT-{datetime.now(UTC).strftime('%Y%m%d%H%M%S%f')}-{uuid4().hex[:8].upper()}"
    AGENT_ATTACHMENT_DIR.mkdir(parents=True, exist_ok=True)
    path = AGENT_ATTACHMENT_DIR / f"{attachment_id}-{original_name}"
    path.write_bytes(content)
    return AgentAttachment(
        attachment_id=attachment_id,
        filename=original_name,
        path=str(path.resolve()),
        kind=kind,
        content_type=(content_type or "application/octet-stream").split(";", 1)[0].strip().lower(),
        size_bytes=len(content),
        sha256=digest,
        uploaded_at=datetime.now(UTC).isoformat(),
    )


def resolve_agent_attachment(path_text: str) -> Path:
    """解析并校验附件路径必须位于 Agent 专用存储目录内。"""

    root = AGENT_ATTACHMENT_DIR.resolve()
    path = Path(path_text).expanduser().resolve()
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise ValueError("附件路径不在受控 Agent 附件目录内") from exc
    if not path.is_file():
        raise ValueError(f"附件不存在：{path_text}")
    return path


def attachment_kind_counts(paths: list[str]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for path in paths:
        kind = classify_attachment(Path(path).name)
        counts[kind] = counts.get(kind, 0) + 1
    return counts


def attachment_payloads(items: list[AgentAttachment]) -> list[dict[str, object]]:
    return [item.payload() for item in items]
