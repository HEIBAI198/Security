import unittest

from scripts.graphrag.evaluate_retrieval import evaluate_retrieval_cases


class GraphRagEvaluationTests(unittest.TestCase):
    def test_evaluates_dependency_and_path_recall(self):
        cases = [
            {
                "query": "evil dependency risk",
                "expected_node_ids": ["dep:evil"],
                "expected_path_ids": ["path:1"],
                "result": {
                    "top_nodes": [{"id": "dep:evil"}],
                    "top_attack_paths": [{"id": "path:1"}],
                    "evidence_table": [{"id": "dep:evil"}],
                    "retrieval_trace": [{"stage": "keyword"}],
                    "channels": {"embedding": [{"id": "dep:near"}]},
                },
            }
        ]

        metrics = evaluate_retrieval_cases(cases)

        self.assertEqual(metrics["case_count"], 1)
        self.assertEqual(metrics["target_dependency_recall"], 1.0)
        self.assertEqual(metrics["target_attack_path_recall"], 1.0)
        self.assertEqual(metrics["retrieval_trace_completeness"], 1.0)
        self.assertEqual(metrics["embedding_channel_hit_rate"], 1.0)


if __name__ == "__main__":
    unittest.main()
