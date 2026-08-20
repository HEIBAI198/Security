import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from supplyguard.agent_attachments import (
    classify_attachment,
    resolve_agent_attachment,
    save_agent_attachment,
)
from supplyguard.agent_backend import AgentRunRequest, apply_agent_attachments, plan_agent_request


class AgentAttachmentTests(unittest.TestCase):
    def test_attachment_kind_drives_module_selection(self):
        with tempfile.TemporaryDirectory() as directory:
            storage = Path(directory)
            with patch("supplyguard.agent_attachments.AGENT_ATTACHMENT_DIR", storage):
                attachment = save_agent_attachment("runtime.log", b"GET /admin 401", "text/plain")
                request = apply_agent_attachments(
                    AgentRunRequest(
                        attachment_paths=[attachment.path],
                        include_code_audit=False,
                        include_dependency_audit=False,
                        include_cicd_audit=False,
                        include_artifact_trust=False,
                        include_log_audit=False,
                    )
                )
                _, plan = plan_agent_request(request)

        self.assertEqual(classify_attachment("incident.png"), "image")
        self.assertTrue(request.include_log_audit)
        self.assertIn("log_audit", {item["id"] for item in plan["selectedModules"]})

    def test_attachment_path_cannot_escape_controlled_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            storage = Path(directory) / "attachments"
            storage.mkdir()
            outside = Path(directory) / "outside.log"
            outside.write_text("secret", encoding="utf-8")
            with patch("supplyguard.agent_attachments.AGENT_ATTACHMENT_DIR", storage):
                with self.assertRaises(ValueError):
                    resolve_agent_attachment(str(outside))


if __name__ == "__main__":
    unittest.main()
