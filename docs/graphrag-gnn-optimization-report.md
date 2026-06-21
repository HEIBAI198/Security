# GraphRAG + GNN 优化报告

## 摘要

本轮优化将原有轻量 GNN 原型升级为 PyTorch Geometric GraphSAGE 训练闭环，并将 GraphRAG 从关键词 + 2 跳扩展增强为多通道召回、intent-aware rerank、攻击路径约束、结构化证据压缩和缺失证据提示。

当前系统已经形成完整链路：

- OpenSSF malicious-packages 清洗与负样本构造。
- 固定 train / validation / test split。
- PyG GraphSAGE 训练与 embedding 导出。
- 后端 PyG / NumPy / sklearn / 规则多级 fallback。
- GraphRAG 输出 channels、evidence table、retrieval trace、missing evidence 和 why_selected。
- 前端展示 GNN 模型证据和 GraphRAG 召回原因。

## 数据集

| 项目 | 数量 |
| --- | ---: |
| 正样本 | 10000 |
| weak negatives | 689 |
| ecosystem negatives | 689 |
| hard negatives | 8 |
| 特征节点 | 10689 |
| 原始图边 | 20485 |
| GraphSAGE package-package 边 | 25167052 |
| train / val / test | 7482 / 1603 / 1604 |

本机没有发现 `D:\datasets\package-metadata\npm_pypi_metadata.jsonl`，因此 ecosystem negatives 暂时复用 weak negatives。这个选择能保证训练流程闭环，但负样本多样性仍然有限。

## GNN 训练结果

训练命令：

```powershell
D:\Anaconda3\Scripts\conda.exe run -n supplyguard-gnn python scripts\gnn\train_pyg_graphsage_package_risk.py --data storage\gnn_datasets\features --output storage\graph_models --epochs 80 --hidden-dim 64 --learning-rate 0.01 --dropout 0.3 --random-state 42
```

环境结果：

- `torch 2.12.1+cpu`
- `torch_geometric 2.8.0`
- `cuda_available = False`

训练结果来自 `storage\graph_models\graphsage_eval.json`：

| Split | Samples | Accuracy | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: | ---: |
| train | 7482 | 0.9999 | 1.0000 | 0.9999 | 0.9999 |
| val | 1603 | 0.9994 | 1.0000 | 0.9993 | 0.9997 |
| test | 1604 | 0.9994 | 1.0000 | 0.9993 | 0.9997 |

说明：

- 当前 PyG 训练已经成功产出 `package_risk_graphsage.pt`、`package_embeddings.npy` 和 `package_embedding_index.json`。
- 本次是 CPU 训练，不是 GPU 训练；如需展示 GPU 加速，需要替换 CUDA 版 PyTorch。
- 高指标主要来自当前正负样本构造方式，不应解释为真实世界检测准确率。

## GraphRAG 检索结果

本轮 GraphRAG 输出字段：

- `intent`
- `channels`
- `evidence_table`
- `retrieval_trace`
- `missing_evidence`
- `why_selected`

新增检索能力：

- intent 分类覆盖依赖、构建、运行期、攻击路径和通用问题。
- 多通道召回覆盖关键词、风险/GNN、攻击路径和预留 embedding。
- 多 seed 2-hop expansion 修复了共享节点先深后浅导致的漏召回。
- path-aware edge selection 保证命中攻击路径时保留关键边。
- malformed payload、非数值 score 和空列表字段会安全降级。

GraphRAG 评估脚本：

```powershell
D:\Anaconda3\python.exe scripts\graphrag\evaluate_retrieval.py --cases-json storage\eval\graphrag_cases.json --output storage\eval\graphrag_eval.json
```

可输出：

- `target_dependency_recall`
- `target_attack_path_recall`
- `evidence_coverage`
- `retrieval_trace_completeness`

## 系统集成

后端模型加载优先级：

1. `pyg_graphsage_package_risk`
2. `numpy_graphsage_mean_aggregator`
3. scikit-learn package risk model
4. rule fallback

验证结果：

- 在 `supplyguard-gnn` 环境中，后端可加载 PyG 模型并返回 `gnn_model_type = pyg_graphsage_package_risk`。
- 在 base 环境中，由于没有 torch，后端自动回退到 NumPy GraphSAGE，并返回可用的 `gnn_score`、`gnn_confidence`、`gnn_explanations`。

前端展示增强：

- 依赖详情展示 GNN 模型类型、置信度、相似恶意包和解释。
- GraphRAG 证据卡展示 intent、通道命中数、证据表、检索轨迹、证据缺口和召回原因。
- 布局保持在原有 Security 工作台内，没有重做导航。

## 风险与限制

- 当前负样本仍可能包含未发现风险的真实包，标签质量需要继续提升。
- ecosystem negatives 目前缺少独立 npm/PyPI 元数据，泛化评估不足。
- PyG 当前安装的是 CPU wheel，训练已完成但没有使用 GPU。
- 单包在线推理缺少完整训练图邻居上下文时，会依赖 fallback 特征和模型降级。
- `package_embeddings.npy` 已产出，但 GraphRAG embedding channel 仍是稳定空实现，后续需要接入 embedding 相似召回。

## 下一步建议

1. 安装 CUDA 版 PyTorch 并复跑训练，记录 GPU 训练耗时。
2. 补充 npm/PyPI 正常包元数据，重建 ecosystem negatives。
3. 将 PyG 导出的 package embedding 接入 GraphRAG `embedding` channel。
4. 为 GraphRAG 构造固定评估 case 文件，生成 `storage\eval\graphrag_eval.json`。
5. 在导出报告中加入 GNN 风险分布和 GraphRAG 证据摘要。
