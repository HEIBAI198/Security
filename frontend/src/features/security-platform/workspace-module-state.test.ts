import { describe, expect, it } from 'vitest'

import type { SecurityWorkspace } from '@/lib/security-api'

import { workspaceHasScanResult } from './workspace-module-state'

function workspaceWith(overrides: Record<string, unknown>): SecurityWorkspace {
  return overrides as SecurityWorkspace
}

describe('workspaceHasScanResult', () => {
  it('保留不在本轮 scanSuite.completed 中的历史扫描结果', () => {
    const workspace = workspaceWith({
      code_audit: { scan_id: 'code-1' },
      dependency_audit: { scan_id: 'dependency-1' },
      cicd_audit: { scan_id: 'cicd-1' },
      scanSuite: {
        status: 'completed',
        completed: ['artifact_trust', 'log_audit', 'workspace_report'],
      },
    })

    expect(workspaceHasScanResult(workspace, 'code_audit')).toBe(true)
    expect(workspaceHasScanResult(workspace, 'dependency_audit')).toBe(true)
    expect(workspaceHasScanResult(workspace, 'cicd_audit')).toBe(true)
  })

  it('将零发现但有扫描标识的模块判定为已扫描', () => {
    const workspace = workspaceWith({
      multimodal_audit: {
        scan_id: 'multimodal-1',
        evidence: [],
        summary: { evidence_count: 0 },
      },
    })

    expect(workspaceHasScanResult(workspace, 'multimodal_audit')).toBe(true)
    expect(workspaceHasScanResult(workspace, 'multimodal_evidence')).toBe(true)
  })

  it('没有结果载荷时不误判为已扫描', () => {
    expect(workspaceHasScanResult(workspaceWith({}), 'code_audit')).toBe(false)
    expect(
      workspaceHasScanResult(workspaceWith({}), 'multimodal_evidence'),
    ).toBe(false)
    expect(
      workspaceHasScanResult(workspaceWith({}), 'multimodal_audit'),
    ).toBe(false)
  })
})
