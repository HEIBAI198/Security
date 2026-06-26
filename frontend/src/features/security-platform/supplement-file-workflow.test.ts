import { describe, expect, it } from 'vitest'
import platformSource from './index.tsx?raw'
import {
  SUPPLEMENT_PROJECT_ARCHIVE_ACCEPT,
  SUPPLEMENT_FILE_INPUT_TITLE,
  SUPPLEMENT_FILE_LABEL,
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
})

describe('security platform supplement-file integration', () => {
  it('uses centralized supplement-file copy in the security workbench', () => {
    expect(platformSource).toContain('SUPPLEMENT_FILE_LABEL')
    expect((platformSource.match(/SUPPLEMENT_FILE_LABEL/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })

  it('opens file selection before module processing on supply and CI/CD pages', () => {
    expect(platformSource).toContain("onClick={() => void rerunReachability()}")
    expect(platformSource).toContain("onClick={() => void startCICDScan()}")
    expect(platformSource).not.toContain("<Button size='sm' variant='outline' onClick={() => void rerunReachability()} disabled={scanning}>")
    expect(platformSource).not.toContain("<Button size='sm' variant='outline' onClick={() => void startCICDScan()} disabled={scanning}>")
    expect(platformSource).toContain('supplementInputRef.current?.click()')
    expect(platformSource).toContain('SUPPLEMENT_PROJECT_ARCHIVE_ACCEPT')
  })

  it('keeps artifact supplement as a file-input affordance instead of immediate verification', () => {
    expect(platformSource).toContain('evidenceInputRef.current?.scrollIntoView')
    expect(platformSource).toContain('uploadArtifactTrustScan')
  })
})
