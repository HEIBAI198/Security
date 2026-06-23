import { repoRoot, apiUrl } from './config.js'

export type SupplyGuardWorkspace = Record<string, any>

export type ModuleScanKind =
  | 'dependencies'
  | 'cicd'
  | 'artifact_trust'
  | 'logs'
  | 'reachability'
  | 'attack_chain'
  | 'report'

type ScanOptions = Record<string, unknown>

const MODULE_KEYS: Record<ModuleScanKind, string[]> = {
  dependencies: ['dependency_audit', 'code_audit'],
  cicd: ['cicd_audit'],
  artifact_trust: ['artifact_trust'],
  logs: ['log_audit'],
  reachability: ['dependency_audit', 'code_audit', 'log_audit'],
  attack_chain: [],
  report: [],
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(init?.headers || {}),
      },
    })
  } catch (error) {
    throw new Error(`SupplyGuard API is not reachable: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`SupplyGuard API ${response.status}: ${body || response.statusText}`)
  }

  return response.json() as Promise<T>
}

export async function getLatestWorkspace() {
  return requestJson<SupplyGuardWorkspace>('/api/security/workspace')
}

export async function getWorkspace(workspaceId: string) {
  return requestJson<SupplyGuardWorkspace>(`/api/security/workspaces/${encodeURIComponent(workspaceId)}`)
}

export async function createWorkspace(options: { importId?: string; preset?: string; name?: string }) {
  return requestJson<SupplyGuardWorkspace>('/api/security/workspaces', {
    method: 'POST',
    body: JSON.stringify(options),
  })
}

export async function runTrace(workspaceId: string, options: ScanOptions) {
  return requestJson<SupplyGuardWorkspace>(`/api/security/workspaces/${encodeURIComponent(workspaceId)}/scan-suite`, {
    method: 'POST',
    body: JSON.stringify(options),
  })
}

export async function runModuleScan(workspaceId: string, module: ModuleScanKind, options: ScanOptions = {}) {
  const payload = moduleScanPayload(module, options)
  return runTrace(workspaceId, payload)
}

function moduleScanPayload(module: ModuleScanKind, options: ScanOptions) {
  const base = {
    importId: options.importId,
    artifactPath: options.artifactPath,
    attestationPath: options.attestationPath,
    expectedRepo: options.expectedRepo,
    expectedCommit: options.expectedCommit,
    allowedWorkflows: options.allowedWorkflows,
    allowedBuilders: options.allowedBuilders,
    allowSelfHostedRunner: options.allowSelfHostedRunner,
    requireSignature: options.requireSignature,
    logPaths: options.logPaths,
    timeoutSeconds: options.timeoutSeconds,
    includeCodeAudit: false,
    includeDependencyAudit: false,
    includeCicdAudit: false,
    includeArtifactTrust: false,
    includeLogAudit: false,
  }

  if (module === 'dependencies') {
    base.includeDependencyAudit = true
    base.includeCodeAudit = options.includeCodeAudit !== false
  }
  if (module === 'cicd') base.includeCicdAudit = true
  if (module === 'artifact_trust') base.includeArtifactTrust = true
  if (module === 'logs') base.includeLogAudit = true
  if (module === 'reachability') {
    base.includeCodeAudit = true
    base.includeDependencyAudit = true
    base.includeLogAudit = Array.isArray(options.logPaths) && options.logPaths.length > 0
  }

  return Object.fromEntries(Object.entries(base).filter(([, value]) => value !== undefined))
}

export async function getWorkspaceReport(workspaceId: string, format: 'markdown' | 'html') {
  return requestJson<{ format: string; content: string }>(
    `/api/security/workspaces/${encodeURIComponent(workspaceId)}/report?format=${encodeURIComponent(format)}`
  )
}

export function workspaceIdOf(workspace: SupplyGuardWorkspace) {
  return workspace.workspaceId || workspace.workspace_id || workspace.workspace?.workspaceId || workspace.workspace?.id || 'latest'
}

export function summarizeWorkspace(workspace: SupplyGuardWorkspace) {
  const summary = workspace.summary || {}
  const graph = workspace.graph || {}
  return sanitizeForAgent({
    workspaceId: workspaceIdOf(workspace),
    project: workspace.workspace?.name || workspace.workspace?.projectName || workspace.import?.projectName || workspace.name || 'SupplyGuard workspace',
    preset: workspace.workspace?.preset || workspace.import?.preset,
    riskScore: summary.risk_score ?? summary.riskScore ?? 0,
    riskLevel: summary.risk_level ?? summary.riskLevel,
    dependencies: summary.dependencies ?? workspace.dependencies?.length ?? workspace.dependency_audit?.summary?.total_dependencies ?? 0,
    findings: summary.findings ?? summary.open_findings ?? workspace.findings?.length ?? 0,
    attackPaths: summary.attack_paths ?? graph.attack_paths?.length ?? graph.summary?.attack_path_count ?? 0,
    evidenceCount: workspace.evidence?.length ?? 0,
    reportAvailable: Boolean(workspace.report || workspace.report_html),
    scanSuite: workspace.scanSuite,
  }) as Record<string, unknown>
}

export function keyFindings(workspace: SupplyGuardWorkspace) {
  const findings = [
    ...(workspace.findings || []),
    ...(workspace.dependency_audit?.findings || []),
    ...(workspace.cicd_audit?.findings || []),
    ...(workspace.artifact_trust?.findings || []),
    ...(workspace.log_audit?.findings || []),
  ]
  return findings
    .slice(0, 8)
    .map((finding: any) => finding.title || finding.reason || finding.event || finding.dependency || String(finding.id || 'finding'))
    .map(String)
}

export function evidenceGaps(workspace: SupplyGuardWorkspace) {
  const paths = workspace.graph?.attack_paths || []
  const gaps = paths.flatMap((path: any) => Array.isArray(path.gaps) ? path.gaps : [])
  if (gaps.length) return Array.from(new Set(gaps.map(String))).slice(0, 8)
  const actions = workspace.guidance?.nextActions || []
  return actions.map((item: any) => item.description || item.title).filter(Boolean).map(String).slice(0, 5)
}

export function nextActions(workspace: SupplyGuardWorkspace) {
  const actions = workspace.guidance?.nextActions || []
  if (actions.length) return actions.map((item: any) => item.title || item.description).filter(Boolean).map(String).slice(0, 6)
  return [
    '生成 SBOM 与 VEX',
    '检查 CI/CD 构建链污染',
    '执行产物可信门禁',
    '上传运行日志印证',
    '生成攻击链地图与溯源报告',
  ]
}

export function moduleStatusFromWorkspace(workspace: SupplyGuardWorkspace, module?: ModuleScanKind) {
  const errors = Array.isArray(workspace.scanSuite?.errors) ? workspace.scanSuite.errors : []
  const failedModules = errors.map((item: any) => ({
    module: String(item.module || 'unknown'),
    message: String(item.message || '扫描失败'),
  }))
  const expected = module ? MODULE_KEYS[module] : Object.values(MODULE_KEYS).flat()
  const completedModules = Array.from(new Set(expected.filter((key) => Boolean(workspace[key]))))
  const expectedFailures = failedModules.filter((item: { module: string; message: string }) => !expected.length || expected.includes(item.module))
  return {
    status: expectedFailures.length || workspace.scanSuite?.status === 'partial' ? 'partial' as const : 'success' as const,
    completedModules,
    failedModules: expectedFailures,
  }
}

export function summarizeGraph(workspace: SupplyGuardWorkspace) {
  const graph = workspace.graph || {}
  const paths = graph.attack_paths || []
  return sanitizeForAgent({
    workspaceId: workspaceIdOf(workspace),
    graphSummary: graph.summary || {
      node_count: graph.nodes?.length || 0,
      edge_count: graph.edges?.length || 0,
      attack_path_count: paths.length,
    },
    attackPaths: paths.slice(0, 8).map((path: any) => ({
      id: path.id,
      title: path.title,
      verdict: path.verdict,
      score: path.score,
      confidence: path.confidence,
      severity: path.severity,
      evidenceCount: path.evidence_ids?.length || 0,
      gaps: path.gaps || [],
      recommendation: path.recommendation,
    })),
    nodeTypes: graph.summary?.node_types || {},
    edgeTypes: graph.summary?.edge_types || {},
  }) as Record<string, unknown>
}

export function selectEvidence(workspace: SupplyGuardWorkspace, evidenceId: string) {
  const candidates = [
    ...(workspace.evidence || []),
    ...((workspace.graph?.attack_paths || []).flatMap((path: any) => path.evidence_summary || [])),
  ]
  return selectById(candidates, evidenceId)
}

export function selectFinding(workspace: SupplyGuardWorkspace, findingId: string) {
  const candidates = [
    ...(workspace.findings || []),
    ...(workspace.dependency_audit?.findings || []),
    ...(workspace.cicd_audit?.findings || []),
    ...(workspace.artifact_trust?.findings || []),
    ...(workspace.log_audit?.findings || []),
    ...(workspace.code_audit?.findings || []),
  ]
  return selectById(candidates, findingId)
}

export function selectAttackPath(workspace: SupplyGuardWorkspace, pathId: string) {
  return selectById(workspace.graph?.attack_paths || [], pathId)
}

export function selectDependency(workspace: SupplyGuardWorkspace, packageName: string) {
  const normalized = decodeURIComponent(packageName).toLowerCase()
  const candidates = [
    ...(workspace.dependencies || []),
    ...(workspace.dependency_audit?.dependencies || []),
    ...(workspace.dependency_audit?.findings || []),
  ]
  return candidates.find((item: any) => {
    const values = [item.name, item.dependency, item.purl, item.package, item.asset].filter(Boolean).map((value) => String(value).toLowerCase())
    return values.some((value) => value === normalized || value.includes(normalized))
  })
}

function selectById(candidates: any[], requestedId: string) {
  const decoded = decodeURIComponent(requestedId)
  return candidates.find((item) => String(item?.id || '') === decoded || String(item?.findingId || '') === decoded)
}

export function sanitizeForAgent(value: unknown): unknown {
  return sanitizeValue(value, 0)
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 8) return '[truncated]'
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => sanitizeValue(item, depth + 1))
  if (!value || typeof value !== 'object') return sanitizeScalar(value)

  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      result[key] = '[redacted]'
      continue
    }
    result[key] = sanitizeValue(item, depth + 1)
  }
  return result
}

function sanitizeScalar(value: unknown): unknown {
  if (typeof value !== 'string') return value
  return value
    .replaceAll(repoRoot, '.')
    .replace(/C:\\Users\\[^\\\s"]+/g, 'C:\\Users\\[user]')
    .replace(/[A-Za-z]:\\Users\\[^\\\s"]+/g, 'C:\\Users\\[user]')
    .replace(/(token|password|secret|api[_-]?key)=([^&\s]+)/gi, '$1=[redacted]')
}

function isSensitiveKey(key: string) {
  return /(token|password|secret|apiKey|api_key|authorization|cookie|env|environment)/i.test(key)
}
