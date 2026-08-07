import { describe, expect, it } from 'vitest'
import { decideAgentQuestionAction } from './agent-question-routing'

describe('Agent 问题路由', () => {
  it('未扫描项目先执行扫描', () => {
    expect(decideAgentQuestionAction('这个项目是否存在供应链风险？', false)).toEqual({
      action: 'scan',
      reason: 'first_scan',
    })
  })

  it('已有扫描结果时复用证据回答风险问题', () => {
    expect(decideAgentQuestionAction('这个项目是否存在供应链风险？', true)).toEqual({
      action: 'answer',
      reason: 'reuse_existing_evidence',
    })
  })

  it('已有扫描结果时只有明确要求才重新扫描', () => {
    expect(decideAgentQuestionAction('请重新扫描日志模块', true)).toEqual({
      action: 'scan',
      reason: 'explicit_rescan',
    })
    expect(decideAgentQuestionAction('扫描结果里为什么有两条风险？', true).action).toBe('answer')
  })
})
