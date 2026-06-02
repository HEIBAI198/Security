# 基于大模型与安全知识图谱的供应链攻击检测平台

本项目已改造为面向企业的软件供应链和应用安全防御平台。系统把代码审计、SBOM 依赖风险、CI/CD 构建链路、运行日志、攻击路径、知识图谱和大模型分析助手串成一条完整证据链，不再只是单点漏洞扫描器。

默认首页是安全运营工作台，重点展示：

- 代码与应用安全审计：SQL 注入、命令注入、硬编码密钥、不安全配置等风险解释与修复草案。
- 软件供应链安全检测：SBOM、依赖混淆、typosquatting、安装脚本、许可证和漏洞风险评分。
- CI/CD 构建链路监测：危险脚本、过宽权限、未固定 Action、可疑外部下载和产物链路追踪。
- 海量日志风险识别：异常登录、敏感接口访问、异常外联、暴力破解和供应链投毒后的运行期行为。
- 安全知识图谱：仓库、提交、依赖包、构建任务、产物、服务、日志事件和攻击阶段的传播路径。
- 大模型安全分析助手：基于离线 RAG 演示知识库回答风险原因、攻击链路、修复优先级和误报可能性。
- 报告生成：自动生成 Markdown 安全分析报告，包含风险等级、证据链、影响范围、攻击路径和修复建议。

## 当前实现

当前版本是比赛/答辩友好的稳定演示版：

- 后端使用 FastAPI，新增 `/api/security/workspace`、`/api/security/assistant`、`/api/security/report`。
- 前端使用 React、TanStack Router、shadcn 风格组件、Recharts 和 React Flow。
- 安全数据使用内置离线样例，模拟 OSV/NVD/CVE 缓存、规则引擎、RAG 知识库和日志批处理。
- 大模型助手已支持 DeepSeek API；未配置密钥时自动回退到离线 RAG 演示答案。
- 旧 SysML/DocGen/MDK 演示模块已清理，默认首页就是 SupplyGuard KG 安全平台。

## 快速运行

在项目根目录创建 `.env`：

```text
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_MODEL=deepseek-v4-flash
```

```powershell
python -m pip install -r requirements.txt

cd frontend
npm install
npm run build

cd ..
python server.py --host 127.0.0.1 --port 8000
```

访问：

```text
http://127.0.0.1:8000
```

主要接口：

```text
GET  /api/security/workspace
POST /api/security/assistant
GET  /api/security/report
```

Docker Compose 会读取同一个 `.env` 文件：

```powershell
docker compose up --build
```

## 后续可扩展方向

- 接入真实 Git 仓库扫描和 Semgrep/Bandit/npm audit 等工具结果。
- 接入 OSV、NVD、CVE 数据源定时同步。
- 使用 Kafka + OpenSearch 替换本地日志批处理模拟。
- 将知识图谱存储迁移到 Neo4j、NebulaGraph 或 NetworkX 服务。
- 把安全规则、漏洞库、代码片段和日志上下文纳入更完整的 RAG 检索。
