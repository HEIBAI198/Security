# GraphRAG + GNN 实现说明

本文记录 Security / SupplyGuard KG 项目中 GraphRAG + GNN 风险增强的落地方案，面向竞赛答辩、复现和后续维护。

## 总体目标

本轮优化不是替换现有扫描器，而是在依赖审计、知识图谱和安全助手之上增加两层能力：

- 用 OpenSSF malicious-packages 数据训练包级风险模型，为依赖输出 `gnn_score`、`gnn_label`、`gnn_model_type`、`gnn_confidence`、`gnn_explanations` 和相似恶意包证据。
- 用 GraphRAG 从知识图谱中召回相关节点、边和攻击路径，让 Copilot 回答带有结构化证据、召回轨迹和缺失证据提示。

一句话概括：

> GNN 给依赖包提供图风险排序信号，GraphRAG 把依赖、构建、产物、运行日志和攻击路径串成可解释证据链。

## 数据来源

正样本：

- 数据集：OpenSSF malicious-packages
- 本地路径：`D:\datasets\malicious-packages`
- 清洗后文件：`storage\gnn_datasets\malicious_packages.jsonl`
- 当前规模：10000 条正样本

负样本：

- weak negatives：从当前项目依赖文件、锁文件和 SBOM 中构造，当前写入 689 条。
- ecosystem negatives：本机未发现 `D:\datasets\package-metadata\npm_pypi_metadata.jsonl`，因此使用 weak negatives 作为本地种子。
- hard negatives：从 ecosystem negatives 中筛选近似高风险但未标恶意的样本，当前写入 8 条。

图特征数据：

- 输出目录：`storage\gnn_datasets\features`
- 节点数：10689
- 原始图边数：20485
- 训练脚本构造的 package-package 边数：25167052
- split：train 7482 / val 1603 / test 1604
- 数据卡：`dataset_card.json`
- 固定切分：`splits.json`

## 数据流水线命令

```powershell
D:\Anaconda3\python.exe scripts\gnn\build_weak_negatives.py --root . --output storage\gnn_datasets\weak_negative_packages.jsonl --positive-path storage\gnn_datasets\malicious_packages.jsonl
Copy-Item storage\gnn_datasets\weak_negative_packages.jsonl storage\gnn_datasets\ecosystem_negative_packages.jsonl
D:\Anaconda3\python.exe scripts\gnn\build_hard_negatives.py --negative-path storage\gnn_datasets\ecosystem_negative_packages.jsonl --output storage\gnn_datasets\hard_negative_packages.jsonl --limit 5000
D:\Anaconda3\python.exe scripts\gnn\build_graph_features.py --positive storage\gnn_datasets\malicious_packages.jsonl --negative storage\gnn_datasets\weak_negative_packages.jsonl --negative storage\gnn_datasets\ecosystem_negative_packages.jsonl --negative storage\gnn_datasets\hard_negative_packages.jsonl --output storage\gnn_datasets\features
```

## 模型训练

推荐模型：PyTorch Geometric GraphSAGE。

专用环境：

```powershell
conda create -n supplyguard-gnn python=3.11 -y
conda run -n supplyguard-gnn python -m pip install -r requirements-gnn-pyg.txt
```

本次环境验证结果：

- Python：`D:\Anaconda3\envs\supplyguard-gnn\python.exe`
- torch：`2.12.1+cpu`
- PyG：`2.8.0`
- CUDA：不可用。本次训练使用 CPU wheel 完成；如需 GPU 加速，需替换为 CUDA 版 PyTorch wheel。

训练命令：

```powershell
D:\Anaconda3\Scripts\conda.exe run -n supplyguard-gnn python scripts\gnn\train_pyg_graphsage_package_risk.py --data storage\gnn_datasets\features --output storage\graph_models --epochs 80 --hidden-dim 64 --learning-rate 0.01 --dropout 0.3 --random-state 42
```

主要输出：

- `storage\graph_models\package_risk_graphsage.pt`
- `storage\graph_models\package_risk_graphsage_metadata.json`
- `storage\graph_models\package_embeddings.npy`
- `storage\graph_models\package_embedding_index.json`
- `storage\graph_models\graphsage_eval.json`

当前测试集指标：

```json
{
  "accuracy": 0.9993765586034913,
  "precision": 1.0,
  "recall": 0.9993328885923949,
  "f1": 0.9996663329996663,
  "samples": 1604
}
```

注意：当前负样本仍以项目内弱负样本为主，指标只能说明在当前构造数据和固定 split 上模型能学到区分信号，不能宣称真实世界恶意包检测准确率接近 100%。

## 模型加载与降级

后端加载优先级：

1. PyG GraphSAGE：`package_risk_graphsage.pt`
2. NumPy GraphSAGE fallback：`package_risk_gnn.npz`
3. scikit-learn fallback：`package_risk.pkl`
4. 规则 fallback：基于 install script、漏洞、关键词和已有风险分

基础运行环境不强依赖 PyTorch/PyG。如果后端环境没有 torch，会稳定降级到 NumPy GraphSAGE 或规则评分。本次验证：

- `supplyguard-gnn` 环境能加载 PyG 模型，返回 `gnn_model_type = pyg_graphsage_package_risk`。
- base 环境无 torch 时能回退，返回 `gnn_model_type = numpy_graphsage_mean_aggregator`，并在 `model_error` 中说明 PyG inference 缺依赖。

## GraphRAG 检索

核心函数：

```python
graph_rag_retrieve(graph_payload, question)
```

输出保持旧字段兼容，并新增：

- `intent`
- `channels`
- `evidence_table`
- `retrieval_trace`
- `missing_evidence`

支持的 intent：

- `dependency_risk`
- `build_risk`
- `runtime_evidence`
- `attack_path`
- `general`

召回通道：

- `keyword`：关键词召回节点和路径。
- `risk`：高风险/GNN 高分节点召回。
- `attack_path`：按问题意图或路径文本重合召回攻击路径。
- `embedding`：为后续 embedding 相似召回预留；未配置时稳定返回空列表。

排序逻辑：

- 多 seed 的 2-hop graph expansion。
- Personalized PageRank。
- 节点风险分与 GNN score 加权。
- intent 边类型偏好，例如 `DEPENDENCY_REACHES_BUILD`、`FINDING_AFFECTS`、`PACKAGE_HAS_VULN`、`BUILD_TO_RUNTIME`。
- path-aware edge selection，避免返回攻击路径但丢失关键边。
- nodes / edges / paths 均输出 `why_selected`。

防御性处理：

- `graph_payload=None`、`nodes=None`、`attack_paths=None`、`query=None` 不会导致检索崩溃。
- 非数值 score、空 `node_ids` / `edge_ids` 会安全降级。
- 同分节点使用 id/label 做稳定 tie-breaker，便于 UI 和报告复现。

## Assistant 和前端集成

Assistant context 现在会包含：

- GraphRAG 原始 context 文本
- intent
- evidence table
- missing evidence
- retrieval trace
- top nodes / edges / attack paths

前端增强：

- 依赖详情显示 GNN 模型类型、置信度、解释和相似恶意包。
- Copilot 右侧 GraphRAG 证据卡显示 intent、通道命中数、证据压缩表、检索轨迹、证据缺口和 `why_selected`。
- 不改导航和主布局，只在既有工作台面板中增加可扫描证据。

## 评估脚本

GNN 评估：

```powershell
D:\Anaconda3\python.exe scripts\gnn\evaluate_package_risk.py --predictions storage\graph_models\...
```

GraphRAG 检索评估：

```powershell
D:\Anaconda3\python.exe scripts\graphrag\evaluate_retrieval.py --cases-json storage\eval\graphrag_cases.json --output storage\eval\graphrag_eval.json
```

指标包括：

- `target_dependency_recall`
- `target_attack_path_recall`
- `evidence_coverage`
- `retrieval_trace_completeness`

## 验证命令

```powershell
D:\Anaconda3\python.exe -m unittest discover -s tests
D:\Anaconda3\python.exe -m py_compile supplyguard\gnn_models.py supplyguard\gnn_risk.py supplyguard\graph_rag.py supplyguard\graph_rag_intent.py supplyguard\graph_rag_retrievers.py supplyguard\graph_rag_ranker.py supplyguard\graph_rag_context.py supplyguard\llm_assistant.py supplyguard\routes\security.py scripts\gnn\dataset_utils.py scripts\gnn\build_ecosystem_negatives.py scripts\gnn\build_hard_negatives.py scripts\gnn\build_graph_features.py scripts\gnn\train_pyg_graphsage_package_risk.py scripts\gnn\evaluate_package_risk.py scripts\graphrag\evaluate_retrieval.py
cd frontend
npm run build
```

## 演示问题

- 哪些依赖与恶意包模式相似？
- 构建流程有什么风险？
- 运行期日志有没有异常外联？
- 解释这条攻击路径为什么高风险。
- GraphRAG 召回了哪些证据，哪些证据还缺失？

## 后续增强

- 替换为 CUDA 版 PyTorch wheel，减少训练时间。
- 引入更高质量的 npm/PyPI 正常包元数据作为 ecosystem negatives。
- 增加维护者、下载量、发布时间、版本发布频率等生态特征。
- 将 `package_embeddings.npy` 接入 GraphRAG embedding channel。
- 在报告导出中加入 GraphRAG 证据摘要和 GNN 风险分布图。
