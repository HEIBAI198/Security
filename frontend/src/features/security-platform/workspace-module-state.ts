import type { SecurityWorkspace } from '@/lib/security-api'

export function workspaceHasScanResult(
  workspace: SecurityWorkspace | null | undefined,
  moduleId: string,
) {
  if (!workspace) return false

  if (moduleId === 'code_audit') {
    return Boolean(
      workspace.code_audit?.scan_id ||
      workspace.code_audit?.generated_at ||
      (workspace.code_audit?.findings?.length ?? 0) > 0,
    )
  }
  if (moduleId === 'dependency_audit') {
    return Boolean(
      workspace.dependency_audit?.scan_id ||
      workspace.dependency_audit?.generated_at ||
      (workspace.dependency_audit?.dependencies?.length ?? 0) > 0 ||
      (workspace.dependency_audit?.findings?.length ?? 0) > 0 ||
      (workspace.dependencies?.length ?? 0) > 0,
    )
  }
  if (moduleId === 'cicd_audit') {
    return Boolean(
      workspace.cicd_audit?.scan_id ||
      workspace.cicd_audit?.generated_at ||
      (workspace.cicd_audit?.findings?.length ?? 0) > 0,
    )
  }
  if (moduleId === 'artifact_trust') {
    return Boolean(
      workspace.artifact_trust?.scan_id ||
      workspace.artifact_trust?.generated_at ||
      (workspace.artifact_trust?.checks?.length ?? 0) > 0,
    )
  }
  if (moduleId === 'log_audit') {
    return Boolean(
      workspace.log_audit?.scan_id ||
      workspace.log_audit?.generated_at ||
      (workspace.log_audit?.findings?.length ?? 0) > 0,
    )
  }
  if (moduleId === 'multimodal_audit' || moduleId === 'multimodal_evidence') {
    return Boolean(
      workspace.multimodal_audit?.scan_id ||
      workspace.multimodal_audit?.generated_at ||
      (workspace.multimodal_audit?.summary?.evidence_count ?? 0) > 0 ||
      (workspace.multimodal_audit?.evidence?.length ?? 0) > 0,
    )
  }
  if (moduleId === 'workspace_report') {
    return Boolean(
      workspace.report ||
      workspace.report_html ||
      workspace.graph?.generated_at ||
      (workspace.graph?.nodes?.length ?? 0) > 0,
    )
  }
  return false
}
