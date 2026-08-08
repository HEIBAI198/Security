import { describe, expect, it } from 'vitest'

import { gnnScoreLabel, resolveGnnDecisionStatus } from './gnn-display-model'


describe('GNN display semantics', () => {
  it('shows an evidence conflict without calling the package low risk', () => {
    const dependency = {
      name: 'axios',
      version: '1.6.8',
      risk: 100,
      recommendation: '',
      gnn_score: 0.0283,
      gnn_score_kind: 'similarity',
      gnn_decision_status: 'conflict',
    }

    expect(resolveGnnDecisionStatus(dependency)).toBe('conflict')
    expect(gnnScoreLabel(dependency, '3%')).toBe('恶意包相似度 3% · 证据冲突')
  })

  it('hides the numeric verdict for rejected and unavailable models', () => {
    expect(gnnScoreLabel({ name: 'unknown', version: '', risk: 0, recommendation: '', gnn_score: 0.5, gnn_decision_status: 'abstain' }, '50%')).toBe('GNN 暂不判定')
    expect(gnnScoreLabel({ name: 'legacy', version: '', risk: 0, recommendation: '', gnn_score: 0.9, gnn_decision_status: 'unavailable' }, '90%')).toBe('模型不可用')
  })

  it('uses probability wording only for audited calibrated artifacts', () => {
    const dependency = {
      name: 'confirmed-malicious',
      version: '1.0.0',
      risk: 90,
      recommendation: '',
      gnn_score: 0.92,
      gnn_score_kind: 'probability',
      gnn_decision_status: 'malicious',
    }
    expect(gnnScoreLabel(dependency, '92%')).toBe('恶意包概率 92%')
  })
})
