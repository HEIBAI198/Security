# 知识图谱驱动的真实攻击路径研判报告

生成时间：2026-06-25 11:48:57 UTC

## 风险摘要

- 综合风险评分：100 / 100
- 风险等级：critical
- 打开风险：9 项，其中严重风险 2 项
- 图谱节点：182 个
- 图谱关系：119 条
- 统一资产：406 个
- 证据片段：401 条
- 运行期日志事件：574 条
- 已识别攻击路径：3 条
- 可行动攻击路径：2 条
- 高度可信真实路径：1 条
- 平均路径置信度：73%
- 路径判定分布：likely-real-attack-path=1, provenance-risk-path=1
- 参考模型：GUAC 软件树/证据树可达性、OpenCTI observable 关系与置信度、NetworkX 路径评分、in-toto/SLSA 可信证据链、BloodHound 式入口到目标路径呈现

## 路径判定

本报告不再只列“发现了哪些漏洞”，而是判断这些证据能否串成一次真实攻击路径。

## 攻击路径

### 1. 证据可串成供应链投毒到运行期异常的攻击路径

一句话结论：能串成一次高度可信的真实攻击路径：入口、构建、产物、运行期行为连续可达，综合置信度 83%。

```mermaid
flowchart LR
  N1["DependencyPackage: npm:axios@1.6.8"]
  N2["CIStep: .github/workflows/desktop-release.yml"]
  N3["BuildArtifact: 3cx-desktop-replay build"]
  N4["RuntimeService: 3cx-desktop-replay runtime"]
  N5["LogEvent: egress"]
  N6["AttackStage: 供应链投毒阶段"]
  N1 -->|可进入构建| N2
  N2 -->|生成产物| N3
  N3 -->|部署为| N4
  N4 -->|产生日志| N5
  N5 -->|关联| N6
```

- 路径判定：likely-real-attack-path
- 综合置信度：83%
- 严重级别：critical
- 路径评分：100 / 100
- 影响资产：npm:axios@1.6.8 -> .github/workflows/desktop-release.yml -> 3cx-desktop-replay build -> 3cx-desktop-replay runtime -> egress
- 修复优先级：P0
- 攻击映射：T1195
- 参考模型：GUAC, SLSA, in-toto, BloodHound CE, MITRE ATT&CK STIX

路径步骤：
- npm:axios@1.6.8 --可进入构建--> .github/workflows/desktop-release.yml（GUAC，置信度 72%）：A poisoned dependency can run install-time behavior or influence generated artifacts.
- .github/workflows/desktop-release.yml --生成产物--> 3cx-desktop-replay build（SLSA/in-toto，置信度 78%）：A compromised step or builder can produce a modified artifact.
- 3cx-desktop-replay build --部署为--> 3cx-desktop-replay runtime（ARTIFACT_DEPLOYED_AS，置信度 82%）：Workspace runtime metadata links the build artifact to the deployed service.
- 3cx-desktop-replay runtime --产生日志--> egress（Runtime evidence，置信度 84%）：Runtime logs show whether the build-time risk manifested after deployment.
- egress --关联--> 供应链投毒阶段（evidence，置信度 50%）：NormalizedLogEvent

可信证据链：
- GUAC：软件树中存在可达依赖节点；主体=npm:axios@1.6.8；状态=observed
- in-toto：构建步骤将 material 转换为 product；主体=.github/workflows/desktop-release.yml；状态=needs-attestation
- SLSA：产物需要 subject digest、builder identity 和 materials provenance；主体=3cx-desktop-replay build；状态=gap
- Runtime evidence：运行期行为证明风险可能已经触发；主体=egress；状态=observed

证据缺口：
- 当前路径未发现明显证据缺口。

关键封堵点：
- npm:axios@1.6.8：固定私有源、锁定版本并清理缓存包。
- .github/workflows/desktop-release.yml：收敛权限、固定 Action 到 commit SHA，并使用干净 runner。
- 3cx-desktop-replay build：重新构建并校验产物哈希/provenance。
- 3cx-desktop-replay runtime：回滚或隔离服务实例，保留日志和镜像证据。
- egress：封禁相关来源/目的地址并扩大同时间窗排查。

证据摘要：
- GitHub Token 权限过宽：permissions: write-all 会给 GITHUB_TOKEN 授予全部写权限，扩大凭据泄露或工作流劫持后的影响面。 Evidence: permissions: write-all
- npm:axios@1.6.8：OSV: GHSA-35jp-ww65-95wh; OSV: GHSA-3g43-6gmg-66jw; OSV: GHSA-3p68-rc4w-qgx5; OSV: GHSA-3w6x-2g7m-8v23; OSV: GHSA-43f...
- 未知域名外联：checkout-api -> 185.199.108.153:443

### 2. 证据可串成构建链路完整性受损路径

一句话结论：能串成构建完整性风险路径，但还需要 provenance/attestation 才能证明产物确被篡改，综合置信度 64%。

```mermaid
flowchart LR
  N1["CIStep: .github/workflows/desktop-release.yml"]
  N2["BuildArtifact: 3cx-desktop-replay build"]
  N3["RuntimeService: 3cx-desktop-replay runtime"]
  N4["AttackStage: 构建链路风险阶段"]
  N1 -->|部署为| N2
  N2 -->|部署为| N3
  N3 -->|关联| N4
```

- 路径判定：provenance-risk-path
- 综合置信度：64%
- 严重级别：high
- 路径评分：95 / 100
- 影响资产：.github/workflows/desktop-release.yml -> 3cx-desktop-replay build -> 3cx-desktop-replay runtime
- 修复优先级：P1
- 攻击映射：Build provenance and integrity
- 参考模型：SLSA, in-toto, GUAC, BloodHound CE

路径步骤：
- .github/workflows/desktop-release.yml --关联--> 3cx-desktop-replay build（evidence，置信度 50%）：WorkspaceSummary
- 3cx-desktop-replay build --部署为--> 3cx-desktop-replay runtime（ARTIFACT_DEPLOYED_AS，置信度 82%）：Workspace runtime metadata links the build artifact to the deployed service.
- 3cx-desktop-replay runtime --关联--> 构建链路风险阶段（evidence，置信度 50%）：Runtime

可信证据链：
- in-toto：构建步骤将 material 转换为 product；主体=.github/workflows/desktop-release.yml；状态=needs-attestation
- SLSA：产物需要 subject digest、builder identity 和 materials provenance；主体=3cx-desktop-replay build；状态=gap

证据缺口：
- 路径节点没有关联证据片段，需要补充扫描结果或日志。

关键封堵点：
- .github/workflows/desktop-release.yml：收敛权限、固定 Action 到 commit SHA，并使用干净 runner。
- 3cx-desktop-replay build：重新构建并校验产物哈希/provenance。
- 3cx-desktop-replay runtime：回滚或隔离服务实例，保留日志和镜像证据。

证据摘要：
- 暂无证据。

## 关联高危问题

| 编号 | 等级 | 评分 | 风险 | 影响资产 | 来源 |
| --- | --- | ---: | --- | --- | --- |
| finding-node:da7b5dc051c49c92 | critical | 100 | axios has exploitable VEX context | axios@1.6.8 | CycloneDX |
| finding-node:56eb690f9b206f6b | critical | 93 | 构建后服务出现异常外联和敏感接口探测 | 日志风险 | WorkspaceSummary |
| finding-node:8dba1092849935b1 | critical | 92 | 敏感接口异常访问 | workspace | NormalizedLogEvent |
| finding-node:308f1a2829be7f0a | critical | 92 | 未知域名外联 | workspace | NormalizedLogEvent |
| finding-node:57a6208d49fbbb26 | high | 88 | GitHub Token 权限过宽 | .github/workflows/desktop-release.yml | SARIF |
| finding-node:d2b7c5469a9f5b36 | high | 82 | SQL 注入探测 | workspace | NormalizedLogEvent |
| finding-node:3ec17dab6a7831d7 | high | 82 | 暴力破解/令牌探测 | workspace | NormalizedLogEvent |
| finding-node:46495fded1d34191 | high | 75 | Action 未固定到完整 commit SHA | .github/workflows/desktop-release.yml | SARIF |
| finding-node:ac69149dd35c56db | high | 75 | zizmor: unpinned-uses | .github/workflows/desktop-release.yml | SARIF |
| finding-node:8b56e62fecb68bbd | high | 75 | zizmor: unpinned-uses | .github/workflows/desktop-release.yml | SARIF |
| finding-node:9876a9d6fae5dea4 | medium | 68 | electron matched OSV vulnerabilities | electron@25.9.8 | CycloneDX |
| finding-node:28fbcd04e31d6529 | medium | 62 | zizmor: artipacked | .github/workflows/desktop-release.yml | SARIF |

## 证据链

| 序号 | 时间 | 证据类型 | 关联资产 | 证据摘要 | 来源模型 |
| ---: | --- | --- | --- | --- | --- |
| 1 | 2026-06-25 11:48 | workflow-risk-finding | .github/workflows/desktop-release.yml | permissions: write-all 会给 GITHUB_TOKEN 授予全部写权限，扩大凭据泄露或工作流劫持后的影响面。 Evidence: permissions: write-all | SARIF |
| 2 | 2026-06-25 11:47 | sbom-component-risk | npm:axios@1.6.8 | OSV: GHSA-35jp-ww65-95wh; OSV: GHSA-3g43-6gmg-66jw; OSV: GHSA-3p68-rc4w-qgx5; OSV: GHSA-3w6x-2g7m-8v23; OSV: GHSA-43fc-jf86-j433; OSV: GHSA-445q-vr5w-6q77; OSV: GHSA-4hjh-wcwx-x... | CycloneDX |
| 3 | 2026-05-30 03:07:04 | runtime-log-finding | egress | checkout-api -> 185.199.108.153:443 | NormalizedLogEvent |

## 多模态证据融合

暂无多模态证据。

## GraphRAG / GNN 风险增强

- GNN 模型类型：-
- 训练设备：-；torch=-；CUDA=-
- 测试集 F1：-
- 带 GNN 分数的图谱节点：102
- 高风险 GNN 节点：4
- GraphRAG embedding 命中：0
- 说明：当前指标基于构造数据集和本地负样本，不能等同真实世界恶意包检测准确率。

| 依赖节点 | GNN 分数 | 标签 | 解释 |
| --- | ---: | --- | --- |
| npm:axios@1.6.8 | 0.90 | high | rule fallback score used because no GNN model was available |
| npm:axios@1.6.8 | 0.90 | high | rule fallback score used because no GNN model was available |
| npm:electron@25.9.8 | 0.84 | high | rule fallback score used because no GNN model was available |
| npm:electron@25.9.8 | 0.84 | high | rule fallback score used because no GNN model was available |
| npm:x-trader-codec@4.7.1 | 0.50 | elevated | rule fallback score used because no GNN model was available |

GraphRAG 证据摘要：
- 当前报告未附带 assistant GraphRAG 查询结果。

证据缺口：
- 当前 GraphRAG 查询未报告证据缺口。

## 修复建议

- **P0 · 证据可串成供应链投毒到运行期异常的攻击路径**：隔离高危依赖，使用干净 runner 重新构建，校验产物哈希，并排查运行期外联。
- **P1 · 证据可串成构建链路完整性受损路径**：收敛 workflow 权限，第三方 Action 固定到 commit SHA，并为产物增加 provenance/attestation。

## 附录

### SBOM / Dependency-Track 风险摘要

- SBOM 组件数量：194
- 依赖风险数量：2
- 最高依赖风险：100 / 100
- VEX statement：44
- VEX affected / under investigation：5
- VEX not affected / fixed：39
- 代码可达依赖：2
- 运行期日志命中：0

### SARIF / DefectDojo 风险摘要

- SARIF 结果数量：6
- 代码风险数量：0
- CI/CD 风险数量：6

### 产物可信验证摘要

- 产物：-
- SHA256：-
- 可信评分：0 / 100
- 检查项数量：0
- 产物可信风险：0

### 日志证据摘要

- 日志风险数量：0
- 图谱证据数量：401

### 开源参考

- GUAC: https://docs.guac.sh/guac/
- GUAC Ontology: https://docs.guac.sh/guac/guac-ontology/
- MITRE ATT&CK STIX Data: https://github.com/mitre-attack/attack-stix-data
- SLSA: https://slsa.dev/spec/v1.2/provenance
- in-toto: https://github.com/in-toto/in-toto
- BloodHound CE: https://specterops.io/bloodhound-community-edition/
- NetworkX: https://networkx.org/
- React Flow: https://reactflow.dev/
- CycloneDX: https://cyclonedx.org/specification/overview/
- SARIF: https://www.oasis-open.org/standard/sarif-v2-1-0/
- OWASP Dependency-Track: https://dependencytrack.org/
- DefectDojo: https://docs.defectdojo.com/
- FFmpeg: https://www.ffmpeg.org/index.html
- OpenCV: https://opencv.org/about/

