import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ReactNode } from 'react'
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react'
import {
  AlertTriangle,
  Bot,
  Boxes,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  ClipboardList,
  Code2,
  Copy,
  CornerDownLeft,
  Download,
  EyeOff,
  FileSearch,
  FileText,
  Fingerprint,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequestArrow,
  KeyRound,
  Loader2,
  MessageSquare,
  Network,
  PackageCheck,
  Radar,
  RefreshCw,
  Search,
  Send,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  TerminalSquare,
  TrendingUp,
  Upload,
  User,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  askSecurityAssistant,
  createCICDAuditBaseline,
  createCodeAuditBaseline,
  createRealtimeLogBaseline,
  ignoreCICDAuditFinding,
  ignoreCodeAuditFinding,
  ignoreRealtimeLogFinding,
  ingestRealtimeLogs,
  loadCICDAuditSarif,
  loadDependencyAuditSbom,
  loadArtifactTrustReport,
  loadCodeAuditSarif,
  loadGitHubCodeScanningUploadStatus,
  loadCodeAuditState,
  loadRealtimeLogEvents,
  loadRealtimeLogTrend,
  loadSecurityWorkspace,
  runCICDAuditScan,
  runArtifactTrustScan,
  runDependencyAuditScan,
  runCodeAuditScan,
  runLogAuditScan,
  uploadArtifactTrustScan,
  type ArtifactTrustResult,
  uploadCodeAuditToGitHubCodeScanning,
  uploadCICDAuditToGitHubCodeScanning,
  type CodeAuditResult,
  type CodeAuditScanner,
  type CodeAuditState,
  type CICDAuditResult,
  type DependencyAuditResult,
  type GitHubCodeScanningUploadResult,
  type LogAuditResult,
  type LogAuditSource,
  type RealtimeLogPayload,
  type RealtimeLogTrendPoint,
  type SecurityAssistantPayload,
  type SecurityAssistantResponse,
  type SecurityDependency,
  type SecurityFinding,
  type SecurityLogEvent,
  type SecurityPipelineStep,
  type SecuritySeverity,
  type SecurityWorkspace,
} from '@/lib/security-api'
import { IconGithub } from '@/assets/brand-icons'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip as UiTooltip,
  TooltipContent as UiTooltipContent,
  TooltipTrigger as UiTooltipTrigger,
} from '@/components/ui/tooltip'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Search as GlobalSearch } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

const platformTabs = [
  'overview',
  'code',
  'supply',
  'pipeline',
  'artifact',
  'logs',
  'graph',
  'copilot',
  'report',
] as const

type PlatformTab = (typeof platformTabs)[number]
type KnowledgeGraphAttackPath = NonNullable<
  NonNullable<SecurityWorkspace['graph']>['attack_paths']
>[number]

const severityLabels: Record<SecuritySeverity, string> = {
  critical: '严重',
  high: '高危',
  medium: '中危',
  low: '低危',
}

const severityClasses: Record<SecuritySeverity, string> = {
  critical:
    'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/45 dark:text-red-300',
  high: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/45 dark:text-orange-300',
  medium:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/45 dark:text-amber-300',
  low: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/45 dark:text-emerald-300',
}

const statusClasses: Record<string, string> = {
  critical:
    'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/45 dark:text-red-300',
  high: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/45 dark:text-orange-300',
  medium:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/45 dark:text-amber-300',
  active:
    'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/45 dark:text-cyan-300',
  observed:
    'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
}

const graphPositions: Record<string, { x: number; y: number }> = {
  repo: { x: 0, y: 120 },
  commit: { x: 230, y: 120 },
  package: { x: 460, y: 20 },
  script: { x: 690, y: 20 },
  build: { x: 920, y: 120 },
  artifact: { x: 690, y: 230 },
  service: { x: 460, y: 330 },
  log: { x: 230, y: 330 },
  apt: { x: 0, y: 330 },
}

const fallbackQuestion = '这条供应链攻击链路应该优先修哪里？'
const fallbackAssistant: SecurityAssistantPayload = {
  default_question: fallbackQuestion,
  answer: '当前还没有生成安全助手研判，请先完成扫描或刷新安全态势。',
  retrieval: [],
  next_actions: ['先确认代码审计、供应链、CI/CD 和日志识别数据是否已生成。'],
}

function getAssistantPayload(workspace: Pick<SecurityWorkspace, 'assistant'>): SecurityAssistantPayload {
  const assistant = workspace.assistant
  return {
    default_question: assistant?.default_question || fallbackAssistant.default_question,
    answer: assistant?.answer || fallbackAssistant.answer,
    retrieval: assistant?.retrieval ?? fallbackAssistant.retrieval,
    next_actions: assistant?.next_actions?.length
      ? assistant.next_actions
      : fallbackAssistant.next_actions,
  }
}

function getWorkspaceReport(workspace: Pick<SecurityWorkspace, 'report'>) {
  return workspace.report || '# 安全分析报告\n\n暂无报告内容，请先运行扫描或刷新安全态势。'
}

export function SecurityPlatform() {
  const [workspace, setWorkspace] = useState<SecurityWorkspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [question, setQuestion] = useState('')
  const [assistantAnswer, setAssistantAnswer] =
    useState<SecurityAssistantResponse | null>(null)
  const [assistantBusy, setAssistantBusy] = useState(false)
  const [activeTab, setActiveTab] = useState<PlatformTab>(() =>
    tabFromHash(window.location.hash)
  )

  async function loadWorkspace(showToast = false) {
    setRefreshing(true)
    try {
      const payload = await loadSecurityWorkspace()
      const assistant = getAssistantPayload(payload)
      setWorkspace(payload)
      if (!assistantAnswer) {
        setAssistantAnswer({
          question: assistant.default_question,
          answer: assistant.answer,
          retrieval: assistant.retrieval,
          next_actions: assistant.next_actions,
          model: 'demo-rag-security-analyst',
        })
      }
      if (showToast) toast.success('安全态势已刷新')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载安全态势失败')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadWorkspace()
  }, [])

  useEffect(() => {
    const onHashChange = () => setActiveTab(tabFromHash(window.location.hash))
    onHashChange()
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  async function submitQuestion() {
    const value = question.trim()
    if (!value) return
    setAssistantBusy(true)
    try {
      setAssistantAnswer(await askSecurityAssistant(value))
      setQuestion('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '安全助手分析失败')
    } finally {
      setAssistantBusy(false)
    }
  }

  if (loading) {
    return (
      <div className='flex min-h-svh items-center justify-center gap-3 text-muted-foreground'>
        <Loader2 className='size-5 animate-spin' />
        正在加载供应链安全态势
      </div>
    )
  }

  if (!workspace) {
    return (
      <Main>
        <Alert variant='destructive'>
          <AlertTriangle />
          <AlertTitle>安全态势加载失败</AlertTitle>
          <AlertDescription>
            请确认后端服务已启动，并检查 /api/security/workspace。
          </AlertDescription>
        </Alert>
      </Main>
    )
  }

  return (
    <div className='security-platform min-h-svh bg-background'>
      <Header fixed>
        <div className='flex min-w-0 flex-1 items-center justify-between gap-4'>
          <div className='min-w-0'>
            <div className='truncate text-sm font-semibold'>
              大模型与安全知识图谱供应链攻击检测平台
            </div>
            <div className='truncate text-xs text-muted-foreground'>
              {workspace.workspace.repository} · {workspace.workspace.commit}
            </div>
          </div>
          <div className='flex shrink-0 items-center gap-2'>
            <GlobalSearch />
            <ThemeSwitch />
            <Button
              variant='outline'
              size='sm'
              onClick={() => void loadWorkspace(true)}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className='animate-spin' />
              ) : (
                <RefreshCw />
              )}
              刷新
            </Button>
          </div>
        </div>
      </Header>

      <Main fluid className='space-y-4'>
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            const nextTab = value as PlatformTab
            setActiveTab(nextTab)
            window.history.replaceState(null, '', `#${nextTab}`)
          }}
          className='space-y-4'
        >
          <ScrollArea orientation='horizontal'>
            <TabsList className='h-10 w-max rounded-md'>
              <TabsTrigger value='overview'>态势总览</TabsTrigger>
              <TabsTrigger value='code'>代码审计</TabsTrigger>
              <TabsTrigger value='supply'>供应链检测</TabsTrigger>
              <TabsTrigger value='pipeline'>CI/CD 链路</TabsTrigger>
              <TabsTrigger value='artifact'>产物可信</TabsTrigger>
              <TabsTrigger value='logs'>日志识别</TabsTrigger>
              <TabsTrigger value='graph'>知识图谱</TabsTrigger>
              <TabsTrigger value='copilot'>安全 Copilot</TabsTrigger>
              <TabsTrigger value='report'>安全分析报告</TabsTrigger>
            </TabsList>
          </ScrollArea>

          <TabsContent value='overview' className='space-y-4'>
            <OverviewPanel workspace={workspace} />
          </TabsContent>

          <TabsContent value='code' className='space-y-4'>
            <CodeAuditPanel
              audit={workspace.code_audit}
              importId={workspace.code_audit?.target?.importId}
              onScanned={(audit) => {
                setWorkspace({ ...workspace, code_audit: audit })
                toast.success(`代码审计完成，发现 ${audit.summary.total} 项风险`)
              }}
            />
          </TabsContent>

          <TabsContent value='supply' className='space-y-4'>
            <SupplyChainPanel
              audit={workspace.dependency_audit}
              dependencies={workspace.dependencies ?? []}
              findings={workspace.findings ?? []}
              importId={workspace.dependency_audit?.target?.importId ?? workspace.code_audit?.target?.importId}
              onScanned={(audit) => {
                setWorkspace({
                  ...workspace,
                  dependency_audit: audit,
                  dependencies: audit.dependencies,
                  findings: [
                    ...audit.findings.map((finding) => ({
                      id: finding.id,
                      title: finding.title,
                      module: '供应链',
                      severity: finding.severity,
                      score: finding.score,
                      asset: `${finding.ecosystem}:${finding.dependency} (${finding.source_file})`,
                      evidence: finding.evidence,
                      first_seen: (audit.generated_at ?? '').slice(0, 16).replace('T', ' '),
                      owner: 'appsec',
                      status: finding.recommendation,
                    })),
                    ...(workspace.findings ?? []).filter(
                      (finding) =>
                        !finding.module.includes('供应链') &&
                        !finding.module.includes('供应链')
                    ),
                  ],
                  summary: {
                    ...workspace.summary,
                    dependencies: audit.summary.total_dependencies,
                    risk_score: Math.max(workspace.summary.risk_score, audit.summary.risk_score),
                  },
                })
                toast.success(`依赖扫描完成，发现 ${audit.summary.total_dependencies} 个直接依赖`)
              }}
            />
          </TabsContent>

          <TabsContent value='pipeline' className='space-y-4'>
            <PipelinePanel
              pipeline={workspace.pipeline ?? []}
              audit={workspace.cicd_audit}
              importId={workspace.cicd_audit?.target?.importId ?? workspace.code_audit?.target?.importId}
              onScanned={(audit) => {
                setWorkspace({
                  ...workspace,
                  cicd_audit: audit,
                  findings: [
                    ...audit.findings.map((finding) => ({
                      id: finding.id,
                      title: finding.title,
                      module: 'CI/CD',
                      severity: finding.severity,
                      score: finding.score,
                      asset: `${finding.workflow}:${finding.line}`,
                      evidence: finding.evidence,
                      first_seen: (audit.generated_at ?? '').slice(0, 16).replace('T', ' '),
                      owner: 'devops',
                      status: finding.recommendation,
                    })),
                    ...(workspace.findings ?? []).filter((finding) => !finding.module.includes('CI/CD')),
                  ],
                  summary: {
                    ...workspace.summary,
                    build_steps: audit.summary.total_steps,
                    risk_score: Math.max(workspace.summary.risk_score, audit.summary.risk_score),
                  },
                })
                toast.success(`CI/CD 扫描完成，发现 ${audit.summary.finding_count} 项风险`)
              }}
            />
          </TabsContent>

          <TabsContent value='artifact' className='space-y-4'>
            <ArtifactTrustPanel
              result={workspace.artifact_trust}
              onScanned={(result) => {
                setWorkspace(applyArtifactTrustToWorkspace(workspace, result))
                toast.success(`产物可信验证完成，评分 ${artifactTrustScore(result)} / 100`)
              }}
            />
          </TabsContent>

          <TabsContent value='logs' className='space-y-4'>
            <LogsPanel
              logs={workspace.logs ?? []}
              audit={workspace.log_audit}
              onRealtimeChanged={async () => {
                const nextWorkspace = await loadSecurityWorkspace()
                setWorkspace(nextWorkspace)
              }}
              onScanned={(audit) => {
                setWorkspace(applyLogAuditToWorkspace(workspace, audit))
                toast.success(`日志扫描完成，发现 ${audit.summary.finding_count} 项运行期风险`)
              }}
            />
          </TabsContent>

          <TabsContent value='graph' className='space-y-4'>
            <KnowledgeGraph workspace={workspace} />
          </TabsContent>

          <TabsContent value='copilot' className='space-y-4'>
            <CopilotPanel
              workspace={workspace}
              question={question}
              setQuestion={setQuestion}
              answer={assistantAnswer}
              busy={assistantBusy}
              onSubmit={() => void submitQuestion()}
            />
          </TabsContent>

          <TabsContent value='report' className='space-y-4'>
            <ReportPanel workspace={workspace} />
          </TabsContent>
        </Tabs>
      </Main>
    </div>
  )
}

function OverviewPanel({ workspace }: { workspace: SecurityWorkspace }) {
  const assistant = getAssistantPayload(workspace)
  const modules = workspace.modules ?? []
  const findings = workspace.findings ?? []

  return (
    <div className='space-y-4'>
      <section className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]'>
        <div className='space-y-4'>
          <div className='space-y-2'>
            <Badge variant='outline' className='rounded-md border-cyan-200 bg-cyan-50 text-cyan-700'>
              RAG · SBOM · CI/CD · 日志 · 知识图谱
            </Badge>
            <h1 className='text-2xl font-semibold tracking-normal sm:text-3xl'>
              {workspace.workspace.name} 风险证据链
            </h1>
            <p className='max-w-3xl text-sm leading-6 text-muted-foreground'>
              代码风险、依赖风险、构建风险、运行日志和攻击阶段已关联成同一条可追溯证据链。
            </p>
          </div>

          <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
            <MetricCard
              icon={ShieldAlert}
              label='打开风险'
              value={workspace.summary.open_findings.toString()}
              detail={`${workspace.summary.critical_findings} 项严重风险`}
              tone='red'
            />
            <MetricCard
              icon={PackageCheck}
              label='依赖包'
              value={workspace.summary.dependencies.toString()}
              detail='SBOM 风险评分已生成'
              tone='cyan'
            />
            <MetricCard
              icon={GitPullRequestArrow}
              label='构建步骤'
              value={workspace.summary.build_steps.toString()}
              detail={`${workspace.summary.attack_paths} 条攻击路径`}
              tone='orange'
            />
            <MetricCard
              icon={Radar}
              label='日志事件'
              value={compactNumber(workspace.summary.log_events)}
              detail={`${workspace.summary.mean_triage_minutes} 分钟平均研判`}
              tone='emerald'
            />
          </div>
        </div>

        <Card className='rounded-md'>
          <CardHeader className='pb-3'>
            <CardTitle className='flex items-center gap-2 text-base'>
              <Siren className='size-4 text-red-600' />
              风险评分与研判
            </CardTitle>
            <CardDescription>
              先判断当前风险强度，再给出优先处置动作
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <RiskDial score={workspace.summary.risk_score} level={workspace.summary.risk_level} />
            <p className='text-sm leading-6 text-muted-foreground'>
              {assistant.answer}
            </p>
            <div className='space-y-2'>
              {assistant.next_actions.slice(0, 3).map((action) => (
                <div key={action} className='flex gap-2 rounded-md border p-2 text-sm'>
                  <CheckCircle2 className='mt-0.5 size-4 shrink-0 text-emerald-600' />
                  <span>{action}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className='grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]'>
        <Card className='rounded-md'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <Radar className='size-4 text-cyan-600' />
              七日风险趋势
            </CardTitle>
            <CardDescription>代码、依赖、构建和运行期风险信号的聚合趋势</CardDescription>
          </CardHeader>
          <CardContent>
            <RiskTrendChart workspace={workspace} />
          </CardContent>
        </Card>
        <Card className='rounded-md'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <ClipboardList className='size-4 text-emerald-600' />
              模块覆盖
            </CardTitle>
            <CardDescription>平台核心检测能力与当前风险状态</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {modules.map((module) => (
              <ModuleRow key={module.key} module={module} />
            ))}
          </CardContent>
        </Card>
      </section>

      <FindingsPanel findings={findings} />
    </div>
  )
}

function RiskDial({ score, level }: { score: number; level: string }) {
  return (
    <div className='flex items-center gap-3 rounded-md border bg-background p-3'>
      <div
        className='grid size-20 place-items-center rounded-full border-8 border-red-500/75 bg-red-50 text-xl font-bold text-red-700 dark:bg-red-950/30 dark:text-red-300'
        aria-label={`risk score ${score}`}
      >
        {score}
      </div>
      <div>
        <div className='text-xs uppercase text-muted-foreground'>综合风险评分</div>
        <div className='mt-1 text-lg font-semibold'>{level.toUpperCase()}</div>
        <div className='text-xs text-muted-foreground'>严重供应链攻击迹象</div>
      </div>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof ShieldAlert
  label: string
  value: string
  detail: string
  tone: 'red' | 'cyan' | 'orange' | 'emerald'
}) {
  const toneClass = {
    red: 'text-red-600 bg-red-50 dark:bg-red-950/35',
    cyan: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-950/35',
    orange: 'text-orange-600 bg-orange-50 dark:bg-orange-950/35',
    emerald: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/35',
  }[tone]

  return (
    <Card className='rounded-md'>
      <CardContent className='flex items-center justify-between gap-3 p-4'>
        <div className='min-w-0'>
          <div className='text-xs text-muted-foreground'>{label}</div>
          <div className='mt-1 text-2xl font-semibold'>{value}</div>
          <div className='mt-1 truncate text-xs text-muted-foreground'>{detail}</div>
        </div>
        <div className={cn('grid size-10 shrink-0 place-items-center rounded-md', toneClass)}>
          <Icon className='size-5' />
        </div>
      </CardContent>
    </Card>
  )
}

function RiskTrendChart({ workspace }: { workspace: SecurityWorkspace }) {
  return (
    <ResponsiveContainer width='100%' height={300}>
      <AreaChart data={workspace.trend ?? []} margin={{ left: 0, right: 10 }}>
        <CartesianGrid strokeDasharray='3 3' className='stroke-muted' />
        <XAxis dataKey='day' tickLine={false} axisLine={false} fontSize={12} />
        <YAxis tickLine={false} axisLine={false} fontSize={12} />
        <Tooltip />
        <Area type='monotone' dataKey='dependency' name='依赖风险' stroke='#dc2626' fill='#dc2626' fillOpacity={0.14} />
        <Area type='monotone' dataKey='runtime' name='运行日志' stroke='#0891b2' fill='#0891b2' fillOpacity={0.12} />
        <Area type='monotone' dataKey='build' name='构建链路' stroke='#ea580c' fill='#ea580c' fillOpacity={0.1} />
        <Area type='monotone' dataKey='code' name='代码审计' stroke='#059669' fill='#059669' fillOpacity={0.1} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function ModuleRow({ module }: { module: SecurityWorkspace['modules'][number] }) {
  return (
    <div className='space-y-2 rounded-md border p-3'>
      <div className='flex items-center justify-between gap-3'>
        <div className='font-medium'>{module.name}</div>
        <Badge variant='outline' className={cn('rounded-md', statusClasses[module.status] || statusClasses.observed)}>
          {module.signals} signals
        </Badge>
      </div>
      <div className='text-xs leading-5 text-muted-foreground'>{module.description}</div>
      <RiskBar value={module.score} />
    </div>
  )
}

function FindingsPanel({ findings }: { findings: SecurityFinding[] }) {
  return (
    <Card className='rounded-md'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-base'>
          <ShieldAlert className='size-4 text-red-600' />
          优先处置风险
        </CardTitle>
        <CardDescription>按证据强度、影响范围和可利用性排序</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='grid gap-3 lg:grid-cols-2'>
          {findings.map((finding) => (
            <FindingItem key={finding.id} finding={finding} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function FindingItem({ finding }: { finding: SecurityFinding }) {
  return (
    <div className='rounded-md border p-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <Badge variant='outline' className={cn('rounded-md', severityClasses[finding.severity])}>
          {severityLabels[finding.severity]}
        </Badge>
        <Badge variant='outline' className='rounded-md'>
          {finding.id}
        </Badge>
        <span className='text-xs text-muted-foreground'>{finding.first_seen}</span>
      </div>
      <div className='mt-3 font-semibold'>{finding.title}</div>
      <div className='mt-1 text-sm text-muted-foreground'>{finding.asset}</div>
      <p className='mt-3 text-sm leading-6'>{finding.evidence}</p>
      <div className='mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
        <span>owner: {finding.owner}</span>
        <Separator orientation='vertical' className='h-4' />
        <span>score: {finding.score}</span>
        <Separator orientation='vertical' className='h-4' />
        <span>{finding.status}</span>
      </div>
    </div>
  )
}

function CodeAuditPanel({
  audit,
  importId,
  onScanned,
}: {
  audit?: CodeAuditResult | null
  importId?: string
  onScanned: (audit: CodeAuditResult) => void
}) {
  const [scanning, setScanning] = useState(false)
  const [state, setState] = useState<CodeAuditState | null>(null)
  const [mutating, setMutating] = useState(false)
  const [githubOpen, setGithubOpen] = useState(false)
  const [githubOwner, setGithubOwner] = useState('HEIBAI198')
  const [githubRepo, setGithubRepo] = useState('Sysml')
  const [githubRef, setGithubRef] = useState('refs/heads/main')
  const [githubCommit, setGithubCommit] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [githubUploading, setGithubUploading] = useState(false)
  const [githubResult, setGithubResult] =
    useState<GitHubCodeScanningUploadResult | null>(null)

  useEffect(() => {
    let alive = true
    loadCodeAuditState()
      .then((payload) => {
        if (alive) setState(payload)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [audit?.scan_id])

  async function startScan() {
    setScanning(true)
    try {
      const targetPath = importId ? undefined : audit?.target_path
      const nextAudit = await runCodeAuditScan({
        importId,
        targetPath,
        includeCheckov: true,
        timeoutSeconds: 180,
      })
      onScanned(nextAudit)
      setState(await loadCodeAuditState())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '代码审计扫描失败')
    } finally {
      setScanning(false)
    }
  }

  async function downloadSarif() {
    try {
      const sarif = audit?.sarif ?? (await loadCodeAuditSarif())
      downloadJson(sarif, 'supplyguard-code-audit.sarif')
      toast.success('SARIF 已导出')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'SARIF 导出失败')
    }
  }

  async function uploadGithubCodeScanning() {
    if (!audit) return
    setGithubUploading(true)
    try {
      const result = await uploadCodeAuditToGitHubCodeScanning({
        owner: githubOwner.trim(),
        repo: githubRepo.trim(),
        ref: githubRef.trim(),
        ...(githubCommit.trim() ? { commit_sha: githubCommit.trim() } : {}),
        ...(githubToken.trim() ? { token: githubToken.trim() } : {}),
      })
      setGithubResult(result)
      toast.success('GitHub Code Scanning 已提交 SARIF')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'GitHub Code Scanning 连接失败')
    } finally {
      setGithubUploading(false)
    }
  }

  async function refreshGithubUploadStatus() {
    if (!githubResult?.sarif_id) return
    setGithubUploading(true)
    try {
      const result = await loadGitHubCodeScanningUploadStatus({
        owner: githubOwner.trim(),
        repo: githubRepo.trim(),
        sarif_id: githubResult.sarif_id,
        ...(githubToken.trim() ? { token: githubToken.trim() } : {}),
      })
      setGithubResult({
        ...githubResult,
        status: result.status || githubResult.status,
        url: result.analyses_url || githubResult.url,
      })
      toast.success('GitHub Code Scanning 状态已刷新')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'GitHub Code Scanning 状态查询失败')
    } finally {
      setGithubUploading(false)
    }
  }

  async function establishBaseline() {
    if (!audit) return
    setMutating(true)
    try {
      const payload = await createCodeAuditBaseline('accepted-current-risk')
      if (payload.code_audit) onScanned(payload.code_audit)
      setState(payload.state)
      toast.success('基线已建立')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '建立基线失败')
    } finally {
      setMutating(false)
    }
  }

  async function ignoreFinding(fingerprint: string) {
    setMutating(true)
    try {
      const payload = await ignoreCodeAuditFinding(fingerprint, 'false-positive')
      if (payload.code_audit) onScanned(payload.code_audit)
      setState(payload.state)
      toast.success('已加入误报忽略')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '忽略失败')
    } finally {
      setMutating(false)
    }
  }

  const total = audit?.summary.total ?? 0
  const findings = audit?.findings ?? []
  const scanners = audit?.scanners ?? []
  const trend = audit?.summary.trend ?? state?.trend ?? []

  return (
    <div className='space-y-4'>
      <Card className='rounded-md'>
        <CardHeader>
          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div>
              <CardTitle className='flex items-center gap-2 text-base'>
                <Code2 className='size-4 text-cyan-600' />
                代码安全审计
              </CardTitle>
              <CardDescription>
                Semgrep CE 检测应用代码风险；Gitleaks 检测硬编码密钥；Bandit 补 Python 规则；Checkov 补 Docker/CI/IaC 配置风险。
              </CardDescription>
              <div className='mt-2 text-xs text-muted-foreground'>
                扫描目标：{audit?.target?.projectName || audit?.target_path || '最近导入项目或当前工作区'}
                {audit?.target?.importId ? ` · ${audit.target.importId}` : ''}
              </div>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Button variant='outline' onClick={() => void establishBaseline()} disabled={!audit || mutating}>
                <ShieldCheck />
                建立基线
              </Button>
              <Button variant='outline' onClick={() => void downloadSarif()} disabled={!audit}>
                <Download />
                导出 SARIF
              </Button>
              <Button variant='outline' onClick={() => setGithubOpen(true)} disabled={!audit}>
                <IconGithub />
                Code Scanning
              </Button>
              <Button onClick={() => void startScan()} disabled={scanning}>
                {scanning ? <Loader2 className='animate-spin' /> : <RefreshCw />}
                开始扫描
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-5'>
            <AuditMetric label='风险总数' value={total} tone='cyan' />
            <AuditMetric label='严重' value={audit?.summary.critical ?? 0} tone='red' />
            <AuditMetric label='高危' value={audit?.summary.high ?? 0} tone='orange' />
            <AuditMetric label='新增' value={audit?.summary.new ?? 0} tone='orange' />
            <AuditMetric label='已修复' value={audit?.summary.fixed ?? 0} tone='emerald' />
          </div>

          {!audit ? (
            <Alert className='rounded-md'>
              <ShieldCheck className='size-4' />
              <AlertTitle>尚未执行真实代码扫描</AlertTitle>
              <AlertDescription>
                点击“开始扫描”后，后端会调用本地 Semgrep CE、Gitleaks、Bandit 和 Checkov，并返回统一风险结果。
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <GitHubCodeScanningDialog
        open={githubOpen}
        onOpenChange={setGithubOpen}
        owner={githubOwner}
        setOwner={setGithubOwner}
        repo={githubRepo}
        setRepo={setGithubRepo}
        refName={githubRef}
        setRefName={setGithubRef}
        commit={githubCommit}
        setCommit={setGithubCommit}
        token={githubToken}
        setToken={setGithubToken}
        uploading={githubUploading}
        result={githubResult}
        onUpload={() => void uploadGithubCodeScanning()}
        onRefresh={() => void refreshGithubUploadStatus()}
      />

      <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]'>
        <div className='space-y-4'>
          <Card className='rounded-md'>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-base'>
                <TrendingUp className='size-4 text-cyan-600' />
                风险趋势
              </CardTitle>
              <CardDescription>扫描结果随时间变化，扫描次数不足时显示空状态</CardDescription>
            </CardHeader>
            <CardContent>
              <CompactAuditTrend trend={trend} gradientId='codeAuditTrend' variant='wide' />
            </CardContent>
          </Card>

          <Card className='rounded-md'>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-base'>
                <ShieldAlert className='size-4 text-red-600' />
                代码风险明细
              </CardTitle>
              <CardDescription>包含风险文件、行号、等级、证据代码片段和修复建议</CardDescription>
            </CardHeader>
            <CardContent>
              {findings.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>等级</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>位置</TableHead>
                      <TableHead>证据</TableHead>
                      <TableHead>修复建议</TableHead>
                      <TableHead className='w-[76px]'>处理</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {findings.map((finding) => (
                      <TableRow key={finding.fingerprint || `${finding.id}-${finding.line}`}>
                        <TableCell>
                          <Badge
                            variant='outline'
                            className={cn('rounded-md', severityClasses[finding.severity])}
                          >
                            {severityLabels[finding.severity]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className='font-medium'>{finding.category}</div>
                          <div className='text-xs text-muted-foreground'>{finding.scanner}</div>
                        </TableCell>
                        <TableCell className='min-w-[180px] font-mono text-xs'>
                          {finding.risk_file}:{finding.line}
                        </TableCell>
                        <TableCell className='max-w-[320px]'>
                          <code className='line-clamp-2 rounded bg-muted px-2 py-1 text-xs'>
                            {finding.evidence}
                          </code>
                        </TableCell>
                        <TableCell className='max-w-[360px] text-sm leading-6'>
                          {finding.recommendation}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant='ghost'
                            size='icon'
                            title='标记为误报并忽略'
                            disabled={mutating}
                            onClick={() => void ignoreFinding(finding.fingerprint)}
                          >
                            <EyeOff className='size-4' />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className='rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground'>
                  {audit ? '未发现匹配的代码安全风险。' : '扫描后将在这里显示风险明细。'}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className='rounded-md xl:sticky xl:top-20 xl:self-start'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <TrendingUp className='size-4 text-cyan-600' />
              扫描侧栏
            </CardTitle>
            <CardDescription>引擎状态、趋势和基线状态</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid grid-cols-2 gap-3'>
              <AuditMetric label='已忽略' value={audit?.summary.ignored_total ?? audit?.summary.ignored ?? 0} tone='slate' />
              <AuditMetric label='基线项' value={audit?.summary.baseline_total ?? 0} tone='cyan' />
            </div>
            <div className='space-y-2'>
              <div className='text-sm font-medium'>扫描引擎</div>
              <ScannerStatusList scanners={scanners} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function GitHubCodeScanningDialog({
  open,
  onOpenChange,
  owner,
  setOwner,
  repo,
  setRepo,
  refName,
  setRefName,
  commit,
  setCommit,
  token,
  setToken,
  uploading,
  result,
  onUpload,
  onRefresh,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  owner: string
  setOwner: (value: string) => void
  repo: string
  setRepo: (value: string) => void
  refName: string
  setRefName: (value: string) => void
  commit: string
  setCommit: (value: string) => void
  token: string
  setToken: (value: string) => void
  uploading: boolean
  result: GitHubCodeScanningUploadResult | null
  onUpload: () => void
  onRefresh: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <IconGithub className='size-4' />
            GitHub Code Scanning
          </DialogTitle>
          <DialogDescription>
            上传当前审计 SARIF 到仓库 Security / Code scanning alerts。
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor='github-owner'>Owner</Label>
              <Input id='github-owner' value={owner} onChange={(event) => setOwner(event.target.value)} />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='github-repo'>Repo</Label>
              <Input id='github-repo' value={repo} onChange={(event) => setRepo(event.target.value)} />
            </div>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='github-ref'>Git ref</Label>
            <Input id='github-ref' value={refName} onChange={(event) => setRefName(event.target.value)} />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='github-commit'>Commit SHA</Label>
            <Input
              id='github-commit'
              value={commit}
              placeholder='留空则由后端读取当前 HEAD'
              onChange={(event) => setCommit(event.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='github-token'>Token</Label>
            <Input
              id='github-token'
              type='password'
              value={token}
              placeholder='留空则使用后端 GITHUB_TOKEN / GH_TOKEN'
              onChange={(event) => setToken(event.target.value)}
            />
          </div>
          {result ? (
            <div className='rounded-md border p-3 text-sm'>
              <div className='flex items-center justify-between gap-3'>
                <span className='font-medium'>{result.repository}</span>
                <Badge variant='outline' className={statusClasses.active}>
                  {result.status}
                </Badge>
              </div>
              <div className='mt-2 break-all text-xs text-muted-foreground'>
                SARIF ID: {result.sarif_id || '-'}
              </div>
              <div className='mt-1 break-all text-xs text-muted-foreground'>
                {result.commit_sha}
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onRefresh} disabled={uploading || !result?.sarif_id}>
            {uploading ? <Loader2 className='animate-spin' /> : <RefreshCw />}
            刷新状态
          </Button>
          <Button onClick={onUpload} disabled={uploading || !owner.trim() || !repo.trim() || !refName.trim()}>
            {uploading ? <Loader2 className='animate-spin' /> : <IconGithub />}
            上传 SARIF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AuditMetric({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'cyan' | 'red' | 'orange' | 'amber' | 'emerald' | 'slate'
}) {
  const toneClass = {
    cyan: 'text-cyan-600',
    red: 'text-red-600',
    orange: 'text-orange-600',
    amber: 'text-amber-600',
    emerald: 'text-emerald-600',
    slate: 'text-slate-600',
  }[tone]

  return (
    <div className='rounded-md border p-4'>
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className={cn('mt-2 text-2xl font-semibold', toneClass)}>{value}</div>
    </div>
  )
}

function ScannerStatusList({ scanners }: { scanners: CodeAuditScanner[] }) {
  if (!scanners.length) {
    return (
      <div className='rounded-md border border-dashed p-3 text-sm text-muted-foreground'>
        扫描后将在这里显示引擎状态。
      </div>
    )
  }

  return (
    <div className='space-y-2'>
      {scanners.map((scanner) => (
        <div key={`${scanner.name}-${scanner.command}`} className='rounded-md border p-3'>
          <div className='flex items-center justify-between gap-3'>
            <div className='font-medium'>{scanner.name}</div>
            <Badge
              variant='outline'
              className={scannerBadgeClass(scanner.state, scanner.available)}
            >
              {scannerStateLabel(scanner.state, scanner.available)}
            </Badge>
          </div>
          <div className='mt-2 truncate text-xs text-muted-foreground'>
            {scanner.version || scanner.command}
          </div>
          {scanner.error ? (
            <div className='mt-2 line-clamp-2 text-xs text-orange-600'>{scanner.error}</div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function CompactAuditTrend({
  trend,
  gradientId,
  variant = 'compact',
}: {
  trend: CodeAuditState['trend']
  gradientId: string
  variant?: 'compact' | 'wide'
}) {
  if (trend.length < 2) {
    return (
      <div className={cn('rounded-md border border-dashed p-3 text-sm text-muted-foreground', variant === 'wide' && 'grid h-40 place-items-center')}>
        扫描次数不足，完成 2 次以上后生成趋势。
      </div>
    )
  }

  return (
    <div className={cn('rounded-md border p-2', variant === 'wide' ? 'h-56' : 'h-40')}>
      <ResponsiveContainer width='100%' height='100%'>
        <AreaChart data={trend}>
          <defs>
            <linearGradient id={gradientId} x1='0' y1='0' x2='0' y2='1'>
              <stop offset='5%' stopColor='#0891b2' stopOpacity={0.25} />
              <stop offset='95%' stopColor='#0891b2' stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray='3 3' vertical={false} />
          <XAxis
            dataKey='generated_at'
            tickFormatter={(value: string) => value.slice(5, 16).replace('T', ' ')}
            tick={{ fontSize: 10 }}
            minTickGap={18}
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} />
          <Tooltip labelFormatter={(value) => String(value).replace('T', ' ').slice(0, 19)} />
          <Area
            type='monotone'
            dataKey='total'
            name='风险总数'
            stroke='#0891b2'
            fill={`url(#${gradientId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function SupplyChainPanel({
  audit,
  dependencies,
  findings,
  importId,
  onScanned,
}: {
  audit?: DependencyAuditResult | null
  dependencies: SecurityDependency[]
  findings: SecurityFinding[]
  importId?: string
  onScanned: (audit: DependencyAuditResult) => void
}) {
  const supplyFindings = findings.filter((finding) => finding.module.includes('供应链'))
  const [scanning, setScanning] = useState(false)
  const [enhancedSbom, setEnhancedSbom] = useState(false)
  const [severityFilter, setSeverityFilter] = useState('all')
  const [ecosystemFilter, setEcosystemFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [dependencyTypeFilter, setDependencyTypeFilter] = useState('all')
  const [selectedDependencyKey, setSelectedDependencyKey] = useState('')
  const ecosystems = useMemo(
    () => Array.from(new Set(dependencies.map((dependency) => dependency.ecosystem))).filter(Boolean),
    [dependencies]
  )
  const sourceFiles = useMemo(
    () => Array.from(new Set(dependencies.map((dependency) => dependency.source_file || dependency.manifest_type || 'unknown'))),
    [dependencies]
  )
  const filteredDependencies = useMemo(
    () =>
      dependencies.filter((dependency) => {
        const severity = dependencySeverity(dependency.risk)
        const sourceName = dependency.source_file || dependency.manifest_type || 'unknown'
        const type = dependency.dependency_type === 'transitive' ? 'transitive' : 'direct'
        return (
          (severityFilter === 'all' || severityFilter === severity) &&
          (ecosystemFilter === 'all' || ecosystemFilter === dependency.ecosystem) &&
          (sourceFilter === 'all' || sourceFilter === sourceName) &&
          (dependencyTypeFilter === 'all' || dependencyTypeFilter === type)
        )
      }),
    [dependencies, dependencyTypeFilter, ecosystemFilter, severityFilter, sourceFilter]
  )
  const selectedDependency =
    filteredDependencies.find((dependency) => dependencyKey(dependency) === selectedDependencyKey) ??
    filteredDependencies[0] ??
    dependencies[0]

  async function startDependencyScan() {
    setScanning(true)
    try {
      const nextAudit = await runDependencyAuditScan({
        importId,
        includeOsv: true,
        includeCdxgen: enhancedSbom,
        includeCyclonedxPy: enhancedSbom,
        mode: 'auto',
      })
      onScanned(nextAudit)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '依赖扫描失败')
    } finally {
      setScanning(false)
    }
  }

  async function downloadSbom() {
    try {
      const sbom = audit?.sbom ?? (await loadDependencyAuditSbom())
      downloadJson(sbom, 'supplyguard-direct-dependencies.cdx.json')
      toast.success('CycloneDX SBOM 已导出')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'SBOM 导出失败')
    }
  }

  return (
    <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]'>
      <Card className='rounded-md'>
        <CardHeader>
          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div>
              <CardTitle className='flex items-center gap-2 text-base'>
                <PackageCheck className='size-4 text-cyan-600' />
                SBOM 直接依赖风险评分
              </CardTitle>
              <CardDescription>
                锁文件 / pip freeze 精确版本、传递依赖、CycloneDX SBOM、OSV 结果和风险评分
              </CardDescription>
            </div>
            <div className='flex shrink-0 gap-2'>
              <div className='flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs'>
                <Switch
                  checked={enhancedSbom}
                  onCheckedChange={setEnhancedSbom}
                  aria-label='启用外部 SBOM 工具'
                />
                增强 SBOM
              </div>
              <Button variant='outline' size='sm' onClick={() => void downloadSbom()}>
                <Download />
                CycloneDX
              </Button>
              <Button size='sm' onClick={() => void startDependencyScan()} disabled={scanning}>
                {scanning ? <Loader2 className='animate-spin' /> : <RefreshCw />}
                扫描依赖
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          {audit ? (
            <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
              <AuditMetric label='依赖总数' value={audit.summary.total_dependencies} tone='cyan' />
              <AuditMetric label='精确版本' value={audit.summary.exact_versions ?? 0} tone='emerald' />
              <AuditMetric label='传递依赖' value={audit.summary.transitive_dependencies ?? 0} tone='slate' />
              <AuditMetric label='OSV 命中' value={audit.summary.osv_matches ?? 0} tone='red' />
            </div>
          ) : (
            <Alert className='rounded-md'>
              <PackageCheck className='size-4' />
              <AlertTitle>等待锁文件依赖扫描</AlertTitle>
              <AlertDescription>
                点击“扫描依赖”后会优先读取 package-lock.json、requirements.lock.txt 或 pip freeze 环境，并生成 CycloneDX SBOM。
              </AlertDescription>
            </Alert>
          )}
          {audit?.tools?.length ? (
            <div className='flex flex-wrap gap-2'>
              {audit.tools.map((tool) => (
                <Badge
                  key={`${tool.name}-${tool.command}`}
                  variant='outline'
                  className={cn(
                    'rounded-md',
                    tool.state === 'ok'
                      ? statusClasses.active
                      : tool.state === 'missing'
                        ? statusClasses.observed
                        : severityClasses.medium
                  )}
                >
                  {tool.name}: {tool.state}
                </Badge>
              ))}
            </div>
          ) : null}
          <div className='grid gap-3 md:grid-cols-4'>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>全部严重度</SelectItem>
                <SelectItem value='critical'>严重</SelectItem>
                <SelectItem value='high'>高危</SelectItem>
                <SelectItem value='medium'>中危</SelectItem>
                <SelectItem value='low'>低危</SelectItem>
              </SelectContent>
            </Select>
            <Select value={ecosystemFilter} onValueChange={setEcosystemFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>全部生态</SelectItem>
                {ecosystems.map((ecosystem) => (
                  <SelectItem key={ecosystem} value={ecosystem}>
                    {ecosystem}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>全部来源</SelectItem>
                {sourceFiles.map((sourceFile) => (
                  <SelectItem key={sourceFile} value={sourceFile}>
                    {sourceFile}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={dependencyTypeFilter} onValueChange={setDependencyTypeFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>全部类型</SelectItem>
                <SelectItem value='direct'>直接依赖</SelectItem>
                <SelectItem value='transitive'>传递依赖</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>依赖</TableHead>
                <TableHead>生态</TableHead>
                <TableHead>来源</TableHead>
                <TableHead>许可证</TableHead>
                <TableHead>信号</TableHead>
                <TableHead className='w-[150px]'>风险</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDependencies.length ? filteredDependencies.map((dependency) => (
                <TableRow
                  key={dependencyKey(dependency)}
                  className='cursor-pointer'
                  onClick={() => setSelectedDependencyKey(dependencyKey(dependency))}
                  data-state={dependencyKey(dependency) === dependencyKey(selectedDependency) ? 'selected' : undefined}
                >
                  <TableCell>
                    <div className='font-medium'>{dependency.name}</div>
                    <div className='flex flex-wrap items-center gap-1 text-xs text-muted-foreground'>
                      <span>{dependency.version}</span>
                      {dependency.resolved ? (
                        <Badge variant='outline' className='rounded-md px-1.5 py-0 text-[10px]'>
                          精确
                        </Badge>
                      ) : null}
                    </div>
                    {dependency.requested_version && dependency.requested_version !== dependency.version ? (
                      <div className='text-[11px] text-muted-foreground'>
                        requested {dependency.requested_version}
                      </div>
                    ) : null}
                    {dependency.purl ? (
                      <div className='mt-1 max-w-[260px] truncate font-mono text-[11px] text-muted-foreground'>
                        {dependency.purl}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>{dependency.ecosystem}</TableCell>
                  <TableCell>
                    <div className='flex flex-wrap gap-1'>
                      <Badge variant='outline' className='rounded-md'>
                        {versionSourceLabel(dependency.version_source)}
                      </Badge>
                      <Badge variant='outline' className='rounded-md'>
                        {dependency.dependency_type === 'transitive' ? '传递' : '直接'}
                      </Badge>
                    </div>
                    <div className='max-w-[180px] truncate text-xs text-muted-foreground'>
                      {dependency.source_file ?? dependency.manifest_type ?? '-'}
                    </div>
                  </TableCell>
                  <TableCell>{dependency.license}</TableCell>
                  <TableCell>
                    <div className='flex flex-wrap gap-1'>
                      {dependency.signals.slice(0, 3).map((signal) => (
                        <Badge key={signal} variant='outline' className='rounded-md'>
                          {signal}
                        </Badge>
                      ))}
                      {dependency.signals.length > 3 ? (
                        <Badge variant='outline' className='rounded-md'>
                          +{dependency.signals.length - 3}
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <RiskBar value={dependency.risk} />
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={6} className='h-28 text-center text-sm text-muted-foreground'>
                    暂无符合筛选条件的依赖数据
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className='rounded-md'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-base'>
            <Boxes className='size-4 text-orange-600' />
            准入建议
          </CardTitle>
          <CardDescription>按依赖风险和构建影响生成处置动作</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          {selectedDependency ? (
            <div className='rounded-md border p-3'>
              <div className='flex items-center justify-between gap-3'>
                <div className='min-w-0'>
                  <div className='truncate font-medium'>{selectedDependency.name}</div>
                  <div className='text-xs text-muted-foreground'>
                    {selectedDependency.version} · {versionSourceLabel(selectedDependency.version_source)}
                  </div>
                </div>
                <Badge variant='outline' className='rounded-md'>
                  {selectedDependency.risk}
                </Badge>
              </div>
              <p className='mt-2 text-sm leading-6 text-muted-foreground'>
                {selectedDependency.recommendation}
              </p>
              <Separator className='my-3' />
              <div className='grid gap-2 text-xs text-muted-foreground'>
                <div>生态：{selectedDependency.ecosystem}</div>
                <div>来源：{selectedDependency.source_file || selectedDependency.manifest_type || '-'}</div>
                <div>许可证：{selectedDependency.license}</div>
                <div>类型：{selectedDependency.dependency_type === 'transitive' ? '传递依赖' : '直接依赖'}</div>
              </div>
            </div>
          ) : null}
          <div className='space-y-3'>
            <div className='text-sm font-medium'>高优先级建议</div>
            {dependencies.slice(0, 3).map((dependency) => (
              <div key={`${dependency.ecosystem}-${dependency.name}-${dependency.version}`} className='rounded-md border p-3'>
                <div className='flex items-center justify-between gap-3'>
                  <div className='min-w-0'>
                    <div className='truncate font-medium'>{dependency.name}</div>
                    <div className='text-xs text-muted-foreground'>
                      {dependency.version} · {versionSourceLabel(dependency.version_source)}
                    </div>
                  </div>
                  <Badge variant='outline' className='rounded-md'>
                    {dependency.risk}
                  </Badge>
                </div>
                <p className='mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground'>
                  {dependency.recommendation}
                </p>
              </div>
            ))}
          </div>
          {supplyFindings.map((finding) => (
            <Alert key={finding.id} className='rounded-md'>
              <ShieldAlert className='size-4' />
              <AlertTitle>{finding.title}</AlertTitle>
              <AlertDescription>{finding.evidence}</AlertDescription>
            </Alert>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function versionSourceLabel(source: string | undefined) {
  if (source === 'lockfile') return '锁文件'
  if (source === 'environment') return '环境冻结'
  if (source === 'sbom') return 'SBOM'
  if (source === 'osv') return 'OSV'
  return 'Manifest'
}

function dependencyKey(dependency: SecurityDependency) {
  return `${dependency.ecosystem}-${dependency.name}-${dependency.version}-${dependency.source_file ?? dependency.manifest_type ?? ''}`
}

function dependencySeverity(risk: number): SecuritySeverity {
  if (risk >= 90) return 'critical'
  if (risk >= 75) return 'high'
  if (risk >= 60) return 'medium'
  return 'low'
}

function PipelinePanel({
  pipeline,
  audit,
  importId,
  onScanned,
}: {
  pipeline: SecurityPipelineStep[]
  audit?: CICDAuditResult | null
  importId?: string
  onScanned: (audit: CICDAuditResult) => void
}) {
  const [scanning, setScanning] = useState(false)
  const [mutating, setMutating] = useState(false)
  const findings = audit?.findings ?? []
  const scanners = audit?.scanners ?? []
  const workflows = audit?.workflows ?? []

  async function startCICDScan() {
    setScanning(true)
    try {
      const nextAudit = await runCICDAuditScan({ importId, targetPath: importId ? undefined : audit?.target_path })
      onScanned(nextAudit)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'CI/CD 扫描失败')
    } finally {
      setScanning(false)
    }
  }

  async function downloadSarif() {
    try {
      const sarif = audit?.sarif ?? (await loadCICDAuditSarif())
      downloadJson(sarif, 'supplyguard-cicd-audit.sarif')
      toast.success('CI/CD SARIF 已导出')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'CI/CD SARIF 导出失败')
    }
  }

  async function establishBaseline() {
    if (!audit) return
    setMutating(true)
    try {
      const payload = await createCICDAuditBaseline('accepted-current-cicd-risk')
      if (payload.cicd_audit) onScanned(payload.cicd_audit)
      toast.success('CI/CD 基线已建立')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '建立 CI/CD 基线失败')
    } finally {
      setMutating(false)
    }
  }

  async function ignoreFinding(fingerprint: string) {
    setMutating(true)
    try {
      const payload = await ignoreCICDAuditFinding(fingerprint, 'false-positive')
      if (payload.cicd_audit) onScanned(payload.cicd_audit)
      toast.success('已忽略 CI/CD 误报')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '忽略 CI/CD 风险失败')
    } finally {
      setMutating(false)
    }
  }

  async function uploadGithubCodeScanning() {
    if (!audit) return
    setMutating(true)
    try {
      const result = await uploadCICDAuditToGitHubCodeScanning({
        owner: 'HEIBAI198',
        repo: 'Sysml',
        ref: 'refs/heads/main',
      })
      toast.success(`CI/CD SARIF 已提交 GitHub Code Scanning: ${result.status}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'CI/CD Code Scanning 上传失败')
    } finally {
      setMutating(false)
    }
  }

  return (
    <div className='space-y-4'>
      <Card className='rounded-md'>
        <CardHeader>
          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div>
              <CardTitle className='flex items-center gap-2 text-base'>
                <GitBranch className='size-4 text-orange-600' />
                GitHub Actions 构建流程扫描
              </CardTitle>
              <CardDescription>
                检测未固定 Action、过宽权限、远程脚本执行和 workflow 明文凭据
              </CardDescription>
              <div className='mt-2 text-xs text-muted-foreground'>
                扫描目标：{audit?.target?.projectName || audit?.target_path || '最近导入项目或当前工作区'}
              </div>
            </div>
            <div className='flex shrink-0 gap-2'>
              <Button variant='outline' size='sm' onClick={() => void establishBaseline()} disabled={!audit || mutating}>
                <ShieldCheck />
                建立基线
              </Button>
              <Button variant='outline' size='sm' onClick={() => void downloadSarif()} disabled={!audit}>
                <Download />
                SARIF
              </Button>
              <Button variant='outline' size='sm' onClick={() => void uploadGithubCodeScanning()} disabled={!audit || mutating}>
                <IconGithub />
                Code Scanning
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() => downloadReport(audit?.report || '# CI/CD 构建流程风险报告\n\n尚未执行扫描。')}
              >
                <Download />
                导出报告
              </Button>
              <Button size='sm' onClick={() => void startCICDScan()} disabled={scanning}>
                {scanning ? <Loader2 className='animate-spin' /> : <RefreshCw />}
                扫描 workflow
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          {audit ? (
            <div className='space-y-3'>
              <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-5'>
                <AuditMetric label='风险总数' value={audit.summary.finding_count} tone='orange' />
                <AuditMetric label='严重' value={audit.summary.critical ?? 0} tone='red' />
                <AuditMetric label='高危' value={audit.summary.high ?? 0} tone='orange' />
                <AuditMetric label='新增' value={audit.summary.new ?? audit.summary.finding_count} tone='orange' />
                <AuditMetric label='已修复' value={audit.summary.fixed ?? 0} tone='emerald' />
              </div>
            </div>
          ) : (
            <Alert className='rounded-md'>
              <TerminalSquare className='size-4' />
              <AlertTitle>等待 CI/CD 扫描</AlertTitle>
              <AlertDescription>
                点击“扫描 workflow”后会解析 .github/workflows/*.yml 和 *.yaml，并输出到具体 job/step 的风险。
              </AlertDescription>
            </Alert>
          )}

        </CardContent>
      </Card>

      <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]'>
        <div className='space-y-4'>
          <Card className='rounded-md'>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-base'>
                <GitBranch className='size-4 text-orange-600' />
                从 workflow 到构建步骤的证据链
              </CardTitle>
              <CardDescription>定位风险由哪个 workflow、job 和 step 引入</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='grid gap-3 xl:grid-cols-5'>
                {pipeline.map((step, index) => (
                  <div key={`${step.step}-${index}`} className='relative rounded-md border p-4'>
                    {index < pipeline.length - 1 ? (
                      <div className='absolute left-[calc(100%-0.25rem)] top-8 hidden h-px w-4 bg-border xl:block' />
                    ) : null}
                    <div className='flex items-center justify-between gap-3'>
                      <PipelineIcon step={step.step} />
                      <Badge variant='outline' className={cn('rounded-md', statusClasses[step.status] || severityClasses[step.status as SecuritySeverity] || statusClasses.observed)}>
                        {step.status}
                      </Badge>
                    </div>
                    <div className='mt-4 font-semibold'>{step.name}</div>
                    <div className='mt-1 text-xs text-muted-foreground'>{step.time}</div>
                    <p className='mt-3 text-sm leading-6'>{step.detail}</p>
                    <div className='mt-3 text-xs text-muted-foreground'>{step.actor}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className='rounded-md'>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-base'>
                <ShieldAlert className='size-4 text-red-600' />
                CI/CD 风险明细
              </CardTitle>
              <CardDescription>包含 workflow、job、step、风险原因和修复建议</CardDescription>
            </CardHeader>
            <CardContent>
              {findings.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>等级</TableHead>
                      <TableHead>扫描器</TableHead>
                      <TableHead>Workflow</TableHead>
                      <TableHead>Job / Step</TableHead>
                      <TableHead>风险原因</TableHead>
                      <TableHead>证据</TableHead>
                      <TableHead>修复建议</TableHead>
                      <TableHead className='w-[76px]'>处理</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {findings.map((finding) => (
                      <TableRow key={finding.fingerprint}>
                        <TableCell>
                          <Badge variant='outline' className={cn('rounded-md', severityClasses[finding.severity])}>
                            {severityLabels[finding.severity]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className='font-medium'>{finding.scanner || 'SupplyGuard CI/CD'}</div>
                          <div className='text-xs text-muted-foreground'>{finding.rule_id}</div>
                        </TableCell>
                        <TableCell className='min-w-[180px] font-mono text-xs'>
                          {finding.workflow}:{finding.line}
                        </TableCell>
                        <TableCell className='min-w-[160px]'>
                          <div className='font-medium'>{finding.job_id || '-'}</div>
                          <div className='text-xs text-muted-foreground'>{finding.step_name || finding.job_name || '-'}</div>
                        </TableCell>
                        <TableCell className='max-w-[320px] text-sm leading-6'>{finding.reason}</TableCell>
                        <TableCell className='max-w-[280px]'>
                          <code className='line-clamp-2 rounded bg-muted px-2 py-1 text-xs'>
                            {finding.evidence}
                          </code>
                        </TableCell>
                        <TableCell className='max-w-[340px] text-sm leading-6'>{finding.recommendation}</TableCell>
                        <TableCell>
                          <Button
                            variant='ghost'
                            size='icon'
                            title='标记为误报并忽略'
                            disabled={mutating}
                            onClick={() => void ignoreFinding(finding.fingerprint)}
                          >
                            <EyeOff className='size-4' />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className='rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground'>
                  {audit ? '未发现匹配的 CI/CD 构建流程风险。' : '扫描后将在这里显示 workflow 风险明细。'}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className='rounded-md xl:sticky xl:top-20 xl:self-start'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <TrendingUp className='size-4 text-cyan-600' />
              扫描侧栏
            </CardTitle>
            <CardDescription>workflow 范围、引擎状态和基线状态</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid grid-cols-2 gap-3'>
              <AuditMetric label='Workflow' value={audit?.summary.workflow_count ?? 0} tone='cyan' />
              <AuditMetric label='Step' value={audit?.summary.total_steps ?? 0} tone='amber' />
              <AuditMetric label='已忽略' value={audit?.summary.ignored_total ?? audit?.summary.ignored ?? 0} tone='slate' />
              <AuditMetric label='基线项' value={audit?.summary.baseline_total ?? 0} tone='cyan' />
            </div>
            {workflows.length ? (
              <div className='space-y-2'>
                <div className='text-sm font-medium'>Workflow 文件</div>
                <div className='flex flex-wrap gap-2'>
                  {workflows.map((workflow) => (
                    <Badge key={workflow} variant='outline' className='rounded-md font-mono'>
                      {workflow}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            <div className='space-y-2'>
              <div className='text-sm font-medium'>扫描引擎</div>
              <ScannerStatusList scanners={scanners} />
            </div>
            <div className='space-y-2'>
              <div className='text-sm font-medium'>风险趋势</div>
              <CompactAuditTrend trend={[]} gradientId='cicdAuditTrend' />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function PipelineIcon({ step }: { step: string }) {
  const iconClass = 'size-5'
  if (step === 'commit') return <GitCommitHorizontal className={iconClass} />
  if (step === 'resolve') return <PackageCheck className={iconClass} />
  if (step === 'build') return <TerminalSquare className={iconClass} />
  if (step === 'artifact') return <Fingerprint className={iconClass} />
  if (step === 'attestation') return <KeyRound className={iconClass} />
  if (step === 'deploy') return <ServerCog className={iconClass} />
  return <Radar className={iconClass} />
}

function ArtifactTrustPanel({
  result,
  onScanned,
}: {
  result?: ArtifactTrustResult | null
  onScanned: (result: ArtifactTrustResult) => void
}) {
  const [artifactFile, setArtifactFile] = useState<File | null>(null)
  const [attestationFile, setAttestationFile] = useState<File | null>(null)
  const [expectedRepo, setExpectedRepo] = useState('https://github.com/acme/checkout-service')
  const [expectedCommit, setExpectedCommit] = useState('8f42c19')
  const [allowedWorkflows, setAllowedWorkflows] = useState('.github/workflows/release.yml')
  const [allowedBuilders, setAllowedBuilders] = useState('https://github.com/actions/runner')
  const [requireSignature, setRequireSignature] = useState(true)
  const [allowSelfHostedRunner, setAllowSelfHostedRunner] = useState(false)
  const [scanning, setScanning] = useState(false)
  const score = result ? artifactTrustScore(result) : 0
  const provenance = result?.provenance ?? {}

  async function scanSample() {
    setScanning(true)
    try {
      onScanned(await runArtifactTrustScan({
        artifactPath: 'storage/samples/artifacts/checkout-api.tar.gz',
        attestationPath: 'storage/samples/attestations/checkout-api.intoto.jsonl',
        expectedRepo,
        expectedCommit,
        allowedWorkflows: splitPolicyList(allowedWorkflows),
        allowedBuilders: splitPolicyList(allowedBuilders),
        requireSignature,
        requireProvenance: true,
        allowSelfHostedRunner,
        maxAgeHours: 24,
      }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '产物可信验证失败')
    } finally {
      setScanning(false)
    }
  }

  async function scanUpload() {
    if (!artifactFile || !attestationFile) {
      toast.error('请选择 artifact 和 attestation 文件')
      return
    }
    setScanning(true)
    try {
      onScanned(await uploadArtifactTrustScan({
        artifact: artifactFile,
        attestation: attestationFile,
        expectedRepo,
        expectedCommit,
        allowedWorkflows: splitPolicyList(allowedWorkflows),
        allowedBuilders: splitPolicyList(allowedBuilders),
        requireSignature,
        requireProvenance: true,
        allowSelfHostedRunner,
        maxAgeHours: 24,
      }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '上传验证失败')
    } finally {
      setScanning(false)
    }
  }

  async function downloadArtifactTrustReport() {
    try {
      const report = result?.report ?? (await loadArtifactTrustReport()).content
      downloadReport(report)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '产物可信报告导出失败')
    }
  }

  return (
    <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]'>
      <div className='space-y-4'>
        <Card className='rounded-md'>
          <CardHeader>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <Fingerprint className='size-4 text-cyan-600' />
                  发布前产物可信验证门
                </CardTitle>
                <CardDescription>
                  计算 artifact SHA256，解析 SLSA provenance，并验证签名、digest、源码、workflow、builder 和 runner 策略
                </CardDescription>
              </div>
              <div className='flex shrink-0 gap-2'>
                <Button variant='outline' size='sm' onClick={() => void downloadArtifactTrustReport()}>
                  <Download />
                  导出报告
                </Button>
                <Button variant='outline' size='sm' onClick={() => void scanUpload()} disabled={scanning}>
                  {scanning ? <Loader2 className='animate-spin' /> : <Upload />}
                  上传验证
                </Button>
                <Button size='sm' onClick={() => void scanSample()} disabled={scanning}>
                  {scanning ? <Loader2 className='animate-spin' /> : <RefreshCw />}
                  验证样例
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className='space-y-4'>
            {result ? (
              <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-5'>
                <AuditMetric label='可信评分' value={score} tone={score >= 90 ? 'emerald' : score >= 75 ? 'amber' : 'red'} />
                <AuditMetric label='检查项' value={result.summary.check_count} tone='cyan' />
                <AuditMetric label='通过' value={result.summary.passed} tone='emerald' />
                <AuditMetric label='失败/缺失' value={(result.summary.failed ?? 0) + (result.summary.missing ?? 0)} tone='red' />
                <AuditMetric label='风险发现' value={result.summary.finding_count} tone='orange' />
              </div>
            ) : (
              <Alert className='rounded-md'>
                <KeyRound className='size-4' />
                <AlertTitle>等待产物可信验证</AlertTitle>
                <AlertDescription>
                  可先点击“验证样例”，也可以上传构建产物和 GitHub/SLSA attestation JSON/JSONL。
                </AlertDescription>
              </Alert>
            )}

            <div className='grid gap-3 lg:grid-cols-2'>
              <div className='space-y-2'>
                <Label htmlFor='artifact-file'>Artifact 文件</Label>
                <Input
                  id='artifact-file'
                  type='file'
                  onChange={(event) => setArtifactFile(event.target.files?.[0] ?? null)}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='attestation-file'>Attestation JSON / JSONL</Label>
                <Input
                  id='attestation-file'
                  type='file'
                  accept='.json,.jsonl,application/json'
                  onChange={(event) => setAttestationFile(event.target.files?.[0] ?? null)}
                />
              </div>
            </div>

            <div className='grid gap-3 lg:grid-cols-2'>
              <div className='space-y-2'>
                <Label htmlFor='artifact-expected-repo'>可信源码仓库</Label>
                <Input id='artifact-expected-repo' value={expectedRepo} onChange={(event) => setExpectedRepo(event.target.value)} />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='artifact-expected-commit'>预期 commit</Label>
                <Input id='artifact-expected-commit' value={expectedCommit} onChange={(event) => setExpectedCommit(event.target.value)} />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='artifact-workflows'>允许 workflow</Label>
                <Input id='artifact-workflows' value={allowedWorkflows} onChange={(event) => setAllowedWorkflows(event.target.value)} />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='artifact-builders'>可信 builder</Label>
                <Input id='artifact-builders' value={allowedBuilders} onChange={(event) => setAllowedBuilders(event.target.value)} />
              </div>
            </div>

            <div className='flex flex-wrap gap-3'>
              <div className='flex items-center gap-2 rounded-md border px-3 py-2 text-sm'>
                <Switch checked={requireSignature} onCheckedChange={setRequireSignature} aria-label='要求签名验签' />
                要求签名验签
              </div>
              <div className='flex items-center gap-2 rounded-md border px-3 py-2 text-sm'>
                <Switch checked={allowSelfHostedRunner} onCheckedChange={setAllowSelfHostedRunner} aria-label='允许 self-hosted runner' />
                允许 self-hosted runner
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className='rounded-md'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <ShieldCheck className='size-4 text-emerald-600' />
              检查项结果
            </CardTitle>
            <CardDescription>发布门会按 digest、SLSA、builder、source、workflow、runner、签名和 hash 基线逐项判定</CardDescription>
          </CardHeader>
          <CardContent>
            {result?.checks.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>状态</TableHead>
                    <TableHead>检查项</TableHead>
                    <TableHead>等级</TableHead>
                    <TableHead>证据</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.checks.map((check) => (
                    <TableRow key={check.name}>
                      <TableCell>
                        <Badge variant='outline' className={cn('rounded-md', artifactCheckClass(check.status))}>
                          {artifactCheckLabel(check.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className='font-mono text-xs'>{check.name}</TableCell>
                      <TableCell>{check.severity ?? '-'}</TableCell>
                      <TableCell className='max-w-[520px] text-sm leading-6'>{check.evidence || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className='rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground'>
                执行验证后将在这里展示发布门检查项。
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className='space-y-4 xl:sticky xl:top-20 xl:self-start'>
        <Card className='rounded-md'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <KeyRound className='size-4 text-cyan-600' />
              Provenance 摘要
            </CardTitle>
            <CardDescription>从 attestation 中解析的可信链声明</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {result ? (
              <>
                <div className='rounded-md border p-3'>
                  <div className='text-xs text-muted-foreground'>Artifact digest</div>
                  <code className='mt-1 block break-all text-xs'>{result.digest}</code>
                </div>
                <ProvenanceRow label='Repo' value={provenance.source_repo} />
                <ProvenanceRow label='Commit' value={provenance.commit} />
                <ProvenanceRow label='Workflow' value={provenance.workflow} />
                <ProvenanceRow label='Builder' value={provenance.builder_id} />
                <ProvenanceRow label='Runner' value={provenance.runner_environment} />
                <ProvenanceRow label='Predicate' value={provenance.predicateType || provenance.predicate_type} />
              </>
            ) : (
              <div className='rounded-md border border-dashed p-4 text-sm text-muted-foreground'>
                尚未解析 provenance。
              </div>
            )}
          </CardContent>
        </Card>

        <Card className='rounded-md'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <ShieldAlert className='size-4 text-orange-600' />
              风险发现
            </CardTitle>
            <CardDescription>失败、缺失或降级的发布门信号</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {result?.findings.length ? result.findings.map((finding) => (
              <Alert key={finding.id} className='rounded-md'>
                <AlertTriangle className='size-4' />
                <AlertTitle className='flex items-center justify-between gap-3'>
                  <span>{finding.title}</span>
                  <Badge variant='outline' className={cn('rounded-md', severityClasses[finding.severity])}>
                    {severityLabels[finding.severity]}
                  </Badge>
                </AlertTitle>
                <AlertDescription className='space-y-2'>
                  <div>{finding.evidence}</div>
                  <div className='text-xs'>{finding.recommendation}</div>
                </AlertDescription>
              </Alert>
            )) : (
              <div className='rounded-md border border-dashed p-4 text-sm text-muted-foreground'>
                {result ? '未发现阻断项。' : '验证后显示产物可信风险。'}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className='rounded-md'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <TerminalSquare className='size-4 text-slate-600' />
              验签工具
            </CardTitle>
            <CardDescription>gh / cosign 可用则执行验签，不可用则降级记录</CardDescription>
          </CardHeader>
          <CardContent>
            <ScannerStatusList scanners={result?.tools ?? []} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ProvenanceRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className='rounded-md border p-3'>
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className='mt-1 break-all text-sm font-medium'>{value || '-'}</div>
    </div>
  )
}

function artifactTrustScore(result: ArtifactTrustResult) {
  return result.trust_score ?? result.trustScore ?? result.summary.trust_score ?? 0
}

function splitPolicyList(value: string) {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function artifactCheckLabel(status: string) {
  if (status === 'pass') return '通过'
  if (status === 'fail') return '失败'
  if (status === 'warn') return '警告'
  if (status === 'missing') return '缺失'
  if (status === 'skipped') return '跳过'
  return status
}

function artifactCheckClass(status: string) {
  if (status === 'pass') return statusClasses.active
  if (status === 'fail') return severityClasses.critical
  if (status === 'warn' || status === 'missing') return severityClasses.medium
  return statusClasses.observed
}

function applyArtifactTrustToWorkspace(workspace: SecurityWorkspace, result: ArtifactTrustResult): SecurityWorkspace {
  const artifactFindings: SecurityFinding[] = result.findings.map((finding) => ({
    id: finding.id,
    title: finding.title,
    module: '产物可信',
    severity: finding.severity,
    score: finding.score,
    asset: result.artifact,
    evidence: finding.evidence,
    first_seen: (result.generated_at ?? '').slice(0, 16).replace('T', ' '),
    owner: 'release-engineering',
    status: finding.recommendation,
  }))
  const findings = [
    ...artifactFindings,
    ...(workspace.findings ?? []).filter((finding) => !finding.module.includes('产物可信')),
  ]
  const artifactModule = {
    key: 'artifact_trust',
    name: '产物可信验证门',
    status: artifactTrustModuleStatus(result.level),
    score: artifactTrustScore(result),
    signals: result.summary.check_count,
    description: '验证 artifact digest、SLSA provenance、builder、workflow、commit、runner 和签名结果。',
  }
  const modules = workspace.modules.some((module) => module.key === 'artifact_trust')
    ? workspace.modules.map((module) => module.key === 'artifact_trust' ? artifactModule : module)
    : [...workspace.modules, artifactModule]

  return {
    ...workspace,
    artifact_trust: result,
    findings,
    modules,
    summary: {
      ...workspace.summary,
      open_findings: findings.length,
      critical_findings: findings.filter((finding) => finding.severity === 'critical').length,
      risk_score: Math.max(workspace.summary.risk_score, result.summary.risk_score),
    },
  }
}

function artifactTrustModuleStatus(level: string) {
  if (level === 'trusted') return 'active'
  if (level === 'warning') return 'medium'
  if (level === 'danger') return 'high'
  if (level === 'critical') return 'critical'
  return 'observed'
}

function applyLogAuditToWorkspace(workspace: SecurityWorkspace, audit: LogAuditResult): SecurityWorkspace {
  const logs = audit.findings.slice(0, 80).map((finding) => ({
    time: finding.time,
    source: finding.source,
    event: finding.event,
    severity: finding.severity,
    signal: finding.signal,
    confidence: finding.confidence,
  }))
  const logFindings: SecurityFinding[] = audit.findings.slice(0, 20).map((finding) => {
    const asset = [
      finding.source,
      finding.src_ip ? `src=${finding.src_ip}` : '',
      finding.dst_ip ? `dst=${finding.dst_ip}` : '',
      finding.path ? `path=${finding.path}` : '',
    ].filter(Boolean)

    return {
      id: finding.id,
      title: `${finding.signal}：${finding.title}`,
      module: '日志风险',
      severity: finding.severity,
      score: finding.score,
      asset: asset.join(' / '),
      evidence: finding.evidence,
      first_seen: finding.time.slice(0, 16),
      owner: 'soc',
      status: `置信度 ${Math.round(finding.confidence * 100)}%，建议结合源 IP、账号和时间窗口复核。`,
    }
  })
  const findings = [
    ...logFindings,
    ...(workspace.findings ?? []).filter((finding) => !finding.module.includes('日志')),
  ]

  return {
    ...workspace,
    logs,
    log_audit: audit,
    findings,
    modules: (workspace.modules ?? []).map((module) =>
      module.key === 'logs'
        ? {
            ...module,
            signals: audit.summary.finding_count,
            status: audit.summary.risk_level === 'low' ? 'active' : audit.summary.risk_level,
            score: audit.summary.risk_score,
            description:
              '已接入日志上传批处理，覆盖 Web access log、app log、auth log 的认证异常、敏感路径、SQL 注入、外联和暴力破解。',
          }
        : module
    ),
    summary: {
      ...workspace.summary,
      log_events: audit.summary.total_events,
      open_findings: findings.length,
      critical_findings: findings.filter((finding) => finding.severity === 'critical').length,
      risk_score: Math.max(workspace.summary.risk_score, audit.summary.risk_score),
    },
  }
}

function LogsPanel({
  logs,
  audit,
  onRealtimeChanged,
  onScanned,
}: {
  logs: SecurityLogEvent[]
  audit?: LogAuditResult | null
  onRealtimeChanged: () => Promise<void>
  onScanned: (audit: LogAuditResult) => void
}) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [source, setSource] = useState<LogAuditSource>('auto')
  const [scanning, setScanning] = useState(false)
  const [realtime, setRealtime] = useState<RealtimeLogPayload | null>(null)
  const [trend, setTrend] = useState<RealtimeLogTrendPoint[]>([])
  const [realtimeBusy, setRealtimeBusy] = useState(false)
  const fileFindings = audit?.findings ?? []
  const realtimeFindings = realtime?.findings ?? []
  const auditFiles = audit?.files ?? []
  const auditWarnings = audit?.warnings ?? []
  const displayedLogs: Array<
    SecurityLogEvent & {
      id?: string
      evidence?: string
      fingerprint?: string
      dedupe_key?: string
      occurrences?: number
      realtime?: boolean
    }
  > = realtimeFindings.length
    ? realtimeFindings.map((finding) => ({
        id: finding.id,
        time: finding.time,
        source: finding.source,
        event: finding.event,
        severity: finding.severity,
        signal: finding.signal,
        confidence: finding.confidence,
        evidence: finding.evidence,
        fingerprint: finding.fingerprint,
        dedupe_key: finding.dedupe_key,
        occurrences: finding.occurrences,
        realtime: true,
      }))
    : fileFindings.length
      ? fileFindings.map((finding) => ({
        id: finding.id,
        time: finding.time,
        source: finding.source,
        event: finding.event,
        severity: finding.severity,
        signal: finding.signal,
        confidence: finding.confidence,
        evidence: finding.evidence,
      }))
    : logs

  useEffect(() => {
    void refreshRealtimeLogs(false)
  }, [])

  async function refreshRealtimeLogs(showToast = true) {
    setRealtimeBusy(true)
    try {
      const [eventsPayload, trendPayload] = await Promise.all([
        loadRealtimeLogEvents(200),
        loadRealtimeLogTrend('minute', 60),
      ])
      setRealtime(eventsPayload)
      setTrend(trendPayload.trend ?? [])
      if (showToast) toast.success(`实时日志已刷新，当前 ${eventsPayload.summary?.finding_count ?? 0} 项风险`)
    } catch (error) {
      if (showToast) toast.error(error instanceof Error ? error.message : '实时日志刷新失败')
    } finally {
      setRealtimeBusy(false)
    }
  }

  async function startLogScan() {
    if (!selectedFiles.length) {
      toast.error('请选择至少一个日志文件')
      return
    }
    setScanning(true)
    try {
      onScanned(await runLogAuditScan({ files: selectedFiles, source }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '日志扫描失败')
    } finally {
      setScanning(false)
    }
  }

  async function sendSampleRealtimeEvents() {
    setRealtimeBusy(true)
    try {
      const base = new Date(Date.now() - 3 * 60 * 1000)
      const denied = Array.from({ length: 22 }, (_, index) => ({
        source: 'web',
        timestamp: new Date(base.getTime() + index * 5000).toISOString(),
        src_ip: '203.0.113.10',
        method: 'GET',
        path: '/login',
        status: 401,
        message: 'login failed',
      }))
      const sample = [
        ...denied,
        {
          source: 'web',
          timestamp: new Date(base.getTime() + 130000).toISOString(),
          src_ip: '203.0.113.20',
          method: 'GET',
          path: '/admin/export?format=csv',
          status: 200,
          message: 'admin export requested',
        },
        {
          source: 'web',
          timestamp: new Date(base.getTime() + 135000).toISOString(),
          src_ip: '203.0.113.21',
          method: 'GET',
          path: "/products?id=1%20union%20select%20sleep(5)",
          status: 500,
          message: 'SQL probe union select sleep(5)',
        },
        {
          source: 'app',
          timestamp: new Date(base.getTime() + 140000).toISOString(),
          src_ip: '10.1.8.12',
          dst_ip: '93.184.216.34',
          message: 'payment worker outbound connect to 93.184.216.34 after deploy',
        },
      ]
      const payload = await ingestRealtimeLogs({ events: sample })
      setRealtime(payload)
      const trendPayload = await loadRealtimeLogTrend('minute', 60)
      setTrend(trendPayload.trend ?? [])
      await onRealtimeChanged()
      toast.success(`已发送 ${payload.accepted ?? sample.length} 条实时样例，发现 ${payload.summary?.finding_count ?? 0} 项风险`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '实时样例发送失败')
    } finally {
      setRealtimeBusy(false)
    }
  }

  async function createBaseline() {
    setRealtimeBusy(true)
    try {
      const payload = await createRealtimeLogBaseline('前端手动建立实时日志基线')
      setRealtime(payload)
      const trendPayload = await loadRealtimeLogTrend('minute', 60)
      setTrend(trendPayload.trend ?? [])
      await onRealtimeChanged()
      toast.success(`已建立基线，隐藏 ${payload.state.baseline?.finding_count ?? 0} 项当前风险`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '建立基线失败')
    } finally {
      setRealtimeBusy(false)
    }
  }

  async function ignoreFinding(log: { fingerprint?: string; dedupe_key?: string }) {
    const token = log.dedupe_key || log.fingerprint
    if (!token) return
    setRealtimeBusy(true)
    try {
      const payload = await ignoreRealtimeLogFinding(token, '前端标记为误报')
      setRealtime(payload)
      const trendPayload = await loadRealtimeLogTrend('minute', 60)
      setTrend(trendPayload.trend ?? [])
      await onRealtimeChanged()
      toast.success('已标记为误报')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '标记误报失败')
    } finally {
      setRealtimeBusy(false)
    }
  }

  return (
    <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]'>
      <div className='space-y-4'>
        <Card className='rounded-md'>
          <CardHeader>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <Search className='size-4 text-cyan-600' />
                  日志异常识别
                </CardTitle>
                <CardDescription>上传 Web access log、app log 或 auth log 后执行运行期风险检测</CardDescription>
              </div>
              <div className='flex flex-wrap items-center gap-2'>
                <Button size='sm' variant='outline' onClick={() => void sendSampleRealtimeEvents()} disabled={realtimeBusy}>
                  {realtimeBusy ? <Loader2 className='animate-spin' /> : <Send />}
                  发送实时样例
                </Button>
                <Button size='sm' variant='outline' onClick={() => void createBaseline()} disabled={realtimeBusy}>
                  <ShieldCheck />
                  建立基线
                </Button>
                <Select value={source} onValueChange={(value) => setSource(value as LogAuditSource)}>
                  <SelectTrigger size='sm' className='w-[132px]'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='auto'>自动识别</SelectItem>
                    <SelectItem value='web'>Web access</SelectItem>
                    <SelectItem value='app'>App log</SelectItem>
                    <SelectItem value='auth'>Auth log</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type='file'
                  multiple
                  accept='.log,.txt,.json,.jsonl'
                  className='w-[260px]'
                  onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
                />
                <Button size='sm' onClick={() => void startLogScan()} disabled={scanning || !selectedFiles.length}>
                  {scanning ? <Loader2 className='animate-spin' /> : <FileSearch />}
                  扫描日志
                </Button>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => void refreshRealtimeLogs()}
                  disabled={realtimeBusy}
                >
                  {realtimeBusy ? <Loader2 className='animate-spin' /> : <RefreshCw />}
                  刷新实时
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid gap-3 md:grid-cols-4'>
              <AuditMetric label='实时事件' value={realtime?.summary.event_count ?? 0} tone='cyan' />
              <AuditMetric label='实时风险' value={realtime?.summary.finding_count ?? 0} tone='orange' />
              <AuditMetric label='忽略误报' value={realtime?.state.ignored_count ?? 0} tone='slate' />
              <AuditMetric label='实时评分' value={realtime?.summary.risk_score ?? 0} tone='red' />
            </div>

            {audit ? (
              <div className='grid gap-3 md:grid-cols-4'>
                <AuditMetric label='日志文件' value={audit.summary.file_count} tone='cyan' />
                <AuditMetric label='解析事件' value={audit.summary.parsed_events} tone='slate' />
                <AuditMetric label='风险事件' value={audit.summary.finding_count} tone='orange' />
                <AuditMetric label='风险评分' value={audit.summary.risk_score} tone='red' />
              </div>
            ) : (
              <Alert className='rounded-md'>
                <FileSearch className='size-4' />
                <AlertTitle>实时接入已就绪</AlertTitle>
                <AlertDescription>
                  可上传日志做离线扫描，也可通过 Vector/HTTP 持续 POST JSON 日志到 /api/security/logs/ingest。
                </AlertDescription>
              </Alert>
            )}

            {realtime?.state.baseline ? (
              <Badge variant='outline' className='w-fit rounded-md'>
                基线 {realtime.state.baseline.finding_count ?? 0} 项 · {(realtime.state.baseline.created_at ?? '').slice(0, 16).replace('T', ' ')}
              </Badge>
            ) : null}

            {auditFiles.length ? (
              <div className='grid gap-2 md:grid-cols-2'>
                {auditFiles.map((file) => (
                  <div key={`${file.filename}-${file.source}`} className='rounded-md border px-3 py-2 text-xs'>
                    <div className='font-medium'>{file.source}</div>
                    <div className='truncate text-muted-foreground'>
                      {file.filename} · {file.parsed_lines}/{file.total_lines}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className='rounded-md'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <ShieldAlert className='size-4 text-red-600' />
              运行期风险事件
            </CardTitle>
            <CardDescription>输出异常时间、日志来源、风险事件、风险类型、置信度和证据片段</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>异常时间</TableHead>
                  <TableHead>日志来源</TableHead>
                  <TableHead>风险事件</TableHead>
                  <TableHead>风险类型</TableHead>
                  <TableHead>置信度</TableHead>
                  <TableHead>次数</TableHead>
                  <TableHead>证据片段</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedLogs.map((log) => (
                  <TableRow key={`${log.time}-${log.event}-${log.signal}-${log.fingerprint ?? ''}`}>
                    <TableCell className='whitespace-nowrap font-mono text-xs'>{log.time}</TableCell>
                    <TableCell>
                      <Badge variant='outline' className='rounded-md'>
                        {log.source}
                      </Badge>
                    </TableCell>
                    <TableCell className='max-w-[280px] text-sm leading-6'>{log.event}</TableCell>
                    <TableCell>
                      <Badge variant='outline' className={cn('rounded-md', severityClasses[log.severity])}>
                        {log.signal}
                      </Badge>
                    </TableCell>
                    <TableCell>{Math.round((log.confidence ?? 0) * 100)}%</TableCell>
                    <TableCell>{log.occurrences ?? '-'}</TableCell>
                    <TableCell className='max-w-[360px]'>
                      <code className='block truncate rounded bg-muted px-2 py-1 text-xs' title={log.evidence || '-'}>
                        {log.evidence || '-'}
                      </code>
                    </TableCell>
                    <TableCell>
                      {log.realtime ? (
                        <Button
                          size='sm'
                          variant='ghost'
                          onClick={() => void ignoreFinding(log)}
                          disabled={realtimeBusy}
                        >
                          <EyeOff />
                          误报
                        </Button>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!displayedLogs.length ? (
                  <TableRow>
                    <TableCell colSpan={8} className='h-24 text-center text-sm text-muted-foreground'>
                      暂未发现运行期风险；可以发送实时样例或上传包含风险信号的日志验证。
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className='rounded-md xl:sticky xl:top-20 xl:self-start'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-base'>
            <ShieldCheck className='size-4 text-emerald-600' />
            实时管道
          </CardTitle>
          <CardDescription>上传模式保留，Vector 可把清洗后的 JSON 推到 ingest API</CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          <div className='h-[180px] rounded-md border p-2'>
            <ResponsiveContainer width='100%' height='100%'>
              <AreaChart data={trend ?? []} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray='3 3' vertical={false} />
                <XAxis
                  dataKey='bucket'
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => String(value).slice(11, 16)}
                  minTickGap={18}
                />
                <YAxis tickLine={false} axisLine={false} width={28} />
                <Tooltip labelFormatter={(value) => String(value).replace('T', ' ').slice(0, 16)} />
                <Area type='monotone' dataKey='events' name='事件' stroke='#0891b2' fill='#0891b2' fillOpacity={0.12} />
                <Area type='monotone' dataKey='findings' name='风险' stroke='#dc2626' fill='#dc2626' fillOpacity={0.16} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {[
            'Vector / HTTP 实时接入',
            '本地 JSONL 事件缓冲',
            '分钟/小时风险趋势',
            'rule + IP + path 窗口去重',
            '基线与误报标记',
            '敏感接口异常访问',
            '未知域名外联',
            '认证失败峰值',
            'SQL 注入探测',
            '构建上线后的行为漂移',
          ].map((rule) => (
            <div key={rule} className='flex items-center gap-2 rounded-md border p-3 text-sm'>
              <CheckCircle2 className='size-4 text-emerald-600' />
              {rule}
            </div>
          ))}
          {auditWarnings.length ? (
            <>
              <Separator />
              <div className='space-y-2'>
                <div className='text-sm font-medium'>扫描提示</div>
                {auditWarnings.map((warning) => (
                  <div key={warning} className='rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground'>
                    {warning}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function KnowledgeGraph({ workspace }: { workspace: SecurityWorkspace }) {
  const graph = workspace.graph
  const graphNodes = graph?.nodes ?? []
  const graphEdges = graph?.edges ?? []
  const attackPaths = graph?.attack_paths ?? []
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null)
  const [pathOnlyMode, setPathOnlyMode] = useState(false)
  const [expandedPathIds, setExpandedPathIds] = useState<Set<string>>(new Set())
  const selectedPath = useMemo(
    () => attackPaths.find((path) => path.id === selectedPathId) ?? attackPaths[0],
    [attackPaths, selectedPathId]
  )
  const highlightedNodeIds = useMemo(
    () => new Set(selectedPath?.node_ids ?? []),
    [selectedPath]
  )
  const highlightedEdgeIds = useMemo(
    () => new Set(selectedPath?.edge_ids ?? []),
    [selectedPath]
  )
  const visibleGraphNodes = useMemo(
    () =>
      pathOnlyMode && selectedPath
        ? graphNodes.filter((node) => highlightedNodeIds.has(node.id))
        : graphNodes,
    [graphNodes, highlightedNodeIds, pathOnlyMode, selectedPath]
  )
  const visibleGraphEdges = useMemo(
    () =>
      pathOnlyMode && selectedPath
        ? graphEdges.filter((edge) => highlightedEdgeIds.has(edge.id))
        : graphEdges,
    [graphEdges, highlightedEdgeIds, pathOnlyMode, selectedPath]
  )
  const pipeline = workspace.pipeline ?? []
  const graphFilters = [
    { label: '资产', count: workspace.facts?.summary?.asset_count ?? graphNodes.length },
    { label: '依赖', count: workspace.dependencies?.length ?? 0 },
    { label: 'CI', count: pipeline.length },
    { label: '日志', count: workspace.logs?.length ?? 0 },
    { label: '攻击路径', count: attackPaths.length },
  ]
  const nodes = useMemo<Node[]>(
    () =>
      visibleGraphNodes.map((node) => {
        const isPathNode = highlightedNodeIds.has(node.id)
        return {
          id: node.id,
          position: node.position || graphPositions[node.id] || { x: 0, y: 0 },
          data: {
            label: (
              <div className='w-[150px] text-left'>
                <div className='flex items-center justify-between gap-2'>
                  <span className='truncate text-xs text-muted-foreground'>{node.type}</span>
                  <span
                    className={cn(
                      'size-2 rounded-full',
                      node.risk === 'critical'
                        ? 'bg-red-500'
                        : node.risk === 'high'
                          ? 'bg-orange-500'
                          : 'bg-amber-500'
                    )}
                  />
                </div>
                <div className='mt-1 truncate text-sm font-semibold'>{node.label}</div>
                <div className='mt-1 line-clamp-1 text-xs text-muted-foreground'>
                  {node.description}
                </div>
                {node.score !== undefined ? (
                  <div className='mt-2 text-xs text-muted-foreground'>
                    score {node.score}
                  </div>
                ) : null}
              </div>
            ),
          },
          style: {
            borderRadius: 8,
            border: isPathNode
              ? '2px solid color-mix(in oklch, var(--destructive) 70%, transparent)'
              : '1px solid var(--border)',
            background: 'var(--background)',
            opacity: !pathOnlyMode && selectedPath && !isPathNode ? 0.42 : 1,
            padding: 8,
            width: 178,
            boxShadow: isPathNode
              ? '0 10px 24px color-mix(in oklch, var(--destructive) 18%, transparent)'
              : '0 8px 18px color-mix(in oklch, var(--foreground) 7%, transparent)',
          },
        }
      }),
    [visibleGraphNodes, highlightedNodeIds, pathOnlyMode, selectedPath]
  )

  const edges = useMemo<Edge[]>(
    () =>
      visibleGraphEdges.map((edge) => {
        const isPathEdge = highlightedEdgeIds.has(edge.id)
        const isEvidenceEdge = isEvidenceSupportEdge(edge.type)
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.label,
          animated: isPathEdge || isEvidenceEdge,
          type: 'smoothstep',
          data: {
            relation: edge.type,
            reason: edge.reason,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isPathEdge ? '#dc2626' : isEvidenceEdge ? '#0891b2' : '#94a3b8',
          },
          style: {
            stroke: isPathEdge ? '#dc2626' : isEvidenceEdge ? '#0891b2' : '#94a3b8',
            strokeDasharray: isPathEdge ? undefined : isEvidenceEdge ? '4 4' : '2 6',
            strokeWidth: isPathEdge ? 3.4 : isEvidenceEdge ? 2 : 1.4,
            opacity: isPathEdge ? 1 : isEvidenceEdge ? 0.78 : 0.34,
          },
        }
      }),
    [visibleGraphEdges, highlightedEdgeIds]
  )

  function togglePathExpanded(pathId: string) {
    setExpandedPathIds((current) => {
      const next = new Set(current)
      if (next.has(pathId)) {
        next.delete(pathId)
      } else {
        next.add(pathId)
      }
      return next
    })
  }

  return (
    <div className='grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_340px]'>
      <Card className='rounded-md xl:sticky xl:top-20 xl:self-start'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-base'>
            <Network className='size-4 text-cyan-600' />
            图谱筛选
          </CardTitle>
          <CardDescription>按证据类型聚焦路径</CardDescription>
        </CardHeader>
        <CardContent className='space-y-2'>
          <div className='mb-3 rounded-md border bg-muted/25 px-3 py-2'>
            <div className='flex items-center justify-between gap-3'>
              <div className='min-w-0'>
                <div className='text-sm font-medium'>只看选中路径</div>
                <div className='truncate text-xs text-muted-foreground'>
                  隐藏非当前攻击路径节点和关系
                </div>
              </div>
              <Switch
                checked={pathOnlyMode}
                onCheckedChange={setPathOnlyMode}
                disabled={!selectedPath}
                aria-label='只看选中路径'
              />
            </div>
          </div>
          {graphFilters.map((filter) => (
            <button
              key={filter.label}
              type='button'
              className='flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted'
            >
              <span>{filter.label}</span>
              <Badge variant='outline' className='rounded-md'>
                {filter.count}
              </Badge>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className='rounded-md'>
        <CardHeader>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <CardTitle className='flex items-center gap-2 text-base'>
                <Network className='size-4 text-cyan-600' />
                证据链攻击路径图谱
              </CardTitle>
              <CardDescription>按 GUAC 可达关系、in-toto/SLSA 可信链和 BloodHound 式路径呈现</CardDescription>
            </div>
            {graph?.summary ? (
              <div className='flex flex-wrap gap-2'>
                <Badge variant='outline' className='rounded-md'>
                  {graph.summary.node_count} 节点 · {graph.summary.edge_count} 边
                </Badge>
                <Badge variant='outline' className='rounded-md'>
                  可行动路径 {graph.summary.actionable_attack_path_count ?? 0}
                </Badge>
                <Badge variant='outline' className='rounded-md'>
                  高可信 {graph.summary.real_attack_path_count ?? 0}
                </Badge>
                <Badge variant='outline' className='rounded-md'>
                  置信度 {Math.round((graph.summary.average_path_confidence ?? 0) * 100)}%
                </Badge>
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className='space-y-3'>
          {selectedPath ? (
            <div className='rounded-md border bg-muted/30 p-3'>
              <div className='flex flex-wrap items-center gap-2'>
                <Badge variant='outline' className={cn('rounded-md', pathVerdictClass(selectedPath.verdict))}>
                  {pathVerdictLabel(selectedPath.verdict)}
                </Badge>
                <Badge variant='outline' className='rounded-md'>
                  {Math.round((selectedPath.confidence ?? 0) * 100)}% 置信
                </Badge>
                <Badge variant='outline' className={cn('rounded-md', severityClasses[selectedPath.severity] || statusClasses.observed)}>
                  {severityLabels[selectedPath.severity] ?? selectedPath.severity}
                </Badge>
                {pathOnlyMode ? (
                  <Badge variant='outline' className='rounded-md'>
                    仅显示当前路径
                  </Badge>
                ) : null}
                <Badge variant='outline' className='rounded-md'>
                  {(selectedPath.node_ids || []).length} 节点 · {(selectedPath.edge_ids || []).length} 关系
                </Badge>
              </div>
              <p className='mt-2 text-sm leading-6 text-muted-foreground'>
                {selectedPath.conclusion || selectedPath.description}
              </p>
              <div className='mt-3 grid gap-3 md:grid-cols-2'>
                <EvidenceGapPanel path={selectedPath} compact />
                <UpgradeHintPanel path={selectedPath} compact />
              </div>
            </div>
          ) : null}
          <div className='h-[600px] max-h-[64svh] min-h-[520px] overflow-hidden rounded-md border'>
            {nodes.length ? (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                fitView
                fitViewOptions={{ padding: 0.18 }}
                nodesDraggable={false}
                className='security-flow'
              >
                <Background />
                <Controls />
                <MiniMap pannable zoomable />
              </ReactFlow>
            ) : (
              <div className='flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground'>
                暂无图谱节点；完成代码、供应链、CI/CD 或日志扫描后会在这里生成证据关系。
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className='rounded-md xl:sticky xl:top-20 xl:self-start'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-base'>
            <BrainCircuit className='size-4 text-emerald-600' />
            路径判定
          </CardTitle>
          <CardDescription>回答这些证据能不能串成一次真实攻击路径</CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          {attackPaths.map((path) => {
            const isSelected = selectedPath?.id === path.id
            const isExpanded = expandedPathIds.has(path.id)
            return (
            <div
              key={path.id}
              role='button'
              tabIndex={0}
              onClick={() => setSelectedPathId(path.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setSelectedPathId(path.id)
                }
              }}
              className={cn(
                'block w-full cursor-pointer rounded-md border p-3 text-left transition hover:bg-muted/35',
                isSelected && 'border-red-300 bg-red-50/45 shadow-sm dark:border-red-900 dark:bg-red-950/20'
              )}
            >
              <div className='flex items-center justify-between gap-2'>
                <div className='font-medium'>{path.title}</div>
                <Badge variant='outline' className={cn('rounded-md', severityClasses[path.severity] || statusClasses.observed)}>
                  {path.score}
                </Badge>
              </div>
              <div className='mt-2 flex flex-wrap gap-2'>
                <Badge variant='outline' className={cn('rounded-md', pathVerdictClass(path.verdict))}>
                  {pathVerdictLabel(path.verdict)}
                </Badge>
                <Badge variant='outline' className='rounded-md'>
                  {Math.round((path.confidence ?? 0) * 100)}% 置信
                </Badge>
              </div>
              <p className='mt-2 text-sm leading-6 text-muted-foreground'>
                {path.conclusion || path.description}
              </p>
              <div className='mt-3 space-y-2'>
                <EvidenceGapPanel path={path} compact />
                <UpgradeHintPanel path={path} compact />
              </div>
              {path.path_steps?.length ? (
                <div className='mt-3'>
                  <button
                    type='button'
                    className='flex w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-xs font-medium'
                    onClick={(event) => {
                      event.stopPropagation()
                      togglePathExpanded(path.id)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        event.stopPropagation()
                        togglePathExpanded(path.id)
                      }
                    }}
                  >
                    <span>路径步骤</span>
                    <span className='flex items-center gap-1 text-muted-foreground'>
                      {path.path_steps.length} 步
                      {isExpanded ? <ChevronDown className='size-3.5' /> : <ChevronRight className='size-3.5' />}
                    </span>
                  </button>
                  {isExpanded ? (
                    <div className='mt-2 space-y-2'>
                      {path.path_steps.map((step, index) => (
                        <div key={`${path.id}-${step.index ?? index}`} className='rounded-md bg-muted/45 px-3 py-2 text-xs leading-5'>
                          <div className='font-medium'>
                            第 {step.index ?? index + 1} 步：{step.source} → {step.target}
                          </div>
                          <div className='text-muted-foreground'>
                            {step.relationship} · {step.model || 'evidence'} · {Math.round((step.confidence ?? 0) * 100)}%
                          </div>
                          {step.why_abusable ? (
                            <div className='mt-1 text-muted-foreground'>
                              {step.why_abusable}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {path.trust_chain?.length ? (
                <div className='mt-3 flex flex-wrap gap-1.5'>
                  {path.trust_chain.slice(0, 4).map((item, index) => (
                    <Badge key={`${path.id}-${item.model}-${index}`} variant='outline' className='rounded-md'>
                      {item.model}: {trustStatusLabel(item.status)}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <div className='mt-3 flex flex-wrap gap-2'>
                <Badge variant='outline' className='rounded-md'>
                  {(path.node_ids || []).length} 节点
                </Badge>
                <Badge variant='outline' className='rounded-md'>
                  {(path.edge_ids || []).length} 关系
                </Badge>
                <Badge variant='outline' className='rounded-md'>
                  {(path.evidence_ids || []).length} 证据
                </Badge>
              </div>
              {path.choke_points?.length ? (
                <div className='mt-3 space-y-1'>
                  <div className='text-xs font-medium text-muted-foreground'>可封堵点</div>
                  {path.choke_points.slice(0, 2).map((point) => (
                    <p key={`${path.id}-${point.node_id}`} className='text-xs leading-5 text-muted-foreground'>
                      {point.label}: {point.action}
                    </p>
                  ))}
                </div>
              ) : (
                <p className='mt-3 text-sm leading-6'>{path.recommendation}</p>
              )}
            </div>
            )
          })}
          {!attackPaths.length
            ? pipeline.map((step) => (
                <div key={step.step} className='rounded-md border p-3'>
                  <div className='flex items-center justify-between gap-2'>
                    <div className='font-medium'>{step.name}</div>
                    <Badge variant='outline' className={cn('rounded-md', statusClasses[step.status] || statusClasses.observed)}>
                      {step.status}
                    </Badge>
                  </div>
                  <p className='mt-2 text-sm leading-6 text-muted-foreground'>{step.detail}</p>
                </div>
              ))
            : null}
          {!attackPaths.length && !pipeline.length ? (
            <div className='rounded-md border border-dashed p-4 text-sm text-muted-foreground'>
              暂无攻击路径；完成扫描后会根据证据链生成可验证路径。
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function EvidenceGapPanel({
  path,
  compact = false,
}: {
  path: KnowledgeGraphAttackPath
  compact?: boolean
}) {
  const gaps = pathEvidenceGaps(path)

  return (
    <div className={cn('rounded-md border border-dashed bg-background/70', compact ? 'p-3' : 'p-4')}>
      <div className='mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground'>
        <AlertTriangle className='size-3.5 text-amber-600' />
        证据缺口
      </div>
      <div className='space-y-1.5'>
        {gaps.slice(0, compact ? 2 : 4).map((gap) => (
          <div key={gap} className='text-xs leading-5 text-muted-foreground'>
            {gap}
          </div>
        ))}
      </div>
    </div>
  )
}

function UpgradeHintPanel({
  path,
  compact = false,
}: {
  path: KnowledgeGraphAttackPath
  compact?: boolean
}) {
  return (
    <div className={cn('rounded-md border bg-emerald-50/60 dark:bg-emerald-950/20', compact ? 'p-3' : 'p-4')}>
      <div className='mb-2 flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300'>
        <TrendingUp className='size-3.5' />
        补证据后可升级
      </div>
      <p className='text-xs leading-5 text-muted-foreground'>
        {upgradeHintForPath(path)}
      </p>
    </div>
  )
}

function pathEvidenceGaps(path: KnowledgeGraphAttackPath) {
  const explicitGaps = (path.gaps ?? []).filter(Boolean)
  if (explicitGaps.length) return explicitGaps
  if (path.verdict === 'likely-real-attack-path' || path.verdict === 'runtime-touched-risk') {
    return ['当前路径未发现明显证据缺口；可继续补充签名和时间线来增强审计可复现性。']
  }
  if (path.category === 'build-integrity-risk') {
    return ['缺少 provenance/attestation、产物哈希差异、builder identity 直接证据。']
  }
  if (path.category === 'application-exploitation') {
    return ['缺少来源 IP、完整 access/WAF 请求链路、漏洞点复现或调用栈证据。']
  }
  return ['缺少时间线、产物哈希、来源 IP 直接证据。']
}

function upgradeHintForPath(path: KnowledgeGraphAttackPath) {
  const artifact = pathEndpointLabel(path, 'BuildArtifact') || '构建产物'
  const service = pathEndpointLabel(path, 'RuntimeService') || '运行服务'
  const log = pathEndpointLabel(path, 'LogEvent') || '运行期异常日志'
  const confidence = Math.round((path.confidence ?? 0) * 100)

  if (path.verdict === 'likely-real-attack-path' || path.verdict === 'runtime-touched-risk') {
    return `当前已接近高可信；继续补充 ${artifact} 的签名、部署时间线和 ${log} 的原始日志，可把 ${confidence}% 置信度固化为可审计证据。`
  }
  if (path.category === 'build-integrity-risk') {
    return `补充 ${artifact} 的 subject digest、builder identity、materials 清单和 in-toto/SLSA attestation，可把构建可信链风险升级为高可信路径。`
  }
  if (path.category === 'application-exploitation') {
    return `补充来源 IP、完整请求时间线、WAF/access 原始日志和漏洞复现证据，可证明运行期请求确实触达代码风险点。`
  }
  return `补充 ${artifact} 的哈希差异、provenance/attestation、${service} 上线后同时间窗的 ${log}，可把当前可疑路径升级为高可信真实路径。`
}

function pathEndpointLabel(path: KnowledgeGraphAttackPath, nodeType: string) {
  const fromStep = path.path_steps?.find((step) => step.target_type === nodeType)?.target
  if (fromStep) return fromStep
  return path.path_steps?.find((step) => step.source_type === nodeType)?.source
}

function pathVerdictLabel(verdict?: string) {
  if (verdict === 'likely-real-attack-path') return '高度可信真实路径'
  if (verdict === 'plausible-attack-path') return '可疑真实路径'
  if (verdict === 'runtime-touched-risk') return '运行期已触达'
  if (verdict === 'plausible-runtime-touch') return '疑似运行期触达'
  if (verdict === 'provenance-risk-path') return '构建可信链风险'
  if (verdict === 'insufficient-evidence') return '证据不足'
  return '路径待判定'
}

function pathVerdictClass(verdict?: string) {
  if (verdict === 'likely-real-attack-path' || verdict === 'runtime-touched-risk') {
    return severityClasses.critical
  }
  if (verdict === 'plausible-attack-path' || verdict === 'provenance-risk-path') {
    return severityClasses.high
  }
  if (verdict === 'plausible-runtime-touch') return severityClasses.medium
  return statusClasses.observed
}

function trustStatusLabel(status?: string) {
  if (status === 'observed') return '已观测'
  if (status === 'needs-attestation') return '需证明'
  if (status === 'gap') return '缺口'
  return status || '待确认'
}

function isEvidenceSupportEdge(type?: string) {
  return [
    'LOG_SUPPORTS_FINDING',
    'FINDING_AFFECTS',
    'FINDING_MAPS_TO_ATTACK_STAGE',
    'HAS_VULNERABILITY',
  ].includes(type || '')
}

function CopilotPanel({
  workspace,
  question,
  setQuestion,
  answer,
  busy,
  onSubmit,
}: {
  workspace: SecurityWorkspace
  question: string
  setQuestion: (value: string) => void
  answer: SecurityAssistantResponse | null
  busy: boolean
  onSubmit: () => void
}) {
  const assistant = getAssistantPayload(workspace)
  const retrieval = answer?.retrieval?.length ? answer.retrieval : assistant.retrieval
  const nextActions = answer?.next_actions?.length ? answer.next_actions : assistant.next_actions
  const modelName = answer?.model || 'demo-rag-security-analyst'
  const hasDeepseek = modelName.toLowerCase().includes('deepseek')
  const promptSuggestions = [
    assistant.default_question,
    '这条攻击链先封堵哪里？',
    '哪些证据能证明不是误报？',
    '把修复动作按今天能做的列出来',
    '这个依赖是否应该替换？',
  ].filter(Boolean)

  return (
    <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]'>
      <Card className='overflow-hidden rounded-md'>
        <CardHeader className='border-b bg-muted/30'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div className='flex items-center gap-3'>
              <div className='grid size-10 place-items-center rounded-md border bg-background shadow-sm'>
                <Bot className='size-5 text-cyan-600' />
              </div>
              <div>
                <CardTitle className='flex items-center gap-2 text-base'>
                  安全 Copilot
                  <Badge variant='outline' className={cn('rounded-md', hasDeepseek ? statusClasses.active : statusClasses.observed)}>
                    {hasDeepseek ? 'DeepSeek 在线' : '离线 RAG'}
                  </Badge>
                </CardTitle>
                <CardDescription>基于工作台证据链生成处置建议、攻击路径解释和误报判断</CardDescription>
              </div>
            </div>
            <div className='flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground'>
              <Sparkles className='size-3.5 text-cyan-600' />
              {modelName}
            </div>
          </div>
        </CardHeader>
        <CardContent className='p-0'>
          <ScrollArea className='h-[560px] min-h-[420px] max-h-[58svh]'>
            <div className='mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-5 sm:px-6'>
              <CopilotMessage
                role='assistant'
                title='SupplyGuard KG'
                meta='已载入代码、依赖、CI/CD、日志和知识图谱上下文'
                icon={<Bot className='size-4' />}
              >
                <CopilotMarkdown text={assistant.answer} />
              </CopilotMessage>

              {answer ? (
                <>
                  <CopilotMessage
                    role='user'
                    title='你'
                    meta='当前提问'
                    icon={<User className='size-4' />}
                  >
                    <p>{answer.question}</p>
                  </CopilotMessage>
                  <CopilotMessage
                    role='assistant'
                    title='安全分析'
                    meta={modelName}
                    icon={<BrainCircuit className='size-4' />}
                    action={<CopyAnswerButton text={answer.answer} />}
                  >
                    <CopilotMarkdown text={answer.answer} />
                  </CopilotMessage>
                </>
              ) : null}

              {busy ? (
                <div className='flex items-center gap-3 rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground'>
                  <Loader2 className='size-4 animate-spin text-cyan-600' />
                  正在检索证据链并生成处置建议...
                </div>
              ) : null}
            </div>
          </ScrollArea>

          <div className='border-t bg-background px-4 py-3'>
            <div className='mx-auto w-full max-w-4xl space-y-2.5'>
              <div className='flex flex-wrap gap-2'>
                {promptSuggestions.map((prompt) => (
                  <Button
                    key={prompt}
                    variant='outline'
                    size='sm'
                    className='h-8 rounded-md text-xs'
                    onClick={() => setQuestion(prompt)}
                  >
                    <MessageSquare className='size-3.5' />
                    {prompt}
                  </Button>
                ))}
              </div>
              <div className='rounded-md border bg-muted/20 p-2 shadow-sm'>
                <Textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      onSubmit()
                    }
                  }}
                  placeholder='询问风险原因、攻击链路、修复优先级或误报可能性'
                  className='min-h-14 resize-none border-0 bg-transparent px-2 py-2 text-sm shadow-none focus-visible:ring-0'
                />
                <div className='flex items-center justify-between gap-3 border-t px-2 pt-2'>
                  <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                    <CornerDownLeft className='size-3.5' />
                    Enter 发送，Shift + Enter 换行
                  </div>
                  <Button onClick={onSubmit} disabled={busy || !question.trim()} className='rounded-md'>
                    {busy ? <Loader2 className='animate-spin' /> : <Send />}
                    分析
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className='space-y-4 xl:sticky xl:top-20 xl:self-start'>
        <Card className='rounded-md'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <Search className='size-4 text-cyan-600' />
              检索命中
            </CardTitle>
            <CardDescription>用于回答的 SBOM、规则、代码和日志片段</CardDescription>
          </CardHeader>
          <CardContent className='space-y-2'>
            {retrieval.map((item) => (
              <EvidenceItem key={item} value={item} />
            ))}
            {!retrieval.length ? (
              <div className='rounded-md border border-dashed p-3 text-sm text-muted-foreground'>
                暂无检索命中；完成扫描后会展示关联证据。
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className='rounded-md'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <ClipboardList className='size-4 text-emerald-600' />
              建议动作
            </CardTitle>
            <CardDescription>来自助手和当前证据链的优先处置清单</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {nextActions.map((action, index) => (
              <div key={action} className='flex gap-3 rounded-md border p-3 text-sm leading-6'>
                <div className='grid size-6 shrink-0 place-items-center rounded-md bg-emerald-50 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'>
                  {index + 1}
                </div>
                <span>{action}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function CopilotMessage({
  role,
  title,
  meta,
  icon,
  action,
  children,
}: {
  role: 'assistant' | 'user'
  title: string
  meta: string
  icon: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className={cn('flex gap-3', role === 'user' && 'justify-end')}>
      {role === 'assistant' ? (
        <div className='grid size-9 shrink-0 place-items-center rounded-md border bg-background text-cyan-600 shadow-sm'>
          {icon}
        </div>
      ) : null}
      <div className={cn('min-w-0 max-w-[860px] flex-1', role === 'user' && 'flex max-w-[640px] flex-col items-end')}>
        <div className={cn('mb-2 flex items-center gap-2 text-xs text-muted-foreground', role === 'user' && 'justify-end')}>
          <span className='font-medium text-foreground'>{title}</span>
          <span>{meta}</span>
          {action}
        </div>
        <div
          className={cn(
            'rounded-md border p-4 text-sm leading-7 shadow-sm',
            role === 'assistant'
              ? 'bg-background'
              : 'bg-primary px-4 py-3 text-primary-foreground'
          )}
        >
          {children}
        </div>
      </div>
      {role === 'user' ? (
        <div className='grid size-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground shadow-sm'>
          {icon}
        </div>
      ) : null}
    </div>
  )
}

function CopilotMarkdown({ text }: { text: string }) {
  const blocks = normalizeAssistantMarkdown(text)

  return (
    <div className='space-y-3'>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return (
            <div key={`${index}-${block.text}`} className='space-y-1'>
              <h3 className='text-sm font-semibold text-foreground'>
                {renderInlineMarkdown(block.text)}
              </h3>
              <div className='h-px bg-border' />
            </div>
          )
        }
        if (block.type === 'list') {
          return (
            <div key={`${index}-${block.items.join('|')}`} className='space-y-2'>
              {block.items.map((item) => (
                <div key={item} className='flex gap-2 rounded-md bg-muted/45 px-3 py-2 text-sm leading-6'>
                  <CheckCircle2 className='mt-1 size-4 shrink-0 text-emerald-600' />
                  <span>{renderInlineMarkdown(item)}</span>
                </div>
              ))}
            </div>
          )
        }
        if (block.type === 'rule') {
          return <div key={`${index}-rule`} className='h-px bg-border' />
        }
        return (
          <p key={`${index}-${block.text}`} className='text-sm leading-7 text-foreground/90'>
            {renderInlineMarkdown(block.text)}
          </p>
        )
      })}
    </div>
  )
}

type AssistantMarkdownBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'rule' }

function normalizeAssistantMarkdown(text: string): AssistantMarkdownBlock[] {
  const prepared = text
    .replace(/\s---\s/g, '\n---\n')
    .replace(/\s(#{2,4})\s+/g, '\n$1 ')
    .replace(/\s(-\s+\*\*)/g, '\n$1')
    .replace(/\s(\d+\.\s+\*\*)/g, '\n$1')
  const lines = prepared
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  const blocks: AssistantMarkdownBlock[] = []
  let listItems: string[] = []

  const flushList = () => {
    if (listItems.length) {
      blocks.push({ type: 'list', items: listItems })
      listItems = []
    }
  }

  for (const line of lines) {
    if (/^-{3,}$/.test(line)) {
      flushList()
      blocks.push({ type: 'rule' })
      continue
    }

    const heading = line.match(/^#{1,4}\s+(.*)$/)
    if (heading) {
      flushList()
      blocks.push({ type: 'heading', text: cleanMarkdownText(heading[1]) })
      continue
    }

    const list = line.match(/^(?:[-*]|\d+\.)\s+(.*)$/)
    if (list) {
      listItems.push(cleanMarkdownText(list[1]))
      continue
    }

    flushList()
    blocks.push({ type: 'paragraph', text: cleanMarkdownText(line) })
  }

  flushList()
  return blocks.length ? blocks : [{ type: 'paragraph', text }]
}

function cleanMarkdownText(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

function renderInlineMarkdown(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean)
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={`${part}-${index}`} className='font-semibold text-foreground'>
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={`${part}-${index}`} className='rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-cyan-700 dark:text-cyan-300'>
          {part.slice(1, -1)}
        </code>
      )
    }
    return <span key={`${part}-${index}`}>{part}</span>
  })
}

function CopyAnswerButton({ text }: { text: string }) {
  return (
    <UiTooltip>
      <UiTooltipTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className='size-7 rounded-md'
          onClick={() => {
            void navigator.clipboard.writeText(text)
            toast.success('回答已复制')
          }}
        >
          <Copy className='size-3.5' />
        </Button>
      </UiTooltipTrigger>
      <UiTooltipContent>复制回答</UiTooltipContent>
    </UiTooltip>
  )
}

function EvidenceItem({ value }: { value: string }) {
  const [kind, ...rest] = value.split(':')
  const detail = rest.join(':').trim() || value
  return (
    <div className='rounded-md border bg-background p-3'>
      <div className='mb-2 flex items-center justify-between gap-2'>
        <Badge variant='outline' className='rounded-md'>
          {rest.length ? kind : 'Evidence'}
        </Badge>
        <CheckCircle2 className='size-4 text-emerald-600' />
      </div>
      <code className='block break-words font-mono text-xs leading-5 text-muted-foreground'>
        {detail}
      </code>
    </div>
  )
}

function ReportPanel({ workspace }: { workspace: SecurityWorkspace }) {
  const [reportMode, setReportMode] = useState<'preview' | 'source'>('preview')
  const report = getWorkspaceReport(workspace)

  return (
    <Card className='rounded-md'>
      <CardHeader>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <CardTitle className='flex items-center gap-2 text-base'>
              <FileText className='size-4 text-orange-600' />
              安全分析报告
            </CardTitle>
            <CardDescription>包含风险等级、证据链、影响范围、攻击路径和修复建议</CardDescription>
          </div>
          <Button variant='outline' size='sm' onClick={() => downloadReport(report)}>
            <Download />
            导出 Markdown
          </Button>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        <Tabs value={reportMode} onValueChange={(value) => setReportMode(value as 'preview' | 'source')}>
          <TabsList className='grid h-10 w-full max-w-sm grid-cols-2 rounded-md'>
            <TabsTrigger value='preview'>报告预览</TabsTrigger>
            <TabsTrigger value='source'>Markdown 源码</TabsTrigger>
          </TabsList>
          <TabsContent value='preview' className='mt-4'>
            <MarkdownPreview markdown={report} />
          </TabsContent>
          <TabsContent value='source' className='mt-4'>
            <Textarea
              value={report}
              readOnly
              className='min-h-[640px] resize-none rounded-md font-mono text-xs leading-5'
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

function MarkdownPreview({ markdown }: { markdown?: string | null }) {
  const lines = String(markdown ?? '').split('\n').filter((line) => line.trim())

  return (
    <div className='max-h-[620px] space-y-3 overflow-auto rounded-md border p-4'>
      {lines.map((line, index) => {
        const trimmed = line.trim()
        if (trimmed.startsWith('## ')) {
          return <h2 key={`${index}-${trimmed}`} className='pt-2 text-lg font-semibold'>{trimmed.replace(/^##\s+/, '')}</h2>
        }
        if (trimmed.startsWith('# ')) {
          return <h1 key={`${index}-${trimmed}`} className='text-xl font-semibold'>{trimmed.replace(/^#\s+/, '')}</h1>
        }
        if (trimmed.startsWith('|')) {
          return (
            <pre key={`${index}-${trimmed}`} className='overflow-auto rounded-md bg-muted px-3 py-2 font-mono text-xs'>
              {trimmed}
            </pre>
          )
        }
        if (trimmed.startsWith('- ')) {
          return (
            <div key={`${index}-${trimmed}`} className='flex gap-2 text-sm leading-6'>
              <CheckCircle2 className='mt-1 size-4 shrink-0 text-emerald-600' />
              <span>{trimmed.replace(/^-\s+/, '')}</span>
            </div>
          )
        }
        return <p key={`${index}-${trimmed}`} className='text-sm leading-6 text-muted-foreground'>{trimmed}</p>
      })}
    </div>
  )
}

function RiskBar({ value }: { value: number }) {
  const color =
    value >= 90
      ? 'bg-red-600'
      : value >= 75
        ? 'bg-orange-500'
        : value >= 60
          ? 'bg-amber-500'
          : 'bg-emerald-500'

  return (
    <div className='space-y-1'>
      <div className='h-2 overflow-hidden rounded-full bg-muted'>
        <div className={cn('h-full rounded-full', color)} style={{ width: `${value}%` }} />
      </div>
      <div className='text-right text-xs text-muted-foreground'>{value}</div>
    </div>
  )
}

function compactNumber(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
  return value.toString()
}

function scannerStateLabel(state: string | undefined, available: boolean) {
  if (state === 'skipped') return '已跳过'
  if (state === 'missing') return '未安装'
  if (state === 'fallback') return '降级'
  if (state === 'partial') return '部分成功'
  if (state === 'failed') return '异常'
  return available ? '可用' : '不可用'
}

function scannerBadgeClass(state: string | undefined, available: boolean) {
  if (state === 'ok') return cn('rounded-md', statusClasses.active)
  if (state === 'skipped') return cn('rounded-md', statusClasses.observed)
  if (state === 'fallback' || state === 'partial') return cn('rounded-md', severityClasses.medium)
  if (state === 'missing' || state === 'failed') return cn('rounded-md', severityClasses.high)
  return cn('rounded-md', available ? statusClasses.active : severityClasses.medium)
}

function downloadReport(report: string) {
  const blob = new Blob([report], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'supply-chain-security-report.md'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  toast.success('报告已导出')
}

function downloadJson(payload: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/sarif+json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function tabFromHash(hash: string): PlatformTab {
  const value = hash.replace(/^#/, '')
  return platformTabs.includes(value as PlatformTab)
    ? (value as PlatformTab)
    : 'overview'
}
