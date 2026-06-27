# Persistent Report Chat Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, expandable, exportable traceability report card to the investigation conversation whenever the loaded workspace has a generated report.

**Architecture:** Build a focused `ConversationReportCard` component next to the security platform feature, derive all display state from `SecurityWorkspace`, and reuse the existing workspace evidence package API helper. Integrate the card into `AgentConversationHome` after scan progress so historical conversations show the saved report without adding new backend persistence.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, lucide-react, shadcn/ui primitives, sonner, Vitest browser tests.

## Global Constraints

- No backend report generation changes.
- No conversation message persistence schema changes.
- Do not replace the standalone `ReportPanel`.
- The card must render from persisted `workspace.report`, not transient scan completion state.
- The card must support expand/collapse, Markdown export, HTML export, evidence package export, and opening the full report tab.
- Use existing surface utilities such as `surface-raised` and `surface-inset`.
- Run `npm run build` in `frontend` before claiming completion.

---

## File Structure

- Create `frontend/src/features/security-platform/conversation-report-card.tsx`.
  - Owns the persistent report card UI, report-derived metrics, summary extraction, and client-side export handlers.
  - Exports `ConversationReportCard` and small helper functions for focused tests.
- Create `frontend/src/features/security-platform/conversation-report-card.test.tsx`.
  - Browser-renders the component and tests report visibility, collapse/expand, Markdown export, HTML export, evidence package export, and full-report navigation.
- Modify `frontend/src/features/security-platform/index.tsx`.
  - Import `ConversationReportCard`.
  - Pass an `onOpenReport` callback through `AgentConversationHome`.
  - Render the card after `ScanProgressPanel`.
- Modify `frontend/src/features/security-platform/supplement-file-workflow.test.ts`.
  - Add lightweight source integration assertions for the import, prop, and render location.

---

### Task 1: Conversation Report Card Component

**Files:**
- Create: `frontend/src/features/security-platform/conversation-report-card.tsx`
- Create: `frontend/src/features/security-platform/conversation-report-card.test.tsx`

**Interfaces:**
- Consumes:
  - `SecurityWorkspace` from `@/lib/security-api`
  - `downloadWorkspaceEvidencePackage(workspaceId: string): Promise<Blob>` from `@/lib/security-api`
- Produces:
  - `ConversationReportCard({ workspace, onOpenReport }: { workspace: SecurityWorkspace; onOpenReport: () => void })`
  - `hasWorkspaceReport(workspace: Pick<SecurityWorkspace, 'report'>): boolean`
  - `buildConversationReportMetrics(workspace: SecurityWorkspace): ConversationReportMetric[]`
  - `extractConversationReportSummary(report: string, workspace: SecurityWorkspace): string`

- [ ] **Step 1: Write the failing component test**

Create `frontend/src/features/security-platform/conversation-report-card.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import type { SecurityWorkspace } from '@/lib/security-api'
import {
  ConversationReportCard,
  buildConversationReportMetrics,
  extractConversationReportSummary,
  hasWorkspaceReport,
} from './conversation-report-card'

const downloadWorkspaceEvidencePackage = vi.fn()

vi.mock('@/lib/security-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security-api')>()
  return {
    ...actual,
    downloadWorkspaceEvidencePackage: (...args: unknown[]) =>
      downloadWorkspaceEvidencePackage(...args),
  }
})

const click = vi.fn()
const createObjectURL = vi.fn(() => 'blob:report')
const revokeObjectURL = vi.fn()

function workspace(overrides: Partial<SecurityWorkspace> = {}): SecurityWorkspace {
  return {
    workspaceId: 'ws-test',
    generated_at: '2026-06-27T10:00:00',
    workspace: {
      workspaceId: 'ws-test',
      name: 'demo',
      repository: 'repo',
      branch: 'main',
      commit: 'abc123',
      build: 'demo build',
      runtime: 'demo runtime',
      mode: 'imported',
    },
    summary: {
      risk_score: 92,
      risk_level: 'high',
      open_findings: 4,
      critical_findings: 1,
      repositories: 1,
      dependencies: 12,
      build_steps: 3,
      log_events: 9,
      attack_paths: 2,
      mean_triage_minutes: 15,
    },
    modules: [],
    trend: [],
    findings: [],
    dependencies: [],
    pipeline: [],
    logs: [],
    graph: {
      generated_at: '2026-06-27T10:05:00',
      summary: {
        node_count: 42,
        edge_count: 55,
        attack_path_count: 2,
        actionable_attack_path_count: 1,
        average_path_confidence: 0.86,
        risk_score: 92,
        risk_level: 'high',
        node_types: {},
        edge_types: {},
      },
      attack_paths: [
        {
          id: 'path-1',
          title: 'dependency to runtime',
          severity: 'high',
          confidence: 0.86,
          description: 'path description',
          conclusion: 'primary conclusion',
          path_steps: [
            {
              source: 'package-a',
              target: 'build',
              relationship: 'poisoned dependency',
              confidence: 0.8,
              evidence_ids: ['ev-1'],
            },
          ],
        },
      ],
    },
    facts: { summary: { evidence_count: 18 }, items: [] },
    assistant: {
      default_question: 'question',
      answer: 'assistant fallback answer',
      retrieval: [],
      next_actions: [],
    },
    integrations: [],
    report:
      '# APT 供应链攻击溯源报告\n\n本次扫描确认依赖污染进入构建链，并在运行期日志中得到印证。\n\n## 处置建议\n\n- 轮换凭据\n- 固定依赖版本',
    ...overrides,
  } as SecurityWorkspace
}

describe('conversation report helpers', () => {
  it('detects persisted report content', () => {
    expect(hasWorkspaceReport(workspace())).toBe(true)
    expect(hasWorkspaceReport(workspace({ report: '   ' }))).toBe(false)
  })

  it('builds metrics from workspace summary and graph data', () => {
    expect(buildConversationReportMetrics(workspace()).map((item) => item.value)).toEqual([
      '92/100',
      '2',
      '18',
      '86%',
    ])
  })

  it('extracts a readable summary from report body before falling back to assistant text', () => {
    expect(extractConversationReportSummary(workspace().report, workspace())).toContain(
      '依赖污染进入构建链'
    )
    expect(extractConversationReportSummary('', workspace())).toContain('assistant fallback answer')
  })
})

describe('ConversationReportCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    downloadWorkspaceEvidencePackage.mockResolvedValue(new Blob(['zip'], { type: 'application/zip' }))
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = document.createElementNS('http://www.w3.org/1999/xhtml', tagName) as HTMLElement
      if (tagName === 'a') {
        Object.assign(element, { click })
      }
      return element as never
    })
  })

  it('renders collapsed report summary and expands preview details', async () => {
    const onOpenReport = vi.fn()
    const screen = await render(
      <ConversationReportCard workspace={workspace()} onOpenReport={onOpenReport} />
    )

    await expect.element(screen.getByText('溯源报告已生成')).toBeInTheDocument()
    await expect.element(screen.getByText('92/100')).toBeInTheDocument()
    await expect.element(screen.getByText(/依赖污染进入构建链/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /展开报告/ }))

    await expect.element(screen.getByText('报告预览')).toBeInTheDocument()
    await expect.element(screen.getByText('攻击路径片段')).toBeInTheDocument()
    await expect.element(screen.getByText('Markdown 源码')).toBeInTheDocument()
  })

  it('exports report artifacts and opens the full report tab', async () => {
    const onOpenReport = vi.fn()
    const screen = await render(
      <ConversationReportCard workspace={workspace()} onOpenReport={onOpenReport} />
    )

    await userEvent.click(screen.getByRole('button', { name: /导出 Markdown/ }))
    await userEvent.click(screen.getByRole('button', { name: /导出 HTML/ }))
    await userEvent.click(screen.getByRole('button', { name: /导出证据包/ }))
    await userEvent.click(screen.getByRole('button', { name: /打开完整报告/ }))

    expect(createObjectURL).toHaveBeenCalledTimes(3)
    expect(downloadWorkspaceEvidencePackage).toHaveBeenCalledWith('ws-test')
    expect(onOpenReport).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd frontend
npm test -- src/features/security-platform/conversation-report-card.test.tsx
```

Expected: FAIL because `./conversation-report-card` does not exist.

- [ ] **Step 3: Write the component implementation**

Create `frontend/src/features/security-platform/conversation-report-card.tsx`:

```tsx
import { useMemo, useState } from 'react'
import {
  Archive,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Route,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  downloadWorkspaceEvidencePackage,
  type SecurityWorkspace,
} from '@/lib/security-api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

export type ConversationReportMetric = {
  label: string
  value: string
  detail: string
}

export function hasWorkspaceReport(workspace: Pick<SecurityWorkspace, 'report'>) {
  return Boolean(String(workspace.report ?? '').trim())
}

export function buildConversationReportMetrics(
  workspace: SecurityWorkspace
): ConversationReportMetric[] {
  const graphSummary = workspace.graph?.summary
  const pathCount =
    graphSummary?.actionable_attack_path_count ??
    graphSummary?.attack_path_count ??
    workspace.summary.attack_paths ??
    0
  const evidenceCount =
    workspace.facts?.summary?.evidence_count ??
    graphSummary?.node_count ??
    workspace.summary.log_events ??
    workspace.summary.open_findings ??
    0
  const confidenceSource =
    graphSummary?.average_path_confidence ??
    workspace.graph?.attack_paths?.[0]?.confidence ??
    0
  const confidence =
    confidenceSource > 1 ? Math.round(confidenceSource) : Math.round(confidenceSource * 100)

  return [
    {
      label: '风险',
      value: `${workspace.summary.risk_score}/100`,
      detail: String(workspace.summary.risk_level || 'unknown'),
    },
    {
      label: '攻击路径',
      value: String(pathCount),
      detail: '候选链路',
    },
    {
      label: '证据',
      value: String(evidenceCount),
      detail: '已固化片段',
    },
    {
      label: '置信度',
      value: `${confidence}%`,
      detail: '路径均值',
    },
  ]
}

export function extractConversationReportSummary(
  report: string,
  workspace: SecurityWorkspace
) {
  const paragraph = String(report ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) =>
      line &&
      !line.startsWith('#') &&
      !line.startsWith('-') &&
      !line.startsWith('|') &&
      !line.startsWith('```')
    )
    .find((line) => line.length >= 12)

  const fallback = workspace.assistant?.answer || '报告已生成，可展开查看关键结论、证据链和处置建议。'
  return (paragraph || fallback).slice(0, 180)
}

function workspaceIdOf(workspace: SecurityWorkspace) {
  return workspace.workspaceId || workspace.workspace_id || workspace.workspace?.workspaceId || ''
}

function generatedAtOf(workspace: SecurityWorkspace) {
  return (
    workspace.graph?.generated_at ||
    workspace.generated_at ||
    ''
  ).slice(0, 19).replace('T', ' ')
}

function riskBadgeClass(riskLevel: string) {
  const normalized = riskLevel.toLowerCase()
  if (normalized === 'critical') return 'border-red-500/35 bg-red-500/10 text-red-600 dark:text-red-300'
  if (normalized === 'high') return 'border-orange-500/35 bg-orange-500/10 text-orange-600 dark:text-orange-300'
  if (normalized === 'medium') return 'border-amber-500/35 bg-amber-500/10 text-amber-600 dark:text-amber-300'
  return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
}

function safeFilename(workspace: SecurityWorkspace, extension: string) {
  const name = workspace.workspace?.name || workspace.import?.projectName || 'traceability-report'
  return `${name.replace(/[^\w.-]+/g, '-')}.${extension}`
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function reportHtml(workspace: SecurityWorkspace, report: string) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>溯源报告</title><style>body{max-width:920px;margin:32px auto;padding:0 20px;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.8;color:#172033;background:#f6f8fb}pre{white-space:pre-wrap;background:#fff;border:1px solid #dbe4ef;border-radius:8px;padding:16px}</style></head><body><h1>${escapeHtml(workspace.workspace?.name || '溯源报告')}</h1><pre>${escapeHtml(report)}</pre></body></html>`
}

export function ConversationReportCard({
  workspace,
  onOpenReport,
}: {
  workspace: SecurityWorkspace
  onOpenReport: () => void
}) {
  const [open, setOpen] = useState(false)
  const [markdownOpen, setMarkdownOpen] = useState(false)
  const [exportingEvidence, setExportingEvidence] = useState(false)
  const report = String(workspace.report ?? '')
  const metrics = useMemo(() => buildConversationReportMetrics(workspace), [workspace])
  const summary = useMemo(
    () => extractConversationReportSummary(report, workspace),
    [report, workspace]
  )
  const generatedAt = generatedAtOf(workspace)
  const workspaceId = workspaceIdOf(workspace)
  const pathSteps = workspace.graph?.attack_paths?.[0]?.path_steps?.slice(0, 3) ?? []

  if (!hasWorkspaceReport(workspace)) return null

  function exportMarkdown() {
    downloadBlob(
      new Blob([report], { type: 'text/markdown;charset=utf-8' }),
      safeFilename(workspace, 'md')
    )
    toast.success('Markdown 报告已导出')
  }

  function exportHtml() {
    downloadBlob(
      new Blob([reportHtml(workspace, report)], { type: 'text/html;charset=utf-8' }),
      safeFilename(workspace, 'html')
    )
    toast.success('HTML 报告已导出')
  }

  async function exportEvidence() {
    if (!workspaceId) {
      toast.error('缺少 workspaceId，无法导出证据包')
      return
    }
    setExportingEvidence(true)
    try {
      const blob = await downloadWorkspaceEvidencePackage(workspaceId)
      downloadBlob(blob, `${workspaceId}-evidence-package.zip`)
      toast.success('证据包已导出')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '证据包导出失败')
    } finally {
      setExportingEvidence(false)
    }
  }

  return (
    <div className='surface-raised rounded-md border p-4 shadow-sm'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0 space-y-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <FileText className='size-4 text-cyan-600' />
            <h3 className='text-sm font-semibold text-foreground'>溯源报告已生成</h3>
            <Badge variant='outline' className={cn('rounded-md text-[11px]', riskBadgeClass(workspace.summary.risk_level))}>
              {workspace.summary.risk_level}
            </Badge>
          </div>
          <p className='text-xs text-muted-foreground'>
            {generatedAt ? `生成时间 ${generatedAt}` : '当前工作空间已保存报告'}
          </p>
        </div>
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button variant='outline' size='sm' className='h-8 gap-1.5 rounded-md'>
              <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
              {open ? '收起报告' : '展开报告'}
            </Button>
          </CollapsibleTrigger>
        </Collapsible>
      </div>

      <div className='mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4'>
        {metrics.map((metric) => (
          <div key={metric.label} className='surface-inset rounded-md border px-3 py-2'>
            <div className='text-[11px] text-muted-foreground'>{metric.label}</div>
            <div className='mt-1 text-lg font-semibold tabular-nums'>{metric.value}</div>
            <div className='text-[11px] text-muted-foreground'>{metric.detail}</div>
          </div>
        ))}
      </div>

      <p className='mt-4 rounded-md border bg-[color:var(--surface-inset)] px-3 py-2 text-sm leading-6 text-foreground/90'>
        {summary}
      </p>

      <div className='mt-3 flex flex-wrap gap-2'>
        <Button variant='outline' size='sm' className='h-8 gap-1.5 rounded-md' onClick={exportMarkdown}>
          <Download className='size-3.5' />
          导出 Markdown
        </Button>
        <Button variant='outline' size='sm' className='h-8 gap-1.5 rounded-md' onClick={exportHtml}>
          <FileText className='size-3.5' />
          导出 HTML
        </Button>
        <Button variant='outline' size='sm' className='h-8 gap-1.5 rounded-md' onClick={() => void exportEvidence()} disabled={exportingEvidence}>
          {exportingEvidence ? <Loader2 className='size-3.5 animate-spin' /> : <Archive className='size-3.5' />}
          导出证据包
        </Button>
        <Button variant='ghost' size='sm' className='h-8 gap-1.5 rounded-md' onClick={onOpenReport}>
          <ExternalLink className='size-3.5' />
          打开完整报告
        </Button>
      </div>

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleContent className='mt-4 space-y-3'>
          <div className='grid gap-3 lg:grid-cols-[1fr_260px]'>
            <div className='surface-inset rounded-md border p-3'>
              <div className='mb-2 text-xs font-semibold text-muted-foreground'>报告预览</div>
              <div className='max-h-56 overflow-y-auto whitespace-pre-wrap text-xs leading-6 text-foreground/85'>
                {report.split('\n').slice(0, 18).join('\n')}
              </div>
            </div>
            <div className='surface-inset rounded-md border p-3'>
              <div className='mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground'>
                <Route className='size-3.5' />
                攻击路径片段
              </div>
              <div className='space-y-2'>
                {pathSteps.length ? pathSteps.map((step, index) => (
                  <div key={`${step.source || index}-${step.target || index}`} className='rounded-md border bg-background/60 p-2 text-xs'>
                    <div className='font-medium'>阶段 {index + 1}</div>
                    <div className='mt-1 text-muted-foreground'>
                      {step.source || '-'} → {step.target || '-'}
                    </div>
                    <div className='mt-1 text-muted-foreground'>{step.relationship || step.edge_type || '证据串联'}</div>
                  </div>
                )) : (
                  <div className='text-xs text-muted-foreground'>暂无可展示的路径片段</div>
                )}
              </div>
            </div>
          </div>

          <Collapsible open={markdownOpen} onOpenChange={setMarkdownOpen}>
            <CollapsibleTrigger asChild>
              <Button variant='ghost' size='sm' className='h-8 gap-1.5 rounded-md'>
                <Copy className='size-3.5' />
                Markdown 源码
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className='surface-inset mt-2 max-h-72 overflow-y-auto rounded-md border p-3 text-xs leading-6 whitespace-pre-wrap text-muted-foreground'>
                {report}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd frontend
npm test -- src/features/security-platform/conversation-report-card.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add frontend/src/features/security-platform/conversation-report-card.tsx frontend/src/features/security-platform/conversation-report-card.test.tsx
git commit -m "feat: add persistent report chat card"
```

Expected: Commit succeeds.

---

### Task 2: Conversation Integration

**Files:**
- Modify: `frontend/src/features/security-platform/index.tsx`
- Modify: `frontend/src/features/security-platform/supplement-file-workflow.test.ts`

**Interfaces:**
- Consumes:
  - `ConversationReportCard` from `./conversation-report-card`
  - Existing `AgentConversationHome` props and `openWorkspaceTab(module: PlatformTab | WorkspaceTab): void`
- Produces:
  - `AgentConversationHome` accepts `onOpenReport: () => void`
  - Overview conversation renders `<ConversationReportCard workspace={workspace} onOpenReport={onOpenReport} />`

- [ ] **Step 1: Write the failing source integration test**

Append this test to `describe('security platform supplement-file integration', ...)` in `frontend/src/features/security-platform/supplement-file-workflow.test.ts`:

```ts
  it('renders the persisted report card inside the investigation conversation', () => {
    expect(platformSource).toContain("import { ConversationReportCard } from './conversation-report-card'")
    expect(platformSource).toContain('onOpenReport={() => openWorkspaceTab(\\'report\\')}')
    expect(platformSource).toContain('onOpenReport: () => void')
    expect(platformSource).toContain('<ConversationReportCard')
    expect(platformSource).toContain('workspace={workspace}')
    expect(platformSource).toContain('onOpenReport={onOpenReport}')
    expect(platformSource.indexOf('<ScanProgressPanel')).toBeLessThan(
      platformSource.indexOf('<ConversationReportCard')
    )
    expect(platformSource.indexOf('<ConversationReportCard')).toBeLessThan(
      platformSource.indexOf('<ModuleLaunchGrid')
    )
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd frontend
npm test -- src/features/security-platform/supplement-file-workflow.test.ts
```

Expected: FAIL because `ConversationReportCard` is not imported or rendered in `index.tsx`.

- [ ] **Step 3: Integrate the card into the conversation**

Modify imports near the existing local feature imports in `frontend/src/features/security-platform/index.tsx`:

```tsx
import { AttackChainGraph } from './attack-chain-graph'
import { ReportPanel } from './report-panel'
import { ConversationReportCard } from './conversation-report-card'
```

Modify the `AgentConversationHome` call in the overview tab:

```tsx
<AgentConversationHome
  workspace={workspace}
  analysisStarted={analysisStarted}
  scanRunning={scanRunning}
  scanSteps={scanSteps}
  question={question}
  setQuestion={setQuestion}
  answer={assistantAnswer}
  busy={assistantBusy}
  onSubmit={() => void submitQuestion()}
  onStartAnalysis={() => void startFullAnalysis()}
  onOpenModule={(module) => openWorkspaceTab(module)}
  onOpenReport={() => openWorkspaceTab('report')}
/>
```

Modify `AgentConversationHome` props:

```tsx
function AgentConversationHome({
  workspace,
  analysisStarted,
  scanRunning,
  scanSteps,
  question,
  setQuestion,
  answer,
  busy,
  onSubmit,
  onStartAnalysis,
  onOpenModule,
  onOpenReport,
}: {
  workspace: SecurityWorkspace
  analysisStarted: boolean
  scanRunning: boolean
  scanSteps: ScanStepState[]
  question: string
  setQuestion: (value: string) => void
  answer: SecurityAssistantResponse | null
  busy: boolean
  onSubmit: () => void
  onStartAnalysis: () => void
  onOpenModule: (module: PlatformTab) => void
  onOpenReport: () => void
}) {
```

Render the card after `ScanProgressPanel` and before `ModuleLaunchGrid`:

```tsx
          <ScanProgressPanel steps={scanSteps} running={scanRunning} completed={analysisStarted} />
          <ConversationReportCard workspace={workspace} onOpenReport={onOpenReport} />
          <ModuleLaunchGrid
            modules={visibleModules}
            analysisStarted={analysisStarted}
            scanRunning={scanRunning}
            scanSteps={scanSteps}
            onStart={onStartAnalysis}
            onOpenModule={onOpenModule}
          />
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
cd frontend
npm test -- src/features/security-platform/conversation-report-card.test.tsx src/features/security-platform/supplement-file-workflow.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run build verification**

Run:

```bash
cd frontend
npm run build
```

Expected: PASS with Vite producing the production build.

- [ ] **Step 6: Commit**

Run:

```bash
git add frontend/src/features/security-platform/index.tsx frontend/src/features/security-platform/supplement-file-workflow.test.ts
git commit -m "feat: show reports in investigation conversation"
```

Expected: Commit succeeds.

---

## Plan Self-Review

Spec coverage:

- Persistent report card from `workspace.report`: Task 1 helper and Task 2 integration.
- Long-term visibility in historical conversations: Task 2 derives rendering from loaded workspace data.
- Expand/collapse: Task 1 `Collapsible` and component test.
- Markdown, HTML, evidence package export: Task 1 handlers and test.
- Open full report tab: Task 1 prop and Task 2 `openWorkspaceTab('report')`.
- Existing security-console visual fit: Task 1 uses `surface-raised`, `surface-inset`, badges, compact metrics, and lucide icons.
- No backend changes: both tasks are frontend-only.

Placeholder scan:

- No `TBD`, `TODO`, or deferred implementation language is used as a task requirement.

Type consistency:

- `ConversationReportCard` prop names match Task 2 usage.
- `onOpenReport` is introduced in the component and `AgentConversationHome` with the same `() => void` signature.
- `SecurityWorkspace` fields match `frontend/src/lib/security-api.ts`.
