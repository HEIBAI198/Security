# SupplyGuard KG MCP Server

第二版 MCP 服务用于把 SupplyGuard KG 的防御性供应链溯源能力开放给 Cline、Claude Desktop、Cursor 等外部 Agent。它不重写扫描逻辑，只调用现有 SupplyGuard 后端 API，并读取 `cases/` 下的案例元数据。

## 能力范围

- 列出内置防御性案例。
- 创建或读取 SupplyGuard 工作区。
- 一键执行完整供应链溯源。
- 分步执行依赖、CI/CD、产物可信、日志、可达性、攻击链和报告流程。
- 查询攻击链地图、候选路径、证据缺口和细粒度证据。
- 提供面向比赛答辩的 prompts。
- 返回证据包下载信息，但不通过 MCP 返回 zip 二进制。

安全边界：不执行任意 shell，不读取任意本机路径，不提供攻击利用能力，不返回 token、环境变量或证据包二进制。

## 安装与构建

```bash
cd mcp
npm install
npm run build
```

使用前请先启动 SupplyGuard 后端：

```bash
python server.py
```

默认后端地址：

```text
http://127.0.0.1:8000
```

可以通过环境变量覆盖：

```bash
set SUPPLYGUARD_API_BASE=http://127.0.0.1:8000
```

## Cline 配置示例

```json
{
  "mcpServers": {
    "supplyguard": {
      "command": "node",
      "args": [
        "C:\\Users\\86189\\Desktop\\sysml2\\mcp\\dist\\server.js"
      ],
      "env": {
        "SUPPLYGUARD_API_BASE": "http://127.0.0.1:8000"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

## Tools

第一版兼容工具：

- `supplyguard.list_cases`
- `supplyguard.get_latest_workspace`
- `supplyguard.create_workspace`
- `supplyguard.run_trace`
- `supplyguard.query_attack_graph`
- `supplyguard.get_report`
- `supplyguard.get_evidence_package_info`

第二版分步调查工具：

- `supplyguard.scan_dependencies`
- `supplyguard.scan_cicd`
- `supplyguard.verify_artifact_trust`
- `supplyguard.analyze_logs`
- `supplyguard.scan_reachability`
- `supplyguard.build_attack_chain`
- `supplyguard.generate_report`

## Resources

- `workspace://latest`
- `workspace://{workspaceId}`
- `case://{caseId}`
- `graph://latest`
- `report://latest`
- `evidence://{workspaceId}/{evidenceId}`
- `finding://{workspaceId}/{findingId}`
- `path://{workspaceId}/{pathId}`
- `dependency://{workspaceId}/{packageName}`

## Prompts

- `supplyguard.explain_for_judges`
- `supplyguard.triage_risk`
- `supplyguard.summarize_attack_chain`
- `supplyguard.prepare_defense_script`
- `supplyguard.suggest_next_evidence`

## 示例调用思路

完整一键模式：

1. `supplyguard.list_cases`
2. `supplyguard.create_workspace`
3. `supplyguard.run_trace`
4. `supplyguard.query_attack_graph`
5. `supplyguard.get_report`

分步教学模式：

1. `supplyguard.scan_dependencies`
2. `supplyguard.scan_cicd`
3. `supplyguard.verify_artifact_trust`
4. `supplyguard.analyze_logs`
5. `supplyguard.build_attack_chain`
6. `supplyguard.generate_report`

答辩模式：

1. 使用 `supplyguard.explain_for_judges` 解释结论。
2. 使用 `supplyguard.summarize_attack_chain` 讲清攻击链。
3. 使用 `supplyguard.suggest_next_evidence` 说明证据缺口和下一步。
