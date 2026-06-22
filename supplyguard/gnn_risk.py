from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .gnn_models import PackageRiskModelRegistry


DEFAULT_MODEL_DIR = Path("storage/graph_models")
RISK_KEYWORDS = (
    "postinstall",
    "preinstall",
    "install script",
    "exfiltrat",
    "token",
    "credential",
    "backdoor",
    "malware",
    "powershell",
    "eval",
    "obfuscat",
)

RISK_KEYWORD_PATTERNS = tuple(
    re.compile(rf"(?<![a-z0-9-]){re.escape(keyword)}(?![a-z0-9-])", re.IGNORECASE)
    for keyword in RISK_KEYWORDS
)


def normalize_ecosystem(value: Any) -> str:
    text = str(value or "").strip().lower()
    if text == "pypi":
        return "pypi"
    if text == "npm":
        return "npm"
    return text or "generic"


def normalize_package_name(name: Any, ecosystem: str) -> str:
    package = str(name or "").strip().lower()
    if ecosystem == "pypi":
        package = re.sub(r"[-_.]+", "-", package)
    return package


def risk_label(score: float) -> str:
    if score >= 0.75:
        return "high"
    if score >= 0.35:
        return "elevated"
    return "low"


class PackageRiskScorer:
    def __init__(self, model_dir: str | Path = DEFAULT_MODEL_DIR) -> None:
        self.model_dir = Path(model_dir)
        self.registry = PackageRiskModelRegistry(self.model_dir)
        self.model_available = self.registry.model_available
        self.load_error = self.registry.load_error
        self.model_type = self.registry.model_type

    def score_package(
        self,
        ecosystem: str,
        name: str,
        version: str = "",
        signals: list[Any] | None = None,
        vulnerabilities: list[dict[str, Any]] | None = None,
        existing_risk: int | float = 0,
    ) -> dict[str, Any]:
        normalized_ecosystem = normalize_ecosystem(ecosystem)
        normalized_name = normalize_package_name(name, normalized_ecosystem)
        signal_text = " ".join(str(item) for item in (signals or []))
        vulnerability_text = " ".join(
            " ".join(str(value) for value in vuln.values())
            for vuln in (vulnerabilities or [])
            if isinstance(vuln, dict)
        )
        text = f"{normalized_name} {version} {signal_text} {vulnerability_text}"
        evidence_text = f"{signal_text} {vulnerability_text}"

        feature_values = self._feature_values(
            normalized_ecosystem,
            normalized_name,
            version,
            signals or [],
            vulnerabilities or [],
            text,
            evidence_text=evidence_text,
        )

        prediction = self.registry.predict(feature_values)
        if prediction.get("model_available"):
            score = float(prediction.get("score", 0.0))
            return self._result(
                score=score,
                reasons=self._reasons(score, signals or [], vulnerabilities or [], model=True),
                model_available=True,
                model_type=str(prediction.get("model_type") or self.registry.model_type),
                confidence=float(prediction.get("confidence", 0.0) or 0.0),
                explanations=list(prediction.get("explanations") or []),
                similar_packages=self.registry.similar_packages(feature_values),
                model_error=prediction.get("model_error"),
            )

        if prediction.get("model_error"):
            self.load_error = str(prediction.get("model_error"))

        score = self._fallback_score(text, signals or [], vulnerabilities or [], existing_risk)
        return self._result(
            score=score,
            reasons=self._reasons(score, signals or [], vulnerabilities or [], model=False),
            model_available=False,
            model_type="rule_fallback",
            confidence=0.0,
            explanations=["rule fallback score used because no GNN model was available"],
            similar_packages=[],
            model_error=self.load_error,
        )

    def _feature_values(
        self,
        ecosystem: str,
        package: str,
        version: str,
        signals: list[Any],
        vulnerabilities: list[dict[str, Any]],
        text: str,
        evidence_text: str | None = None,
    ) -> dict[str, float]:
        keyword_text = evidence_text
        if keyword_text is None:
            keyword_text = " ".join(str(item) for item in signals)
            keyword_text = f"{keyword_text} " + " ".join(
                " ".join(str(value) for value in vuln.values())
                for vuln in vulnerabilities
                if isinstance(vuln, dict)
            )
        risk_keyword_count = float(_risk_keyword_count(keyword_text))
        signal_count = float(len(signals))
        vulnerability_count = float(len(vulnerabilities))
        return {
            "ecosystem_npm": 1.0 if ecosystem == "npm" else 0.0,
            "ecosystem_pypi": 1.0 if ecosystem == "pypi" else 0.0,
            "name_length": float(len(package)),
            "name_separator_count": float(package.count("-") + package.count("_") + package.count(".")),
            "has_scope": 1.0 if package.startswith("@") else 0.0,
            "has_digits": 1.0 if any(char.isdigit() for char in package) else 0.0,
            "version_count": 1.0 if version else 0.0,
            "alias_count": vulnerability_count,
            "evidence_source_count": 1.0,
            "risk_keyword_count": risk_keyword_count,
            "text_length": float(len(text)),
            "graph_degree": 1.0 + signal_count + vulnerability_count,
            "graph_risk_signal_degree": risk_keyword_count,
            "graph_observed_in_degree": 1.0,
            "graph_ecosystem_degree": 1.0,
        }

    def _fallback_score(
        self,
        text: str,
        signals: list[Any],
        vulnerabilities: list[dict[str, Any]],
        existing_risk: int | float,
    ) -> float:
        score = 0.05
        if vulnerabilities:
            score += 0.3
        if signals:
            score += 0.15
        keyword_text = " ".join(str(item) for item in signals)
        keyword_text = f"{keyword_text} " + " ".join(
            " ".join(str(value) for value in vuln.values())
            for vuln in vulnerabilities
            if isinstance(vuln, dict)
        )
        if _risk_keyword_count(keyword_text) > 0:
            score += 0.2
        score += min(max(float(existing_risk or 0), 0.0), 100.0) / 100.0 * 0.2
        return max(0.0, min(1.0, score))

    def _reasons(
        self,
        score: float,
        signals: list[Any],
        vulnerabilities: list[dict[str, Any]],
        model: bool,
    ) -> list[str]:
        prefix = "model score" if model else "rule fallback"
        reasons = [f"{prefix}: {risk_label(score)} package risk"]
        if vulnerabilities:
            reasons.append(f"{len(vulnerabilities)} vulnerability/advisory signals present")
        if signals:
            reasons.append(f"{len(signals)} dependency audit signals present")
        return reasons

    def _result(
        self,
        *,
        score: float,
        reasons: list[str],
        model_available: bool,
        model_type: str,
        confidence: float,
        explanations: list[str],
        similar_packages: list[dict[str, Any]],
        model_error: Any = None,
    ) -> dict[str, Any]:
        bounded_score = max(0.0, min(1.0, float(score)))
        result = {
            "gnn_score": round(bounded_score, 4),
            "gnn_label": risk_label(bounded_score),
            "gnn_reasons": reasons,
            "gnn_model_available": bool(model_available),
            "gnn_model_type": model_type,
            "gnn_confidence": max(0.0, min(1.0, float(confidence))),
            "gnn_explanations": explanations,
            "similar_malicious_packages": similar_packages,
            "model_available": bool(model_available),
            "model_type": model_type,
        }
        if model_error:
            result["model_error"] = str(model_error)
        return result


def score_dependency_payload(
    dependency: dict[str, Any],
    scorer: PackageRiskScorer | None = None,
) -> dict[str, Any]:
    active_scorer = scorer or PackageRiskScorer()
    return active_scorer.score_package(
        ecosystem=str(dependency.get("ecosystem") or ""),
        name=str(dependency.get("name") or ""),
        version=str(dependency.get("version") or ""),
        signals=list(dependency.get("signals") or []),
        vulnerabilities=list(dependency.get("vulnerabilities") or []),
        existing_risk=dependency.get("risk") or 0,
    )


def _risk_keyword_count(text: str) -> int:
    return sum(1 for pattern in RISK_KEYWORD_PATTERNS if pattern.search(text or ""))
