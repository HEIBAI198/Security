import unittest
from unittest.mock import AsyncMock, patch

import httpx

from supplyguard import llm_assistant
from supplyguard.llm_assistant import build_assistant_context, chat_completion_is_incomplete


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class FakeAsyncClient:
    def __init__(self, responses):
        self.responses = list(responses)
        self.payloads = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    async def post(self, url, *, headers, json):
        self.payloads.append(json)
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return FakeResponse(response)


class AssistantGraphRagContextTests(unittest.TestCase):
    def test_detects_length_truncation(self):
        payload = {"choices": [{"finish_reason": "length", "message": {"content": "部分回答"}}]}

        self.assertTrue(chat_completion_is_incomplete(payload, "部分回答"))

    def test_detects_unclosed_bold_markdown(self):
        payload = {"choices": [{"finish_reason": "stop", "message": {"content": "3. **依赖漏洞"}}]}

        self.assertTrue(chat_completion_is_incomplete(payload, "3. **依赖漏洞"))

    def test_accepts_complete_markdown(self):
        payload = {"choices": [{"finish_reason": "stop", "message": {"content": "3. **依赖漏洞**：待确认。"}}]}

        self.assertFalse(chat_completion_is_incomplete(payload, "3. **依赖漏洞**：待确认。"))

    def test_context_includes_graph_rag_summary(self):
        workspace = {"workspace": {"name": "demo"}, "summary": {"risk": "high"}}
        graph_rag = {
            "context": "GraphRAG context:\n- npm:evil gnn_score=0.91",
            "intent": "dependency_risk",
            "evidence_table": [
                {"kind": "dependency", "id": "dep:evil", "summary": "high risk dependency"}
            ],
            "missing_evidence": [{"kind": "runtime_log", "reason": "no runtime log"}],
            "retrieval_trace": [{"stage": "keyword", "detail": "matched evil"}],
            "explanation": {"method": "GraphRAG", "hop_limit": 2},
        }

        context = build_assistant_context(workspace, ["legacy retrieval"], graph_rag=graph_rag)

        self.assertIn("graph_rag", context)
        self.assertIn("gnn_score=0.91", context)
        self.assertIn("dependency_risk", context)
        self.assertIn("high risk dependency", context)
        self.assertIn("no runtime log", context)
        self.assertIn("matched evil", context)
        self.assertIn("legacy retrieval", context)


class DeepSeekRetryTests(unittest.IsolatedAsyncioTestCase):
    async def test_security_assistant_uses_configured_default_token_budget(self):
        request = AsyncMock(return_value={"answer": "完整回答", "model": "test-model"})

        with patch.object(llm_assistant, "deepseek_enabled", return_value=True), patch.object(
            llm_assistant,
            "request_deepseek_completion_with_retry",
            request,
        ):
            await llm_assistant.ask_deepseek_security_assistant(
                "是否存在风险？",
                {"workspace": {"name": "demo"}, "assistant": {"next_actions": []}},
                [],
            )

        payload = request.await_args.args[0]
        self.assertEqual(payload["max_tokens"], 2400)

    async def test_retries_truncated_answer_with_larger_token_budget(self):
        client = FakeAsyncClient(
            [
                {
                    "model": "deepseek-v4-flash",
                    "choices": [{"finish_reason": "length", "message": {"content": "首次回答"}}],
                },
                {
                    "model": "deepseek-v4-flash",
                    "choices": [{"finish_reason": "stop", "message": {"content": "完整回答"}}],
                },
            ]
        )

        with patch.object(llm_assistant.httpx, "AsyncClient", return_value=client):
            result = await llm_assistant.request_deepseek_completion_with_retry(
                {"model": "deepseek-v4-flash", "messages": [], "max_tokens": 2400}
            )

        self.assertEqual([payload["max_tokens"] for payload in client.payloads], [2400, 4800])
        self.assertEqual(result["answer"], "完整回答")
        self.assertTrue(result["retried"])
        self.assertFalse(result["partial"])

    async def test_preserves_retry_content_when_second_answer_is_still_truncated(self):
        client = FakeAsyncClient(
            [
                {
                    "model": "deepseek-v4-flash",
                    "choices": [{"finish_reason": "length", "message": {"content": "首次回答"}}],
                },
                {
                    "model": "deepseek-v4-flash",
                    "choices": [
                        {
                            "finish_reason": "length",
                            "message": {"content": "更完整的回答\n\n**处置建议"},
                        }
                    ],
                },
            ]
        )

        with patch.object(llm_assistant.httpx, "AsyncClient", return_value=client):
            result = await llm_assistant.request_deepseek_completion_with_retry(
                {"model": "deepseek-v4-flash", "messages": [], "max_tokens": 2400}
            )

        self.assertIn("更完整的回答", result["answer"])
        self.assertIn("回答达到输出上限", result["answer"])
        self.assertEqual(result["answer"].count("**") % 2, 0)
        self.assertTrue(result["retried"])
        self.assertTrue(result["partial"])

    async def test_preserves_first_content_when_retry_request_fails(self):
        client = FakeAsyncClient(
            [
                {
                    "model": "deepseek-v4-flash",
                    "choices": [{"finish_reason": "length", "message": {"content": "首次回答"}}],
                },
                httpx.ReadTimeout("重试超时"),
            ]
        )

        with patch.object(llm_assistant.httpx, "AsyncClient", return_value=client):
            result = await llm_assistant.request_deepseek_completion_with_retry(
                {"model": "deepseek-v4-flash", "messages": [], "max_tokens": 2400}
            )

        self.assertIn("首次回答", result["answer"])
        self.assertIn("回答达到输出上限", result["answer"])
        self.assertTrue(result["retried"])
        self.assertTrue(result["partial"])


if __name__ == "__main__":
    unittest.main()
