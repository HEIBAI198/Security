export type AgentQuestionDecision = {
  action: 'scan' | 'answer'
  reason: 'first_scan' | 'explicit_rescan' | 'reuse_existing_evidence'
}

const explicitRescanPatterns = [
  /重新(?:扫描|检测|研判|调查)/,
  /再次(?:扫描|检测|研判|调查)/,
  /重跑/,
  /强制(?:扫描|检测)/,
  /更新(?:扫描|检测)结果/,
  /(?:开始|执行)(?:一次|新一轮)?(?:扫描|检测)/,
  /\b(?:rescan|rerun)\b/i,
  /\bscan\s+again\b/i,
]

export function decideAgentQuestionAction(
  question: string,
  hasCompletedScan: boolean
): AgentQuestionDecision {
  if (!hasCompletedScan) {
    return { action: 'scan', reason: 'first_scan' }
  }

  const explicitlyRequestsRescan = explicitRescanPatterns.some((pattern) =>
    pattern.test(question.trim())
  )
  if (explicitlyRequestsRescan) {
    return { action: 'scan', reason: 'explicit_rescan' }
  }

  return { action: 'answer', reason: 'reuse_existing_evidence' }
}
