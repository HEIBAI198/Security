import { z } from 'zod'

export const CreateWorkspaceSchema = z.object({
  importId: z.string().optional(),
  preset: z.string().optional(),
  name: z.string().optional(),
})

export const WorkspaceIdSchema = z.object({
  workspaceId: z.string().min(1),
})

export const ArtifactTrustOptionsSchema = z.object({
  artifactPath: z.string().optional(),
  attestationPath: z.string().optional(),
  expectedRepo: z.string().optional(),
  expectedCommit: z.string().optional(),
  allowedWorkflows: z.array(z.string()).optional(),
  allowedBuilders: z.array(z.string()).optional(),
  allowSelfHostedRunner: z.boolean().optional(),
  requireSignature: z.boolean().optional(),
})

export const LogAnalysisOptionsSchema = z.object({
  logPaths: z.array(z.string()).optional(),
})

export const RunTraceSchema = z.object({
  workspaceId: z.string().min(1),
  importId: z.string().optional(),
  artifactPath: z.string().optional(),
  attestationPath: z.string().optional(),
  expectedRepo: z.string().optional(),
  expectedCommit: z.string().optional(),
  allowedWorkflows: z.array(z.string()).optional(),
  allowedBuilders: z.array(z.string()).optional(),
  allowSelfHostedRunner: z.boolean().optional(),
  requireSignature: z.boolean().optional(),
  logPaths: z.array(z.string()).optional(),
  includeCodeAudit: z.boolean().optional(),
  includeDependencyAudit: z.boolean().optional(),
  includeCicdAudit: z.boolean().optional(),
  includeArtifactTrust: z.boolean().optional(),
  includeLogAudit: z.boolean().optional(),
  timeoutSeconds: z.number().int().positive().max(900).optional(),
})

export const ModuleWorkspaceSchema = WorkspaceIdSchema.extend({
  importId: z.string().optional(),
  timeoutSeconds: z.number().int().positive().max(900).optional(),
})

export const DependencyScanSchema = ModuleWorkspaceSchema.extend({
  includeCodeAudit: z.boolean().optional(),
})

export const CicdScanSchema = ModuleWorkspaceSchema

export const ArtifactTrustScanSchema = ModuleWorkspaceSchema.merge(ArtifactTrustOptionsSchema)

export const LogScanSchema = ModuleWorkspaceSchema.merge(LogAnalysisOptionsSchema)

export const ReachabilityScanSchema = ModuleWorkspaceSchema.extend({
  logPaths: z.array(z.string()).optional(),
})

export const ReportSchema = z.object({
  workspaceId: z.string().min(1),
  format: z.enum(['markdown', 'html']).default('markdown'),
})

export const EvidenceResourceSchema = z.object({
  workspaceId: z.string().min(1),
  evidenceId: z.string().min(1),
})

export const FindingResourceSchema = z.object({
  workspaceId: z.string().min(1),
  findingId: z.string().min(1),
})

export const PathResourceSchema = z.object({
  workspaceId: z.string().min(1),
  pathId: z.string().min(1),
})

export const DependencyResourceSchema = z.object({
  workspaceId: z.string().min(1),
  packageName: z.string().min(1),
})

export const WorkspacePromptSchema = z.object({
  workspaceId: z.string().optional(),
})

export const FocusPromptSchema = z.object({
  workspaceId: z.string().optional(),
  target: z.string().optional(),
})

export type ToolResultPayload = {
  status: 'success' | 'partial' | 'error'
  workspaceId?: string
  summary?: Record<string, unknown>
  keyFindings?: string[]
  evidenceGaps?: string[]
  nextActions?: string[]
  completedModules?: string[]
  failedModules?: Array<{ module: string; message: string }>
  raw?: unknown
  message?: string
}

export function textResult(payload: ToolResultPayload) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  }
}
