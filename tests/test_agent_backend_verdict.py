import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from supplyguard import agent_backend
from supplyguard.agent_backend import (
    AgentInternalResults,
    AgentRunRequest,
    agent_run_status,
    build_agent_run_payload,
    observe_and_replan,
    plan_agent_request,
    run_agent_backend,
)


class FakeScanResult:
    def __init__(self, summary: dict, **attrs):
        self.summary = summary
        for key, value in attrs.items():
            setattr(self, key, value)


def success_step(step_id: str, name: str) -> dict:
    return {
        "id": step_id,
        "name": name,
        "description": name,
        "status": "success",
        "durationSeconds": 0,
        "input": {},
        "summary": {},
        "error": "",
    }


def skipped_step(step_id: str, name: str, reason: str) -> dict:
    step = success_step(step_id, name)
    step["status"] = "skipped"
    step["summary"] = {"reason": reason}
    step["error"] = reason
    return step


class AgentBackendVerdictTests(unittest.TestCase):
    def test_planner_selects_modules_from_question(self):
        planned, plan = plan_agent_request(AgentRunRequest(question="运行期日志有没有异常外联？"))

        self.assertFalse(planned.include_dependency_audit)
        self.assertFalse(planned.include_cicd_audit)
        self.assertFalse(planned.include_artifact_trust)
        self.assertTrue(planned.include_log_audit)
        self.assertEqual(plan["plannerType"], "question-driven-observe-replan-planner")
        self.assertIn("log_audit", {item["id"] for item in plan["selectedModules"]})

    def test_planner_uses_full_chain_for_risk_question(self):
        planned, plan = plan_agent_request(AgentRunRequest(question="这个项目有危险吗？"))

        self.assertTrue(planned.include_dependency_audit)
        self.assertTrue(planned.include_cicd_audit)
        self.assertTrue(planned.include_artifact_trust)
        self.assertTrue(planned.include_log_audit)
        self.assertEqual(
            {"code_audit", "dependency_audit", "cicd_audit", "artifact_trust", "log_audit", "workspace_report"},
            {item["id"] for item in plan["selectedModules"]},
        )

    def test_planner_keeps_module_scope_for_risk_question(self):
        planned, plan = plan_agent_request(AgentRunRequest(question="日志部分有危险吗？"))

        self.assertFalse(planned.include_dependency_audit)
        self.assertFalse(planned.include_cicd_audit)
        self.assertFalse(planned.include_artifact_trust)
        self.assertTrue(planned.include_log_audit)
        self.assertEqual({"log_audit", "workspace_report"}, {item["id"] for item in plan["selectedModules"]})

    def test_observe_replan_expands_chain_after_dependency_risk(self):
        original = AgentRunRequest(question="依赖有哪些风险？")
        planned, plan = plan_agent_request(original)
        results = AgentInternalResults(
            dependency_audit=FakeScanResult({"finding_count": 2, "risk_score": 100, "total_dependencies": 20})
        )
        events: list[dict] = []

        replanned = observe_and_replan(planned, original, plan, results, [], "dependency_audit", events)

        self.assertTrue(replanned.include_cicd_audit)
        self.assertTrue(replanned.include_artifact_trust)
        self.assertTrue(replanned.include_log_audit)
        self.assertEqual({"cicd_audit", "artifact_trust", "log_audit"}, {item["id"] for item in plan["replans"][0]["enabledModules"]})
        self.assertTrue(any(event["kind"] == "planner_replanned" for event in events))

    def test_observe_replan_respects_disabled_modules(self):
        original = AgentRunRequest(
            question="依赖有哪些风险？",
            include_cicd_audit=False,
            include_artifact_trust=False,
            include_log_audit=False,
        )
        planned, plan = plan_agent_request(original)
        results = AgentInternalResults(
            dependency_audit=FakeScanResult({"finding_count": 2, "risk_score": 100, "total_dependencies": 20})
        )
        events: list[dict] = []

        replanned = observe_and_replan(planned, original, plan, results, [], "dependency_audit", events)

        self.assertFalse(replanned.include_cicd_audit)
        self.assertFalse(replanned.include_artifact_trust)
        self.assertFalse(replanned.include_log_audit)
        self.assertEqual({"cicd_audit", "artifact_trust", "log_audit"}, {item["id"] for item in plan["replans"][0]["blockedModules"]})
        self.assertTrue(any(event["kind"] == "planner_blocked" for event in events))

    def test_missing_required_evidence_is_needs_input_not_success(self):
        temp_root = tempfile.TemporaryDirectory()
        self.addCleanup(temp_root.cleanup)

        request = AgentRunRequest(
            include_code_audit=False,
            include_dependency_audit=False,
            include_cicd_audit=False,
            include_artifact_trust=True,
            include_log_audit=True,
            timeout_seconds=10,
        )
        with patch.object(agent_backend, "AGENT_RUN_STORAGE_DIR", Path(temp_root.name)):
            bundle = run_agent_backend(request)

        self.assertEqual(bundle.payload["status"], "needs_input")
        self.assertNotEqual(bundle.payload["status"], "success")
        self.assertGreaterEqual(bundle.payload["summary"]["evidenceGapCount"], 2)
        self.assertEqual(bundle.payload["verdict"]["level"], "insufficient_evidence")
        self.assertIn("证据不足", bundle.payload["verdict"]["label"])

    def test_planner_scope_skip_does_not_downgrade_clean_status(self):
        steps = [
            skipped_step("dependency_audit", "供应链组件", "问题意图本轮未选择该模块"),
            success_step("log_audit", "日志印证"),
        ]
        results = AgentInternalResults(log_audit=FakeScanResult({"finding_count": 0, "risk_score": 0}))

        self.assertEqual(agent_run_status(steps, [], results), "success")

    def test_user_disabled_skip_keeps_partial_status(self):
        steps = [
            skipped_step("dependency_audit", "供应链组件", "请求中关闭供应链组件扫描。"),
            success_step("log_audit", "日志印证"),
        ]
        results = AgentInternalResults(log_audit=FakeScanResult({"finding_count": 0, "risk_score": 0}))

        self.assertEqual(agent_run_status(steps, [], results), "partial")

    def test_risk_without_closed_chain_stays_suspected(self):
        steps = [
            success_step("dependency_audit", "供应链组件"),
            success_step("cicd_audit", "CI/CD 构建链"),
            success_step("artifact_trust", "产物可信"),
            success_step("log_audit", "日志印证"),
        ]
        results = AgentInternalResults(
            dependency_audit=FakeScanResult({"finding_count": 1, "risk_score": 100, "total_dependencies": 1}),
            cicd_audit=FakeScanResult({"finding_count": 0, "risk_score": 0}),
            artifact_trust=FakeScanResult(
                {"finding_count": 0, "risk_score": 0, "trust_score": 100},
                trust_score=100,
            ),
            log_audit=FakeScanResult({"finding_count": 0, "risk_score": 0}),
        )

        payload = build_agent_run_payload(
            run_id="agent-test",
            status=agent_run_status(steps, [], results),
            started_at="2026-07-03T00:00:00+00:00",
            started_at_monotonic=time.monotonic(),
            request=AgentRunRequest(),
            steps=steps,
            events=[],
            evidence_gaps=[],
            results=results,
            next_actions=[],
        )

        self.assertEqual(payload["status"], "completed_with_risk")
        self.assertEqual(payload["verdict"]["level"], "suspected_risk")
        self.assertIn("尚未证明风险进入 CI/CD", "\n".join(payload["verdict"]["unsupportedClaims"]))

    def test_closed_chain_can_be_confirmed_attack(self):
        steps = [
            success_step("dependency_audit", "供应链组件"),
            success_step("cicd_audit", "CI/CD 构建链"),
            success_step("artifact_trust", "产物可信"),
            success_step("log_audit", "日志印证"),
        ]
        results = AgentInternalResults(
            dependency_audit=FakeScanResult({"finding_count": 2, "risk_score": 100, "total_dependencies": 20}),
            cicd_audit=FakeScanResult({"finding_count": 2, "risk_score": 88}),
            artifact_trust=FakeScanResult(
                {"finding_count": 1, "risk_score": 98, "trust_score": 56},
                trust_score=56,
            ),
            log_audit=FakeScanResult({"finding_count": 1, "risk_score": 93}),
        )

        payload = build_agent_run_payload(
            run_id="agent-confirmed",
            status=agent_run_status(steps, [], results),
            started_at="2026-07-03T00:00:00+00:00",
            started_at_monotonic=time.monotonic(),
            request=AgentRunRequest(),
            steps=steps,
            events=[],
            evidence_gaps=[],
            results=results,
            next_actions=[],
        )

        self.assertEqual(payload["status"], "completed_with_risk")
        self.assertEqual(payload["verdict"]["level"], "confirmed_attack")
        self.assertEqual(payload["narrative"]["verdict"], payload["verdict"]["label"])


if __name__ == "__main__":
    unittest.main()
