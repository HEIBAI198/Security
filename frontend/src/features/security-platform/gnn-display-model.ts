import type { SecurityDependency } from '@/lib/security-api'

export type GnnDecisionStatus = 'malicious' | 'benign' | 'conflict' | 'abstain' | 'unavailable'
type GnnDisplayDependency = Partial<SecurityDependency>

export function resolveGnnDecisionStatus(dependency: GnnDisplayDependency): GnnDecisionStatus {
  const explicit = dependency.gnn_decision_status
  if (explicit === 'malicious' || explicit === 'benign' || explicit === 'conflict' || explicit === 'abstain' || explicit === 'unavailable') {
    return explicit
  }
  if (dependency.gnn_reliability === 'out_of_distribution') return 'abstain'
  if (dependency.gnn_model_available === false) return 'unavailable'
  if (dependency.gnn_evidence_conflict) return 'conflict'
  const threshold = dependency.gnn_decision_threshold ?? 0.5
  return (dependency.gnn_score ?? 0) >= threshold ? 'malicious' : 'benign'
}

export function gnnScoreTerm(dependency: GnnDisplayDependency): string {
  if (dependency.gnn_score_kind === 'probability') return '恶意包概率'
  if (dependency.gnn_score_kind === 'heuristic') return '启发式相似度'
  return '恶意包相似度'
}

export function gnnScoreLabel(dependency: GnnDisplayDependency, formattedScore: string): string {
  const status = resolveGnnDecisionStatus(dependency)
  if (status === 'unavailable') return '模型不可用'
  if (status === 'abstain') return 'GNN 暂不判定'
  const score = `${gnnScoreTerm(dependency)} ${formattedScore}`
  return status === 'conflict' ? `${score} · 证据冲突` : score
}

export function isGnnJudged(dependency: GnnDisplayDependency): boolean {
  const status = resolveGnnDecisionStatus(dependency)
  return status !== 'abstain' && status !== 'unavailable'
}
