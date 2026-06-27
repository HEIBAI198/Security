import type {
  ArtifactTrustResult,
  CICDAuditResult,
  SecurityPipelineStep,
  SecuritySeverity,
} from '@/lib/security-api'

export type CicdDisplayFinding = CICDAuditResult['findings'][number]

export type CicdDisplaySource = {
  cicdFindings: number
  artifactFindings: number
  pipelineRisks: number
}

export type CicdDisplaySummary = CICDAuditResult['summary'] & {
  derivedFindingCount: number
}

export type CicdDisplayModel = {
  summary: CicdDisplaySummary
  findings: CicdDisplayFinding[]
  workflows: string[]
  source: CicdDisplaySource
  scanKey: string
  targetLabel: string
}

type BuildCicdDisplayModelInput = {
  audit?: CICDAuditResult | null
  pipeline?: SecurityPipelineStep[]
  artifactTrust?: ArtifactTrustResult | null
}

const severityScore: Record<SecuritySeverity, number> = {
  low: 35,
  medium: 62,
  high: 82,
  critical: 98,
}

const severityWeight: Record<SecuritySeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

export function buildCicdDisplayModel({
  audit,
  pipeline = [],
  artifactTrust,
}: BuildCicdDisplayModelInput): CicdDisplayModel {
  const cicdFindings = audit?.findings ?? []
  const artifactFindings = (artifactTrust?.findings ?? []).map((finding, index) =>
    artifactTrustFindingToCicdFinding(finding, artifactTrust, index)
  )
  const pipelineFindings = derivePipelineFindings(pipeline, artifactTrust)
  const findings = dedupeCicdFindings([...cicdFindings, ...artifactFindings, ...pipelineFindings])
  const workflows = uniqueCompact([
    ...(audit?.workflows ?? []),
    ...(artifactTrust?.provenance?.workflow ? [artifactTrust.provenance.workflow] : []),
    ...pipeline.filter((step) => step.step === 'workflow').map((step) => step.name),
    ...findings.map((finding) => finding.workflow),
  ])
  const severityCounts = countSeverities(findings)
  const fallbackRiskScore = Math.max(
    artifactTrust?.summary?.risk_score ?? 0,
    ...findings.map((finding) => finding.score ?? severityScore[finding.severity] ?? 0),
    ...pipeline.map((step) => severityScore[statusToSeverity(step.status)] ?? 0),
    0
  )
  const riskScore = Math.max(audit?.summary?.risk_score ?? 0, fallbackRiskScore)
  const riskLevel = maxSeverity(
    audit?.summary?.risk_level ?? 'low',
    artifactTrust?.summary?.risk_level ?? 'low',
    ...findings.map((finding) => finding.severity),
    scoreToSeverity(riskScore)
  )
  const summary: CicdDisplaySummary = {
    workflow_count: audit?.summary?.workflow_count || workflows.length,
    job_count: audit?.summary?.job_count ?? countPipelineJobs(pipeline),
    total_steps: audit?.summary?.total_steps || pipeline.length,
    finding_count: findings.length,
    risk_score: riskScore,
    risk_level: riskLevel,
    critical: severityCounts.critical,
    high: severityCounts.high,
    medium: severityCounts.medium,
    low: severityCounts.low,
    by_rule: audit?.summary?.by_rule,
    duration_seconds: audit?.summary?.duration_seconds,
    tools: audit?.summary?.tools,
    ignored: audit?.summary?.ignored,
    ignored_total: audit?.summary?.ignored_total,
    baseline_exists: audit?.summary?.baseline_exists,
    baseline_total: audit?.summary?.baseline_total,
    baseline_created_at: audit?.summary?.baseline_created_at,
    new: audit?.summary?.new ?? findings.length,
    fixed: audit?.summary?.fixed ?? 0,
    trend: audit?.summary?.trend,
    derivedFindingCount: Math.max(0, findings.length - cicdFindings.length),
  }

  return {
    summary,
    findings,
    workflows,
    source: {
      cicdFindings: cicdFindings.length,
      artifactFindings: artifactFindings.length,
      pipelineRisks: pipelineFindings.length,
    },
    scanKey: [audit?.scan_id, artifactTrust?.scan_id, pipeline.length, findings.length].filter(Boolean).join(':') || 'empty-cicd-display',
    targetLabel: audit?.target?.projectName || artifactTrust?.artifact || audit?.target_path || 'workflow source',
  }
}

function artifactTrustFindingToCicdFinding(
  finding: ArtifactTrustResult['findings'][number],
  artifactTrust: ArtifactTrustResult,
  index: number
): CicdDisplayFinding {
  const provenance = artifactTrust.provenance ?? {}
  return {
    id: `artifact-trust-${finding.id || index}`,
    rule_id: `artifact_trust.${finding.check || finding.id || 'finding'}`,
    title: finding.title,
    severity: normalizeSeverity(finding.severity),
    score: finding.score ?? severityScore[normalizeSeverity(finding.severity)],
    workflow: provenance.workflow || provenance.source_repo || 'Artifact trust',
    job_id: provenance.builder_id || null,
    job_name: provenance.runner_environment || null,
    step_index: null,
    step_name: finding.check || 'Artifact / provenance',
    line: 0,
    evidence: finding.evidence,
    reason: finding.evidence || finding.title,
    recommendation: finding.recommendation,
    fingerprint: `artifact-trust:${finding.fingerprint || finding.id || index}`,
    scanner: 'artifact_trust',
    confidence: 'high',
  }
}

function derivePipelineFindings(
  pipeline: SecurityPipelineStep[],
  artifactTrust?: ArtifactTrustResult | null
): CicdDisplayFinding[] {
  return pipeline
    .filter((step) => {
      const severity = statusToSeverity(step.status)
      const text = `${step.name} ${step.detail} ${step.actor}`.toLowerCase()
      return severityWeight[severity] >= severityWeight.medium || text.includes('self-hosted')
    })
    .map((step, index) => {
      const severity = statusToSeverity(step.status)
      const selfHosted = /self-hosted/i.test(`${step.name} ${step.detail} ${step.actor}`)
      const finalSeverity = selfHosted && severity === 'low' ? 'medium' : severity
      return {
        id: `pipeline-${step.step}-${index}`,
        rule_id: selfHosted ? 'pipeline.self_hosted_runner' : `pipeline.${step.step}`,
        title: selfHosted ? '自托管 Runner 进入发布链路' : `${pipelineStepLabel(step.step)}步骤存在高风险`,
        severity: finalSeverity,
        score: severityScore[finalSeverity],
        workflow: artifactTrust?.provenance?.workflow || (step.step === 'workflow' ? step.name : '构建流水线'),
        job_id: null,
        job_name: step.actor || null,
        step_index: index,
        step_name: step.name || step.step,
        line: 0,
        evidence: [step.detail, step.actor, step.status].filter(Boolean).join(' / '),
        reason: selfHosted
          ? '发布流水线使用自托管 Runner，构建完整性依赖 Runner 隔离、清理和加固状态。'
          : `${pipelineStepLabel(step.step)}步骤在构建链中标记为 ${step.status}，需要优先复核。`,
        recommendation: selfHosted
          ? '迁移到受控托管 Runner，或补充 Runner 隔离、干净检出和临时环境证据。'
          : '复核构建链证据，并在发布前加固受影响步骤。',
        fingerprint: `pipeline:${step.step}:${step.name}:${step.status}:${index}`,
        scanner: 'pipeline',
        confidence: 'medium',
      }
    })
}

function pipelineStepLabel(step: string) {
  return {
    commit: '代码提交',
    resolve: '依赖解析',
    workflow: 'Workflow',
    build: '构建脚本执行',
    artifact: '产物生成',
    attestation: '来源证明',
    deploy: '产物发布',
    runtime: '运行期异常',
  }[step] ?? step
}

function dedupeCicdFindings(findings: CicdDisplayFinding[]) {
  const seen = new Set<string>()
  return findings.filter((finding) => {
    const key = finding.fingerprint || finding.id
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function countSeverities(findings: CicdDisplayFinding[]) {
  return findings.reduce(
    (counts, finding) => {
      counts[normalizeSeverity(finding.severity)] += 1
      return counts
    },
    { critical: 0, high: 0, medium: 0, low: 0 }
  )
}

function countPipelineJobs(pipeline: SecurityPipelineStep[]) {
  return new Set(pipeline.map((step) => step.actor).filter(Boolean)).size
}

function uniqueCompact(values: string[]) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean)))
}

function maxSeverity(...values: Array<SecuritySeverity | string | undefined>): SecuritySeverity {
  return values.reduce<SecuritySeverity>((max, value) => {
    const severity = normalizeSeverity(value)
    return severityWeight[severity] > severityWeight[max] ? severity : max
  }, 'low')
}

function statusToSeverity(status?: string): SecuritySeverity {
  const normalized = `${status ?? ''}`.toLowerCase()
  if (normalized.includes('critical')) return 'critical'
  if (normalized.includes('high')) return 'high'
  if (normalized.includes('medium') || normalized.includes('warn')) return 'medium'
  if (normalized.includes('low')) return 'low'
  return 'low'
}

function scoreToSeverity(score: number): SecuritySeverity {
  if (score >= 90) return 'critical'
  if (score >= 75) return 'high'
  if (score >= 50) return 'medium'
  return 'low'
}

function normalizeSeverity(value?: SecuritySeverity | string): SecuritySeverity {
  if (value === 'critical' || value === 'high' || value === 'medium' || value === 'low') return value
  return 'low'
}
