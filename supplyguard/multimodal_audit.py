"""Multimodal evidence intake for image files (OCR-based recognition)."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
import hashlib
import importlib
import json
import mimetypes
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import tempfile
import time
from typing import Any

import yaml

from .config import ROOT


MULTIMODAL_STORAGE_DIR = ROOT / "storage" / "multimodal"
MULTIMODAL_INDEX_PATH = MULTIMODAL_STORAGE_DIR / "evidence-index.json"
MULTIMODAL_RULES_DIR = ROOT / "supplyguard" / "rules" / "multimodal"
MAX_MULTIMODAL_FILES = 20
MAX_MULTIMODAL_FILE_BYTES = 100 * 1024 * 1024
MAX_INDEX_EVIDENCE = 500
TOOL_TIMEOUT_SECONDS = 30
OCR_LANG = os.environ.get("SUPPLYGUARD_OCR_LANG", "ch")
TESSERACT_LANG = os.environ.get("SUPPLYGUARD_TESSERACT_LANG", "chi_sim+eng")

IMAGE_EXTENSIONS = {".bmp", ".gif", ".jpeg", ".jpg", ".png", ".tif", ".tiff", ".webp"}
PADDLEOCR_IMAGE_EXTENSIONS = {".bmp", ".dib", ".jpeg", ".jpg", ".png", ".webp", ".pbm", ".pgm", ".ppm", ".pnm", ".sr", ".ras", ".tiff", ".tif", ".pdf"}
VALID_SOURCE_TYPES = {"image"}


@dataclass(frozen=True)
class MultimodalFileInput:
    filename: str
    content: bytes
    content_type: str | None = None


@dataclass(frozen=True)
class MultimodalTextInput:
    recognized_text: str
    source_type: str = "image"
    evidence_type: str = "visual_ocr"
    source_name: str = "manual-recognized-text.txt"
    confidence: float = 0.9
    engine: str = "manual-ocr-text"
    language: str | None = "zh-CN"


@dataclass(frozen=True)
class MultimodalToolStatus:
    name: str
    available: bool
    command: str
    state: str
    version: str | None = None
    error: str | None = None


@dataclass(frozen=True)
class MultimodalDerivedArtifact:
    kind: str
    path: str
    relative_path: str
    mime_type: str
    size_bytes: int
    created_at: str
    tool: str


@dataclass(frozen=True)
class MultimodalRecognition:
    source_type: str
    recognized_text: str
    confidence: float
    evidence_type: str
    engine: str
    source_path: str
    language: str | None = None
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    segments: list[dict[str, Any]] = field(default_factory=list)


@dataclass(frozen=True)
class MultimodalEntity:
    type: str
    value: str
    normalized: str
    start: int
    end: int
    confidence: float
    source: str
    evidence: str


@dataclass(frozen=True)
class MultimodalFinding:
    id: str
    rule_id: str
    title: str
    severity: str
    score: int
    evidence_id: str
    source_type: str
    source_name: str
    evidence_type: str
    matched_keywords: list[str]
    entities: list[dict[str, Any]]
    evidence: str
    confidence: float
    recommendation: str
    references: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    first_seen: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    fingerprint: str = ""


@dataclass(frozen=True)
class MultimodalEvidence:
    evidence_id: str
    filename: str
    original_filename: str
    file_path: str
    relative_path: str
    source_type: str
    mime_type: str
    size_bytes: int
    sha256: str
    uploaded_at: str
    metadata: dict[str, Any] = field(default_factory=dict)
    derived: list[MultimodalDerivedArtifact] = field(default_factory=list)
    recognitions: list[MultimodalRecognition] = field(default_factory=list)
    entities: list[MultimodalEntity] = field(default_factory=list)
    findings: list[MultimodalFinding] = field(default_factory=list)
    risk_score: int = 0
    risk_level: str = "low"


@dataclass(frozen=True)
class MultimodalAuditResult:
    scan_id: str
    generated_at: str
    evidence: list[MultimodalEvidence]
    tools: list[MultimodalToolStatus]
    summary: dict[str, Any]
    report: str
    warnings: list[str] = field(default_factory=list)


def run_multimodal_audit(files: list[MultimodalFileInput]) -> MultimodalAuditResult:
    started_at = time.monotonic()
    scan_id = datetime.now(UTC).strftime("multimodal-%Y%m%d%H%M%S")
    generated_at = datetime.now(UTC).isoformat()
    warnings: list[str] = []

    if not files:
        raise ValueError("Upload at least one image file.")
    if len(files) > MAX_MULTIMODAL_FILES:
        raise ValueError(f"Upload at most {MAX_MULTIMODAL_FILES} files per scan.")

    prepared: list[tuple[MultimodalFileInput, str, str]] = []
    for item in files:
        if len(item.content) > MAX_MULTIMODAL_FILE_BYTES:
            limit = MAX_MULTIMODAL_FILE_BYTES // (1024 * 1024)
            raise ValueError(f"{item.filename} exceeds the {limit} MiB limit.")
        source_type = infer_source_type(item.filename, item.content_type, item.content)
        if source_type not in VALID_SOURCE_TYPES:
            raise ValueError(f"Unsupported multimodal evidence type: {item.filename}")
        mime_type = normalize_mime_type(item.filename, item.content_type, source_type)
        prepared.append((item, source_type, mime_type))

    tools = detect_tools()
    tool_map = {tool_key(tool.name): tool for tool in tools}
    evidence: list[MultimodalEvidence] = []
    for item, source_type, mime_type in prepared:
        evidence.append(save_multimodal_evidence(item, source_type, mime_type, tool_map, warnings))

    append_evidence_index(evidence)
    summary = build_summary(evidence, duration_seconds=round(time.monotonic() - started_at, 2))
    report = build_multimodal_report(scan_id, generated_at, evidence, tools, summary, warnings)
    return MultimodalAuditResult(
        scan_id=scan_id,
        generated_at=generated_at,
        evidence=evidence,
        tools=tools,
        summary=summary,
        report=report,
        warnings=warnings,
    )


def run_multimodal_text_audit(records: list[MultimodalTextInput]) -> MultimodalAuditResult:
    started_at = time.monotonic()
    scan_id = datetime.now(UTC).strftime("multimodal-text-%Y%m%d%H%M%S")
    generated_at = datetime.now(UTC).isoformat()
    warnings: list[str] = []
    if not records:
        raise ValueError("Provide at least one OCR recognized text record.")

    evidence: list[MultimodalEvidence] = []
    for record in records[:MAX_MULTIMODAL_FILES]:
        evidence.append(save_text_evidence(record, warnings))

    tools = detect_tools()
    append_evidence_index(evidence)
    summary = build_summary(evidence, duration_seconds=round(time.monotonic() - started_at, 2))
    report = build_multimodal_report(scan_id, generated_at, evidence, tools, summary, warnings)
    return MultimodalAuditResult(
        scan_id=scan_id,
        generated_at=generated_at,
        evidence=evidence,
        tools=tools,
        summary=summary,
        report=report,
        warnings=warnings,
    )


def save_multimodal_evidence(
    item: MultimodalFileInput,
    source_type: str,
    mime_type: str,
    tools: dict[str, MultimodalToolStatus],
    warnings: list[str],
) -> MultimodalEvidence:
    MULTIMODAL_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    uploaded_at = datetime.now(UTC).isoformat()
    digest = sha256_bytes(item.content)
    evidence_id = f"MME-{datetime.now(UTC).strftime('%Y%m%d%H%M%S%f')}-{digest[:8].upper()}"
    safe_name = safe_filename(item.filename or f"{source_type}.bin")
    path = MULTIMODAL_STORAGE_DIR / f"{evidence_id}-{source_type}-{safe_name}"
    path.write_bytes(item.content)

    derived = create_derived_artifacts(path, evidence_id, source_type, tools, warnings)
    metadata = build_metadata(path, item, source_type, mime_type, tools, warnings)
    recognitions = recognize_text_evidence(path, source_type, derived, tools, warnings)
    entities, findings, risk_score, risk_level = analyze_recognitions(
        evidence_id=evidence_id,
        source_type=source_type,
        source_name=item.filename or safe_name,
        recognitions=recognitions,
    )
    return MultimodalEvidence(
        evidence_id=evidence_id,
        filename=path.name,
        original_filename=item.filename or safe_name,
        file_path=str(path),
        relative_path=relative_path(path),
        source_type=source_type,
        mime_type=mime_type,
        size_bytes=len(item.content),
        sha256=digest,
        uploaded_at=uploaded_at,
        metadata=metadata,
        derived=derived,
        recognitions=recognitions,
        entities=entities,
        findings=findings,
        risk_score=risk_score,
        risk_level=risk_level,
    )


def save_text_evidence(record: MultimodalTextInput, warnings: list[str]) -> MultimodalEvidence:
    source_type = record.source_type if record.source_type in VALID_SOURCE_TYPES else "image"
    text = normalize_recognized_text(record.recognized_text)
    if not text:
        raise ValueError("Recognized text is empty.")
    MULTIMODAL_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    content = text.encode("utf-8")
    digest = sha256_bytes(content)
    evidence_id = f"MME-{datetime.now(UTC).strftime('%Y%m%d%H%M%S%f')}-{digest[:8].upper()}"
    safe_name = safe_filename(record.source_name or "manual-recognized-text.txt")
    if Path(safe_name).suffix == "":
        safe_name = f"{safe_name}.txt"
    path = MULTIMODAL_STORAGE_DIR / f"{evidence_id}-{source_type}-{safe_name}"
    path.write_bytes(content)
    recognition = MultimodalRecognition(
        source_type=source_type,
        recognized_text=text,
        confidence=normalize_confidence(record.confidence),
        evidence_type=record.evidence_type or "visual_ocr",
        engine=record.engine or "manual-ocr-text",
        source_path=relative_path(path),
        language=record.language,
        segments=[{"text": text, "confidence": normalize_confidence(record.confidence)}],
    )
    entities, findings, risk_score, risk_level = analyze_recognitions(
        evidence_id=evidence_id,
        source_type=source_type,
        source_name=record.source_name or safe_name,
        recognitions=[recognition],
    )
    if not findings and not entities:
        warnings.append("Recognized text was stored, but no security entities or rule matches were detected.")
    return MultimodalEvidence(
        evidence_id=evidence_id,
        filename=path.name,
        original_filename=record.source_name or safe_name,
        file_path=str(path),
        relative_path=relative_path(path),
        source_type=source_type,
        mime_type="text/plain",
        size_bytes=len(content),
        sha256=digest,
        uploaded_at=datetime.now(UTC).isoformat(),
        metadata={"recognized_text_only": True},
        recognitions=[recognition],
        entities=entities,
        findings=findings,
        risk_score=risk_score,
        risk_level=risk_level,
    )


def infer_source_type(filename: str, content_type: str | None, content: bytes) -> str:
    mime = (content_type or "").split(";", 1)[0].strip().lower()
    if mime.startswith("image/"):
        return "image"

    extension = Path(filename or "").suffix.lower()
    if extension in IMAGE_EXTENSIONS:
        return "image"

    header = content[:64]
    if header.startswith((b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n", b"GIF87a", b"GIF89a")):
        return "image"
    if header.startswith(b"RIFF") and header[8:12] == b"WEBP":
        return "image"
    return "unknown"


def normalize_mime_type(filename: str, content_type: str | None, source_type: str) -> str:
    declared = (content_type or "").split(";", 1)[0].strip()
    if declared and declared != "application/octet-stream":
        return declared
    guessed, _ = mimetypes.guess_type(filename)
    if guessed:
        return guessed
    if source_type == "image":
        return "image/octet-stream"
    return "application/octet-stream"


def build_metadata(
    path: Path,
    item: MultimodalFileInput,
    source_type: str,
    mime_type: str,
    tools: dict[str, MultimodalToolStatus],
    warnings: list[str],
) -> dict[str, Any]:
    metadata: dict[str, Any] = {
        "extension": path.suffix.lower(),
        "content_type": item.content_type or mime_type,
    }
    dimensions = image_dimensions(path)
    if dimensions:
        metadata.update(dimensions)

    opencv = tools.get("opencv")
    if opencv and opencv.available:
        opencv_meta = opencv_metadata(path, "image", warnings)
        if opencv_meta:
            metadata["opencv"] = opencv_meta
            metadata.update({key: value for key, value in opencv_meta.items() if key not in metadata})
    return metadata


def create_derived_artifacts(
    path: Path,
    evidence_id: str,
    source_type: str,
    tools: dict[str, MultimodalToolStatus],
    warnings: list[str],
) -> list[MultimodalDerivedArtifact]:
    # Derived artifacts are only needed for audio/video preprocessing.
    # Image OCR works directly on the uploaded file — no derived artifacts required.
    _ = (path, evidence_id, source_type, tools, warnings)
    return []


def detect_tools() -> list[MultimodalToolStatus]:
    return [
        opencv_tool_status(),
        python_import_tool_status("PaddleOCR", "paddleocr", "from paddleocr import PaddleOCR"),
        command_tool_status("Tesseract OCR", "tesseract", ["--version"]),
    ]


def tool_key(name: str) -> str:
    return name.strip().lower().replace(" ", "-")


def command_tool_status(name: str, command: str, version_args: list[str]) -> MultimodalToolStatus:
    path = shutil.which(command) or shutil.which(f"{command}.exe")
    if not path:
        return MultimodalToolStatus(
            name=name,
            available=False,
            command=command,
            state="missing",
            error=f"{command} was not found on PATH.",
        )
    result = run_command([path, *version_args], 8)
    version = first_line(result.stdout or result.stderr)
    return MultimodalToolStatus(
        name=name,
        available=True,
        command=path,
        state="ok" if result.returncode == 0 else "partial",
        version=version or None,
        error=None if result.returncode == 0 else short_text(result.stderr or result.stdout, 160),
    )


def opencv_tool_status() -> MultimodalToolStatus:
    try:
        import cv2  # type: ignore[import-not-found]
    except Exception as exc:  # pragma: no cover - depends on optional local package.
        return MultimodalToolStatus(
            name="OpenCV",
            available=False,
            command="python -c \"import cv2\"",
            state="missing",
            error=short_text(exc, 160),
        )
    return MultimodalToolStatus(
        name="OpenCV",
        available=True,
        command="python -c \"import cv2\"",
        state="ok",
        version=f"opencv-python {getattr(cv2, '__version__', 'unknown')}",
    )


def python_import_tool_status(name: str, module_name: str, command: str) -> MultimodalToolStatus:
    try:
        module = importlib.import_module(module_name)
    except Exception as exc:  # pragma: no cover - depends on optional local packages.
        return MultimodalToolStatus(
            name=name,
            available=False,
            command=f'python -c "{command}"',
            state="missing",
            error=short_text(exc, 160),
        )
    version = getattr(module, "__version__", None)
    return MultimodalToolStatus(
        name=name,
        available=True,
        command=f'python -c "{command}"',
        state="ok",
        version=f"{module_name} {version}" if version else module_name,
    )


def recognize_text_evidence(
    path: Path,
    source_type: str,
    derived: list[MultimodalDerivedArtifact],
    tools: dict[str, MultimodalToolStatus],
    warnings: list[str],
) -> list[MultimodalRecognition]:
    _ = derived
    if source_type == "image":
        recognition = recognize_image(path, source_type, tools, warnings)
        return [recognition] if recognition is not None else []
    return []


def analyze_recognitions(
    *,
    evidence_id: str,
    source_type: str,
    source_name: str,
    recognitions: list[MultimodalRecognition],
) -> tuple[list[MultimodalEntity], list[MultimodalFinding], int, str]:
    text = "\n".join(recognition.recognized_text for recognition in recognitions if recognition.recognized_text)
    entities = extract_security_entities(text)
    findings = evaluate_multimodal_rules(
        evidence_id=evidence_id,
        source_type=source_type,
        source_name=source_name,
        recognitions=recognitions,
        entities=entities,
    )
    risk_score = max([finding.score for finding in findings] + [0])
    if risk_score == 0 and entities:
        risk_score = min(54, 20 + len(entities) * 4)
    return entities, findings, risk_score, severity_from_score(risk_score)


def extract_security_entities(text: str) -> list[MultimodalEntity]:
    normalized_text = str(text or "")
    entities: list[MultimodalEntity] = []
    add_regex_entities(
        entities,
        normalized_text,
        "ip",
        r"(?<![\d.])(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?![\d.])",
        confidence=0.96,
    )
    add_regex_entities(
        entities,
        normalized_text,
        "cve",
        r"\bCVE-\d{4}-\d{4,7}\b",
        flags=re.IGNORECASE,
        confidence=0.97,
    )
    add_regex_entities(
        entities,
        normalized_text,
        "domain",
        r"\b(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+(?:com|net|org|io|cn|dev|app|cloud|internal|local)\b",
        flags=re.IGNORECASE,
        confidence=0.86,
    )
    add_regex_entities(
        entities,
        normalized_text,
        "package",
        r"(?<![\w./-])@[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*(?:@[A-Za-z0-9._~+:-]+)?",
        confidence=0.95,
    )
    add_command_package_entities(entities, normalized_text)
    add_regex_entities(
        entities,
        normalized_text,
        "api_path",
        r"(?<![:\w])(?:/[A-Za-z0-9_./{}:-]*(?:admin|api|export|login|token|secret|orders?|users?|checkout)[A-Za-z0-9_./{}:-]*|admin/export)(?:\?[^ \n\t'\"<>]*)?",
        flags=re.IGNORECASE,
        confidence=0.88,
    )
    add_regex_entities(
        entities,
        normalized_text,
        "service",
        r"\b[A-Za-z][A-Za-z0-9-]*(?:-api|-service|\.prod|\.staging|\.internal)\b",
        flags=re.IGNORECASE,
        confidence=0.82,
    )
    add_regex_entities(
        entities,
        normalized_text,
        "time",
        r"(?:\b\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?\b|\b\d{1,2}:\d{2}(?::\d{2})?\b|凌晨\s*[一二三四五六七八九十0-9]{1,3}\s*点(?:[半一二三四五六七八九十0-9]{0,3}分?)?)",
        confidence=0.78,
    )
    add_keyword_entities(
        entities,
        normalized_text,
        "action",
        [
            "postinstall",
            "preinstall",
            "curl",
            "wget",
            "bash",
            "powershell",
            "Invoke-WebRequest",
            "异常外联",
            "外联",
            "回连",
            "敏感接口访问",
            "敏感导出",
            "暴力破解",
            "SQL 注入",
            "sql injection",
            "sleep(5)",
            "admin/export",
        ],
        confidence=0.82,
    )
    add_keyword_entities(
        entities,
        normalized_text,
        "secret_keyword",
        ["token", "secret", "password", "passwd", "AKIA", "密钥", "令牌", "凭据"],
        confidence=0.8,
    )
    return dedupe_entities(entities)


def add_regex_entities(
    entities: list[MultimodalEntity],
    text: str,
    entity_type: str,
    pattern: str,
    *,
    flags: int = 0,
    confidence: float,
) -> None:
    for match in re.finditer(pattern, text, flags):
        value = match.group(0).strip()
        if not value:
            continue
        entities.append(
            MultimodalEntity(
                type=entity_type,
                value=value,
                normalized=normalize_entity_value(entity_type, value),
                start=match.start(),
                end=match.end(),
                confidence=confidence,
                source="regex",
                evidence=entity_snippet(text, match.start(), match.end()),
            )
        )


def add_command_package_entities(entities: list[MultimodalEntity], text: str) -> None:
    patterns = [
        r"\b(?:npm|pnpm|yarn)\s+(?:install|add|i)\s+([@A-Za-z0-9][@A-Za-z0-9._/-]*(?:@[A-Za-z0-9._~+:-]+)?)",
        r"\bpip(?:3)?\s+install\s+([A-Za-z0-9_.-]+(?:(?:==|>=|<=|~=)[A-Za-z0-9_.-]+)?)",
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            value = match.group(1).strip()
            if not value or value.lower() in {"install", "add"}:
                continue
            entities.append(
                MultimodalEntity(
                    type="package",
                    value=value,
                    normalized=normalize_entity_value("package", value),
                    start=match.start(1),
                    end=match.end(1),
                    confidence=0.9,
                    source="install-command-regex",
                    evidence=entity_snippet(text, match.start(), match.end()),
                )
            )


def add_keyword_entities(
    entities: list[MultimodalEntity],
    text: str,
    entity_type: str,
    keywords: list[str],
    *,
    confidence: float,
) -> None:
    lower_text = text.lower()
    for keyword in keywords:
        needle = keyword.lower()
        start = 0
        while True:
            index = lower_text.find(needle, start)
            if index < 0:
                break
            end = index + len(keyword)
            entities.append(
                MultimodalEntity(
                    type=entity_type,
                    value=text[index:end],
                    normalized=normalize_entity_value(entity_type, keyword),
                    start=index,
                    end=end,
                    confidence=confidence,
                    source="keyword",
                    evidence=entity_snippet(text, index, end),
                )
            )
            start = end


def evaluate_multimodal_rules(
    *,
    evidence_id: str,
    source_type: str,
    source_name: str,
    recognitions: list[MultimodalRecognition],
    entities: list[MultimodalEntity],
) -> list[MultimodalFinding]:
    text = "\n".join(recognition.recognized_text for recognition in recognitions if recognition.recognized_text)
    if not text:
        return []
    rules = load_multimodal_rules()
    findings: list[MultimodalFinding] = []
    for rule in rules:
        match = rule_match(rule, text, source_type, entities)
        if match is None:
            continue
        severity = str(rule.get("severity") or rule.get("level") or "medium").lower()
        score = int(rule.get("score") or score_from_severity(severity))
        confidence = rule_confidence(recognitions, entities, match["matched_keywords"], match["matched_entities"])
        fingerprint = stable_id("multimodal-finding", rule.get("id"), evidence_id, match["matched_keywords"], match["entity_values"])
        findings.append(
            MultimodalFinding(
                id=f"MMF-{fingerprint.split(':')[-1].upper()}",
                rule_id=str(rule.get("id") or fingerprint),
                title=str(rule.get("title") or rule.get("id") or "多模态规则命中"),
                severity=severity if severity in {"critical", "high", "medium", "low"} else "medium",
                score=score,
                evidence_id=evidence_id,
                source_type=source_type,
                source_name=source_name,
                evidence_type=recognitions[0].evidence_type if recognitions else "recognized_text",
                matched_keywords=match["matched_keywords"],
                entities=[asdict(entity) for entity in match["matched_entities"]],
                evidence=short_text(text, 360),
                confidence=confidence,
                recommendation=str(rule.get("recommendation") or "复核该多模态证据，并与日志、CI/CD 和 SBOM 证据交叉验证。"),
                references=ensure_string_list(rule.get("references")),
                tags=ensure_string_list(rule.get("tags")),
                fingerprint=fingerprint,
            )
        )
    return sorted(findings, key=lambda item: (-item.score, item.title))


def load_multimodal_rules() -> list[dict[str, Any]]:
    rules: list[dict[str, Any]] = []
    if MULTIMODAL_RULES_DIR.exists():
        for path in sorted(MULTIMODAL_RULES_DIR.glob("*.yml")) + sorted(MULTIMODAL_RULES_DIR.glob("*.yaml")):
            try:
                payload = yaml.safe_load(path.read_text(encoding="utf-8"))
            except (OSError, yaml.YAMLError):
                continue
            if isinstance(payload, dict):
                payload.setdefault("_path", relative_path(path))
                rules.append(payload)
    return rules or fallback_multimodal_rules()


def fallback_multimodal_rules() -> list[dict[str, Any]]:
    return [
        {
            "id": "multimodal-postinstall-egress",
            "title": "截图中出现安装脚本外联",
            "severity": "critical",
            "score": 96,
            "match": {"keywords": ["postinstall", "curl"], "entity_types": ["ip"]},
            "recommendation": "隔离相关依赖包，回滚构建产物，并用可信 runner 重新构建。",
            "references": ["https://sigmahq.io/sigma-specification/"],
            "tags": ["attack.supply_chain", "multimodal.ocr", "wazuh.severity.critical"],
        }
    ]


def rule_match(
    rule: dict[str, Any],
    text: str,
    source_type: str,
    entities: list[MultimodalEntity],
) -> dict[str, Any] | None:
    match = normalized_rule_match(rule)
    source_types = ensure_string_list(match.get("source_types"))
    if source_types and source_type not in source_types:
        return None

    lower_text = text.lower()
    required_keywords = ensure_string_list(match.get("keywords"))
    any_keywords = ensure_string_list(match.get("any_keywords"))
    excluded_keywords = ensure_string_list(match.get("exclude_keywords"))
    matched_required = [keyword for keyword in required_keywords if keyword.lower() in lower_text]
    if len(matched_required) < len(required_keywords):
        return None
    matched_any = [keyword for keyword in any_keywords if keyword.lower() in lower_text]
    if any_keywords and not matched_any:
        return None
    if any(keyword.lower() in lower_text for keyword in excluded_keywords):
        return None

    entity_types = ensure_string_list(match.get("entity_types") or match.get("entities"))
    matched_entities = entities_for_rule(entities, entity_types)
    if entity_types and not all(any(entity.type == entity_type for entity in matched_entities) for entity_type in entity_types):
        return None
    min_entity_count = safe_int(match.get("min_entity_count")) or 0
    if min_entity_count and len(matched_entities) < min_entity_count:
        return None
    min_keyword_count = safe_int(match.get("min_keyword_count")) or 0
    all_matched_keywords = stable_unique_strings(matched_required + matched_any)
    if min_keyword_count and len(all_matched_keywords) < min_keyword_count:
        return None
    return {
        "matched_keywords": all_matched_keywords,
        "matched_entities": matched_entities,
        "entity_values": [entity.normalized for entity in matched_entities],
    }


def normalized_rule_match(rule: dict[str, Any]) -> dict[str, Any]:
    match = rule.get("match") if isinstance(rule.get("match"), dict) else {}
    if match:
        return match
    detection = rule.get("detection") if isinstance(rule.get("detection"), dict) else {}
    selection = detection.get("selection") if isinstance(detection.get("selection"), dict) else {}
    if selection:
        return selection
    return {}


def entities_for_rule(entities: list[MultimodalEntity], entity_types: list[str]) -> list[MultimodalEntity]:
    if not entity_types:
        return entities
    selected = [entity for entity in entities if entity.type in set(entity_types)]
    return selected or []


def rule_confidence(
    recognitions: list[MultimodalRecognition],
    entities: list[MultimodalEntity],
    keywords: list[str],
    matched_entities: list[MultimodalEntity],
) -> float:
    recognition_confidence = average([recognition.confidence for recognition in recognitions]) or 0.75
    entity_confidence = average([entity.confidence for entity in matched_entities]) or average([entity.confidence for entity in entities]) or 0.7
    keyword_bonus = min(0.12, len(keywords) * 0.035)
    entity_bonus = min(0.12, len(matched_entities) * 0.025)
    return round(min(0.98, recognition_confidence * 0.5 + entity_confidence * 0.34 + keyword_bonus + entity_bonus), 3)


def normalize_entity_value(entity_type: str, value: str) -> str:
    cleaned = str(value or "").strip()
    if entity_type in {"domain", "service", "cve", "package", "action", "secret_keyword"}:
        return cleaned.lower()
    if entity_type == "api_path":
        return cleaned.split("?", 1)[0]
    return cleaned


def entity_snippet(text: str, start: int, end: int, radius: int = 48) -> str:
    left = max(0, start - radius)
    right = min(len(text), end + radius)
    return text[left:right].replace("\n", " ").strip()


def dedupe_entities(entities: list[MultimodalEntity]) -> list[MultimodalEntity]:
    by_key: dict[tuple[str, str], MultimodalEntity] = {}
    for entity in entities:
        key = (entity.type, entity.normalized)
        existing = by_key.get(key)
        if existing is None or entity.confidence > existing.confidence:
            by_key[key] = entity
    return sorted(by_key.values(), key=lambda item: (item.start, item.type, item.normalized))


def stable_id(*parts: Any) -> str:
    raw = "|".join(json.dumps(part, ensure_ascii=False, sort_keys=True, default=str) for part in parts)
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]
    prefix = str(parts[0] or "id").lower().replace("_", "-")
    return f"{prefix}:{digest}"


def stable_unique_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        key = value.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(value)
    return result


def ensure_string_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if item not in (None, "")]
    if value in (None, ""):
        return []
    return [str(value)]


def score_from_severity(severity: str) -> int:
    normalized = str(severity or "").lower()
    if normalized == "critical":
        return 92
    if normalized == "high":
        return 82
    if normalized == "medium":
        return 64
    return 35


def severity_from_score(score: int) -> str:
    if score >= 90:
        return "critical"
    if score >= 75:
        return "high"
    if score >= 55:
        return "medium"
    return "low"


def recognize_image(
    path: Path,
    source_type: str,
    tools: dict[str, MultimodalToolStatus],
    warnings: list[str],
) -> MultimodalRecognition | None:
    attempted = False
    paddleocr = tools.get("paddleocr")
    if paddleocr and paddleocr.available:
        attempted = True
        recognition = recognize_image_with_paddleocr(path, source_type, warnings)
        if recognition is not None:
            return recognition

    tesseract = tools.get("tesseract-ocr")
    if tesseract and tesseract.available:
        attempted = True
        recognition = recognize_image_with_tesseract(path, source_type, tesseract.command, warnings)
        if recognition is not None:
            return recognition

    if attempted:
        warnings.append(f"OCR engines ran for {path.name}, but no readable text was detected.")
    else:
        warnings.append("No OCR engine is available; install PaddleOCR or Tesseract OCR to extract screenshot text.")
    return None


def recognize_image_with_paddleocr(
    path: Path,
    source_type: str,
    warnings: list[str],
) -> MultimodalRecognition | None:
    temp_dir: Path | None = None
    try:
        os.environ.setdefault("FLAGS_enable_pir_api", "0")
        os.environ.setdefault("FLAGS_enable_pir_in_executor", "0")
        from paddleocr import PaddleOCR  # type: ignore[import-not-found]

        ocr_path, temp_dir = paddleocr_input_path(path)
        errors: list[str] = []
        for engine, init_options, predict_options in paddleocr_attempts():
            try:
                ocr = create_paddleocr(PaddleOCR, init_options)
                result = run_paddleocr(ocr, ocr_path, predict_options)
            except Exception as exc:
                errors.append(f"{engine}: {short_text(exc, 160)}")
                continue
            texts, confidences, segments = paddleocr_text_segments(result)
            recognized_text = normalize_recognized_text("\n".join(texts))
            if not recognized_text:
                continue
            return MultimodalRecognition(
                source_type=source_type,
                recognized_text=recognized_text,
                confidence=average(confidences) or 0.86,
                evidence_type="visual_ocr",
                engine=engine,
                source_path=relative_path(path),
                language=OCR_LANG,
                segments=segments,
            )
        if errors:
            warnings.append(f"PaddleOCR failed for {path.name}: {'; '.join(errors)}")
        return None
    except Exception as exc:  # pragma: no cover - depends on optional model files.
        warnings.append(f"PaddleOCR failed for {path.name}: {short_text(exc, 220)}")
        return None
    finally:
        if temp_dir is not None:
            shutil.rmtree(temp_dir, ignore_errors=True)


def paddleocr_attempts() -> list[tuple[str, dict[str, Any], dict[str, Any]]]:
    base_options = {
        "lang": OCR_LANG,
        "use_doc_orientation_classify": False,
        "use_doc_unwarping": False,
        "use_textline_orientation": False,
    }
    return [
        ("PaddleOCR/PP-OCRv5", base_options, {}),
        (
            "PaddleOCR/PP-OCRv4-loose",
            {**base_options, "ocr_version": "PP-OCRv4"},
            {
                "text_det_limit_side_len": 2048,
                "text_det_thresh": 0.1,
                "text_det_box_thresh": 0.1,
                "text_det_unclip_ratio": 2.0,
                "text_rec_score_thresh": 0.0,
            },
        ),
    ]


def create_paddleocr(paddleocr_class: Any, options: dict[str, Any]) -> Any:
    try:
        return paddleocr_class(**options)
    except (TypeError, ValueError):
        return paddleocr_class(use_angle_cls=False, lang=OCR_LANG)


def run_paddleocr(ocr: Any, path: Path, options: dict[str, Any]) -> Any:
    if hasattr(ocr, "predict"):
        try:
            return ocr.predict(str(path), **options)
        except TypeError:
            return ocr.predict(str(path))
    try:
        return ocr.ocr(str(path), cls=False)
    except TypeError:
        return ocr.ocr(str(path))


def paddleocr_input_path(path: Path) -> tuple[Path, Path | None]:
    if path.suffix.lower() in PADDLEOCR_IMAGE_EXTENSIONS:
        return path, None
    suffix = image_extension_from_header(path) or ".jpg"
    temp_dir = Path(tempfile.mkdtemp(prefix="supplyguard-ocr-"))
    temp_path = temp_dir / f"{safe_filename(path.name)}{suffix}"
    shutil.copyfile(path, temp_path)
    return temp_path, temp_dir


def image_extension_from_header(path: Path) -> str | None:
    try:
        header = path.read_bytes()[:16]
    except OSError:
        return None
    if header.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if header.startswith((b"GIF87a", b"GIF89a")):
        return ".gif"
    if header.startswith(b"RIFF") and header[8:12] == b"WEBP":
        return ".webp"
    if header.startswith((b"II*\x00", b"MM\x00*")):
        return ".tiff"
    return None


def recognize_image_with_tesseract(
    path: Path,
    source_type: str,
    command: str,
    warnings: list[str],
) -> MultimodalRecognition | None:
    result = run_tesseract_tsv(command, path, TESSERACT_LANG)
    language = TESSERACT_LANG
    if result.returncode != 0 and TESSERACT_LANG != "eng":
        result = run_tesseract_tsv(command, path, "eng")
        language = "eng"
    if result.returncode != 0:
        warnings.append(f"Tesseract OCR failed for {path.name}: {short_text(result.stderr or result.stdout, 220)}")
        return None

    words, confidences, segments = parse_tesseract_tsv(result.stdout)
    recognized_text = normalize_recognized_text(" ".join(words))
    if not recognized_text:
        return None
    return MultimodalRecognition(
        source_type=source_type,
        recognized_text=recognized_text,
        confidence=average(confidences) or 0.72,
        evidence_type="visual_ocr",
        engine="Tesseract OCR",
        source_path=relative_path(path),
        language=language,
        segments=segments,
    )


def run_tesseract_tsv(command: str, path: Path, language: str) -> CommandResult:
    return run_command(
        [command, str(path), "stdout", "-l", language, "--psm", "6", "tsv"],
        TOOL_TIMEOUT_SECONDS,
    )


def parse_tesseract_tsv(value: str) -> tuple[list[str], list[float], list[dict[str, Any]]]:
    lines = [line for line in value.splitlines() if line.strip()]
    if not lines:
        return [], [], []
    headers = lines[0].split("\t")
    indexes = {header: index for index, header in enumerate(headers)}
    words: list[str] = []
    confidences: list[float] = []
    segments: list[dict[str, Any]] = []
    for line in lines[1:]:
        columns = line.split("\t")
        text = column_value(columns, indexes, "text").strip()
        confidence = safe_float(column_value(columns, indexes, "conf"))
        if not text or confidence is None or confidence < 0:
            continue
        normalized_confidence = max(0.0, min(1.0, confidence / 100))
        words.append(text)
        confidences.append(normalized_confidence)
        segments.append(
            {
                "text": text,
                "confidence": round(normalized_confidence, 3),
                "left": safe_int(column_value(columns, indexes, "left")),
                "top": safe_int(column_value(columns, indexes, "top")),
                "width": safe_int(column_value(columns, indexes, "width")),
                "height": safe_int(column_value(columns, indexes, "height")),
            }
        )
    return words, confidences, segments


def paddleocr_text_segments(value: Any) -> tuple[list[str], list[float], list[dict[str, Any]]]:
    texts: list[str] = []
    confidences: list[float] = []
    segments: list[dict[str, Any]] = []

    def visit(item: Any) -> None:
        if hasattr(item, "res"):
            visit(getattr(item, "res"))
            return
        if isinstance(item, dict):
            rec_texts = item.get("rec_texts")
            if isinstance(rec_texts, (list, tuple)):
                rec_scores = item.get("rec_scores") if isinstance(item.get("rec_scores"), (list, tuple)) else []
                rec_boxes = item.get("rec_boxes") if isinstance(item.get("rec_boxes"), (list, tuple)) else []
                for index, raw_text in enumerate(rec_texts):
                    text = str(raw_text or "").strip()
                    if not text:
                        continue
                    confidence = rec_scores[index] if index < len(rec_scores) else None
                    conf = normalize_confidence(confidence)
                    texts.append(text)
                    confidences.append(conf)
                    segment: dict[str, Any] = {"text": text, "confidence": conf}
                    if index < len(rec_boxes):
                        segment["box"] = json_safe_value(rec_boxes[index])
                    segments.append(segment)
            text = item.get("text") or item.get("transcription") or item.get("rec_text")
            confidence = item.get("score") or item.get("confidence") or item.get("rec_score")
            if isinstance(text, str) and text.strip():
                conf = normalize_confidence(confidence)
                texts.append(text.strip())
                confidences.append(conf)
                segments.append({"text": text.strip(), "confidence": conf})
            for nested in item.values():
                if isinstance(nested, (list, tuple, dict)):
                    visit(nested)
            return
        if not isinstance(item, (list, tuple)):
            return
        if len(item) >= 2 and isinstance(item[1], (list, tuple)) and item[1] and isinstance(item[1][0], str):
            text = item[1][0].strip()
            if text:
                conf = normalize_confidence(item[1][1] if len(item[1]) > 1 else None)
                texts.append(text)
                confidences.append(conf)
                segments.append({"text": text, "confidence": conf, "box": item[0] if item else None})
            return
        for nested in item:
            visit(nested)

    visit(value)
    return texts, confidences, segments


def json_safe_value(value: Any) -> Any:
    if hasattr(value, "tolist"):
        return value.tolist()
    if isinstance(value, tuple):
        return [json_safe_value(item) for item in value]
    if isinstance(value, list):
        return [json_safe_value(item) for item in value]
    if isinstance(value, dict):
        return {str(key): json_safe_value(item) for key, item in value.items()}
    return value


def column_value(columns: list[str], indexes: dict[str, int], name: str) -> str:
    index = indexes.get(name)
    if index is None or index >= len(columns):
        return ""
    return columns[index]


def opencv_metadata(path: Path, source_type: str, warnings: list[str]) -> dict[str, Any]:
    try:
        import cv2  # type: ignore[import-not-found]
    except Exception:
        return {}

    try:
        image = cv2.imread(str(path))
        if image is None:
            return {}
        height, width = image.shape[:2]
        channels = image.shape[2] if len(image.shape) > 2 else 1
        return {"width": int(width), "height": int(height), "channels": int(channels), "preprocess_ready": True}
    except Exception as exc:  # pragma: no cover - optional dependency behavior.
        warnings.append(f"OpenCV metadata extraction failed for {path.name}: {short_text(exc, 180)}")
        return {}


def image_dimensions(path: Path) -> dict[str, int]:
    try:
        data = path.read_bytes()[:8192]
    except OSError:
        return {}
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        width, height = struct.unpack(">II", data[16:24])
        return {"width": int(width), "height": int(height)}
    if data.startswith((b"GIF87a", b"GIF89a")) and len(data) >= 10:
        width, height = struct.unpack("<HH", data[6:10])
        return {"width": int(width), "height": int(height)}
    if data.startswith(b"\xff\xd8"):
        jpeg = jpeg_dimensions(data)
        if jpeg:
            return jpeg
    return {}


def jpeg_dimensions(data: bytes) -> dict[str, int]:
    position = 2
    while position + 9 < len(data):
        if data[position] != 0xFF:
            position += 1
            continue
        marker = data[position + 1]
        position += 2
        if marker in {0xD8, 0xD9}:
            continue
        if position + 2 > len(data):
            break
        segment_length = int.from_bytes(data[position : position + 2], "big")
        if segment_length < 2 or position + segment_length > len(data):
            break
        if marker in {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}:
            height = int.from_bytes(data[position + 3 : position + 5], "big")
            width = int.from_bytes(data[position + 5 : position + 7], "big")
            return {"width": width, "height": height}
        position += segment_length
    return {}


def append_evidence_index(items: list[MultimodalEvidence]) -> None:
    MULTIMODAL_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    index = load_evidence_index()
    existing = index.get("evidence") if isinstance(index.get("evidence"), list) else []
    payload_items = [serialize_evidence(item) for item in items]
    merged = payload_items + [item for item in existing if isinstance(item, dict)]
    seen: set[str] = set()
    evidence: list[dict[str, Any]] = []
    for item in sorted(merged, key=lambda value: str(value.get("uploaded_at") or ""), reverse=True):
        evidence_id = str(item.get("evidence_id") or "")
        if not evidence_id or evidence_id in seen:
            continue
        seen.add(evidence_id)
        evidence.append(item)
    payload = {
        "schema_version": "supplyguard.multimodal-evidence.v1",
        "updated_at": datetime.now(UTC).isoformat(),
        "storage_dir": str(MULTIMODAL_STORAGE_DIR),
        "evidence": evidence[:MAX_INDEX_EVIDENCE],
    }
    MULTIMODAL_INDEX_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def load_evidence_index() -> dict[str, Any]:
    if not MULTIMODAL_INDEX_PATH.exists():
        return {"evidence": []}
    try:
        payload = json.loads(MULTIMODAL_INDEX_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"evidence": []}
    return payload if isinstance(payload, dict) else {"evidence": []}


def latest_multimodal_payload(limit: int = 100) -> dict[str, Any]:
    index = load_evidence_index()
    evidence = [item for item in index.get("evidence", []) if isinstance(item, dict)][: max(1, min(limit, MAX_INDEX_EVIDENCE))]
    summary = build_summary_from_dicts(evidence)
    return {
        "scan_id": None,
        "generated_at": index.get("updated_at") or datetime.now(UTC).isoformat(),
        "evidence": evidence,
        "tools": [asdict(tool) for tool in detect_tools()],
        "summary": summary,
        "report": build_multimodal_report_from_dicts(evidence, summary),
        "warnings": [],
    }


def empty_multimodal_payload() -> dict[str, Any]:
    return {
        "scan_id": None,
        "generated_at": None,
        "evidence": [],
        "tools": [asdict(tool) for tool in detect_tools()],
        "summary": {
            "evidence_count": 0,
            "image": 0,
            "derived_count": 0,
            "recognition_count": 0,
            "ocr_count": 0,
            "entity_count": 0,
            "finding_count": 0,
            "risk_score": 0,
            "risk_level": "low",
            "critical": 0,
            "high": 0,
            "medium": 0,
            "low": 0,
            "by_entity_type": {},
            "by_rule": {},
            "total_size_bytes": 0,
            "storage_dir": str(MULTIMODAL_STORAGE_DIR),
            "storage_relative_dir": relative_path(MULTIMODAL_STORAGE_DIR),
        },
        "report": "# Multimodal Evidence Intake\n\nNo multimodal evidence has been uploaded.",
        "warnings": [],
    }


def serialize_multimodal_audit(result: MultimodalAuditResult | None) -> dict[str, Any] | None:
    if result is None:
        return None
    return {
        "scan_id": result.scan_id,
        "generated_at": result.generated_at,
        "evidence": [serialize_evidence(item) for item in result.evidence],
        "tools": [asdict(tool) for tool in result.tools],
        "summary": result.summary,
        "report": result.report,
        "warnings": result.warnings,
    }


def serialize_evidence(item: MultimodalEvidence) -> dict[str, Any]:
    payload = asdict(item)
    payload["derived"] = [asdict(artifact) if not isinstance(artifact, dict) else artifact for artifact in item.derived]
    payload["recognitions"] = [
        asdict(recognition) if not isinstance(recognition, dict) else recognition
        for recognition in item.recognitions
    ]
    payload["entities"] = [asdict(entity) if not isinstance(entity, dict) else entity for entity in item.entities]
    payload["findings"] = [asdict(finding) if not isinstance(finding, dict) else finding for finding in item.findings]
    return payload


def build_summary(evidence: list[MultimodalEvidence], *, duration_seconds: float) -> dict[str, Any]:
    payload = build_summary_from_dicts([serialize_evidence(item) for item in evidence])
    payload["duration_seconds"] = duration_seconds
    return payload


def build_summary_from_dicts(evidence: list[dict[str, Any]]) -> dict[str, Any]:
    image_count = 0
    severities = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    total_size = 0
    derived_count = 0
    recognition_count = 0
    ocr_count = 0
    entity_count = 0
    finding_count = 0
    risk_score = 0
    by_entity_type: dict[str, int] = {}
    by_rule: dict[str, int] = {}
    for item in evidence:
        source_type = str(item.get("source_type") or "")
        if source_type == "image":
            image_count += 1
        total_size += int(item.get("size_bytes") or 0)
        risk_score = max(risk_score, int(item.get("risk_score") or 0))
        derived = item.get("derived") if isinstance(item.get("derived"), list) else []
        derived_count += len(derived)
        recognitions = item.get("recognitions") if isinstance(item.get("recognitions"), list) else []
        recognition_count += len(recognitions)
        entities = ensure_dicts(item.get("entities"))
        findings = ensure_dicts(item.get("findings"))
        entity_count += len(entities)
        finding_count += len(findings)
        for entity in entities:
            entity_type = str(entity.get("type") or "unknown")
            by_entity_type[entity_type] = by_entity_type.get(entity_type, 0) + 1
        for finding in findings:
            severity = str(finding.get("severity") or severity_from_score(int(finding.get("score") or 0))).lower()
            severity = severity if severity in severities else "low"
            severities[severity] += 1
            risk_score = max(risk_score, int(finding.get("score") or 0))
            rule_id = str(finding.get("rule_id") or "unknown")
            by_rule[rule_id] = by_rule.get(rule_id, 0) + 1
        for recognition in recognitions:
            if not isinstance(recognition, dict):
                continue
            evidence_type = str(recognition.get("evidence_type") or "")
            if evidence_type == "visual_ocr":
                ocr_count += 1
    return {
        "evidence_count": len(evidence),
        "image": image_count,
        "derived_count": derived_count,
        "recognition_count": recognition_count,
        "ocr_count": ocr_count,
        "entity_count": entity_count,
        "finding_count": finding_count,
        "risk_score": risk_score,
        "risk_level": severity_from_score(risk_score),
        **severities,
        "by_entity_type": by_entity_type,
        "by_rule": by_rule,
        "total_size_bytes": total_size,
        "storage_dir": str(MULTIMODAL_STORAGE_DIR),
        "storage_relative_dir": relative_path(MULTIMODAL_STORAGE_DIR),
    }


def build_multimodal_report(
    scan_id: str,
    generated_at: str,
    evidence: list[MultimodalEvidence],
    tools: list[MultimodalToolStatus],
    summary: dict[str, Any],
    warnings: list[str],
) -> str:
    rows = "\n".join(
        "| {id} | {type} | {name} | {size} | {path} | {time} |".format(
            id=item.evidence_id,
            type=item.source_type,
            name=markdown_cell(item.original_filename),
            size=item.size_bytes,
            path=markdown_cell(item.relative_path),
            time=item.uploaded_at[:19].replace("T", " "),
        )
        for item in evidence
    )
    tool_rows = "\n".join(
        f"| {tool.name} | {'yes' if tool.available else 'no'} | {tool.state} | {markdown_cell(tool.version or tool.error or '-')} |"
        for tool in tools
    )
    recognition_rows = "\n".join(
        render_recognition_report_row(item, recognition)
        for item in evidence
        for recognition in item.recognitions
    )
    entity_rows = "\n".join(
        render_entity_report_row(item, entity)
        for item in evidence
        for entity in item.entities
    )
    finding_rows = "\n".join(
        render_finding_report_row(finding)
        for item in evidence
        for finding in item.findings
    )
    warning_rows = "\n".join(f"- {warning}" for warning in warnings) or "- None"
    return f"""# Multimodal Evidence Intake Report

Generated: {generated_at}
Scan ID: {scan_id}

## Summary

- Evidence count: {summary.get('evidence_count', 0)}
- Image: {summary.get('image', 0)}
- Derived artifacts: {summary.get('derived_count', 0)}
- Text recognitions: {summary.get('recognition_count', 0)}
- Security entities: {summary.get('entity_count', 0)}
- Rule findings: {summary.get('finding_count', 0)}
- Risk: {summary.get('risk_level', 'low')} / {summary.get('risk_score', 0)}
- Storage: {summary.get('storage_relative_dir')}

## Evidence

| Evidence ID | Type | Original file | Bytes | Path | Uploaded |
| --- | --- | --- | ---: | --- | --- |
{rows or '| - | - | - | 0 | - | - |'}

## Text Evidence

| Evidence ID | Evidence type | Engine | Confidence | Recognized text |
| --- | --- | --- | ---: | --- |
{recognition_rows or '| - | - | - | 0 | - |'}

## Security Entities

| Evidence ID | Type | Value | Confidence | Evidence |
| --- | --- | --- | ---: | --- |
{entity_rows or '| - | - | - | 0 | - |'}

## Rule Findings

| Finding ID | Severity | Score | Rule | Matched keywords | Related entities | Recommendation |
| --- | --- | ---: | --- | --- | --- | --- |
{finding_rows or '| - | - | 0 | - | - | - | - |'}

## Tools

| Tool | Available | State | Version / error |
| --- | --- | --- | --- |
{tool_rows}

## Warnings

{warning_rows}

## Open-source references

- OpenCV: https://opencv.org/about/
- PaddleOCR: https://www.paddleocr.ai/
- Tesseract OCR: https://tesseractocr.org/
"""


def build_multimodal_report_from_dicts(evidence: list[dict[str, Any]], summary: dict[str, Any]) -> str:
    rows = "\n".join(
        "| {id} | {type} | {name} | {size} | {path} | {time} |".format(
            id=item.get("evidence_id") or "-",
            type=item.get("source_type") or "-",
            name=markdown_cell(item.get("original_filename") or item.get("filename") or "-"),
            size=int(item.get("size_bytes") or 0),
            path=markdown_cell(item.get("relative_path") or item.get("file_path") or "-"),
            time=str(item.get("uploaded_at") or "")[:19].replace("T", " "),
        )
        for item in evidence
    )
    recognition_rows = "\n".join(
        render_recognition_report_row_from_dict(item, recognition)
        for item in evidence
        for recognition in ensure_dicts(item.get("recognitions"))
    )
    entity_rows = "\n".join(
        render_entity_report_row_from_dict(item, entity)
        for item in evidence
        for entity in ensure_dicts(item.get("entities"))
    )
    finding_rows = "\n".join(
        render_finding_report_row_from_dict(finding)
        for item in evidence
        for finding in ensure_dicts(item.get("findings"))
    )
    return f"""# Multimodal Evidence Intake Report

## Latest Evidence

- Evidence count: {summary.get('evidence_count', 0)}
- Text recognitions: {summary.get('recognition_count', 0)}
- Security entities: {summary.get('entity_count', 0)}
- Rule findings: {summary.get('finding_count', 0)}
- Risk: {summary.get('risk_level', 'low')} / {summary.get('risk_score', 0)}
- Storage: {summary.get('storage_relative_dir')}

| Evidence ID | Type | Original file | Bytes | Path | Uploaded |
| --- | --- | --- | ---: | --- | --- |
{rows or '| - | - | - | 0 | - | - |'}

## Text Evidence

| Evidence ID | Evidence type | Engine | Confidence | Recognized text |
| --- | --- | --- | ---: | --- |
{recognition_rows or '| - | - | - | 0 | - |'}

## Security Entities

| Evidence ID | Type | Value | Confidence | Evidence |
| --- | --- | --- | ---: | --- |
{entity_rows or '| - | - | - | 0 | - |'}

## Rule Findings

| Finding ID | Severity | Score | Rule | Matched keywords | Related entities | Recommendation |
| --- | --- | ---: | --- | --- | --- | --- |
{finding_rows or '| - | - | 0 | - | - | - | - |'}
"""


def render_recognition_report_row(item: MultimodalEvidence, recognition: MultimodalRecognition) -> str:
    return (
        f"| {item.evidence_id} | {recognition.evidence_type} | {markdown_cell(recognition.engine)} | "
        f"{recognition.confidence:.2f} | {markdown_cell(short_text(recognition.recognized_text, 180))} |"
    )


def render_recognition_report_row_from_dict(item: dict[str, Any], recognition: dict[str, Any]) -> str:
    return (
        f"| {item.get('evidence_id') or '-'} | {recognition.get('evidence_type') or '-'} | "
        f"{markdown_cell(recognition.get('engine') or '-')} | {float(recognition.get('confidence') or 0):.2f} | "
        f"{markdown_cell(short_text(recognition.get('recognized_text') or '', 180))} |"
    )


def render_entity_report_row(item: MultimodalEvidence, entity: MultimodalEntity) -> str:
    return (
        f"| {item.evidence_id} | {entity.type} | {markdown_cell(entity.value)} | "
        f"{entity.confidence:.2f} | {markdown_cell(short_text(entity.evidence, 120))} |"
    )


def render_entity_report_row_from_dict(item: dict[str, Any], entity: dict[str, Any]) -> str:
    return (
        f"| {item.get('evidence_id') or '-'} | {entity.get('type') or '-'} | "
        f"{markdown_cell(entity.get('value') or '-')} | {float(entity.get('confidence') or 0):.2f} | "
        f"{markdown_cell(short_text(entity.get('evidence') or '', 120))} |"
    )


def render_finding_report_row(finding: MultimodalFinding) -> str:
    entity_values = ", ".join(str(entity.get("value") or "") for entity in finding.entities[:6] if entity.get("value"))
    return (
        f"| {finding.id} | {finding.severity} | {finding.score} | {markdown_cell(finding.rule_id)} | "
        f"{markdown_cell(', '.join(finding.matched_keywords))} | {markdown_cell(entity_values)} | "
        f"{markdown_cell(finding.recommendation)} |"
    )


def render_finding_report_row_from_dict(finding: dict[str, Any]) -> str:
    entities = ensure_dicts(finding.get("entities"))
    entity_values = ", ".join(str(entity.get("value") or "") for entity in entities[:6] if entity.get("value"))
    keywords = ", ".join(ensure_string_list(finding.get("matched_keywords")))
    return (
        f"| {finding.get('id') or '-'} | {finding.get('severity') or '-'} | {int(finding.get('score') or 0)} | "
        f"{markdown_cell(finding.get('rule_id') or '-')} | {markdown_cell(keywords)} | "
        f"{markdown_cell(entity_values)} | {markdown_cell(finding.get('recommendation') or '-')} |"
    )


def sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def relative_path(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT.resolve())).replace("\\", "/")
    except ValueError:
        return str(path)


def safe_filename(value: str) -> str:
    name = Path(value or "upload.bin").name or "upload.bin"
    suffix = Path(name).suffix.lower()
    stem = Path(name).stem if suffix else name
    safe_stem = re.sub(r"[^A-Za-z0-9_.-]+", "-", stem).strip(".-") or "upload"
    safe_suffix = re.sub(r"[^A-Za-z0-9.]+", "", suffix)
    if safe_suffix and not safe_suffix.startswith("."):
        safe_suffix = f".{safe_suffix}"
    return f"{safe_stem}{safe_suffix}" if safe_suffix else safe_stem


def safe_int(value: Any) -> int | None:
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return None


def safe_float(value: Any) -> float | None:
    try:
        return float(str(value))
    except (TypeError, ValueError):
        return None


def average(values: list[float]) -> float:
    clean = [value for value in values if isinstance(value, (int, float))]
    if not clean:
        return 0.0
    return round(sum(clean) / len(clean), 3)


def normalize_confidence(value: Any) -> float:
    numeric = safe_float(value)
    if numeric is None:
        return 0.8
    if numeric > 1:
        numeric = numeric / 100
    return round(max(0.0, min(1.0, numeric)), 3)


def normalize_recognized_text(value: str) -> str:
    text = str(value or "").replace("\r\n", "\n").replace("\r", "\n")
    lines = [" ".join(line.split()) for line in text.splitlines()]
    return "\n".join(line for line in lines if line).strip()


def ensure_dicts(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def short_text(value: Any, limit: int) -> str:
    text = str(value or "").replace("\n", " ").strip()
    if len(text) <= limit:
        return text
    return f"{text[: max(20, limit - 3)]}..."


def first_line(value: str) -> str:
    return next((line.strip() for line in value.splitlines() if line.strip()), "")


def markdown_cell(value: Any) -> str:
    return str(value or "").replace("|", "\\|").replace("\n", " ")


@dataclass(frozen=True)
class CommandResult:
    returncode: int
    stdout: str
    stderr: str


def run_command(command: list[str], timeout_seconds: int) -> CommandResult:
    try:
        result = subprocess.run(
            command,
            cwd=str(ROOT),
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            timeout=timeout_seconds,
            check=False,
        )
    except FileNotFoundError as exc:
        return CommandResult(127, "", str(exc))
    except subprocess.TimeoutExpired as exc:
        return CommandResult(124, exc.stdout or "", exc.stderr or f"Command timed out after {timeout_seconds}s.")
    return CommandResult(result.returncode, result.stdout or "", result.stderr or "")
