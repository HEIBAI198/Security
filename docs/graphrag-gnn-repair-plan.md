# GNN 恶意包判定修复计划（v3 完成版）

## 目标与问题边界

依赖综合风险与 GNN 模型分数是两个不同指标：

- 综合风险衡量漏洞、可达性、调用链、构建和运行证据。
- GNN 只判断依赖包是否具有恶意包行为特征。

`axios@1.6.8` 的综合风险为 `100/100`，GNN 恶意包相似度可能很低。这两个结果可以同时成立，但界面不得把后者显示成“总体风险”。本次修复不把模型分数强行提高到 100，而是修正指标语义、冲突状态、模型产物门禁和部署验收。

## 修复内容

### 指标语义与决策状态

保留 `gnn_score` 等兼容字段，新增：

- `gnn_decision_status`：`malicious`、`benign`、`conflict`、`abstain`、`unavailable`。
- `gnn_score_kind`：`probability`、`similarity`、`heuristic`。
- `gnn_artifact_id`、`gnn_data_quality_status`、`gnn_dataset_version`、`gnn_decision_threshold`、`gnn_calibration_temperature`、`gnn_ood_distance`。

决策规则：

- 无邻居（单包）模式：>= 0.9 判恶意；>= 在线阈值且有关键词证据判恶意；< 0.35 判良性；其余 abstain。
- 图模式：>= 图阈值判恶意；有关键词证据但低于阈值且 >= 0.5 时 abstain；否则良性。
- 分布外输入 abstain；演示校准包按原始分数判定。
- 低 GNN 分数与漏洞/综合风险强证据冲突时返回 `conflict`；任何 GNN 结果不能降低综合风险。

### 模型产物门禁

可信概率模型必须携带版本化元数据并满足：

- `schema_version >= 6`、`feature_contract == runtime_package_features_v3`、`task == malicious_package`、`training_status == trained`、`data_quality_status == passed`、`edge_split_policy == inductive`。
- 存在验证集决策阈值、温度校准、数据集审计、数据哈希、产物 ID、训练时间和 `runtime_acceptance.status == passed`。

缺少字段的旧模型标记为 `legacy`，不再以可信 GNN 概率加载。

### 数据、训练与部署（v3 已完成）

- 正样本 2400（npm 1200 + pypi 1200，OpenSSF，seed=42），负样本 3569（npm 1784 + pypi 1785 独立注册表审核），hard negatives 244，包节点 5969，`depends_on` 16679。
- 时间外推切分（70/15/15），时间戳覆盖率 100%；审计零 warning，`--fail-on-warning` 通过。
- 特征契约 `runtime_package_features_v3` 使用 7 个基础特征；元数据存在性特征因来源代理风险暂不进入契约。
- 阈值按验证集良包 FPR 上限选择（图模式 2%、无邻居 1%）；当前 0.9/0.9，温度 2.5。
- **NumPy fallback 已禁用**：PyG 是唯一可信后端；无 torch 环境返回 unavailable。

## 验收标准（v3 结果）

- `validate_runtime_artifact.py`：pyg `passed`（react 0.0766 良性、requests 0.6458 不判恶意、x-trader-codec 0.9889 恶意、event-stream 0.9156 恶意、flatmap-stream 0.5906 证据门控 abstain），numpy `disabled`。
- 已确认恶意包（x-trader-codec / event-stream）高召回；正常热门包（react）低误报；分布外样本 abstain。
- 旧模型被标记为 `legacy`；schema v5 产物不再加载。
- 前端 `gnn_decision_status` 的 abstain/unavailable 映射为“GNN 暂不判定”/“模型不可用”。
- `/api/ready` 与模型元数据返回当前模型类型、产物版本、数据版本、阈值、校准温度和审计状态。

## 已知限制

- 时间外推测试召回有限（test recall@0.9 约 0.30），这是 7 个名字/关键词特征对“未来恶意包”泛化能力的真实反映，不应当作缺陷隐藏。
- 正样本元数据覆盖率 41.6%，生态特征暂不能安全加入；待数据完善后按 v4 契约重训。

## 四项补强（2026-08-09 第二轮，已完成）

上一轮遗留的四个“部分解决”问题本轮已处理：

1. **正常包标签可靠度**：负样本与全量 OpenSSF 恶意池（20000 条）按规范化 `ecosystem:name` 去重（重叠 0）；新增 `review_tier` 分层（explicit_curated 1054 / dependency_closure 2498，置信度 0.85 / 0.75），审计对缺失 review_tier 和 held-out 重叠直接告警。
2. **在线推理图不完整**：`serialize_dependency(dependency, subgraph=[...])` 支持在项目子图内批量评分；独立业务测试集在真实 lockfile 上验证图路径（frontend 案例 86 条边、67 个包进入 `dependency_graph` 模式）。
3. **概率充分验证**：训练时计算验证集 10-bin ECE 并写入 `calibration.verified`（当前 val ECE 0.0669，门禁阈值 0.10）；`score_kind=probability` 仅在校准已验证且验收通过时生效，否则降级 similarity；验收新增 `calibration_verified` 检查。
4. **独立业务测试集**：`scripts/gnn/business_cases.json` 基于真实 manifest（frontend package-lock 597 包、3cx 供应链演示），`evaluate_business_cases.py` 断言正常包不判恶意、演示恶意包判恶意、图模式覆盖达标；演示/验收包已从训练数据剔除（held-out 重叠 0）。

当前验收（`runtime_acceptance.json`）：pyg passed（react 0.0726 良性、requests 0.6652 不判恶意、x-trader-codec 0.9963 恶意、event-stream 0.953 恶意、flatmap-stream 0.6286 abstain、calibration_verified true），numpy disabled；业务评测 `storage/eval/business_eval.json` status passed。
