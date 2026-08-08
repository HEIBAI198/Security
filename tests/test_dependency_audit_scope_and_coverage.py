import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from supplyguard import dependency_audit
from supplyguard.agent_backend import dependency_vulnerability_coverage_gap
from supplyguard.dependency_audit import (
    DependencyAuditRequest,
    dedupe_tool_statuses,
    ToolResult,
    ToolStatus,
    run_dependency_audit,
)


class DependencyAuditScopeAndCoverageTests(unittest.TestCase):
    def test_failed_tool_status_is_not_hidden_by_success(self):
        statuses = dedupe_tool_statuses(
            [
                ToolStatus(name="OSV-Scanner", available=True, command="osv", state="failed", error="timeout"),
                ToolStatus(name="OSV-Scanner", available=True, command="osv", state="ok"),
            ]
        )

        self.assertEqual(len(statuses), 1)
        self.assertEqual(statuses[0].state, "failed")

    def test_scan_does_not_import_generated_lock_outside_target(self):
        with tempfile.TemporaryDirectory() as target_dir, tempfile.TemporaryDirectory() as storage_dir:
            target = Path(target_dir)
            storage = Path(storage_dir)
            (target / "requirements.txt").write_text("requests==2.31.0\n", encoding="utf-8")
            (storage / "requirements.lock.txt").write_text(
                "requests==2.31.0\nfastapi==0.136.3\npytest==9.0.2\n",
                encoding="utf-8",
            )

            with (
                patch.object(dependency_audit, "STORAGE_SBOM_DIR", storage),
                patch.object(dependency_audit, "parse_environment_records", return_value=[]),
            ):
                result = run_dependency_audit(
                    DependencyAuditRequest(
                        targetPath=str(target),
                        allowExternal=True,
                        includeOsv=False,
                    )
                )

            self.assertEqual(result.summary["total_dependencies"], 1)
            self.assertEqual(result.summary["lockfile_count"], 0)
            self.assertNotIn("requirements.lock.txt", result.summary["lockfiles"])

    def test_external_runtime_python_is_not_treated_as_project_environment(self):
        with tempfile.TemporaryDirectory() as target_dir:
            target = Path(target_dir)
            with patch.object(dependency_audit.sys, "executable", str(Path(__file__).resolve())):
                environments = dependency_audit.discover_python_envs(target)

            self.assertEqual(environments, [])

    def test_osv_timeout_marks_coverage_incomplete(self):
        with tempfile.TemporaryDirectory() as target_dir, tempfile.TemporaryDirectory() as storage_dir:
            target = Path(target_dir)
            storage = Path(storage_dir)
            (target / "package.json").write_text(
                '{"name":"fixture","version":"1.0.0","dependencies":{"axios":"1.6.8"}}',
                encoding="utf-8",
            )
            (target / "package-lock.json").write_text(
                '{"name":"fixture","version":"1.0.0","lockfileVersion":3,"packages":{"":{"dependencies":{"axios":"1.6.8"}},"node_modules/axios":{"version":"1.6.8"}}}',
                encoding="utf-8",
            )
            failed = ToolResult(
                status=ToolStatus(
                    name="OSV-Scanner",
                    available=True,
                    command="osv-scanner scan --format json",
                    state="failed",
                    error="Timed out after 30s.",
                ),
                warnings=["OSV-Scanner timed out for package-lock.json."],
            )

            with (
                patch.object(dependency_audit, "STORAGE_SBOM_DIR", storage),
                patch.object(dependency_audit, "parse_environment_records", return_value=[]),
                patch.object(dependency_audit, "run_osv_scanner", return_value=failed),
            ):
                result = run_dependency_audit(
                    DependencyAuditRequest(
                        targetPath=str(target),
                        allowExternal=True,
                        includeOsv=True,
                    )
                )

            coverage = result.summary["vulnerability_coverage"]
            self.assertFalse(coverage["complete"])
            self.assertEqual(coverage["state"], "incomplete")
            self.assertEqual(coverage["failed_targets"], 1)
            self.assertIn("0 条命中不能解释为没有漏洞", coverage["message"])
            self.assertIn("Vulnerability coverage: incomplete", result.report)
            self.assertIsNotNone(dependency_vulnerability_coverage_gap(result))


if __name__ == "__main__":
    unittest.main()
