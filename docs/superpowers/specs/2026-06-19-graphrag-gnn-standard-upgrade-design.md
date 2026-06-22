# GraphRAG + 标准 GNN 升级设计

日期：2026-06-19

适用工作树：`D:\NUAA\信息安全竞赛\Security\.worktrees\graphrag-gnn`

## 背景

当前 Security / SupplyGuard KG 已经有一条可运行的 GraphRAG + GNN 风格闭环：

- OpenSSF malicious-packages 清洗为正样本。
- 当前项目依赖抽取为弱负样本。
- `scripts/gnn/build_graph_features.py` 构造包节点、风险信号边和来源边。
- `scripts/gnn/train_graphsage_package_risk.py` 训练 NumPy GraphSAGE 风格模型。
- `supplyguard/gnn_risk.py` 给依赖打 `gnn_score`。
- `supplyguard/graph_rag.py` 做关键词种子召回、2 跳扩展、PageRank 排序和 GNN 分数加权。
- 前端安全平台展示 GNN 风险和 GraphRAG 证据卡。

这条链路适合一周内闭环演示，但现在用户有更充足时间，目标升级为“标准 GNN + 更可信数据 + 更强 GraphRAG 证据检索”。本设计不替换现有供应链扫描器，只增强依赖风险排序、图谱证据召回和 Copilot 解释能力。

## 目标

本次升级要达成以下目标：

1. 新建独立 Python 环境，安装 PyTorch 和 PyTorch Geometric，不污染当前可运行环境。
2. 用 PyTorch Geometric 实现标准 GraphSAGE 包风险模型，替换“仅 NumPy 风格”的 GNN 表述。
3. 增强负样本质量，引入生态级正常包负样本和 hard negatives。
4. 增加 train/validation/test 固定切分，减少同包泄漏，让指标更可信。
5. 导出 package embedding，让 GraphRAG 可以进行 embedding 召回或二阶段重排。
6. 将 GraphRAG 升级为多路召回、边类型约束扩展、统一重排和结构化上下文压缩。
7. 在后端和前端保留清晰 fallback，保证没有 GPU、没有 PyG 模型或模型损坏时系统仍可运行。
8. 增加 GNN 和 GraphRAG 评估脚本，生成可用于答辩和报告的指标。

非目标：

- 不重写现有 semgrep/SARIF/依赖审计扫描器。
- 不把主线改成异构图 GNN，异构图只作为后续升级方向。
- 不强制运行时依赖 GPU，训练可用 GPU，后端推理必须支持 CPU fallback。
- 不在本阶段引入外部向量数据库，embedding 召回先用本地 `.npy` 和轻量索引完成。

## 推荐路线

采用“标准 PyG GraphSAGE 先落地，预留 embedding rerank 接口”的路线。

备选方案比较：

- PyG GraphSAGE：工程量可控，和当前 package-package 投影图兼容，答辩时能明确说明使用了标准 GNN。
- 异构图 GNN：更贴合 package、risk_signal、source、ecosystem 多类型节点，但实现、调参和数据要求更高。
- GNN + GraphRAG reranker：融合效果最好，但需要先有稳定 embedding 和评估集。

本次主线选择 PyG GraphSAGE，同时导出 embedding，GraphRAG 先使用 embedding 做轻量相似召回和二阶段重排。异构图留作后续版本。

## 环境设计

新增专用环境，建议名称：`supplyguard-gnn`。

建议 Python 版本：3.11 或 3.12。当前 `D:\Anaconda3\python.exe` 是 Python 3.13.9，虽然部分包已支持 3.13，但 PyTorch Geometric 及其扩展在 3.11/3.12 上通常更稳。

环境原则：

- 不在当前 Anaconda base 环境直接安装 torch/PyG。
- 训练脚本可通过环境中的 `python` 运行。
- 现有后端和测试仍可用 `D:\Anaconda3\python.exe` 跑不依赖 PyG 的测试。
- PyG 相关测试在检测到 torch/PyG 不存在时应跳过或给出清晰提示。

文档中需要记录：

- 环境创建命令。
- PyTorch CUDA 安装命令。
- PyG 安装命令。
- CUDA 是否可用的检查命令。
- CPU fallback 说明。

## 数据增强设计

当前数据的主要短板是负样本数量和来源。升级后的训练数据分四类：

1. `malicious_packages.jsonl`
   - OpenSSF malicious-packages 正样本。
   - 保留 npm 和 PyPI。
   - 字段包括 package、ecosystem、aliases、affected_versions、published、modified、text、label。

2. `weak_negative_packages.jsonl`
   - 当前项目依赖、lock 文件和 SBOM 中出现但未标恶意的包。
   - 继续保留，作为“项目基线正常依赖”。

3. `ecosystem_negative_packages.jsonl`
   - 新增生态级正常包负样本。
   - 优先从 npm/PyPI 常见包元数据抽取。
   - 目标数量先按每个生态 5000 到 10000 个控制。
   - 字段至少包括 package、ecosystem、latest_version、description、keywords、maintainer_count、release_count、text、label。

4. `hard_negative_packages.jsonl`
   - 新增难负样本。
   - 包名或描述包含 token、auth、crypto、shell、install、download、proxy、credential 等敏感词，但没有恶意标注。
   - 用于降低模型只靠关键词误判的风险。

新增或扩展脚本：

- `scripts/gnn/build_ecosystem_negatives.py`
- `scripts/gnn/build_hard_negatives.py`
- `scripts/gnn/build_graph_features.py`

新增输出：

- `storage/gnn_datasets/features/splits.json`
- `storage/gnn_datasets/features/dataset_card.json`

切分规则：

- 按 `(ecosystem, normalized_package)` 分组切分，避免同包不同记录同时进入训练和测试。
- 按 label 和 ecosystem 分层，保持 npm/PyPI 和正负样本比例。
- 输出 train、val、test 三份 node id 列表。
- validation 用于 early stopping，test 只用于最终评估。

## 标准 GNN 训练设计

新增脚本：`scripts/gnn/train_pyg_graphsage_package_risk.py`

输入：

- `storage/gnn_datasets/features/train_nodes.jsonl`
- `storage/gnn_datasets/features/train_edges.jsonl`
- `storage/gnn_datasets/features/feature_schema.json`
- `storage/gnn_datasets/features/splits.json`

图构造：

- 第一阶段使用 package-package 投影图。
- 如果两个 package 共享风险信号或来源，则连接无向边。
- package 自身特征沿用现有数值特征，并加入新增生态元数据特征。
- 不在主线使用 HeteroData，避免第一版标准 GNN 过重。

模型：

- PyTorch Geometric `SAGEConv` 两层或三层。
- hidden dimension 默认 64。
- dropout 默认 0.2 到 0.4。
- class weight 或 weighted BCE 处理类别不平衡。
- early stopping 基于 validation F1 或 PR-AUC。

输出：

- `storage/graph_models/package_risk_graphsage.pt`
- `storage/graph_models/package_risk_graphsage_metadata.json`
- `storage/graph_models/package_embeddings.npy`
- `storage/graph_models/package_embedding_index.json`
- `storage/graph_models/graphsage_eval.json`

metadata 内容：

- model_type: `pyg_graphsage_package_risk`
- feature_names
- node_ids
- package_keys
- split summary
- training hyperparameters
- metric summary
- torch / torch_geometric / cuda 信息

## 后端 GNN 集成设计

新增模块：`supplyguard/gnn_models.py`

职责：

- 统一加载模型 artifact。
- 判断模型类型和版本。
- 提供 `predict_package_risk(payload)`。
- 提供 `similar_packages(payload)` 或 `nearest_embedding(node_id)`。
- 提供清晰的 fallback 原因。

调整模块：`supplyguard/gnn_risk.py`

职责：

- 保留当前业务接口。
- 不直接塞入过多 torch/PyG 细节。
- 将风险分、标签、解释、相似恶意包组织成 API 输出。

加载优先级：

1. `package_risk_graphsage.pt`
2. `package_risk_gnn.npz`
3. `package_risk.pkl`
4. rule fallback

返回字段扩展：

- `gnn_score`
- `gnn_label`
- `gnn_reasons`
- `gnn_model_available`
- `gnn_model_type`
- `gnn_confidence`
- `gnn_explanations`
- `similar_malicious_packages`

运行时原则：

- 后端启动时不能因为 torch/PyG 不存在而失败。
- 如果 PyG artifact 存在但加载失败，记录 `model_error` 并降级。
- CPU 推理必须可用。
- 在线单包推理如果没有完整邻居上下文，先使用自身特征和近邻索引 fallback，后续再接工作区图上下文推理。

## GraphRAG 升级设计

当前 `supplyguard/graph_rag.py` 可以保留对外入口，但内部拆成几个更小的模块。

新增模块：

- `supplyguard/graph_rag_intent.py`
- `supplyguard/graph_rag_retrievers.py`
- `supplyguard/graph_rag_ranker.py`
- `supplyguard/graph_rag_context.py`

保留模块：

- `supplyguard/graph_rag.py`

对外入口：

```python
graph_rag_retrieve(graph_payload, query, *, max_nodes=8, max_edges=12, max_paths=3, hops=2)
```

返回结构升级：

```python
{
  "query": "哪些依赖与恶意包模式相似？",
  "intent": "dependency_risk | build_risk | runtime_evidence | attack_path | general",
  "channels": {
    "keyword": [{"node_id": "dep:npm:example", "score": 1.8}],
    "risk": [{"node_id": "dep:npm:example", "score": 0.91}],
    "attack_path": [{"path_id": "path:dependency-to-runtime", "score": 88}],
    "embedding": [{"node_id": "dep:npm:similar", "similarity": 0.82}]
  },
  "top_nodes": [{"id": "dep:npm:example", "why_selected": ["keyword", "gnn_score"]}],
  "top_edges": [{"id": "edge:dependency-build", "why_selected": ["intent_edge_type"]}],
  "top_attack_paths": [{"id": "path:dependency-to-runtime", "why_selected": ["path_overlap"]}],
  "evidence_table": [{"kind": "dependency", "id": "dep:npm:example", "summary": "高 GNN 分数依赖"}],
  "retrieval_trace": [{"stage": "embedding", "detail": "召回相似恶意包模式"}],
  "missing_evidence": [{"kind": "runtime_log", "reason": "缺少运行期外联日志"}],
  "context": "GraphRAG context with ranked evidence and missing evidence notes"
}
```

召回通道：

- 关键词召回：包名、漏洞 ID、CWE、CI/CD、日志关键词。
- 风险召回：critical/high、高 `score`、高 `gnn_score`。
- 攻击路径召回：已有 `attack_paths` 中和问题相关的路径。
- embedding 召回：GraphSAGE embedding 中相似的 package 或恶意模式。

边类型约束：

- 依赖风险问题优先扩展 `DEPENDENCY_REACHES_BUILD`、`FINDING_AFFECTS`、`PACKAGE_HAS_VULN`。
- 构建风险问题优先扩展 CI/CD、artifact、provenance 相关边。
- 运行期证据问题优先扩展 `BUILD_TO_RUNTIME`、log/event 相关边。
- 攻击路径问题优先补全完整 path，而不是只取散点节点。

重排特征：

- lexical match
- PageRank / Personalized PageRank
- GNN risk score
- embedding similarity
- attack-path overlap
- evidence confidence
- evidence freshness when available

输出解释：

- 每个 top node / edge / path 增加 `why_selected`。
- `retrieval_trace` 记录 seed、扩展、重排原因。
- `missing_evidence` 说明当前问题缺少哪些证据，降低 LLM 幻觉。

## LLM Assistant 集成设计

调整 `supplyguard/llm_assistant.py`：

- `build_assistant_context` 接收升级后的 GraphRAG 结构。
- context 中优先注入 `answer_briefing` 和 `evidence_table`。
- retrieval 中保留传统文本片段作为 fallback。
- prompt 明确要求模型只基于 GraphRAG evidence 回答，并指出缺失证据。

调整 `supplyguard/routes/security.py`：

- `/assistant` 继续调用 `graph_rag_retrieve`。
- 返回 `graph_rag` 的新字段，保持旧字段兼容。
- GraphRAG 失败时不影响 assistant 基础回答。

## 前端展示设计

调整 `frontend/src/lib/security-api.ts`：

- 扩展 GraphRAG 响应类型。
- 扩展 GNN 字段类型。

调整 `frontend/src/features/security-platform/index.tsx`：

- 依赖详情展示 GNN 模型来源。
- 展示 `gnn_confidence` 和 `similar_malicious_packages`。
- GraphRAG 证据卡增加：
  - 召回通道命中。
  - `why_selected`。
  - `missing_evidence`。
  - top attack paths 的完整度提示。

UI 原则：

- 不重做整个安全平台页面。
- 保持现有卡片和面板结构。
- 把新增信息放在已有依赖详情和 Copilot 证据区域。

## 评估设计

新增脚本：`scripts/gnn/evaluate_package_risk.py`

指标：

- accuracy
- precision
- recall
- F1
- ROC-AUC
- PR-AUC
- top-k malicious hit rate
- confusion matrix

输出：

- `storage/graph_models/graphsage_eval.json`

新增脚本：`scripts/graphrag/evaluate_retrieval.py`

评估问题集：

- 当前项目最危险的供应链风险是什么？
- 哪些依赖与恶意包模式相似？
- 给我解释这条攻击路径为什么高风险。
- GraphRAG 召回了哪些证据？
- GNN 分数为什么会影响这个依赖的排序？

指标：

- target dependency recall@k
- target attack path recall@k
- evidence coverage
- missing evidence correctness
- retrieval trace completeness

输出：

- `storage/eval/graphrag_eval.json`
- `docs/graphrag-gnn-optimization-report.md`

## 测试设计

单元测试：

- 数据增强脚本能生成生态负样本和 hard negatives。
- `splits.json` 按包名分组且 train/val/test 不泄漏。
- PyG 训练脚本在缺少 torch/PyG 时给出清晰跳过或错误。
- PyG artifact 存在时后端优先加载。
- PyG artifact 加载失败时能回退到 NumPy / sklearn / rule。
- GraphRAG intent 能识别依赖、构建、运行期、攻击路径问题。
- GraphRAG 多路召回能返回 channels、why_selected、missing_evidence。

集成验证：

- `D:\Anaconda3\python.exe -m unittest discover -s tests` 仍然通过非 PyG 测试。
- 新环境中运行 PyG 训练和 PyG 专项测试。
- 前端 `npm run build` 通过。

## 交付顺序

1. 新建专门 Python 环境并验证 torch/PyG/CUDA。
2. 增强数据脚本和 `splits.json`。
3. 实现 PyG GraphSAGE 训练脚本和评估脚本。
4. 训练模型并导出 `.pt`、metadata、embedding。
5. 抽出 `gnn_models.py` 并接入后端 fallback。
6. 升级 GraphRAG 多路召回、重排和 context。
7. 调整 Assistant 和前端证据展示。
8. 补齐评估报告和实现文档。

## 风险与降级

PyG 安装失败：

- 保留当前 NumPy GraphSAGE 和 sklearn 链路。
- 文档记录失败原因和环境命令。
- 后端不依赖 PyG 启动。

生态负样本获取受限：

- 先用本地项目依赖和已有缓存包元数据。
- 支持用户手动放置 npm/PyPI 元数据 JSONL。
- 脚本设计为可增量导入。

模型指标不稳定：

- 使用固定 split。
- 报告 PR-AUC、F1、top-k，而不是只报 accuracy。
- 调整 hard negative 比例和 class weight。

GraphRAG 召回过多：

- 按 intent 限制边类型。
- 限制每个通道候选数量。
- 使用统一 reranker 和上下文预算。

## 验收标准

实现完成后，应满足：

- 专用环境可以运行 PyG GraphSAGE 训练。
- 至少生成一个 `package_risk_graphsage.pt` artifact。
- 后端能优先加载 PyG 模型，并在失败时降级。
- GraphRAG 返回 channels、retrieval_trace、why_selected、missing_evidence。
- 前端能展示 GNN 模型来源、相似恶意包和 GraphRAG 召回原因。
- GNN 和 GraphRAG 评估脚本能输出 JSON 指标。
- Python 非 PyG 测试、PyG 专项测试和前端构建均通过。
