# GraphRAG + GNN 优化报告（2026-08-09 v3）

## 摘要

本轮把 GNN 从“防泄漏升级前的过拟合原型”修复为“数据可信、评估诚实、线上语义明确”的 v3 版本，并保持 GraphRAG 的多通道召回与证据链能力。

当前系统已形成完整链路：

- 平衡的 npm + PyPI 正负样本、固定时间外推切分、审计门禁。
- PyG GraphSAGE 训练与 embedding 导出（schema v6）。
- 后端 PyG / sklearn / 规则多级降级（NumPy fallback 已禁用）。
- GraphRAG 输出 channels、evidence table、retrieval trace、missing evidence、why_selected，embedding channel 已启用。
- 前端展示 GNN 决策状态、置信度、相似恶意包和 GraphRAG 召回原因。

## 数据集（v3）

| 项目 | 数量 |
| --- | ---: |
| 正样本（OpenSSF，npm 1200 + pypi 1200） | 2400 |
| 独立注册表审核正常包（npm 1784 + pypi 1785） | 3569 |
| hard negatives（全部可信来源） | 244 |
| 包节点 | 5969 |
| 异构事实边 | 44718 |
| 真实 depends_on 边 | 16679 |
| 归纳式训练边 | 15162 |
| train / val / test（时间外推 70/15/15） | 4178 / 895 / 896 |

数据质量状态：正样本占比 40.2%、PyPI 负样本占比 50.0%、负/正比 1.49、时间戳覆盖率 100%、正样本元数据覆盖率 41.6%，审计零 warning，`--fail-on-warning` 通过。

## GNN 训练结果

训练命令：

```powershell
D:\Anaconda3\Scripts\conda.exe run -n supplyguard-gnn python scripts\gnn\train_pyg_graphsage_package_risk.py --data storage\gnn_datasets\candidate\features-v3 --output storage\graph_models --epochs 80 --hidden-dim 64 --learning-rate 0.01 --dropout 0.3 --random-state 42 --require-audit-pass --edge-split-policy inductive --online-loss-weight 0.5 --max-edge-group-size 32 --max-train-positive-ratio 1.0 --device auto
```

环境：torch 2.7.0+cu128，CUDA 可用，NVIDIA GeForce RTX 4060 Laptop GPU。产物：`package_risk_graphsage.pt`、`package_embeddings.npy`、`package_embedding_index.json`、`graphsage_eval.json`。最佳轮次 12，温度 2.5，`decision_threshold=0.9`、`online_decision_threshold=0.9`。

评估（graphsage_eval.json，阈值 0.9）：

| Split | Samples | Accuracy | Precision | Recall | F1 | ROC-AUC | FPR@0.9 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| train | 4178 | 0.5991 | 1.0000 | 0.0030 | 0.0059 | 0.9769 | 0.0% |
| val | 895 | 0.7385 | 1.0000 | 0.3500 | 0.5185 | 0.9494 | 0.0% |
| test | 896 | 0.6886 | 0.9880 | 0.2278 | 0.3702 | 0.8847 | 0.19% |

说明：

- 测试集是时间外推（未来恶意包），当前 7 个名字/关键词特征只能覆盖一部分；`recall_at_fpr_0.05` 在 test 上约 0.23、val 上约 0.54、train 上约 0.81，说明特征越新越难外推，这正是诚实评估要暴露的问题。
- 无邻居在线模式：良包高分率（>=0.9）0.28%（v2 曾高达 39%），恶意包高分率 99.6%，`benign_mean_score` 0.459、`malicious_mean_score` 0.716。
- 旧版接近 100% 的指标来自标签同义词、来源格式代理变量和纯标签图团簇，已废弃；v3 的验收口径是“低误报 + 分布外拒判 + 演示案例正确”，不再追求虚高准确率。

## 关键改进

- 数据：正样本补齐 PyPI（1200），负样本从 624 扩到 3569 且含独立 PyPI 正常包；hard negatives 244 条；时间外推切分替代随机切分。
- 特征：契约 `runtime_package_features_v3`，保留 7 个验证过的基础特征；元数据存在性特征因来源代理风险被排除（提取器保留计算，待正样本元数据覆盖率提升后复用）。
- 阈值：从“验证集 F1 最优”改为“验证集良包 FPR 上限”（图模式 2%、无邻居 1%），并报告固定 FPR 召回。
- 在线语义：无邻居 abstain 策略、图模式关键词证据门控、OOD 拒判、演示校准包按原始分数判定；任何 GNN 结果不得降低综合风险。
- 降级：NumPy fallback 禁用，无 torch 环境返回 unavailable；PyG 是唯一可信后端。
- GraphRAG：embedding channel 已接入 `package_embeddings.npy`。

## GraphRAG 检索结果

输出字段：`intent`、`channels`（keyword / risk / attack_path / embedding）、`evidence_table`、`retrieval_trace`、`missing_evidence`、`why_selected`。评估脚本：`scripts/graphrag/evaluate_retrieval.py`，指标包括 `target_dependency_recall`、`target_attack_path_recall`、`evidence_coverage`、`retrieval_trace_completeness`。

## 系统集成与验收

- 后端加载优先级：PyG GraphSAGE -> sklearn -> 规则 fallback。
- `validate_runtime_artifact.py` 验收：pyg passed（react 良性、requests 不判恶意、x-trader-codec/event-stream 恶意、flatmap-stream 证据门控 abstain），numpy disabled。
- 前端依赖详情展示 GNN 决策状态、置信度、相似恶意包；`abstain`/`unavailable` 已映射为“GNN 暂不判定”/“模型不可用”。

## 风险与限制

- 当前特征仍以名字/关键词为主，时间外推测试召回有限，不能宣称“能检测所有恶意包”。
- 正样本元数据覆盖率 41.6%，生态特征暂不能安全加入契约。
- 无邻居单包模式的分数对无元数据输入保守（多走 abstain），属于设计行为。
- 恶意包池中 58% 已从注册表下架，无法补全元数据，这是数据本身的限制。

## 下一步建议

1. 提升正样本元数据覆盖率（历史存档/OSV 关联），再评估生态特征。
2. 引入下载量、维护者信誉、发布时间分布等外部信号。
3. 用真实 lockfile 批量验证 `depends_on` 图推理收益。
4. 持续用时间外推测试集报告 PR-AUC、固定 FPR 召回、Brier、ECE 和拒判率。
