# SupplyGuard KG 参赛 PPT 内容大纲

## PPT 总体叙事

这套 PPT 建议围绕一个核心故事展开：

> AI 编程和 Vibe Coding 正在改变软件开发方式。新手开发者更容易直接接受 AI 推荐的依赖、脚本、CI/CD 配置和第三方 Action，导致供应链风险更早、更隐蔽地进入开发流程。SupplyGuard KG 面向这一新场景，构建从代码、依赖、CI/CD、产物可信、运行日志到知识图谱的全链路检测、门禁阻断与攻击溯源系统。

整套 PPT 不要只讲“我们有哪些功能”，而要讲清楚：

1. 为什么 Vibe Coding 会放大供应链攻击面。
2. 传统方案为什么不够。
3. SupplyGuard KG 如何检测、阻断、溯源。
4. 系统相对赛题要求完成了什么。
5. 项目的创新点和优势在哪里。
6. 当前边界和后续增强方向。

建议页数：20 页。

## 第 1 页：封面

标题：

```text
SupplyGuard KG
面向 Vibe Coding 场景的软件供应链攻击检测与溯源系统
```

副标题：

```text
从 AI 推荐依赖、CI/CD 构建链、产物可信到运行日志的全链路研判
```

页面重点：

- 项目名称
- 团队名称
- 赛道名称
- 一张系统主界面或攻击链图谱截图

讲述重点：

> 我们关注的是 AI 编程流行后，供应链风险如何更容易进入开发流程，以及如何在提交、构建、发布和运行阶段发现、阻断并溯源这些风险。

## 第 2 页：背景：AI 编程带来的新供应链风险

标题：

```text
Vibe Coding 让供应链风险更容易进入开发流程
```

内容：

```text
AI 编程工具可以快速生成项目代码、依赖配置、CI/CD workflow 和部署脚本。
新手开发者往往更关注“代码能不能运行”，容易忽略依赖来源、脚本权限、构建链可信和产物来源证明。
攻击者可以利用这一点，让恶意依赖、危险 postinstall、未固定 Action 和高权限 workflow 更容易进入项目。
```

建议配图：

```text
AI 生成代码
  ↓
开发者直接接受
  ↓
可疑依赖 / 危险脚本 / 高权限 workflow
  ↓
构建链与发布产物被污染
```

讲述重点：

> Vibe Coding 并不是漏洞本身，但它改变了风险进入项目的方式。风险从“手动误配”变成了“AI 推荐、用户接受、自动进入工程流程”。

## 第 3 页：问题定义：我们到底要解决什么

标题：

```text
从“发现漏洞”升级为“还原供应链攻击路径”
```

内容：

传统工具常见输出：

```text
发现 10 个漏洞
发现 3 个高危依赖
发现 workflow 配置风险
```

但用户真正需要回答：

```text
风险是怎么进入项目的？
风险有没有被执行？
构建链有没有被污染？
发布产物是否可信？
是否影响用户和下游系统？
应该在哪个阶段阻断？
```

讲述重点：

> 我们的目标不是只列漏洞，而是把代码、依赖、构建、产物和运行期日志串成一条可解释的攻击路径。

## 第 4 页：赛题要求与系统对齐

标题：

```text
赛题要求拆解与 SupplyGuard KG 对应能力
```

建议表格：

| 赛题要求 | SupplyGuard KG 对应能力 |
| --- | --- |
| 软件成分分析 | SBOM / VEX、依赖版本、许可证、漏洞、可达性 |
| 行为特征分析 | postinstall、install.js、CI 脚本、异常外联、敏感接口访问 |
| 组件版本异常 | 版本来源、锁文件、未固定版本、漏洞版本、异常版本信号 |
| 构建环境篡改 | builder、runner、workflow、commit、provenance、digest 校验 |
| 依赖混淆 | suspicious package、typosquatting、内部包名、公共源解析、安装脚本 |
| 溯源图谱展示 | 污染入口、传播环节、受影响资产、攻击路径 |

讲述重点：

> 当前系统重点支持 npm 和 PyPI 生态，已具备软件成分分析、行为特征分析和攻击路径还原能力；RubyGems、Maven、Go Modules 是后续扩展方向。

## 第 5 页：系统总体方案

标题：

```text
检测、门禁、溯源一体化闭环
```

建议画 5 层架构：

```text
输入层：
代码仓库 / package-lock / requirements / workflow / artifact / attestation / logs

检测层：
代码审计 / 依赖审计 / CI/CD 审计 / 产物可信 / 日志审计

门禁层：
Git Hook / CI Gate / Release Gate

图谱层：
知识图谱 / GraphRAG / GNN 风险评分

输出层：
攻击链地图 / 溯源报告 / 修复建议 / 证据包
```

讲述重点：

> 系统覆盖供应链风险的完整生命周期：进入前检测、进入时阻断、进入后溯源。

## 第 6 页：输入材料与扫描对象

标题：

```text
多源输入：不仅扫代码，也扫构建和发布证据
```

内容：

```text
源码与配置：
src、scripts、Dockerfile、IaC 配置

依赖材料：
package.json、package-lock.json、requirements.txt、requirements.lock.txt、SBOM

CI/CD 材料：
.github/workflows/*.yml、构建脚本、发布脚本

产物材料：
tar.gz、zip、exe、npm 包、Docker digest、attestation、provenance

运行材料：
build-runner 日志、客户终端日志、外部告警、IOC
```

讲述重点：

> 供应链攻击不只发生在源码里，也可能发生在依赖解析、构建机器、发布产物和运行期行为中。

## 第 7 页：依赖与软件成分分析

标题：

```text
SBOM / VEX：识别项目真实包含的组件和风险
```

内容：

```text
支持 npm / PyPI 依赖解析。
读取 package.json、package-lock.json、requirements.txt 等依赖文件。
生成 CycloneDX SBOM 和 VEX。
分析组件名称、版本、来源、许可证、漏洞、风险等级。
结合源码 import / require 和日志证据判断风险是否可达。
```

建议展示：

- 依赖风险页面截图
- SBOM / VEX 导出按钮截图
- axios、electron、x-trader-codec 等依赖卡片

优势表达：

> 系统不是简单判断“这个包有漏洞”，而是进一步判断该依赖是否出现在项目依赖树中、是否被源码调用、是否进入攻击路径。

## 第 8 页：行为特征分析

标题：

```text
从静态成分到行为特征：识别可执行风险
```

内容：

```text
安装阶段行为：
postinstall、preinstall、install.js、下载远程脚本

构建阶段行为：
curl / wget / bash、上传 artifact、调用发布凭据

权限行为：
GITHUB_TOKEN write-all、secrets inherit、Action 未固定

运行期行为：
异常外联、敏感接口访问、客户终端可疑事件
```

讲述重点：

> 行为特征分析解决的是“这个风险有没有可能被执行”。这比只看组件清单更接近攻击过程。

## 第 9 页：CI/CD 构建链研判

标题：

```text
CI/CD 构建链：风险从代码进入产物的放大器
```

内容：

```text
扫描 .github/workflows/*.yml
识别 Action 版本未固定
识别 workflow 权限过大
识别 self-hosted runner 风险
识别 secrets 继承和不可信 PR 触发
定位风险 workflow / job / step
```

建议展示：

- CI/CD 构建链研判页面截图
- 构建链路径图：代码提交 → workflow → runner → artifact

优势表达：

> 很多供应链攻击不是直接攻击源码，而是攻击构建链。系统能把 workflow 风险放到攻击路径中解释，而不是孤立报警。

## 第 10 页：产物可信门禁

标题：

```text
发布前最后一关：确认产物真的可信
```

内容：

```text
校验 artifact SHA256
校验 attestation / provenance subject digest
校验来源仓库、commit、ref、workflow
校验 builder 是否可信
校验 runner 是否符合策略
校验签名或平台 attestation
```

示例结论：

```text
artifact digest 与 attestation subject 不一致
self-hosted runner 不符合策略
commit 与预期不匹配
建议阻断发布
```

讲述重点：

> 源码没问题不代表发布包没问题。产物可信门禁回答的是：最终交给用户的软件包是否真的来自可信构建链。

## 第 11 页：运行日志印证

标题：

```text
运行期证据：验证风险是否触达真实环境
```

内容：

```text
扫描 build-runner 日志和客户终端日志。
识别异常外联 IP。
识别可疑进程、可疑下载和敏感接口访问。
把运行期事件与依赖、workflow、artifact 进行关联。
```

讲述重点：

> 日志印证让系统从“静态风险”进一步走向“攻击行为研判”。如果静态依赖风险和运行期异常能互相印证，攻击路径可信度会显著提高。

## 第 12 页：预防门禁能力

标题：

```text
从发现问题到阻断问题进入用户环境
```

内容：

```text
Git Hook：
提交前扫描密钥、危险代码、可疑依赖文件。

CI Gate：
PR / push 后扫描依赖、代码、workflow、Dockerfile，发现高危问题直接失败。

Release Gate：
发布前校验 artifact、provenance、builder、workflow、runner 和签名。
```

示例：

```text
.env 中发现数据库密码 → 阻断 commit
workflow 使用 write-all 权限 → 阻断 PR 合并
artifact digest 不匹配 → 阻断发布
```

优势表达：

> 传统溯源偏事后分析，我们把门禁前置到提交、合并和发布阶段，尽量在用户被攻击前阻断风险。

## 第 13 页：知识图谱溯源

标题：

```text
知识图谱：把分散证据串成攻击路径
```

内容：

```text
图谱节点：
依赖包、源码文件、workflow、runner、artifact、attestation、日志事件、受影响资产

图谱关系：
使用、触发、构建、生成、证明、外联、影响

输出：
污染入口、传播环节、可信断点、受影响资产、攻击路径
```

建议展示：

- 攻击链地图截图
- 证据覆盖矩阵截图

讲述重点：

> 图谱让系统可以回答“这些单点风险之间有没有关系”。这正是溯源能力和普通漏洞扫描的区别。

## 第 14 页：GraphRAG + GNN 风险增强

标题：

```text
GraphRAG + GNN：让图谱证据可以被检索、排序和解释
```

内容：

```text
GraphRAG：
根据用户问题，从知识图谱中召回依赖、构建、产物、日志和攻击路径证据。
采用多通道召回、2-hop 图扩展、PageRank 排序和 GNN 分数增强。

GNN：
对依赖节点进行图风险评分，补充相似恶意包、风险传播和排序能力。
```

当前状态必须准确：

```text
已接入 NumPy GraphSAGE GNN 模型。
PyG GraphSAGE 模型文件已准备，运行环境安装 torch / torch_geometric 后可启用。
当前 GraphRAG 已能在真实 workspace 上返回路径证据。
```

不要写：

```text
已经完整运行 PyTorch Geometric GNN。
```

优势表达：

> GraphRAG 让用户可以围绕攻击路径提问，GNN 让依赖风险排序不只依赖规则，而能利用图结构和相似恶意包特征。

## 第 15 页：案例演示：3CX 供应链攻击复盘

标题：

```text
案例：3CX/X_TRADER 供应链攻击链复盘
```

建议流程：

```text
1. 导入 3CX 案例项目
2. 扫描依赖和源码
3. 发现可疑依赖与高危组件
4. 扫描 CI/CD workflow
5. 发现构建链风险
6. 校验 artifact 和 attestation
7. 发现 digest / provenance 异常
8. 扫描日志并发现异常外联
9. 图谱生成攻击路径
10. 报告给出处置建议
```

讲述重点：

> 这个案例展示了系统如何从多个模块收集证据，并把它们串成一条供应链攻击链，而不是停留在单点告警。

## 第 16 页：溯源报告：从技术结果到安全决策

标题：

```text
溯源报告：让用户看懂风险、证据和处置动作
```

内容：

报告回答 5 个问题：

```text
风险是否可能由 Vibe Coding 引入？
攻击链是否形成？
污染环节在哪里？
影响哪些用户或资产？
应该先做什么？
```

建议展示：

- 溯源报告截图
- 风险评分、攻击路径、证据矩阵、可信断点截图

优势表达：

> 我们把报告从“漏洞列表”升级为“安全决策报告”。用户不仅知道哪里有问题，还知道为什么危险、影响谁、下一步怎么修。

## 第 17 页：系统优势

标题：

```text
SupplyGuard KG 的核心优势
```

内容建议用 6 个卡片：

```text
1. 场景新：
面向 Vibe Coding 下 AI 推荐依赖、脚本和 workflow 的新风险入口。

2. 链路全：
覆盖代码、依赖、CI/CD、产物、日志和图谱。

3. 能阻断：
提供 Git Hook、CI Gate、Release Gate 三道门禁。

4. 可溯源：
通过知识图谱还原污染入口、传播环节和受影响资产。

5. 可解释：
GraphRAG 支持基于图谱证据的问答和报告生成。

6. 可扩展：
基于 SBOM、SLSA、in-toto、GraphRAG、GNN 等标准和模块化设计扩展。
```

讲述重点：

> 我们的优势不是单个扫描器，而是把检测、门禁和溯源组织成闭环。

## 第 18 页：创新点与原创性

标题：

```text
创新点：面向 AI 编程场景的供应链安全闭环
```

原创或主要创新：

```text
1. Vibe Coding 供应链风险入口建模
把 AI 推荐依赖、AI 生成脚本、AI 生成 workflow 作为风险来源标记。

2. 多源证据攻击链融合
将依赖、CI/CD、产物、日志和图谱证据串联为可解释攻击路径。

3. 检测 + 门禁 + 溯源一体化
同时支持事前阻断、事中检测、事后溯源。

4. 安全决策型报告
输出是否阻断、是否回滚、是否吊销 Token、是否影响用户。
```

借鉴和采用：

```text
SBOM / VEX
SLSA / in-toto provenance
GitHub Actions 安全实践
Git Hook / CI Gate
知识图谱 / GraphRAG / GNN
```

讲述重点：

> 项目的创新不在于重新发明 SBOM 或 SLSA，而在于面向 Vibe Coding 新场景，把它们组合成一条可运行、可阻断、可溯源的完整系统。

## 第 19 页：当前边界与后续计划

标题：

```text
边界清晰，后续可持续增强
```

当前边界：

```text
重点支持 npm / PyPI，RubyGems、Maven、Go Modules 仍需扩展。
组件版本异常检测已有基础，但历史基线和版本漂移检测还可增强。
依赖混淆已有信号识别，后续可补充更典型的私有包/公共源混淆案例。
PyG GNN 模型文件已准备，但当前运行环境未安装 torch / torch_geometric。
```

后续计划：

```text
扩展 RubyGems、Maven、Go Modules 生态。
增强依赖混淆真实案例库。
加入版本基线和组件漂移检测。
启用 PyG GraphSAGE 在线推理。
接入更多真实 attestation 和生产日志。
```

讲述重点：

> 我们不夸大系统边界，但当前原型已经覆盖赛题主线，且架构支持继续扩展。

## 第 20 页：总结

标题：

```text
总结：让 Vibe Coding 更安全地进入工程实践
```

三句话总结：

```text
SupplyGuard KG 能发现 AI 编程引入的供应链风险。
SupplyGuard KG 能在提交、合并、发布前进行门禁阻断。
SupplyGuard KG 能在事后通过知识图谱还原攻击路径和影响范围。
```

最后一句：

```text
我们的目标不是阻止开发者使用 AI，而是让 AI 编程生成的代码、依赖、构建链和发布产物都经过可信验证。
```

## 答辩时可以反复强调的金句

```text
1. Vibe Coding 改变了供应链风险进入项目的方式。

2. 传统工具发现的是单点漏洞，我们还原的是风险进入、传播、污染和影响用户的全过程。

3. 源码可信不代表产物可信，所以必须做产物可信门禁。

4. 我们不是只做事后溯源，而是在提交、合并、发布三个阶段前置阻断。

5. SupplyGuard KG 的核心价值是把分散的安全证据变成可解释、可决策、可执行的攻击链。
```

## 视觉设计建议

整体风格建议：

```text
深色背景 + 青蓝色主色 + 红色风险强调 + 绿色通过状态
```

图形优先级：

```text
流程图 > 架构图 > 截图 > 表格 > 大段文字
```

每页最多一个核心结论。

不要堆太多技术名词。技术名词第一次出现时用中文解释：

```text
Artifact：发布产物
Digest：文件指纹
Attestation：来源证明
Provenance：构建来源证明
Runner：构建机器
SBOM：软件物料清单
VEX：漏洞影响说明
```

## 演示顺序建议

如果比赛允许现场演示，可以按这个顺序：

```text
1. 打开系统首页，展示扫描对象。
2. 展示供应链可达扫描，说明依赖风险。
3. 展示 CI/CD 构建链，说明 workflow 风险。
4. 展示产物可信门禁，说明 digest / provenance 异常。
5. 展示日志印证，说明运行期异常。
6. 展示攻击链地图，说明污染入口和受影响资产。
7. 展示溯源报告，说明处置建议。
8. 最后展示 Git Hook / CI Gate / Release Gate 的阻断效果。
```

## 最推荐放进 PPT 的截图

```text
1. 项目首页或工作台总览。
2. 供应链可达扫描页面。
3. CI/CD 构建链研判页面。
4. 产物可信门禁页面。
5. 日志印证页面。
6. 攻击链地图页面。
7. 溯源报告页面。
8. Git Hook 阻断命令行截图。
9. CI Gate / Release Gate 配置或输出截图。
10. GraphRAG + GNN 智能证据页面。
```

## 内容取舍建议

如果 PPT 只能讲 10 分钟：

```text
背景问题：1 分钟
系统架构：1 分钟
检测能力：2 分钟
门禁能力：1 分钟
案例演示：3 分钟
创新优势：1 分钟
总结展望：1 分钟
```

如果讲 15 分钟：

```text
可以增加 GraphRAG + GNN、赛题对齐和边界说明。
```

如果讲 20 分钟：

```text
可以完整讲 20 页，并穿插一次系统演示。
```
