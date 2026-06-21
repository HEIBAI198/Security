from __future__ import annotations


def classify_graph_rag_intent(query: str) -> str:
    text = str(query or "").lower()
    if any(word in text for word in ("攻击路径", "attack path", "path", "链路")):
        return "attack_path"
    if any(word in text for word in ("运行", "日志", "runtime", "log", "外联")):
        return "runtime_evidence"
    if any(word in text for word in ("构建", "ci", "cd", "build", "artifact", "流水线")):
        return "build_risk"
    if any(word in text for word in ("依赖", "包", "package", "dependency", "恶意包")):
        return "dependency_risk"
    return "general"
