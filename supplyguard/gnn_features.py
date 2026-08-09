from __future__ import annotations

import json
import re
from typing import Any, Iterable


FEATURE_CONTRACT = "runtime_package_features_v3"
FEATURE_NAMES = [
    "ecosystem_npm",
    "ecosystem_pypi",
    "name_length",
    "name_separator_count",
    "has_scope",
    "has_digits",
    "risk_keyword_count",
]

LABEL_PROXY_KEYWORDS = ("malicious", "malware")
RISK_KEYWORDS = (
    "postinstall",
    "preinstall",
    "install script",
    "download",
    "exfiltrat",
    "token",
    "credential",
    "backdoor",
    "powershell",
    "eval",
    "obfuscat",
)
INSTALL_SCRIPT_KEYS = {"preinstall", "install", "postinstall"}
INSTALL_SCRIPT_KEYWORDS = ("postinstall", "preinstall", "install script")
RISK_KEYWORD_PATTERNS = tuple(
    re.compile(rf"(?<![a-z0-9-]){re.escape(keyword)}(?![a-z0-9-])", re.IGNORECASE)
    for keyword in RISK_KEYWORDS
)


def normalize_ecosystem(value: Any) -> str:
    text = str(value or "").strip().lower()
    if text in {"npm", "pypi"}:
        return text
    return text or "generic"


def normalize_package_name(value: Any, ecosystem: str) -> str:
    package = str(value or "").strip().lower()
    if ecosystem == "pypi":
        package = re.sub(r"[-_.]+", "-", package)
    return package


def risk_signals(text: str) -> list[str]:
    return [
        keyword
        for keyword, pattern in zip(RISK_KEYWORDS, RISK_KEYWORD_PATTERNS)
        if pattern.search(text or "")
    ]


def _maintainer_count(value: Any) -> float:
    if isinstance(value, list):
        return float(len([item for item in value if item]))
    if isinstance(value, dict):
        return 1.0 if value else 0.0
    return 0.0


def _dependency_count(value: Any) -> float:
    if isinstance(value, list):
        return float(len(value))
    if isinstance(value, dict):
        return float(len(value))
    return 0.0


def _flag(value: Any) -> float:
    return 1.0 if value not in (None, "", [], {}, ()) else 0.0


def _has_license(value: Any) -> float:
    if value is None:
        return 0.0
    text = str(value).strip().upper()
    return 0.0 if text in {"", "UNKNOWN", "NONE"} else 1.0


def _has_install_script(install_scripts: Any, scripts: Any, text: str) -> float:
    for value in (install_scripts, scripts):
        if isinstance(value, dict) and any(key in INSTALL_SCRIPT_KEYS for key in value):
            return 1.0
        if isinstance(value, (list, tuple)) and value:
            return 1.0
        if isinstance(value, str) and value.strip():
            return 1.0
    lowered = (text or "").casefold()
    return 1.0 if any(keyword in lowered for keyword in INSTALL_SCRIPT_KEYWORDS) else 0.0


def package_feature_values(
    *,
    ecosystem: Any,
    package: Any,
    version: Any = "",
    aliases: Iterable[Any] = (),
    evidence_sources: Iterable[Any] = (),
    evidence_text: Any = "",
    maintainers: Any = None,
    dependencies: Any = None,
    repository: Any = None,
    homepage: Any = None,
    license: Any = None,
    install_scripts: Any = None,
    scripts: Any = None,
) -> dict[str, float]:
    normalized_ecosystem = normalize_ecosystem(ecosystem)
    normalized_package = normalize_package_name(package, normalized_ecosystem)
    text = _text(evidence_text)
    return {
        "ecosystem_npm": 1.0 if normalized_ecosystem == "npm" else 0.0,
        "ecosystem_pypi": 1.0 if normalized_ecosystem == "pypi" else 0.0,
        "name_length": float(len(normalized_package)),
        "name_separator_count": float(
            normalized_package.count("-")
            + normalized_package.count("_")
            + normalized_package.count(".")
        ),
        "has_scope": 1.0 if normalized_package.startswith("@") else 0.0,
        "has_digits": 1.0 if any(char.isdigit() for char in normalized_package) else 0.0,
        "risk_keyword_count": float(len(risk_signals(text))),
        "maintainer_count": _maintainer_count(maintainers),
        "dependency_count": _dependency_count(dependencies),
        "has_repository": _flag(repository),
        "has_homepage": _flag(homepage),
        "has_license": _has_license(license),
        "has_install_script": _has_install_script(install_scripts, scripts, text),
    }


def training_record_feature_values(record: dict[str, Any]) -> dict[str, float]:
    dependencies = record.get("dependencies")
    if dependencies is None:
        dependencies = record.get("dependency_names")
    return package_feature_values(
        ecosystem=record.get("ecosystem"),
        package=record.get("package"),
        version=record.get("version"),
        aliases=record.get("aliases"),
        evidence_sources=record.get("evidence_sources"),
        evidence_text=training_record_evidence_text(record),
        maintainers=record.get("maintainers"),
        dependencies=dependencies,
        repository=record.get("repository"),
        homepage=record.get("homepage"),
        license=record.get("license"),
        install_scripts=record.get("install_scripts"),
        scripts=record.get("scripts"),
    )


def dependency_payload_feature_values(payload: dict[str, Any]) -> dict[str, float]:
    vulnerabilities = [item for item in _as_list(payload.get("vulnerabilities")) if isinstance(item, dict)]
    evidence = [*_as_list(payload.get("signals"))]
    for field_name in ("install_scripts", "scripts"):
        field_value = payload.get(field_name)
        if field_value not in (None, "", [], {}):
            evidence.append(field_value)
    evidence.extend(
        vulnerability.get("summary")
        or vulnerability.get("details")
        or vulnerability.get("id")
        for vulnerability in vulnerabilities
        if vulnerability.get("summary") or vulnerability.get("details") or vulnerability.get("id")
    )
    dependencies = payload.get("dependencies")
    if dependencies is None:
        dependencies = payload.get("dependency_names")
    return package_feature_values(
        ecosystem=payload.get("ecosystem"),
        package=payload.get("name") or payload.get("package"),
        evidence_text=evidence,
        maintainers=payload.get("maintainers"),
        dependencies=dependencies,
        repository=payload.get("repository"),
        homepage=payload.get("homepage"),
        license=payload.get("license"),
        install_scripts=payload.get("install_scripts"),
        scripts=payload.get("scripts"),
    )


def training_record_evidence_text(record: dict[str, Any]) -> str:
    values = [
        record.get("text"),
        record.get("description"),
        record.get("keywords"),
        record.get("install_scripts"),
        record.get("scripts"),
    ]
    return " ".join(_text(value) for value in values if value not in (None, "", [], {}))


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _text(value: Any) -> str:
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    return str(value or "")
