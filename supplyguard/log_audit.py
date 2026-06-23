"""Runtime log risk scanner.

This module is intentionally local and deterministic. It normalizes uploaded
web, app, and auth logs into a small event model, then applies high-signal
runtime risk rules for denied-response bursts, sensitive paths, SQL injection
probes, suspicious egress IPs, and brute-force attempts.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import UTC, datetime, timedelta
import hashlib
import ipaddress
import json
import re
import time
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import unquote_plus

from .config import ROOT

try:
    import yaml
except Exception:  # pragma: no cover - only used when runtime deps are missing.
    yaml = None  # type: ignore[assignment]


MAX_LOG_FILES = 12
MAX_FILE_BYTES = 8 * 1024 * 1024
MAX_LINES_PER_FILE = 120_000
MAX_SERIALIZED_EVENTS = 500
MAX_FINDINGS = 200
LOG_RULES_DIR = Path(__file__).resolve().parent / "rules" / "logs"
LOG_AUDIT_STORAGE_DIR = ROOT / "storage" / "log_audit"
REALTIME_EVENTS_PATH = LOG_AUDIT_STORAGE_DIR / "events.jsonl"
REALTIME_FINDINGS_PATH = LOG_AUDIT_STORAGE_DIR / "findings.json"
REALTIME_STATE_PATH = LOG_AUDIT_STORAGE_DIR / "state.json"
MAX_REALTIME_EVENTS = 5000
MAX_REALTIME_FINDINGS = 500
MAX_REALTIME_RUNS = 80
REALTIME_DEDUPE_WINDOW_MINUTES = 5

ACCESS_LOG_RE = re.compile(
    r"^(?P<src_ip>\S+)\s+\S+\s+(?P<user>\S+)\s+\[(?P<time>[^\]]+)\]\s+"
    r'"(?P<request>[^"]*)"\s+(?P<status>\d{3})\s+(?P<size>\S+)'
    r'(?:\s+"(?P<referer>[^"]*)"\s+"(?P<user_agent>[^"]*)")?'
)
ISO_TIME_RE = re.compile(
    r"(?P<time>\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)"
)
AUTH_TIME_RE = re.compile(
    r"^(?P<month>[A-Z][a-z]{2})\s+(?P<day>\d{1,2})\s+"
    r"(?P<hour>\d{2}):(?P<minute>\d{2}):(?P<second>\d{2})"
)
IP_RE = re.compile(r"\b(?P<ip>(?:\d{1,3}\.){3}\d{1,3})\b")
URL_RE = re.compile(r"https?://(?P<host>[A-Za-z0-9_.:-]+)(?P<path>/[^\s\"']*)?", re.IGNORECASE)
PATH_RE = re.compile(r"(?P<path>/[A-Za-z0-9_./~%+\-?=&;:@]+)")
STATUS_RE = re.compile(r"\b(?:status|status_code|code|http_status)[=: ]+(?P<status>\d{3})\b", re.IGNORECASE)
USER_RE = re.compile(r"\b(?:user|username|account|principal)[=: ]+(?P<user>[A-Za-z0-9_.@-]+)\b", re.IGNORECASE)
FAILED_AUTH_RE = re.compile(
    r"(?:Failed \w+ for (?:invalid user )?(?P<failed_user>\S+)|Invalid user (?P<invalid_user>\S+)|"
    r"authentication failure|login failed|invalid credentials)",
    re.IGNORECASE,
)
AUTH_SRC_RE = re.compile(r"\bfrom\s+(?P<src_ip>(?:\d{1,3}\.){3}\d{1,3})\b", re.IGNORECASE)
EGRESS_IP_RE = re.compile(
    r"\b(?:dst|dest|destination|remote|egress|outbound|connect(?:ed)?(?:\s+to)?|callback|beacon)"
    r"\s*[=:]?\s*(?P<dst_ip>(?:\d{1,3}\.){3}\d{1,3})\b",
    re.IGNORECASE,
)

JSON_TIME_FIELDS = ("timestamp", "time", "ts", "date", "datetime", "@timestamp")
JSON_SOURCE_FIELDS = ("source", "log_source", "service", "logger", "component")
JSON_SRC_IP_FIELDS = ("src_ip", "source_ip", "client_ip", "remote_addr", "ip", "ip_address")
JSON_DST_IP_FIELDS = ("dst_ip", "destination_ip", "dest_ip", "remote_ip", "dst", "destination")
JSON_USER_FIELDS = ("user", "username", "account", "principal", "subject")
JSON_METHOD_FIELDS = ("method", "http_method", "request_method")
JSON_PATH_FIELDS = ("path", "uri", "url", "endpoint", "request_uri")
JSON_STATUS_FIELDS = ("status", "status_code", "code", "http_status")
JSON_MESSAGE_FIELDS = ("message", "msg", "log", "error", "exception", "detail")

SENSITIVE_PATH_RULES: tuple[tuple[str, str, str, int, float], ...] = (
    ("/admin/export", "critical", "敏感导出接口访问", 94, 0.94),
    ("/admin", "high", "管理后台路径访问", 82, 0.86),
    ("/api/admin", "high", "管理后台路径访问", 82, 0.86),
    ("/.env", "critical", "敏感配置文件探测", 92, 0.92),
    ("/backup", "high", "备份文件路径探测", 84, 0.86),
    ("/db_backup", "high", "备份文件路径探测", 84, 0.86),
    ("/actuator", "high", "运行时管理端点访问", 82, 0.84),
    ("/debug", "medium", "调试端点访问", 68, 0.78),
    ("/phpmyadmin", "high", "数据库管理路径探测", 84, 0.86),
    ("/wp-admin", "medium", "常见管理路径探测", 64, 0.74),
)
SQLI_PATTERNS: tuple[tuple[re.Pattern[str], str, int, float], ...] = (
    (re.compile(r"\bunion(?:\s|/\*.*?\*/|\+)+select\b", re.IGNORECASE), "UNION SELECT 注入探测", 86, 0.88),
    (re.compile(r"\bor\s+1\s*=\s*1\b", re.IGNORECASE), "恒真条件注入探测", 82, 0.84),
    (re.compile(r"\bsleep\s*\(\s*\d+", re.IGNORECASE), "时间盲注探测", 88, 0.9),
    (re.compile(r"\bbenchmark\s*\(", re.IGNORECASE), "时间盲注探测", 88, 0.9),
    (re.compile(r"\bwaitfor\s+delay\b", re.IGNORECASE), "时间盲注探测", 88, 0.9),
    (re.compile(r"\binformation_schema\b", re.IGNORECASE), "数据库元数据探测", 84, 0.86),
    (re.compile(r"\bextractvalue\s*\(", re.IGNORECASE), "报错注入探测", 84, 0.86),
    (re.compile(r"\bload_file\s*\(", re.IGNORECASE), "文件读取注入探测", 86, 0.88),
)
LOGIN_PATH_HINTS = ("/login", "/auth", "/signin", "/session", "/token")
AUTH_FAILURE_HINTS = (
    "failed password",
    "invalid user",
    "authentication failure",
    "login failed",
    "invalid credentials",
    "password authentication failed",
)


@dataclass(frozen=True)
class LogFileInput:
    filename: str
    content: bytes
    source: str | None = None


@dataclass(frozen=True)
class LogFileSummary:
    filename: str
    source: str
    size_bytes: int
    total_lines: int
    parsed_lines: int
    skipped_lines: int


@dataclass(frozen=True)
class NormalizedLogEvent:
    time: str
    timestamp: datetime | None
    source: str
    log_type: str
    filename: str
    line_number: int
    src_ip: str | None
    dst_ip: str | None
    user: str | None
    method: str | None
    path: str | None
    status: int | None
    message: str
    raw: str


@dataclass(frozen=True)
class LogFinding:
    id: str
    rule_id: str
    title: str
    severity: str
    score: int
    time: str
    source: str
    event: str
    signal: str
    confidence: float
    evidence: str
    src_ip: str | None = None
    dst_ip: str | None = None
    user: str | None = None
    path: str | None = None
    count: int | None = None
    fingerprint: str = ""


@dataclass(frozen=True)
class LogAuditResult:
    scan_id: str
    generated_at: str
    files: list[LogFileSummary]
    events: list[NormalizedLogEvent]
    findings: list[LogFinding]
    summary: dict[str, Any]
    report: str
    warnings: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class LogRule:
    id: str
    title: str
    source: list[str]
    severity: str
    score: int
    signal: str
    confidence: float
    kind: str = "event"
    fields: tuple[str, ...] = ("path", "message")
    keywords: tuple[str, ...] = ()
    exclude_keywords: tuple[str, ...] = ()
    regex: tuple[re.Pattern[str], ...] = ()
    critical_regex: tuple[re.Pattern[str], ...] = ()
    threshold: int | None = None
    window_minutes: int | None = None
    statuses: tuple[int, ...] = ()
    group_by: tuple[str, ...] = ()
    path_prefix: bool = False
    requires_external_dst_ip: bool = False
    requires_egress_hint: bool = False
    auth_failure: bool = False
    login_paths: tuple[str, ...] = LOGIN_PATH_HINTS
    high_threshold: int | None = None
    critical_threshold: int | None = None


def run_log_audit(files: list[LogFileInput]) -> LogAuditResult:
    started_at = time.monotonic()
    scan_id = datetime.now(UTC).strftime("logs-%Y%m%d%H%M%S")
    generated_at = datetime.now(UTC).isoformat()
    warnings: list[str] = []

    if not files:
        raise ValueError("Upload at least one log file.")
    if len(files) > MAX_LOG_FILES:
        raise ValueError(f"Upload at most {MAX_LOG_FILES} log files per scan.")

    events: list[NormalizedLogEvent] = []
    file_summaries: list[LogFileSummary] = []

    for item in files:
        if len(item.content) > MAX_FILE_BYTES:
            raise ValueError(f"{item.filename} exceeds the {MAX_FILE_BYTES // (1024 * 1024)} MiB limit.")
        parsed_events, summary, file_warnings = parse_log_file(item)
        events.extend(parsed_events)
        file_summaries.append(summary)
        warnings.extend(file_warnings)

    rules, rule_warnings = load_log_rules()
    warnings.extend(rule_warnings)
    findings = dedupe_findings(detect_log_findings(events, rules))[:MAX_FINDINGS]
    summary = build_summary(file_summaries, events, findings)
    summary["rule_count"] = len(rules)
    summary["duration_seconds"] = round(time.monotonic() - started_at, 2)
    report = build_log_report(file_summaries, findings, summary, warnings)
    return LogAuditResult(
        scan_id=scan_id,
        generated_at=generated_at,
        files=file_summaries,
        events=events,
        findings=findings,
        summary=summary,
        report=report,
        warnings=warnings,
    )


def parse_log_file(item: LogFileInput) -> tuple[list[NormalizedLogEvent], LogFileSummary, list[str]]:
    text = item.content.decode("utf-8-sig", errors="replace")
    lines = text.splitlines()
    if len(lines) > MAX_LINES_PER_FILE:
        lines = lines[:MAX_LINES_PER_FILE]
        warnings = [f"{item.filename}: truncated to {MAX_LINES_PER_FILE} lines."]
    else:
        warnings = []

    source_hint = normalize_source(item.source)
    inferred_source = source_hint or infer_source_from_filename(item.filename)
    events: list[NormalizedLogEvent] = []
    skipped_lines = 0

    for line_number, raw_line in enumerate(lines, start=1):
        line = raw_line.strip()
        if not line:
            skipped_lines += 1
            continue
        event = parse_log_line(line, item.filename, line_number, inferred_source, source_hint)
        if event is None:
            skipped_lines += 1
            continue
        events.append(event)
        if inferred_source == "unknown" and event.log_type != "unknown":
            inferred_source = event.log_type

    summary = LogFileSummary(
        filename=item.filename,
        source=inferred_source if inferred_source != "unknown" else "app",
        size_bytes=len(item.content),
        total_lines=len(lines),
        parsed_lines=len(events),
        skipped_lines=skipped_lines,
    )
    return events, summary, warnings


def parse_log_line(
    line: str,
    filename: str,
    line_number: int,
    inferred_source: str,
    source_hint: str | None,
) -> NormalizedLogEvent | None:
    if line.startswith("{"):
        event = parse_json_event(line, filename, line_number, inferred_source)
        if event is not None:
            return event

    if source_hint == "web" or ACCESS_LOG_RE.match(line):
        event = parse_access_event(line, filename, line_number, inferred_source)
        if event is not None:
            return event

    if source_hint == "auth" or looks_like_auth_log(line):
        event = parse_auth_event(line, filename, line_number, inferred_source)
        if event is not None:
            return event

    return parse_text_event(line, filename, line_number, inferred_source)


def parse_access_event(
    line: str,
    filename: str,
    line_number: int,
    inferred_source: str,
) -> NormalizedLogEvent | None:
    match = ACCESS_LOG_RE.match(line)
    if not match:
        return parse_text_event(line, filename, line_number, inferred_source)

    request = match.group("request") or ""
    method: str | None = None
    path: str | None = None
    parts = request.split()
    if parts:
        method = parts[0].upper()
    if len(parts) >= 2:
        path = parts[1]

    timestamp = parse_timestamp(match.group("time"))
    user = none_if_dash(match.group("user"))
    status = safe_int(match.group("status"))
    source = "web"
    return NormalizedLogEvent(
        time=format_event_time(timestamp),
        timestamp=timestamp,
        source=source,
        log_type=source,
        filename=filename,
        line_number=line_number,
        src_ip=valid_ip_or_none(match.group("src_ip")),
        dst_ip=None,
        user=user,
        method=method,
        path=path,
        status=status,
        message=request,
        raw=line,
    )


def parse_json_event(
    line: str,
    filename: str,
    line_number: int,
    inferred_source: str,
) -> NormalizedLogEvent | None:
    try:
        payload = json.loads(line)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None

    timestamp = parse_timestamp(first_json_value(payload, JSON_TIME_FIELDS))
    message = stringify(first_json_value(payload, JSON_MESSAGE_FIELDS)) or line
    source = normalize_source(stringify(first_json_value(payload, JSON_SOURCE_FIELDS))) or inferred_source
    if source == "unknown":
        source = "app"
    path = stringify(first_json_value(payload, JSON_PATH_FIELDS))
    method = stringify(first_json_value(payload, JSON_METHOD_FIELDS))
    if method:
        method = method.upper()
    status = safe_int(first_json_value(payload, JSON_STATUS_FIELDS))
    src_ip = valid_ip_or_none(stringify(first_json_value(payload, JSON_SRC_IP_FIELDS)))
    dst_ip = valid_ip_or_none(stringify(first_json_value(payload, JSON_DST_IP_FIELDS)))
    user = stringify(first_json_value(payload, JSON_USER_FIELDS))

    if not dst_ip:
        dst_ip = extract_egress_ip(message)
    if not path:
        path = extract_path(message)
    if status is None:
        status = extract_status(message)

    log_type = source if source in {"web", "app", "auth"} else infer_log_type_from_event(source, message, path, status)
    return NormalizedLogEvent(
        time=format_event_time(timestamp),
        timestamp=timestamp,
        source=source,
        log_type=log_type,
        filename=filename,
        line_number=line_number,
        src_ip=src_ip,
        dst_ip=dst_ip,
        user=user,
        method=method,
        path=path,
        status=status,
        message=message,
        raw=line,
    )


def parse_auth_event(
    line: str,
    filename: str,
    line_number: int,
    inferred_source: str,
) -> NormalizedLogEvent:
    timestamp = parse_auth_timestamp(line)
    src_match = AUTH_SRC_RE.search(line)
    failure_match = FAILED_AUTH_RE.search(line)
    user = None
    if failure_match:
        user = failure_match.groupdict().get("failed_user") or failure_match.groupdict().get("invalid_user")
    if not user:
        user_match = USER_RE.search(line)
        user = user_match.group("user") if user_match else None
    return NormalizedLogEvent(
        time=format_event_time(timestamp),
        timestamp=timestamp,
        source="auth",
        log_type="auth",
        filename=filename,
        line_number=line_number,
        src_ip=valid_ip_or_none(src_match.group("src_ip")) if src_match else None,
        dst_ip=None,
        user=none_if_dash(user),
        method=None,
        path=None,
        status=None,
        message=line,
        raw=line,
    )


def parse_text_event(
    line: str,
    filename: str,
    line_number: int,
    inferred_source: str,
) -> NormalizedLogEvent:
    timestamp = parse_timestamp_from_text(line)
    path = extract_path(line)
    status = extract_status(line)
    user_match = USER_RE.search(line)
    src_ip, dst_ip = extract_ips_from_text(line)
    source = inferred_source if inferred_source != "unknown" else infer_log_type_from_event("app", line, path, status)
    return NormalizedLogEvent(
        time=format_event_time(timestamp),
        timestamp=timestamp,
        source=source,
        log_type=source,
        filename=filename,
        line_number=line_number,
        src_ip=src_ip,
        dst_ip=dst_ip,
        user=user_match.group("user") if user_match else None,
        method=extract_method(line),
        path=path,
        status=status,
        message=line,
        raw=line,
    )


def legacy_detect_log_findings(events: list[NormalizedLogEvent]) -> list[LogFinding]:
    findings: list[LogFinding] = []
    findings.extend(detect_sensitive_paths(events))
    findings.extend(detect_sql_injection(events))
    findings.extend(detect_denied_bursts(events))
    findings.extend(detect_suspicious_egress(events))
    findings.extend(detect_brute_force(events))
    return sorted(findings, key=lambda item: (-item.score, item.time, item.source, item.rule_id))


def detect_sensitive_paths(events: Iterable[NormalizedLogEvent]) -> list[LogFinding]:
    findings: list[LogFinding] = []
    for event in events:
        if not event.path:
            continue
        decoded_path = decode_text(event.path).lower()
        for prefix, severity, signal, score, confidence in SENSITIVE_PATH_RULES:
            if decoded_path.startswith(prefix) or decoded_path.startswith(prefix + "/"):
                adjusted_confidence = confidence if event.status not in {404} else max(0.65, confidence - 0.12)
                findings.append(
                    make_finding(
                        rule_id="runtime.sensitive-path-access",
                        title=signal,
                        severity=severity,
                        score=score,
                        event=event,
                        signal=signal,
                        confidence=adjusted_confidence,
                        evidence=f"{event.method or '-'} {event.path} status={event.status or '-'}",
                        event_text=f"{event.method or 'REQUEST'} {event.path}",
                    )
                )
                break
    return findings


def detect_sql_injection(events: Iterable[NormalizedLogEvent]) -> list[LogFinding]:
    findings: list[LogFinding] = []
    for event in events:
        text_parts = [event.path or "", event.message or ""]
        searchable = decode_text(" ".join(text_parts))
        for pattern, signal, score, confidence in SQLI_PATTERNS:
            if not pattern.search(searchable):
                continue
            severity = "high"
            if "时间盲注" in signal or event.path and any(secret in decode_text(event.path).lower() for secret in ("/admin", "/export")):
                severity = "critical"
                score = max(score, 92)
                confidence = min(0.96, confidence + 0.04)
            findings.append(
                make_finding(
                    rule_id="runtime.sql-injection-probe",
                    title=signal,
                    severity=severity,
                    score=score,
                    event=event,
                    signal="SQL 注入探测",
                    confidence=confidence,
                    evidence=truncate_middle(searchable, 220),
                    event_text=f"{event.method or 'LOG'} {event.path or event.message[:80]}",
                )
            )
            break
    return findings


def detect_denied_bursts(events: Iterable[NormalizedLogEvent]) -> list[LogFinding]:
    windows: dict[tuple[str, datetime], list[NormalizedLogEvent]] = {}
    denied_events = [event for event in events if event.timestamp is not None and event.status in {401, 403}]
    for event in denied_events:
        window_start = floor_time(event.timestamp, DENIED_BURST_WINDOW_MINUTES)
        windows.setdefault((event.source, window_start), []).append(event)

    if not windows:
        return []

    counts = [len(items) for items in windows.values()]
    average = sum(counts) / len(counts)
    dynamic_threshold = max(8, int(average * 3)) if len(counts) > 2 else DENIED_BURST_MIN_COUNT
    threshold = min(DENIED_BURST_MIN_COUNT, dynamic_threshold) if len(counts) > 2 else DENIED_BURST_MIN_COUNT

    findings: list[LogFinding] = []
    for (source, window_start), items in windows.items():
        count = len(items)
        if count < threshold:
            continue
        sample = items[0]
        unique_ips = len({item.src_ip for item in items if item.src_ip})
        severity = "high" if count >= 50 else "medium"
        score = 82 if severity == "high" else 68
        confidence = min(0.96, 0.68 + count / 120 + unique_ips / 80)
        findings.append(
            make_window_finding(
                rule_id="runtime.401-403-burst",
                title="401/403 响应暴增",
                severity=severity,
                score=score,
                source=source,
                timestamp=window_start,
                signal="401/403 暴增",
                confidence=confidence,
                event_text=f"{count} denied responses in {DENIED_BURST_WINDOW_MINUTES} minutes",
                evidence=f"{count} 条 401/403，来源 IP {unique_ips} 个，样例 {sample.filename}:{sample.line_number}",
                count=count,
            )
        )
    return findings


def detect_suspicious_egress(events: Iterable[NormalizedLogEvent]) -> list[LogFinding]:
    findings: list[LogFinding] = []
    for event in events:
        dst_ip = event.dst_ip
        if not dst_ip or not is_external_ip(dst_ip):
            continue
        if event.log_type == "web" and not has_egress_hint(event.message):
            continue
        severity = "critical" if has_egress_hint(event.message) and "beacon" in event.message.lower() else "high"
        score = 92 if severity == "critical" else 84
        confidence = 0.88 if has_egress_hint(event.message) else 0.78
        findings.append(
            make_finding(
                rule_id="runtime.suspicious-egress-ip",
                title="异常外联 IP",
                severity=severity,
                score=score,
                event=event,
                signal="异常外联 IP",
                confidence=confidence,
                evidence=truncate_middle(event.raw, 220),
                event_text=f"{event.source} -> {dst_ip}",
                dst_ip=dst_ip,
            )
        )
    return findings


def detect_brute_force(events: Iterable[NormalizedLogEvent]) -> list[LogFinding]:
    buckets: dict[tuple[str, str, datetime], list[NormalizedLogEvent]] = {}
    for event in events:
        if event.timestamp is None or not is_auth_failure_event(event):
            continue
        window_start = floor_time(event.timestamp, BRUTE_FORCE_WINDOW_MINUTES)
        if event.src_ip:
            buckets.setdefault(("ip", event.src_ip, window_start), []).append(event)
        if event.user:
            buckets.setdefault(("user", event.user, window_start), []).append(event)

    findings: list[LogFinding] = []
    for (kind, subject, window_start), items in buckets.items():
        count = len(items)
        if count < BRUTE_FORCE_MIN_COUNT:
            continue
        unique_users = len({item.user for item in items if item.user})
        unique_ips = len({item.src_ip for item in items if item.src_ip})
        severity = "critical" if count >= 20 else "high"
        score = 92 if severity == "critical" else 84
        confidence = min(0.97, 0.72 + count / 60 + unique_users / 60 + unique_ips / 80)
        subject_label = "来源 IP" if kind == "ip" else "账号"
        findings.append(
            make_window_finding(
                rule_id="runtime.brute-force",
                title="暴力破解/认证探测",
                severity=severity,
                score=score,
                source=items[0].source,
                timestamp=window_start,
                signal="暴力破解",
                confidence=confidence,
                event_text=f"{subject_label} {subject} failed {count} times",
                evidence=(
                    f"{BRUTE_FORCE_WINDOW_MINUTES} 分钟内 {count} 次认证失败，"
                    f"账号 {unique_users or '-'} 个，来源 IP {unique_ips or '-'} 个"
                ),
                count=count,
                src_ip=subject if kind == "ip" else None,
                user=subject if kind == "user" else None,
            )
        )
    return findings


def load_log_rules(rules_dir: Path = LOG_RULES_DIR) -> tuple[list[LogRule], list[str]]:
    warnings: list[str] = []
    if yaml is None:
        return default_log_rules(), []
    if not rules_dir.exists():
        return default_log_rules(), [f"Log rules directory is missing: {rules_dir}; using built-in log rules."]

    rules: list[LogRule] = []
    for path in sorted(rules_dir.glob("*.yml")) + sorted(rules_dir.glob("*.yaml")):
        try:
            payload = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            if not isinstance(payload, dict):
                warnings.append(f"{path.name}: rule file must contain a YAML mapping.")
                continue
            rules.append(rule_from_payload(payload, path))
        except Exception as exc:
            warnings.append(f"{path.name}: failed to load rule: {exc}")
    if not rules:
        return default_log_rules(), warnings + ["No YAML log rules were loaded; using built-in log rules."]
    return rules, warnings


def rule_from_payload(payload: dict[str, Any], path: Path) -> LogRule:
    logsource = payload.get("logsource") if isinstance(payload.get("logsource"), dict) else {}
    raw_source = payload.get("source") or logsource.get("category") or logsource.get("product") or []
    severity = str(payload.get("severity") or payload.get("level") or "medium")
    return LogRule(
        id=str(payload.get("id") or path.stem),
        title=str(payload.get("title") or path.stem),
        source=normalize_rule_sources(raw_source),
        severity=severity,
        score=safe_int(payload.get("score")) or score_for_severity(severity),
        signal=str(payload.get("signal") or payload.get("title") or path.stem),
        confidence=float(payload.get("confidence") or 0.75),
        kind=str(payload.get("kind") or "event"),
        fields=tuple(str(item) for item in ensure_list(payload.get("fields") or ["path", "message"])),
        keywords=tuple(str(item).lower() for item in ensure_list(payload.get("keywords"))),
        exclude_keywords=tuple(str(item).lower() for item in ensure_list(payload.get("exclude_keywords"))),
        regex=tuple(re.compile(str(item), re.IGNORECASE) for item in ensure_list(payload.get("regex"))),
        critical_regex=tuple(re.compile(str(item), re.IGNORECASE) for item in ensure_list(payload.get("critical_regex"))),
        threshold=safe_int(payload.get("threshold")),
        window_minutes=safe_int(payload.get("window_minutes")),
        statuses=tuple(int(item) for item in ensure_list(payload.get("statuses")) if safe_int(item) is not None),
        group_by=tuple(str(item) for item in ensure_list(payload.get("group_by"))),
        path_prefix=bool(payload.get("path_prefix")),
        requires_external_dst_ip=bool(payload.get("requires_external_dst_ip")),
        requires_egress_hint=bool(payload.get("requires_egress_hint")),
        auth_failure=bool(payload.get("auth_failure")),
        login_paths=tuple(str(item).lower() for item in ensure_list(payload.get("login_paths") or LOGIN_PATH_HINTS)),
        high_threshold=safe_int(payload.get("high_threshold")),
        critical_threshold=safe_int(payload.get("critical_threshold")),
    )


def default_log_rules() -> list[LogRule]:
    payloads: list[dict[str, Any]] = [
        {
            "id": "runtime.sensitive-export-path",
            "title": "Sensitive Export Or Configuration Path Access",
            "source": "web",
            "kind": "event",
            "severity": "critical",
            "score": 94,
            "signal": "敏感路径访问",
            "confidence": 0.94,
            "fields": ["path"],
            "keywords": ["/admin/export", "/.env"],
            "path_prefix": True,
        },
        {
            "id": "runtime.sensitive-admin-path",
            "title": "Sensitive Admin Or Runtime Management Path Access",
            "source": "web",
            "kind": "event",
            "severity": "high",
            "score": 84,
            "signal": "敏感路径访问",
            "confidence": 0.86,
            "fields": ["path"],
            "keywords": ["/admin", "/api/admin", "/backup", "/db_backup", "/actuator", "/debug", "/phpmyadmin", "/wp-admin"],
            "exclude_keywords": ["/admin/export"],
            "path_prefix": True,
        },
        {
            "id": "runtime.sql-injection-probe",
            "title": "SQL Injection Probe In Request Or Application Log",
            "source": ["web", "app"],
            "kind": "event",
            "severity": "high",
            "score": 86,
            "signal": "SQL 注入探测",
            "confidence": 0.88,
            "fields": ["path", "message"],
            "regex": [
                r"\bunion(?:\s|/\*.*?\*/|\+)+select\b",
                r"\bor\s+1\s*=\s*1\b",
                r"\binformation_schema\b",
                r"\bextractvalue\s*\(",
                r"\bload_file\s*\(",
            ],
            "critical_regex": [r"\bsleep\s*\(\s*\d+", r"\bbenchmark\s*\(", r"\bwaitfor\s+delay\b"],
        },
        {
            "id": "runtime.401-403-burst",
            "title": "401 Or 403 Response Burst",
            "source": "web",
            "kind": "window",
            "severity": "medium",
            "score": 68,
            "signal": "401/403 暴增",
            "confidence": 0.68,
            "statuses": [401, 403],
            "threshold": 20,
            "high_threshold": 50,
            "window_minutes": 5,
            "group_by": ["source"],
        },
        {
            "id": "runtime.suspicious-egress-ip",
            "title": "Suspicious External Egress IP",
            "source": ["app", "web"],
            "kind": "event",
            "severity": "high",
            "score": 84,
            "signal": "异常外联 IP",
            "confidence": 0.88,
            "fields": ["message", "raw"],
            "requires_external_dst_ip": True,
            "requires_egress_hint": True,
            "keywords": ["egress", "outbound", "connect", "callback", "beacon", "destination"],
            "critical_regex": [r"\bbeacon\b"],
        },
        {
            "id": "runtime.brute-force",
            "title": "Brute Force Or Authentication Probing",
            "source": ["auth", "web"],
            "kind": "window",
            "severity": "high",
            "score": 84,
            "signal": "暴力破解",
            "confidence": 0.72,
            "auth_failure": True,
            "threshold": 6,
            "critical_threshold": 20,
            "window_minutes": 10,
            "group_by": ["src_ip", "user"],
        },
    ]
    return [rule_from_payload(payload, Path(f"{payload['id']}.yml")) for payload in payloads]


def detect_log_findings(events: list[NormalizedLogEvent], rules: list[LogRule]) -> list[LogFinding]:
    findings: list[LogFinding] = []
    for rule in rules:
        if rule.kind == "window":
            findings.extend(detect_window_rule(events, rule))
        else:
            findings.extend(detect_event_rule(events, rule))
    return sorted(findings, key=lambda item: (-item.score, item.time, item.source, item.rule_id))


def detect_event_rule(events: Iterable[NormalizedLogEvent], rule: LogRule) -> list[LogFinding]:
    findings: list[LogFinding] = []
    for event in events:
        if not event_matches_source(event, rule):
            continue
        if rule.requires_external_dst_ip and not (event.dst_ip and is_external_ip(event.dst_ip)):
            continue
        if rule.requires_egress_hint and not has_egress_hint(event.message):
            continue

        searchable = event_search_text(event, rule.fields)
        if rule.exclude_keywords and keywords_match(event, searchable, LogRule(
            id=f"{rule.id}.exclude",
            title=rule.title,
            source=rule.source,
            severity=rule.severity,
            score=rule.score,
            signal=rule.signal,
            confidence=rule.confidence,
            fields=rule.fields,
            keywords=rule.exclude_keywords,
            path_prefix=rule.path_prefix,
        )):
            continue
        matched = False
        if rule.requires_external_dst_ip and not rule.keywords and not rule.regex:
            matched = True
        if rule.keywords and keywords_match(event, searchable, rule):
            matched = True
        if rule.regex and any(pattern.search(searchable) for pattern in rule.regex):
            matched = True
        critical_matched = bool(rule.critical_regex and any(pattern.search(searchable) for pattern in rule.critical_regex))
        if critical_matched:
            matched = True
        if not matched:
            continue

        severity = rule.severity
        score = rule.score
        confidence = rule.confidence
        if critical_matched:
            severity = "critical"
            score = max(score, 92)
            confidence = min(0.96, confidence + 0.06)
        if event.status == 404:
            confidence = max(0.62, confidence - 0.12)

        findings.append(
            make_finding(
                rule_id=rule.id,
                title=rule.title,
                severity=severity,
                score=score,
                event=event,
                signal=rule.signal,
                confidence=confidence,
                evidence=event_evidence(event, rule, searchable),
                event_text=event_display_text(event, rule),
                dst_ip=event.dst_ip,
            )
        )
    return findings


def detect_window_rule(events: Iterable[NormalizedLogEvent], rule: LogRule) -> list[LogFinding]:
    if not rule.window_minutes or not rule.threshold:
        return []

    buckets: dict[tuple[str, str, datetime], list[NormalizedLogEvent]] = {}
    for event in events:
        if event.timestamp is None or not event_matches_source(event, rule):
            continue
        if rule.statuses and event.status not in set(rule.statuses):
            continue
        if rule.auth_failure and not is_auth_failure_event(event, login_paths=rule.login_paths):
            continue

        window_start = floor_time(event.timestamp, rule.window_minutes)
        group_values = rule_group_values(event, rule)
        if not group_values:
            group_values = [("source", event.source)]
        for group_name, group_value in group_values:
            buckets.setdefault((group_name, group_value, window_start), []).append(event)

    findings: list[LogFinding] = []
    for (group_name, group_value, window_start), items in buckets.items():
        count = len(items)
        if count < rule.threshold:
            continue
        unique_users = len({item.user for item in items if item.user})
        unique_ips = len({item.src_ip for item in items if item.src_ip})
        severity = severity_for_count(rule, count)
        score = max(rule.score, score_for_severity(severity))
        confidence = min(0.97, rule.confidence + count / 120 + unique_ips / 100 + unique_users / 100)
        label = window_group_label(group_name)
        evidence = (
            f"{rule.window_minutes} 分钟窗口内命中 {count} 条，"
            f"来源 IP {unique_ips or '-'} 个，账号 {unique_users or '-'} 个，"
            f"样例 {items[0].filename}:{items[0].line_number}"
        )
        findings.append(
            make_window_finding(
                rule_id=rule.id,
                title=rule.title,
                severity=severity,
                score=score,
                source=items[0].source,
                timestamp=window_start,
                signal=rule.signal,
                confidence=confidence,
                event_text=f"{label} {group_value} matched {count} times",
                evidence=evidence,
                count=count,
                src_ip=group_value if group_name == "src_ip" else None,
                user=group_value if group_name == "user" else None,
            )
        )
    return findings


def make_finding(
    *,
    rule_id: str,
    title: str,
    severity: str,
    score: int,
    event: NormalizedLogEvent,
    signal: str,
    confidence: float,
    evidence: str,
    event_text: str,
    dst_ip: str | None = None,
) -> LogFinding:
    fingerprint = finding_fingerprint(
        rule_id,
        event.time,
        event.source,
        event.src_ip or "",
        dst_ip or event.dst_ip or "",
        event.user or "",
        event.path or "",
        evidence,
    )
    return LogFinding(
        id=f"LOG-{hashlib.sha1(fingerprint.encode('utf-8')).hexdigest()[:8].upper()}",
        rule_id=rule_id,
        title=title,
        severity=severity,
        score=score,
        time=event.time,
        source=event.source,
        event=event_text,
        signal=signal,
        confidence=round(max(0.0, min(confidence, 1.0)), 2),
        evidence=evidence,
        src_ip=event.src_ip,
        dst_ip=dst_ip or event.dst_ip,
        user=event.user,
        path=event.path,
        fingerprint=fingerprint,
    )


def make_window_finding(
    *,
    rule_id: str,
    title: str,
    severity: str,
    score: int,
    source: str,
    timestamp: datetime,
    signal: str,
    confidence: float,
    event_text: str,
    evidence: str,
    count: int,
    src_ip: str | None = None,
    user: str | None = None,
) -> LogFinding:
    event_time = format_event_time(timestamp)
    fingerprint = finding_fingerprint(rule_id, event_time, source, src_ip or "", user or "", str(count))
    return LogFinding(
        id=f"LOG-{hashlib.sha1(fingerprint.encode('utf-8')).hexdigest()[:8].upper()}",
        rule_id=rule_id,
        title=title,
        severity=severity,
        score=score,
        time=event_time,
        source=source,
        event=event_text,
        signal=signal,
        confidence=round(max(0.0, min(confidence, 1.0)), 2),
        evidence=evidence,
        src_ip=src_ip,
        user=user,
        count=count,
        fingerprint=fingerprint,
    )


def build_summary(
    files: list[LogFileSummary],
    events: list[NormalizedLogEvent],
    findings: list[LogFinding],
) -> dict[str, Any]:
    severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    by_rule: dict[str, int] = {}
    by_source: dict[str, int] = {}
    for finding in findings:
        severity_counts[finding.severity] = severity_counts.get(finding.severity, 0) + 1
        by_rule[finding.rule_id] = by_rule.get(finding.rule_id, 0) + 1
    for event in events:
        by_source[event.source] = by_source.get(event.source, 0) + 1

    max_score = max((finding.score for finding in findings), default=0)
    risk_score = min(98, max_score + min(12, max(0, len(findings) - 1)))
    return {
        "file_count": len(files),
        "total_lines": sum(item.total_lines for item in files),
        "total_events": len(events),
        "parsed_events": len(events),
        "skipped_lines": sum(item.skipped_lines for item in files),
        "finding_count": len(findings),
        "risk_score": risk_score,
        "risk_level": risk_severity(risk_score),
        "critical": severity_counts["critical"],
        "high": severity_counts["high"],
        "medium": severity_counts["medium"],
        "low": severity_counts["low"],
        "by_rule": by_rule,
        "by_source": by_source,
    }


def build_log_report(
    files: list[LogFileSummary],
    findings: list[LogFinding],
    summary: dict[str, Any],
    warnings: list[str],
) -> str:
    file_rows = "\n".join(
        f"| {item.filename} | {item.source} | {item.total_lines} | {item.parsed_lines} | {item.skipped_lines} |"
        for item in files
    )
    finding_rows = "\n".join(
        "| {id} | {severity} | {time} | {source} | {signal} | {confidence}% | {event} |".format(
            id=finding.id,
            severity=finding.severity,
            time=finding.time,
            source=finding.source,
            signal=finding.signal,
            confidence=round(finding.confidence * 100),
            event=finding.event.replace("|", "\\|"),
        )
        for finding in findings[:40]
    )
    warning_rows = "\n".join(f"- {warning}" for warning in warnings)
    return f"""# 运行期日志风险识别报告

生成时间：{datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC")}

## 摘要

- 日志文件：{summary['file_count']}
- 解析事件：{summary['parsed_events']}
- 跳过行数：{summary['skipped_lines']}
- 风险事件：{summary['finding_count']}
- 风险评分：{summary['risk_score']} / 100
- 风险等级：{summary['risk_level']}

## 日志来源

| 文件 | 来源 | 总行数 | 已解析 | 跳过 |
| --- | --- | ---: | ---: | ---: |
{file_rows or '| - | - | 0 | 0 | 0 |'}

## 风险事件

| 编号 | 等级 | 异常时间 | 日志来源 | 风险事件 | 置信度 | 证据 |
| --- | --- | --- | --- | --- | ---: | --- |
{finding_rows or '| - | - | - | - | - | - | 未发现匹配风险 |'}

## 扫描提示

{warning_rows or '- 扫描完成。'}
"""


def serialize_log_audit(result: LogAuditResult | None) -> dict[str, Any] | None:
    if result is None:
        return None
    return {
        "scan_id": result.scan_id,
        "generated_at": result.generated_at,
        "files": [
            {
                "filename": item.filename,
                "source": item.source,
                "size_bytes": item.size_bytes,
                "total_lines": item.total_lines,
                "parsed_lines": item.parsed_lines,
                "skipped_lines": item.skipped_lines,
            }
            for item in result.files
        ],
        "summary": result.summary,
        "events": [serialize_event(event) for event in result.events[:MAX_SERIALIZED_EVENTS]],
        "findings": [serialize_finding(finding) for finding in result.findings],
        "report": result.report,
        "warnings": result.warnings,
    }


def serialize_event(event: NormalizedLogEvent) -> dict[str, Any]:
    return {
        "time": event.time,
        "source": event.source,
        "log_type": event.log_type,
        "filename": event.filename,
        "line_number": event.line_number,
        "src_ip": event.src_ip,
        "dst_ip": event.dst_ip,
        "user": event.user,
        "method": event.method,
        "path": event.path,
        "status": event.status,
        "message": event.message,
        "raw": event.raw,
    }


def serialize_finding(finding: LogFinding) -> dict[str, Any]:
    return {
        "id": finding.id,
        "rule_id": finding.rule_id,
        "title": finding.title,
        "severity": finding.severity,
        "score": finding.score,
        "time": finding.time,
        "source": finding.source,
        "event": finding.event,
        "signal": finding.signal,
        "confidence": finding.confidence,
        "evidence": finding.evidence,
        "src_ip": finding.src_ip,
        "dst_ip": finding.dst_ip,
        "user": finding.user,
        "path": finding.path,
        "count": finding.count,
        "fingerprint": finding.fingerprint,
    }


def ingest_realtime_logs(records: list[dict[str, Any]] | dict[str, Any]) -> dict[str, Any]:
    normalized_records = normalize_ingest_records(records)
    if not normalized_records:
        raise ValueError("Provide at least one JSON log event.")

    events = [
        event_from_ingest_record(record, index)
        for index, record in enumerate(normalized_records, start=1)
    ]
    append_realtime_events(events)
    payload = refresh_realtime_findings()
    update_realtime_state_run(len(events), payload)
    return {
        "accepted": len(events),
        "events": [serialize_event(event) for event in events[:MAX_SERIALIZED_EVENTS]],
        **payload,
    }


def realtime_log_events(limit: int = 200) -> dict[str, Any]:
    payload = refresh_realtime_findings()
    events = [serialize_event(event) for event in load_realtime_events(limit=limit)]
    return {
        **payload,
        "events": events,
    }


def realtime_log_trend(granularity: str = "minute", buckets: int = 60) -> dict[str, Any]:
    return {
        "granularity": normalize_trend_granularity(granularity),
        "trend": build_realtime_trend(granularity=granularity, buckets=buckets),
        "state": public_realtime_state(),
    }


def create_realtime_log_baseline(note: str = "") -> dict[str, Any]:
    payload = refresh_realtime_findings(include_baseline=True)
    state = load_realtime_state()
    now = datetime.now(UTC).isoformat()
    baseline_keys = sorted(
        {
            str(finding.get("dedupe_key") or finding.get("fingerprint") or "")
            for finding in payload["findings"]
            if finding.get("dedupe_key") or finding.get("fingerprint")
        }
    )
    state["baseline"] = {
        "created_at": now,
        "note": note.strip()[:300],
        "keys": baseline_keys,
        "finding_count": len(baseline_keys),
    }
    save_realtime_state(state)
    return realtime_log_events()


def ignore_realtime_log_finding(fingerprint: str, reason: str = "") -> dict[str, Any]:
    token = fingerprint.strip()
    if not token:
        raise ValueError("fingerprint is required.")
    state = load_realtime_state()
    ignored = state.setdefault("ignored", {})
    ignored[token] = {
        "reason": reason.strip()[:300],
        "ignored_at": datetime.now(UTC).isoformat(),
    }
    save_realtime_state(state)
    return realtime_log_events()


def refresh_realtime_findings(*, include_ignored: bool = False, include_baseline: bool = False) -> dict[str, Any]:
    events = load_realtime_events(limit=MAX_REALTIME_EVENTS)
    rules, rule_warnings = load_log_rules()
    detected = dedupe_findings(detect_log_findings(events, rules))
    deduped = dedupe_realtime_findings(detected)
    save_realtime_findings(deduped)
    state = load_realtime_state()
    visible = filter_realtime_findings(
        deduped,
        state=state,
        include_ignored=include_ignored,
        include_baseline=include_baseline,
    )
    return build_realtime_payload(
        events=events,
        findings=visible,
        stored_findings=deduped,
        state=state,
        warnings=rule_warnings,
    )


def normalize_ingest_records(records: list[dict[str, Any]] | dict[str, Any]) -> list[dict[str, Any]]:
    if isinstance(records, list):
        items = records
    elif isinstance(records, dict) and isinstance(records.get("events"), list):
        items = records["events"]
    elif isinstance(records, dict) and isinstance(records.get("logs"), list):
        items = records["logs"]
    elif isinstance(records, dict):
        items = [records]
    else:
        raise ValueError("Log ingest body must be a JSON object, an array, or an object with events/logs.")

    normalized: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("Each log event must be a JSON object.")
        normalized.append(dict(item))
    return normalized


def event_from_ingest_record(record: dict[str, Any], index: int) -> NormalizedLogEvent:
    payload = dict(record)
    if "timestamp" in payload and "time" not in payload:
        payload["time"] = payload["timestamp"]
    if "source" not in payload:
        payload["source"] = "app"
    line = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    source_hint = normalize_source(stringify(payload.get("source"))) or "app"
    event = parse_json_event(line, "realtime-ingest", index, source_hint)
    if event is None:
        return parse_text_event(line, "realtime-ingest", index, source_hint)
    return replace(
        event,
        filename="realtime-ingest",
        line_number=index,
        source=normalize_source(event.source) or source_hint,
        log_type=event.log_type if event.log_type != "unknown" else source_hint,
        raw=line,
    )


def append_realtime_events(events: list[NormalizedLogEvent]) -> None:
    if not events:
        return
    LOG_AUDIT_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    existing = load_realtime_events(limit=MAX_REALTIME_EVENTS)
    combined = sorted(existing + events, key=lambda item: event_sort_time(item))
    combined = combined[-MAX_REALTIME_EVENTS:]
    with REALTIME_EVENTS_PATH.open("w", encoding="utf-8") as handle:
        for event in combined:
            handle.write(json.dumps(serialize_event(event), ensure_ascii=False, sort_keys=True) + "\n")


def load_realtime_events(limit: int = MAX_REALTIME_EVENTS) -> list[NormalizedLogEvent]:
    if not REALTIME_EVENTS_PATH.exists():
        return []
    events: list[NormalizedLogEvent] = []
    try:
        lines = REALTIME_EVENTS_PATH.read_text(encoding="utf-8").splitlines()
    except OSError:
        return []
    for index, line in enumerate(lines[-max(1, limit):], start=1):
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(payload, dict):
            continue
        events.append(event_from_serialized(payload, index))
    return events


def event_from_serialized(payload: dict[str, Any], index: int) -> NormalizedLogEvent:
    timestamp = parse_timestamp(payload.get("time"))
    source = normalize_source(stringify(payload.get("source"))) or "app"
    log_type = normalize_source(stringify(payload.get("log_type"))) or source
    return NormalizedLogEvent(
        time=format_event_time(timestamp),
        timestamp=timestamp,
        source=source,
        log_type=log_type,
        filename=stringify(payload.get("filename")) or "realtime-ingest",
        line_number=safe_int(payload.get("line_number")) or index,
        src_ip=valid_ip_or_none(stringify(payload.get("src_ip"))),
        dst_ip=valid_ip_or_none(stringify(payload.get("dst_ip"))),
        user=stringify(payload.get("user")),
        method=(stringify(payload.get("method")) or "").upper() or None,
        path=stringify(payload.get("path")),
        status=safe_int(payload.get("status")),
        message=stringify(payload.get("message")) or "",
        raw=stringify(payload.get("raw")) or "",
    )


def dedupe_realtime_findings(findings: list[LogFinding]) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    for finding in findings:
        payload = serialize_finding(finding)
        key = realtime_dedupe_key(payload)
        payload["dedupe_key"] = key
        payload["last_seen"] = finding.time
        payload["occurrences"] = 1
        existing = merged.get(key)
        if existing is None:
            merged[key] = payload
            continue
        existing["occurrences"] = int(existing.get("occurrences") or 1) + 1
        existing["last_seen"] = max(str(existing.get("last_seen") or ""), finding.time)
        if int(payload.get("score") or 0) > int(existing.get("score") or 0):
            payload["occurrences"] = existing["occurrences"]
            payload["last_seen"] = existing["last_seen"]
            merged[key] = payload

    return sorted(
        merged.values(),
        key=lambda item: (-int(item.get("score") or 0), str(item.get("time") or ""), str(item.get("rule_id") or "")),
    )[:MAX_REALTIME_FINDINGS]


def filter_realtime_findings(
    findings: list[dict[str, Any]],
    *,
    state: dict[str, Any],
    include_ignored: bool,
    include_baseline: bool,
) -> list[dict[str, Any]]:
    ignored = state.get("ignored") if isinstance(state.get("ignored"), dict) else {}
    baseline = state.get("baseline") if isinstance(state.get("baseline"), dict) else {}
    baseline_keys = set(baseline.get("keys") or [])
    visible: list[dict[str, Any]] = []
    for finding in findings:
        key = str(finding.get("dedupe_key") or "")
        fingerprint = str(finding.get("fingerprint") or "")
        ignored_match = bool(key and key in ignored) or bool(fingerprint and fingerprint in ignored)
        baseline_match = bool(key and key in baseline_keys) or bool(fingerprint and fingerprint in baseline_keys)
        if ignored_match and not include_ignored:
            continue
        if baseline_match and not include_baseline:
            continue
        next_finding = dict(finding)
        next_finding["ignored"] = ignored_match
        next_finding["baseline"] = baseline_match
        visible.append(next_finding)
    return visible


def save_realtime_findings(findings: list[dict[str, Any]]) -> None:
    LOG_AUDIT_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "updated_at": datetime.now(UTC).isoformat(),
        "findings": findings[:MAX_REALTIME_FINDINGS],
    }
    REALTIME_FINDINGS_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def load_realtime_findings() -> list[dict[str, Any]]:
    if not REALTIME_FINDINGS_PATH.exists():
        return []
    try:
        payload = json.loads(REALTIME_FINDINGS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if isinstance(payload, dict) and isinstance(payload.get("findings"), list):
        return [item for item in payload["findings"] if isinstance(item, dict)]
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    return []


def load_realtime_state() -> dict[str, Any]:
    if not REALTIME_STATE_PATH.exists():
        return default_realtime_state()
    try:
        payload = json.loads(REALTIME_STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default_realtime_state()
    if not isinstance(payload, dict):
        return default_realtime_state()
    payload.setdefault("ignored", {})
    payload.setdefault("baseline", {})
    payload.setdefault("runs", [])
    return payload


def default_realtime_state() -> dict[str, Any]:
    return {
        "version": 1,
        "ignored": {},
        "baseline": {},
        "runs": [],
    }


def save_realtime_state(state: dict[str, Any]) -> None:
    LOG_AUDIT_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    state["updated_at"] = datetime.now(UTC).isoformat()
    REALTIME_STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def update_realtime_state_run(accepted: int, payload: dict[str, Any]) -> None:
    state = load_realtime_state()
    runs = state.setdefault("runs", [])
    if not isinstance(runs, list):
        runs = []
        state["runs"] = runs
    summary = payload.get("summary") if isinstance(payload.get("summary"), dict) else {}
    runs.append(
        {
            "time": datetime.now(UTC).isoformat(),
            "accepted": accepted,
            "event_count": summary.get("event_count", 0),
            "finding_count": summary.get("finding_count", 0),
            "risk_score": summary.get("risk_score", 0),
        }
    )
    state["runs"] = runs[-MAX_REALTIME_RUNS:]
    save_realtime_state(state)


def public_realtime_state() -> dict[str, Any]:
    state = load_realtime_state()
    ignored = state.get("ignored") if isinstance(state.get("ignored"), dict) else {}
    baseline = state.get("baseline") if isinstance(state.get("baseline"), dict) else {}
    return {
        "ignored_count": len(ignored),
        "baseline": {
            "created_at": baseline.get("created_at"),
            "note": baseline.get("note"),
            "finding_count": baseline.get("finding_count", len(baseline.get("keys") or [])),
        } if baseline else None,
        "runs": state.get("runs", [])[-10:] if isinstance(state.get("runs"), list) else [],
    }


def build_realtime_payload(
    *,
    events: list[NormalizedLogEvent],
    findings: list[dict[str, Any]],
    stored_findings: list[dict[str, Any]],
    state: dict[str, Any],
    warnings: list[str],
) -> dict[str, Any]:
    summary = build_realtime_summary(events, findings, stored_findings)
    return {
        "mode": "realtime",
        "storage": {
            "events": str(REALTIME_EVENTS_PATH),
            "findings": str(REALTIME_FINDINGS_PATH),
            "state": str(REALTIME_STATE_PATH),
        },
        "summary": summary,
        "findings": findings[:MAX_REALTIME_FINDINGS],
        "trend": build_realtime_trend_from_items(events, findings, "minute", 30),
        "state": public_realtime_state_from_state(state),
        "warnings": warnings,
    }


def build_realtime_summary(
    events: list[NormalizedLogEvent],
    findings: list[dict[str, Any]],
    stored_findings: list[dict[str, Any]],
) -> dict[str, Any]:
    by_source: dict[str, int] = {}
    by_rule: dict[str, int] = {}
    severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for event in events:
        by_source[event.source] = by_source.get(event.source, 0) + 1
    for finding in findings:
        severity = str(finding.get("severity") or "low")
        if severity in severity_counts:
            severity_counts[severity] += 1
        rule_id = str(finding.get("rule_id") or "unknown")
        by_rule[rule_id] = by_rule.get(rule_id, 0) + 1
    score = 0
    if findings:
        score = min(100, max(int(item.get("score") or 0) for item in findings) + min(12, len(findings) // 3))
    return {
        "event_count": len(events),
        "stored_finding_count": len(stored_findings),
        "finding_count": len(findings),
        "risk_score": score,
        "risk_level": risk_severity(score),
        **severity_counts,
        "by_source": by_source,
        "by_rule": by_rule,
    }


def public_realtime_state_from_state(state: dict[str, Any]) -> dict[str, Any]:
    ignored = state.get("ignored") if isinstance(state.get("ignored"), dict) else {}
    baseline = state.get("baseline") if isinstance(state.get("baseline"), dict) else {}
    return {
        "ignored_count": len(ignored),
        "baseline": {
            "created_at": baseline.get("created_at"),
            "note": baseline.get("note"),
            "finding_count": baseline.get("finding_count", len(baseline.get("keys") or [])),
        } if baseline else None,
        "runs": state.get("runs", [])[-10:] if isinstance(state.get("runs"), list) else [],
    }


def build_realtime_trend(granularity: str = "minute", buckets: int = 60) -> list[dict[str, Any]]:
    events = load_realtime_events(limit=MAX_REALTIME_EVENTS)
    findings = filter_realtime_findings(
        load_realtime_findings(),
        state=load_realtime_state(),
        include_ignored=False,
        include_baseline=False,
    )
    return build_realtime_trend_from_items(events, findings, granularity, buckets)


def build_realtime_trend_from_items(
    events: list[NormalizedLogEvent],
    findings: list[dict[str, Any]],
    granularity: str,
    buckets: int,
) -> list[dict[str, Any]]:
    normalized_granularity = normalize_trend_granularity(granularity)
    bucket_count = max(1, min(168, buckets))
    now = datetime.now(UTC).replace(second=0, microsecond=0)
    if normalized_granularity == "hour":
        now = now.replace(minute=0)
        step = timedelta(hours=1)
    else:
        step = timedelta(minutes=1)
    start = now - step * (bucket_count - 1)
    trend = {
        (start + step * index): {
            "bucket": (start + step * index).isoformat(),
            "events": 0,
            "findings": 0,
            "critical": 0,
            "high": 0,
            "medium": 0,
            "low": 0,
        }
        for index in range(bucket_count)
    }
    for event in events:
        bucket = trend_bucket(event.timestamp, normalized_granularity)
        if bucket in trend:
            trend[bucket]["events"] += 1
    for finding in findings:
        timestamp = parse_timestamp(finding.get("time"))
        bucket = trend_bucket(timestamp, normalized_granularity)
        if bucket not in trend:
            continue
        trend[bucket]["findings"] += 1
        severity = str(finding.get("severity") or "low")
        if severity in {"critical", "high", "medium", "low"}:
            trend[bucket][severity] += 1
    return list(trend.values())


def normalize_trend_granularity(value: str) -> str:
    return "hour" if value == "hour" else "minute"


def trend_bucket(timestamp: datetime | None, granularity: str) -> datetime | None:
    if timestamp is None:
        return None
    value = timestamp.astimezone(UTC).replace(second=0, microsecond=0)
    if granularity == "hour":
        return value.replace(minute=0)
    return value


def realtime_dedupe_key(finding: dict[str, Any]) -> str:
    timestamp = parse_timestamp(finding.get("time")) or datetime.now(UTC)
    bucket = floor_time(timestamp, REALTIME_DEDUPE_WINDOW_MINUTES)
    parts = [
        str(finding.get("rule_id") or ""),
        str(finding.get("src_ip") or ""),
        str(finding.get("path") or ""),
        bucket.isoformat(),
    ]
    return finding_fingerprint(*parts)


def event_sort_time(event: NormalizedLogEvent) -> datetime:
    return event.timestamp or datetime.now(UTC)


def empty_log_audit_payload() -> dict[str, Any]:
    return {
        "scan_id": None,
        "summary": {
            "file_count": 0,
            "total_lines": 0,
            "total_events": 0,
            "parsed_events": 0,
            "skipped_lines": 0,
            "finding_count": 0,
            "risk_score": 0,
            "risk_level": "low",
            "critical": 0,
            "high": 0,
            "medium": 0,
            "low": 0,
            "by_rule": {},
            "by_source": {},
            "rule_count": 0,
        },
        "files": [],
        "events": [],
        "findings": [],
        "report": "# 运行期日志风险识别报告\n\n尚未上传日志文件。",
        "warnings": [],
    }


def dedupe_findings(findings: list[LogFinding]) -> list[LogFinding]:
    seen: set[str] = set()
    result: list[LogFinding] = []
    for finding in sorted(findings, key=lambda item: (-item.score, item.time, item.source, item.rule_id)):
        if finding.fingerprint in seen:
            continue
        seen.add(finding.fingerprint)
        result.append(finding)
    return result


def infer_source_from_filename(filename: str) -> str:
    name = Path(filename).name.lower()
    if any(token in name for token in ("access", "nginx", "apache", "httpd", "web")):
        return "web"
    if any(token in name for token in ("auth", "secure", "sshd", "login")):
        return "auth"
    if any(token in name for token in ("app", "server", "service", "application")):
        return "app"
    return "unknown"


def normalize_source(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().lower()
    if normalized in {"web", "access", "nginx", "apache", "http", "waf"}:
        return "web"
    if normalized in {"app", "application", "service", "server", "runtime"}:
        return "app"
    if normalized in {"auth", "ssh", "sshd", "secure", "login"}:
        return "auth"
    return normalized[:40] or None


def infer_log_type_from_event(source: str, message: str, path: str | None, status: int | None) -> str:
    lower = message.lower()
    if source in {"web", "app", "auth"}:
        return source
    if status is not None or path:
        return "web"
    if looks_like_auth_log(lower):
        return "auth"
    return "app"


def looks_like_auth_log(line: str) -> bool:
    lower = line.lower()
    return "sshd" in lower or any(hint in lower for hint in AUTH_FAILURE_HINTS)


def parse_timestamp(value: Any) -> datetime | None:
    if value is None:
        return None
    text = stringify(value)
    if not text:
        return None
    text = text.strip()
    for fmt in ("%d/%b/%Y:%H:%M:%S %z", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            parsed = datetime.strptime(text, fmt)
            return ensure_utc(parsed)
        except ValueError:
            pass
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    if re.search(r"[+-]\d{4}$", text):
        text = f"{text[:-5]}{text[-5:-2]}:{text[-2:]}"
    try:
        return ensure_utc(datetime.fromisoformat(text))
    except ValueError:
        return None


def parse_timestamp_from_text(line: str) -> datetime | None:
    match = ISO_TIME_RE.search(line)
    if match:
        return parse_timestamp(match.group("time"))
    return parse_auth_timestamp(line)


def parse_auth_timestamp(line: str) -> datetime | None:
    match = AUTH_TIME_RE.match(line)
    if not match:
        return None
    months = {
        "Jan": 1,
        "Feb": 2,
        "Mar": 3,
        "Apr": 4,
        "May": 5,
        "Jun": 6,
        "Jul": 7,
        "Aug": 8,
        "Sep": 9,
        "Oct": 10,
        "Nov": 11,
        "Dec": 12,
    }
    month = months.get(match.group("month"))
    if month is None:
        return None
    now = datetime.now(UTC)
    return datetime(
        now.year,
        month,
        int(match.group("day")),
        int(match.group("hour")),
        int(match.group("minute")),
        int(match.group("second")),
        tzinfo=UTC,
    )


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def format_event_time(value: datetime | None) -> str:
    if value is None:
        return datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S")
    return value.astimezone(UTC).strftime("%Y-%m-%d %H:%M:%S")


def floor_time(value: datetime, window_minutes: int) -> datetime:
    value = value.astimezone(UTC)
    minute = (value.minute // window_minutes) * window_minutes
    return value.replace(minute=minute, second=0, microsecond=0)


def extract_ips_from_text(line: str) -> tuple[str | None, str | None]:
    dst_ip = extract_egress_ip(line)
    if dst_ip:
        return None, dst_ip
    matches = [match.group("ip") for match in IP_RE.finditer(line)]
    valid = [ip for ip in matches if valid_ip_or_none(ip)]
    if not valid:
        return None, None
    return valid[0], None


def extract_egress_ip(text: str) -> str | None:
    match = EGRESS_IP_RE.search(text)
    if match:
        return valid_ip_or_none(match.group("dst_ip"))
    for url_match in URL_RE.finditer(text):
        host = url_match.group("host").split(":", 1)[0]
        ip = valid_ip_or_none(host)
        if ip:
            return ip
    return None


def extract_path(text: str) -> str | None:
    for url_match in URL_RE.finditer(text):
        path = url_match.group("path")
        if path:
            return path
    match = PATH_RE.search(text)
    return match.group("path") if match else None


def extract_status(text: str) -> int | None:
    match = STATUS_RE.search(text)
    if not match:
        return None
    return safe_int(match.group("status"))


def extract_method(text: str) -> str | None:
    match = re.search(r"\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b", text)
    return match.group(1) if match else None


def normalize_rule_sources(value: Any) -> list[str]:
    sources = [normalize_source(str(item)) or str(item).lower() for item in ensure_list(value)]
    return [source for source in sources if source]


def ensure_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return [value]


def event_matches_source(event: NormalizedLogEvent, rule: LogRule) -> bool:
    if not rule.source or "any" in rule.source or "*" in rule.source:
        return True
    return event.source in rule.source or event.log_type in rule.source


def event_search_text(event: NormalizedLogEvent, fields: Iterable[str]) -> str:
    parts: list[str] = []
    for field_name in fields:
        value = getattr(event, field_name, None)
        if value is not None:
            parts.append(str(value))
    if not parts:
        parts.append(event.raw)
    return decode_text(" ".join(parts))


def keywords_match(event: NormalizedLogEvent, searchable: str, rule: LogRule) -> bool:
    text = searchable.lower()
    if rule.path_prefix:
        path = decode_text(event.path or "").lower()
        return any(path.startswith(keyword) or path.startswith(f"{keyword}/") for keyword in rule.keywords)
    return any(keyword in text for keyword in rule.keywords)


def event_evidence(event: NormalizedLogEvent, rule: LogRule, searchable: str) -> str:
    if event.path and "path" in rule.fields:
        return f"{event.method or '-'} {event.path} status={event.status or '-'}"
    if rule.requires_external_dst_ip:
        return truncate_middle(event.raw, 220)
    return truncate_middle(searchable, 220)


def event_display_text(event: NormalizedLogEvent, rule: LogRule) -> str:
    if rule.requires_external_dst_ip and event.dst_ip:
        return f"{event.source} -> {event.dst_ip}"
    if event.path:
        return f"{event.method or 'REQUEST'} {event.path}"
    return f"{event.source}: {truncate_middle(event.message, 80)}"


def rule_group_values(event: NormalizedLogEvent, rule: LogRule) -> list[tuple[str, str]]:
    values: list[tuple[str, str]] = []
    for group_name in rule.group_by:
        value = getattr(event, group_name, None)
        if value:
            values.append((group_name, str(value)))
    return values


def severity_for_count(rule: LogRule, count: int) -> str:
    if rule.critical_threshold and count >= rule.critical_threshold:
        return "critical"
    if rule.high_threshold and count >= rule.high_threshold:
        return "high"
    return rule.severity


def window_group_label(group_name: str) -> str:
    if group_name == "src_ip":
        return "来源 IP"
    if group_name == "user":
        return "账号"
    return "来源"


def score_for_severity(severity: str) -> int:
    if severity == "critical":
        return 92
    if severity == "high":
        return 82
    if severity == "medium":
        return 64
    return 38


def is_auth_failure_event(event: NormalizedLogEvent, login_paths: Iterable[str] = LOGIN_PATH_HINTS) -> bool:
    lower = event.message.lower()
    if any(hint in lower for hint in AUTH_FAILURE_HINTS):
        return True
    if event.status == 401 and event.path and any(hint in event.path.lower() for hint in login_paths):
        return True
    return False


def has_egress_hint(text: str) -> bool:
    lower = text.lower()
    return any(token in lower for token in ("egress", "outbound", "connect", "callback", "beacon", "destination"))


def decode_text(text: str) -> str:
    previous = text
    for _ in range(2):
        decoded = unquote_plus(previous)
        if decoded == previous:
            break
        previous = decoded
    return previous


def valid_ip_or_none(value: str | None) -> str | None:
    if not value:
        return None
    try:
        ipaddress.ip_address(value)
    except ValueError:
        return None
    return value


def is_external_ip(value: str) -> bool:
    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        return False
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_unspecified
        or ip.is_reserved
    )


def first_json_value(payload: dict[str, Any], keys: Iterable[str]) -> Any:
    for key in keys:
        if key in payload:
            return payload[key]
    lower_map = {str(key).lower(): value for key, value in payload.items()}
    for key in keys:
        if key.lower() in lower_map:
            return lower_map[key.lower()]
    return None


def stringify(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float, bool)):
        return str(value)
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    except TypeError:
        return str(value)


def safe_int(value: Any) -> int | None:
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return None


def none_if_dash(value: str | None) -> str | None:
    if value in {None, "-", ""}:
        return None
    return value


def truncate_middle(value: str, limit: int) -> str:
    if len(value) <= limit:
        return value
    half = max(20, limit // 2 - 3)
    return f"{value[:half]}...{value[-half:]}"


def risk_severity(score: int) -> str:
    if score >= 90:
        return "critical"
    if score >= 75:
        return "high"
    if score >= 55:
        return "medium"
    return "low"


def finding_fingerprint(*parts: str) -> str:
    raw = "|".join(parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
