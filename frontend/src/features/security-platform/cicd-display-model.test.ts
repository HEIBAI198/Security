import { describe, expect, it } from 'vitest'
import { buildCicdDisplayModel } from './cicd-display-model'
import type { ArtifactTrustResult, CICDAuditResult, SecurityPipelineStep } from '@/lib/security-api'

const emptyAudit: CICDAuditResult = {
  scan_id: 'cicd-empty',
  generated_at: '2026-06-27T16:07:14Z',
  workflows: [],
  summary: {
    workflow_count: 0,
    job_count: 0,
    total_steps: 0,
    finding_count: 0,
    risk_score: 0,
    risk_level: 'low',
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  },
  findings: [],
  report: '',
  warnings: [],
}

const pipeline: SecurityPipelineStep[] = [
  {
    step: 'workflow',
    name: '.github/workflows/desktop-release.yml',
    status: 'normal',
    detail: 'GitHub Actions release workflow',
    actor: 'github-actions',
    time: '2026-06-27T16:07:14Z',
  },
  {
    step: 'build',
    name: 'self-hosted runner',
    status: 'medium',
    detail: 'runner self-hosted',
    actor: 'https://github.com/actions/runner/self-hosted',
    time: '2026-06-27T16:08:14Z',
  },
]

const artifactTrust: ArtifactTrustResult = {
  scan_id: 'artifact-risk',
  generated_at: '2026-06-27T16:09:14Z',
  artifact: 'release.tar.gz',
  digest: 'sha256:demo',
  trust_score: 2,
  level: 'critical',
  checks: [],
  findings: [
    {
      id: 'builder-untrusted',
      title: 'Builder is not allowed',
      severity: 'critical',
      score: 98,
      evidence: 'builder id is not in the allowed policy list',
      recommendation: 'Restrict release builds to approved builders.',
      check: 'builder',
      fingerprint: 'artifact-builder-untrusted',
    },
    {
      id: 'self-hosted-runner',
      title: 'Self-hosted runner used for release',
      severity: 'high',
      score: 82,
      evidence: 'runner_environment=self-hosted',
      recommendation: 'Use a hardened hosted runner or isolate the runner.',
      check: 'runner',
      fingerprint: 'artifact-self-hosted-runner',
    },
  ],
  provenance: {
    workflow: '.github/workflows/desktop-release.yml',
    builder_id: 'https://github.com/actions/runner/self-hosted',
    runner_environment: 'self-hosted',
  },
  policy: {},
  tools: [],
  summary: {
    check_count: 4,
    finding_count: 2,
    trust_score: 2,
    level: 'critical',
    risk_score: 98,
    risk_level: 'critical',
    passed: 1,
    failed: 2,
    warnings: 0,
    missing: 0,
    skipped: 0,
    critical: 1,
    high: 1,
    medium: 0,
    low: 0,
  },
  report: '',
  warnings: [],
}

describe('buildCicdDisplayModel', () => {
  it('surfaces artifact and pipeline risks when the CI/CD audit has no findings', () => {
    const model = buildCicdDisplayModel({
      audit: emptyAudit,
      pipeline,
      artifactTrust,
    })

    expect(model.summary.risk_score).toBe(98)
    expect(model.summary.risk_level).toBe('critical')
    expect(model.summary.finding_count).toBeGreaterThanOrEqual(2)
    expect(model.summary.workflow_count).toBe(1)
    expect(model.summary.total_steps).toBe(2)
    expect(model.source.cicdFindings).toBe(0)
    expect(model.source.artifactFindings).toBe(2)
    expect(model.source.pipelineRisks).toBe(1)
    expect(model.findings.map((finding) => finding.scanner)).toContain('artifact_trust')
    expect(model.findings.map((finding) => finding.scanner)).toContain('pipeline')
    expect(model.workflows).toContain('.github/workflows/desktop-release.yml')
  })

  it('creates a synthetic workflow label for risky pipeline evidence without workflow metadata', () => {
    const model = buildCicdDisplayModel({
      audit: emptyAudit,
      pipeline: [
        {
          step: 'build',
          name: 'postinstall script',
          status: 'critical',
          detail: 'artifact hash drifted from baseline',
          actor: 'GitHub Actions',
          time: '2026-06-27T16:08:14Z',
        },
      ],
    })

    expect(model.summary.workflow_count).toBe(1)
    expect(model.workflows).toContain('构建流水线')
    expect(model.findings[0]?.title).toBe('构建脚本执行步骤存在高风险')
  })
})
