import unittest

from supplyguard.graph_rag_intent import classify_graph_rag_intent


class GraphRagIntentTests(unittest.TestCase):
    def test_dependency_question(self):
        self.assertEqual(classify_graph_rag_intent("哪些依赖与恶意包模式相似？"), "dependency_risk")

    def test_build_question(self):
        self.assertEqual(classify_graph_rag_intent("构建流程有什么风险？"), "build_risk")

    def test_runtime_question(self):
        self.assertEqual(classify_graph_rag_intent("运行期日志有没有异常外联？"), "runtime_evidence")

    def test_attack_path_question(self):
        self.assertEqual(classify_graph_rag_intent("解释这条攻击路径为什么高风险"), "attack_path")

    def test_none_query_defaults_to_general(self):
        self.assertEqual(classify_graph_rag_intent(None), "general")


if __name__ == "__main__":
    unittest.main()
