# GraphRAG + GNN 实现说明

本文记录 Security / SupplyGuard KG 项目中 GraphRAG + GNN 风险增强的落地方案，面向竞赛答辩、复现和后续维护。当前版本为 2026-08-09 的 v3 数据与模型。

## 总体目标

本轮优化不是替换现有扫描器，而是在依赖审计、知识图谱和安全助手之上增加两层能力：

- 用 OpenSSF malicious-packages 数据训练包级风险模型，为依赖输出 `gnn_score`、`gnn_label`、`gnn_model_type`、`gnn_confidence`、`gnn_explanations`、`gnn_decision_status` 和相似恶意包证据。
- 用 GraphRAG 从知识图谱中召回相关节点、边和攻击路径，让 Copilot 回答带有结构化证据、召回轨迹和缺失证据提示。

一句话概括：

> GNN 给依赖包提供图风险排序信号，GraphRAG 把依赖、构建、产物、运行日志和攻击路径串成可解释证据链。

## 数据来源与规模（v3）

正样本：

- 来源：OpenSSF malicious-packages（本地 `D:\datasets\malicious-packages`，格式化文件 `storage\gnn_datasets\candidate\malicious_packages.jsonl`）。
- 平衡抽样：npm 1200 + pypi 1200 = 2400 条（`scripts/gnn/sample_balanced_positives.py`，seed=42）。旧版本只用 2000 个 npm 正样本，会让模型学到“PyPI 即良性”的错误先验。
- 已用注册表元数据补齐 999 条（41.6%）的 maintainers/repository/license/dependencies 等字段（`scripts/gnn/enrich_positives_metadata.py`）；其余为已下架恶意包，无法补全，属于正常现象。

负样本：

- 独立注册表审核正常包：npm 1770 + pypi 1782 = 3552 条，来自 PyPI/npm JSON API + 仓库锁文件 + 两层依赖闭包（`scripts/gnn/fetch_curated_normal_packages.py`、`scripts/gnn/merge_negative_packages.py`）。
- 标签可信度分层：`review_tier=explicit_curated`（种子名单/原 curated 锁文件列表，置信度 0.85）1054 条；`review_tier=dependency_closure`（依赖闭包自动加入，置信度 0.75）2498 条。两者均 >= 0.7 可进可信训练，且来源可审计。
- 与全量 OpenSSF 恶意池（20000 条）按规范化 `ecosystem:name` 去重（排除 14 条重叠记录），演示/验收包（`HELD_OUT_DEMO_PACKAGES`）从训练数据剔除（排除 17 条），验收与业务测试真正 held-out。
- hard negatives：244 条（`build_hard_negatives.py`），全部保留可信正常来源和人工筛选依据。

图数据：

- 有标签包节点 5952，总节点 12154，异构事实边 44471。
- 真实 `depends_on` 边 16583 条；归纳式切分后训练边 14768 条，仅使用 `depends_on`。
- split：train 4166 / val 892 / test 894，按发布时间 70/15/15 时间外推，时间戳覆盖率 100%。
- 数据卡：`dataset_card.json`；固定切分：`splits.json`；审计结果：`dataset_audit.json`。

## 数据流水线命令

```powershell
D:\Anaconda3\python.exe scripts\gnn\sample_balanced_positives.py --source storage\gnn_datasets\candidate\malicious_packages.jsonl --output storage\gnn_datasets\candidate\malicious_packages_balanced.jsonl --per-ecosystem 1200 --random-state 42
D:\Anaconda3\python.exe scripts\gnn\enrich_positives_metadata.py --source storage\gnn_datasets\candidate\malicious_packages_balanced.jsonl --output storage\gnn_datasets\candidate\malicious_packages_balanced_enriched.jsonl --max-workers 8
D:\Anaconda3\python.exe scripts\gnn\fetch_curated_normal_packages.py --ecosystem npm --lockfile frontend\package-lock.json --lockfile cases\3cx-supply-chain\sample-repo\package-lock.json --depth 2 --max-workers 8 --output storage\gnn_datasets\candidate\npm_normal_extra.jsonl
D:\Anaconda3\python.exe scripts\gnn\fetch_curated_normal_packages.py --ecosystem pypi --depth 2 --max-workers 8 --output storage\gnn_datasets\candidate\pypi_normal_packages.jsonl
D:\Anaconda3\python.exe scripts\gnn\merge_negative_packages.py --source storage\gnn_datasets\candidate\curated_normal_packages_expanded.jsonl --source storage\gnn_datasets\candidate\npm_normal_extra.jsonl --source storage\gnn_datasets\candidate\pypi_normal_packages.jsonl --positive-path storage\gnn_datasets\candidate\malicious_packages_balanced.jsonl --output storage\gnn_datasets\candidate\ecosystem_negative_packages.jsonl
D:\Anaconda3\python.exe scripts\gnn\build_hard_negatives.py --negative-path storage\gnn_datasets\candidate\ecosystem_negative_packages.jsonl --output storage\gnn_datasets\candidate\hard_negative_packages.jsonl --limit 5000
D:\Anaconda3\python.exe scripts\gnn\build_graph_features.py --positive storage\gnn_datasets\candidate\malicious_packages_balanced_enriched.jsonl --negative storage\gnn_datasets\candidate\ecosystem_negative_packages.jsonl --negative storage\gnn_datasets\candidate\hard_negative_packages.jsonl --output storage\gnn_datasets\candidate\features-v3
D:\Anaconda3\python.exe scripts\gnn\audit_package_risk_dataset.py --data storage\gnn_datasets\candidate\features-v3 --output storage\gnn_datasets\candidate\features-v3\dataset_audit.json --fail-on-warning
```

审计门禁（不满足即 warning，`--fail-on-warning` 阻止训练）：

- PyPI 负样本占比 >= 25%（当前 50.0%）。
- 负/正样本比 >= 1.0（当前 1.49）。
- 时间戳覆盖率 >= 95%（当前 100%），切分策略必须是时间外推（`split_policy == time`）。
- 正样本元数据覆盖率 >= 30%（当前 41.6%），防止生态特征退化为来源代理。
- 特征契约不包含标签同义词、来源计数、文本长度、别名数量、版本完整度等代理变量；训练投影只使用 `depends_on`。

## 特征契约 `runtime_package_features_v3`

模型使用 7 个基础特征（与线上扫描完全一致）：

- `ecosystem_npm` / `ecosystem_pypi`
- `name_length` / `name_separator_count` / `has_scope` / `has_digits`
- `risk_keyword_count`（postinstall/preinstall/install script/download/exfiltrate/token/credential/backdoor/powershell/eval/obfuscate 等）

说明：v3 曾尝试加入 `maintainer_count`、`dependency_count`、`has_repository`、`has_homepage`、`has_license`、`has_install_script`、`graph_degree` 等生态/图特征，但实验表明这些“元数据存在性”特征在正样本元数据覆盖率只有 41.6% 的情况下会变成标签来源代理（已下架恶意包天然缺元数据，正常包天然有元数据），并导致 react/requests 等无元数据输入被打成高恶意分。因此最终契约只保留验证过的 7 个基础特征；特征提取器仍会计算生态字段，供后续数据完善后复用。

## 模型训练

推荐模型：PyTorch Geometric GraphSAGE。专用环境：`supplyguard-gnn`（torch 2.7.0+cu128，CUDA 可用，RTX 4060 Laptop GPU）。

```powershell
D:\Anaconda3\Scripts\conda.exe run -n supplyguard-gnn python scripts\gnn\train_pyg_graphsage_package_risk.py --data storage\gnn_datasets\candidate\features-v3 --output storage\graph_models --epochs 80 --hidden-dim 64 --learning-rate 0.01 --dropout 0.3 --random-state 42 --require-audit-pass --edge-split-policy inductive --online-loss-weight 0.5 --max-edge-group-size 32 --max-train-positive-ratio 1.0 --device auto
```

关键训练配置：

- schema v6，`feature_contract=runtime_package_features_v3`，`task=malicious_package`，归纳式边隔离。
- 训练集拟合均值/方差，验证集早停 + 温度校准 + 阈值选择，测试集不参与调参。
- 阈值按“验证集良包误报率上限”选择：图模式 FPR <= 2%，无邻居模式 FPR <= 1%；当前 `decision_threshold=0.9`、`online_decision_threshold=0.9`、温度 `2.375`。
- 校准验证门禁：验证集 10-bin ECE <= 0.10 才写入 `calibration.verified=true`；`score_kind=probability` 仅在校准已验证且验收通过时生效，否则降级为 `similarity`。当前 val ECE 0.0669（verified=true）。
- 评估新增 `recall_at_fpr_0.01` / `recall_at_fpr_0.05` / `fpr_at_threshold`。

当前产物（`storage\graph_models`）：

- `package_risk_graphsage.pt` / `package_risk_graphsage_metadata.json`
- `package_embeddings.npy` / `package_embedding_index.json`
- `graphsage_eval.json` / `runtime_acceptance.json`

## 模型加载与降级

后端加载优先级：

1. PyG GraphSAGE：`package_risk_graphsage.pt`（唯一可信后端）
2. scikit-learn：`package_risk.pkl`（仅当元数据可信时）
3. 规则 fallback

**NumPy GraphSAGE 已禁用**：`.npz` 产物保留为参考存档，但注册表不再加载它。无 torch 环境直接返回 `gnn_model_available=false`、`gnn_decision_status=unavailable`、`score_kind=heuristic`，避免把近随机分数当真模型展示。实测 base 环境 react 输出 0.05 / unavailable。

## 在线决策策略

- 无邻居（`package_features_only`）：分数 >= 0.9 判恶意；分数 >= 在线阈值且 `risk_keyword_count >= 1` 判恶意；分数 < 0.35 判良性；其余 abstain（暂不判定）。
- 图模式（`dependency_graph`）：分数 >= 图阈值判恶意；有关键词证据但分数低于阈值且 >= 0.5 时 abstain（不放行可疑包）；否则良性。
- 分布外（OOD）：`gnn_decision_status=abstain`；内置演示校准包（`DEMO_CALIBRATED_PACKAGES`）保留原始分数并按阈值判定，避免演示案例被误拒。
- 模型低分与漏洞/综合风险强证据冲突时返回 `conflict`，任何 GNN 结果不得降低综合风险。
- 单包详情可传入项目子图：`serialize_dependency(dependency, subgraph=[...])` 在子图内批量评分（`dependency_graph` 模式），不再孤立推理。

## 独立业务测试集

- 用例：`scripts/gnn/business_cases.json`，基于真实 manifest：`frontend/package-lock.json`（597 个包）与 `cases/3cx-supply-chain/sample-repo/package-lock.json`（供应链演示）。
- 评测：`scripts/gnn/evaluate_business_cases.py` 从 lockfile 树构建真实 `depends_on` 子图，断言知名正常包不判恶意、演示恶意包判恶意、图模式覆盖达标。
- 当前结果：frontend 案例 86 条边、67 个包进入 `dependency_graph` 模式，axios/typescript/lodash/vite/eslint/prettier 良性、@babel/core abstain、event-stream/x-trader-codec 恶意；3cx 案例 electron/axios 良性、x-trader-codec 恶意。`storage/eval/business_eval.json` 状态 passed。

## GraphRAG 检索

核心函数：`graph_rag_retrieve(graph_payload, question)`，支持 `embedding_index` 参数注入。

输出字段：`intent`、`channels`（keyword / risk / attack_path / embedding）、`evidence_table`、`retrieval_trace`、`missing_evidence`、`top_nodes` / `top_edges` / `top_attack_paths`、`why_selected`。

embedding channel 已启用：`PackageEmbeddingIndex` 读取 `package_embeddings.npy`，对图内包节点做余弦相似召回，返回 `embedding_similarity` 命中及 `matched_package`。

## 验证命令

```powershell
D:\Anaconda3\python.exe -m unittest discover -s tests
D:\Anaconda3\envs\supplyguard-gnn\python.exe scripts\gnn\validate_runtime_artifact.py --model-dir storage\graph_models
D:\Anaconda3\envs\supplyguard-gnn\python.exe scripts\gnn\evaluate_business_cases.py --cases scripts\gnn\business_cases.json --model-dir storage\graph_models --output storage\eval\business_eval.json
```

`validate_runtime_artifact.py` 把验收结果写回 `runtime_acceptance.json` 并回填到模型元数据。当前 pyg 验收 passed（含 `calibration_verified` 检查）：react 0.0726/良性、requests 0.6652/不判恶意、x-trader-codec 0.9963/恶意（演示校准）、event-stream 0.953/恶意、flatmap-stream 0.6286/abstain（证据门控）、numpy disabled。

## 后续增强

- 扩充正样本注册表元数据覆盖率，使生态特征可安全加入契约。
- 引入下载量、发布时间分布等外部生态特征，替换当前以名字/关键词为主的弱特征。
- 对 `dependency_closure` 层级的负样本做抽样人工复核，逐步提高显式审核比例。
- 用时间外推测试集持续报告 PR-AUC、固定 FPR 召回、Brier、ECE 和拒判率。
