export const SUPPLEMENT_FILE_LABEL = '补充文件'
export const SUPPLEMENT_FILE_INPUT_TITLE = '补充文件'
export const SUPPLEMENT_PROJECT_ARCHIVE_ACCEPT = '.zip,.tar.gz,.tgz,application/zip,application/gzip'

export type SupplementFileModule =
  | 'reachability'
  | 'cicd'
  | 'artifact'
  | 'multimodal'
  | 'logs'

export function supplementFileSuccessMessage(
  module: SupplementFileModule,
  detail: { score?: number; count?: number } = {}
) {
  if (module === 'reachability') return '补充文件已纳入可达性研判'
  if (module === 'cicd') {
    return `补充文件已纳入 CI/CD 构建链，发现 ${detail.count ?? 0} 项风险`
  }
  if (module === 'artifact') {
    return `补充文件已完成产物可信验证，评分 ${detail.score ?? 0} / 100`
  }
  if (module === 'logs') return '补充文件已纳入日志印证'
  return '补充文件已纳入多模态研判'
}

export function isSupplementProjectArchive(filename: string) {
  const normalized = filename.trim().toLowerCase()
  return normalized.endsWith('.zip') || normalized.endsWith('.tar.gz') || normalized.endsWith('.tgz')
}

export type ArtifactTrustMaterial = {
  id: 'artifact' | 'attestation' | 'policy' | 'signature' | 'release'
  label: string
  required: boolean
  examples: string[]
  note: string
}

export const ARTIFACT_TRUST_REQUIRED_MATERIALS: ArtifactTrustMaterial[] = [
  {
    id: 'artifact',
    label: 'Artifact',
    required: true,
    examples: ['3cx-desktop-app.tar.gz', 'app.exe', 'app.zip', 'npm-package.tgz', 'docker image digest'],
    note: '发布或构建产物，用来计算 digest 并与来源证明 subject 比对。',
  },
  {
    id: 'attestation',
    label: 'Attestation / Provenance',
    required: true,
    examples: ['3cx-desktop-app.intoto.jsonl', 'provenance.json', 'SLSA provenance', 'GitHub Artifact Attestation'],
    note: '来源证明，用来核对仓库、commit、workflow、builder 和 subject digest。',
  },
]

export const ARTIFACT_TRUST_OPTIONAL_MATERIALS: ArtifactTrustMaterial[] = [
  {
    id: 'policy',
    label: 'Policy',
    required: false,
    examples: ['.supplyguard/trust-policy.yml', 'allowed workflow', 'trusted builder'],
    note: '门禁策略可增强判定边界；当前前端映射到已有策略配置字段。',
  },
  {
    id: 'signature',
    label: 'Signature / Certificate / Transparency Log Proof',
    required: false,
    examples: ['cosign proof', 'certificate chain', 'Rekor log proof'],
    note: '签名、证书或透明日志证明用于增强可信链完整度；当前作为前端状态标识。',
  },
  {
    id: 'release',
    label: 'Expected Release Information',
    required: false,
    examples: ['repo', 'commit', 'workflow', 'builder', 'release version'],
    note: '预期发布信息用于解释本次门禁比对目标；当前映射到已有发布配置字段。',
  },
]

export function artifactTrustRequiredFilesReady({
  artifactSelected,
  attestationSelected,
}: {
  artifactSelected: boolean
  attestationSelected: boolean
}) {
  return artifactSelected && attestationSelected
}

export function artifactTrustGateButtonLabel(requiredReady: boolean) {
  return requiredReady ? '执行门禁验证' : '补齐必填材料后验证'
}

export function artifactTrustGateReadinessMessage({
  requiredReady,
  optionalConfigured,
}: {
  requiredReady: boolean
  optionalConfigured: boolean
}) {
  if (!requiredReady) return '材料不完整，暂不能执行可信验证'
  if (!optionalConfigured) return '未提供选填增强材料，验证将基于 artifact 与 provenance 执行'
  return '门禁材料已准备，可执行可信验证'
}
