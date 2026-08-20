from supplyguard.multimodal_audit import merge_multimodal_payloads


def evidence(evidence_id: str, digest: str, filename: str, score: int = 0) -> dict:
    return {
        "evidence_id": evidence_id,
        "sha256": digest,
        "original_filename": filename,
        "source_type": "image",
        "size_bytes": 10,
        "risk_score": score,
        "derived": [],
        "recognitions": [],
        "entities": [],
        "findings": [],
    }


def payload(*items: dict, warning: str | None = None) -> dict:
    return {
        "scan_id": "scan-test",
        "generated_at": "2026-08-20T00:00:00+00:00",
        "evidence": list(items),
        "tools": [],
        "summary": {"duration_seconds": 1},
        "warnings": [warning] if warning else [],
    }


def test_merge_multimodal_payloads_accumulates_separate_uploads() -> None:
    existing = payload(evidence("MME-1", "aaa", "first.png", 20), warning="旧警告")
    incoming = payload(evidence("MME-2", "bbb", "second.png", 80), warning="新警告")

    merged = merge_multimodal_payloads(existing, incoming)

    assert merged["summary"]["evidence_count"] == 2
    assert merged["summary"]["risk_score"] == 80
    assert [item["original_filename"] for item in merged["evidence"]] == ["second.png", "first.png"]
    assert merged["warnings"] == ["新警告", "旧警告"]


def test_merge_multimodal_payloads_deduplicates_by_sha256_and_keeps_latest() -> None:
    existing = payload(evidence("MME-1", "same", "old-name.png"))
    incoming = payload(evidence("MME-2", "same", "new-name.png"))

    merged = merge_multimodal_payloads(existing, incoming)

    assert merged["summary"]["evidence_count"] == 1
    assert merged["evidence"][0]["evidence_id"] == "MME-2"
    assert merged["evidence"][0]["original_filename"] == "new-name.png"
