import unittest

from supplyguard.llm_assistant import assistant_retrieval_with_graph_rag


class SecurityAssistantGraphRagTests(unittest.TestCase):
    def test_assistant_retrieval_prefers_graph_rag_context(self):
        retrieval = assistant_retrieval_with_graph_rag(
            ["legacy item"],
            {"context": "GraphRAG context:\n- evidence"},
        )

        self.assertEqual(retrieval[0], "GraphRAG context:\n- evidence")
        self.assertIn("legacy item", retrieval)


if __name__ == "__main__":
    unittest.main()
