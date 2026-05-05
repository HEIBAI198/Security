# 基于 SysML 模型的文档自动生成系统课程设计报告

## 1. 课题背景

传统系统工程常以 Word、Excel、建模软件和仿真脚本等分散文件作为主要交付物。需求、结构、行为、接口、验证信息在不同工具中重复维护，容易产生信息孤岛、版本不一致和追踪关系缺失等问题。基于模型的系统工程强调以模型作为单一可信源，使文档成为模型视图的自动化呈现。

OpenMBEE 提供了可参考的工程架构：MMS 负责模型版本管理，VE 提供 Web 化文档视图，MDK 将建模工具与 MMS 同步，DocGen 基于模型视图生成工程文档。本课程设计在该思想基础上实现一个轻量级原型，并针对最初版本的不足做了增强。

## 2. 设计目标

- 支持 SysML 风格模型元素的集中存储、查询、编辑和删除。
- 支持需求、结构、接口、端口、约束、活动、状态和测试用例等更丰富的 SysML 语义。
- 支持语义校验，发现缺失属性、非法关系、目标类型不匹配等问题。
- 支持 Web 图形化关系视图，并允许通过界面添加模型关系。
- 支持分支、提交快照、模型差异对比、回滚、分支合并和审计日志。
- 支持登录令牌和基于角色的读写控制。
- 支持模型到文档的自动生成，并在文档中保留源分支、提交和模型指纹。
- 提供模拟 MDK 客户端，体现外部工具与 MMS 的集成同步。

## 3. 总体架构

系统采用三层结构：

1. 表现层：`static/` 中的 Web 前端，提供模型仓库、图形建模、视图编辑、追踪矩阵、版本审计和文档生成界面。
2. 服务层：`server.py` 提供 RESTful API，同时负责静态资源服务。
3. 数据层：`sysml_docgen/store.py` 使用 SQLite 保存模型状态、元素索引和审计日志。

辅助模块：

- `sysml_docgen/auth.py`：演示登录和 Bearer Token。
- `sysml_docgen/metamodel.py`：SysML 元模型、关系规则、语义校验、图数据生成。
- `sysml_docgen/docgen.py`：DocGen 模板解析、追踪矩阵构建、Markdown 与 HTML 渲染。
- `tools/mdk_sync.py`：模拟 Cameo/Jupyter/MATLAB 等工具插件，将工具侧 JSON 模型推送到 MMS。

## 4. 改进点

### 4.1 SysML 语义增强

最初版本只包含 `Requirement`、`Block`、`Activity`、`Interface`、`TestCase` 等少量类型。改进后增加：

| 类型 | 作用 |
| --- | --- |
| `Port` | 表示块对外提供或接收的端口 |
| `Interface` | 表示接口定义，如电源接口、遥测接口 |
| `Constraint` | 表示参数约束或工程约束 |
| `State` | 表示状态机中的状态 |

系统还定义了常用关系，例如 `satisfy`、`verify`、`refine`、`compose`、`connect`、`flow`、`transition`、`constrain`。

### 4.2 语义校验

系统会检查：

- 元素类型是否属于元模型。
- 必填属性是否缺失，例如 `Requirement.attributes.text`。
- 关系目标是否存在。
- 关系目标类型是否符合规则，例如 `transition` 应指向 `State`。
- 端口 `interface` 属性是否指向 Interface 元素。

校验结果会在 Web 的“模型仓库”页面和生成文档中展示。

### 4.3 图形化建模

新增“图形建模”页面，支持：

- 需求追踪图：展示需求到设计、验证和约束的关系。
- 块定义/接口图：展示 Block、Port、Interface、Constraint 之间的结构关系。
- 活动/状态图：展示 Activity 流和 State 迁移。
- 通过“源元素 + 关系 + 目标元素”的表单添加关系。

该功能不是 Cameo/MagicDraw 级别的完整图形建模器，但已经从纯 JSON 编辑升级为可视化关系建模。

### 4.4 版本管理增强

新增版本能力：

- `commit`：保存模型快照。
- `diff`：比较两个提交或提交与工作区之间的差异。
- `rollback`：回滚当前分支到历史提交，并生成新的回滚提交。
- `merge`：将一个分支合并到当前分支，遇到同 ID 不同内容时报告冲突。
- `audit`：记录创建、修改、删除、提交、回滚、合并、文档生成等事件。

这比最初的 branch/commit/tag 展示更接近真实版本管理流程。

### 4.5 权限与存储增强

权限方面新增登录接口：

| 用户 | 密码 | 角色 |
| --- | --- | --- |
| `teacher` | `teacher123` | admin |
| `engineer` | `engineer123` | author |
| `reviewer` | `reviewer123` | reader |

存储方面从单纯 JSON 文件升级为 SQLite：

- `state` 表保存模型整体状态。
- `element_index` 表保存元素索引，便于按项目、分支、类型检索。
- `audit_events` 表保存审计日志。

## 5. 数据模型

核心模型元素字段如下：

| 字段 | 含义 |
| --- | --- |
| `id` | 模型元素唯一标识，如 `REQ-001` |
| `name` | 元素名称 |
| `type` | 元素类型，如 `Requirement`、`Block`、`Port` |
| `stereotype` | SysML 构造型 |
| `description` | 叙述性说明 |
| `owner` | 责任域或责任团队 |
| `attributes` | 扩展属性，例如需求文本、验证方式、接口协议、约束表达式 |
| `relations` | 元素关系，例如 `satisfy`、`verify`、`connect`、`transition` |

关系示例：

```json
[
  {"type": "satisfy", "target": "BLK-POWER"},
  {"type": "verify", "target": "TST-001"},
  {"type": "constrain", "target": "CST-SOC"}
]
```

## 6. 文档生成

DocGen 模板支持以下标记：

| 标记 | 作用 |
| --- | --- |
| `{{element:REQ-001.name}}` | 引用指定模型元素字段 |
| `{{element:REQ-001.attributes.text}}` | 引用元素扩展属性 |
| `{{table:requirements}}` | 生成需求表 |
| `{{table:blocks}}` | 生成结构块表 |
| `{{table:interfaces}}` | 生成接口与端口表 |
| `{{table:constraints}}` | 生成约束表 |
| `{{table:tests}}` | 生成验证计划表 |
| `{{trace:matrix}}` | 生成需求追踪矩阵 |
| `{{validation:issues}}` | 生成语义校验表 |
| `{{model:summary}}` | 生成模型统计摘要 |

## 7. 使用流程

1. 运行 `python server.py --host 127.0.0.1 --port 8000`。
2. 打开 `http://127.0.0.1:8000`。
3. 使用 `engineer / engineer123` 登录。
4. 在“模型仓库”中编辑模型元素，并查看语义校验结果。
5. 在“图形建模”中查看关系图或添加关系。
6. 点击“保存快照”生成模型提交。
7. 在“版本审计”中比较差异、回滚、创建分支或合并分支。
8. 在“文档生成”中编辑模板并生成 HTML/Markdown 文档。
9. 使用 `tools/mdk_sync.py` 模拟外部工具同步。

## 8. 测试说明

运行：

```powershell
python -B -m unittest discover -s tests
```

测试覆盖：

- 模板字段引用。
- 需求追踪闭环判定。
- 文档 HTML/Markdown 生成。
- SysML 元模型校验。
- 图数据生成。
- 快照差异计算。
- 登录令牌签发与验证。

## 9. 仍然存在的不足

本项目已经比初始版本更完整，但仍不是工业级 OpenMBEE：

- SysML 元模型仍是课程设计级抽象，没有完整覆盖 UML/SysML 标准。
- 图形建模是 SVG 关系图和关系编辑，不支持复杂拖拽排版、图符规范、泳道、状态机嵌套等。
- 分支合并采用简化冲突检测，没有三方合并算法。
- 登录和权限适合演示，不包含企业级 SSO、密码策略和审计合规。
- SQLite 适合单机课程设计，不等同于分布式、多租户、高并发部署。
- MDK 仍是命令行模拟器，不能直接解析 Cameo `.mdzip` 工程。

## 10. 总结

本系统实现了从 SysML 风格模型到工程文档的自动生成闭环，并针对课程设计初版的不足加入了更丰富的 SysML 语义、图形化关系建模、版本差异与回滚、权限登录、SQLite 存储和审计日志。它能够展示 MBSE 中“模型作为单一可信源”“一次编辑，处处使用”“需求、设计、验证保持可追踪”的核心思想。

## 参考资料

- OpenMBEE 官网：https://www.openmbee.org/
- OpenMBEE GitHub：https://github.com/Open-MBEE
- OpenMBEE View Editor 文档：https://docs.openmbee.org/projects/ve/en/latest/
- OpenMBEE Cameo MDK：https://github.com/Open-MBEE/exec-cameo-mdk
