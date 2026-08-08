# GNN 恶意包判定修复计划

## 目标与问题边界

依赖综合风险与 GNN 模型分数是两个不同指标：

- 综合风险衡量漏洞、可达性、调用链、构建和运行证据。
- GNN 只判断依赖包是否具有恶意包行为特征。

`axios@1.6.8` 的综合风险为 `100/100`，旧 NumPy GraphSAGE 输出约 `3%`。这两个结果可以同时成立，但旧界面将后者显示为“GNN 风险”，容易让用户误认为总体风险只有 3%。本次修复不把模型分数强行提高到 100，而是修正指标语义、冲突状态、模型产物门禁和部署验收。

## 修复内容

### 指标语义与决策状态

保留现有 `gnn_score` 等兼容字段，新增：

- `gnn_decision_status`：`malicious`、`benign`、`conflict`、`abstain` 或 `unavailable`。
- `gnn_score_kind`：`probability`、`similarity` 或 `heuristic`。
- `gnn_artifact_id`：当前模型产物版本。
- `gnn_data_quality_status`：`passed`、`warning`、`legacy` 或 `unknown`。

低 GNN 分数与漏洞或综合风险强证据冲突时返回 `conflict`；输入超出训练分布时返回 `abstain`；模型不可用时返回 `unavailable`。任何 GNN 结果都不能降低综合风险。

### 模型产物门禁

可信概率模型必须携带版本化元数据，并满足以下条件：

- `schema_version >= 3`
- `task == malicious_package`
- `training_status == trained`
- `data_quality_status == passed`
- `edge_split_policy == inductive`
- 存在验证集决策阈值、温度校准、数据集审计、数据哈希、产物 ID 和训练时间

缺少这些字段的旧模型标记为 `legacy`，不再以可信 GNN 概率加载。审计未通过或使用非归纳式切分的新模型只能显示为辅助相似度。

### 数据、训练与部署

正样本使用可信恶意包情报；正常包必须来自独立 npm/PyPI 元数据或人工复核。项目锁文件提取结果只能作为低置信弱负样本，禁止在缺少独立正常包数据时复制成 ecosystem negatives。

真实图使用 manifest/lockfile 构建 `depends_on` 边。同一规范化包名及其版本不得跨 train/val/test，优先按发布时间做时间外推切分。数据审计有警告时不得覆盖运行模型。

正式训练使用 PyTorch Geometric GraphSAGE、归纳式边隔离、验证集早停、阈值选择和温度校准。PyG、NumPy fallback、embedding 和元数据必须来自同一数据版本。部署时先归档旧模型，再一次性替换产物并重启 API。

## 验收标准

- `axios@1.6.8` 保持综合风险 `100/100`，模型区域显示“恶意包概率/相似度约 3% · 证据冲突”。
- 已确认恶意包应高召回，正常热门包应低误报，分布外样本必须拒绝判断。
- 旧模型被标记为 `legacy`，不能作为可信概率展示。
- 前端不再使用“GNN 风险”表达总体风险。
- `/api/ready` 返回当前模型类型、产物版本、数据版本、训练时间、阈值、校准温度和审计状态。
- API、前端和 Docker 容器实际加载的模型版本一致。
