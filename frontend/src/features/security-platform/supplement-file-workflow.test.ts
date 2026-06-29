import { describe, expect, it } from 'vitest'
import platformSource from './index.tsx?raw'
import multimodalPanelSource from './multimodal-evidence-panel.tsx?raw'
import {
  ARTIFACT_TRUST_OPTIONAL_MATERIALS,
  ARTIFACT_TRUST_REQUIRED_MATERIALS,
  SUPPLEMENT_PROJECT_ARCHIVE_ACCEPT,
  SUPPLEMENT_FILE_INPUT_TITLE,
  SUPPLEMENT_FILE_LABEL,
  artifactTrustGateButtonLabel,
  artifactTrustGateReadinessMessage,
  artifactTrustRequiredFilesReady,
  isSupplementProjectArchive,
  supplementFileSuccessMessage,
} from './supplement-file-workflow'

describe('supplement file workflow copy', () => {
  it('uses supplement-file wording for module entry points', () => {
    expect(SUPPLEMENT_FILE_LABEL).toBe('补充文件')
    expect(SUPPLEMENT_FILE_INPUT_TITLE).toBe('补充文件')
    expect(SUPPLEMENT_PROJECT_ARCHIVE_ACCEPT).toContain('.zip')
  })

  it('accepts the same archive formats as the initial project upload', () => {
    expect(isSupplementProjectArchive('source.zip')).toBe(true)
    expect(isSupplementProjectArchive('source.tar.gz')).toBe(true)
    expect(isSupplementProjectArchive('source.tgz')).toBe(true)
    expect(isSupplementProjectArchive('workflow.yml')).toBe(false)
  })

  it('describes reachability supplement processing as part of the analysis', () => {
    expect(supplementFileSuccessMessage('reachability')).toBe('补充文件已纳入可达性研判')
  })

  it('describes CI/CD supplement processing as part of the build-chain scan', () => {
    expect(supplementFileSuccessMessage('cicd', { count: 2 })).toBe('补充文件已纳入 CI/CD 构建链，发现 2 项风险')
  })

  it('describes artifact supplement processing as the same trust-gate verification path', () => {
    expect(supplementFileSuccessMessage('artifact', { score: 88 })).toBe('补充文件已完成产物可信验证，评分 88 / 100')
  })
  it('defines artifact trust gate required and optional material groups', () => {
    expect(ARTIFACT_TRUST_REQUIRED_MATERIALS.map((item) => item.id)).toEqual(['artifact', 'attestation'])
    expect(ARTIFACT_TRUST_OPTIONAL_MATERIALS.map((item) => item.id)).toEqual(['policy', 'signature', 'release'])
    expect(ARTIFACT_TRUST_REQUIRED_MATERIALS.every((item) => item.required)).toBe(true)
    expect(ARTIFACT_TRUST_OPTIONAL_MATERIALS.every((item) => !item.required)).toBe(true)
  })

  it('blocks gate verification until artifact and provenance files are selected', () => {
    expect(artifactTrustRequiredFilesReady({ artifactSelected: false, attestationSelected: true })).toBe(false)
    expect(artifactTrustRequiredFilesReady({ artifactSelected: true, attestationSelected: false })).toBe(false)
    expect(artifactTrustRequiredFilesReady({ artifactSelected: true, attestationSelected: true })).toBe(true)
    expect(artifactTrustGateButtonLabel(false)).toBe('补齐必填材料后验证')
    expect(artifactTrustGateButtonLabel(true)).toBe('执行门禁验证')
  })

  it('describes incomplete required materials and missing optional enhancement materials', () => {
    expect(artifactTrustGateReadinessMessage({ requiredReady: false, optionalConfigured: false })).toBe('材料不完整，暂不能执行可信验证')
    expect(artifactTrustGateReadinessMessage({ requiredReady: true, optionalConfigured: false })).toBe('未提供选填增强材料，验证将基于 artifact 与 provenance 执行')
    expect(artifactTrustGateReadinessMessage({ requiredReady: true, optionalConfigured: true })).toBe('门禁材料已准备，可执行可信验证')
  })
})

describe('security platform supplement-file integration', () => {
  it('uses centralized supplement-file copy in the security workbench', () => {
    expect(platformSource).toContain('SUPPLEMENT_FILE_LABEL')
    expect((platformSource.match(/SUPPLEMENT_FILE_LABEL/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })

  it('opens file selection before module processing on supply and CI/CD pages', () => {
    expect(platformSource).toContain("onClick={() => void rerunReachability()}")
    expect(platformSource).toContain("onClick={() => void startCICDScan()}")
    expect(platformSource).not.toContain("<Button size='sm' variant='outline' onClick={() => void rerunReachability()} disabled={scanning}>")
    expect(platformSource).not.toContain("<Button size='sm' variant='outline' onClick={() => void startCICDScan()} disabled={scanning}>")
    expect(platformSource).toContain('supplementInputRef.current?.click()')
    expect(platformSource).toContain('SUPPLEMENT_PROJECT_ARCHIVE_ACCEPT')
  })

  it('keeps artifact supplement behind an explicit dialog confirmation', () => {
    expect(platformSource).toContain('setSupplementOpen(true)')
    expect(platformSource).toContain('open={supplementOpen}')
    expect(platformSource).toContain('uploadArtifactTrustScan')
    expect(platformSource).toContain('onCancel={() => setSupplementOpen(false)}')
    expect(platformSource).toContain('onConfirm={() => void confirmSupplement()}')
  })

  it('does not render the report shortcut button on the investigation home', () => {
    expect(platformSource).not.toContain("onClick={() => jumpToPlatformTab('report')}")
  })

  it('does not include the report tab in the investigation home module cards', () => {
    expect(platformSource).toContain("module !== 'report'")
  })

  it('renders artifact trust upload affordances without non-upload material cards in the dialog', () => {
    expect(platformSource).toContain("id='artifact-required-file'")
    expect(platformSource).toContain("id='attestation-required-file'")
    expect(platformSource).toContain('ArtifactSupplementDialogContent')
    expect(platformSource).toContain('Artifact 产物文件')
    expect(platformSource).toContain('Attestation / Provenance 来源证明')
    expect(platformSource).not.toContain('<ArtifactTrustMaterialRow')
    expect(platformSource).toContain('ArtifactTrustScoreSourceBar')
    expect(platformSource).toContain('lastUploadedScanId')
    expect(platformSource).toContain('评分来源：刚刚上传验证')
    expect(platformSource).toContain('评分来源：上次扫描结果')
    expect(platformSource).toContain('已选择新材料，当前分数仍来自上次扫描')
    expect(platformSource).toContain('artifactTrustDisplayName')
    expect(platformSource).toContain('formatArtifactTrustGeneratedAt')
    expect(platformSource).toContain('xl:grid-cols-[minmax(260px,1fr)_minmax(340px,1.18fr)_minmax(380px,1.32fr)]')
    expect(platformSource).not.toContain('xl:grid-cols-[minmax(420px,42fr)_minmax(260px,26fr)_minmax(320px,32fr)]')
    expect(platformSource).toContain('请先补充产物文件和来源证明')
  })

  it('keeps every artifact supplement dialog field on its own row', () => {
    const dialogStart = platformSource.indexOf('function ArtifactSupplementDialogContent')
    const dialogEnd = platformSource.indexOf('function ArtifactGateOverviewCard')
    const dialogSource = platformSource.slice(dialogStart, dialogEnd)
    expect(dialogSource).toContain('function ArtifactSupplementDialogContent')
    expect(dialogSource).toContain("className='space-y-4'")
    expect(dialogSource).toContain("className='space-y-3'")
    expect(dialogSource).toContain("className='space-y-2 rounded-md border border-slate-400/10 bg-[color:var(--surface-inset)] p-3'")
    expect(dialogSource).not.toContain('md:grid-cols-2')
  })

  it('uses a three-column artifact gate workbench with supplement materials in a dialog', () => {
    expect(platformSource).toContain("xl:grid-cols-[minmax(260px,1fr)_minmax(340px,1.18fr)_minmax(380px,1.32fr)]")
    expect(platformSource).toContain('open={supplementOpen}')
    expect(platformSource).toContain('setSupplementOpen(true)')
    expect(platformSource).toContain('ArtifactSupplementDialogContent')
    expect(platformSource).toContain('ArtifactGateOverviewCard')
    expect(platformSource).toContain('ArtifactIssueList')
    expect(platformSource).toContain('ArtifactIssueDetailPanel')
    expect(platformSource).toContain("<GateMetric label='失败'")
    expect(platformSource).toContain("<GateMetric label='缺失'")
    expect(platformSource).toContain("<GateMetric label='警告'")
    expect(platformSource).not.toContain("<GateMetric label='检查'")
    expect(platformSource).not.toContain("<GateMetric label='通过'")
    expect(platformSource).not.toContain("ref={evidenceInputRef}")
  })
})

describe('security platform reachability layout', () => {
  it('folds the high-risk dependency table into the dependency evidence workbench', () => {
    expect(platformSource).not.toContain("<CardTitle className='text-section-title text-foreground'>高风险依赖</CardTitle>")
    expect(platformSource).not.toContain('展开全部 ${filteredRows.length} 条')
    expect(platformSource).toContain('buildUnifiedEvidenceRows(filteredRows)')
    expect(platformSource).not.toContain('items.slice(0, 12)')
  })

  it('uses every workspace dependency as dependency evidence before filtering', () => {
    expect(platformSource).toContain('buildReachabilityItems(dependencies')
    expect(platformSource).not.toContain('buildReachabilityItems(riskDependencies')
    expect(platformSource).not.toContain('const riskDependencies')
  })

  it('does not render the duplicated top dependency selector rail', () => {
    expect(platformSource).not.toContain('<DependencySelectorRail')
    expect(platformSource).not.toContain('function DependencySelectorRail')
    expect(platformSource).not.toContain('dependency-rail-active')
  })

  it('keeps the three reachability workbench cards fixed while dependency evidence and detail scroll internally', () => {
    expect(platformSource).toContain('xl:h-[420px]')
    expect(platformSource).toContain('overflow-y-auto overscroll-contain')
    expect(platformSource).toContain('xl:[scrollbar-gutter:stable]')
    expect(platformSource).toContain("className='h-full min-w-0 xl:h-[420px]'")
    expect(platformSource).toContain("className='min-w-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin]'")
    expect(platformSource).not.toContain('min-h-[420px] overflow-hidden rounded-md border-border')
    expect(platformSource).not.toContain('xl:min-h-[420px]')
    expect(platformSource).not.toContain('overflow-visible rounded-md border-border')
    expect(platformSource).not.toContain("className='min-w-0 flex-1 space-y-3 overflow-visible'")
    expect(platformSource).not.toContain('xl:max-h-[260px]')
    expect(platformSource).not.toContain('max-h-[360px] overflow-auto')
  })
})

describe('security platform CI/CD risk layout', () => {
  it('uses a three-column CI/CD workbench with finding names and a separate detail panel', () => {
    expect(platformSource).toContain("xl:grid-cols-[minmax(260px,1fr)_minmax(340px,1.18fr)_minmax(380px,1.32fr)]")
    expect(platformSource).toContain('<CicdRiskOverviewCard model={displayModel} />')
    expect(platformSource).toContain('<CicdFindingNameList')
    expect(platformSource).toContain('<CicdFindingDetailPanel')
    expect(platformSource).toContain('风险属性')
    expect(platformSource).not.toContain('<CicdRiskClusterPanel')
    expect(platformSource).not.toContain('function CicdRiskClusterPanel')
    expect(platformSource).not.toContain('风险聚类')
  })

  it('moves the risk modules into the central CI/CD workbench and removes the build-chain graph', () => {
    expect(platformSource).not.toContain('<BuildStepFlow')
    expect(platformSource).not.toContain('<BuildStepDetail')
    expect(platformSource).toContain("xl:grid-cols-[minmax(260px,1fr)_minmax(340px,1.18fr)_minmax(380px,1.32fr)]")
    expect(platformSource).toContain('<CicdRiskOverviewCard model={displayModel} />')
    expect(platformSource).toContain('<CicdFindingNameList')
    expect(platformSource).toContain('<CicdFindingDetailPanel')
  })

  it('uses the reachability-style score presentation for the CI/CD risk overview', () => {
    expect(platformSource).toContain('function CicdRiskOverviewCard')
    expect(platformSource).toContain('风险评分')
    expect(platformSource).toContain('displayScore')
    expect(platformSource).not.toContain('text-6xl font-extrabold leading-none text-orange-100 tabular-nums')
  })

  it('feeds artifact trust and pipeline evidence into the CI/CD display model', () => {
    expect(platformSource).toContain('buildCicdDisplayModel({ audit, pipeline, artifactTrust })')
    expect(platformSource).toContain('artifactTrust={workspace.artifact_trust}')
    expect(platformSource).toContain('CicdRiskOverviewCard model={displayModel}')
    expect(platformSource).toContain('displayModel.source.artifactFindings + displayModel.source.pipelineRisks')
  })
})

describe('security platform external alert evidence layout', () => {
  it('uses a three-column workbench with score, finding names, and selected finding attributes', () => {
    expect(multimodalPanelSource).toContain("grid-cols-1 gap-4 xl:grid-cols-[minmax(260px,1fr)_minmax(340px,1.18fr)_minmax(380px,1.32fr)]")
    expect(multimodalPanelSource).toContain('<MultimodalFindingNameList')
    expect(multimodalPanelSource).toContain('<MultimodalFindingDetailPanel')
    expect(multimodalPanelSource).toContain('selectedFindingKey')
    expect(multimodalPanelSource).toContain('风险属性')
    expect(multimodalPanelSource).toContain('风险原因')
    expect(multimodalPanelSource).toContain('关键证据')
    expect(multimodalPanelSource).toContain('修复建议')
  })
})
