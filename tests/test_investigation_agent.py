import tempfile
import unittest
import asyncio
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

from supplyguard import workspaces
from supplyguard.investigation_agent import answer_investigation_question, build_investigation_state
from supplyguard.routes import security


class InvestigationAgentTests(unittest.TestCase):
    def test_build_state_marks_missing_evidence_and_next_actions(self):
        workspace = deepcopy(security.SECURITY_WORKSPACE)
        workspace["code_audit"] = {"scan_id": "code-1", "summary": {"total": 2}}
        workspace["dependency_audit"] = {"scan_id": "dep-1", "summary": {"finding_count": 1}}
        workspace["cicd_audit"] = {"scan_id": "cicd-1", "summary": {"finding_count": 0}}
        workspace["artifact_trust"] = {"scan_id": None, "summary": {}}
        workspace["log_audit"] = {"scan_id": None, "summary": {}}
        workspace["multimodal_audit"] = {"summary": {"evidence_count": 0}}

        state = build_investigation_state(
            workspace,
            scan_request={
                "includeArtifactTrust": True,
                "includeLogAudit": True,
                "artifactPath": None,
                "attestationPath": None,
                "logPaths": [],
            },
        )

        self.assertEqual(state["status"], "need_user_input")
        self.assertGreaterEqual(state["summary"]["evidenceGapCount"], 3)
        gap_modules = {gap["module"] for gap in state["evidenceGaps"]}
        self.assertIn("产物可信", gap_modules)
        self.assertIn("日志印证", gap_modules)
        self.assertIn("多模态证据", gap_modules)
        self.assertTrue(state["nextActions"][0]["title"].startswith("补充"))

    def test_answer_question_uses_investigation_state(self):
        workspace = deepcopy(security.SECURITY_WORKSPACE)
        state = build_investigation_state(workspace)

        answer = answer_investigation_question("下一步该上传什么？", state, workspace)

        self.assertEqual(answer["model"], "rule-based-investigation-agent")
        self.assertIn("建议按这个顺序继续", answer["answer"])
        self.assertTrue(answer["next_actions"])

    def test_scan_suite_writeback_persists_investigation_state(self):
        workspace_id = "ws_investigation_agent_test"
        temp_root = tempfile.TemporaryDirectory()
        self.addCleanup(temp_root.cleanup)
        storage_dir = Path(temp_root.name)

        existing = deepcopy(security.SECURITY_WORKSPACE)
        existing["workspace"].update({"workspaceId": workspace_id, "name": "agent test"})

        with (
            patch.object(workspaces, "WORKSPACE_STORAGE_DIR", storage_dir),
            patch.object(workspaces, "LATEST_FILE", storage_dir / "latest.json"),
            patch.object(security, "LAST_CODE_AUDIT", None),
            patch.object(security, "LAST_DEPENDENCY_AUDIT", None),
            patch.object(security, "LAST_CICD_AUDIT", None),
            patch.object(security, "LAST_ARTIFACT_TRUST", None),
            patch.object(security, "LAST_LOG_AUDIT", None),
            patch.object(security, "latest_multimodal_payload", return_value={"summary": {"evidence_count": 0}}),
        ):
            workspaces.save_workspace_snapshot(existing, workspace_id=workspace_id)
            workspace = security.persist_current_workspace(workspace_id)
            workspace["scanSuite"] = {"status": "completed", "errors": []}
            workspace["investigationAgent"] = build_investigation_state(workspace)
            workspaces.save_workspace_snapshot(
                workspace,
                workspace_id=workspace_id,
                module_key="investigation_agent",
                module_payload=workspace["investigationAgent"],
            )

            reloaded = workspaces.load_workspace(workspace_id)

        self.assertIn("investigationAgent", reloaded)
        self.assertIn("evidenceGaps", reloaded["investigationAgent"])
        self.assertTrue((storage_dir / workspace_id / "modules" / "investigation_agent.json").exists())

    def test_route_answer_uses_llm_when_available(self):
        workspace = deepcopy(security.SECURITY_WORKSPACE)
        state = build_investigation_state(workspace)

        async def fake_llm(question, workspace_payload, investigation_payload):
            return {"answer": "大模型规划：先补产物可信材料，再补日志。", "model": "mock-model"}

        with patch.object(security, "ask_deepseek_investigation_agent", side_effect=fake_llm):
            answer = asyncio.run(security.investigation_agent_answer("下一步该上传什么？", state, workspace))

        self.assertEqual(answer["model"], "llm-investigation-agent:mock-model")
        self.assertIn("大模型规划", answer["answer"])
        self.assertIn("fallback_answer", answer)

    def test_route_answer_falls_back_to_rules_without_llm(self):
        workspace = deepcopy(security.SECURITY_WORKSPACE)
        state = build_investigation_state(workspace)

        async def no_llm(question, workspace_payload, investigation_payload):
            return None

        with patch.object(security, "ask_deepseek_investigation_agent", side_effect=no_llm):
            answer = asyncio.run(security.investigation_agent_answer("下一步该上传什么？", state, workspace))

        self.assertEqual(answer["model"], "rule-based-investigation-agent")
        self.assertIn("建议按这个顺序继续", answer["answer"])


if __name__ == "__main__":
    unittest.main()
