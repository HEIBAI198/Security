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
