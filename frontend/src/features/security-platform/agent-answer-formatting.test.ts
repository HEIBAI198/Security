import { describe, expect, it } from 'vitest'

import type { AgentRunResult } from '@/lib/security-api'

import {
  agentAnswerFocus,
  agentEvidenceChainLines,
  sanitizeAgentAnswerMarkdown,
} from './agent-answer-formatting'

describe('Agent回答Markdown容错', () => {
  it('移除模型截断后遗留的未闭合加粗标记', () => {
    const answer = [
      '## 证据缺口',
      '',
      '1. **攻击路径置信度仅 74%**：缺少强证据。',
      '2. **日志时间与构建时间不一致**：需要确认。',
      '3. **依赖漏洞',
    ].join('\n')

    const sanitized = sanitizeAgentAnswerMarkdown(answer)

    expect(sanitized).toContain('1. **攻击路径置信度仅 74%**：缺少强证据。')
    expect(sanitized).toContain('3. 依赖漏洞（原回答已截断）')
    expect(sanitized).not.toContain('3. **依赖漏洞')
  })
})

describe('Agent回答焦点识别', () => {
  it('将项目真实供应链攻击与模块调用问题识别为全局研判', () => {
    expect(agentAnswerFocus('该项目是否存在真实供应链攻击？请列出调用模块和证据链')).toBe('global')
  })

  it('保留明确的代码与日志模块问题', () => {
    expect(agentAnswerFocus('axios的函数调用是否可以从入口到达？')).toBe('code_audit')
    expect(agentAnswerFocus('日志中是否存在异常外联？')).toBe('log_audit')
  })

  it('将跨模块证据问题识别为全局研判', () => {
    expect(agentAnswerFocus('依赖风险和运行日志能否形成同一条证据链？')).toBe('global')
  })

  it('无关键词时根据唯一已选模块确定焦点', () => {
    expect(agentAnswerFocus('结果怎么样？', ['dependency_audit', 'workspace_report'])).toBe('dependency_audit')
  })
})

describe('Agent攻击证据链展示', () => {
  it('输出路径标识、判定、置信度、证据数和节点关系', () => {
    const run = {
      verdict: {
        chainEvidence: {
          status: 'confirmed',
          pathId: 'attack-path:confirmed',
          confidence: 84,
          evidenceIds: ['ev-1', 'ev-2'],
        },
      },
      workspace: {
        graph: {
          attack_paths: [
            {
              id: 'attack-path:confirmed',
              title: '依赖到运行期异常路径',
              verdict: 'likely-real-attack-path',
              confidence: 0.84,
              evidence_ids: ['ev-1', 'ev-2', 'ev-3'],
              path_steps: [
                {
                  source: 'npm:axios@1.6.8',
                  source_type: 'Dependency',
                  target: 'desktop-release.yml',
                  target_type: 'Build',
                  relationship: '进入构建',
                  evidence_ids: ['ev-3'],
                },
              ],
            },
          ],
        },
      },
    } as unknown as AgentRunResult

    const lines = agentEvidenceChainLines(run, 'global').join('\n')

    expect(lines).toContain('依赖到运行期异常路径')
    expect(lines).toContain('路径ID：attack-path:confirmed')
    expect(lines).toContain('判定：高可信真实攻击路径')
    expect(lines).toContain('路径置信度：84%')
    expect(lines).toContain('关联证据：3条')
    expect(lines).toContain('Dependency:npm:axios@1.6.8 --进入构建--> Build:desktop-release.yml')
  })

  it('无关联路径时明确说明不能确认真实攻击', () => {
    const run = {
      verdict: { chainEvidence: { status: 'missing' } },
      workspace: { graph: { attack_paths: [] } },
    } as unknown as AgentRunResult

    expect(agentEvidenceChainLines(run, 'global').join('\n')).toContain('不能确认真实攻击')
  })
})
