import type { AgentRunResult, SecurityAttackPath } from '@/lib/security-api'

export type AgentAnswerFocus =
  | 'global'
  | 'code_audit'
  | 'dependency_audit'
  | 'cicd_audit'
  | 'artifact_trust'
  | 'log_audit'

export type FocusedAgentModule = Exclude<AgentAnswerFocus, 'global'>

export const AGENT_FOCUS_ORDER: FocusedAgentModule[] = [
  'log_audit',
  'cicd_audit',
  'artifact_trust',
  'dependency_audit',
  'code_audit',
]

export const AGENT_FOCUS_LABELS: Record<FocusedAgentModule, string> = {
  code_audit: '代码可达性',
  dependency_audit: '依赖与供应链组件',
  cicd_audit: 'CI/CD 构建链',
  artifact_trust: '发布产物',
  log_audit: '日志部分',
}

export const AGENT_FOCUS_PATTERNS: Record<FocusedAgentModule, RegExp> = {
  code_audit: /代码|可达|函数调用|代码调用|调用关系|call graph|import|密钥|配置|source|code/i,
  dependency_audit: /供应链组件|依赖|sbom|vex|包|dependency|package/i,
  cicd_audit: /ci\/cd|cicd|构建链|workflow|runner|流水线|action|构建/i,
  artifact_trust: /产物|artifact|provenance|attestation|签名|可信|发布|builder/i,
  log_audit: /日志|运行期|运行|外联|回连|异常访问|异常行为|runtime|egress|log/i,
}

const AGENT_GLOBAL_QUESTION_PATTERNS = [
  /(?:该|本|这个|当前|整个)?项目.{0,12}(?:是否|有无|存在|风险|危险|攻击|研判|分析)/i,
  /(?:是否存在|是否属于|确认|真实|完整).{0,12}(?:供应链)?攻击/i,
  /(?:供应链攻击|攻击路径|完整证据链).{0,16}(?:是否|真假|成立|证据|模块|路径)?/i,
  /(?:调用|使用|执行).{0,8}(?:哪些|什么|全部|所有)?模块/i,
  /(?:综合|整体|全局|全链路|端到端).{0,12}(?:研判|分析|风险|攻击|检测|扫描)/i,
]

function isAgentModuleFocus(id: string): id is FocusedAgentModule {
  return AGENT_FOCUS_ORDER.includes(id as FocusedAgentModule)
}

export function agentAnswerFocus(question: string, selectedModuleIds: string[] = []): AgentAnswerFocus {
  const text = question.trim().toLowerCase()
  if (AGENT_GLOBAL_QUESTION_PATTERNS.some((pattern) => pattern.test(text))) return 'global'

  const matched = AGENT_FOCUS_ORDER.filter((focus) => AGENT_FOCUS_PATTERNS[focus].test(text))
  if (matched.length === 1) return matched[0]
  if (matched.length > 1) return 'global'

  const selectedModules = selectedModuleIds.filter(isAgentModuleFocus)
  return selectedModules.length === 1 ? selectedModules[0] : 'global'
}

export function agentTextMatchesFocus(text: string, focus: AgentAnswerFocus) {
  return focus === 'global' || AGENT_FOCUS_PATTERNS[focus].test(text)
}

export function sanitizeAgentAnswerMarkdown(text: string) {
  const lines = String(text ?? '').split(/\r?\n/)

  return lines
    .map((line) => {
      let sanitized = line
      const hasUnclosedBold = (sanitized.match(/\*\*/g) || []).length % 2 === 1
      if (hasUnclosedBold) {
        sanitized = sanitized.replace(/\*\*(?=[^*]*$)/, '')
      }
      if ((sanitized.match(/(?<!`)`(?!`)/g) || []).length % 2 === 1) {
        sanitized = sanitized.replace(/`(?=[^`]*$)/, '')
      }
      if (hasUnclosedBold && /^\s*(?:[-*]|\d+[.)])\s+/.test(sanitized)) {
        sanitized = `${sanitized.trimEnd()}（原回答已截断）`
      }
      return sanitized
    })
    .join('\n')
}

export function agentEvidenceChainLines(run: AgentRunResult, focus: AgentAnswerFocus) {
  if (focus !== 'global') return []

  const chain = run.verdict?.chainEvidence
  if (chain?.status === 'missing') {
    return ['- 尚未形成可验证的跨模块攻击路径，当前只能判定模块风险，不能确认真实攻击。']
  }
  const paths = run.workspace?.graph?.attack_paths ?? []
  const path = selectAgentAttackPath(paths, chain?.pathId)

  if (!path) return []

  const confidence = normalizePathConfidence(chain?.confidence ?? path.confidence)
  const evidenceIds = new Set([
    ...(chain?.evidenceIds ?? []),
    ...(path.evidence_ids ?? []),
    ...(path.path_steps ?? []).flatMap((step) => step.evidence_ids ?? []),
  ])
  const status = agentPathStatusLabel(chain?.status, path.verdict)
  const summary = [
    `路径：${path.title || '供应链攻击路径'}`,
    `路径ID：${path.id || chain?.pathId || '-'}`,
    `判定：${status}`,
    `路径置信度：${confidence}%`,
    `关联证据：${evidenceIds.size}条`,
  ].join('；')

  const stepLines = (path.path_steps ?? []).slice(0, 5).map((step, index) => {
    const source = compactAgentPathNode(step.source, step.source_type)
    const target = compactAgentPathNode(step.target, step.target_type)
    const relationship = step.relationship || step.edge_type || '关联到'
    return `  ${index + 1}. ${source} --${relationship}--> ${target}`
  })

  if (!stepLines.length && path.description) {
    stepLines.push(`  - ${path.description}`)
  }

  return [`- ${summary}`, ...stepLines]
}

function selectAgentAttackPath(paths: SecurityAttackPath[], pathId?: string) {
  if (pathId) {
    const matched = paths.find((path) => path.id === pathId)
    if (matched) return matched
  }
  return [...paths].sort((left, right) => {
    const verdictDifference = agentPathPriority(right.verdict) - agentPathPriority(left.verdict)
    if (verdictDifference) return verdictDifference
    return normalizePathConfidence(right.confidence) - normalizePathConfidence(left.confidence)
  })[0]
}

function agentPathPriority(verdict?: string) {
  if (verdict === 'likely-real-attack-path' || verdict === 'cross-modal-corroborated-path') return 3
  if (verdict === 'plausible-attack-path' || verdict === 'plausible-cross-modal-path') return 2
  return 1
}

function agentPathStatusLabel(status?: string, verdict?: string) {
  if (status === 'confirmed' || verdict === 'likely-real-attack-path' || verdict === 'cross-modal-corroborated-path') {
    return '高可信真实攻击路径'
  }
  if (status === 'plausible' || verdict === 'plausible-attack-path' || verdict === 'plausible-cross-modal-path') {
    return '疑似攻击路径，仍需补证'
  }
  return '候选风险路径'
}

function normalizePathConfidence(value?: number) {
  const numeric = Number(value || 0)
  return Math.max(0, Math.min(100, Math.round(numeric <= 1 ? numeric * 100 : numeric)))
}

function compactAgentPathNode(value?: string, type?: string) {
  const text = String(value || type || '未知节点')
  const compact = text.length > 42 ? `${text.slice(0, 39)}...` : text
  return type && value ? `${type}:${compact}` : compact
}
