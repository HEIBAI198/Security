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
    dependency_vulnerability_coverage_gap,
    observe_and_replan,
    plan_agent_request,
    refine_agent_payload_with_workspace_graph,
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
    def test_incomplete_vulnerability_coverage_becomes_evidence_gap(self):
        result = FakeScanResult(
            {
                "vulnerability_coverage": {
                    "complete": False,
                    "requested": True,
                    "message": "OSV 仅完成 0/1 个项目锁文件；0 条命中不能解释为没有漏洞。",
                }
            }
        )

        gap = dependency_vulnerability_coverage_gap(result)

        self.assertIsNotNone(gap)
        self.assertEqual(gap["id"], "dependency-vulnerability-coverage-incomplete")
        self.assertEqual(gap["severity"], "high")

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

    def test_progress_waits_for_workspace_writeback_before_terminal_status(self):
        temp_root = tempfile.TemporaryDirectory()
        self.addCleanup(temp_root.cleanup)
        published_statuses: list[str] = []
        request = AgentRunRequest(
            include_code_audit=False,
            include_dependency_audit=False,
            include_cicd_audit=False,
            include_artifact_trust=False,
            include_log_audit=False,
            include_multimodal_audit=False,
        )

        with patch.object(agent_backend, "AGENT_RUN_STORAGE_DIR", Path(temp_root.name)):
            bundle = run_agent_backend(
                request,
                progress=lambda payload: published_statuses.append(str(payload["status"])),
            )

        self.assertTrue(published_statuses)
        self.assertTrue(all(status == "running" for status in published_statuses))
        self.assertNotEqual(bundle.payload["status"], "running")

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

    def test_module_counts_alone_cannot_confirm_attack(self):
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
        self.assertEqual(payload["verdict"]["level"], "suspected_risk")
        self.assertIn("共同实体和时间线", "\n".join(payload["verdict"]["unsupportedClaims"]))
        self.assertEqual(payload["narrative"]["verdict"], payload["verdict"]["label"])
        self.assertEqual(payload["verdict"]["riskScoreBasis"], "max_module")
        self.assertEqual(payload["verdict"]["riskScoreSource"]["moduleName"], "供应链组件")

    def test_confirmed_graph_path_promotes_verdict(self):
        payload = {
            "summary": {"riskScore": 92},
            "verdict": {
                "level": "suspected_risk",
                "label": "疑似供应链风险",
                "confidence": 78,
                "conclusion": "待关联",
                "supportedClaims": [],
                "unsupportedClaims": ["四类模块均发现风险，但尚未通过共同实体和时间线证明它们属于同一条攻击链。"],
            },
            "narrative": {"timeline": ["依赖风险", "等待图谱关联"]},
        }
        workspace = {
            "graph": {
                "attack_paths": [
                    {
                        "id": "attack-path:confirmed",
                        "title": "依赖到运行期异常路径",
                        "category": "supply-chain-compromise",
                        "verdict": "likely-real-attack-path",
                        "confidence": 0.84,
                        "evidence_ids": ["ev-1", "ev-2", "ev-3", "ev-4"],
                    }
                ]
            }
        }

        refined = refine_agent_payload_with_workspace_graph(payload, workspace)

        self.assertEqual(refined["verdict"]["level"], "confirmed_attack")
        self.assertEqual(refined["verdict"]["confidence"], 84)
        self.assertEqual(refined["verdict"]["chainEvidence"]["pathId"], "attack-path:confirmed")
        self.assertNotIn("尚未通过共同实体和时间线", "\n".join(refined["verdict"]["unsupportedClaims"]))
        self.assertEqual(refined["summary"]["evidenceGapCount"], 0)

    def test_plausible_graph_path_stays_suspected(self):
        payload = {
            "summary": {"riskScore": 100},
            "verdict": {
                "level": "suspected_risk",
                "label": "疑似供应链风险",
                "confidence": 78,
                "conclusion": "待关联",
                "supportedClaims": [],
                "unsupportedClaims": [],
            },
            "narrative": {"timeline": ["依赖风险", "等待图谱关联"]},
        }
        workspace = {
            "graph": {
                "attack_paths": [
                    {
                        "id": "attack-path:plausible",
                        "title": "可疑供应链路径",
                        "category": "supply-chain-compromise",
                        "verdict": "plausible-attack-path",
                        "confidence": 0.71,
                        "evidence_ids": ["ev-1", "ev-2"],
                    }
                ]
            }
        }

        refined = refine_agent_payload_with_workspace_graph(payload, workspace)

        self.assertEqual(refined["verdict"]["level"], "suspected_risk")
        self.assertEqual(refined["verdict"]["confidence"], 71)
        self.assertEqual(refined["verdict"]["confidenceType"], "graph_path")
        self.assertEqual(refined["verdict"]["chainEvidence"]["status"], "plausible")
        self.assertEqual(refined["summary"]["evidenceGapCount"], 1)
        self.assertEqual(refined["evidenceGaps"][0]["id"], "graph-chain-correlation-incomplete")
        self.assertIn("共同实体", "\n".join(refined["verdict"]["evidenceGaps"]))


if __name__ == "__main__":
    unittest.main()
