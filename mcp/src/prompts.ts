import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { FocusPromptSchema, WorkspacePromptSchema } from './schemas.js'

function promptMessage(text: string) {
  return {
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text,
        },
      },
    ],
  }
}

function workspaceHint(workspaceId?: string) {
  return workspaceId
    ? `当前 workspaceId 是 ${workspaceId}。优先读取 workspace://${workspaceId}，需要细节时读取 graph/report/evidence/finding/path/dependency 资源。`
    : '如果用户没有提供 workspaceId，先调用 supplyguard.get_latest_workspace 获取最新工作区。'
}

export function registerPrompts(server: McpServer) {
  server.registerPrompt(
    'supplyguard.explain_for_judges',
    {
      title: '面向评委解释溯源结论',
      description: '把当前工作区的结论、证据链、防御性边界和创新点讲清楚。',
      argsSchema: WorkspacePromptSchema.shape,
    },
    ({ workspaceId }) => promptMessage(
      [
        '请以比赛答辩视角解释 SupplyGuard KG 的本次供应链溯源结论。',
        workspaceHint(workspaceId),
        '回答结构必须包括：',
        '1. 一句话结论：是否存在供应链攻击路径或高可信风险。',
        '2. 证据链：依赖/SBOM、CI/CD、产物可信、日志印证、攻击链地图分别证明了什么。',
        '3. 为什么这是防御性检测与溯源，不是攻击复现。',
        '4. 系统亮点：知识图谱、LLM Agent、MCP 外部 Agent 接入分别带来什么价值。',
        '5. 还缺什么证据，以及下一步如何补强。',
        '请避免夸大结论；如果证据不足，要明确说“当前只能判定为疑似/待补充”。',
      ].join('\n')
    )
  )

  server.registerPrompt(
    'supplyguard.triage_risk',
    {
      title: '风险处置优先级分析',
      description: '围绕某个 finding、依赖或资产，给出优先级、原因和处置动作。',
      argsSchema: FocusPromptSchema.shape,
    },
    ({ workspaceId, target }) => promptMessage(
      [
        '请对 SupplyGuard KG 工作区中的指定风险做处置优先级分析。',
        workspaceHint(workspaceId),
        target ? `重点分析对象：${target}` : '如果没有指定对象，请选择最高风险 finding 或依赖作为分析对象。',
        '需要说明：',
        '1. 风险是什么，影响哪个资产或环节。',
        '2. 有哪些证据支持，分别来自哪些模块。',
        '3. 风险是否可达，是否有运行期日志印证。',
        '4. 优先级和处置建议：立即阻断、短期修复、后续复核。',
        '5. 如果证据不足，请列出最该补的 2-3 类材料。',
      ].join('\n')
    )
  )

  server.registerPrompt(
    'supplyguard.summarize_attack_chain',
    {
      title: '攻击链人话总结',
      description: '把攻击链地图转成用户能听懂的调查叙事。',
      argsSchema: FocusPromptSchema.shape,
    },
    ({ workspaceId, target }) => promptMessage(
      [
        '请把 SupplyGuard KG 的攻击链地图总结成自然语言叙事。',
        workspaceHint(workspaceId),
        target ? `优先解释路径或对象：${target}` : '优先解释最高置信度或最高风险路径。',
        '请按“入口 -> 传播/构建 -> 产物 -> 运行期 -> 影响资产”的顺序描述。',
        '每一步都要说明：这一步是什么、证据来自哪里、置信度如何、还缺什么。',
        '不要只罗列节点 ID；需要把技术对象翻译成人能理解的业务含义。',
      ].join('\n')
    )
  )

  server.registerPrompt(
    'supplyguard.prepare_defense_script',
    {
      title: '生成答辩讲稿',
      description: '生成 3-5 分钟比赛答辩讲稿。',
      argsSchema: WorkspacePromptSchema.shape,
    },
    ({ workspaceId }) => promptMessage(
      [
        '请为 SupplyGuard KG 生成一份 3-5 分钟比赛答辩讲稿。',
        workspaceHint(workspaceId),
        '讲稿结构：',
        '1. 背景：供应链攻击为什么难以发现。',
        '2. 系统目标：用 LLM + 知识图谱做防御性检测与溯源。',
        '3. 演示流程：选择案例、预检资产、风险发现、证据印证、攻击链地图、报告导出。',
        '4. 关键结果：本次案例的污染入口、受影响资产、证据链和处置建议。',
        '5. 创新点：统一事实层、攻击链地图、可达性验证、MCP 外部 Agent 接入。',
        '语气要像学生答辩，清楚、克制、有证据，不要营销腔。',
      ].join('\n')
    )
  )

  server.registerPrompt(
    'supplyguard.suggest_next_evidence',
    {
      title: '建议下一步补证据',
      description: '根据当前证据缺口建议下一步要补什么材料。',
      argsSchema: FocusPromptSchema.shape,
    },
    ({ workspaceId, target }) => promptMessage(
      [
        '请根据 SupplyGuard KG 当前工作区的 evidence gaps，建议下一步补充哪些证据。',
        workspaceHint(workspaceId),
        target ? `优先围绕这个对象补证据：${target}` : '优先围绕最高风险攻击链补证据。',
        '输出格式：',
        '1. 当前已经具备的关键证据。',
        '2. 还缺的证据，按重要性排序。',
        '3. 每类证据在哪里找，例如 workflow、artifact、attestation、运行日志、外部告警、源码引用。',
        '4. 补到证据后应该调用哪个 MCP tool 或读取哪个 MCP resource。',
      ].join('\n')
    )
  )
}
