import importlib.metadata
import unittest
from pathlib import Path
from unittest.mock import patch

from supplyguard import code_audit


class CheckovAuditTests(unittest.TestCase):
    def test_get_checkov_version_uses_installed_package_metadata(self):
        with (
            patch.object(code_audit.importlib.metadata, "version", return_value="3.2.531"),
            patch.object(code_audit.subprocess, "run") as subprocess_run,
        ):
            version = code_audit.get_checkov_version("checkov", timeout_seconds=3)

        self.assertEqual(version, "3.2.531")
        subprocess_run.assert_not_called()

    def test_get_checkov_version_falls_back_to_cli_for_external_install(self):
        process = code_audit.subprocess.CompletedProcess(
            args=["checkov", "--version"],
            returncode=0,
            stdout="3.2.999\n",
            stderr="",
        )
        with (
            patch.object(
                code_audit.importlib.metadata,
                "version",
                side_effect=importlib.metadata.PackageNotFoundError,
            ),
            patch.object(code_audit.subprocess, "run", return_value=process),
        ):
            version = code_audit.get_checkov_version("checkov", timeout_seconds=3)

        self.assertEqual(version, "3.2.999")

    def test_run_checkov_reports_timeout_separately_from_tool_failure(self):
        timed_out = code_audit.CommandResult(-1, "", "", timeout=True)
        with (
            patch.object(code_audit, "find_python_tool", return_value="checkov"),
            patch.object(code_audit, "checkov_target_files", return_value=[Path("Dockerfile")]),
            patch.object(code_audit, "get_checkov_version", return_value="3.2.531"),
            patch.object(code_audit, "run_command", return_value=timed_out),
        ):
            findings, status, errors = code_audit.run_checkov(Path("."), 90)

        self.assertEqual(findings, [])
        self.assertEqual(status.state, "timeout")
        timeout_value = int(status.error.removeprefix("扫描超时（").removesuffix(" 秒）"))
        self.assertIn(timeout_value, {89, 90})
        self.assertEqual(errors, [f"Checkov scan timed out after {timeout_value} seconds"])


if __name__ == "__main__":
    unittest.main()
