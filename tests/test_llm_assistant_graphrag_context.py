import unittest

from supplyguard.llm_assistant import build_assistant_context


class AssistantGraphRagContextTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
