"""Artifact provenance and trust gate for release/deploy decisions."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
import base64
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import time
from typing import Any, Iterable

from pydantic import BaseModel, ConfigDict, Field

from .config import ROOT

try:
    import yaml
except Exception:  # pragma: no cover - only used when runtime deps are missing.
    yaml = None  # type: ignore[assignment]


TRUST_POLICY_PATH = ROOT / ".supplyguard" / "trust-policy.yml"
ARTIFACT_TRUST_STATE_DIR = ROOT / "storage" / "artifact_trust"
ARTIFACT_UPLOAD_DIR = ARTIFACT_TRUST_STATE_DIR / "uploads"
DEFAULT_SCAN_TIMEOUT_SECONDS = 30
SLSA_PROVENANCE_V1 = "https://slsa.dev/provenance/v1"


class ArtifactTrustRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    artifact_path: str = Field(default="storage/samples/artifacts/checkout-api.tar.gz", alias="artifactPath")
    attestation_path: str = Field(
        default="storage/samples/attestations/checkout-api.intoto.jsonl",
        alias="attestationPath",
    )
    policy_artifact: str | None = Field(default=None, alias="policyArtifact")
    expected_repo: str | None = Field(default=None, alias="expectedRepo")
    expected_commit: str | None = Field(default=None, alias="expectedCommit")
    allowed_branches: list[str] | None = Field(default=None, alias="allowedBranches")
    allowed_workflows: list[str] | None = Field(default=None, alias="allowedWorkflows")
    allowed_builders: list[str] | None = Field(default=None, alias="allowedBuilders")
    require_signature: bool | None = Field(default=None, alias="requireSignature")
    require_provenance: bool | None = Field(default=None, alias="requireProvenance")
    allow_self_hosted_runner: bool | None = Field(default=None, alias="allowSelfHostedRunner")
    max_age_hours: int | None = Field(default=None, alias="maxAgeHours", ge=1, le=24 * 365)
    subject_name: str | None = Field(default=None, alias="subjectName")
    expected_digest: str | None = Field(default=None, alias="expectedDigest")
    timeout_seconds: int = Field(default=DEFAULT_SCAN_TIMEOUT_SECONDS, alias="timeoutSeconds", ge=5, le=120)


@dataclass(frozen=True)
class ArtifactTrustCheck:
    name: str
    status: str
    evidence: str = ""
    severity: str = "low"
    score: int = 0


@dataclass(frozen=True)
class ArtifactTrustFinding:
    id: str
    title: str
    severity: str
    score: int
    evidence: str
    recommendation: str
    check: str
    fingerprint: str


@dataclass(frozen=True)
class ArtifactTrustToolStatus:
    name: str
    available: bool
    command: str
    state: str
    version: str | None = None
    error: str | None = None


@dataclass(frozen=True)
class ProvenanceInfo:
    statement: dict[str, Any]
    envelope: dict[str, Any] | None
    subject_name: str
    subject_sha256: str
    predicate_type: str
    builder_id: str
    build_type: str
    source_repo: str
    commit: str
    workflow: str
    ref: str
    runner_environment: str
    invocation_id: str
    created_at: str
    raw_subjects: list[dict[str, Any]] = field(default_factory=list)
    external_parameters: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ArtifactTrustResult:
    scan_id: str
    generated_at: str
    artifact: str
    artifact_path: str
    attestation_path: str
    digest: str
    trust_score: int
    level: str
    checks: list[ArtifactTrustCheck]
    findings: list[ArtifactTrustFinding]
    provenance: dict[str, Any]
    policy: dict[str, Any]
    tools: list[ArtifactTrustToolStatus]
    graph_evidence: dict[str, Any]
    summary: dict[str, Any]
    report: str
    warnings: list[str] = field(default_factory=list)


def run_artifact_trust_scan(request: ArtifactTrustRequest | None = None) -> ArtifactTrustResult:
    started_at = time.monotonic()
    payload = request or ArtifactTrustRequest()
    artifact_path = resolve_workspace_path(payload.artifact_path)
    attestation_path = resolve_workspace_path(payload.attestation_path)
    scan_id = datetime.now(UTC).strftime("artifact-trust-%Y%m%d%H%M%S")
    generated_at = datetime.now(UTC).isoformat()
    warnings: list[str] = []

    if not artifact_path.exists() or not artifact_path.is_file():
        raise ValueError(f"Artifact file does not exist: {artifact_path}")
    if not attestation_path.exists() or not attestation_path.is_file():
        raise ValueError(f"Attestation file does not exist: {attestation_path}")

    policy = load_effective_policy(payload, artifact_path, warnings)
    digest_hex = sha256_file(artifact_path)
    digest = f"sha256:{digest_hex}"
    info = parse_provenance(attestation_path)
    tools: list[ArtifactTrustToolStatus] = []
    checks: list[ArtifactTrustCheck] = []

    checks.extend(
        [
            check_digest_matches(digest_hex, info, payload, policy),
            check_predicate_type(info, policy),
            check_source_repository(info, policy),
            check_commit_or_branch(info, policy),
            check_workflow(info, policy),
            check_builder(info, policy),
            check_runner_environment(info, policy),
            check_attestation_age(info, policy),
            check_hash_baseline(digest_hex, policy),
        ]
    )
    signature_check, signature_tools = check_signature(artifact_path, info, policy, payload.timeout_seconds)
    checks.append(signature_check)
    tools.extend(signature_tools)

    findings = findings_from_checks(checks, artifact_path.name)
    trust_score = score_checks(checks)
    level = trust_level(trust_score, findings)
    provenance = serialize_provenance(info)
    graph_evidence = build_graph_evidence(artifact_path.name, digest, info, checks, findings)
    summary = build_summary(checks, findings, trust_score, level, duration_seconds=round(time.monotonic() - started_at, 2))
    report = build_artifact_trust_report(
        artifact_path,
        attestation_path,
        digest,
        trust_score,
        level,
        checks,
        findings,
        provenance,
        policy,
        tools,
    )
    return ArtifactTrustResult(
        scan_id=scan_id,
        generated_at=generated_at,
        artifact=artifact_path.name,
        artifact_path=str(artifact_path),
        attestation_path=str(attestation_path),
        digest=digest,
        trust_score=trust_score,
        level=level,
        checks=checks,
        findings=findings,
        provenance=provenance,
        policy=public_policy(policy),
        tools=tools,
        graph_evidence=graph_evidence,
        summary=summary,
        report=report,
        warnings=warnings,
    )


def resolve_workspace_path(value: str) -> Path:
    candidate = Path(value).expanduser()
    if not candidate.is_absolute():
        candidate = ROOT / candidate
    candidate = candidate.resolve()
    try:
        candidate.relative_to(ROOT.resolve())
    except ValueError as exc:
        raise ValueError(f"Path must stay inside project root: {candidate}") from exc
    return candidate


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_effective_policy(payload: ArtifactTrustRequest, artifact_path: Path, warnings: list[str]) -> dict[str, Any]:
    raw_policy = load_trust_policy(warnings)
    artifacts = raw_policy.get("artifacts") if isinstance(raw_policy.get("artifacts"), dict) else {}
    artifact_policy = {}
    for key in artifact_key_candidates(payload, artifact_path):
        candidate = artifacts.get(key)
        if isinstance(candidate, dict):
            artifact_policy = candidate
            break

    policy = {
        "policy_artifact": payload.policy_artifact or artifact_policy.get("name") or artifact_path.name,
        "expected_repo": payload.expected_repo or artifact_policy.get("expected_repo"),
        "expected_commit": payload.expected_commit or artifact_policy.get("expected_commit"),
        "allowed_branches": payload.allowed_branches
        if payload.allowed_branches is not None
        else list(artifact_policy.get("allowed_branches") or []),
        "allowed_workflows": payload.allowed_workflows
        if payload.allowed_workflows is not None
        else list(artifact_policy.get("allowed_workflows") or []),
        "trusted_builders": payload.allowed_builders
        if payload.allowed_builders is not None
        else list(artifact_policy.get("trusted_builders") or artifact_policy.get("allowed_builders") or []),
        "require_signature": payload.require_signature
        if payload.require_signature is not None
        else bool(artifact_policy.get("require_signature", False)),
        "require_provenance": payload.require_provenance
        if payload.require_provenance is not None
        else bool(artifact_policy.get("require_provenance", True)),
        "allow_self_hosted_runner": payload.allow_self_hosted_runner
        if payload.allow_self_hosted_runner is not None
        else bool(artifact_policy.get("allow_self_hosted_runner", True)),
        "max_age_hours": payload.max_age_hours if payload.max_age_hours is not None else artifact_policy.get("max_age_hours"),
        "subject_name": payload.subject_name or artifact_policy.get("subject_name"),
        "expected_digest": normalize_digest(payload.expected_digest or artifact_policy.get("expected_digest") or ""),
        "hash_baselines": list(
            artifact_policy.get("hash_baselines")
            or artifact_policy.get("known_digests")
            or artifact_policy.get("allowed_digests")
            or []
        ),
        "raw": artifact_policy,
    }
    return policy


def load_trust_policy(warnings: list[str]) -> dict[str, Any]:
    if not TRUST_POLICY_PATH.exists():
        return {"artifacts": {}}
    if yaml is None:
        warnings.append(".supplyguard/trust-policy.yml exists, but PyYAML is not available; using request-only policy.")
        return {"artifacts": {}}
    try:
        payload = yaml.safe_load(TRUST_POLICY_PATH.read_text(encoding="utf-8", errors="replace"))
    except Exception as exc:
        warnings.append(f"Failed to parse .supplyguard/trust-policy.yml: {exc}")
        return {"artifacts": {}}
    return payload if isinstance(payload, dict) else {"artifacts": {}}


def artifact_key_candidates(payload: ArtifactTrustRequest, artifact_path: Path) -> list[str]:
    candidates = [
        payload.policy_artifact or "",
        artifact_path.name,
        artifact_path.stem,
        artifact_path.name.replace(".tar.gz", ""),
        artifact_path.name.replace(".tgz", ""),
    ]
    return stable_unique([candidate for candidate in candidates if candidate])


def parse_provenance(path: Path) -> ProvenanceInfo:
    documents = load_json_documents(path)
    envelopes: list[dict[str, Any]] = []
    for document in documents:
        statement, envelope = extract_statement(document)
        if statement:
            return provenance_info(statement, envelope)
        if envelope:
            envelopes.append(envelope)
    if envelopes:
        raise ValueError("Attestation envelope was found, but its payload could not be decoded as an in-toto statement.")
    raise ValueError("No in-toto/SLSA provenance statement found in attestation file.")


def load_json_documents(path: Path) -> list[dict[str, Any]]:
    text = path.read_text(encoding="utf-8", errors="replace").strip()
    if not text:
        raise ValueError("Attestation file is empty.")
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        documents = []
        for line_number, line in enumerate(text.splitlines(), start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                item = json.loads(stripped)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSONL attestation at line {line_number}: {exc.msg}") from exc
            if isinstance(item, dict):
                documents.append(item)
        if not documents:
            raise ValueError("Attestation JSONL did not contain JSON objects.")
        return documents
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        return [payload]
    raise ValueError("Attestation JSON must be an object, array, or JSONL stream.")


def extract_statement(document: dict[str, Any]) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    if is_statement(document):
        return document, None

    envelope = find_dsse_envelope(document)
    if envelope:
        payload = envelope.get("payload")
        if isinstance(payload, str):
            decoded = decode_json_payload(payload)
            if isinstance(decoded, dict) and is_statement(decoded):
                return decoded, envelope
        return None, envelope

    for value in document.values():
        if isinstance(value, dict):
            statement, nested_envelope = extract_statement(value)
            if statement or nested_envelope:
                return statement, nested_envelope
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    statement, nested_envelope = extract_statement(item)
                    if statement or nested_envelope:
                        return statement, nested_envelope
    return None, None


def is_statement(payload: dict[str, Any]) -> bool:
    return isinstance(payload.get("subject"), list) and "predicateType" in payload and isinstance(payload.get("predicate"), dict)


def find_dsse_envelope(payload: dict[str, Any]) -> dict[str, Any] | None:
    if isinstance(payload.get("payload"), str) and isinstance(payload.get("signatures"), list):
        return payload
    bundle = payload.get("bundle")
    if isinstance(bundle, dict):
        for key in ("dsseEnvelope", "DSSEEnvelope", "envelope"):
            envelope = bundle.get(key)
            if isinstance(envelope, dict) and isinstance(envelope.get("payload"), str):
                return envelope
    for key in ("dsseEnvelope", "DSSEEnvelope", "envelope"):
        envelope = payload.get(key)
        if isinstance(envelope, dict) and isinstance(envelope.get("payload"), str):
            return envelope
    return None


def decode_json_payload(value: str) -> dict[str, Any] | None:
    padded = value + "=" * (-len(value) % 4)
    for decoder in (base64.b64decode, base64.urlsafe_b64decode):
        try:
            raw = decoder(padded.encode("utf-8"))
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            continue
        if isinstance(payload, dict):
            return payload
    return None


def provenance_info(statement: dict[str, Any], envelope: dict[str, Any] | None) -> ProvenanceInfo:
    predicate = statement.get("predicate") if isinstance(statement.get("predicate"), dict) else {}
    build_definition = predicate.get("buildDefinition") if isinstance(predicate.get("buildDefinition"), dict) else {}
    run_details = predicate.get("runDetails") if isinstance(predicate.get("runDetails"), dict) else {}
    external = build_definition.get("externalParameters") if isinstance(build_definition.get("externalParameters"), dict) else {}
    internal = build_definition.get("internalParameters") if isinstance(build_definition.get("internalParameters"), dict) else {}
    subjects = [item for item in statement.get("subject", []) if isinstance(item, dict)]
    subject = subjects[0] if subjects else {}
    digest = subject.get("digest") if isinstance(subject.get("digest"), dict) else {}
    builder = first_dict(run_details.get("builder"), predicate.get("builder"))

    return ProvenanceInfo(
        statement=statement,
        envelope=envelope,
        subject_name=str(subject.get("name") or ""),
        subject_sha256=normalize_digest(str(digest.get("sha256") or "")),
        predicate_type=str(statement.get("predicateType") or ""),
        builder_id=str(builder.get("id") or ""),
        build_type=str(build_definition.get("buildType") or predicate.get("buildType") or ""),
        source_repo=extract_repo(statement, external, internal),
        commit=extract_commit(statement),
        workflow=extract_workflow(external, internal, statement),
        ref=extract_ref(statement, external, internal),
        runner_environment=extract_runner_environment(statement),
        invocation_id=extract_invocation_id(run_details, predicate),
        created_at=extract_created_at(statement),
        raw_subjects=subjects,
        external_parameters=external,
    )


def first_dict(*values: Any) -> dict[str, Any]:
    for value in values:
        if isinstance(value, dict):
            return value
    return {}


def extract_repo(statement: dict[str, Any], external: dict[str, Any], internal: dict[str, Any]) -> str:
    workflow = external.get("workflow") if isinstance(external.get("workflow"), dict) else {}
    github_external = external.get("github") if isinstance(external.get("github"), dict) else {}
    github_internal = internal.get("github") if isinstance(internal.get("github"), dict) else {}
    candidates = [
        workflow.get("repository"),
        external.get("repository"),
        github_external.get("repository"),
        github_internal.get("repository"),
    ]
    for value in candidates:
        if value:
            return normalize_repo_url(str(value))

    for item in deep_values(statement):
        if not isinstance(item, str):
            continue
        repo = repo_from_text(item)
        if repo:
            return normalize_repo_url(repo)
    return ""


def extract_commit(statement: dict[str, Any]) -> str:
    key_matches: list[str] = []
    for key, value in deep_items(statement):
        if not isinstance(value, str):
            continue
        if "commit" in key.lower() or key in {"sha", "sha1"}:
            match = re.search(r"\b[0-9a-f]{7,40}\b", value, re.IGNORECASE)
            if match:
                key_matches.append(match.group(0))
    if key_matches:
        return key_matches[0]
    for item in deep_values(statement):
        if isinstance(item, str):
            match = re.search(r"[@/:]([0-9a-f]{40})(?:\b|$)", item, re.IGNORECASE)
            if match:
                return match.group(1)
    return ""


def extract_workflow(external: dict[str, Any], internal: dict[str, Any], statement: dict[str, Any]) -> str:
    workflow = external.get("workflow") if isinstance(external.get("workflow"), dict) else {}
    github_internal = internal.get("github") if isinstance(internal.get("github"), dict) else {}
    candidates = [
        workflow.get("path"),
        external.get("workflow_path"),
        external.get("workflow"),
        github_internal.get("workflow_ref"),
        github_internal.get("job_workflow_ref"),
    ]
    for value in candidates:
        path = workflow_path_from_text(value)
        if path:
            return path
    for item in deep_values(statement):
        path = workflow_path_from_text(item)
        if path:
            return path
    return ""


def extract_ref(statement: dict[str, Any], external: dict[str, Any], internal: dict[str, Any]) -> str:
    workflow = external.get("workflow") if isinstance(external.get("workflow"), dict) else {}
    github_internal = internal.get("github") if isinstance(internal.get("github"), dict) else {}
    candidates = [
        workflow.get("ref"),
        external.get("ref"),
        github_internal.get("ref"),
        github_internal.get("workflow_ref"),
        github_internal.get("job_workflow_ref"),
    ]
    for value in candidates:
        ref = ref_from_text(value)
        if ref:
            return ref
    for item in deep_values(statement):
        ref = ref_from_text(item)
        if ref:
            return ref
    return ""


def extract_runner_environment(statement: dict[str, Any]) -> str:
    for key, value in deep_items(statement):
        if not isinstance(value, str):
            continue
        normalized_key = key.lower().replace("-", "_")
        if normalized_key in {"runner_environment", "runner_environment_name", "runner"}:
            return value
    return ""


def extract_invocation_id(run_details: dict[str, Any], predicate: dict[str, Any]) -> str:
    metadata = run_details.get("metadata") if isinstance(run_details.get("metadata"), dict) else {}
    predicate_metadata = predicate.get("metadata") if isinstance(predicate.get("metadata"), dict) else {}
    return str(metadata.get("invocationId") or predicate_metadata.get("buildInvocationId") or "")


def extract_created_at(statement: dict[str, Any]) -> str:
    for key, value in deep_items(statement):
        if not isinstance(value, str):
            continue
        key_lower = key.lower()
        if key_lower in {"startedon", "finishedon", "buildstartedon", "buildfinishedon"}:
            if parse_datetime(value):
                return value
    return ""


def repo_from_text(value: str) -> str:
    patterns = [
        r"https://github\.com/([^/\s]+/[^/@\s]+)",
        r"git\+https://github\.com/([^/\s]+/[^/@\s]+)",
        r"git@github\.com:([^/\s]+/[^/@\s]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, value)
        if match:
            return f"https://github.com/{match.group(1)}"
    return ""


def workflow_path_from_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    match = re.search(r"(\.github/workflows/[^@\s\"']+\.ya?ml)", value)
    if match:
        return match.group(1)
    if value.startswith(".github/workflows/"):
        return value.split("@", 1)[0]
    return ""


def ref_from_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    match = re.search(r"(refs/(?:heads|tags|pull)/[^@\s\"']+)", value)
    if match:
        return match.group(1)
    return value if value.startswith("refs/") else ""


def deep_items(payload: Any, parent_key: str = "") -> Iterable[tuple[str, Any]]:
    if isinstance(payload, dict):
        for key, value in payload.items():
            key_text = str(key)
            yield key_text, value
            yield from deep_items(value, key_text)
    elif isinstance(payload, list):
        for item in payload:
            yield from deep_items(item, parent_key)


def deep_values(payload: Any) -> Iterable[Any]:
    if isinstance(payload, dict):
        for value in payload.values():
            yield value
            yield from deep_values(value)
    elif isinstance(payload, list):
        for item in payload:
            yield item
            yield from deep_values(item)


def check_digest_matches(
    digest_hex: str,
    info: ProvenanceInfo,
    payload: ArtifactTrustRequest,
    policy: dict[str, Any],
) -> ArtifactTrustCheck:
    expected_digest = normalize_digest(payload.expected_digest or policy.get("expected_digest") or "")
    attested = normalize_digest(info.subject_sha256)
    if expected_digest and digest_hex != expected_digest:
        return ArtifactTrustCheck(
            "artifact_digest_matches_expected",
            "fail",
            f"artifact sha256:{digest_hex} does not match expected sha256:{expected_digest}",
            "critical",
            96,
        )
    if not attested:
        status = "fail" if policy.get("require_provenance") else "missing"
        return ArtifactTrustCheck(
            "artifact_digest_matches_subject",
            status,
            "attestation.subject.digest.sha256 is missing",
            "critical" if status == "fail" else "medium",
            92 if status == "fail" else 66,
        )
    if digest_hex == attested:
        return ArtifactTrustCheck(
            "artifact_digest_matches_subject",
            "pass",
            f"artifact sha256:{digest_hex} matches attestation subject",
        )
    return ArtifactTrustCheck(
        "artifact_digest_matches_subject",
        "fail",
        f"artifact sha256:{digest_hex} != attestation subject sha256:{attested}",
        "critical",
        98,
    )


def check_predicate_type(info: ProvenanceInfo, policy: dict[str, Any]) -> ArtifactTrustCheck:
    if info.predicate_type == SLSA_PROVENANCE_V1:
        return ArtifactTrustCheck("provenance_predicate_type_slsa", "pass", info.predicate_type)
    if not info.predicate_type:
        status = "fail" if policy.get("require_provenance") else "missing"
        return ArtifactTrustCheck("provenance_predicate_type_slsa", status, "predicateType is missing", "high", 84)
    return ArtifactTrustCheck(
        "provenance_predicate_type_slsa",
        "fail",
        f"predicateType is {info.predicate_type}, expected {SLSA_PROVENANCE_V1}",
        "high",
        84,
    )


def check_source_repository(info: ProvenanceInfo, policy: dict[str, Any]) -> ArtifactTrustCheck:
    expected = normalize_repo_url(str(policy.get("expected_repo") or ""))
    actual = normalize_repo_url(info.source_repo)
    if not expected:
        return ArtifactTrustCheck("source_repository_allowed", "skipped", "No expected_repo configured.")
    if not actual:
        return ArtifactTrustCheck("source_repository_allowed", "missing", "Provenance does not claim a source repository.", "high", 82)
    if repo_key(actual) == repo_key(expected):
        return ArtifactTrustCheck("source_repository_allowed", "pass", actual)
    return ArtifactTrustCheck(
        "source_repository_allowed",
        "fail",
        f"source repository {actual} does not match expected {expected}",
        "critical",
        94,
    )


def check_commit_or_branch(info: ProvenanceInfo, policy: dict[str, Any]) -> ArtifactTrustCheck:
    expected_commit = str(policy.get("expected_commit") or "").strip()
    allowed_branches = [str(item) for item in policy.get("allowed_branches") or []]
    if expected_commit:
        if not info.commit:
            return ArtifactTrustCheck("commit_matches_expected", "missing", "Provenance does not claim a source commit.", "high", 82)
        if commit_matches(info.commit, expected_commit):
            return ArtifactTrustCheck("commit_matches_expected", "pass", info.commit)
        return ArtifactTrustCheck(
            "commit_matches_expected",
            "fail",
            f"provenance commit {info.commit} does not match expected {expected_commit}",
            "critical",
            93,
        )
    if allowed_branches:
        if info.ref in allowed_branches:
            return ArtifactTrustCheck("commit_or_branch_allowed", "pass", info.ref)
        if not info.ref:
            return ArtifactTrustCheck("commit_or_branch_allowed", "missing", "Provenance does not claim a branch/ref.", "medium", 68)
        return ArtifactTrustCheck(
            "commit_or_branch_allowed",
            "fail",
            f"provenance ref {info.ref} is not in allowed branches",
            "high",
            85,
        )
    return ArtifactTrustCheck("commit_or_branch_allowed", "skipped", "No expected_commit or allowed_branches configured.")


def check_workflow(info: ProvenanceInfo, policy: dict[str, Any]) -> ArtifactTrustCheck:
    allowed = [normalize_workflow(str(item)) for item in policy.get("allowed_workflows") or [] if item]
    actual = normalize_workflow(info.workflow)
    if not allowed:
        return ArtifactTrustCheck("workflow_allowed", "skipped", "No allowed_workflows configured.")
    if not actual:
        return ArtifactTrustCheck("workflow_allowed", "missing", "Provenance does not claim a workflow path.", "medium", 68)
    if actual in allowed:
        return ArtifactTrustCheck("workflow_allowed", "pass", actual)
    return ArtifactTrustCheck("workflow_allowed", "fail", f"workflow {actual} is not allowed", "high", 86)


def check_builder(info: ProvenanceInfo, policy: dict[str, Any]) -> ArtifactTrustCheck:
    allowed = [str(item).rstrip("/") for item in policy.get("trusted_builders") or [] if item]
    actual = info.builder_id.rstrip("/")
    if not allowed:
        return ArtifactTrustCheck("builder_trusted", "warn", "No trusted_builders configured.", "medium", 62)
    if not actual:
        return ArtifactTrustCheck("builder_trusted", "missing", "Provenance does not claim builder.id.", "high", 84)
    if any(actual == builder or actual.startswith(f"{builder}/") for builder in allowed):
        return ArtifactTrustCheck("builder_trusted", "pass", actual)
    return ArtifactTrustCheck("builder_trusted", "fail", f"builder.id {actual} is not trusted", "critical", 92)


def check_runner_environment(info: ProvenanceInfo, policy: dict[str, Any]) -> ArtifactTrustCheck:
    runner = info.runner_environment.lower()
    builder = info.builder_id.lower()
    self_hosted = "self-hosted" in runner or "self_hosted" in runner or "self-hosted" in builder
    if not info.runner_environment:
        return ArtifactTrustCheck("runner_environment_trusted", "warn", "Runner environment is not present in provenance.", "medium", 60)
    if self_hosted and not policy.get("allow_self_hosted_runner", True):
        return ArtifactTrustCheck(
            "runner_environment_trusted",
            "fail",
            f"self-hosted runner is not allowed by policy: {info.runner_environment}",
            "high",
            87,
        )
    return ArtifactTrustCheck("runner_environment_trusted", "pass", info.runner_environment)


def check_attestation_age(info: ProvenanceInfo, policy: dict[str, Any]) -> ArtifactTrustCheck:
    max_age = policy.get("max_age_hours")
    if not max_age:
        return ArtifactTrustCheck("attestation_max_age", "skipped", "No max_age_hours configured.")
    created = parse_datetime(info.created_at)
    if created is None:
        return ArtifactTrustCheck("attestation_max_age", "missing", "Provenance does not include startedOn/finishedOn metadata.", "medium", 64)
    age = datetime.now(UTC) - created
    if age <= timedelta(hours=int(max_age)):
        return ArtifactTrustCheck("attestation_max_age", "pass", f"attestation age is {round(age.total_seconds() / 3600, 2)} hours")
    return ArtifactTrustCheck(
        "attestation_max_age",
        "fail",
        f"attestation age {round(age.total_seconds() / 3600, 2)} hours exceeds policy max_age_hours={max_age}",
        "medium",
        70,
    )


def check_hash_baseline(digest_hex: str, policy: dict[str, Any]) -> ArtifactTrustCheck:
    baselines = [normalize_digest(str(item)) for item in policy.get("hash_baselines") or [] if item]
    if not baselines:
        return ArtifactTrustCheck("artifact_hash_baseline", "skipped", "No historical hash baseline configured.")
    if digest_hex in baselines:
        return ArtifactTrustCheck("artifact_hash_baseline", "pass", "Artifact digest exists in policy hash baseline.")
    return ArtifactTrustCheck(
        "artifact_hash_baseline",
        "warn",
        "Artifact digest is not in the historical hash baseline.",
        "medium",
        66,
    )


def check_signature(
    artifact_path: Path,
    info: ProvenanceInfo,
    policy: dict[str, Any],
    timeout_seconds: int,
) -> tuple[ArtifactTrustCheck, list[ArtifactTrustToolStatus]]:
    tools = [tool_status("gh"), tool_status("cosign")]
    require_signature = bool(policy.get("require_signature"))
    repo = repo_owner_name(policy.get("expected_repo") or info.source_repo)
    envelope_signature_count = len(info.envelope.get("signatures") or []) if isinstance(info.envelope, dict) else 0

    if repo and tools[0].available:
        result = run_command(
            ["gh", "attestation", "verify", str(artifact_path), "-R", repo, "--format", "json"],
            timeout_seconds,
        )
        tools[0] = ArtifactTrustToolStatus(
            name="gh",
            available=True,
            command="gh attestation verify",
            state="ok" if result.returncode == 0 else "failed",
            version=tools[0].version,
            error=None if result.returncode == 0 else short_text(result.stderr or result.stdout, 240),
        )
        if result.returncode == 0:
            return ArtifactTrustCheck("signature_verified", "pass", "gh attestation verify completed successfully."), tools
        return (
            ArtifactTrustCheck(
                "signature_verified",
                "fail" if require_signature else "warn",
                short_text(result.stderr or result.stdout or "gh attestation verify failed.", 260),
                "high" if require_signature else "medium",
                88 if require_signature else 64,
            ),
            tools,
        )

    image_reference = str(policy.get("subject_name") or info.subject_name or "")
    if is_image_reference(image_reference) and tools[1].available:
        target = image_reference.removeprefix("oci://")
        result = run_command(["cosign", "verify-attestation", target], timeout_seconds)
        tools[1] = ArtifactTrustToolStatus(
            name="cosign",
            available=True,
            command="cosign verify-attestation",
            state="ok" if result.returncode == 0 else "failed",
            version=tools[1].version,
            error=None if result.returncode == 0 else short_text(result.stderr or result.stdout, 240),
        )
        if result.returncode == 0:
            return ArtifactTrustCheck("signature_verified", "pass", "cosign verify-attestation completed successfully."), tools
        return (
            ArtifactTrustCheck(
                "signature_verified",
                "fail" if require_signature else "warn",
                short_text(result.stderr or result.stdout or "cosign verify-attestation failed.", 260),
                "high" if require_signature else "medium",
                88 if require_signature else 64,
            ),
            tools,
        )

    if envelope_signature_count:
        evidence = f"DSSE envelope contains {envelope_signature_count} signature(s), but gh/cosign verification is unavailable or not applicable."
    else:
        evidence = "No verified gh/cosign attestation signature result was found."
    return (
        ArtifactTrustCheck(
            "signature_verified",
            "missing" if require_signature else "skipped",
            evidence,
            "medium" if require_signature else "low",
            72 if require_signature else 0,
        ),
        tools,
    )


def tool_status(name: str) -> ArtifactTrustToolStatus:
    path = shutil.which(name)
    if not path:
        return ArtifactTrustToolStatus(name=name, available=False, command=name, state="missing", error="Tool is not installed.")
    result = run_command([name, "--version"], 8)
    version = first_line(result.stdout or result.stderr)
    return ArtifactTrustToolStatus(
        name=name,
        available=True,
        command=name,
        state="ok" if result.returncode == 0 else "partial",
        version=version or None,
        error=None if result.returncode == 0 else short_text(result.stderr or result.stdout, 160),
    )


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
            capture_output=True,
            timeout=timeout_seconds,
            check=False,
        )
    except FileNotFoundError as exc:
        return CommandResult(127, "", str(exc))
    except subprocess.TimeoutExpired as exc:
        return CommandResult(124, exc.stdout or "", exc.stderr or f"Command timed out after {timeout_seconds}s.")
    return CommandResult(result.returncode, result.stdout or "", result.stderr or "")


def findings_from_checks(checks: list[ArtifactTrustCheck], artifact_name: str) -> list[ArtifactTrustFinding]:
    findings: list[ArtifactTrustFinding] = []
    for check in checks:
        if check.status not in {"fail", "warn", "missing"}:
            continue
        title = finding_title(check)
        recommendation = finding_recommendation(check)
        fingerprint = stable_fingerprint(artifact_name, check.name, check.status, check.evidence)
        findings.append(
            ArtifactTrustFinding(
                id=f"ART-{fingerprint[:8].upper()}",
                title=title,
                severity=normalize_severity(check.severity),
                score=check.score or score_from_severity(check.severity),
                evidence=check.evidence,
                recommendation=recommendation,
                check=check.name,
                fingerprint=fingerprint,
            )
        )
    return sorted(findings, key=lambda item: (-item.score, item.title))


def finding_title(check: ArtifactTrustCheck) -> str:
    titles = {
        "artifact_digest_matches_subject": "产物 digest 与 attestation subject 不一致或缺失",
        "artifact_digest_matches_expected": "产物 digest 不符合预期策略",
        "provenance_predicate_type_slsa": "provenance predicateType 不是 SLSA v1",
        "source_repository_allowed": "产物来源仓库不可信",
        "commit_matches_expected": "产物来源 commit 不符合预期",
        "commit_or_branch_allowed": "产物来源分支不在允许列表",
        "workflow_allowed": "产物构建 workflow 不在允许列表",
        "builder_trusted": "产物 builder 身份不可信",
        "runner_environment_trusted": "runner 环境不符合策略",
        "attestation_max_age": "attestation 超出策略时效",
        "artifact_hash_baseline": "产物 hash 命中历史基线异常",
        "signature_verified": "产物缺少可验证签名" if check.status == "missing" else "产物签名验签未通过",
    }
    return titles.get(check.name, f"产物可信检查异常：{check.name}")


def finding_recommendation(check: ArtifactTrustCheck) -> str:
    if check.name == "signature_verified":
        return "安装并配置 gh/cosign 验签，或在发布门禁中强制执行 GitHub artifact attestation verify。"
    if check.name == "artifact_digest_matches_subject":
        return "阻断发布，重新获取产物与 provenance，确认 subject digest 指向当前产物。"
    if check.name == "source_repository_allowed":
        return "仅允许官方仓库和受保护分支生成发布产物，拒绝 fork 或未知仓库 provenance。"
    if check.name == "builder_trusted":
        return "把 builder.id 纳入企业根信任列表，未知 builder 生成的产物需要重新构建。"
    if check.name == "workflow_allowed":
        return "将发布产物限定为受审计 release workflow 生成。"
    return "按 .supplyguard/trust-policy.yml 复核策略并重新生成可信 provenance。"


def score_checks(checks: list[ArtifactTrustCheck]) -> int:
    score = 100
    for check in checks:
        if check.status == "fail":
            if check.severity == "critical":
                score -= 28
            elif check.severity == "high":
                score -= 20
            elif check.severity == "medium":
                score -= 12
            else:
                score -= 6
        elif check.status == "warn":
            score -= 8
        elif check.status == "missing":
            score -= 16 if check.severity in {"critical", "high", "medium"} else 8
    return max(0, min(100, score))


def trust_level(score: int, findings: list[ArtifactTrustFinding]) -> str:
    if any(finding.severity == "critical" for finding in findings):
        return "critical"
    if score >= 90 and not findings:
        return "trusted"
    if score >= 75:
        return "warning"
    if score >= 55:
        return "danger"
    return "critical"


def build_summary(
    checks: list[ArtifactTrustCheck],
    findings: list[ArtifactTrustFinding],
    trust_score: int,
    level: str,
    *,
    duration_seconds: float,
) -> dict[str, Any]:
    status_counts: dict[str, int] = {}
    severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for check in checks:
        status_counts[check.status] = status_counts.get(check.status, 0) + 1
    for finding in findings:
        severity_counts[finding.severity] = severity_counts.get(finding.severity, 0) + 1
    risk_score = max([finding.score for finding in findings] + [max(0, 100 - trust_score)])
    return {
        "check_count": len(checks),
        "finding_count": len(findings),
        "trust_score": trust_score,
        "level": level,
        "risk_score": risk_score,
        "risk_level": severity_from_score(risk_score),
        "passed": status_counts.get("pass", 0),
        "failed": status_counts.get("fail", 0),
        "warnings": status_counts.get("warn", 0),
        "missing": status_counts.get("missing", 0),
        "skipped": status_counts.get("skipped", 0),
        "critical": severity_counts["critical"],
        "high": severity_counts["high"],
        "medium": severity_counts["medium"],
        "low": severity_counts["low"],
        "duration_seconds": duration_seconds,
    }


def build_graph_evidence(
    artifact: str,
    digest: str,
    info: ProvenanceInfo,
    checks: list[ArtifactTrustCheck],
    findings: list[ArtifactTrustFinding],
) -> dict[str, Any]:
    nodes = [
        {"id": "artifact", "type": "BuildArtifact", "label": artifact, "digest": digest},
        {"id": "attestation", "type": "Attestation", "label": info.subject_name or "provenance attestation"},
        {"id": "builder", "type": "TrustedBuilder", "label": info.builder_id or "unknown builder"},
        {"id": "workflow", "type": "Workflow", "label": info.workflow or "unknown workflow"},
        {"id": "commit", "type": "SourceCommit", "label": info.commit or info.ref or "unknown source"},
    ]
    nodes.extend(
        {"id": finding.id, "type": "TrustFinding", "label": finding.title, "severity": finding.severity}
        for finding in findings
    )
    edges = [
        {"source": "artifact", "target": "attestation", "type": "ARTIFACT_ATTESTED_BY"},
        {"source": "attestation", "target": "commit", "type": "ATTESTATION_CLAIMS_SOURCE"},
        {"source": "attestation", "target": "builder", "type": "ATTESTATION_CLAIMS_BUILDER"},
        {"source": "workflow", "target": "artifact", "type": "WORKFLOW_PRODUCES_ARTIFACT"},
    ]
    edges.extend({"source": finding.id, "target": "artifact", "type": "TRUST_FINDING_AFFECTS_ARTIFACT"} for finding in findings)
    return {
        "nodes": nodes,
        "edges": edges,
        "checks": [{"name": check.name, "status": check.status, "evidence": check.evidence} for check in checks],
    }


def build_artifact_trust_report(
    artifact_path: Path,
    attestation_path: Path,
    digest: str,
    trust_score: int,
    level: str,
    checks: list[ArtifactTrustCheck],
    findings: list[ArtifactTrustFinding],
    provenance: dict[str, Any],
    policy: dict[str, Any],
    tools: list[ArtifactTrustToolStatus],
) -> str:
    check_rows = "\n".join(
        f"| {check.name} | {check.status} | {check.severity} | {markdown_cell(check.evidence or '-')} |"
        for check in checks
    )
    finding_rows = "\n".join(
        f"| {finding.id} | {finding.severity} | {finding.score} | {markdown_cell(finding.title)} | {markdown_cell(finding.evidence)} |"
        for finding in findings
    )
    tool_rows = "\n".join(
        f"| {tool.name} | {'yes' if tool.available else 'no'} | {tool.state} | {markdown_cell(tool.version or '-')} | {markdown_cell(tool.error or '-')} |"
        for tool in tools
    )
    return f"""# 产物可信验证报告

生成时间：{datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC")}

## 摘要

- 产物：{artifact_path.name}
- 产物路径：{artifact_path}
- Attestation：{attestation_path}
- SHA256：{digest}
- 可信评分：{trust_score} / 100
- 可信等级：{level}
- 来源仓库：{provenance.get('source_repo') or '-'}
- Commit / Ref：{provenance.get('commit') or provenance.get('ref') or '-'}
- Workflow：{provenance.get('workflow') or '-'}
- Builder：{provenance.get('builder_id') or '-'}

## 策略

- expected_repo：{policy.get('expected_repo') or '-'}
- allowed_branches：{', '.join(policy.get('allowed_branches') or []) or '-'}
- allowed_workflows：{', '.join(policy.get('allowed_workflows') or []) or '-'}
- trusted_builders：{', '.join(policy.get('trusted_builders') or []) or '-'}
- require_signature：{policy.get('require_signature')}
- require_provenance：{policy.get('require_provenance')}
- allow_self_hosted_runner：{policy.get('allow_self_hosted_runner')}
- max_age_hours：{policy.get('max_age_hours') or '-'}

## 检查项

| 检查 | 状态 | 等级 | 证据 |
| --- | --- | --- | --- |
{check_rows}

## 风险发现

| 编号 | 等级 | 评分 | 标题 | 证据 |
| --- | --- | ---: | --- | --- |
{finding_rows or '| - | - | 0 | 暂无风险发现 | - |'}

## 验签工具

| 工具 | 可用 | 状态 | 版本 | 说明 |
| --- | --- | --- | --- | --- |
{tool_rows}

## 参考

- GitHub Artifact Attestations: https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations
- SLSA verifying artifacts: https://slsa.dev/spec/v1.2/verifying-artifacts
- Sigstore Cosign verify: https://docs.sigstore.dev/cosign/verifying/verify/
"""


def serialize_artifact_trust(result: ArtifactTrustResult | None) -> dict[str, Any] | None:
    if result is None:
        return None
    return {
        "scan_id": result.scan_id,
        "generated_at": result.generated_at,
        "artifact": result.artifact,
        "artifact_path": result.artifact_path,
        "attestation_path": result.attestation_path,
        "digest": result.digest,
        "trustScore": result.trust_score,
        "trust_score": result.trust_score,
        "level": result.level,
        "checks": [item.__dict__ for item in result.checks],
        "findings": [item.__dict__ for item in result.findings],
        "provenance": result.provenance,
        "policy": result.policy,
        "tools": [item.__dict__ for item in result.tools],
        "graphEvidence": result.graph_evidence,
        "graph_evidence": result.graph_evidence,
        "summary": result.summary,
        "report": result.report,
        "warnings": result.warnings,
    }


def empty_artifact_trust_payload() -> dict[str, Any]:
    return {
        "scan_id": None,
        "artifact": "",
        "digest": "",
        "trustScore": 0,
        "trust_score": 0,
        "level": "unknown",
        "checks": [],
        "findings": [],
        "provenance": {},
        "policy": public_policy(load_trust_policy([])),
        "tools": [],
        "graphEvidence": {"nodes": [], "edges": []},
        "graph_evidence": {"nodes": [], "edges": []},
        "summary": {
            "check_count": 0,
            "finding_count": 0,
            "trust_score": 0,
            "level": "unknown",
            "risk_score": 0,
            "risk_level": "low",
            "passed": 0,
            "failed": 0,
            "warnings": 0,
            "missing": 0,
            "skipped": 0,
        },
        "report": "# 产物可信验证报告\n\n尚未执行产物可信验证。",
        "warnings": [],
    }


def save_upload_file(filename: str, content: bytes, *, prefix: str) -> Path:
    ARTIFACT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = safe_filename(filename or f"{prefix}.bin")
    path = ARTIFACT_UPLOAD_DIR / f"{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}-{prefix}-{safe_name}"
    path.write_bytes(content)
    return path


def public_policy(policy: dict[str, Any]) -> dict[str, Any]:
    if "artifacts" in policy:
        return policy
    return {key: value for key, value in policy.items() if key != "raw"}


def serialize_provenance(info: ProvenanceInfo) -> dict[str, Any]:
    return {
        "subject_name": info.subject_name,
        "subject_digest": f"sha256:{info.subject_sha256}" if info.subject_sha256 else "",
        "predicateType": info.predicate_type,
        "predicate_type": info.predicate_type,
        "builder_id": info.builder_id,
        "build_type": info.build_type,
        "source_repo": info.source_repo,
        "commit": info.commit,
        "workflow": info.workflow,
        "ref": info.ref,
        "runner_environment": info.runner_environment,
        "invocation_id": info.invocation_id,
        "created_at": info.created_at,
        "subject": info.raw_subjects,
        "external_parameters": info.external_parameters,
        "has_envelope": info.envelope is not None,
        "envelope_signature_count": len(info.envelope.get("signatures") or []) if isinstance(info.envelope, dict) else 0,
    }


def normalize_digest(value: str) -> str:
    text = str(value or "").strip().lower()
    if text.startswith("sha256:"):
        text = text.split(":", 1)[1]
    return text if re.fullmatch(r"[0-9a-f]{64}", text) else text


def normalize_repo_url(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if text.startswith("git@github.com:"):
        text = "https://github.com/" + text.split(":", 1)[1]
    if text.startswith("git+"):
        text = text[4:]
    text = text.removesuffix(".git").rstrip("/")
    if re.fullmatch(r"[^/\s]+/[^/\s]+", text):
        text = f"https://github.com/{text}"
    return text


def repo_key(value: str) -> str:
    text = normalize_repo_url(value).lower()
    match = re.search(r"github\.com/([^/\s]+/[^/\s]+)$", text)
    return match.group(1).removesuffix(".git") if match else text


def repo_owner_name(value: str) -> str:
    key = repo_key(value)
    return key if "/" in key and not key.startswith("http") else ""


def normalize_workflow(value: str) -> str:
    return str(value or "").strip().replace("\\", "/").split("@", 1)[0]


def commit_matches(actual: str, expected: str) -> bool:
    left = actual.lower()
    right = expected.lower()
    return left == right or left.startswith(right) or right.startswith(left)


def is_image_reference(value: str) -> bool:
    text = str(value or "")
    return text.startswith("oci://") or "@sha256:" in text or ("/" in text and ":" in text and not Path(text).exists())


def parse_datetime(value: str) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def normalize_severity(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"critical", "high", "medium", "low"}:
        return normalized
    return "low"


def severity_from_score(score: int) -> str:
    if score >= 90:
        return "critical"
    if score >= 75:
        return "high"
    if score >= 55:
        return "medium"
    return "low"


def score_from_severity(severity: str) -> int:
    normalized = normalize_severity(severity)
    if normalized == "critical":
        return 92
    if normalized == "high":
        return 82
    if normalized == "medium":
        return 64
    return 35


def stable_fingerprint(*parts: Any) -> str:
    return hashlib.sha256("|".join(str(part or "") for part in parts).encode("utf-8")).hexdigest()


def stable_unique(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def markdown_cell(value: Any) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ")


def short_text(value: Any, limit: int) -> str:
    text = str(value or "").replace("\n", " ").strip()
    if len(text) <= limit:
        return text
    return f"{text[: max(20, limit - 3)]}..."


def first_line(value: str) -> str:
    return next((line.strip() for line in value.splitlines() if line.strip()), "")


def safe_filename(value: str) -> str:
    name = Path(value).name
    return re.sub(r"[^A-Za-z0-9_.-]+", "-", name).strip(".-") or "upload.bin"
