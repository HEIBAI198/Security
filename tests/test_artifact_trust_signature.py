import unittest
from pathlib import Path
from unittest.mock import patch

from supplyguard.artifact_trust import (
    ArtifactTrustToolStatus,
    CommandResult,
    ProvenanceInfo,
    check_signature,
)


def provenance_info(*, envelope: dict | None = None) -> ProvenanceInfo:
    return ProvenanceInfo(
        statement={},
        envelope=envelope,
        subject_name="order-service.zip",
        subject_sha256="a" * 64,
        predicate_type="https://slsa.dev/provenance/v1",
        builder_id="https://github.com/actions/runner/github-hosted",
        build_type="https://github.com/ActionsWorkflow",
        source_repo="https://github.com/acme/three-gate-demo",
        commit="b" * 40,
        workflow=".github/workflows/release.yml",
        ref="refs/heads/main",
        runner_environment="github-hosted",
        invocation_id="demo-run",
        created_at="2026-08-20T00:00:00+00:00",
    )


def available_tool(name: str) -> ArtifactTrustToolStatus:
    return ArtifactTrustToolStatus(
        name=name,
        available=True,
        command=name,
        state="ok",
        version="test",
    )


class ArtifactTrustSignatureTest(unittest.TestCase):
    @patch("supplyguard.artifact_trust.run_command")
    @patch("supplyguard.artifact_trust.tool_status", side_effect=available_tool)
    def test_optional_signature_skips_remote_verification_for_plain_statement(
        self,
        _tool_status,
        run_command,
    ) -> None:
        check, _tools = check_signature(
            Path("order-service.zip"),
            provenance_info(),
            {
                "expected_repo": "https://github.com/acme/three-gate-demo",
                "require_signature": False,
            },
            30,
        )

        self.assertEqual(check.status, "skipped")
        run_command.assert_not_called()

    @patch("supplyguard.artifact_trust.run_command", return_value=CommandResult(0, "{}", ""))
    @patch("supplyguard.artifact_trust.tool_status", side_effect=available_tool)
    def test_required_signature_still_runs_remote_verification(
        self,
        _tool_status,
        run_command,
    ) -> None:
        check, _tools = check_signature(
            Path("order-service.zip"),
            provenance_info(),
            {
                "expected_repo": "https://github.com/acme/three-gate-demo",
                "require_signature": True,
            },
            30,
        )

        self.assertEqual(check.status, "pass")
        run_command.assert_called_once()


if __name__ == "__main__":
    unittest.main()
