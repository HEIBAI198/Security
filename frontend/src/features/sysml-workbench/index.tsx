import {
  useCallback,
  useEffect,
  lazy,
  useMemo,
  useRef,
  Suspense,
  useState,
  type DragEvent,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  reconnectEdge,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  type OnReconnect,
} from '@xyflow/react'
import { useNavigate } from '@tanstack/react-router'
import {
  AlertCircle,
  Archive,
  ArrowRight,
  Boxes,
  Braces,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  Edit3,
  FileText,
  GitBranch,
  GitCommitHorizontal,
  GitCompare,
  GitMerge,
  LayoutDashboard,
  Loader2,
  LogIn,
  LogOut,
  MessageCircle,
  MoreVertical,
  Network,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  UserCircle,
  Workflow,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  api,
  type AiClosureSuggestionResponse,
  type AiDocumentQualityReview,
  type AiDocgenDraft,
  type AiDocgenMode,
  type AiChatMessage,
  type AiChatResponse,
  type AiValidationFixApplyResult,
  type AiValidationFixReview,
  type AiVersionImpact,
  defaultElement,
  loadIdentity,
  login,
  saveIdentity,
  copySharedProject,
  deleteProject,
  publishProject,
  updateProjectMembers,
  type AuditEvent,
  type Branch,
  type Commit,
  type DiagramPayload,
  type DiffPayload,
  type DocumentRecord,
  type Identity,
  type MappingReport,
  type MdkAdapter,
  type MdkImportJob,
  type MdkParseResponse,
  type Metamodel,
  type Project,
  type Relation,
  type SysmlElement,
  type TraceabilityRow,
  type ValidationPayload,
  type ViewPayload,
} from '@/lib/sysml-api'
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'

const DocgenTemplateEditor = lazy(() =>
  import('./docgen-template-editor').then((module) => ({
    default: module.DocgenTemplateEditor,
  }))
)

const defaultTemplate = `# {{model:summary}}

## Requirements
{{table:requirements}}

## Blocks
{{table:blocks}}

## Interfaces
{{table:interfaces}}

## Constraints
{{table:constraints}}

## Tests
{{table:tests}}

## Traceability
{{trace:matrix}}

## Validation
{{validation:issues}}
`

const sampleMdkJson = JSON.stringify(
  {
    elements: [
      {
        id: 'REQ-MDK-001',
        name: '外部工具导入需求',
        type: 'Requirement',
        stereotype: 'requirement',
        attributes: {
          text: '系统应支持从外部建模工具导入模型元素。',
          verification: 'Review',
        },
        relations: [],
      },
    ],
  },
  null,
  2
)

const typeNames: Record<string, string> = {
  Requirement: '需求',
  Block: '模块',
  Activity: '活动',
  Interface: '接口',
  Port: '端口',
  Constraint: '约束',
  State: '状态',
  TestCase: '测试',
  View: '视图',
  Viewpoint: '视角',
}

const relationNames: Record<string, string> = {
  satisfy: '满足',
  verify: '验证',
  refine: '细化',
  compose: '组成',
  expose: '暴露端口',
  connect: '连接',
  allocate: '分配',
  flow: '流转',
  transition: '迁移',
  constrain: '约束',
  include: '包含',
  conform: '符合视角',
}

const displayTypeNames: Record<string, string> = {
  Requirement: 'Requirement',
  Block: 'Block',
  Activity: 'Activity',
  Interface: 'Interface',
  Port: 'Port',
  Constraint: 'Constraint',
  State: 'State',
  TestCase: 'Test Case',
  View: 'View',
  Viewpoint: 'Viewpoint',
}

const displayDiagramNames: Record<string, string> = {
  requirements: 'Requirements Trace',
  structure: 'Structure & Interface',
  behavior: 'Behavior & State',
  views: 'View-Focused Graph',
  all: 'Full Model Graph',
}

const displayRelationNames: Record<string, string> = {
  satisfy: 'Satisfy',
  verify: 'Verify',
  refine: 'Refine',
  compose: 'Compose',
  expose: 'Expose Port',
  connect: 'Connect',
  allocate: 'Allocate',
  flow: 'Flow',
  transition: 'Transition',
  constrain: 'Constrain',
  include: 'Include',
  conform: 'Conform',
}

const severityLabels = {
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
}

const defaultViewpointTemplate =
  '# {{view.name}}\n\nViewpoint: {{viewpoint.name}}\n\n{{viewpoint.purpose}}\n\n## Scope\n\n{{view.scope}}\n\n## Summary\n\n{{view.summary}}\n\n## Traceability\n\n{{view.traceability}}\n\n## Validation\n\n{{view.validation}}\n'

const viewpointPresets = [
  {
    key: 'requirements-review',
    label: '需求审查',
    description: '检查需求是否被设计满足、是否有测试验证。',
    purpose: '用于需求审查，关注需求、满足关系和验证用例。',
    allowed_types: ['Requirement', 'Block', 'TestCase'],
    required_types: ['Requirement'],
    allowed_relations: ['satisfy', 'verify'],
    default_query: {
      types: ['Requirement', 'Block', 'TestCase'],
      owners: [],
      text: '',
      relation_depth: 1,
      relations: ['satisfy', 'verify'],
    },
    document_template: defaultViewpointTemplate,
  },
  {
    key: 'interface-review',
    label: '接口审查',
    description: '检查接口、端口和连接关系是否清楚。',
    purpose: '用于接口审查，关注接口、端口、模块连接和协议说明。',
    allowed_types: ['Block', 'Interface', 'Port'],
    required_types: ['Interface'],
    allowed_relations: ['connect', 'expose', 'compose'],
    default_query: {
      types: ['Block', 'Interface', 'Port'],
      owners: [],
      text: '',
      relation_depth: 1,
      relations: ['connect', 'expose', 'compose'],
    },
    document_template: defaultViewpointTemplate,
  },
  {
    key: 'verification-review',
    label: '测试验证',
    description: '检查测试用例是否覆盖需求。',
    purpose: '用于测试验证审查，关注需求、测试用例和验证关系。',
    allowed_types: ['Requirement', 'TestCase'],
    required_types: ['Requirement', 'TestCase'],
    allowed_relations: ['verify'],
    default_query: {
      types: ['Requirement', 'TestCase'],
      owners: [],
      text: '',
      relation_depth: 1,
      relations: ['verify'],
    },
    document_template: defaultViewpointTemplate,
  },
  {
    key: 'architecture-review',
    label: '结构设计',
    description: '检查模块结构、组成和约束关系。',
    purpose: '用于结构设计审查，关注模块分解、组成关系和关键约束。',
    allowed_types: ['Block', 'Port', 'Interface', 'Constraint'],
    required_types: ['Block'],
    allowed_relations: ['compose', 'connect', 'constrain', 'expose'],
    default_query: {
      types: ['Block', 'Port', 'Interface', 'Constraint'],
      owners: [],
      text: '',
      relation_depth: 1,
      relations: ['compose', 'connect', 'constrain', 'expose'],
    },
    document_template: defaultViewpointTemplate,
  },
]

const workbenchTabs = ['overview', 'workspace', 'projects', 'model', 'views', 'diagram', 'trace', 'version', 'docgen', 'mdk', 'assistant'] as const

type WorkbenchTab = (typeof workbenchTabs)[number]

const primaryWorkbenchNav = [
  { value: 'overview', label: '总览', icon: LayoutDashboard },
  { value: 'projects', label: '项目管理', icon: Boxes },
] satisfies Array<{ value: WorkbenchTab; label: string; icon: typeof LayoutDashboard }>

const secondaryWorkbenchNav = [
  { value: 'model', label: '模型', icon: Boxes },
  { value: 'views', label: '视图', icon: Archive },
  { value: 'diagram', label: '图谱', icon: Network },
  { value: 'trace', label: '追踪', icon: Workflow },
  { value: 'version', label: '版本', icon: GitBranch },
  { value: 'docgen', label: '文档', icon: FileText },
  { value: 'mdk', label: '外部导入', icon: Wrench },
  { value: 'assistant', label: '助手', icon: MessageCircle },
] satisfies Array<{ value: WorkbenchTab; label: string; icon: typeof LayoutDashboard }>

const workspaceNavDetails: Partial<Record<WorkbenchTab, string>> = {
  projects: '管理多个项目、切换当前项目和分支入口。',
  model: '创建、筛选和编辑 SysML 模型元素。',
  views: '配置 View / Viewpoint，收敛图谱和文档范围。',
  diagram: '查看模型关系网络，理解元素之间的连接。',
  trace: '检查需求、满足、验证和约束的闭环情况。',
  version: '管理提交、Diff、回滚、标签和分支合并。',
  docgen: '按模型或 View 生成 Markdown、HTML、PDF 文档。',
  mdk: '导入结构化模型来源，并接收分析/仿真工具产生的验证证据。',
  assistant: '用 AI 辅助审查模型、追踪关系和文档质量。',
}

const headerDetails: Partial<Record<WorkbenchTab, { title: string; description: string }>> = {
  overview: {
    title: '文档自动生成系统',
    description: '统一管理项目模型、追踪关系、版本和工程文档',
  },
  workspace: {
    title: '工作区',
    description: '选择当前项目下的模型、视图、图谱、追踪、版本、文档和工具入口',
  },
  projects: {
    title: '项目管理',
    description: '管理个人工作台、共享项目和协作成员',
  },
  model: {
    title: '模型管理',
    description: '管理 SysML 元素、关系和模型属性',
  },
  views: {
    title: '视图管理',
    description: '配置 View / Viewpoint，收敛图谱和文档范围',
  },
  diagram: {
    title: '关系图谱',
    description: '查看模型元素之间的连接和追踪网络',
  },
  trace: {
    title: '追踪矩阵',
    description: '检查需求、满足、验证和约束闭环',
  },
  version: {
    title: '版本管理',
    description: '管理提交、Diff、回滚、标签和分支合并',
  },
  docgen: {
    title: '文档生成',
    description: '按模型或视图生成 Markdown、HTML、PDF 和 Word 文档',
  },
  mdk: {
    title: '外部导入',
    description: '导入模型来源，并接收分析/仿真工具产生的验证证据',
  },
  assistant: {
    title: '智能助手',
    description: '辅助审查模型、追踪关系和文档质量',
  },
}

const moduleWorkbenchTabs = new Set<WorkbenchTab>(
  secondaryWorkbenchNav.map((item) => item.value)
)

type SaveElementInput = {
  element: SysmlElement
  attributesText?: string
  relationsText?: string
  successMessage?: string
  nextSelectedId?: string
}

type SysmlNodeData = {
  element: SysmlElement
  label: string
  onEdit: (id: string) => void
}

type SysmlFlowNode = Node<SysmlNodeData, 'sysml'>

type SysmlEdgeData = {
  relationType: string
  relationLabel: string
}

type SysmlFlowEdge = Edge<SysmlEdgeData, 'smoothstep'> & {
  pathOptions?: {
    borderRadius?: number
    offset?: number
    stepPosition?: number
  }
}

const nodeWidth = 230
const nodeHeight = 116
const projectStorageKey = 'sysml-docgen-project'

export function SysmlWorkbench() {
  const navigate = useNavigate()
  const [identity, setIdentity] = useState<Identity | null>(() => loadIdentity())
  const [loginForm, setLoginForm] = useState({
    username: identity?.username || 'engineer',
    password: 'engineer123',
  })
  const [role, setRole] = useState(identity?.role || 'user')
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [newProject, setNewProject] = useState({
    name: '',
    organization: '',
    description: '',
    editorMembers: '',
    viewerMembers: '',
  })
  const [memberDrafts, setMemberDrafts] = useState<
    Record<string, { editorMembers: string; viewerMembers: string }>
  >({})
  const [branches, setBranches] = useState<Branch[]>([])
  const [branch, setBranch] = useState('main')
  const [metamodel, setMetamodel] = useState<Metamodel | null>(null)
  const [elements, setElements] = useState<SysmlElement[]>([])
  const [allElements, setAllElements] = useState<SysmlElement[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [form, setForm] = useState<SysmlElement>(() =>
    defaultElement('Requirement', null)
  )
  const [attributesText, setAttributesText] = useState('{}')
  const [relationsText, setRelationsText] = useState('[]')
  const [validation, setValidation] = useState<ValidationPayload | null>(null)
  const [diagramType, setDiagramType] = useState('requirements')
  const [diagram, setDiagram] = useState<DiagramPayload | null>(null)
  const [views, setViews] = useState<SysmlElement[]>([])
  const [selectedViewId, setSelectedViewId] = useState('all')
  const [viewScope, setViewScope] = useState<ViewPayload | null>(null)
  const [diagramPositions, setDiagramPositions] = useState<
    Record<string, { x: number; y: number }>
  >({})
  const [traceability, setTraceability] = useState<TraceabilityRow[]>([])
  const [commits, setCommits] = useState<Commit[]>([])
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [diff, setDiff] = useState<DiffPayload | null>(null)
  const [diffFrom, setDiffFrom] = useState('working')
  const [diffTo, setDiffTo] = useState('working')
  const [rollbackCommit, setRollbackCommit] = useState('')
  const [newBranch, setNewBranch] = useState('')
  const [mergeSource, setMergeSource] = useState('')
  const [forceMerge, setForceMerge] = useState(false)
  const [template, setTemplate] = useState(defaultTemplate)
  const [docViewId, setDocViewId] = useState('all')
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [documentsContext, setDocumentsContext] = useState<{
    projectId: string
    branch: string
  } | null>(null)
  const [currentDocument, setCurrentDocument] = useState<DocumentRecord | null>(
    null
  )
  const [aiClosureSuggestions, setAiClosureSuggestions] =
    useState<AiClosureSuggestionResponse | null>(null)
  const [aiValidationFixReview, setAiValidationFixReview] =
    useState<AiValidationFixReview | null>(null)
  const [aiValidationFixApplyResult, setAiValidationFixApplyResult] =
    useState<AiValidationFixApplyResult | null>(null)
  const [aiVersionImpact, setAiVersionImpact] =
    useState<AiVersionImpact | null>(null)
  const [aiDocumentReview, setAiDocumentReview] =
    useState<AiDocumentQualityReview | null>(null)
  const [mdkAdapters, setMdkAdapters] = useState<MdkAdapter[]>([])
  const [mdkTool, setMdkTool] = useState('json')
  const [mdkFilename, setMdkFilename] = useState('model.json')
  const [mdkContent, setMdkContent] = useState(sampleMdkJson)
  const [mdkParseResult, setMdkParseResult] = useState<MdkParseResponse | null>(
    null
  )
  const [mdkImportJob, setMdkImportJob] = useState<MdkImportJob | null>(null)
  const [mdkCommit, setMdkCommit] = useState(true)
  const [mdkMessage, setMdkMessage] = useState('MDK frontend import')
  const [assistantQuestion, setAssistantQuestion] = useState('')
  const [assistantMessages, setAssistantMessages] = useState<AiChatMessage[]>([])
  const [activeTab, setActiveTab] = useState<WorkbenchTab>(() =>
    tabFromHash(window.location.hash)
  )
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const workspaceLoadRef = useRef(0)

  const project = projects.find((item) => item.id === projectId)
  const types = Object.keys(metamodel?.types || {})
  const relationTypes = Object.keys(metamodel?.relation_labels || {})
  const selectedElement =
    elements.find((item) => item.id === selectedId) ||
    allElements.find((item) => item.id === selectedId)
  const viewElements = allElements.filter((item) => item.type === 'View')
  const viewpointElements = allElements.filter((item) => item.type === 'Viewpoint')
  const projectTotals = useMemo(
    () => ({
      projects: projects.length,
      branches: projects.reduce((sum, item) => sum + (item.branches || 0), 0),
      elements: projects.reduce((sum, item) => sum + (item.elements || 0), 0),
      views: projects.reduce((sum, item) => sum + (item.views || 0), 0),
      documents: projects.reduce((sum, item) => sum + (item.documents || 0), 0),
      commits: projects.reduce((sum, item) => sum + (item.commits || 0), 0),
    }),
    [projects]
  )
  const currentBranchSummary = branches.find((item) => item.name === branch)
  const documentsAreCurrent =
    documentsContext?.projectId === projectId && documentsContext?.branch === branch
  const workspaceTotals = useMemo(
    () => ({
      projects: project ? 1 : 0,
      branches: branches.length,
      elements: allElements.length,
      views: allElements.filter((item) => item.type === 'View').length,
      documents: documentsAreCurrent
        ? documents.length
        : currentBranchSummary?.documents || 0,
      commits: project?.commits || 0,
    }),
    [
      allElements,
      branches.length,
      currentBranchSummary?.documents,
      documentsAreCurrent,
      documents.length,
      project,
    ]
  )
  const headerDetail = headerDetails[activeTab] || headerDetails.overview

  useEffect(() => {
    bootstrap()
  }, [])

  useEffect(() => {
    const onHashChange = () => {
      const nextTab = tabFromHash(window.location.hash)
      setActiveTab(nextTab)
      preloadTab(nextTab)
    }

    onHashChange()
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [projectId, branch])

  useEffect(() => {
    if (!projectId) return
    loadProjectBranches(projectId)
  }, [projectId])

  useEffect(() => {
    if (!projectId || !branch) return
    const requestId = workspaceLoadRef.current
    void loadModelSnapshot({ requestId })
  }, [projectId, branch, typeFilter, query, diagramType, selectedViewId])

  useEffect(() => {
    if (!selectedElement) return
    setForm(selectedElement)
    setAttributesText(JSON.stringify(selectedElement.attributes || {}, null, 2))
    setRelationsText(JSON.stringify(selectedElement.relations || [], null, 2))
  }, [selectedElement?.id])

  async function bootstrap(
    nextIdentity: Identity | null = identity,
    nextRole: Identity['role'] = role
  ) {
    if (!nextIdentity) {
      resetWorkbenchState()
      return
    }
    setLoading(true)
    try {
      const [metamodelPayload, projectsPayload] = await Promise.all([
        api<Metamodel>('/api/metamodel', { identity: nextIdentity, role: nextRole }),
        api<{ projects: Project[] }>('/api/projects', { identity: nextIdentity, role: nextRole }),
      ])
      setMetamodel(metamodelPayload)
      setProjects(projectsPayload.projects)
      const preferredProject = pickInitialProject(
        projectsPayload.projects,
        nextIdentity.username
      )
      selectProject(preferredProject?.id || '')
    } catch (error) {
      notifyError(error)
    } finally {
      setLoading(false)
    }
  }

  function resetWorkbenchState() {
    setProjects([])
    setProjectId('')
    setBranches([])
    setBranch('main')
    setMetamodel(null)
    setElements([])
    setAllElements([])
    setSelectedId('')
    setTypeFilter('all')
    setQuery('')
    setForm(defaultElement('Requirement', null))
    setAttributesText('{}')
    setRelationsText('[]')
    setValidation(null)
    setDiagramType('requirements')
    setDiagram(null)
    setViews([])
    setSelectedViewId('all')
    setViewScope(null)
    setDiagramPositions({})
    setTraceability([])
    setCommits([])
    setAuditEvents([])
    setDiff(null)
    setDiffFrom('working')
    setDiffTo('working')
    setRollbackCommit('')
    setNewBranch('')
    setMergeSource('')
    setForceMerge(false)
    setNewProject({
      name: '',
      organization: '',
      description: '',
      editorMembers: '',
      viewerMembers: '',
    })
    setTemplate(defaultTemplate)
    setDocViewId('all')
    setDocuments([])
    setDocumentsContext(null)
    setCurrentDocument(null)
    setAiClosureSuggestions(null)
    setAiVersionImpact(null)
    setAiDocumentReview(null)
    setMdkAdapters([])
    setMdkTool('json')
    setMdkFilename('model.json')
    setMdkContent(sampleMdkJson)
    setMdkParseResult(null)
    setMdkImportJob(null)
    setMdkCommit(true)
    setMdkMessage('MDK frontend import')
    setAssistantQuestion('')
    setAssistantMessages([])
    setBusy('')
    setLoading(false)
  }

  function selectProject(nextProjectId: string) {
    workspaceLoadRef.current += 1
    if (nextProjectId) {
      window.localStorage.setItem(projectStorageKey, nextProjectId)
    } else {
      window.localStorage.removeItem(projectStorageKey)
    }
    setProjectId(nextProjectId)
    setBranch('main')
    setBranches([])
    setElements([])
    setAllElements([])
    setSelectedId('')
    setViews([])
    setSelectedViewId('all')
    setViewScope(null)
    setDiagram(null)
    setTraceability([])
    setCommits([])
    setAuditEvents([])
    setDiff(null)
    setRollbackCommit('')
    setMergeSource('')
    setDocuments([])
    setDocumentsContext(null)
    setCurrentDocument(null)
    setValidation(null)
    startNewElement(types[0] || 'Requirement')
  }

  function openProjectWorkspace(nextProjectId: string) {
    selectProject(nextProjectId)
    setActiveTab('workspace')
    if (window.location.hash !== '#workspace') {
      window.history.replaceState(null, '', '#workspace')
    }
  }

  async function loadProjectBranches(
    nextProjectId = projectId,
    options: { requestId?: number; preferredBranch?: string } = {}
  ) {
    if (!nextProjectId) return
    const requestId = options.requestId ?? workspaceLoadRef.current
    const preferredBranch = options.preferredBranch ?? branch ?? 'main'
    try {
      const payload = await api<{ branches: Branch[] }>(
        `/api/projects/${encodeURIComponent(nextProjectId)}/branches`,
        { identity, role }
      )
      if (requestId !== workspaceLoadRef.current) {
        return
      }
      setBranches(payload.branches)
      const nextBranch = payload.branches.some((item) => item.name === preferredBranch)
        ? preferredBranch
        : payload.branches[0]?.name || 'main'
      setBranch(nextBranch)
      setMergeSource(
        payload.branches.find((item) => item.name !== nextBranch)?.name || ''
      )
    } catch (error) {
      notifyError(error)
    }
  }

  async function createProject() {
    if (!newProject.name.trim()) {
      toast.error('请先填写共享项目名称')
      return
    }
    setBusy('create-project')
    try {
      const payload = await api<{ project: Project }>('/api/projects', {
        method: 'POST',
        identity,
        role,
        body: JSON.stringify({
          name: newProject.name.trim(),
          organization: newProject.organization.trim() || undefined,
          description: newProject.description.trim(),
          members: buildProjectMembers(
            newProject.editorMembers,
            newProject.viewerMembers
          ),
        }),
      })
      const projectsPayload = await api<{ projects: Project[] }>('/api/projects', {
        identity,
        role,
      })
      setProjects(projectsPayload.projects)
      selectProject(payload.project.id)
      await loadProjectBranches(payload.project.id)
      setNewProject({
        name: '',
        organization: '',
        description: '',
        editorMembers: '',
        viewerMembers: '',
      })
      toast.success(`共享项目已创建：${payload.project.name || payload.project.id}`)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  async function publishProjectToLibrary(sourceProjectId = projectId) {
    const sourceProject = projects.find((item) => item.id === sourceProjectId)
    if (!sourceProject) return
    if (sourceProject.visibility === 'shared') {
      toast.message('当前项目已经在共享库中')
      return
    }
    setBusy(`publish-project:${sourceProjectId}`)
    try {
      const payload = await publishProject(
        sourceProjectId,
        {
          id: `${sourceProject.id}-shared-${Date.now().toString(36)}`,
          name: `${sourceProject.name || sourceProject.id} 共享版`,
          organization: sourceProject.organization,
          description: sourceProject.description,
          members: sourceProject.members || [],
        },
        { identity, role }
      )
      const projectsPayload = await api<{ projects: Project[] }>('/api/projects', {
        identity,
        role,
      })
      setProjects(projectsPayload.projects)
      selectProject(payload.project.id)
      await loadProjectBranches(payload.project.id)
      toast.success(`已发布到共享库：${payload.project.name || payload.project.id}`)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  async function copyProjectToWorkspace(sourceProjectId: string) {
    if (!identity) return
    setBusy(`copy-project:${sourceProjectId}`)
    try {
      const payload = await copySharedProject(
        sourceProjectId,
        {
          id: `${identity.username}-${sourceProjectId}-copy-${Date.now().toString(36)}`,
          name: `复制自 ${sourceProjectId}`,
        },
        { identity, role }
      )
      const projectsPayload = await api<{ projects: Project[] }>('/api/projects', {
        identity,
        role,
      })
      setProjects(projectsPayload.projects)
      selectProject(payload.project.id)
      await loadProjectBranches(payload.project.id)
      toast.success(`已复制到个人工作台：${payload.project.name || payload.project.id}`)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  async function deleteProjectFromWorkspace(targetProjectId: string) {
    const targetProject = projects.find((item) => item.id === targetProjectId)
    if (!targetProject) return
    if (targetProject.kind === 'workspace') {
      toast.error('个人工作台不能删除')
      return
    }
    const confirmed = window.confirm(
      `确定删除项目「${targetProject.name || targetProject.id}」吗？此操作不能撤销。`
    )
    if (!confirmed) return
    setBusy(`delete-project:${targetProjectId}`)
    try {
      await deleteProject(targetProjectId, { identity, role })
      const projectsPayload = await api<{ projects: Project[] }>('/api/projects', {
        identity,
        role,
      })
      setProjects(projectsPayload.projects)
      const nextProject =
        projectsPayload.projects.find((item) => item.id !== targetProjectId) ||
        null
      selectProject(nextProject?.id || '')
      if (nextProject) await loadProjectBranches(nextProject.id)
      toast.success(`已删除项目：${targetProject.name || targetProject.id}`)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  function memberDraftFor(project: Project) {
    return (
      memberDrafts[project.id] || {
        editorMembers: membersByRole(project, 'editor'),
        viewerMembers: membersByRole(project, 'viewer'),
      }
    )
  }

  function updateMemberDraft(
    targetProjectId: string,
    field: 'editorMembers' | 'viewerMembers',
    value: string
  ) {
    const targetProject = projects.find((item) => item.id === targetProjectId)
    setMemberDrafts((current) => {
      const existing =
        current[targetProjectId] ||
        (targetProject
          ? {
              editorMembers: membersByRole(targetProject, 'editor'),
              viewerMembers: membersByRole(targetProject, 'viewer'),
            }
          : { editorMembers: '', viewerMembers: '' })
      return {
        ...current,
        [targetProjectId]: {
          ...existing,
          [field]: value,
        },
      }
    })
  }

  async function saveProjectMembers(targetProjectId: string) {
    const targetProject = projects.find((item) => item.id === targetProjectId)
    if (!targetProject) return
    const draft = memberDraftFor(targetProject)
    setBusy(`members-project:${targetProjectId}`)
    try {
      await updateProjectMembers(
        targetProjectId,
        {
          members: buildProjectMembers(
            draft.editorMembers,
            draft.viewerMembers
          ),
        },
        { identity, role }
      )
      const projectsPayload = await api<{ projects: Project[] }>('/api/projects', {
        identity,
        role,
      })
      setProjects(projectsPayload.projects)
      setMemberDrafts((current) => {
        const next = { ...current }
        delete next[targetProjectId]
        return next
      })
      toast.success(`已更新成员：${targetProject.name || targetProject.id}`)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  async function loadModelSnapshot(
    options: {
      requestId?: number
      preferredElementIds?: string[]
      ignoreFilters?: boolean
    } = {}
  ) {
    if (!projectId || !branch) return
    const requestId = options.requestId ?? workspaceLoadRef.current
    const currentProjectId = projectId
    const currentBranch = branch
    try {
      const params = new URLSearchParams()
      if (!options.ignoreFilters && typeFilter !== 'all') params.set('type', typeFilter)
      if (!options.ignoreFilters && query.trim()) params.set('q', query.trim())
      const [
        filteredPayload,
        allPayload,
        validationPayload,
        diagramPayload,
      ] = await Promise.all([
        api<{ elements: SysmlElement[] }>(
          `/api/projects/${encodeURIComponent(currentProjectId)}/branches/${encodeURIComponent(currentBranch)}/elements?${params}`,
          { identity, role }
        ),
        api<{ elements: SysmlElement[] }>(
          `/api/projects/${encodeURIComponent(currentProjectId)}/branches/${encodeURIComponent(currentBranch)}/elements`,
          { identity, role }
        ),
        api<ValidationPayload>(
          `/api/projects/${encodeURIComponent(currentProjectId)}/branches/${encodeURIComponent(currentBranch)}/validate`,
          { identity, role }
        ),
        loadDiagramPayload(currentProjectId, currentBranch),
      ])
      if (
        requestId !== workspaceLoadRef.current ||
        currentProjectId !== projectId ||
        currentBranch !== branch
      ) {
        return
      }
      setElements(filteredPayload.elements)
      setAllElements(allPayload.elements)
      setValidation(validationPayload)
      setDiagram(diagramPayload.diagram)
      setViewScope(diagramPayload.viewScope)
      const preferredId = options.preferredElementIds?.find((id) =>
        filteredPayload.elements.some((item) => item.id === id)
      )
      const nextId = preferredId
        || (filteredPayload.elements.some((item) => item.id === selectedId)
          ? selectedId
          : filteredPayload.elements[0]?.id || '')
      setSelectedId(nextId)
      if (!nextId) startNewElement()
      void loadViews({ requestId, elements: allPayload.elements })
    } catch (error) {
      notifyError(error)
    }
  }

  async function loadElements() {
    await loadModelSnapshot()
  }

  async function loadAllElements() {
    if (!projectId || !branch) return
    try {
      const payload = await api<{ elements: SysmlElement[] }>(
        `/api/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branch)}/elements`,
        { identity, role }
      )
      setAllElements(payload.elements)
    } catch (error) {
      notifyError(error)
    }
  }

  async function loadViews(
    options: { requestId?: number; elements?: SysmlElement[] } = {}
  ) {
    if (!projectId || !branch) return
    const requestId = options.requestId ?? workspaceLoadRef.current
    const currentProjectId = projectId
    const currentBranch = branch
    try {
      const payload = options.elements
        ? {
            views: options.elements.filter(
              (item) => item.type === 'View'
            ),
          }
        : await api<{ views: SysmlElement[] }>(
            `/api/projects/${encodeURIComponent(currentProjectId)}/branches/${encodeURIComponent(currentBranch)}/views`,
            { identity, role }
          )
      if (
        requestId !== workspaceLoadRef.current ||
        currentProjectId !== projectId ||
        currentBranch !== branch
      ) {
        return
      }
      setViews(payload.views)
      if (
        selectedViewId !== 'all' &&
        !payload.views.some((view) => view.id === selectedViewId)
      ) {
        setSelectedViewId('all')
        setViewScope(null)
      }
      if (
        docViewId !== 'all' &&
        !payload.views.some((view) => view.id === docViewId)
      ) {
        setDocViewId('all')
      }
    } catch (error) {
      notifyError(error)
    }
  }

  async function loadDiagramPayload(
    currentProjectId = projectId,
    currentBranch = branch
  ) {
    if (selectedViewId !== 'all') {
      const [diagramPayload, scopePayload] = await Promise.all([
        api<{ diagram: DiagramPayload }>(
          `/api/projects/${encodeURIComponent(currentProjectId)}/branches/${encodeURIComponent(currentBranch)}/views/${encodeURIComponent(selectedViewId)}/diagram`,
          { identity, role }
        ),
        api<ViewPayload>(
          `/api/projects/${encodeURIComponent(currentProjectId)}/branches/${encodeURIComponent(currentBranch)}/views/${encodeURIComponent(selectedViewId)}`,
          { identity, role }
        ),
      ])
      return {
        diagram: diagramPayload.diagram,
        viewScope: scopePayload,
      }
    }
    const payload = await api<{ diagram: DiagramPayload }>(
      `/api/projects/${encodeURIComponent(currentProjectId)}/branches/${encodeURIComponent(currentBranch)}/diagram?type=${diagramType}`,
      { identity, role }
    )
    return {
      diagram: payload.diagram,
      viewScope: null,
    }
  }

  async function loadDiagram() {
    if (!projectId || !branch) return
    const requestId = workspaceLoadRef.current
    const currentProjectId = projectId
    const currentBranch = branch
    try {
      const payload = await loadDiagramPayload(currentProjectId, currentBranch)
      if (
        requestId !== workspaceLoadRef.current ||
        currentProjectId !== projectId ||
        currentBranch !== branch
      ) {
        return
      }
      setDiagram(payload.diagram)
      setViewScope(payload.viewScope)
    } catch (error) {
      notifyError(error)
    }
  }

  async function loadTraceability() {
    if (!projectId || !branch) return
    setBusy('trace')
    try {
      const payload = await api<{ traceability: TraceabilityRow[] }>(
        `/api/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branch)}/traceability`,
        { identity, role }
      )
      setTraceability(payload.traceability)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  async function loadVersionData() {
    if (!projectId) return
    setBusy('version')
    try {
      const [commitPayload, auditPayload] = await Promise.all([
        api<{ commits: Commit[] }>(
          `/api/projects/${encodeURIComponent(projectId)}/commits`,
          { identity, role }
        ),
        api<{ events: AuditEvent[] }>(
          `/api/projects/${encodeURIComponent(projectId)}/audit?limit=80`,
          { identity, role }
        ),
      ])
      setCommits(commitPayload.commits)
      setAuditEvents(auditPayload.events)
      setRollbackCommit(commitPayload.commits[0]?.id || '')
      setDiffFrom(commitPayload.commits[1]?.id || commitPayload.commits[0]?.id || 'working')
      setDiffTo('working')
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  async function loadDocuments() {
    if (!projectId || !branch) return
    setBusy('documents')
    try {
      const payload = await api<{ documents: DocumentRecord[] }>(
        `/api/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branch)}/documents`,
        { identity, role }
      )
      setDocuments(payload.documents)
      setDocumentsContext({ projectId, branch })
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  function selectTab(tab: WorkbenchTab) {
    setActiveTab(tab)
    preloadTab(tab)
    const nextHash = `#${tab}`
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', nextHash)
    }
  }

  function preloadTab(tab: WorkbenchTab) {
    if (tab === 'model') void loadModelSnapshot({ ignoreFilters: true })
    if (tab === 'trace') void loadTraceability()
    if (tab === 'version') void loadVersionData()
    if (tab === 'docgen') void loadDocuments()
    if (tab === 'mdk') void loadMdkAdapters()
  }

  async function loadMdkAdapters() {
    setBusy((current) => current || 'mdk-adapters')
    try {
      const payload = await api<{ adapters: MdkAdapter[] }>('/api/mdk/adapters', {
        identity,
        role,
      })
      setMdkAdapters(payload.adapters)
      if (!payload.adapters.some((adapter) => adapter.id === mdkTool)) {
        setMdkTool(payload.adapters[0]?.id || 'json')
      }
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy((current) => (current === 'mdk-adapters' ? '' : current))
    }
  }

  async function handleLogin() {
    setBusy('login')
    try {
      const payload = await login(loginForm.username.trim(), loginForm.password)
      setIdentity(payload.identity)
      setRole(payload.identity.role)
      saveIdentity(payload.identity)
      resetWorkbenchState()
      toast.success(`已登录：${payload.identity.display || payload.identity.username}`)
      await bootstrap(payload.identity, payload.identity.role)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  function handleLogout() {
    resetWorkbenchState()
    setIdentity(null)
    saveIdentity(null)
    setRole('user')
    setLoginForm({ username: '', password: '' })
    toast.success('已退出登录')
    navigate({ to: '/sign-in', replace: true })
  }

  function startNewElement(type = form.type || 'Requirement') {
    const next = defaultElement(type, metamodel)
    setSelectedId('')
    setForm(next)
    setAttributesText(JSON.stringify(next.attributes || {}, null, 2))
    setRelationsText(JSON.stringify(next.relations || [], null, 2))
  }

  function updateForm<K extends keyof SysmlElement>(
    key: K,
    value: SysmlElement[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleTypeChange(type: string) {
    const defaults = defaultElement(type, metamodel)
    setForm((current) => ({
      ...current,
      type,
      stereotype: current.id
        ? current.stereotype
        : defaults.stereotype || current.stereotype,
      attributes: current.id ? current.attributes : defaults.attributes,
    }))
    if (!form.id) {
      setAttributesText(JSON.stringify(defaults.attributes || {}, null, 2))
    }
  }

  async function persistElement({
    element,
    attributesText: nextAttributesText,
    relationsText: nextRelationsText,
    successMessage = '模型元素已保存',
    nextSelectedId,
  }: SaveElementInput) {
    if (!projectId || !branch) return
    const payload = {
      ...element,
      id: element.id.trim(),
      name: element.name.trim(),
      owner: element.owner?.trim() || '',
      stereotype: element.stereotype?.trim() || '',
      description: element.description?.trim() || '',
      attributes:
        nextAttributesText === undefined
          ? element.attributes || {}
          : parseJson<Record<string, unknown>>(nextAttributesText, '属性 JSON', {}),
      relations:
        nextRelationsText === undefined
          ? element.relations || []
          : parseJson<Relation[]>(nextRelationsText, '关系 JSON', []),
    }
    const isUpdate = Boolean(payload.id)
    const path = isUpdate
      ? `/api/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branch)}/elements/${encodeURIComponent(payload.id)}`
      : `/api/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branch)}/elements`
    const result = await api<{ element: SysmlElement }>(path, {
      method: isUpdate ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
      identity,
      role,
    })
    setSelectedId(nextSelectedId ?? result.element.id)
    await Promise.all([loadElements(), loadAllElements()])
    if (successMessage) toast.success(successMessage)
  }

  async function saveElement(event: FormEvent) {
    event.preventDefault()
    if (!projectId || !branch) return
    setBusy('save-element')
    try {
      await persistElement({
        element: form,
        attributesText,
        relationsText,
      })
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  async function saveCurrentElement() {
    if (!projectId || !branch) return
    setBusy('save-element')
    try {
      await persistElement({
        element: form,
        attributesText,
        relationsText,
      })
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  async function updateDiagramElement(
    element: SysmlElement,
    successMessage: string,
    nextSelectedId = element.id
  ) {
    if (!projectId || !branch) return
    setBusy('diagram-edit')
    try {
      await persistElement({
        element,
        successMessage,
        nextSelectedId,
      })
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  function handleDiagramPositionsChange(
    positions: Record<string, { x: number; y: number }>
  ) {
    setDiagramPositions((current) => ({ ...current, ...positions }))
  }

  async function deleteElement() {
    if (!projectId || !branch || !selectedElement) return
    if (!window.confirm(`确认删除 ${selectedElement.id} ${selectedElement.name}？`)) {
      return
    }
    setBusy('delete-element')
    try {
      await api(
        `/api/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branch)}/elements/${encodeURIComponent(selectedElement.id)}`,
        { method: 'DELETE', identity, role }
      )
      setSelectedId('')
      await Promise.all([loadElements(), loadAllElements()])
      toast.success('模型元素已删除')
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  function setViewIncludedElements(nextIds: string[]) {
    const attributes = parseJsonSafe<Record<string, unknown>>(attributesText, {})
    const cleaned = Array.from(
      new Set(nextIds.map((item) => String(item).trim()).filter(Boolean))
    )
    const updated = { ...attributes, included_elements: cleaned }
    setAttributesText(JSON.stringify(updated, null, 2))
    setForm((currentForm) => ({
      ...currentForm,
      attributes: updated,
    }))
  }

  async function addRelation() {
    if (!form.id || !elements.length || !relationTypes.length) return
    const target = elements.find((item) => item.id !== form.id)?.id || elements[0]?.id
    const next = [...(parseJsonSafe<Relation[]>(relationsText, []) || [])]
    next.push({ type: relationTypes[0], target })
    setRelationsText(JSON.stringify(next, null, 2))
  }

  function toggleViewElement(elementId: string, checked: boolean) {
    const attributes = parseJsonSafe<Record<string, unknown>>(attributesText, {})
    const current = Array.isArray(attributes.included_elements)
      ? attributes.included_elements.map(String)
      : []
    const next = checked
      ? Array.from(new Set([...current, elementId]))
      : current.filter((item) => item !== elementId)
    setViewIncludedElements(next)
  }

  function updateViewAttributes(patch: Record<string, unknown>) {
    const attributes = parseJsonSafe<Record<string, unknown>>(attributesText, {})
    const updated = { ...attributes, ...patch }
    setAttributesText(JSON.stringify(updated, null, 2))
    setForm((currentForm) => ({
      ...currentForm,
      attributes: updated,
    }))
  }

  function updateViewQuery(patch: Record<string, unknown>) {
    const attributes = parseJsonSafe<Record<string, unknown>>(attributesText, {})
    const currentQuery =
      attributes.query && typeof attributes.query === 'object' && !Array.isArray(attributes.query)
        ? (attributes.query as Record<string, unknown>)
        : {}
    updateViewAttributes({ query: { ...currentQuery, ...patch } })
  }

  async function commitBranch() {
    if (!projectId || !branch) return
    const message = window.prompt('提交说明', 'Update SysML model')
    if (message === null) return
    setBusy('commit')
    try {
      const result = await api<{ commit: Commit }>(
        `/api/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branch)}/commit`,
        {
          method: 'POST',
          body: JSON.stringify({ message }),
          identity,
          role,
        }
      )
      await loadProjectBranches()
      toast.success(`已提交 ${result.commit.id}`)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  async function exportModel(format: 'json' | 'xmi') {
    if (!projectId || !branch) return
    setBusy(`export-${format}`)
    try {
      const payload = await api<unknown>(
        `/api/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branch)}/export?format=${format}`,
        { identity, role }
      )
      if (format === 'xmi') {
        downloadText(`${projectId}-${branch}.xmi`, String(payload), 'application/xml')
      } else {
        downloadText(
          `${projectId}-${branch}.json`,
          JSON.stringify(payload, null, 2),
          'application/json'
        )
      }
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  async function runDiff() {
    if (!projectId || !branch) return
    setBusy('diff')
    try {
      const params = new URLSearchParams({ from: diffFrom, to: diffTo })
      const payload = await api<DiffPayload>(
        `/api/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branch)}/diff?${params}`,
        { identity, role }
      )
      setDiff(payload)
      setAiVersionImpact(null)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  async function runAiVersionImpact() {
    if (!projectId || !branch) return
    setBusy('ai-version-impact')
    try {
      const result = await api<AiVersionImpact>(
        `/api/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branch)}/version/ai-impact`,
        {
          method: 'POST',
          body: JSON.stringify({ from: diffFrom, to: diffTo }),
          identity,
          role,
        }
      )
      setAiVersionImpact(result)
      toast.success('AI change impact analysis completed')
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  async function createBranch() {
    if (!projectId || !newBranch.trim()) return
    setBusy('branch')
    try {
      await api(`/api/projects/${encodeURIComponent(projectId)}/branches`, {
        method: 'POST',
        body: JSON.stringify({ name: newBranch.trim(), source: branch }),
        identity,
        role,
      })
      setBranch(newBranch.trim())
      setNewBranch('')
      await loadProjectBranches()
      await Promise.all([loadElements(), loadAllElements()])
      toast.success('分支已创建')
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  async function deleteCommit(commitId: string) {
    if (!projectId || !commitId) return
    if (!window.confirm(`确认删除版本 ${commitId}？这不会删除当前工作区内容。`)) {
      return
    }
    setBusy(`delete-commit-${commitId}`)
    try {
      await api(`/api/projects/${encodeURIComponent(projectId)}/commits/${encodeURIComponent(commitId)}`, {
        method: 'DELETE',
        identity,
        role,
      })
      if (diffFrom === commitId) setDiffFrom('working')
      if (diffTo === commitId) setDiffTo('working')
      if (rollbackCommit === commitId) setRollbackCommit('')
      setDiff(null)
      setAiVersionImpact(null)
      await loadProjectBranches()
      await loadVersionData()
      toast.success('版本已删除')
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  async function rollback() {
    if (!projectId || !branch || !rollbackCommit) return
    if (!window.confirm(`确认回滚到 ${rollbackCommit}？`)) return
    setBusy('rollback')
    try {
      await api(
        `/api/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branch)}/rollback`,
        {
          method: 'POST',
          body: JSON.stringify({ commit: rollbackCommit }),
          identity,
          role,
        }
      )
      await loadProjectBranches()
      await Promise.all([loadElements(), loadAllElements()])
      await loadVersionData()
      toast.success('回滚已完成')
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  async function mergeBranch() {
    if (!projectId || !branch || !mergeSource || mergeSource === branch) return
    setBusy('merge')
    try {
      const result = await api<{
        merged: boolean
        conflicts?: { id: string }[]
        additions?: string[]
      }>(
        `/api/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branch)}/merge`,
        {
          method: 'POST',
          body: JSON.stringify({ source: mergeSource, force: forceMerge }),
          identity,
          role,
        }
      )
      if (!result.merged) {
        toast.error(`存在 ${result.conflicts?.length || 0} 个冲突`)
        return
      }
      await loadProjectBranches()
      await Promise.all([loadElements(), loadAllElements()])
      await loadVersionData()
      toast.success('分支合并完成')
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  async function generateDocument() {
    if (!projectId || !branch) return
    setBusy('generate-document')
    try {
      const effectiveTemplate =
        docViewId === 'all'
          ? template
          : `# View Document\n\n{{view:${docViewId}}}\n`
      const result = await api<{ document: DocumentRecord }>(
        `/api/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branch)}/documents`,
        {
          method: 'POST',
          body: JSON.stringify({ template: effectiveTemplate, format: 'html' }),
          identity,
          role,
        }
      )
      setCurrentDocument(result.document)
      setAiDocumentReview(null)
      await loadDocuments()
      toast.success('文档已生成')
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  async function generateAiDocgenDraft(mode: AiDocgenMode) {
    if (!projectId || !branch) return
    setBusy(`ai-docgen-${mode}`)
    try {
      const result = await api<AiDocgenDraft>(
        `/api/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branch)}/docgen/ai-draft`,
        {
          method: 'POST',
          body: JSON.stringify({ mode, template }),
          identity,
          role,
        }
      )
      setTemplate(result.template)
      toast.success('AI DocGen draft generated')
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  async function runAiClosureSuggestions() {
    if (!projectId || !branch) return
    setBusy('ai-closure-suggestions')
    try {
      const result = await api<AiClosureSuggestionResponse>(
        `/api/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branch)}/ve/ai-closure-suggestions`,
        {
          method: 'POST',
          body: JSON.stringify({ selected_id: selectedId }),
          identity,
          role,
        }
      )
      setAiClosureSuggestions(result)
      toast.success('AI closure suggestions generated')
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  async function runAiValidationFixReview() {
    if (!projectId || !branch) return
    if (!validation?.issues.length) {
      toast.success('当前没有语义校验问题')
      return
    }
    setBusy('ai-validation-fix')
    try {
      const result = await api<AiValidationFixReview>(
        `/api/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branch)}/ve/ai-validation-fix`,
        {
          method: 'POST',
          body: JSON.stringify({
            issues: validation.issues,
            focus: activeTab === 'views' ? 'view' : 'model',
          }),
          identity,
          role,
        }
      )
      setAiValidationFixReview(result)
      setAiValidationFixApplyResult(null)
      toast.success('AI 语义修复建议已生成')
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  async function applyAiValidationFixes() {
    if (!projectId || !branch) return
    if (!validation?.issues.length) {
      toast.success('当前没有语义校验问题')
      return
    }
    setBusy('ai-validation-apply')
    try {
      const result = await api<AiValidationFixApplyResult>(
        `/api/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branch)}/ve/ai-validation-fix/apply`,
        {
          method: 'POST',
          body: JSON.stringify({ apply: true }),
          identity,
          role,
        }
      )
      setAiValidationFixApplyResult(result)
      setValidation(result.validation)
      await Promise.all([loadElements(), loadAllElements(), loadProjectBranches()])
      toast.success(`已应用 ${result.applied.length} 条语义修复`)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  async function openDocument(documentId: string) {
    if (!projectId || !branch) return
    setBusy(`document-${documentId}`)
    try {
      const payload = await api<{ document: DocumentRecord }>(
        `/api/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branch)}/documents/${encodeURIComponent(documentId)}`,
        { identity, role }
      )
      setCurrentDocument(payload.document)
      setAiDocumentReview(null)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  async function runAiDocumentReview() {
    if (!projectId || !branch || !currentDocument) {
      toast.error('请先生成或打开一个文档')
      return
    }
    setBusy('ai-document-review')
    try {
      const result = await api<AiDocumentQualityReview>(
        `/api/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branch)}/documents/${encodeURIComponent(currentDocument.id)}/ai-review`,
        {
          method: 'POST',
          body: JSON.stringify({ document_id: currentDocument.id }),
          identity,
          role,
        }
      )
      setAiDocumentReview(result)
      toast.success('AI document quality score completed')
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  async function askAssistant() {
    if (!projectId || !branch) return
    const question = assistantQuestion.trim()
    if (!question) {
      toast.error('请输入问题')
      return
    }
    const nextMessages: AiChatMessage[] = [
      ...assistantMessages,
      { role: 'user', content: question },
    ]
    setAssistantMessages(nextMessages)
    setAssistantQuestion('')
    setBusy('ai-chat')
    try {
      const result = await api<AiChatResponse>(
        `/api/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branch)}/ai/chat`,
        {
          method: 'POST',
          body: JSON.stringify({ question, history: assistantMessages }),
          identity,
          role,
        }
      )
      setAssistantMessages([
        ...nextMessages,
        {
          role: 'assistant',
          content: result.answer,
          retrieval: result.retrieval,
        },
      ])
    } catch (error) {
      setAssistantMessages(assistantMessages)
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  async function parseMdkContent(
    nextContent = mdkContent,
    nextFilename = mdkFilename,
    nextTool = mdkTool
  ) {
    if (!nextContent.trim()) {
      toast.error('请先上传或粘贴外部工具模型内容')
      return
    }
    setBusy('mdk-parse')
    try {
      const content =
        nextTool === 'json' ? parseJson<Record<string, unknown>>(nextContent, '模型 JSON', {}) : nextContent
      const payload = await api<MdkParseResponse>('/api/mdk/parse', {
        method: 'POST',
        body: JSON.stringify({
          filename: nextFilename.trim(),
          tool: nextTool,
          content,
        }),
        identity,
        role,
      })
      setMdkParseResult(payload)
      setMdkImportJob(null)
      toast.success(`解析完成：${payload.parsed_model.element_count} 个元素`)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  async function createMdkImportJob() {
    if (!projectId || !branch) return
    if (!mdkContent.trim()) {
      toast.error('请先上传或粘贴外部工具模型内容')
      return
    }
    setBusy('mdk-job')
    try {
      const content =
        mdkTool === 'json' ? parseJson<Record<string, unknown>>(mdkContent, '模型 JSON', {}) : mdkContent
      const payload = await api<{ job: MdkImportJob }>('/api/mdk/import-jobs', {
        method: 'POST',
        body: JSON.stringify({
          project: projectId,
          branch,
          filename: mdkFilename.trim(),
          tool: mdkTool,
          content,
        }),
        identity,
        role,
      })
      setMdkImportJob(payload.job)
      setMdkParseResult({
        parsed_model: payload.job.parsed_model,
        mapping_report: payload.job.mapping_report,
      })
      toast.success(`导入任务已创建：${payload.job.id}`)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  async function applyMdkImportJob() {
    if (!projectId || !branch || !mdkImportJob) return
    setBusy('mdk-apply')
    try {
      const importedElementIds = mdkImportJob.parsed_model.elements.map((element) => element.id)
      const payload = await api<{
        job: MdkImportJob
        result: { imported: number; mapping_report?: MappingReport }
      }>(
        `/api/mdk/import-jobs/${encodeURIComponent(mdkImportJob.id)}/apply`,
        {
          method: 'POST',
          body: JSON.stringify({
            project: projectId,
            branch,
            commit: mdkCommit,
            message: mdkMessage,
          }),
          identity,
          role,
        }
      )
      setMdkImportJob(payload.job)
      setTypeFilter('all')
      setQuery('')
      await loadModelSnapshot({
        preferredElementIds: importedElementIds,
        ignoreFilters: true,
      })
      if (mdkCommit) await loadProjectBranches()
      selectTab('model')
      toast.success(`已应用导入任务，导入 ${payload.result.imported} 个元素`)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  function downloadCurrent(format: 'html' | 'markdown' | 'pdf' | 'docx') {
    if (!currentDocument) {
      toast.error('请先生成或打开一个文档')
      return
    }
    if (format === 'markdown') {
      downloadText(
        `${currentDocument.id}.md`,
        currentDocument.markdown || '',
        'text/markdown'
      )
      return
    }
    if (format === 'pdf') {
      if (!currentDocument.pdf_base64) {
        toast.error('当前文档没有 PDF 内容')
        return
      }
      downloadBase64(
        `${currentDocument.id}.pdf`,
        currentDocument.pdf_base64,
        'application/pdf'
      )
      return
    }
    if (format === 'docx') {
      if (!currentDocument.docx_base64) {
        toast.error('当前文档没有 Word 内容，请重新生成文档')
        return
      }
      downloadBase64(
        currentDocument.docx_filename || `${currentDocument.id}.docx`,
        currentDocument.docx_base64,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
      return
    }
    downloadText(
      `${currentDocument.id}.html`,
      currentDocument.html || '',
      'text/html'
    )
  }

  return (
    <>
      <Header fixed className='border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70'>
        <div className='me-auto min-w-0'>
          <h1 className='truncate text-base font-semibold'>
            {headerDetail?.title}
          </h1>
          <p className='mt-0.5 hidden text-xs text-muted-foreground sm:block'>
            {headerDetail?.description}
          </p>
        </div>
        <IdentityDialog
          identity={identity}
          role={role}
          loginForm={loginForm}
          setLoginForm={setLoginForm}
          onLogin={handleLogin}
          onLogout={handleLogout}
          busy={busy}
        />
        <ThemeSwitch />
        <ConfigDrawer />
      </Header>

      <Main fluid className='sysml-workbench min-h-[calc(100svh-4rem)] pb-8'>
        {loading ? (
          <div className='flex min-h-[520px] items-center justify-center'>
            <div className='flex items-center gap-3 text-sm text-muted-foreground'>
              <Loader2 className='size-4 animate-spin' />
              Loading SysML workbench
            </div>
          </div>
        ) : (
          <div className='sysml-shell space-y-5'>
            {activeTab === 'overview' ? (
              <section className='pt-2'>
                <div className='sysml-hero overflow-hidden rounded-[2rem] p-0'>
                <div className='grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center lg:p-6'>
                  <div className='min-w-0'>
                    <div className='sysml-eyebrow mb-3 text-xs font-semibold uppercase'>
                      Document Automation System
                    </div>
                    <div className='space-y-3'>
                      <h1 className='max-w-4xl text-3xl font-semibold tracking-tight md:text-4xl'>
                        文档自动生成系统
                      </h1>
                      <div className='flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
                        <Badge variant='outline' className='rounded-full bg-background/70'>
                          {projects.length} projects
                        </Badge>
                        <Badge variant='secondary' className='rounded-full'>
                          {projectTotals.elements} elements
                        </Badge>
                        <span className='hidden sm:inline'>
                          看全局状态和风险，具体操作进入工作区。
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className='rounded-3xl bg-background/70 p-3 shadow-sm ring-1 ring-border/40'>
                      <div className='space-y-3 p-2'>
                        <div className='text-xs font-medium uppercase text-muted-foreground'>
                          当前项目
                        </div>
                        <div className='truncate text-lg font-semibold'>
                          {project?.name || '尚未选择项目'}
                        </div>
                        <div className='grid grid-cols-3 gap-2'>
                          <HeroMiniMetric label='分支' value={projectTotals.branches} />
                          <HeroMiniMetric label='视图' value={projectTotals.views} />
                          <HeroMiniMetric label='文档' value={projectTotals.documents} />
                        </div>
                      </div>
                  </div>
                </div>
                </div>
              </section>
            ) : null}

            <Tabs
              value={activeTab}
              onValueChange={(value) => selectTab(value as WorkbenchTab)}
              className='space-y-4'
            >
              <div className='sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-xl py-2 backdrop-blur'>
                <TabsList className='sysml-tabs h-11 p-1'>
                  {primaryWorkbenchNav.map((item) => {
                    const Icon = item.icon
                    return (
                      <TabsTrigger key={item.value} value={item.value}>
                        <Icon className='size-4' />
                        {item.label}
                      </TabsTrigger>
                    )
                  })}
                </TabsList>
              </div>

              {activeTab === 'workspace' || moduleWorkbenchTabs.has(activeTab) ? (
                <ProjectContextBar
                  activeTab={activeTab}
                  project={project || null}
                  branch={branch}
                  branches={branches}
                  onSelectBranch={setBranch}
                  onBackToWorkspace={() => selectTab('workspace')}
                  onOpenProjects={() => selectTab('projects')}
                />
              ) : null}

              <TabsContent value='overview'>
                <OverviewTab
                  projects={projects}
                  currentProject={project}
                  totals={projectTotals}
                  validation={validation}
                  onSelectProject={openProjectWorkspace}
                  onOpenWorkspace={() => selectTab('workspace')}
                />
              </TabsContent>

              <TabsContent value='workspace'>
                <WorkspaceTab
                  project={project || null}
                  branch={branch}
                  totals={workspaceTotals}
                  validation={validation}
                  currentTab={activeTab}
                  onSelect={selectTab}
                  onOpenProjects={() => selectTab('projects')}
                />
              </TabsContent>

              <TabsContent value='projects'>
                <ProjectsTab
                  projects={projects}
                  currentProjectId={projectId}
                  currentUsername={identity?.username || ''}
                  newProject={newProject}
                  setNewProject={setNewProject}
                  onSelectProject={openProjectWorkspace}
                  onOpenWorkspace={() => selectTab('workspace')}
                  onCreateProject={createProject}
                  onPublishProject={publishProjectToLibrary}
                  onCopyProject={copyProjectToWorkspace}
                  onDeleteProject={deleteProjectFromWorkspace}
                  memberDraftFor={memberDraftFor}
                  onUpdateMemberDraft={updateMemberDraft}
                  onSaveMembers={saveProjectMembers}
                  busy={busy}
                />
              </TabsContent>

              <TabsContent value='model'>
                <ModelTab
                  elements={elements}
                  selectedId={selectedId}
                  setSelectedId={setSelectedId}
                  typeFilter={typeFilter}
                  setTypeFilter={setTypeFilter}
                  query={query}
                  setQuery={setQuery}
                  types={types}
                  form={form}
                  updateForm={updateForm}
                  handleTypeChange={handleTypeChange}
                  attributesText={attributesText}
                  setAttributesText={setAttributesText}
                  relationsText={relationsText}
                  setRelationsText={setRelationsText}
                  validation={validation}
                  aiClosureSuggestions={aiClosureSuggestions}
                  aiValidationFixReview={aiValidationFixReview}
                  aiValidationFixApplyResult={aiValidationFixApplyResult}
                  onNew={() => startNewElement(types[0] || 'Requirement')}
                  onDelete={deleteElement}
                  onSave={saveElement}
                  onAddRelation={addRelation}
                  onAiClosureSuggestions={runAiClosureSuggestions}
                  onAiValidationFixReview={runAiValidationFixReview}
                  onApplyAiValidationFixes={applyAiValidationFixes}
                  busy={busy}
                />
              </TabsContent>

              <TabsContent value='views'>
                <ViewsTab
                  views={views.length ? views : viewElements}
                  viewpoints={viewpointElements}
                  selectedId={selectedId}
                  setSelectedId={setSelectedId}
                  bindableElements={allElements}
                  form={form}
                  attributesText={attributesText}
                  onNewView={() => startNewElement('View')}
                  onNewViewpoint={() => startNewElement('Viewpoint')}
                  onToggleViewElement={toggleViewElement}
                  onSetIncludedElements={setViewIncludedElements}
                  onUpdateViewAttributes={updateViewAttributes}
                  onUpdateViewQuery={updateViewQuery}
                  onSaveCurrent={saveCurrentElement}
                  onDeleteCurrent={deleteElement}
                  validation={validation}
                  aiValidationFixReview={aiValidationFixReview}
                  aiValidationFixApplyResult={aiValidationFixApplyResult}
                  busy={busy}
                  onAiValidationFixReview={runAiValidationFixReview}
                  onApplyAiValidationFixes={applyAiValidationFixes}
                />
              </TabsContent>

              <TabsContent value='diagram'>
                <DiagramTab
                  diagram={diagram}
                  diagramType={diagramType}
                  setDiagramType={setDiagramType}
                  views={views.length ? views : viewElements}
                  selectedViewId={selectedViewId}
                  setSelectedViewId={setSelectedViewId}
                  viewScope={viewScope}
                  metamodel={metamodel}
                  elements={allElements.length ? allElements : elements}
                  selectedId={selectedId}
                  setSelectedId={setSelectedId}
                  onRefresh={loadDiagram}
                  onSaveElement={updateDiagramElement}
                  diagramPositions={diagramPositions}
                  onDiagramPositionsChange={handleDiagramPositionsChange}
                  busy={busy}
                />
              </TabsContent>

              <TabsContent value='trace'>
                <TraceTab
                  traceability={traceability}
                  busy={busy}
                  onRefresh={loadTraceability}
                />
              </TabsContent>

              <TabsContent value='version'>
                <VersionTab
                  currentBranch={branch}
                  elements={elements}
                  validation={validation}
                  branches={branches}
                  commits={commits}
                  auditEvents={auditEvents}
                  diff={diff}
                  aiImpact={aiVersionImpact}
                  diffFrom={diffFrom}
                  setDiffFrom={setDiffFrom}
                  diffTo={diffTo}
                  setDiffTo={setDiffTo}
                  rollbackCommit={rollbackCommit}
                  setRollbackCommit={setRollbackCommit}
                  newBranch={newBranch}
                  setNewBranch={setNewBranch}
                  mergeSource={mergeSource}
                  setMergeSource={setMergeSource}
                  forceMerge={forceMerge}
                  setForceMerge={setForceMerge}
                  onRefresh={loadVersionData}
                  onExport={exportModel}
                  onCommit={commitBranch}
                  onDiff={runDiff}
                  onAiImpact={runAiVersionImpact}
                  onRollback={rollback}
                  onCreateBranch={createBranch}
                  onDeleteCommit={deleteCommit}
                  onMerge={mergeBranch}
                  busy={busy}
                />
              </TabsContent>

              <TabsContent value='docgen'>
                <DocgenTab
                  template={template}
                  setTemplate={setTemplate}
                  elements={elements}
                  views={views.length ? views : viewElements}
                  docViewId={docViewId}
                  setDocViewId={setDocViewId}
                  validation={validation}
                  documents={documents}
                  currentDocument={currentDocument}
                  aiDocumentReview={aiDocumentReview}
                  onReset={() => setTemplate(defaultTemplate)}
                  onGenerate={generateDocument}
                  onAiDraft={generateAiDocgenDraft}
                  onAiDocumentReview={runAiDocumentReview}
                  onOpen={openDocument}
                  onDownload={downloadCurrent}
                  busy={busy}
                />
              </TabsContent>

              <TabsContent value='mdk'>
                <MdkTab
                  adapters={mdkAdapters}
                  tool={mdkTool}
                  setTool={setMdkTool}
                  filename={mdkFilename}
                  setFilename={setMdkFilename}
                  content={mdkContent}
                  setContent={setMdkContent}
                  parseResult={mdkParseResult}
                  importJob={mdkImportJob}
                  commit={mdkCommit}
                  setCommit={setMdkCommit}
                  message={mdkMessage}
                  setMessage={setMdkMessage}
                  onRefreshAdapters={loadMdkAdapters}
                  onParse={parseMdkContent}
                  onCreateJob={createMdkImportJob}
                  onApplyJob={applyMdkImportJob}
                  busy={busy}
                />
              </TabsContent>
              <TabsContent value='assistant'>
                <AssistantTab
                  messages={assistantMessages}
                  question={assistantQuestion}
                  setQuestion={setAssistantQuestion}
                  onAsk={askAssistant}
                  busy={busy}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </Main>
    </>
  )
}

type ModelTabProps = {
  elements: SysmlElement[]
  selectedId: string
  setSelectedId: (id: string) => void
  typeFilter: string
  setTypeFilter: (type: string) => void
  query: string
  setQuery: (query: string) => void
  types: string[]
  form: SysmlElement
  updateForm: <K extends keyof SysmlElement>(
    key: K,
    value: SysmlElement[K]
  ) => void
  handleTypeChange: (type: string) => void
  attributesText: string
  setAttributesText: (value: string) => void
  relationsText: string
  setRelationsText: (value: string) => void
  validation: ValidationPayload | null
  aiClosureSuggestions: AiClosureSuggestionResponse | null
  aiValidationFixReview: AiValidationFixReview | null
  aiValidationFixApplyResult: AiValidationFixApplyResult | null
  onNew: () => void
  onDelete: () => void
  onSave: (event: FormEvent) => void
  onAddRelation: () => void
  onAiClosureSuggestions: () => void
  onAiValidationFixReview: () => void
  onApplyAiValidationFixes: () => void
  busy: string
}

function WorkspaceTab({
  project,
  branch,
  totals,
  validation,
  currentTab,
  onSelect,
  onOpenProjects,
}: {
  project: Project | null
  branch: string
  totals: {
    projects: number
    branches: number
    elements: number
    views: number
    documents: number
    commits: number
  }
  validation: ValidationPayload | null
  currentTab: WorkbenchTab
  onSelect: (tab: WorkbenchTab) => void
  onOpenProjects: () => void
}) {
  const issueCount =
    (validation?.summary.errors || 0) + (validation?.summary.warnings || 0)

  return (
    <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]'>
      <section className='sysml-card space-y-5 p-5'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
          <div>
            <p className='text-xs font-semibold uppercase tracking-wide text-primary'>
              文档工作区
            </p>
            <h2 className='text-2xl font-semibold'>选择你要进入的工作区</h2>
            <p className='mt-1 text-sm text-muted-foreground'>
              这里是具体操作大厅：项目、模型、视图、图谱、追踪、版本、文档和工具都从这里进入。
            </p>
          </div>
          <Badge variant='secondary' className='w-fit rounded-full'>
            {project?.name || '未选择项目'} / {branch || 'main'}
          </Badge>
        </div>

        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
          {secondaryWorkbenchNav.map((item) => {
            const Icon = item.icon
            const selected = currentTab === item.value

            return (
              <button
                key={item.value}
                type='button'
                onClick={() => onSelect(item.value)}
                className={cn(
                  'group rounded-3xl bg-muted/35 p-4 text-left transition-all hover:-translate-y-0.5 hover:bg-muted/60 hover:shadow-sm',
                  selected && 'bg-primary text-primary-foreground shadow-sm'
                )}
              >
                <div className='flex items-start justify-between gap-3'>
                  <span
                    className={cn(
                      'flex size-11 items-center justify-center rounded-2xl bg-background text-muted-foreground shadow-sm',
                      selected && 'bg-primary-foreground/15 text-primary-foreground'
                    )}
                  >
                    <Icon className='size-5' />
                  </span>
                  {selected ? (
                    <Badge variant='secondary' className='rounded-full'>
                      当前
                    </Badge>
                  ) : null}
                </div>
                <div className='mt-4 text-base font-semibold'>{item.label}</div>
                <p
                  className={cn(
                    'mt-1 line-clamp-2 text-sm text-muted-foreground',
                    selected && 'text-primary-foreground/75'
                  )}
                >
                  {workspaceNavDetails[item.value]}
                </p>
                <div
                  className={cn(
                    'mt-4 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100',
                    selected && 'text-primary-foreground opacity-100'
                  )}
                >
                  进入工作区
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <aside className='space-y-4'>
        <section className='sysml-card p-5'>
          <p className='text-xs font-medium uppercase text-muted-foreground'>
            当前上下文
          </p>
          <h3 className='mt-2 text-lg font-semibold'>
            {project?.name || '暂无项目'}
          </h3>
          <p className='mt-1 text-sm text-muted-foreground'>
            {project?.organization || '选择或创建项目后，模型、视图、文档和版本都会按项目隔离。'}
          </p>
          <div className='mt-4 grid grid-cols-2 gap-2 text-sm'>
            <WorkspaceMetric label='元素' value={totals.elements} />
            <WorkspaceMetric label='视图' value={totals.views} />
            <WorkspaceMetric label='文档' value={totals.documents} />
            <WorkspaceMetric label='问题' value={issueCount} />
          </div>
        </section>

        <section className='sysml-card p-5'>
          <div className='flex items-start gap-3'>
            <div className='flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary'>
              <Share2 className='size-5' />
            </div>
            <div className='min-w-0'>
              <p className='text-sm font-semibold'>共享协作</p>
              <p className='mt-1 text-sm text-muted-foreground'>
                通过项目成员决定谁能共同编辑；owner / editor 可写，viewer 只读。
              </p>
            </div>
          </div>
          <div className='mt-4 flex flex-wrap gap-2'>
            <Button size='sm' onClick={onOpenProjects}>
              <Boxes className='size-4' />
              项目管理
            </Button>
            <Button size='sm' variant='outline' onClick={onOpenProjects}>
              <Copy className='size-4' />
              共享库
            </Button>
          </div>
        </section>

        <section className='rounded-3xl bg-muted/35 p-5'>
          <p className='text-sm font-semibold'>建议下一步</p>
          <div className='mt-3 space-y-3 text-sm text-muted-foreground'>
            <p>如果是新项目，先进入“模型”创建基础元素，或进入“外部导入”上传已有模型。</p>
            <p>如果要给别人看结果，先进入“视图”圈定范围，再到“文档”生成输出。</p>
            <p>如果需要保留可追溯版本，进入“版本”提交当前状态。</p>
          </div>
        </section>
      </aside>
    </div>
  )
}

function WorkspaceMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className='rounded-2xl bg-background/75 p-3'>
      <div className='text-lg font-semibold'>{value}</div>
      <div className='text-xs text-muted-foreground'>{label}</div>
    </div>
  )
}

function HeroMiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className='rounded-2xl bg-muted/35 px-3 py-2'>
      <div className='text-lg font-semibold'>{value}</div>
      <div className='text-xs text-muted-foreground'>{label}</div>
    </div>
  )
}

function ProjectContextBar({
  activeTab,
  project,
  branch,
  branches,
  onSelectBranch,
  onBackToWorkspace,
  onOpenProjects,
}: {
  activeTab: WorkbenchTab
  project: Project | null
  branch: string
  branches: Branch[]
  onSelectBranch: (branch: string) => void
  onBackToWorkspace: () => void
  onOpenProjects: () => void
}) {
  const activeModule = secondaryWorkbenchNav.find((item) => item.value === activeTab)
  const Icon = activeModule?.icon || Boxes
  const isModulePage = moduleWorkbenchTabs.has(activeTab)
  const branchOptions = branches.length
    ? branches
    : [{ name: branch || 'main', head: '', elements: 0, documents: 0 }]
  const selectedBranch = branch || branchOptions[0]?.name || 'main'

  return (
    <div className='flex flex-col gap-3 rounded-3xl bg-muted/25 p-3 sm:flex-row sm:items-center sm:justify-between'>
      <div className='min-w-0'>
        <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
          <button
            type='button'
            className='font-medium text-foreground transition-colors hover:text-primary'
            onClick={onBackToWorkspace}
          >
            工作区
          </button>
          {isModulePage ? (
            <>
              <span>/</span>
              <span className='inline-flex items-center gap-1 font-medium text-foreground'>
                <Icon className='size-3.5' />
                {activeModule?.label}
              </span>
            </>
          ) : null}
        </div>
        <div className='mt-1 truncate text-sm font-semibold'>
          {project?.name || '尚未选择项目'}
        </div>
        <p className='truncate text-xs text-muted-foreground'>
          {project?.organization || '项目上下文'} / branch {branch || 'main'}
        </p>
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        {isModulePage ? (
          <Button
            variant='outline'
            size='sm'
            className='rounded-xl bg-background'
            onClick={onBackToWorkspace}
          >
            <LogIn className='size-4 rotate-180' />
            返回工作区
          </Button>
        ) : null}
        <Button
          variant='outline'
          size='sm'
          className='rounded-xl bg-background'
          onClick={onOpenProjects}
        >
          <Share2 className='size-4' />
          共享协作
        </Button>
        <Select value={selectedBranch} onValueChange={onSelectBranch}>
          <SelectTrigger className='h-9 w-[150px] rounded-xl bg-background'>
            <SelectValue placeholder='main' />
          </SelectTrigger>
          <SelectContent>
            {branchOptions.map((item) => (
              <SelectItem key={item.name} value={item.name}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function IdentityDialog({
  identity,
  role,
  loginForm,
  setLoginForm,
  onLogin,
  onLogout,
  busy,
}: {
  identity: Identity | null
  role: Identity['role']
  loginForm: { username: string; password: string }
  setLoginForm: React.Dispatch<
    React.SetStateAction<{ username: string; password: string }>
  >
  onLogin: () => void
  onLogout: () => void
  busy: string
}) {
  const signedName = identity?.display || identity?.username || 'Guest'
  const signedRole = identity?.role || role

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant='outline' className='gap-2'>
          <UserCircle className='size-4' />
          <span className='hidden sm:inline'>{signedName}</span>
          <Badge variant='secondary' className='rounded-sm'>
            {signedRole}
          </Badge>
        </Button>
      </DialogTrigger>
      <DialogContent className='gap-5 overflow-hidden rounded-2xl border-slate-200 p-0 shadow-[0_24px_70px_rgba(15,23,42,0.18)] sm:max-w-[560px]'>
        <DialogHeader className='border-b bg-slate-50/80 px-6 py-5 pr-12'>
          <DialogTitle className='text-xl tracking-tight'>账号与权限</DialogTitle>
          <DialogDescription className='leading-6'>
            登录身份会影响模型写入、提交、回滚和分支合并权限。
          </DialogDescription>
        </DialogHeader>
        <div className='px-6'>
          <div className='rounded-2xl border bg-white p-4 shadow-sm'>
            <div className='flex items-center gap-4'>
              <div className='flex size-14 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-base font-semibold text-white shadow-sm'>
              {(identity?.username || 'SD').slice(0, 2).toUpperCase()}
              </div>
              <div className='min-w-0 flex-1'>
                <div className='flex flex-wrap items-center gap-2'>
                  <div className='truncate text-lg font-semibold'>{signedName}</div>
                  <Badge variant='secondary' className='rounded-md'>
                    {signedRole}
                  </Badge>
                </div>
                <div className='mt-1 text-sm text-muted-foreground'>
                  {identity?.username || 'Guest'}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className='grid gap-4 px-6 sm:grid-cols-2'>
          <Field label='用户名'>
            <Input
              className='h-11 rounded-xl bg-slate-50/80 px-4 shadow-none'
              value={loginForm.username}
              onChange={(event) =>
                setLoginForm((current) => ({
                  ...current,
                  username: event.target.value,
                }))
              }
            />
          </Field>
          <Field label='密码'>
            <Input
              type='password'
              className='h-11 rounded-xl bg-slate-50/80 px-4 shadow-none'
              value={loginForm.password}
              onChange={(event) =>
                setLoginForm((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
            />
          </Field>
        </div>
        <div className='flex flex-wrap justify-end gap-2 border-t bg-slate-50/60 px-6 py-4'>
          <Button variant='outline' className='h-11 rounded-xl' onClick={onLogout}>
            <LogOut className='size-4' />
            退出登录
          </Button>
          <Button
            className='h-11 rounded-xl bg-slate-950 hover:bg-slate-800'
            onClick={onLogin}
            disabled={busy === 'login'}
          >
            {busy === 'login' ? (
              <Loader2 className='size-4 animate-spin' />
            ) : (
              <LogIn className='size-4' />
            )}
            登录
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ModelTab(props: ModelTabProps) {
  const typeCounts = countBy(props.elements, (item) => item.type)
  const selectedRelations = parseJsonSafe<Relation[]>(
    props.relationsText,
    props.form.relations || []
  )
  const selectedAttributes = parseJsonSafe<Record<string, unknown>>(
    props.attributesText,
    props.form.attributes || {}
  )
  const selectedIssues =
    props.validation?.issues.filter(
      (issue) => issue.element_id === props.form.id
    ) || []
  const relationTargetById = new Map(
    props.elements.map((element) => [element.id, element])
  )
  const relationSummary = props.elements.reduce(
    (total, element) => total + (element.relations?.length || 0),
    0
  )
  const typeFilters = Object.entries(typeCounts)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 6)
  const issueCount =
    (props.validation?.summary.errors || 0) +
    (props.validation?.summary.warnings || 0)
  const requirementCount = typeCounts.Requirement || 0
  const blockCount = typeCounts.Block || 0

  return (
    <div className='grid gap-4 2xl:grid-cols-[340px_minmax(0,1fr)]'>
      <Card className='self-start overflow-hidden border-0 bg-muted/25 shadow-none'>
        <CardHeader className='space-y-5 pb-3'>
          <div className='flex items-center justify-between gap-3'>
            <div className='min-w-0'>
              <CardTitle>模型元素</CardTitle>
              <CardDescription>浏览当前项目的 SysML 对象</CardDescription>
            </div>
            <Button size='sm' className='rounded-full shadow-sm' onClick={props.onNew}>
              <Plus className='size-4' />
              新建
            </Button>
          </div>
          <div className='rounded-2xl bg-background/80 p-3 shadow-sm shadow-slate-950/5'>
            <div className='relative'>
              <Search className='absolute left-3 top-2.5 size-4 text-muted-foreground' />
              <Input
                className='h-10 border-0 bg-muted/60 pl-9 shadow-none focus-visible:ring-1'
                placeholder='搜索 ID、名称或描述'
                value={props.query}
                onChange={(event) => props.setQuery(event.target.value)}
              />
            </div>
            <div className='mt-3 flex flex-wrap gap-2'>
              <button
                type='button'
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  props.typeFilter === 'all'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                )}
                onClick={() => props.setTypeFilter('all')}
              >
                全部
              </button>
              {(typeFilters.length
                ? typeFilters
                : props.types.slice(0, 5).map((type) => [type, 0] as [string, number])
              ).map(([type, count]) => (
                <button
                  key={type}
                  type='button'
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    props.typeFilter === type
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                  )}
                  onClick={() => props.setTypeFilter(type)}
                >
                  {labelType(type)}
                  {count ? ` ${count}` : ''}
                </button>
              ))}
              {props.typeFilter !== 'all' || props.query ? (
                <button
                  type='button'
                  className='rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
                  onClick={() => {
                    props.setTypeFilter('all')
                    props.setQuery('')
                  }}
                >
                  清除筛选
                </button>
              ) : null}
            </div>
          </div>
          <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'>
            <span>
              <strong className='font-semibold text-foreground'>
                {props.elements.length}
              </strong>{' '}
              个元素
            </span>
            <span className='h-1 w-1 rounded-full bg-muted-foreground/40' />
            <span>
              <strong className='font-semibold text-foreground'>
                {Object.keys(typeCounts).length}
              </strong>{' '}
              种类型
            </span>
            <span className='h-1 w-1 rounded-full bg-muted-foreground/40' />
            <span
              className={cn(
                issueCount && props.validation?.summary.errors
                  ? 'text-destructive'
                  : ''
              )}
            >
              <strong className='font-semibold text-current'>{issueCount}</strong>{' '}
              个问题
            </span>
          </div>
          {props.elements.length ? null : (
            <div className='rounded-2xl bg-gradient-to-br from-sky-50 to-background p-4 text-sm dark:from-sky-950/30'>
              <div className='font-semibold'>从这里开始建模</div>
              <p className='mt-1 text-xs text-muted-foreground'>
                新建需求或结构块，也可以从 MDK / JSON / XMI 导入已有模型。
              </p>
              <div className='mt-3 flex flex-wrap gap-2'>
                <Button size='sm' variant='secondary' onClick={props.onNew}>
                  新建元素
                </Button>
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={() => toast.info('请切换到 MDK 页导入外部模型')}
                >
                  去导入
                  <ArrowRight className='size-4' />
                </Button>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className='p-0'>
          <ScrollArea className='h-[620px]'>
            {props.elements.length ? (
              <div className='space-y-1 p-2'>
                {props.elements.map((element) => (
                  <button
                    key={element.id}
                    className={cn(
                      'group relative w-full rounded-xl p-3 text-left transition-colors hover:bg-background/80',
                      props.selectedId === element.id &&
                        'bg-background shadow-sm shadow-slate-950/5'
                    )}
                    type='button'
                    onClick={() => props.setSelectedId(element.id)}
                  >
                    <span
                      className={cn(
                        'absolute left-0 top-3 h-10 w-1 rounded-full bg-transparent transition-colors',
                        props.selectedId === element.id && 'bg-primary'
                      )}
                    />
                    <div className='min-w-0'>
                      <div className='truncate pr-2 text-sm font-semibold'>
                        {element.name || '未命名元素'}
                      </div>
                      <div className='mt-1 flex min-w-0 flex-wrap items-center gap-1.5'>
                        <span className='min-w-0 truncate font-mono text-[11px] text-muted-foreground'>
                          {element.id || 'NEW-ELEMENT'}
                        </span>
                        <TypeBadge type={element.type} compact />
                      </div>
                    </div>
                    <p className='mt-2 line-clamp-2 text-xs text-muted-foreground'>
                      {element.description || '暂无描述'}
                    </p>
                    <div className='mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground'>
                      <span className='rounded-full bg-muted/70 px-2 py-1'>
                        {element.owner || '未分配'}
                      </span>
                      <span className='rounded-full bg-muted/70 px-2 py-1'>
                        {element.relations?.length || 0} relations
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className='px-4 pb-6 pt-8'>
                <EmptyState
                  title='当前没有可显示元素'
                  description='调整筛选条件，或使用上方入口新建/导入模型元素。'
                />
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <div className='space-y-4'>
        <div className='grid gap-2 sm:grid-cols-4'>
          <LocalMetric label='元素' value={props.elements.length} />
          <LocalMetric label='需求' value={requirementCount} />
          <LocalMetric label='结构块' value={blockCount} />
          <LocalMetric
            label='校验'
            value={issueCount}
            tone={props.validation?.summary.errors ? 'danger' : issueCount ? 'warning' : 'success'}
          />
        </div>

        <Card className='overflow-hidden border-0 bg-background shadow-sm'>
          <CardHeader className='bg-gradient-to-r from-muted/35 via-background to-background'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div className='min-w-0'>
                <div className='mb-2 flex flex-wrap items-center gap-2'>
                  <TypeBadge type={props.form.type} />
                  <Badge variant='outline' className='font-mono'>
                    {props.form.id || '后端生成 ID'}
                  </Badge>
                  {selectedIssues.length ? (
                    <Badge variant='destructive'>{selectedIssues.length} 个问题</Badge>
                  ) : (
                    <Badge variant='secondary'>语义正常</Badge>
                  )}
                </div>
                <CardTitle className='truncate text-2xl'>
                  {props.form.name || '正在编辑一个新模型元素'}
                </CardTitle>
                <CardDescription>
                  编辑普通模型元素；View / Viewpoint 请到 Views 页维护
                </CardDescription>
              </div>
              <div className='flex flex-wrap gap-2'>
                <Button
                  size='sm'
                  form='model-element-form'
                  type='submit'
                  disabled={props.busy === 'save-element'}
                >
                  {props.busy === 'save-element' ? (
                    <Loader2 className='size-4 animate-spin' />
                  ) : (
                    <Save className='size-4' />
                  )}
                  保存元素
                </Button>
                <Button
                  type='button'
                  variant='destructive'
                  size='sm'
                  disabled={!props.form.id || props.busy === 'delete-element'}
                  onClick={props.onDelete}
                >
                  {props.busy === 'delete-element' ? (
                    <Loader2 className='size-4 animate-spin' />
                  ) : (
                    <Trash2 className='size-4' />
                  )}
                  删除元素
                </Button>
                <ModelActionsMenu
                  onAddRelation={props.onAddRelation}
                  attributesText={props.attributesText}
                  relationsText={props.relationsText}
                  setAttributesText={props.setAttributesText}
                  setRelationsText={props.setRelationsText}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className='p-4 md:p-6'>
            <form
              id='model-element-form'
              className='grid gap-5'
              onSubmit={props.onSave}
            >
              <Tabs defaultValue='overview' className='space-y-4'>
                <TabsList className='grid w-full grid-cols-2 rounded-full bg-muted/50 p-1'>
                  <TabsTrigger value='overview'>概览</TabsTrigger>
                  <TabsTrigger value='metadata'>元数据</TabsTrigger>
                </TabsList>

                <TabsContent value='overview' className='mt-0 space-y-4'>
                  <section className='rounded-2xl bg-muted/30 p-5'>
                    <SectionHeading
                      title='核心内容'
                      description='默认只编辑用户最常用的信息，减少一屏内的输入框。'
                    />
                    <div className='mt-4 grid gap-4'>
                      <Field label='名称'>
                        <Input
                          required
                          className='h-11 text-base'
                          value={props.form.name}
                          onChange={(event) =>
                            props.updateForm('name', event.target.value)
                          }
                          placeholder='例如：供电连续性需求'
                        />
                      </Field>
                      <Field label='描述'>
                        <Textarea
                          rows={4}
                          value={props.form.description || ''}
                          onChange={(event) =>
                            props.updateForm('description', event.target.value)
                          }
                          placeholder='描述这个元素的工程含义、边界或约束。'
                        />
                      </Field>
                    </div>
                  </section>

                  <section className='grid gap-3 md:grid-cols-3'>
                    <InlineSelectBlock
                      label='类型'
                      value={labelType(props.form.type)}
                      hint='决定元素模板和图谱样式'
                    >
                      <Select
                        value={props.form.type}
                        onValueChange={props.handleTypeChange}
                      >
                        <SelectTrigger className='mt-3 w-full'>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {props.types.map((type) => (
                            <SelectItem key={type} value={type}>
                              {labelType(type)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </InlineSelectBlock>
                    <MetadataBlock
                      label='ID'
                      value={props.form.id || '保存后生成'}
                      hint='唯一模型标识'
                    />
                    <MetadataBlock
                      label='负责人'
                      value={props.form.owner || '未分配'}
                      hint='归属团队或责任人'
                    />
                  </section>
                </TabsContent>

                <TabsContent value='metadata' className='mt-0 space-y-4'>
                  <section className='rounded-2xl bg-muted/30 p-5'>
                    <SectionHeading
                      title='模型元数据'
                      description='这些字段通常不需要频繁修改，放在单独页签里保持主界面清爽。'
                    />
                    <div className='mt-4 grid gap-4 md:grid-cols-2'>
                      <Field label='ID'>
                        <Input
                          value={props.form.id}
                          onChange={(event) =>
                            props.updateForm('id', event.target.value)
                          }
                          placeholder='留空可由后端生成'
                        />
                      </Field>
                      <Field label='负责人'>
                        <Input
                          value={props.form.owner || ''}
                          onChange={(event) =>
                            props.updateForm('owner', event.target.value)
                          }
                          placeholder='例如：总体设计组'
                        />
                      </Field>
                      <Field label='构造型'>
                        <Input
                          value={props.form.stereotype || ''}
                          onChange={(event) =>
                            props.updateForm('stereotype', event.target.value)
                          }
                          placeholder='例如：requirement / block'
                        />
                      </Field>
                    </div>
                  </section>
                </TabsContent>

              </Tabs>
            </form>
          </CardContent>
        </Card>

        <ValidationPanel
          validation={props.validation}
          aiFixReview={props.aiValidationFixReview}
          applyResult={props.aiValidationFixApplyResult}
          busy={props.busy}
          onAiFix={props.onAiValidationFixReview}
          onApplyFixes={props.onApplyAiValidationFixes}
        />
        <ClosureSuggestionsPanel
          closureSuggestions={props.aiClosureSuggestions}
          busy={props.busy}
          onClosureSuggestions={props.onAiClosureSuggestions}
        />

        <ElementContextPanel
          selectedRelations={selectedRelations}
          selectedAttributes={selectedAttributes}
          selectedIssues={selectedIssues}
          relationSummary={relationSummary}
          relationTargetById={relationTargetById}
        />
      </div>
    </div>
  )
}

function ElementContextPanel({
  selectedRelations,
  selectedAttributes,
  selectedIssues,
  relationSummary,
  relationTargetById,
}: {
  selectedRelations: Relation[]
  selectedAttributes: Record<string, unknown>
  selectedIssues: ValidationPayload['issues']
  relationSummary: number
  relationTargetById: Map<string, SysmlElement>
}) {
  return (
    <Collapsible>
      <Card className='border-0 bg-muted/25 shadow-none'>
        <CollapsibleTrigger asChild>
          <button
            type='button'
            className='flex w-full items-center justify-between gap-3 p-4 text-left'
          >
            <div>
              <div className='font-semibold'>元素上下文</div>
              <p className='text-sm text-muted-foreground'>
                {selectedRelations.length} 个当前关系，{Object.keys(selectedAttributes).length} 个属性，
                {selectedIssues.length || 0} 个当前元素问题。
              </p>
            </div>
            <Badge variant='outline'>{relationSummary} total relations</Badge>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className='grid gap-3 p-4 pt-0 lg:grid-cols-3'>
            <div className='rounded-2xl bg-background/70 p-3'>
              <div className='mb-3 text-sm font-semibold'>关系</div>
              {selectedRelations.length ? (
                <div className='divide-y divide-border/50'>
                  {selectedRelations.slice(0, 6).map((relation, index) => {
                    const target = relationTargetById.get(relation.target)
                    return (
                      <div
                        key={`${relation.type}-${relation.target}-${index}`}
                        className='grid gap-1 py-2 text-sm first:pt-0 last:pb-0'
                      >
                        <div className='flex items-center justify-between gap-2'>
                          <Badge variant='secondary'>
                            {labelRelation(relation.type)}
                          </Badge>
                          <span className='font-mono text-xs text-muted-foreground'>
                            {relation.target}
                          </span>
                        </div>
                        <div className='truncate font-medium'>
                          {target?.name || '目标元素未在当前列表中'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className='text-sm text-muted-foreground'>
                  还没有关系。可以点击“添加关系”维护。
                </p>
              )}
            </div>

            <div className='rounded-2xl bg-background/70 p-3'>
              <div className='mb-3 text-sm font-semibold'>属性</div>
              {Object.keys(selectedAttributes).length ? (
                <div className='divide-y divide-border/50 text-xs'>
                  {Object.entries(selectedAttributes)
                    .slice(0, 6)
                    .map(([key, value]) => (
                      <div
                        key={key}
                        className='grid gap-1 py-2 first:pt-0 last:pb-0'
                      >
                        <span className='font-mono font-semibold'>{key}</span>
                        <span className='break-all text-muted-foreground'>
                          {String(value)}
                        </span>
                      </div>
                    ))}
                </div>
              ) : (
                <p className='text-sm text-muted-foreground'>暂无属性。</p>
              )}
            </div>

            <div className='rounded-2xl bg-background/70 p-3'>
              <div className='mb-3 text-sm font-semibold'>当前元素校验</div>
              {selectedIssues.length ? (
                <div className='space-y-2'>
                  {selectedIssues.slice(0, 4).map((issue, index) => (
                    <div
                      key={`${issue.message}-${index}`}
                      className='rounded-xl bg-destructive/10 p-2 text-xs text-destructive'
                    >
                      {issue.message}
                    </div>
                  ))}
                </div>
              ) : (
                <div className='flex items-start gap-2 text-sm text-muted-foreground'>
                  <CheckCircle2 className='mt-0.5 size-4 text-emerald-600' />
                  当前元素未发现校验问题。
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

function LocalMetric({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number
  tone?: 'default' | 'success' | 'warning' | 'danger'
}) {
  const toneClass = {
    default: 'bg-muted/30 text-foreground',
    success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/25 dark:text-emerald-300',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/25 dark:text-amber-300',
    danger: 'bg-destructive/10 text-destructive',
  }[tone]

  return (
    <div className={cn('rounded-2xl px-4 py-3', toneClass)}>
      <div className='text-2xl font-semibold'>{value}</div>
      <div className='text-xs opacity-75'>{label}</div>
    </div>
  )
}

function ModelActionsMenu({
  onAddRelation,
  attributesText,
  relationsText,
  setAttributesText,
  setRelationsText,
}: {
  onAddRelation: () => void
  attributesText: string
  relationsText: string
  setAttributesText: (value: string) => void
  setRelationsText: (value: string) => void
}) {
  const [jsonOpen, setJsonOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='outline' size='sm'>
            <MoreVertical className='size-4' />
            更多
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-52'>
          <DropdownMenuLabel>二级操作</DropdownMenuLabel>
          <DropdownMenuItem onClick={onAddRelation}>
            <Plus className='size-4' />
            添加关系
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault()
              setJsonOpen(true)
            }}
          >
            <Code2 className='size-4' />
            编辑 JSON
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <JsonEditorSheet
        open={jsonOpen}
        onOpenChange={setJsonOpen}
        attributesText={attributesText}
        relationsText={relationsText}
        setAttributesText={setAttributesText}
        setRelationsText={setRelationsText}
      />
    </>
  )
}

function JsonEditorSheet({
  attributesText,
  relationsText,
  setAttributesText,
  setRelationsText,
  trigger,
  open,
  onOpenChange,
}: {
  attributesText: string
  relationsText: string
  setAttributesText: (value: string) => void
  setRelationsText: (value: string) => void
  trigger?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [activeTab, setActiveTab] = useState<'attributes' | 'relations'>(
    'attributes'
  )
  const attributesState = getJsonState<Record<string, unknown>>(
    attributesText,
    {}
  )
  const relationsState = getJsonState<Relation[]>(relationsText, [])
  const activeText = activeTab === 'attributes' ? attributesText : relationsText
  const activeState = activeTab === 'attributes' ? attributesState : relationsState
  const activeSetter =
    activeTab === 'attributes' ? setAttributesText : setRelationsText
  const attributeCount =
    attributesState.valid && attributesState.value
      ? Object.keys(attributesState.value).length
      : 0
  const relationCount =
    relationsState.valid && Array.isArray(relationsState.value)
      ? relationsState.value.length
      : 0

  const formatActiveJson = () => {
    try {
      activeSetter(JSON.stringify(JSON.parse(activeText || '{}'), null, 2))
      toast.success('JSON 已格式化')
    } catch {
      toast.error('JSON 格式不正确，无法格式化')
    }
  }

  const validateActiveJson = () => {
    if (activeState.valid) {
      toast.success('JSON 格式正确')
    } else {
      toast.error(activeState.error || 'JSON 格式不正确')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger ? (
        <SheetTrigger asChild>{trigger}</SheetTrigger>
      ) : open === undefined ? (
        <SheetTrigger asChild>
          <Button variant='outline' size='sm'>
            <Code2 className='size-4' />
            JSON
          </Button>
        </SheetTrigger>
      ) : null}
      <SheetContent className='gap-0 sm:max-w-2xl'>
        <SheetHeader className='border-b bg-muted/20 pr-12'>
          <div className='flex items-start justify-between gap-4'>
            <div>
              <SheetTitle>高级模型数据</SheetTitle>
              <SheetDescription>
                仅用于导入、调试或批量维护属性与关系；日常编辑优先使用概览和元数据。
              </SheetDescription>
            </div>
            <Button size='sm' variant='outline' onClick={formatActiveJson}>
              <Code2 className='size-4' />
              格式化
            </Button>
          </div>
        </SheetHeader>
        <div className='grid grid-cols-3 gap-2 border-b px-4 py-3'>
          <JsonSummaryCard
            label='属性'
            value={attributeCount}
            description='attributes'
            active={activeTab === 'attributes'}
            valid={attributesState.valid}
            onClick={() => setActiveTab('attributes')}
          />
          <JsonSummaryCard
            label='关系'
            value={relationCount}
            description='relations'
            active={activeTab === 'relations'}
            valid={relationsState.valid}
            onClick={() => setActiveTab('relations')}
          />
          <div className='rounded-2xl bg-muted/35 p-3 text-xs'>
            <div className='font-semibold'>状态</div>
            <div
              className={cn(
                'mt-2 font-medium',
                attributesState.valid && relationsState.valid
                  ? 'text-emerald-600'
                  : 'text-destructive'
              )}
            >
              {attributesState.valid && relationsState.valid
                ? 'JSON 格式正常'
                : '存在格式问题'}
            </div>
            <p className='mt-1 text-muted-foreground'>保存元素时一并写入</p>
          </div>
        </div>
        <div className='px-4 pt-4'>
          <Tabs
            value={activeTab}
            onValueChange={(value) =>
              setActiveTab(value as 'attributes' | 'relations')
            }
          >
            <TabsList className='grid w-full grid-cols-2 rounded-full bg-muted/60 p-1'>
              <TabsTrigger value='attributes'>属性 Attributes</TabsTrigger>
              <TabsTrigger value='relations'>关系 Relations</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <ScrollArea className='min-h-0 flex-1 px-4 py-4'>
          <JsonEditorPanel
            title={activeTab === 'attributes' ? '属性 JSON' : '关系 JSON'}
            description={
              activeTab === 'attributes'
                ? '维护当前元素的扩展属性，例如 domain、verification、text。'
                : '维护当前元素指向其他元素的关系，目标元素需要存在于模型中。'
            }
            value={activeText}
            valid={activeState.valid}
            error={activeState.error}
            emptyHint={
              activeTab === 'attributes'
                ? '当前元素没有扩展属性，可以输入 { } 或添加字段。'
                : '当前元素还没有关系，可以输入 [] 或通过“添加关系”创建。'
            }
            onChange={activeSetter}
          />
        </ScrollArea>
        <SheetFooter className='border-t bg-background/95 sm:flex-row sm:justify-between'>
          <div className='text-xs text-muted-foreground'>
            当前正在编辑：
            {activeTab === 'attributes' ? '属性 JSON' : '关系 JSON'}
          </div>
          <div className='flex gap-2'>
            <Button variant='outline' onClick={validateActiveJson}>
              校验 JSON
            </Button>
            <Button variant='outline' onClick={formatActiveJson}>
              格式化
            </Button>
            <SheetClose asChild>
              <Button>完成</Button>
            </SheetClose>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function JsonSummaryCard({
  label,
  value,
  description,
  active,
  valid,
  onClick,
}: {
  label: string
  value: number
  description: string
  active: boolean
  valid: boolean
  onClick: () => void
}) {
  return (
    <button
      type='button'
      className={cn(
        'rounded-2xl p-3 text-left text-xs transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'bg-muted/35 hover:bg-muted'
      )}
      onClick={onClick}
    >
      <div className='flex items-center justify-between gap-2'>
        <span className='font-semibold'>{label}</span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px]',
            active
              ? 'bg-primary-foreground/20'
              : valid
                ? 'bg-emerald-500/10 text-emerald-600'
                : 'bg-destructive/10 text-destructive'
          )}
        >
          {valid ? 'valid' : 'error'}
        </span>
      </div>
      <div className='mt-3 text-2xl font-semibold leading-none'>{value}</div>
      <div
        className={cn(
          'mt-1',
          active ? 'text-primary-foreground/75' : 'text-muted-foreground'
        )}
      >
        {description}
      </div>
    </button>
  )
}

function JsonEditorPanel({
  title,
  description,
  value,
  valid,
  error,
  emptyHint,
  onChange,
}: {
  title: string
  description: string
  value: string
  valid: boolean
  error?: string
  emptyHint: string
  onChange: (value: string) => void
}) {
  return (
    <div className='rounded-2xl bg-muted/25 p-4'>
      <div className='mb-3 flex items-start justify-between gap-4'>
        <div>
          <div className='font-semibold'>{title}</div>
          <p className='text-xs text-muted-foreground'>{description}</p>
        </div>
        <Badge variant={valid ? 'secondary' : 'destructive'}>
          {valid ? '格式正常' : '格式错误'}
        </Badge>
      </div>
      {!value.trim() ? (
        <div className='mb-3 rounded-xl bg-background/70 p-3 text-sm text-muted-foreground'>
          {emptyHint}
        </div>
      ) : null}
      <Textarea
        className={cn(
          'min-h-[460px] resize-none bg-background font-mono text-xs shadow-sm',
          !valid && 'border-destructive focus-visible:ring-destructive'
        )}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {!valid && error ? (
        <p className='mt-2 text-xs text-destructive'>{error}</p>
      ) : null}
    </div>
  )
}

function getJsonState<T>(
  text: string,
  fallback: T
): { valid: true; value: T; error?: never } | { valid: false; value: T; error: string } {
  try {
    return {
      valid: true,
      value: (text.trim() ? JSON.parse(text) : fallback) as T,
    }
  } catch (error) {
    return {
      valid: false,
      value: fallback,
      error: error instanceof Error ? error.message : 'JSON 格式不正确',
    }
  }
}

function SectionHeading({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div>
      <h3 className='text-sm font-semibold'>{title}</h3>
      <p className='text-xs text-muted-foreground'>{description}</p>
    </div>
  )
}

function MetadataBlock({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div className='rounded-2xl bg-muted/35 p-4'>
      <div className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
        {label}
      </div>
      <div className='mt-2 truncate text-sm font-semibold'>{value}</div>
      <p className='mt-1 text-xs text-muted-foreground'>{hint}</p>
    </div>
  )
}

function InlineSelectBlock({
  label,
  value,
  hint,
  children,
}: {
  label: string
  value: string
  hint: string
  children: ReactNode
}) {
  return (
    <div className='rounded-2xl bg-muted/35 p-4'>
      <div className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
        {label}
      </div>
      <div className='mt-2 truncate text-sm font-semibold'>{value}</div>
      <p className='mt-1 text-xs text-muted-foreground'>{hint}</p>
      {children}
    </div>
  )
}

function TypeBadge({ type, compact = false }: { type: string; compact?: boolean }) {
  return (
    <Badge
      variant='outline'
      className={cn(
        'max-w-full shrink truncate',
        compact && 'px-1.5 py-0 text-[10px]',
        typeBadgeClass(type)
      )}
    >
      {labelType(type)}
    </Badge>
  )
}

function typeBadgeClass(type: string) {
  const normalized = type.toLowerCase()
  if (normalized.includes('requirement')) {
    return 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300'
  }
  if (normalized.includes('block')) {
    return 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
  }
  if (normalized.includes('test')) {
    return 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300'
  }
  if (normalized.includes('interface') || normalized.includes('port')) {
    return 'border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-300'
  }
  if (normalized.includes('constraint')) {
    return 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300'
  }
  if (normalized.includes('activity') || normalized.includes('state')) {
    return 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300'
  }
  return 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300'
}

function ValidationPanel({
  validation,
  aiFixReview,
  applyResult,
  busy,
  onAiFix,
  onApplyFixes,
}: {
  validation: ValidationPayload | null
  aiFixReview: AiValidationFixReview | null
  applyResult: AiValidationFixApplyResult | null
  busy: string
  onAiFix: () => void
  onApplyFixes: () => void
}) {
  if (!validation) return null
  const visibleIssues = validation.issues.slice(0, 3)
  const hiddenIssues = validation.issues.slice(3)
  const hasErrors = validation.summary.errors > 0
  const fixing = busy === 'ai-validation-fix'
  const applying = busy === 'ai-validation-apply'

  return (
    <Card className='sysml-card overflow-hidden'>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <CardTitle>语义校验</CardTitle>
            <CardDescription>
              {validation.summary.elements} 个元素，{validation.summary.errors} 个错误，
              {validation.summary.warnings} 个警告
            </CardDescription>
          </div>
          <div className='flex flex-wrap items-center justify-end gap-2'>
            {validation.issues.length ? (
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={onAiFix}
                disabled={fixing}
              >
                {fixing ? (
                  <Loader2 className='size-4 animate-spin' />
                ) : (
                  <Sparkles className='size-4' />
                )}
                AI 修复建议
              </Button>
            ) : null}
            {validation.issues.length ? (
              <Button
                type='button'
                size='sm'
                onClick={onApplyFixes}
                disabled={applying}
              >
                {applying ? (
                  <Loader2 className='size-4 animate-spin' />
                ) : (
                  <Wrench className='size-4' />
                )}
                一键应用
              </Button>
            ) : null}
            <Badge
              variant={validation.summary.errors ? 'destructive' : 'secondary'}
            >
              {validation.summary.errors ? '需处理' : '可发布'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className='space-y-3'>
        {validation.issues.length ? (
          <>
            <div
              className={cn(
                'flex items-center justify-between rounded-2xl p-3 text-sm',
                hasErrors ? 'bg-destructive/10' : 'bg-amber-50 text-amber-950 dark:bg-amber-950/25 dark:text-amber-100'
              )}
            >
              <div className='flex items-center gap-2'>
                <AlertCircle className='size-4' />
                <span className='font-medium'>
                  {hasErrors ? '存在错误，需要优先处理' : '只有警告，可继续发布但建议检查'}
                </span>
              </div>
              {hiddenIssues.length ? (
                <Badge variant='outline'>+{hiddenIssues.length} more</Badge>
              ) : null}
            </div>

            {hiddenIssues.length ? (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant='ghost' size='sm' className='w-full rounded-xl'>
                    查看全部 {validation.issues.length} 条问题
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className='mb-3 max-h-72 overflow-auto rounded-2xl bg-muted/20'>
                    {hiddenIssues.map((issue, index) => (
                      <ValidationIssueRow
                        key={`${issue.element_id}-hidden-${index}`}
                        issue={issue}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ) : null}

            <div className='divide-y rounded-2xl bg-muted/25'>
              {visibleIssues.map((issue, index) => (
                <ValidationIssueRow
                  key={`${issue.element_id}-${index}`}
                  issue={issue}
                />
              ))}
            </div>
          </>
        ) : (
          <div className='flex items-center gap-2 text-sm text-muted-foreground'>
            <CheckCircle2 className='size-4 text-emerald-600' />
            未发现校验问题
          </div>
        )}
        {applying ? (
          <div className='flex items-center gap-2 rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground'>
            <Loader2 className='size-4 animate-spin' />
            正在应用语义修复
          </div>
        ) : applyResult ? (
          <div className='rounded-xl border bg-emerald-50 p-4 text-sm text-emerald-950 dark:bg-emerald-950/25 dark:text-emerald-100'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div className='font-semibold'>语义修复已应用</div>
              <Badge variant='secondary'>{applyResult.applied.length} applied</Badge>
            </div>
            <div className='mt-2 text-xs'>
              修复前：{String(applyResult.before.errors ?? 0)} 错误 / {String(applyResult.before.warnings ?? 0)} 警告；
              修复后：{String(applyResult.after.errors ?? 0)} 错误 / {String(applyResult.after.warnings ?? 0)} 警告
            </div>
            {applyResult.skipped.length ? (
              <div className='mt-2 text-xs'>
                {applyResult.skipped.length} 条未自动处理，建议人工确认。
              </div>
            ) : null}
          </div>
        ) : null}
        {fixing ? (
          <div className='flex items-center gap-2 rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground'>
            <Loader2 className='size-4 animate-spin' />
            正在分析语义问题并生成修复建议
          </div>
        ) : aiFixReview ? (
          <div className='rounded-xl border bg-muted/20 p-4'>
            <div className='mb-3 flex items-center justify-between gap-2'>
              <div className='text-sm font-semibold'>AI 语义校验修复建议</div>
              <Badge variant='secondary'>{aiFixReview.issue_count} issues</Badge>
            </div>
            <MarkdownMessage content={aiFixReview.review} compact />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function ValidationIssueRow({
  issue,
}: {
  issue: ValidationPayload['issues'][number]
}) {
  const destructive = issue.severity === 'error'

  return (
    <div className='flex items-start gap-3 px-3 py-2.5 text-sm'>
      <AlertCircle
        className={cn(
          'mt-0.5 size-4 shrink-0',
          destructive ? 'text-destructive' : 'text-amber-600'
        )}
      />
      <div className='min-w-0'>
        <div className='font-medium'>
          {severityLabels[issue.severity]} / {issue.element_id}
        </div>
        <div className='truncate text-xs text-muted-foreground'>
          {issue.message}
        </div>
      </div>
    </div>
  )
}

function OverviewTab({
  projects,
  currentProject,
  totals,
  validation,
  onSelectProject,
  onOpenWorkspace,
}: {
  projects: Project[]
  currentProject?: Project
  totals: {
    projects: number
    branches: number
    elements: number
    views: number
    documents: number
    commits: number
  }
  validation: ValidationPayload | null
  onSelectProject: (projectId: string) => void
  onOpenWorkspace: () => void
}) {
  const recentProjects = [...projects]
    .sort((left, right) => String(right.updated_at || '').localeCompare(String(left.updated_at || '')))
    .slice(0, 4)
  const validationCount =
    (validation?.summary.errors || 0) + (validation?.summary.warnings || 0)

  return (
    <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]'>
      <Card className='sysml-card overflow-hidden'>
        <CardHeader className='pb-3'>
          <div className='flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
            <div>
              <CardTitle>项目组合</CardTitle>
              <CardDescription>
                最近项目和总体规模。选择项目后，再进入工作区处理具体事项。
              </CardDescription>
            </div>
            <div className='flex flex-wrap gap-2 text-xs'>
              <Badge variant='secondary'>{totals.projects} 项目</Badge>
              <Badge variant='outline'>{totals.elements} 元素</Badge>
              <Badge variant='outline'>{totals.views} 视图</Badge>
              <Badge variant='outline'>{totals.documents} 文档</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {recentProjects.length ? (
            <div className='divide-y divide-border/50'>
              {recentProjects.map((project) => {
                const active = project.id === currentProject?.id
                return (
                  <button
                    key={project.id}
                    type='button'
                    onClick={() => {
                      onSelectProject(project.id)
                      onOpenWorkspace()
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-4 py-4 text-left transition-colors hover:bg-muted/25',
                      active && 'text-primary'
                    )}
                  >
                    <div className='min-w-0'>
                      <div className='flex items-center gap-2'>
                        <span className='truncate font-semibold'>
                          {project.name || project.id}
                        </span>
                        {active ? <Badge>当前</Badge> : null}
                      </div>
                      <p className='mt-1 line-clamp-1 text-sm text-muted-foreground'>
                        {project.description || project.organization || 'No description yet'}
                      </p>
                    </div>
                    <div className='hidden shrink-0 gap-3 text-xs text-muted-foreground sm:flex'>
                      <span>{project.elements || 0} 元素</span>
                      <span>{project.views || 0} 视图</span>
                      <span>{project.documents || 0} 文档</span>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <EmptyState
              title='还没有项目'
              description='进入工作区创建项目，再导入或编辑模型。'
            />
          )}
        </CardContent>
      </Card>

      <Card className='sysml-card self-start'>
        <CardHeader>
          <CardTitle>风险摘要</CardTitle>
          <CardDescription>只保留需要你注意的信号。</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div
            className={cn(
              'rounded-3xl p-4',
              validationCount ? 'bg-amber-50 dark:bg-amber-950/25' : 'bg-emerald-50 dark:bg-emerald-950/25'
            )}
          >
            <div className='flex items-start gap-3'>
              {validationCount ? (
                <AlertCircle className='mt-0.5 size-5 text-amber-600' />
              ) : (
                <CheckCircle2 className='mt-0.5 size-5 text-emerald-600' />
              )}
              <div>
                <div className='font-semibold'>
                  {validationCount ? '存在待检查项' : '当前项目状态良好'}
                </div>
                <p className='mt-1 text-sm text-muted-foreground'>
                  {validationCount
                    ? `${validation?.summary.errors || 0} 个错误，${validation?.summary.warnings || 0} 个警告。`
                    : '未发现错误或警告。'}
                </p>
              </div>
            </div>
          </div>

          <div className='space-y-2 text-sm text-muted-foreground'>
            <p>新项目：进入“项目管理”创建项目，再到工作区选择“外部导入”或“模型”。</p>
            <p>要汇报：进入“视图”圈定范围，再生成“文档”。</p>
            <p>要保留历史：进入“版本”提交当前状态。</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ProjectsTab({
  projects,
  currentProjectId,
  currentUsername,
  newProject,
  setNewProject,
  onSelectProject,
  onOpenWorkspace,
  onCreateProject,
  onPublishProject,
  onCopyProject,
  onDeleteProject,
  memberDraftFor,
  onUpdateMemberDraft,
  onSaveMembers,
  busy,
}: {
  projects: Project[]
  currentProjectId: string
  currentUsername: string
  newProject: {
    name: string
    organization: string
    description: string
    editorMembers: string
    viewerMembers: string
  }
  setNewProject: (value: {
    name: string
    organization: string
    description: string
    editorMembers: string
    viewerMembers: string
  }) => void
  onSelectProject: (projectId: string) => void
  onOpenWorkspace: () => void
  onCreateProject: () => void
  onPublishProject: (projectId: string) => void
  onCopyProject: (projectId: string) => void
  onDeleteProject: (projectId: string) => void
  memberDraftFor: (project: Project) => {
    editorMembers: string
    viewerMembers: string
  }
  onUpdateMemberDraft: (
    projectId: string,
    field: 'editorMembers' | 'viewerMembers',
    value: string
  ) => void
  onSaveMembers: (projectId: string) => void
  busy: string
}) {
  const totalElements = projects.reduce((sum, project) => sum + (project.elements || 0), 0)
  const totalDocuments = projects.reduce((sum, project) => sum + (project.documents || 0), 0)
  const totalViews = projects.reduce((sum, project) => sum + (project.views || 0), 0)

  function updateNewProject(
    field: keyof typeof newProject,
    value: string
  ) {
    setNewProject({ ...newProject, [field]: value })
  }

  return (
    <div className='space-y-4'>
      <Card className='sysml-card overflow-hidden'>
        <CardHeader className='bg-muted/20'>
          <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
            <div>
              <CardTitle>项目管理</CardTitle>
              <CardDescription>
                选择项目进入工作区；新建项目放在弹窗里，避免干扰日常浏览。
              </CardDescription>
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant='secondary'>{projects.length} projects</Badge>
              <Badge variant='outline'>{totalElements} elements</Badge>
              <Badge variant='outline'>{totalViews} views</Badge>
              <Badge variant='outline'>{totalDocuments} docs</Badge>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size='sm'>
                    <Plus className='size-4' />
                    新建共享项目
                  </Button>
                </DialogTrigger>
                <DialogContent className='sm:max-w-xl'>
                  <DialogHeader>
                    <DialogTitle>新建共享项目</DialogTitle>
                    <DialogDescription>
                      创建后进入共享库；默认只有你自己，也可以填写协作成员。
                    </DialogDescription>
                  </DialogHeader>
                  <div className='grid gap-4'>
                    <Field label='项目名称'>
                      <Input
                        value={newProject.name}
                        onChange={(event) =>
                          updateNewProject('name', event.target.value)
                        }
                        placeholder='例如：火星探测器电源系统'
                      />
                    </Field>
                    <div className='grid gap-3 sm:grid-cols-2'>
                      <Field label='editor：'>
                        <Input
                          value={newProject.editorMembers}
                          onChange={(event) =>
                            updateNewProject('editorMembers', event.target.value)
                          }
                          placeholder='例如：teacher1, engineer'
                        />
                      </Field>
                      <Field label='viewer：'>
                        <Input
                          value={newProject.viewerMembers}
                          onChange={(event) =>
                            updateNewProject('viewerMembers', event.target.value)
                          }
                          placeholder='例如：reviewer'
                        />
                      </Field>
                    </div>
                    <p className='-mt-2 text-xs text-muted-foreground'>
                      多个用户名用逗号分隔；editor 可共同编辑，viewer 只能查看。
                    </p>
                    <Field label='组织 / 团队'>
                      <Input
                        value={newProject.organization}
                        onChange={(event) =>
                          updateNewProject('organization', event.target.value)
                        }
                        placeholder='例如：总体设计组'
                      />
                    </Field>
                    <Field label='说明'>
                      <Textarea
                        rows={4}
                        value={newProject.description}
                        onChange={(event) =>
                          updateNewProject('description', event.target.value)
                        }
                        placeholder='这个项目要管理什么系统、什么阶段、谁来维护。'
                      />
                    </Field>
                    <Button
                      onClick={onCreateProject}
                      disabled={busy === 'create-project'}
                    >
                      {busy === 'create-project' ? (
                        <Loader2 className='size-4 animate-spin' />
                      ) : (
                        <Plus className='size-4' />
                      )}
                      创建共享项目
                    </Button>
                    <div className='rounded-2xl bg-muted/30 p-3 text-xs text-muted-foreground'>
                      新项目是空模型。后续可以在 Model 手动建元素，或到 MDK 上传 JSON/XMI/MATLAB/Jupyter 文件导入。
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent className='p-4'>
          {projects.length ? (
            <div className='grid gap-3 lg:grid-cols-2'>
              {projects.map((project) => {
                const active = project.id === currentProjectId
                const canManageMembers =
                  project.kind !== 'workspace' && project.owner === currentUsername
                const canDelete =
                  project.kind !== 'workspace' && project.owner === currentUsername
                const memberDraft = memberDraftFor(project)
                return (
                  <button
                    key={project.id}
                    type='button'
                    onClick={() => {
                      onSelectProject(project.id)
                      onOpenWorkspace()
                    }}
                    className={cn(
                      'relative rounded-2xl bg-muted/25 p-4 text-left transition hover:bg-muted/45',
                      active && 'bg-background shadow-sm ring-1 ring-primary/25'
                    )}
                  >
                    <span
                      className={cn(
                        'absolute left-0 top-4 h-12 w-1 rounded-full bg-transparent',
                        active && 'bg-primary'
                      )}
                    />
                    <div className='flex items-start justify-between gap-3'>
                      <div className='min-w-0'>
                        <div className='font-mono text-xs text-muted-foreground'>
                          {project.id}
                        </div>
                        <div className='mt-1 truncate text-lg font-semibold'>
                          {project.name || project.id}
                        </div>
                        <p className='mt-1 line-clamp-2 text-sm text-muted-foreground'>
                          {project.description || 'No description yet'}
                        </p>
                        <div className='mt-2 flex flex-wrap gap-2'>
                          <Badge variant={project.visibility === 'shared' ? 'default' : 'secondary'}>
                            {project.visibility === 'shared'
                              ? '共享库'
                              : project.kind === 'workspace'
                                ? '个人工作台'
                                : '个人副本'}
                          </Badge>
                          {project.owner ? (
                            <Badge variant='outline'>owner: {project.owner}</Badge>
                          ) : null}
                          {project.member_count ? (
                            <Badge variant='outline'>{project.member_count} members</Badge>
                          ) : null}
                        </div>
                        {project.members?.length ? (
                          <div className='mt-3 flex flex-wrap gap-1.5'>
                            {project.members.slice(0, 4).map((member) => (
                              <Badge
                                key={`${project.id}-${member.username}-${member.role}`}
                                variant={member.role === 'viewer' ? 'secondary' : 'outline'}
                                className='rounded-full'
                              >
                                {member.username}: {member.role}
                              </Badge>
                            ))}
                            {project.members.length > 4 ? (
                              <Badge variant='secondary' className='rounded-full'>
                                +{project.members.length - 4}
                              </Badge>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <Badge variant={active ? 'default' : 'secondary'}>
                        {active ? '当前项目' : '打开项目'}
                      </Badge>
                    </div>
                    <div className='mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground'>
                      <ProjectStat value={project.branches || 0} label='分支' />
                      <ProjectStat value={project.elements || 0} label='元素' />
                      <ProjectStat value={project.views || 0} label='视图' />
                      <ProjectStat value={project.documents || 0} label='文档' />
                    </div>
                    <div className='mt-3 text-xs text-muted-foreground'>
                      {project.organization || 'No organization'} / updated{' '}
                      {project.updated_at || '-'}
                    </div>
                    <div className='mt-3 flex flex-wrap gap-2'>
                      {project.visibility === 'shared' ? (
                        <Button
                          type='button'
                          size='sm'
                          variant='outline'
                          onClick={(event) => {
                            event.stopPropagation()
                            onCopyProject(project.id)
                          }}
                          disabled={busy === `copy-project:${project.id}`}
                        >
                          {busy === `copy-project:${project.id}` ? (
                            <Loader2 className='size-4 animate-spin' />
                          ) : (
                            <Copy className='size-4' />
                          )}
                          复制到我的工作台
                        </Button>
                      ) : (
                        <Button
                          type='button'
                          size='sm'
                          variant='outline'
                          onClick={(event) => {
                            event.stopPropagation()
                            onPublishProject(project.id)
                          }}
                          disabled={busy === `publish-project:${project.id}`}
                        >
                          {busy === `publish-project:${project.id}` ? (
                            <Loader2 className='size-4 animate-spin' />
                          ) : (
                            <Share2 className='size-4' />
                          )}
                          发布到共享库
                        </Button>
                      )}
                      {canManageMembers ? (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              type='button'
                              size='sm'
                              variant='outline'
                              onClick={(event) => event.stopPropagation()}
                            >
                              <UserCircle className='size-4' />
                              成员管理
                            </Button>
                          </DialogTrigger>
                          <DialogContent
                            className='sm:max-w-lg'
                            onClick={(event) => event.stopPropagation()}
                          >
                            <DialogHeader>
                              <DialogTitle>成员管理</DialogTitle>
                              <DialogDescription>
                                调整 {project.name || project.id} 的 editor 和 viewer。
                              </DialogDescription>
                            </DialogHeader>
                            <div className='grid gap-4'>
                              <Field label='editor：'>
                                <Input
                                  value={memberDraft.editorMembers}
                                  onChange={(event) =>
                                    onUpdateMemberDraft(
                                      project.id,
                                      'editorMembers',
                                      event.target.value
                                    )
                                  }
                                  placeholder='例如：teacher1, engineer'
                                />
                              </Field>
                              <Field label='viewer：'>
                                <Input
                                  value={memberDraft.viewerMembers}
                                  onChange={(event) =>
                                    onUpdateMemberDraft(
                                      project.id,
                                      'viewerMembers',
                                      event.target.value
                                    )
                                  }
                                  placeholder='例如：reviewer'
                                />
                              </Field>
                              <p className='text-xs text-muted-foreground'>
                                owner 会自动保留；不存在的用户名会被拒绝保存。
                              </p>
                              <Button
                                onClick={() => onSaveMembers(project.id)}
                                disabled={busy === `members-project:${project.id}`}
                              >
                                {busy === `members-project:${project.id}` ? (
                                  <Loader2 className='size-4 animate-spin' />
                                ) : (
                                  <Save className='size-4' />
                                )}
                                保存成员
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      ) : null}
                      {canDelete ? (
                        <Button
                          type='button'
                          size='sm'
                          variant='destructive'
                          onClick={(event) => {
                            event.stopPropagation()
                            onDeleteProject(project.id)
                          }}
                          disabled={busy === `delete-project:${project.id}`}
                        >
                          {busy === `delete-project:${project.id}` ? (
                            <Loader2 className='size-4 animate-spin' />
                          ) : (
                            <Trash2 className='size-4' />
                          )}
                          删除工作台
                        </Button>
                      ) : null}
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <EmptyState
              title='还没有项目'
              description='先创建一个项目，再导入模型或手动创建 SysML 元素。'
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ProjectStat({ value, label }: { value: number; label: string }) {
  return (
    <span>
      <strong className='font-semibold text-foreground'>{value}</strong> {label}
    </span>
  )
}

function ViewDefinitionPanel({
  elements,
  viewpoints,
  viewId,
  attributesText,
  onToggle,
  onSetIncludedElements,
  onUpdateAttributes,
  onUpdateQuery,
}: {
  elements: SysmlElement[]
  viewpoints: SysmlElement[]
  viewId: string
  attributesText: string
  onToggle: (elementId: string, checked: boolean) => void
  onSetIncludedElements: (elementIds: string[]) => void
  onUpdateAttributes: (patch: Record<string, unknown>) => void
  onUpdateQuery: (patch: Record<string, unknown>) => void
}) {
  const attributes = parseJsonSafe<Record<string, unknown>>(attributesText, {})
  const query =
    attributes.query && typeof attributes.query === 'object' && !Array.isArray(attributes.query)
      ? (attributes.query as Record<string, unknown>)
      : {}
  const selectedTypes = stringList(query.types)
  const selectedRelations = stringList(query.relations)
  const elementById = useMemo(
    () => new Map(elements.map((element) => [element.id, element])),
    [elements]
  )
  const selectedViewpointId = String(attributes.viewpoint_id || '')
  const selectedViewpoint =
    viewpoints.find((item) => item.id === selectedViewpointId) || null
  const selectedViewpointAttributes =
    selectedViewpoint?.attributes &&
    typeof selectedViewpoint.attributes === 'object' &&
    !Array.isArray(selectedViewpoint.attributes)
      ? (selectedViewpoint.attributes as Record<string, unknown>)
      : {}
  const viewpointQuery =
    selectedViewpointAttributes.default_query &&
    typeof selectedViewpointAttributes.default_query === 'object' &&
    !Array.isArray(selectedViewpointAttributes.default_query)
      ? (selectedViewpointAttributes.default_query as Record<string, unknown>)
      : {}
  const effectiveQuery = mergeQuery(viewpointQuery, query)
  const queryPreview = previewQueryElements(elements, effectiveQuery)
  const includedOrder = includedElementList(attributesText)
  const includedSet = new Set(includedOrder)
  const selectedElements = includedOrder
    .map((elementId) => elementById.get(elementId))
    .filter((element): element is SysmlElement => Boolean(element))
  const finalPreviewElements = [
    ...selectedElements,
    ...queryPreview.matches.filter((element) => !includedSet.has(element.id)),
  ]
  const finalSet = new Set(finalPreviewElements.map((element) => element.id))
  const candidates = elements.filter(
    (element) =>
      element.id !== viewId && element.type !== 'View' && element.type !== 'Viewpoint'
  )
  const availableElements = candidates.filter((element) => !includedSet.has(element.id))
  const grouped = availableElements.reduce<Record<string, SysmlElement[]>>(
    (acc, element) => {
      acc[element.type] = acc[element.type] || []
      acc[element.type].push(element)
      return acc
    },
    {}
  )
  const orderedTypes = Object.keys(grouped).sort()
  const [showLibrary, setShowLibrary] = useState(false)
  const scopeIssues = useMemo(() => {
    const issues: Array<{
      source: SysmlElement
      relationType: string
      targetId: string
      target: SysmlElement | null
      fixable: boolean
      message: string
    }> = []
    const seen = new Set<string>()

    for (const source of selectedElements) {
      for (const relation of source.relations || []) {
        const targetId = String(relation.target || '').trim()
        if (!targetId || finalSet.has(targetId)) continue
        const key = `${source.id}:${relation.type}:${targetId}`
        if (seen.has(key)) continue
        seen.add(key)
        const target = elementById.get(targetId) || null
        issues.push({
          source,
          relationType: relation.type,
          targetId,
          target,
          fixable: Boolean(target),
          message: target
            ? `${source.id} 的 ${labelRelation(relation.type)} 指向 ${targetId}，但它还不在这个 View 里。`
            : `${source.id} 的 ${labelRelation(relation.type)} 指向 ${targetId}，但这个元素在模型里没找到。`,
        })
      }
    }

    return issues
  }, [elementById, includedSet, selectedElements])
  const [draggingId, setDraggingId] = useState('')
  const [dropTargetId, setDropTargetId] = useState('')

  function getDraggedElementId(event: DragEvent<HTMLElement>) {
    return (
      event.dataTransfer.getData('application/x-sysml-element-id') ||
      event.dataTransfer.getData('text/plain')
    ).trim()
  }

  function beginDrag(elementId: string) {
    return (event: DragEvent<HTMLElement>) => {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('application/x-sysml-element-id', elementId)
      event.dataTransfer.setData('text/plain', elementId)
      setDraggingId(elementId)
    }
  }

  function finishDrag() {
    setDraggingId('')
    setDropTargetId('')
  }

  function placeElement(elementId: string, targetId?: string) {
    const next = includedOrder.filter((id) => id !== elementId)
    if (!targetId) {
      next.push(elementId)
    } else {
      const targetIndex = next.indexOf(targetId)
      if (targetIndex >= 0) next.splice(targetIndex, 0, elementId)
      else next.push(elementId)
    }
    onSetIncludedElements(next)
  }

  function handleCanvasDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const draggedId = getDraggedElementId(event)
    if (draggedId) {
      placeElement(draggedId)
    }
    finishDrag()
  }

  function handleCanvasDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDropTargetId('canvas')
  }

  function handleDropBefore(targetId: string) {
    return (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      const draggedId = getDraggedElementId(event)
      if (!draggedId || draggedId === targetId) return
      setDropTargetId(`before-${targetId}`)
      placeElement(draggedId, targetId)
      finishDrag()
    }
  }

  function handleDragOverTarget(targetId: string) {
    return (event: DragEvent<HTMLElement>) => {
      event.preventDefault()
      setDropTargetId(`before-${targetId}`)
    }
  }

  function handleCanvasBeforeEndDrag(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDropTargetId('canvas')
  }

  return (
    <Card className='border-dashed bg-muted/20'>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <CardTitle className='text-base'>View Studio</CardTitle>
            <CardDescription>
              先看结果，再调规则。大部分人只需要 Viewpoint、自动收集和手动绑定这三块。
            </CardDescription>
          </div>
          <Badge variant='secondary'>{includedOrder.length} selected</Badge>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div>
          <Field label='Viewpoint'>
            <Select
              value={String(attributes.viewpoint_id || 'none')}
              onValueChange={(value) => {
                const viewpoint = viewpoints.find((item) => item.id === value)
                onUpdateAttributes({
                  viewpoint_id: value === 'none' ? '' : value,
                  viewpoint: viewpoint?.name || '',
                })
              }}
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Select a Viewpoint' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='none'>No Viewpoint</SelectItem>
                {viewpoints.map((viewpoint) => (
                  <SelectItem key={viewpoint.id} value={viewpoint.id}>
                    {viewpoint.name || viewpoint.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!viewpoints.length && (
              <p className='mt-2 text-xs text-muted-foreground'>
                No Viewpoint exists yet. Click New Viewpoint in the Views card first.
              </p>
            )}
          </Field>
        </div>

        <div className='grid gap-4 xl:grid-cols-[minmax(260px,0.56fr)_minmax(0,1.44fr)]'>
          <div className='space-y-4'>
            <div className='rounded-md border bg-background p-4'>
              <div className='mb-3 flex items-center justify-between gap-3'>
                <div>
                  <div className='text-sm font-semibold'>最终范围</div>
                  <p className='text-xs text-muted-foreground'>
                    这是 Graph 和 Docs 最终会用到的范围。
                  </p>
                </div>
                <Badge variant='outline'>
                  {selectedViewpoint
                    ? `继承 ${selectedViewpoint.name || selectedViewpoint.id}`
                    : '无 Viewpoint'}
                </Badge>
              </div>
              <div className='grid gap-2 text-sm text-muted-foreground'>
                <div className='flex flex-wrap items-center gap-2'>
                  <Badge variant='secondary'>{finalPreviewElements.length} 个元素</Badge>
                  <span>手动 {selectedElements.length}</span>
                  <span>自动 {queryPreview.match_count}</span>
                </div>
              </div>
              <div className='mt-3 grid gap-2'>
                {finalPreviewElements.slice(0, 8).map((element) => (
                  <Badge
                    key={element.id}
                    variant='secondary'
                    className='w-fit max-w-full truncate font-normal'
                  >
                    {element.id}
                  </Badge>
                ))}
                {finalPreviewElements.length > 8 && (
                  <Badge variant='outline' className='font-normal'>
                    +{finalPreviewElements.length - 8}
                  </Badge>
                )}
              </div>
            </div>

            <div className='rounded-md border bg-background p-4'>
              <div className='mb-3 flex items-center justify-between gap-3'>
                <div>
                  <div className='text-sm font-semibold'>View Validation</div>
                  <p className='text-xs text-muted-foreground'>
                    这里展示这个 View 还缺哪些关系端点。
                  </p>
                </div>
                <Badge variant={scopeIssues.length ? 'destructive' : 'secondary'}>
                  {scopeIssues.length ? `${scopeIssues.length} issues` : 'clean'}
                </Badge>
              </div>
              {scopeIssues.length ? (
                <div className='space-y-2'>
                  {scopeIssues.slice(0, 6).map((issue) => (
                    <Alert
                      key={`${issue.source.id}-${issue.relationType}-${issue.targetId}`}
                      variant={issue.fixable ? 'default' : 'destructive'}
                    >
                      <AlertCircle className='size-4' />
                      <AlertTitle className='min-w-0 break-words leading-6'>
                        {issue.source.id} / {labelRelation(issue.relationType)}
                      </AlertTitle>
                      <AlertDescription className='min-w-0 space-y-2'>
                        <div className='break-words'>{issue.message}</div>
                        {issue.fixable && (
                          <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            className='h-auto max-w-full whitespace-normal text-left leading-5'
                            onClick={() =>
                              onSetIncludedElements(
                                Array.from(new Set([...includedOrder, issue.targetId]))
                              )
                            }
                          >
                            一键加入 {issue.targetId}
                          </Button>
                        )}
                      </AlertDescription>
                    </Alert>
                  ))}
                  {scopeIssues.length > 6 && (
                    <p className='text-xs text-muted-foreground'>
                      还有 {scopeIssues.length - 6} 条没展开。
                    </p>
                  )}
                </div>
              ) : (
                <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                  <CheckCircle2 className='size-4 text-emerald-600' />
                  这个 View 的关系范围已经闭合了。
                </div>
              )}
            </div>
          </div>

          <div className='space-y-4'>
            <div className='rounded-md border bg-background p-4'>
              <div>
                <div className='text-sm font-semibold'>自动收集范围</div>
                <p className='text-xs text-muted-foreground'>
                  继承 Viewpoint 默认查询，当前 View 的设置会覆盖默认值。
                </p>
              </div>
              <div className='mt-3 text-sm'>
                {stringList(viewpointQuery.types).length
                  ? formatList(stringList(viewpointQuery.types), labelType)
                  : 'Viewpoint 默认不限制'}
              </div>
              <div className='mt-4 grid gap-4 border-t pt-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_260px]'>
                <Field label='Element types'>
                  <MultiCheckGrid
                    options={elementsTypes(elements)}
                    selected={selectedTypes}
                    onChange={(next) => onUpdateQuery({ types: next })}
                  />
                </Field>
                <Field label='Relations to focus'>
                  <MultiCheckGrid
                    options={['satisfy', 'verify', 'refine', 'constrain', 'include', 'conform']}
                    selected={selectedRelations}
                    onChange={(next) => onUpdateQuery({ relations: next })}
                    label={labelRelation}
                  />
                </Field>
                <Field label='Relation depth'>
                  <Select
                    value={String(query.relation_depth ?? 0)}
                    onValueChange={(value) =>
                      onUpdateQuery({ relation_depth: Number(value) })
                    }
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='0'>0 - only matched/manual elements</SelectItem>
                      <SelectItem value='1'>1 - include directly related elements</SelectItem>
                      <SelectItem value='2'>2 - include two relation hops</SelectItem>
                      <SelectItem value='3'>3 - include three relation hops</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </div>

            <div className='rounded-md border bg-background p-4'>
              <div className='flex items-center justify-between gap-3'>
                <div>
                  <div className='text-sm font-semibold'>手动绑定区</div>
                  <p className='text-xs text-muted-foreground'>
                    从左边拖过来，或者直接点一下加进来。
                  </p>
                </div>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  onClick={() => setShowLibrary((current) => !current)}
                >
                  {showLibrary ? '收起元素库' : '添加元素'}
                </Button>
              </div>
              <div
                className={cn(
                  'mt-3 min-h-[300px] rounded-md border bg-background p-3 transition-colors',
                  dropTargetId === 'canvas' && 'border-primary bg-primary/5'
                )}
                onDragOver={handleCanvasDragOver}
                onDrop={handleCanvasDrop}
                onDragLeave={finishDrag}
              >
                {selectedElements.length ? (
                  <div className='space-y-2'>
                    {selectedElements.map((element, index) => (
                      <div key={element.id} className='space-y-2'>
                        {dropTargetId === `before-${element.id}` && (
                          <div className='h-1 rounded-full bg-primary' />
                        )}
                        <div
                          className={cn(
                            'rounded-md border bg-muted/30 p-3 transition-colors',
                            dropTargetId === element.id && 'border-primary bg-primary/10'
                          )}
                          draggable
                          onDragStart={beginDrag(element.id)}
                          onDragEnd={finishDrag}
                          onDragOver={handleDragOverTarget(element.id)}
                          onDrop={handleDropBefore(element.id)}
                        >
                          <div className='flex items-start justify-between gap-3'>
                            <div className='min-w-0'>
                              <div className='font-mono text-xs font-semibold'>
                                {element.id}
                              </div>
                              <div className='text-sm font-medium'>
                                {element.name || element.id}
                              </div>
                              <div className='text-xs text-muted-foreground'>
                                {labelType(element.type)} /{' '}
                                {element.description || element.owner || 'No description'}
                              </div>
                            </div>
                            <div className='flex items-center gap-2'>
                              <Badge variant='secondary'>{index + 1}</Badge>
                              <Button
                                type='button'
                                size='sm'
                                variant='ghost'
                                onClick={() =>
                                  onSetIncludedElements(
                                    includedOrder.filter((id) => id !== element.id)
                                  )
                                }
                              >
                                移除
                              </Button>
                            </div>
                          </div>
                        </div>
                        {index === selectedElements.length - 1 && (
                          <div
                            className='h-1 rounded-full'
                            onDragOver={handleCanvasBeforeEndDrag}
                            onDrop={handleCanvasDrop}
                          />
                        )}
                      </div>
                    ))}
                    {dropTargetId === 'canvas' && (
                      <div className='rounded-md border border-dashed border-primary/60 bg-primary/5 px-3 py-2 text-xs text-primary'>
                        松手会放到末尾
                      </div>
                    )}
                  </div>
                ) : (
                  <EmptyState
                    title='手动绑定区为空'
                    description='从左边拖元素进来，或点元素直接绑定。'
                  />
                )}
              </div>

              {showLibrary && (
                <div className='mt-4'>
                  <div className='mb-3'>
                    <div className='text-sm font-semibold'>元素库</div>
                    <p className='text-xs text-muted-foreground'>
                      这里是可拖拽元素，直接点一下也会加入这个 View。
                    </p>
                  </div>
                  {candidates.length ? (
                    <ScrollArea className='h-[260px] rounded-md border bg-background'>
                      <div className='space-y-4 p-3'>
                        {orderedTypes.map((type) => (
                          <div key={type} className='space-y-2'>
                            <div className='flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground'>
                              <span>{labelType(type)}</span>
                              <Badge variant='outline'>{grouped[type].length}</Badge>
                            </div>
                            <div className='space-y-2'>
                              {grouped[type]
                                .sort((left, right) => left.id.localeCompare(right.id))
                                .map((element) => {
                                  const draggable = true
                                  return (
                                    <button
                                      key={element.id}
                                      type='button'
                                      draggable={draggable}
                                      onDragStart={beginDrag(element.id)}
                                      onDragEnd={finishDrag}
                                      onClick={() => onToggle(element.id, true)}
                                      className={cn(
                                        'flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors hover:bg-muted/50',
                                        draggingId === element.id && 'opacity-50'
                                      )}
                                    >
                                      <span className='min-w-0 flex-1'>
                                        <span className='block font-mono text-xs font-semibold'>
                                          {element.id}
                                        </span>
                                        <span className='block truncate text-sm'>
                                          {element.name || element.id}
                                        </span>
                                        <span className='line-clamp-1 text-xs text-muted-foreground'>
                                          {element.description || element.owner || 'No description'}
                                        </span>
                                      </span>
                                      <Badge variant='secondary'>drag</Badge>
                                    </button>
                                  )
                                })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <EmptyState
                      title='No bindable elements'
                      description='Create requirements, blocks, tests, or interfaces before binding a View.'
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        </CardContent>
      </Card>
  )
}

function ViewsTab({
  views,
  viewpoints,
  selectedId,
  setSelectedId,
  bindableElements,
  form,
  attributesText,
  onNewView,
  onNewViewpoint,
  onToggleViewElement,
  onSetIncludedElements,
  onUpdateViewAttributes,
  onUpdateViewQuery,
  onSaveCurrent,
  onDeleteCurrent,
  validation,
  aiValidationFixReview,
  aiValidationFixApplyResult,
  busy,
  onAiValidationFixReview,
  onApplyAiValidationFixes,
}: {
  views: SysmlElement[]
  viewpoints: SysmlElement[]
  selectedId: string
  setSelectedId: (id: string) => void
  bindableElements: SysmlElement[]
  form: SysmlElement
  attributesText: string
  onNewView: () => void
  onNewViewpoint: () => void
  onToggleViewElement: (elementId: string, checked: boolean) => void
  onSetIncludedElements: (elementIds: string[]) => void
  onUpdateViewAttributes: (patch: Record<string, unknown>) => void
  onUpdateViewQuery: (patch: Record<string, unknown>) => void
  onSaveCurrent: () => void
  onDeleteCurrent: () => void
  validation: ValidationPayload | null
  aiValidationFixReview: AiValidationFixReview | null
  aiValidationFixApplyResult: AiValidationFixApplyResult | null
  busy: string
  onAiValidationFixReview: () => void
  onApplyAiValidationFixes: () => void
}) {
  const isView = form.type === 'View'
  const isViewpoint = form.type === 'Viewpoint'
  const hasLibraryItems = views.length > 0 || viewpoints.length > 0

  return (
    <div className='grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]'>
      <Card className='sysml-card self-start overflow-hidden'>
        <CardHeader className='bg-muted/20'>
          <div className='flex items-center justify-between gap-3'>
            <div>
              <CardTitle>View Library</CardTitle>
              <CardDescription>
                先管理 View，再需要时维护 Viewpoint 模板。
              </CardDescription>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Button size='sm' variant='outline' onClick={onNewView}>
                <Plus className='size-4' />
                New View
              </Button>
              <Button size='sm' variant='ghost' onClick={onNewViewpoint}>
                Viewpoint
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className='p-3'>
          {hasLibraryItems ? (
            <Tabs defaultValue='views' className='space-y-3'>
              <TabsList className='grid w-full grid-cols-2 rounded-full bg-muted/60 p-1'>
                <TabsTrigger value='views'>Views {views.length}</TabsTrigger>
                <TabsTrigger value='viewpoints'>
                  Viewpoints {viewpoints.length}
                </TabsTrigger>
              </TabsList>
              <TabsContent value='views' className='mt-0 space-y-2'>
                {views.length ? (
                  views.map((view) => {
                    const attributes = view.attributes || {}
                    const included = Array.isArray(attributes.included_elements)
                      ? attributes.included_elements.length
                      : 0
                    return (
                      <ViewLibraryItem
                        key={view.id}
                        id={view.id}
                        title={view.name || view.id}
                        description={`${String(attributes.viewpoint || 'General viewpoint')} / ${view.description || 'No description'}`}
                        badge={`${included} linked`}
                        active={selectedId === view.id}
                        onClick={() => setSelectedId(view.id)}
                      />
                    )
                  })
                ) : (
                  <ViewLibraryEmpty
                    title='还没有 View'
                    description='创建 View 后可以绑定元素，并驱动 Graph 和 Docs 输出。'
                    action='创建 View'
                    onAction={onNewView}
                  />
                )}
              </TabsContent>
              <TabsContent value='viewpoints' className='mt-0 space-y-2'>
                {viewpoints.length ? (
                  viewpoints.map((viewpoint) => {
                    const attributes = viewpoint.attributes || {}
                    return (
                      <ViewLibraryItem
                        key={viewpoint.id}
                        id={viewpoint.id}
                        title={viewpoint.name || viewpoint.id}
                        description={String(
                          attributes.purpose ||
                            viewpoint.description ||
                            'No purpose yet'
                        )}
                        badge='template'
                        active={selectedId === viewpoint.id}
                        onClick={() => setSelectedId(viewpoint.id)}
                      />
                    )
                  })
                ) : (
                  <ViewLibraryEmpty
                    title='还没有 Viewpoint'
                    description='Viewpoint 是 View 的模板，用来定义默认查询和文档规则。'
                    action='创建 Viewpoint'
                    onAction={onNewViewpoint}
                  />
                )}
              </TabsContent>
            </Tabs>
          ) : (
            <div className='rounded-2xl bg-muted/25 p-4'>
              <div className='text-sm font-semibold'>从一个 View 开始</div>
              <p className='mt-1 text-xs text-muted-foreground'>
                建议流程：创建 Viewpoint 模板，创建 View，绑定元素，再生成 Graph 或 Docs。
              </p>
              <div className='mt-4 grid gap-2'>
                <Button onClick={onNewView}>
                  <Plus className='size-4' />
                  创建 View
                </Button>
                <Button variant='outline' onClick={onNewViewpoint}>
                  创建 Viewpoint
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className='space-y-4'>
        <Card className='sysml-card overflow-hidden'>
        <CardHeader className='bg-muted/20'>
          <div className='flex items-center justify-between gap-3'>
            <div>
              <CardTitle>
                {isView
                  ? 'View Editor'
                  : isViewpoint
                    ? 'Viewpoint Template'
                    : 'View Studio'}
              </CardTitle>
              <CardDescription>
                {isView
                  ? '编辑视图范围、绑定元素，并用于 Graph / Docs。'
                  : isViewpoint
                    ? '维护视图模板、默认查询和文档规则。'
                    : '选择一个 View 或 Viewpoint，或按流程创建新的视图。'}
              </CardDescription>
            </div>
            <div className='flex flex-wrap items-center justify-end gap-2'>
              <Badge variant='secondary'>
                {form.type === 'View' || form.type === 'Viewpoint'
                  ? labelType(form.type)
                  : 'Idle'}
              </Badge>
              <Button
                size='sm'
                variant='destructive'
                onClick={onDeleteCurrent}
                disabled={
                  busy === 'delete-element' ||
                  !form.id ||
                  (form.type !== 'View' && form.type !== 'Viewpoint')
                }
              >
                {busy === 'delete-element' ? (
                  <Loader2 className='size-4 animate-spin' />
                ) : (
                  <Trash2 className='size-4' />
                )}
                删除当前
              </Button>
              <Button
                size='sm'
                onClick={onSaveCurrent}
                disabled={
                  busy === 'save-element' ||
                  (form.type !== 'View' && form.type !== 'Viewpoint')
                }
              >
                <Save className='size-4' />
                保存当前
              </Button>
            </div>
            </div>
          </CardHeader>
        <CardContent className='p-4'>
          {form.type === 'View' ? (
            <ViewDefinitionPanel
              elements={bindableElements}
              viewpoints={viewpoints}
              viewId={form.id}
              attributesText={attributesText}
              onToggle={onToggleViewElement}
              onSetIncludedElements={onSetIncludedElements}
              onUpdateAttributes={onUpdateViewAttributes}
              onUpdateQuery={onUpdateViewQuery}
            />
          ) : form.type === 'Viewpoint' ? (
              <ViewpointDefinitionPanel
                elements={bindableElements}
                attributesText={attributesText}
                onUpdateAttributes={onUpdateViewAttributes}
              />
            ) : (
              <ViewStudioEmpty
                onNewView={onNewView}
                onNewViewpoint={onNewViewpoint}
              />
            )}
          </CardContent>
        </Card>

        <ViewValidationBar
          validation={validation}
          aiFixReview={aiValidationFixReview}
          applyResult={aiValidationFixApplyResult}
          busy={busy}
          onAiFix={onAiValidationFixReview}
          onApplyFixes={onApplyAiValidationFixes}
        />
      </div>
    </div>
  )
}

function ViewLibraryItem({
  id,
  title,
  description,
  badge,
  active,
  onClick,
}: {
  id: string
  title: string
  description: string
  badge: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        'relative w-full rounded-2xl bg-muted/25 p-3 text-left transition-colors hover:bg-muted/45',
        active && 'bg-background shadow-sm ring-1 ring-primary/20'
      )}
    >
      <span
        className={cn(
          'absolute left-0 top-3 h-10 w-1 rounded-full bg-transparent',
          active && 'bg-primary'
        )}
      />
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <div className='font-mono text-xs text-muted-foreground'>{id}</div>
          <div className='mt-1 truncate text-sm font-semibold'>{title}</div>
        </div>
        <Badge variant='secondary'>{badge}</Badge>
      </div>
      <p className='mt-2 line-clamp-2 text-xs text-muted-foreground'>
        {description}
      </p>
    </button>
  )
}

function ViewLibraryEmpty({
  title,
  description,
  action,
  onAction,
}: {
  title: string
  description: string
  action: string
  onAction: () => void
}) {
  return (
    <div className='rounded-2xl bg-muted/25 p-4 text-sm'>
      <div className='font-semibold'>{title}</div>
      <p className='mt-1 text-xs text-muted-foreground'>{description}</p>
      <Button size='sm' className='mt-3' variant='outline' onClick={onAction}>
        <Plus className='size-4' />
        {action}
      </Button>
    </div>
  )
}

function ViewStudioEmpty({
  onNewView,
  onNewViewpoint,
}: {
  onNewView: () => void
  onNewViewpoint: () => void
}) {
  return (
    <div className='grid gap-4 rounded-2xl bg-muted/25 p-5 md:grid-cols-[1fr_auto]'>
      <div>
        <h3 className='text-base font-semibold'>还没有选择 View</h3>
        <p className='mt-2 text-sm text-muted-foreground'>
          普通用户优先创建 View：选择范围、绑定元素，然后用于 Graph 和 Docs。
          Viewpoint 是高级模板，用来定义默认规则。
        </p>
        <div className='mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-4'>
          <span>1. 创建 Viewpoint</span>
          <span>2. 创建 View</span>
          <span>3. 绑定元素</span>
          <span>4. 生成输出</span>
        </div>
      </div>
      <div className='flex min-w-[180px] flex-col gap-2'>
        <Button onClick={onNewView}>
          <Plus className='size-4' />
          创建 View
        </Button>
        <Button variant='outline' onClick={onNewViewpoint}>
          创建 Viewpoint
        </Button>
      </div>
    </div>
  )
}

function ViewValidationBar({
  validation,
  aiFixReview,
  applyResult,
  busy,
  onAiFix,
  onApplyFixes,
}: {
  validation: ValidationPayload | null
  aiFixReview: AiValidationFixReview | null
  applyResult: AiValidationFixApplyResult | null
  busy: string
  onAiFix: () => void
  onApplyFixes: () => void
}) {
  const viewIssues = (validation?.issues || []).filter((issue) => {
    const message = issue.message || ''
    return (
      issue.element_id.startsWith('VIEW') ||
      issue.element_id.startsWith('VP') ||
      message.includes('Viewpoint') ||
      message.includes('View scope') ||
      message.includes('View references')
    )
  })
  const errors = viewIssues.filter((issue) => issue.severity === 'error').length
  const warnings = viewIssues.filter((issue) => issue.severity === 'warning').length
  const hasIssues = errors + warnings > 0
  const fixing = busy === 'ai-validation-fix'
  const applying = busy === 'ai-validation-apply'

  return (
    <Card className={cn('overflow-hidden border-0 bg-muted/25 shadow-none', hasIssues && 'bg-destructive/10')}>
      <CardHeader className='pb-3'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex items-center gap-2'>
            {hasIssues ? (
              <AlertCircle className='size-4 text-destructive' />
            ) : (
              <CheckCircle2 className='size-4 text-emerald-600' />
            )}
            <CardTitle className='text-base'>
              {hasIssues ? 'View 校验存在问题' : 'View 校验通过'}
            </CardTitle>
          </div>
          <div className='flex flex-wrap items-center justify-end gap-2'>
            {hasIssues ? (
              <>
                <Button type='button' size='sm' variant='outline' onClick={onAiFix} disabled={fixing}>
                  {fixing ? <Loader2 className='size-4 animate-spin' /> : <Sparkles className='size-4' />}
                  AI 修复建议
                </Button>
                <Button type='button' size='sm' onClick={onApplyFixes} disabled={applying}>
                  {applying ? <Loader2 className='size-4 animate-spin' /> : <Wrench className='size-4' />}
                  一键应用
                </Button>
              </>
            ) : null}
            <span className='text-xs text-muted-foreground'>
              {errors} 个错误，{warnings} 个警告
            </span>
          </div>
        </div>
      </CardHeader>
      {hasIssues || fixing || applying || aiFixReview || applyResult ? (
        <CardContent className='space-y-3'>
          {hasIssues ? (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant='ghost' size='sm' className='w-full justify-between rounded-xl bg-background/70'>
                  展开查看 {viewIssues.length} 条 View 问题
                  <Badge variant='outline'>{warnings} warnings</Badge>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className='mt-3 divide-y rounded-xl bg-background/80'>
                  {viewIssues.map((issue, index) => (
                    <ValidationIssueRow key={`${issue.element_id}-view-${index}`} issue={issue} />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
          {applying ? (
            <div className='flex items-center gap-2 rounded-xl border bg-background/70 p-3 text-sm text-muted-foreground'>
              <Loader2 className='size-4 animate-spin' />
              正在应用 View 修复
            </div>
          ) : applyResult ? (
            <div className='rounded-xl border bg-emerald-50 p-4 text-sm text-emerald-950 dark:bg-emerald-950/25 dark:text-emerald-100'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='font-semibold'>View 修复已应用</div>
                <Badge variant='secondary'>{applyResult.applied.length} applied</Badge>
              </div>
              <div className='mt-2 text-xs'>
                修复前：{String(applyResult.before.errors ?? 0)} 错误 / {String(applyResult.before.warnings ?? 0)} 警告；
                修复后：{String(applyResult.after.errors ?? 0)} 错误 / {String(applyResult.after.warnings ?? 0)} 警告
              </div>
            </div>
          ) : null}
          {fixing ? (
            <div className='flex items-center gap-2 rounded-xl border bg-background/70 p-3 text-sm text-muted-foreground'>
              <Loader2 className='size-4 animate-spin' />
              正在生成 View 修复建议
            </div>
          ) : aiFixReview ? (
            <div className='rounded-xl border bg-background/70 p-4'>
              <div className='mb-3 flex items-center justify-between gap-2'>
                <div className='text-sm font-semibold'>AI View 修复建议</div>
                <Badge variant='secondary'>{aiFixReview.issue_count} issues</Badge>
              </div>
              <MarkdownMessage content={aiFixReview.review} compact />
            </div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  )
}

function ViewpointDefinitionPanel({
  elements,
  attributesText,
  onUpdateAttributes,
}: {
  elements: SysmlElement[]
  attributesText: string
  onUpdateAttributes: (patch: Record<string, unknown>) => void
}) {
  const attributes = parseJsonSafe<Record<string, unknown>>(attributesText, {})
  const defaultQuery =
    attributes.default_query &&
    typeof attributes.default_query === 'object' &&
    !Array.isArray(attributes.default_query)
      ? (attributes.default_query as Record<string, unknown>)
      : {}
  const typeOptions = elementsTypes(elements)
  const relationOptions = allRelationOptions(elements)
  const selectedAllowedTypes = stringList(attributes.allowed_types)
  const selectedRequiredTypes = stringList(attributes.required_types)
  const selectedAllowedRelations = stringList(attributes.allowed_relations)
  const selectedQueryTypes = stringList(defaultQuery.types)
  const selectedQueryRelations = stringList(defaultQuery.relations)
  const selectedTypes = selectedAllowedTypes.length
    ? selectedAllowedTypes
    : selectedQueryTypes
  const selectedRelations = selectedAllowedRelations.length
    ? selectedAllowedRelations
    : selectedQueryRelations
  const [showAdvanced, setShowAdvanced] = useState(false)

  const updateDefaultQuery = (patch: Record<string, unknown>) => {
    onUpdateAttributes({ default_query: { ...defaultQuery, ...patch } })
  }
  const updateScopeTypes = (types: string[]) => {
    onUpdateAttributes({
      allowed_types: types,
      default_query: { ...defaultQuery, types },
    })
  }
  const updateScopeRelations = (relations: string[]) => {
    onUpdateAttributes({
      allowed_relations: relations,
      default_query: { ...defaultQuery, relations },
    })
  }
  const applyPreset = (preset: (typeof viewpointPresets)[number]) => {
    onUpdateAttributes({
      purpose: preset.purpose,
      allowed_types: preset.allowed_types,
      required_types: preset.required_types,
      allowed_relations: preset.allowed_relations,
      default_query: preset.default_query,
      document_template: preset.document_template,
    })
  }

  return (
    <div className='rounded-2xl bg-muted/20 p-4'>
      <div className='pb-3'>
        <CardTitle className='text-base'>Viewpoint Setup</CardTitle>
        <CardDescription>
          先选场景，再维护默认收集范围；高级校验按需展开。
        </CardDescription>
      </div>
      <div className='space-y-5'>
        <Field label='Purpose'>
          <Textarea
            rows={3}
            value={String(attributes.purpose || '')}
            onChange={(event) => onUpdateAttributes({ purpose: event.target.value })}
            placeholder='例如：用于需求审查，关注需求、满足关系和验证用例'
          />
        </Field>

        <div className='rounded-2xl bg-background/70 p-4'>
          <div className='mb-3 flex flex-wrap items-center justify-between gap-3'>
            <div>
              <div className='text-sm font-semibold'>选择一个常用场景</div>
              <p className='text-xs text-muted-foreground'>
                系统会自动填好默认收集范围和校验规则。
              </p>
            </div>
            <Badge variant='secondary'>Recommended</Badge>
          </div>
          <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
            {viewpointPresets.map((preset) => (
              <button
                key={preset.key}
                type='button'
                className='rounded-2xl bg-muted/30 p-3 text-left transition hover:bg-muted/50'
                onClick={() => applyPreset(preset)}
              >
                <div className='font-medium'>{preset.label}</div>
                <div className='mt-1 text-xs text-muted-foreground'>
                  {preset.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className='space-y-4 rounded-2xl bg-background/70 p-4'>
          <div>
            <div className='text-sm font-semibold'>默认收集范围</div>
            <p className='text-xs text-muted-foreground'>
              这些设置会同时作为 View 的默认查询和 Viewpoint 的允许范围。
            </p>
          </div>
          <div className='grid gap-4 lg:grid-cols-2'>
            <Field label='包含元素类型'>
              <MultiCheckGrid
                options={typeOptions}
                selected={selectedTypes}
                onChange={updateScopeTypes}
                label={labelType}
              />
            </Field>
            <Field label='包含关系'>
              <MultiCheckGrid
                options={relationOptions}
                selected={selectedRelations}
                onChange={updateScopeRelations}
                label={labelRelation}
              />
            </Field>
            <Field label='关系深度'>
              <Select
                value={String(defaultQuery.relation_depth ?? 1)}
                onValueChange={(value) =>
                  updateDefaultQuery({ relation_depth: Number(value) })
                }
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='0'>0 - 只包含匹配/手动元素</SelectItem>
                  <SelectItem value='1'>1 - 包含直接相关元素</SelectItem>
                  <SelectItem value='2'>2 - 包含两跳关系元素</SelectItem>
                  <SelectItem value='3'>3 - 包含三跳关系元素</SelectItem>
                </SelectContent>
              </Select>
              <p className='mt-2 text-xs text-muted-foreground'>
                从匹配到的元素出发，沿上面选中的关系继续纳入相邻元素；0 表示不扩展，1 表示只加入直接相连元素，2/3 表示继续向外扩展两跳或三跳。
              </p>
            </Field>
          </div>
        </div>

        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            variant='outline'
            onClick={() => setShowAdvanced((current) => !current)}
          >
            {showAdvanced ? '收起高级设置' : '高级设置'}
          </Button>
        </div>

        {showAdvanced && (
          <div className='space-y-5 rounded-2xl bg-background/70 p-4'>
            <div>
              <div className='text-sm font-semibold'>高级设置</div>
              <p className='text-xs text-muted-foreground'>
                只在需要更严格校验时调整。
              </p>
            </div>

            <Field label='必需元素类型'>
              <MultiCheckGrid
                options={typeOptions}
                selected={selectedRequiredTypes}
                onChange={(next) => onUpdateAttributes({ required_types: next })}
                label={labelType}
              />
            </Field>
          </div>
        )}
      </div>
    </div>
  )
}

function ClosureSuggestionsPanel({
  closureSuggestions,
  busy,
  onClosureSuggestions,
}: {
  closureSuggestions?: AiClosureSuggestionResponse | null
  busy: string
  onClosureSuggestions?: () => void
}) {
  const closureLoading = busy === 'ai-closure-suggestions'

  return (
    <Card className='sysml-card'>
      <CardHeader>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <CardTitle>需求闭环建议</CardTitle>
            <CardDescription>基于当前模型识别缺少验证、约束或追踪闭环的需求。</CardDescription>
          </div>
          <div className='flex flex-wrap gap-2'>
            {onClosureSuggestions ? (
              <Button
                variant='outline'
                size='sm'
                onClick={onClosureSuggestions}
                disabled={closureLoading}
              >
                {closureLoading ? (
                  <Loader2 className='size-4 animate-spin' />
                ) : (
                  <Workflow className='size-4' />
                )}
                闭环建议
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        {closureLoading ? (
          <div className='flex items-center gap-2 text-sm text-muted-foreground'>
            <Loader2 className='size-4 animate-spin' />
            正在生成需求闭环建议
          </div>
        ) : closureSuggestions ? (
          <div className='rounded-md border bg-muted/20 p-4'>
            <div className='mb-3 flex items-center justify-between gap-2'>
              <div className='text-sm font-semibold'>AI 需求闭环建议</div>
              <Badge variant='secondary'>{closureSuggestions.suggestions.length}</Badge>
            </div>
            {closureSuggestions.suggestions.length ? (
              <div className='space-y-3'>
                {closureSuggestions.suggestions.slice(0, 4).map((item, index) => (
                  <div key={`${item.requirement_id}-${index}`} className='rounded-md border bg-background p-3'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <span className='font-mono text-sm font-semibold'>{item.requirement_id}</span>
                      {item.status ? <Badge variant='outline'>{item.status}</Badge> : null}
                    </div>
                    <p className='mt-2 text-sm text-muted-foreground'>
                      {item.rationale || item.requirement_name || '建议补齐验证、约束或关系闭环。'}
                    </p>
                    {item.missing?.length ? (
                      <div className='mt-2 flex flex-wrap gap-1.5'>
                        {item.missing.map((missing) => (
                          <Badge key={missing} variant='secondary' className='rounded-sm'>
                            {missing}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className='text-sm text-muted-foreground'>AI 没有返回可结构化的闭环建议。</p>
            )}
          </div>
        ) : (
          <EmptyState title='尚未生成建议' description='点击闭环建议后，会列出需要补齐验证、约束或关系的需求。' />
        )}
      </CardContent>
    </Card>
  )
}

function MultiCheckGrid({
  options,
  selected,
  onChange,
  label = (value: string) => value,
}: {
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  label?: (value: string) => string
}) {
  if (!options.length) {
    return (
      <div className='rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground'>
        No options available
      </div>
    )
  }
  return (
    <div className='grid max-h-[150px] gap-2 overflow-auto rounded-md border bg-muted/20 p-2 sm:grid-cols-2'>
      {options.map((option) => {
        const checked = selected.includes(option)
        return (
          <label
            key={option}
            className='flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-background'
          >
            <Checkbox
              checked={checked}
              onCheckedChange={(value) => {
                const next =
                  value === true
                    ? Array.from(new Set([...selected, option]))
                    : selected.filter((item) => item !== option)
                onChange(next)
              }}
            />
            <span className='truncate'>{label(option)}</span>
          </label>
        )
      })}
    </div>
  )
}

type DiagramTabProps = {
  diagram: DiagramPayload | null
  diagramType: string
  setDiagramType: (type: string) => void
  views: SysmlElement[]
  selectedViewId: string
  setSelectedViewId: (viewId: string) => void
  viewScope: ViewPayload | null
  metamodel: Metamodel | null
  elements: SysmlElement[]
  selectedId: string
  setSelectedId: (id: string) => void
  onRefresh: () => void
  onSaveElement: (
    element: SysmlElement,
    successMessage: string,
    nextSelectedId?: string
  ) => void
  diagramPositions: Record<string, { x: number; y: number }>
  onDiagramPositionsChange: (
    positions: Record<string, { x: number; y: number }>
  ) => void
  busy: string
}

function DiagramTab(props: DiagramTabProps) {
  return (
    <div className='grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]'>
      <Card className='sysml-card self-start xl:sticky xl:top-32'>
        <CardHeader>
          <CardTitle>图谱设置</CardTitle>
          <CardDescription>按不同 SysML 视角查看关系网络</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <Field label='View scope'>
            <Select
              value={props.selectedViewId}
              onValueChange={props.setSelectedViewId}
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All model elements</SelectItem>
                {props.views.map((view) => (
                  <SelectItem key={view.id} value={view.id}>
                    {view.name || view.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label='图谱类型'>
            <Select value={props.diagramType} onValueChange={props.setDiagramType}>
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(props.metamodel?.diagram_types || {}).map((type) => (
                  <SelectItem key={type} value={type}>
                    {displayDiagramNames[type] || type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {props.viewScope && (
            <div className='rounded-md border bg-muted/30 p-3 text-sm'>
              <div className='font-medium'>{props.viewScope.view.name}</div>
              <p className='mt-1 text-xs text-muted-foreground'>
                {props.viewScope.element_count} elements in this View /{' '}
                {Object.entries(props.viewScope.summary)
                  .map(([type, count]) => `${type}: ${count}`)
                  .join(', ') || 'No scoped elements'}
              </p>
            </div>
          )}
          <Button variant='outline' onClick={props.onRefresh}>
            <RefreshCw className='size-4' />
            刷新图谱
          </Button>
          <Separator />
          <div className='grid gap-2'>
            <p className='text-sm font-medium'>当前元素</p>
            <ScrollArea className='h-[260px] rounded-md border'>
              <div className='divide-y'>
                {props.elements.map((element) => (
                  <button
                    key={element.id}
                    type='button'
                    onClick={() => props.setSelectedId(element.id)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted',
                      props.selectedId === element.id && 'bg-muted'
                    )}
                  >
                    <span className='truncate font-mono'>{element.id}</span>
                    <Badge variant='outline'>{labelType(element.type)}</Badge>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>

      <Card className='sysml-card overflow-hidden'>
        <CardHeader>
          <div className='flex items-center justify-between gap-3'>
            <div>
              <CardTitle>
                {props.viewScope
                  ? `View Graph: ${props.viewScope.view.name || props.viewScope.view.id}`
                  : displayDiagramNames[props.diagramType] || 'Model Graph'}
              </CardTitle>
              <CardDescription>
                {props.diagram?.nodes.length || 0} 节点 / {props.diagram?.edges.length || 0} 关系
              </CardDescription>
            </div>
            <Badge variant='secondary'>React Flow</Badge>
          </div>
        </CardHeader>
        <CardContent className='p-0'>
          <DiagramCanvas
            diagram={props.diagram}
            elements={props.elements}
            selectedId={props.selectedId}
            onSelect={props.setSelectedId}
            metamodel={props.metamodel}
            onSaveElement={props.onSaveElement}
            diagramPositions={props.diagramPositions}
            onDiagramPositionsChange={props.onDiagramPositionsChange}
            busy={props.busy}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function DiagramCanvas({
  diagram,
  elements,
  selectedId,
  onSelect,
  metamodel,
  onSaveElement,
  diagramPositions,
  onDiagramPositionsChange,
  busy,
}: {
  diagram: DiagramPayload | null
  elements: SysmlElement[]
  selectedId: string
  onSelect: (id: string) => void
  metamodel: Metamodel | null
  onSaveElement: (
    element: SysmlElement,
    successMessage: string,
    nextSelectedId?: string
  ) => void
  diagramPositions: Record<string, { x: number; y: number }>
  onDiagramPositionsChange: (
    positions: Record<string, { x: number; y: number }>
  ) => void
  busy: string
}) {
  const [nodes, setNodes] = useState<SysmlFlowNode[]>([])
  const [edges, setEdges] = useState<SysmlFlowEdge[]>([])
  const [selectedEdgeId, setSelectedEdgeId] = useState('')
  const [edgeRelationType, setEdgeRelationType] = useState('')
  const relationTypes = Object.keys(metamodel?.relation_labels || relationNames)
  const elementMap = useMemo(
    () => new Map(elements.map((element) => [element.id, element])),
    [elements]
  )

  const editNode = useCallback(
    (id: string) => {
      const element = elementMap.get(id)
      if (!element) return
      const nextName = window.prompt('节点名称', element.name || '')
      if (nextName === null) return
      const nextDescription = window.prompt(
        '节点描述',
        element.description || ''
      )
      if (nextDescription === null) return
      onSaveElement(
        {
          ...element,
          name: nextName.trim() || element.name,
          description: nextDescription.trim(),
        },
        '节点已更新',
        element.id
      )
    },
    [elementMap, onSaveElement]
  )

  const nodeTypes = useMemo(() => ({ sysml: SysmlFlowNodeCard }), [])

  useEffect(() => {
    if (!diagram) {
      setNodes([])
      setEdges([])
      setSelectedEdgeId('')
      return
    }

    setNodes(
      layoutDiagramNodes(diagram, elements).map((node) => {
        const element = elementMap.get(node.id)
        const position = diagramPositions[node.id] || node.position
        return {
          id: node.id,
          type: 'sysml',
          position,
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          width: nodeWidth,
          height: nodeHeight,
          selected: selectedId === node.id,
          data: {
            element: element || {
              id: node.id,
              type: node.type,
              name: node.name,
              stereotype: node.type.toLowerCase(),
              description: '',
              owner: '',
              attributes: {},
              relations: [],
            },
            label: node.label,
            onEdit: editNode,
          },
        }
      })
    )
    const edgeCounts = new Map<string, number>()
    setEdges(
      diagram.edges.map((edge, index) => {
        const pairKey = `${edge.source}->${edge.target}`
        const parallelIndex = edgeCounts.get(pairKey) || 0
        edgeCounts.set(pairKey, parallelIndex + 1)
        return {
          id: edgeId(edge.source, edge.target, edge.type, index),
          source: edge.source,
          target: edge.target,
          type: 'smoothstep',
          label: labelRelation(edge.type),
          sourceHandle: 'out',
          targetHandle: 'in',
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 18,
            height: 18,
          },
          reconnectable: true,
          style: {
            stroke: edgeColor(edge.type),
            strokeWidth: 1.6,
          },
          labelStyle: {
            fill: 'var(--muted-foreground)',
            fontSize: 12,
            fontWeight: 500,
          },
          labelBgStyle: {
            fill: 'var(--background)',
            fillOpacity: 0.92,
          },
          labelBgPadding: [8, 4],
          labelBgBorderRadius: 4,
          pathOptions: {
            borderRadius: 12,
            offset: 32 + parallelIndex * 18,
          },
          data: {
            relationType: edge.type,
            relationLabel: labelRelation(edge.type),
          },
        }
      })
    )
  }, [diagram, diagramPositions, editNode, elementMap, selectedId])

  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId)

  useEffect(() => {
    setEdgeRelationType(selectedEdge?.data?.relationType || relationTypes[0] || '')
  }, [relationTypes, selectedEdge?.data?.relationType])

  const onNodesChange: OnNodesChange<SysmlFlowNode> = useCallback(
    (changes: NodeChange<SysmlFlowNode>[]) => {
      setNodes((current) => applyNodeChanges(changes, current))
      const moved = changes.reduce<Record<string, { x: number; y: number }>>(
        (acc, change) => {
          if (change.type === 'position' && change.position) {
            acc[change.id] = change.position
          }
          return acc
        },
        {}
      )
      if (Object.keys(moved).length) onDiagramPositionsChange(moved)
    },
    [onDiagramPositionsChange]
  )

  const onEdgesChange: OnEdgesChange<SysmlFlowEdge> = useCallback(
    (changes: EdgeChange<SysmlFlowEdge>[]) => {
      const removed = changes.find((change) => change.type === 'remove')
      if (removed) {
        const edge = edges.find((item) => item.id === removed.id)
        if (edge) removeRelationEdge(edge, elementMap, onSaveElement)
        if (selectedEdgeId === removed.id) setSelectedEdgeId('')
      }
      setEdges((current) => applyEdgeChanges(changes, current))
    },
    [edges, elementMap, onSaveElement, selectedEdgeId]
  )

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      const relationType = edgeRelationType || relationTypes[0] || 'satisfy'
      const source = elementMap.get(connection.source)
      if (!source) return
      const relationExists = (source.relations || []).some(
        (relation) =>
          relation.type === relationType && relation.target === connection.target
      )
      if (relationExists) {
        toast.info('该关系已存在')
        return
      }
      const nextEdge: SysmlFlowEdge = {
        id: edgeId(connection.source, connection.target, relationType, edges.length),
        source: connection.source,
        target: connection.target,
        type: 'smoothstep',
        label: labelRelation(relationType),
        sourceHandle: connection.sourceHandle || 'out',
        targetHandle: connection.targetHandle || 'in',
        markerEnd: { type: MarkerType.ArrowClosed },
        reconnectable: true,
        style: {
          stroke: edgeColor(relationType),
          strokeWidth: 1.6,
        },
        labelStyle: {
          fill: 'var(--muted-foreground)',
          fontSize: 12,
          fontWeight: 500,
        },
        labelBgStyle: {
          fill: 'var(--background)',
          fillOpacity: 0.92,
        },
        labelBgPadding: [8, 4],
        labelBgBorderRadius: 4,
        pathOptions: {
          borderRadius: 12,
          offset: 32,
        },
        data: {
          relationType,
          relationLabel: labelRelation(relationType),
        },
      }
      setEdges((current) => addEdge(nextEdge, current))
      onSaveElement(
        {
          ...source,
          relations: [
            ...(source.relations || []),
            { type: relationType, target: connection.target },
          ],
        },
        '关系已添加',
        source.id
      )
    },
    [edgeRelationType, edges.length, elementMap, onSaveElement, relationTypes]
  )

  const onReconnect: OnReconnect<SysmlFlowEdge> = useCallback(
    (oldEdge, connection) => {
      if (!connection.source || !connection.target) return
      const relationType = oldEdge.data?.relationType || edgeRelationType || 'satisfy'
      const oldSource = elementMap.get(oldEdge.source)
      const nextSource = elementMap.get(connection.source)
      if (!oldSource || !nextSource) return
      setEdges((current) => reconnectEdge(oldEdge, connection, current))
      const withoutOldRelation = (oldSource.relations || []).filter(
        (relation) =>
          !(
            relation.type === relationType &&
            relation.target === oldEdge.target
          )
      )
      if (oldSource.id === nextSource.id) {
        onSaveElement(
          {
            ...oldSource,
            relations: [
              ...withoutOldRelation,
              { type: relationType, target: connection.target },
            ],
          },
          '关系已重连',
          oldSource.id
        )
        return
      }
      onSaveElement(
        { ...oldSource, relations: withoutOldRelation },
        '原关系已移除',
        nextSource.id
      )
      window.setTimeout(() => {
        onSaveElement(
          {
            ...nextSource,
            relations: [
              ...(nextSource.relations || []),
              { type: relationType, target: connection.target },
            ],
          },
          '关系已重连',
          nextSource.id
        )
      }, 0)
    },
    [edgeRelationType, elementMap, onSaveElement]
  )

  if (!diagram || !diagram.nodes.length) {
    return (
      <div className='h-[560px] bg-muted/30'>
        <EmptyState title='暂无图谱' description='当前模型没有可绘制的节点' />
      </div>
    )
  }

  return (
    <div className='h-[620px] bg-muted/30'>
      <ReactFlow<SysmlFlowNode, SysmlFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onNodeClick={(_, node) => onSelect(node.id)}
        onNodeDoubleClick={(_, node) => editNode(node.id)}
        onEdgeClick={(_, edge) => {
          setSelectedEdgeId(edge.id)
          setEdgeRelationType(edge.data?.relationType || relationTypes[0] || '')
        }}
        fitView
        fitViewOptions={{ padding: 0.08, maxZoom: 1.05 }}
        minZoom={0.35}
        maxZoom={2.5}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        nodesDraggable
        nodesConnectable
        edgesReconnectable
        connectionRadius={32}
        defaultEdgeOptions={{
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed },
          interactionWidth: 24,
        }}
        className='sysml-flow'
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1.2}
          color='var(--border)'
        />
        <MiniMap
          pannable
          zoomable
          style={{ width: 160, height: 110 }}
          nodeBorderRadius={8}
          nodeColor={(node) =>
            node.selected ? 'var(--primary)' : 'var(--muted-foreground)'
          }
          maskColor='color-mix(in oklch, var(--background) 70%, transparent)'
        />
        <Controls position='bottom-left' />
        <div className='nodrag nowheel absolute right-3 top-3 z-10 grid w-[220px] gap-3 rounded-md border bg-background/95 p-3 shadow-sm backdrop-blur'>
          <Field label='新连线类型'>
            <Select value={edgeRelationType} onValueChange={setEdgeRelationType}>
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='选择关系' />
              </SelectTrigger>
              <SelectContent>
                {relationTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {labelRelation(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {selectedEdge ? (
            <div className='grid gap-2 border-t pt-3'>
              <div className='min-w-0 text-xs text-muted-foreground'>
                已选关系：{selectedEdge.source} {'->'} {selectedEdge.target}
              </div>
              <div className='flex gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={busy === 'diagram-edit'}
                  onClick={() => {
                    const source = elementMap.get(selectedEdge.source)
                    if (!source) return
                    const oldType = selectedEdge.data?.relationType || ''
                    const nextRelations = (source.relations || []).map(
                      (relation) =>
                        relation.type === oldType &&
                        relation.target === selectedEdge.target
                          ? { ...relation, type: edgeRelationType }
                          : relation
                    )
                    onSaveElement(
                      { ...source, relations: nextRelations },
                      '关系类型已更新',
                      source.id
                    )
                  }}
                >
                  保存类型
                </Button>
                <Button
                  variant='destructive'
                  size='sm'
                  disabled={busy === 'diagram-edit'}
                  onClick={() => {
                    removeRelationEdge(selectedEdge, elementMap, onSaveElement)
                    setEdges((current) =>
                      current.filter((edge) => edge.id !== selectedEdge.id)
                    )
                    setSelectedEdgeId('')
                  }}
                >
                  删除关系
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </ReactFlow>
    </div>
  )
}

function SysmlFlowNodeCard({ data, selected }: NodeProps<SysmlFlowNode>) {
  const element = data.element
  return (
    <div
      className={cn(
        'group w-[230px] rounded-md border bg-background shadow-sm transition-all',
        selected && 'border-primary shadow-md ring-2 ring-ring/25'
      )}
    >
      <Handle
        type='target'
        id='in'
        position={Position.Left}
        className='!h-3 !w-3 !border-2 !border-background !bg-primary'
      />
      <div className='grid w-full gap-2 p-3'>
        <div className='flex min-w-0 items-start justify-between gap-2'>
          <span className='truncate font-mono text-xs font-semibold'>
            {element.id}
          </span>
          <div className='flex shrink-0 items-center gap-1'>
            <span
              className='rounded-sm px-1.5 py-0.5 text-[10px] font-medium'
              style={{
                background: `${nodeAccentColor(element.type)}22`,
                color: nodeAccentColor(element.type),
              }}
            >
              {labelType(element.type)}
            </span>
            <button
              type='button'
              className='nodrag rounded-sm p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100'
              onClick={() => data.onEdit(element.id)}
              title='编辑节点'
            >
              <Edit3 className='size-3.5' />
            </button>
          </div>
        </div>
        <div className='line-clamp-2 text-sm font-medium'>
          {element.name || '未命名元素'}
        </div>
        <p className='line-clamp-2 text-xs text-muted-foreground'>
          {element.description || data.label || '暂无描述'}
        </p>
      </div>
      <Handle
        type='source'
        id='out'
        position={Position.Right}
        className='!h-3 !w-3 !border-2 !border-background !bg-primary'
      />
    </div>
  )
}

function layoutDiagramNodes(diagram: DiagramPayload, elements: SysmlElement[]) {
  const elementMap = new Map(elements.map((element) => [element.id, element]))
  const incoming = new Map<string, number>()
  const outgoing = new Map<string, number>()
  diagram.nodes.forEach((node) => {
    incoming.set(node.id, 0)
    outgoing.set(node.id, 0)
  })
  diagram.edges.forEach((edge) => {
    outgoing.set(edge.source, (outgoing.get(edge.source) || 0) + 1)
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1)
  })

  const columns = buildDiagramColumns(diagram.type)
  const columnIndex = new Map<string, number>()
  columns.forEach((types, index) => {
    types.forEach((type) => columnIndex.set(type, index))
  })

  const grouped = new Map<number, DiagramPayload['nodes']>()
  diagram.nodes.forEach((node) => {
    const element = elementMap.get(node.id)
    const type = element?.type || node.type
    const fallbackColumn = Math.max(
      0,
      Math.min(columns.length - 1, Math.round((node.x - 90) / 230))
    )
    const column = columnIndex.get(type) ?? fallbackColumn
    const items = grouped.get(column) || []
    items.push(node)
    grouped.set(column, items)
  })

  return diagram.nodes.map((node) => {
    const element = elementMap.get(node.id)
    const type = element?.type || node.type
    const fallbackColumn = Math.max(
      0,
      Math.min(columns.length - 1, Math.round((node.x - 90) / 230))
    )
    const column = columnIndex.get(type) ?? fallbackColumn
    const peers = (grouped.get(column) || []).sort((left, right) => {
      const leftScore =
        (incoming.get(left.id) || 0) * 2 + (outgoing.get(left.id) || 0)
      const rightScore =
        (incoming.get(right.id) || 0) * 2 + (outgoing.get(right.id) || 0)
      if (rightScore !== leftScore) return rightScore - leftScore
      return left.id.localeCompare(right.id)
    })
    const row = peers.findIndex((peer) => peer.id === node.id)
    const columnWidth = 290
    const rowHeight = 132
    const offset = (column % 2) * 24
    return {
      ...node,
      position: {
        x: 60 + column * columnWidth,
        y: 48 + Math.max(row, 0) * rowHeight + offset,
      },
    }
  })
}

function buildDiagramColumns(diagramType: string) {
  if (diagramType === 'requirements') {
    return [
      ['Requirement'],
      ['Activity', 'Block', 'Interface'],
      ['Constraint', 'TestCase'],
    ]
  }
  if (diagramType === 'structure') {
    return [['Block'], ['Port'], ['Interface'], ['Constraint']]
  }
  if (diagramType === 'behavior') {
    return [['Activity'], ['State'], ['Block']]
  }
  return [
    ['Requirement'],
    ['Activity'],
    ['Block'],
    ['Port', 'Interface'],
    ['Constraint', 'TestCase', 'State', 'View'],
  ]
}

function edgeColor(type: string) {
  const colors: Record<string, string> = {
    satisfy: 'oklch(0.55 0.15 150)',
    verify: 'oklch(0.58 0.15 245)',
    refine: 'oklch(0.57 0.16 35)',
    compose: 'oklch(0.5 0.12 260)',
    expose: 'oklch(0.56 0.13 190)',
    connect: 'oklch(0.52 0.11 210)',
    allocate: 'oklch(0.58 0.14 300)',
    flow: 'oklch(0.6 0.15 70)',
    transition: 'oklch(0.55 0.16 20)',
    constrain: 'oklch(0.52 0.13 330)',
  }
  return colors[type] || 'var(--muted-foreground)'
}

function nodeAccentColor(type: string) {
  const colors: Record<string, string> = {
    Requirement: 'oklch(0.55 0.15 150)',
    Block: 'oklch(0.5 0.12 260)',
    Activity: 'oklch(0.58 0.14 300)',
    Interface: 'oklch(0.52 0.11 210)',
    Port: 'oklch(0.56 0.13 190)',
    Constraint: 'oklch(0.52 0.13 330)',
    State: 'oklch(0.55 0.16 20)',
    TestCase: 'oklch(0.58 0.15 245)',
    View: 'oklch(0.55 0.1 95)',
    Viewpoint: 'oklch(0.58 0.12 75)',
  }
  return colors[type] || 'var(--muted-foreground)'
}

function edgeId(source: string, target: string, type: string, index: number) {
  return `${source}--${type}--${target}--${index}`
}

function removeRelationEdge(
  edge: SysmlFlowEdge,
  elementMap: Map<string, SysmlElement>,
  onSaveElement: (
    element: SysmlElement,
    successMessage: string,
    nextSelectedId?: string
  ) => void
) {
  const source = elementMap.get(edge.source)
  if (!source) return
  const relationType = edge.data?.relationType || ''
  onSaveElement(
    {
      ...source,
      relations: (source.relations || []).filter(
        (relation) =>
          !(relation.type === relationType && relation.target === edge.target)
      ),
    },
    '关系已删除',
    source.id
  )
}

function TraceTab({
  traceability,
  busy,
  onRefresh,
}: {
  traceability: TraceabilityRow[]
  busy: string
  onRefresh: () => void
}) {
  const closedCount = traceability.filter((row) => row.status === 'closed').length
  const partialCount = traceability.filter((row) => row.status === 'partial').length
  const openCount = traceability.length - closedCount - partialCount

  return (
    <Card className='sysml-card overflow-hidden'>
      <CardHeader className='bg-muted/20'>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <CardTitle>需求追踪矩阵</CardTitle>
            <CardDescription>查看需求到模块、测试、约束的闭环情况</CardDescription>
          </div>
          <Button variant='outline' onClick={onRefresh} disabled={busy === 'trace'}>
            {busy === 'trace' ? (
              <Loader2 className='size-4 animate-spin' />
            ) : (
              <RefreshCw className='size-4' />
            )}
            刷新
          </Button>
        </div>
      </CardHeader>
      <CardContent className='space-y-4 p-4'>
        <div className='grid gap-3 md:grid-cols-4'>
          <TraceSummaryTile label='需求' value={traceability.length} />
          <TraceSummaryTile label='已闭环' value={closedCount} tone='success' />
          <TraceSummaryTile label='部分闭环' value={partialCount} tone='warning' />
          <TraceSummaryTile label='未闭环' value={openCount} tone='danger' />
        </div>
        {traceability.length ? (
          <div className='divide-y rounded-2xl bg-muted/25'>
            {traceability.map((row) => (
              <div
                key={row.requirement.id}
                className='grid gap-4 p-4 lg:grid-cols-[minmax(220px,1.2fr)_repeat(3,minmax(0,1fr))_auto]'
              >
                <div className='min-w-0'>
                  <div className='font-mono text-sm font-semibold'>
                    {row.requirement.id}
                  </div>
                  <div className='mt-1 truncate text-sm text-muted-foreground'>
                    {row.requirement.name}
                  </div>
                </div>
                <TraceRefBlock label='满足' refs={row.satisfied_by} />
                <TraceRefBlock label='验证' refs={row.verified_by} />
                <TraceRefBlock label='约束' refs={row.constrained_by || []} />
                <div className='flex items-start justify-end'>
                  <TraceBadge status={row.status} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title='暂无追踪数据' description='点击刷新加载追踪矩阵' />
        )}
      </CardContent>
    </Card>
  )
}

function TraceSummaryTile({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number
  tone?: 'default' | 'success' | 'warning' | 'danger'
}) {
  return (
    <div
      className={cn(
        'rounded-2xl bg-muted/35 p-4',
        tone === 'success' && 'bg-emerald-500/10 text-emerald-700',
        tone === 'warning' && 'bg-amber-500/10 text-amber-700',
        tone === 'danger' && value > 0 && 'bg-destructive/10 text-destructive'
      )}
    >
      <div className='text-2xl font-semibold leading-none'>{value}</div>
      <div className='mt-1 text-xs text-muted-foreground'>{label}</div>
    </div>
  )
}

function TraceRefBlock({
  label,
  refs,
}: {
  label: string
  refs: { id: string; name: string }[]
}) {
  return (
    <div className='min-w-0'>
      <div className='mb-1 text-xs font-medium text-muted-foreground'>{label}</div>
      <div className='truncate text-sm'>{formatRefs(refs)}</div>
    </div>
  )
}

type VersionTabProps = {
  currentBranch: string
  elements: SysmlElement[]
  validation: ValidationPayload | null
  branches: Branch[]
  commits: Commit[]
  auditEvents: AuditEvent[]
  diff: DiffPayload | null
  aiImpact: AiVersionImpact | null
  diffFrom: string
  setDiffFrom: (value: string) => void
  diffTo: string
  setDiffTo: (value: string) => void
  rollbackCommit: string
  setRollbackCommit: (value: string) => void
  newBranch: string
  setNewBranch: (value: string) => void
  mergeSource: string
  setMergeSource: (value: string) => void
  forceMerge: boolean
  setForceMerge: (value: boolean) => void
  onRefresh: () => void
  onExport: (format: 'json' | 'xmi') => void
  onCommit: () => void
  onDiff: () => void
  onAiImpact: () => void
  onRollback: () => void
  onCreateBranch: () => void
  onDeleteCommit: (commitId: string) => void
  onMerge: () => void
  busy: string
}

function VersionTab(props: VersionTabProps) {
  const currentBranch =
    props.branches.find((item) => item.name === props.currentBranch) ||
    props.branches[0]
  const currentCommit = props.commits[0]
  const requirementCount = props.elements.filter(
    (item) => item.type === 'Requirement'
  ).length
  const blockCount = props.elements.filter((item) => item.type === 'Block').length
  const issueCount =
    (props.validation?.summary.errors || 0) +
    (props.validation?.summary.warnings || 0)
  const diffLabel = props.diff
    ? `+${props.diff.summary.added} -${props.diff.summary.removed} ~${props.diff.summary.modified}`
    : '未运行'
  const rollbackLabel =
    props.commits.find((commit) => commit.id === props.rollbackCommit)?.message ||
    '未选择'
  const mergeLabel = props.mergeSource || '未选择'
  const commitOptions = [
    { id: 'working', label: '当前工作区（未提交）' },
    ...props.commits.map((commit) => ({
      id: commit.id,
      label: `提交：${shortLabel(commit.id, 12)} / ${shortLabel(commit.message, 30)}`,
    })),
  ]
  const canRunDiff = props.diffFrom !== props.diffTo
  const canCreateBranch = Boolean(props.newBranch.trim())
  const canRollback = Boolean(props.rollbackCommit)
  const canMerge = Boolean(
    props.mergeSource && props.mergeSource !== props.currentBranch
  )
  return (
    <div className='space-y-4'>
      <Card className='sysml-card overflow-hidden'>
        <CardHeader className='bg-muted/20'>
          <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
            <div>
              <CardTitle>当前版本</CardTitle>
              <CardDescription>
                先提交当前模型，再比较、开分支、回滚或合并变更
              </CardDescription>
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant='secondary'>当前分支 / {props.currentBranch}</Badge>
              {currentCommit && (
                <Badge variant='outline'>最新提交 / {shortLabel(currentCommit.id, 14)}</Badge>
              )}
              <Button
                variant='outline'
                size='sm'
                className='rounded-xl bg-background'
                onClick={() => props.onExport('json')}
                disabled={props.busy === 'export-json'}
              >
                <Download className='size-4' />
                JSON
              </Button>
              <Button
                variant='outline'
                size='sm'
                className='rounded-xl bg-background'
                onClick={() => props.onExport('xmi')}
                disabled={props.busy === 'export-xmi'}
              >
                <Code2 className='size-4' />
                XMI
              </Button>
              <Button
                size='sm'
                className='rounded-xl'
                onClick={props.onCommit}
                disabled={props.busy === 'commit'}
              >
                <GitCommitHorizontal className='size-4' />
                提交当前状态
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className='space-y-4 p-4'>
          <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6'>
            <LocalMetric label='当前元素' value={props.elements.length} />
            <LocalMetric label='需求' value={requirementCount} />
            <LocalMetric label='结构块' value={blockCount} />
            <LocalMetric label='提交' value={props.commits.length} />
            <LocalMetric
              label='校验问题'
              value={issueCount}
              tone={
                props.validation?.summary.errors
                  ? 'danger'
                  : issueCount
                    ? 'warning'
                    : 'success'
              }
            />
          </div>
          <div className='grid gap-3 lg:grid-cols-4'>
            <VersionContextItem
              label='当前 HEAD'
              value={currentBranch?.head ? shortLabel(currentBranch.head, 18) : '-'}
              description={`${currentBranch?.elements ?? props.elements.length} elements / ${currentBranch?.documents ?? 0} docs`}
            />
            <VersionContextItem
              label='Diff 选择'
              value={`${shortLabel(props.diffFrom, 16)} → ${shortLabel(props.diffTo, 16)}`}
              description={`结果：${diffLabel}`}
            />
            <VersionContextItem
              label='回滚目标'
              value={shortLabel(props.rollbackCommit || rollbackLabel, 24)}
              description={rollbackLabel}
            />
            <VersionContextItem
              label='合并来源'
              value={mergeLabel}
              description={props.forceMerge ? '冲突时强制合并' : '普通合并，冲突会阻止写入'}
            />
          </div>
        </CardContent>
      </Card>

      <Card className='sysml-card overflow-hidden'>
        <CardHeader className='bg-muted/20'>
          <div className='flex items-center justify-between'>
            <div>
              <CardTitle>版本操作</CardTitle>
              <CardDescription>常用操作在左侧，回滚和合并放在谨慎操作区</CardDescription>
            </div>
            <Button variant='outline' size='sm' onClick={props.onRefresh}>
              <RefreshCw className='size-4' />
            </Button>
          </div>
        </CardHeader>
        <CardContent className='grid gap-4 p-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]'>
          <div className='space-y-4'>
            <div className='rounded-2xl border bg-background p-4'>
              <VersionActionTitle
                icon={GitCompare}
                title='1. 比较两个版本'
                description='先选旧版本和新版本，查看新增、删除和修改内容'
              />
              <div className='mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-end'>
                <Field label='旧版本'>
                  <Select value={props.diffFrom} onValueChange={props.setDiffFrom}>
                    <SelectTrigger className='w-full min-w-0 overflow-hidden [&>span]:truncate'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {commitOptions.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <ArrowRight className='mb-3 hidden size-4 text-muted-foreground md:block' />
                <Field label='新版本'>
                  <Select value={props.diffTo} onValueChange={props.setDiffTo}>
                    <SelectTrigger className='w-full min-w-0 overflow-hidden [&>span]:truncate'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {commitOptions.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className='mt-4 flex flex-col gap-2 sm:flex-row'>
                <Button
                  onClick={props.onDiff}
                  disabled={props.busy === 'diff' || !canRunDiff}
                >
                  <GitCompare className='size-4' />
                  查看差异
                </Button>
                <Button
                  variant='secondary'
                  onClick={props.onAiImpact}
                  disabled={props.busy === 'ai-version-impact' || !canRunDiff}
                >
                  {props.busy === 'ai-version-impact' ? (
                    <Loader2 className='size-4 animate-spin' />
                  ) : (
                    <Sparkles className='size-4' />
                  )}
                  分析变更影响
                </Button>
              </div>
              {!canRunDiff && (
                <p className='mt-2 text-xs text-muted-foreground'>
                  请选择两个不同版本后再比较。
                </p>
              )}
            </div>

            <div className='rounded-2xl border bg-background p-4'>
              <VersionActionTitle
                icon={GitBranch}
                title='2. 创建工作分支'
                description='从当前分支复制一条并行工作线，适合试验或多人协作'
              />
              <div className='mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end'>
                <Field label='新分支名称'>
                  <Input
                    placeholder='例如：dev-power'
                    value={props.newBranch}
                    onChange={(event) => props.setNewBranch(event.target.value)}
                  />
                </Field>
                <Button
                  variant='outline'
                  onClick={props.onCreateBranch}
                  disabled={props.busy === 'branch' || !canCreateBranch}
                >
                  <GitBranch className='size-4' />
                  从当前分支创建
                </Button>
              </div>
            </div>
          </div>

          <div className='space-y-4'>
            <div className='rounded-2xl border border-destructive/20 bg-destructive/5 p-4'>
              <VersionActionTitle
                icon={RotateCcw}
                title='谨慎：回滚当前分支'
                description='把当前分支恢复到某次提交，之后的工作区内容会被覆盖'
              />
              <div className='mt-4 grid gap-3'>
                <Field label='回滚到'>
                  <Select
                    value={props.rollbackCommit}
                    onValueChange={props.setRollbackCommit}
                  >
                    <SelectTrigger className='w-full min-w-0 overflow-hidden bg-background [&>span]:truncate'>
                      <SelectValue placeholder='选择提交' />
                    </SelectTrigger>
                    <SelectContent>
                      {props.commits.map((commit) => (
                        <SelectItem key={commit.id} value={commit.id}>
                          {shortLabel(commit.id, 12)} / {commit.message}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Button
                  variant='destructive'
                  onClick={props.onRollback}
                  disabled={props.busy === 'rollback' || !canRollback}
                >
                  <RotateCcw className='size-4' />
                  回滚到所选提交
                </Button>
              </div>
            </div>

            <div className='rounded-2xl border bg-background p-4'>
              <VersionActionTitle
                icon={GitMerge}
                title='合并其他分支'
                description='把来源分支的变更并入当前分支'
              />
              <div className='mt-4 grid gap-3'>
                <Field label='来源分支'>
                  <Select
                    value={props.mergeSource}
                    onValueChange={props.setMergeSource}
                  >
                    <SelectTrigger className='w-full min-w-0 overflow-hidden [&>span]:truncate'>
                      <SelectValue placeholder='选择一个非当前分支' />
                    </SelectTrigger>
                    <SelectContent>
                      {props.branches
                        .filter((item) => item.name !== props.currentBranch)
                        .map((item) => (
                          <SelectItem key={item.name} value={item.name}>
                            {item.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </Field>
                <label className='flex items-start gap-2 rounded-xl border bg-muted/20 p-3 text-sm'>
                  <Checkbox
                    className='mt-0.5'
                    checked={props.forceMerge}
                    onCheckedChange={(checked) =>
                      props.setForceMerge(Boolean(checked))
                    }
                  />
                  <span>
                    <span className='font-medium'>强制处理冲突</span>
                    <span className='block text-xs text-muted-foreground'>
                      仅在你确认来源分支内容应覆盖冲突时启用。
                    </span>
                  </span>
                </label>
                <Button
                  variant='outline'
                  onClick={props.onMerge}
                  disabled={props.busy === 'merge' || !canMerge}
                >
                  <GitMerge className='size-4' />
                  合并到 {props.currentBranch}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className='space-y-4'>
        <Card className='sysml-card'>
          <CardHeader>
            <div className='flex items-center justify-between gap-3'>
              <div>
                <CardTitle>Diff 结果</CardTitle>
                <CardDescription>
                  {props.diff
                    ? `+${props.diff.summary.added} -${props.diff.summary.removed} ~${props.diff.summary.modified}`
                    : '尚未运行 Diff'}
                </CardDescription>
              </div>
              {props.diff && (
                <Badge variant='secondary'>
                  {props.diff.from} → {props.diff.to}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {props.diff ? (
              <div className='grid gap-4 md:grid-cols-3'>
                <DiffGroup title='新增' items={props.diff.added} />
                <DiffGroup title='删除' items={props.diff.removed} />
                <div className='rounded-md border p-3'>
                  <h3 className='mb-2 text-sm font-semibold'>修改</h3>
                  <div className='space-y-2 text-sm'>
                    {props.diff.modified.length ? (
                      props.diff.modified.map((item) => (
                        <div key={item.id} className='rounded-md bg-muted p-2'>
                          <div className='font-mono font-medium'>{item.id}</div>
                          <p className='text-xs text-muted-foreground'>
                            {item.changes.map((change) => change.field).join(', ')}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className='text-muted-foreground'>无</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState title='等待 Diff' description='选择两个版本后运行 Diff' />
            )}
          </CardContent>
        </Card>

        <Card className='sysml-card'>
          <CardHeader>
            <div className='flex items-center justify-between gap-3'>
              <div>
                <CardTitle>AI 变更影响分析</CardTitle>
                <CardDescription>
                  {props.aiImpact
                    ? `${props.aiImpact.from} → ${props.aiImpact.to}`
                    : '基于版本差异分析追踪、文档和审查风险'}
                </CardDescription>
              </div>
              <Badge variant='outline'>Impact</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {props.busy === 'ai-version-impact' ? (
              <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                <Loader2 className='size-4 animate-spin' />
                正在分析变更影响
              </div>
            ) : props.aiImpact ? (
              <div className='rounded-md border bg-muted/20 p-4'>
                <MarkdownMessage content={props.aiImpact.analysis} />
              </div>
            ) : (
              <EmptyState title='尚未运行 AI 影响分析' description='选择版本后点击 AI 影响分析' />
            )}
          </CardContent>
        </Card>

      <div className='grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]'>
          <Card className='sysml-card'>
            <CardHeader>
              <CardTitle>提交记录</CardTitle>
              <CardDescription>
                {props.commits.length} 条版本；删除版本只移除历史快照，不删除当前工作区内容
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className='h-[320px]'>
                <div className='space-y-3'>
                  {props.commits.length ? (
                    props.commits.map((commit) => (
                      <div key={commit.id} className='rounded-md border p-3'>
                        <div className='flex items-start justify-between gap-3'>
                          <div className='min-w-0'>
                            <div className='break-all font-mono text-sm font-semibold'>
                              {commit.id}
                            </div>
                            <p className='mt-1 text-sm'>{commit.message}</p>
                          </div>
                          <Button
                            variant='outline'
                            size='sm'
                            className='shrink-0 text-destructive hover:text-destructive'
                            onClick={() => props.onDeleteCommit(commit.id)}
                            disabled={props.busy === `delete-commit-${commit.id}`}
                          >
                            {props.busy === `delete-commit-${commit.id}` ? (
                              <Loader2 className='size-4 animate-spin' />
                            ) : (
                              <Trash2 className='size-4' />
                            )}
                            删除版本
                          </Button>
                        </div>
                        <p className='mt-1 text-xs text-muted-foreground'>
                          {commit.branch} / {commit.author} / {commit.created_at} /{' '}
                          {commit.element_count} elements
                        </p>
                      </div>
                    ))
                  ) : (
                    <EmptyState
                      title='暂无版本'
                      description='点击“提交当前状态”后会在这里生成版本记录'
                    />
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
          <Card className='sysml-card'>
            <CardHeader>
              <CardTitle>审计日志</CardTitle>
              <CardDescription>{props.auditEvents.length} 条事件</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className='h-[320px]'>
                <div className='space-y-3'>
                  {props.auditEvents.map((event, index) => (
                    <div key={`${event.created_at}-${index}`} className='rounded-md border p-3'>
                      <div className='text-sm font-semibold'>{event.action}</div>
                      <p className='mt-1 text-xs text-muted-foreground'>
                        {event.branch_name || '-'} / {event.actor} / {event.created_at}
                      </p>
                      {event.element_id && (
                        <p className='mt-1 font-mono text-xs'>{event.element_id}</p>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function DiffGroup({ title, items }: { title: string; items: SysmlElement[] }) {
  return (
    <div className='rounded-md border p-3'>
      <h3 className='mb-2 text-sm font-semibold'>{title}</h3>
      <div className='space-y-2 text-sm'>
        {items.length ? (
          items.map((item) => (
            <div key={item.id} className='rounded-md bg-muted p-2'>
              <div className='font-mono font-medium'>{item.id}</div>
              <p className='truncate text-xs text-muted-foreground'>
                {labelType(item.type)} / {item.name}
              </p>
            </div>
          ))
        ) : (
          <p className='text-muted-foreground'>无</p>
        )}
      </div>
    </div>
  )
}

function VersionContextItem({
  label,
  value,
  description,
}: {
  label: string
  value: string
  description: string
}) {
  return (
    <div className='rounded-2xl bg-muted/25 p-3'>
      <div className='text-xs font-medium text-muted-foreground'>{label}</div>
      <div className='mt-1 truncate text-sm font-semibold'>{value}</div>
      <p className='mt-1 line-clamp-2 text-xs text-muted-foreground'>
        {description}
      </p>
    </div>
  )
}

function VersionActionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof GitCompare
  title: string
  description: string
}) {
  return (
    <div className='flex items-start gap-2'>
      <div className='mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground'>
        <Icon className='size-3.5' />
      </div>
      <div>
        <div className='text-sm font-semibold'>{title}</div>
        <p className='text-xs text-muted-foreground'>{description}</p>
      </div>
    </div>
  )
}

type DocgenTabProps = {
  template: string
  setTemplate: (value: string) => void
  elements: SysmlElement[]
  views: SysmlElement[]
  docViewId: string
  setDocViewId: (value: string) => void
  validation: ValidationPayload | null
  documents: DocumentRecord[]
  currentDocument: DocumentRecord | null
  aiDocumentReview: AiDocumentQualityReview | null
  onReset: () => void
  onGenerate: () => void
  onAiDraft: (mode: AiDocgenMode) => void
  onAiDocumentReview: () => void
  onOpen: (id: string) => void
  onDownload: (format: 'html' | 'markdown' | 'pdf' | 'docx') => void
  busy: string
}

function DocgenTab(props: DocgenTabProps) {
  const selectedView = props.views.find((view) => view.id === props.docViewId)
  const issueCount =
    (props.validation?.summary.errors || 0) +
    (props.validation?.summary.warnings || 0)
  const scopeLabel = selectedView?.name || selectedView?.id || 'Full model'

  return (
    <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]'>
      <Card className='sysml-card min-h-[760px] overflow-hidden'>
        <CardHeader className='bg-muted/20'>
          <div className='flex items-center justify-between gap-3'>
            <div>
              <CardTitle>{props.currentDocument ? '文档预览' : '文档编辑'}</CardTitle>
              <CardDescription>
                {props.currentDocument?.id || '生成前可在这里编辑模板'}
              </CardDescription>
            </div>
            {props.currentDocument && <Badge variant='secondary'>HTML</Badge>}
          </div>
        </CardHeader>
        <CardContent className='p-0'>
          {props.currentDocument?.html ? (
            <iframe
              title='Document preview'
              srcDoc={props.currentDocument.html}
              className='h-[720px] w-full border-0 bg-background'
            />
          ) : (
            <div className='h-[720px] overflow-hidden p-4'>
              <Suspense
                fallback={
                  <div className='flex h-full items-center justify-center rounded-2xl bg-muted/30 text-sm text-muted-foreground'>
                    <Loader2 className='size-4 animate-spin' />
                    Loading editor
                  </div>
                }
              >
                <DocgenTemplateEditor
                  value={props.template}
                  onChange={props.setTemplate}
                  elements={props.elements}
                  validation={props.validation}
                />
              </Suspense>
            </div>
          )}
        </CardContent>
      </Card>

      <div className='space-y-4'>
        <Card className='sysml-card overflow-hidden'>
          <CardHeader className='bg-muted/20'>
            <div>
              <CardTitle>文档控制台</CardTitle>
              <CardDescription>
                选择范围、生成文档、下载和质量审查。
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className='space-y-4 p-4'>
            <div className='grid grid-cols-2 gap-2'>
              <LocalMetric label='范围元素' value={props.elements.length} />
              <LocalMetric label='历史文档' value={props.documents.length} />
              <LocalMetric
                label='校验问题'
                value={issueCount}
                tone={props.validation?.summary.errors ? 'danger' : issueCount ? 'warning' : 'success'}
              />
              <LocalMetric label='可用视图' value={props.views.length} />
            </div>
            <div className='rounded-2xl bg-muted/25 p-3 text-sm'>
              <div className='text-xs text-muted-foreground'>当前生成范围</div>
              <div className='mt-1 truncate font-medium'>{scopeLabel}</div>
            </div>

            <Field label='文档范围'>
              <Select value={props.docViewId} onValueChange={props.setDocViewId}>
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>Full model document</SelectItem>
                  {props.views.map((view) => (
                    <SelectItem key={view.id} value={view.id}>
                      {view.name || view.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className='grid gap-2'>
              <Button
                onClick={props.onGenerate}
                disabled={props.busy === 'generate-document'}
              >
                {props.busy === 'generate-document' ? (
                  <Loader2 className='size-4 animate-spin' />
                ) : (
                  <FileText className='size-4' />
                )}
                生成文档
              </Button>
              <Button
                variant='secondary'
                onClick={() => props.onAiDraft('full')}
                disabled={props.busy === 'ai-docgen-full'}
              >
                {props.busy === 'ai-docgen-full' ? (
                  <Loader2 className='size-4 animate-spin' />
                ) : (
                  <Sparkles className='size-4' />
                )}
                AI 生成章节
              </Button>
            </div>

            <div className='grid grid-cols-4 gap-2'>
              <Button variant='outline' onClick={() => props.onDownload('markdown')}>
                MD
              </Button>
              <Button variant='outline' onClick={() => props.onDownload('html')}>
                HTML
              </Button>
              <Button variant='outline' onClick={() => props.onDownload('pdf')}>
                PDF
              </Button>
              <Button variant='outline' onClick={() => props.onDownload('docx')}>
                Word
              </Button>
            </div>

            <div className='grid grid-cols-2 gap-2'>
              <DocumentHistorySheet
                documents={props.documents}
                onOpen={props.onOpen}
              />
              <Button variant='outline' onClick={props.onReset}>
                <RotateCcw className='size-4' />
                重置模板
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className='sysml-card overflow-hidden'>
          <CardHeader className='bg-muted/20'>
            <div className='flex items-center justify-between gap-3'>
              <div>
                <CardTitle>质量审查</CardTitle>
                <CardDescription>
                  {props.aiDocumentReview?.document_id || '生成或打开文档后可运行质量评分'}
                </CardDescription>
              </div>
              <Button
                variant='outline'
                size='sm'
                onClick={props.onAiDocumentReview}
                disabled={!props.currentDocument || props.busy === 'ai-document-review'}
              >
                {props.busy === 'ai-document-review' ? (
                  <Loader2 className='size-4 animate-spin' />
                ) : (
                  <Sparkles className='size-4' />
                )}
                审查
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {props.busy === 'ai-document-review' ? (
              <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                <Loader2 className='size-4 animate-spin' />
                正在审查文档质量
              </div>
            ) : props.aiDocumentReview ? (
              <div className='max-h-72 overflow-auto rounded-2xl bg-muted/25 p-4'>
                <MarkdownMessage content={props.aiDocumentReview.review} />
              </div>
            ) : (
              <EmptyState title='尚未审查' description='先生成文档，再点击审查' />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function DocumentHistorySheet({
  documents,
  onOpen,
}: {
  documents: DocumentRecord[]
  onOpen: (id: string) => void
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant='outline' size='sm'>
          <FileText className='size-4' />
          {'\u5386\u53f2'}
        </Button>
      </SheetTrigger>
      <SheetContent side='right' className='w-[420px] sm:max-w-[420px]'>
        <SheetHeader>
          <SheetTitle>Document history</SheetTitle>
          <SheetDescription>{'\u6253\u5f00\u5df2\u751f\u6210\u7684\u6587\u6863\u7248\u672c'}</SheetDescription>
        </SheetHeader>
        <ScrollArea className='min-h-0 flex-1 px-4 pb-4'>
          {documents.length ? (
            <div className='space-y-2'>
              {documents.map((document) => (
                <button
                  key={document.id}
                  type='button'
                  onClick={() => onOpen(document.id)}
                  className='grid w-full gap-1 rounded-md border bg-background px-3 py-3 text-left text-sm transition-colors hover:bg-muted'
                >
                  <span className='truncate font-mono font-semibold'>{document.id}</span>
                  <span className='truncate text-xs text-muted-foreground'>
                    {document.created_at}
                  </span>
                  <span className='truncate font-mono text-[11px] text-muted-foreground'>
                    {document.model_hash}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title={'\u6682\u65e0\u6587\u6863'} description={'\u751f\u6210\u540e\u4f1a\u51fa\u73b0\u5728\u8fd9\u91cc'} />
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

type MdkTabProps = {
  adapters: MdkAdapter[]
  tool: string
  setTool: (value: string) => void
  filename: string
  setFilename: (value: string) => void
  content: string
  setContent: (value: string) => void
  parseResult: MdkParseResponse | null
  importJob: MdkImportJob | null
  commit: boolean
  setCommit: (value: boolean) => void
  message: string
  setMessage: (value: string) => void
  onRefreshAdapters: () => void
  onParse: (content?: string, filename?: string, tool?: string) => void
  onCreateJob: () => void
  onApplyJob: () => void
  busy: string
}

type AssistantTabProps = {
  messages: AiChatMessage[]
  question: string
  setQuestion: (value: string) => void
  onAsk: () => void
  busy: string
}

function AssistantTab(props: AssistantTabProps) {
  const examples = [
    '\u5f53\u524d\u6a21\u578b\u6709\u54ea\u4e9b\u9700\u6c42\u8fd8\u6ca1\u6709\u9a8c\u8bc1\u95ed\u73af\uff1f',
    '\u89e3\u91ca\u4e00\u4e0b\u8fd9\u4e2a\u7cfb\u7edf\u7684\u8ffd\u6eaf\u77e9\u9635\u3002',
    '\u54ea\u4e9b\u6a21\u578b\u5143\u7d20\u9002\u5408\u5199\u8fdb\u7cfb\u7edf\u67b6\u6784\u7ae0\u8282\uff1f',
    '\u8fd9\u4e2a\u6a21\u578b\u76ee\u524d\u6700\u5927\u7684\u8d28\u91cf\u98ce\u9669\u662f\u4ec0\u4e48\uff1f',
  ]

  return (
    <div className='grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]'>
      <Card className='sysml-card'>
        <CardHeader>
          <div className='flex items-center gap-2'>
            <div className='flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground'>
              <Sparkles className='size-4' />
            </div>
            <div>
              <CardTitle>SysML Assistant</CardTitle>
              <CardDescription>{'\u57fa\u4e8e RAG \u68c0\u7d22\u7684 MMS \u6a21\u578b\u95ee\u7b54\u52a9\u624b'}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-2'>
            <div className='text-xs font-medium uppercase text-muted-foreground'>
              {'\u63a8\u8350\u95ee\u9898'}
            </div>
            {examples.map((example) => (
              <button
                key={example}
                type='button'
                className='w-full rounded-md border bg-background px-3 py-2 text-left text-sm leading-5 transition-colors hover:bg-muted'
                onClick={() => props.setQuestion(example)}
              >
                {example}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className='sysml-card overflow-hidden'>
        <CardHeader className='border-b bg-muted/20'>
          <div className='flex items-center justify-between gap-3'>
            <div className='flex items-center gap-3'>
              <div className='flex size-10 items-center justify-center rounded-md border bg-background'>
                <MessageCircle className='size-5 text-primary' />
              </div>
              <div>
                <CardTitle>{'\u6a21\u578b\u95ee\u7b54\u7ebf\u7a0b'}</CardTitle>
                <CardDescription>{'\u8be2\u95ee\u9700\u6c42\u3001\u6a21\u5757\u3001\u8ffd\u8e2a\u5173\u7cfb\u6216\u6587\u6863\u751f\u6210\u6d41\u7a0b'}</CardDescription>
              </div>
            </div>
            <Badge variant='secondary'>{'RAG \u68c0\u7d22\u589e\u5f3a'}</Badge>
          </div>
        </CardHeader>
        <CardContent className='grid h-[680px] grid-rows-[1fr_auto] gap-0 p-0'>
          <ScrollArea className='min-h-0 p-5'>
            {props.messages.length || props.busy === 'ai-chat' ? (
              <div className='space-y-5'>
                {props.messages.map((message, index) => (
                  <AssistantMessageBubble
                    key={`${message.role}-${index}`}
                    message={message}
                  />
                ))}
                {props.busy === 'ai-chat' ? <AssistantLoadingBubble /> : null}
              </div>
            ) : (
              <div className='flex h-[460px] items-center justify-center'>
                <div className='max-w-md text-center'>
                  <div className='mx-auto flex size-12 items-center justify-center rounded-md border bg-background'>
                    <Sparkles className='size-5 text-primary' />
                  </div>
                  <h3 className='mt-4 text-base font-semibold'>{'\u5f00\u59cb\u8be2\u95ee\u6a21\u578b'}</h3>
                  <p className='mt-2 text-sm text-muted-foreground'>
                    {'\u4f8b\u5982\u8be2\u95ee\u54ea\u4e9b\u9700\u6c42\u672a\u95ed\u73af\u3001\u67d0\u4e2a\u5143\u7d20\u7684\u4f9d\u636e\u3001\u6216\u8005\u5982\u4f55\u89e3\u91ca\u8ffd\u8e2a\u77e9\u9635\u3002'}
                  </p>
                </div>
              </div>
            )}
          </ScrollArea>
          <div className='border-t bg-background p-4'>
            <div className='rounded-lg border bg-muted/20 p-2'>
              <Textarea
                rows={3}
                value={props.question}
                onChange={(event) => props.setQuestion(event.target.value)}
                placeholder={'\u4f8b\u5982\uff1a\u54ea\u4e9b\u9700\u6c42\u8fd8\u6ca1\u6709\u6d4b\u8bd5\u7528\u4f8b\uff1f'}
                className='min-h-[86px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0'
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault()
                    props.onAsk()
                  }
                }}
              />
              <div className='flex items-center justify-between gap-2 px-2 pb-1'>
                <span className='text-xs text-muted-foreground'>{'Ctrl + Enter \u53d1\u9001'}</span>
                <Button
                  type='button'
                  onClick={props.onAsk}
                  disabled={props.busy === 'ai-chat'}
                >
                  {props.busy === 'ai-chat' ? (
                    <Loader2 className='size-4 animate-spin' />
                  ) : (
                    <Send className='size-4' />
                  )}
                  {'\u53d1\u9001'}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function AssistantMessageBubble({ message }: { message: AiChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={cn('flex gap-3', isUser && 'justify-end')}>
      {!isUser ? (
        <div className='flex size-9 shrink-0 items-center justify-center rounded-md border bg-background'>
          <Sparkles className='size-4 text-primary' />
        </div>
      ) : null}
      <div
        className={cn(
          'max-w-[82%] rounded-lg border px-4 py-3 text-sm leading-6 shadow-sm',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-background'
        )}
      >
        <div className='mb-2 flex items-center gap-2 text-xs font-medium opacity-80'>
          <span>{isUser ? '\u4f60' : 'Assistant'}</span>
          {!isUser ? <Badge variant='outline'>{'\u6a21\u578b\u4e0a\u4e0b\u6587'}</Badge> : null}
        </div>
        {isUser ? (
          <div className='whitespace-pre-wrap'>{message.content}</div>
        ) : (
          <div className='space-y-3'>
            <MarkdownMessage content={message.content} compact />
            <AssistantRetrievalSources retrieval={message.retrieval} />
          </div>
        )}
      </div>
    </div>
  )
}

function AssistantRetrievalSources({
  retrieval,
}: {
  retrieval?: AiChatMessage['retrieval']
}) {
  const references = retrieval?.references || []
  if (!retrieval) return null

  return (
    <div className='rounded-md border bg-muted/20 p-3'>
      <div className='mb-2 flex items-center justify-between gap-2'>
        <div className='text-xs font-semibold uppercase text-muted-foreground'>
          {'RAG \u68c0\u7d22\u4f9d\u636e'}
        </div>
        <Badge variant='outline'>{references.length}</Badge>
      </div>
      <div className='flex flex-wrap gap-2'>
        {references.length ? (
          references.slice(0, 10).map((reference, index) => (
            <Badge
              key={`${reference.kind}-${reference.id}-${index}`}
              variant='secondary'
              className='max-w-full rounded-sm'
            >
              <span className='truncate'>
                {reference.kind}: {reference.label || reference.id}
              </span>
            </Badge>
          ))
        ) : (
          <span className='text-xs text-muted-foreground'>
            已启用 RAG，但当前问题没有命中具体模型元素。
          </span>
        )}
      </div>
      {retrieval?.query_tokens?.length ? (
        <div className='mt-2 text-xs text-muted-foreground'>
          {'tokens: '}
          {retrieval.query_tokens.slice(0, 12).join(', ')}
        </div>
      ) : null}
    </div>
  )
}

function AssistantLoadingBubble() {
  return (
    <div className='flex gap-3'>
      <div className='flex size-9 shrink-0 items-center justify-center rounded-md border bg-background'>
        <Sparkles className='size-4 text-primary' />
      </div>
      <div className='max-w-[82%] rounded-lg border bg-background px-4 py-3 shadow-sm'>
        <div className='mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground'>
          <Loader2 className='size-3.5 animate-spin' />
          Assistant {'\u6b63\u5728\u5206\u6790'}
        </div>
      </div>
    </div>
  )
}

function MdkTab(props: MdkTabProps) {
  const selectedAdapter = props.adapters.find((adapter) => adapter.id === props.tool)
  const modelSourceAdapters = props.adapters.filter(
    (adapter) => adapter.category !== 'evidence_source'
  )
  const evidenceSourceAdapters = props.adapters.filter(
    (adapter) => adapter.category === 'evidence_source'
  )
  const report = props.parseResult?.mapping_report
  const canApply = Boolean(props.importJob && props.importJob.status === 'parsed')
  const hasSource = Boolean(props.content.trim())
  const activeStep = props.importJob
    ? 4
    : props.parseResult
      ? 3
      : hasSource
        ? 2
        : 1

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const adapter = adapterFromFilename(file.name, props.adapters)
    const nextTool = adapter?.id || props.tool
    props.setFilename(file.name)
    props.setContent(text)
    if (adapter) props.setTool(adapter.id)
    event.target.value = ''
    props.onParse(text, file.name, nextTool)
  }

  return (
    <div className='grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]'>
      <div className='space-y-4'>
        <Card className='sysml-card overflow-hidden'>
          <CardHeader className='bg-muted/20'>
            <div className='flex items-center justify-between gap-3'>
              <div>
                <CardTitle>来源选择</CardTitle>
                <CardDescription>
                  先区分模型结构来源和验证证据来源，再上传或粘贴内容。
                </CardDescription>
              </div>
              <Button
                variant='outline'
                size='sm'
                onClick={props.onRefreshAdapters}
                disabled={props.busy === 'mdk-adapters'}
              >
                {props.busy === 'mdk-adapters' ? (
                  <Loader2 className='size-4 animate-spin' />
                ) : (
                  <RefreshCw className='size-4' />
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className='space-y-4 p-4'>
            {selectedAdapter ? (
              <div className='rounded-2xl bg-muted/25 p-4'>
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <div className='font-semibold'>{selectedAdapter.label}</div>
                    {selectedAdapter.description ? (
                      <p className='mt-1 text-xs text-muted-foreground'>
                        {selectedAdapter.description}
                      </p>
                    ) : null}
                    <p className='mt-1 font-mono text-xs text-muted-foreground'>
                      {selectedAdapter.id} / {selectedAdapter.vendor || 'SysML DocGen'} / v
                      {selectedAdapter.version || '1.0.0'}
                    </p>
                  </div>
                  <Badge variant={selectedAdapter.can_write ? 'secondary' : 'outline'}>
                    {selectedAdapter.can_write ? 'read/write' : 'read only'}
                  </Badge>
                </div>
                <div className='mt-3 flex flex-wrap gap-1.5'>
                  <CapabilityBadge enabled={selectedAdapter.can_read} label='读' />
                  <CapabilityBadge enabled={selectedAdapter.can_write} label='写' />
                  <CapabilityBadge enabled={selectedAdapter.can_validate} label='校验' />
                  <CapabilityBadge enabled={selectedAdapter.can_commit} label='提交' />
                  <CapabilityBadge enabled={selectedAdapter.can_rollback} label='回滚' />
                </div>
                <p className='mt-3 text-xs text-muted-foreground'>
                  支持扩展名：
                  {(selectedAdapter.supported_extensions || selectedAdapter.formats).join(', ')}
                </p>
                {selectedAdapter.limitations?.length ? (
                  <p className='mt-2 text-xs text-muted-foreground'>
                    限制：{selectedAdapter.limitations.join('；')}
                  </p>
                ) : null}
              </div>
            ) : null}

            {props.adapters.length ? (
              <div className='space-y-4'>
                <MdkAdapterGroup
                  title='模型来源适配器'
                  description='建模工具提供需求、结构、接口和关系等模型骨架。'
                  adapters={modelSourceAdapters}
                  selectedTool={props.tool}
                  onSelect={props.setTool}
                />
                <MdkAdapterGroup
                  title='验证证据来源适配器'
                  description='分析/仿真工具提供测试用例、验证关系和结果证据。'
                  adapters={evidenceSourceAdapters}
                  selectedTool={props.tool}
                  onSelect={props.setTool}
                />
              </div>
            ) : (
              <EmptyState title='未加载适配器' description='点击刷新读取服务端能力声明' />
            )}
          </CardContent>
        </Card>
      </div>

      <div className='space-y-4'>
        <Card className='sysml-card overflow-hidden'>
          <CardHeader className='bg-muted/20'>
            <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
              <div>
                <CardTitle>外部模型导入向导</CardTitle>
                <CardDescription>
                  MMS 负责集中管理模型、追踪关系、版本和文档生成。
                </CardDescription>
              </div>
              <MdkStepBar activeStep={activeStep} />
            </div>
          </CardHeader>
          <CardContent className='space-y-4 p-4'>
            <div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]'>
              <div className='rounded-2xl bg-muted/25 p-4'>
                <div className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
                  <div>
                    <div className='text-sm font-semibold'>选择文件并解析</div>
                    <p className='mt-1 text-xs text-muted-foreground'>
                      支持 JSON、XMI/Cameo 导出、SysML v2/SysON 文本、Notebook 和 MATLAB 证据文件。
                    </p>
                    {props.filename ? (
                      <div className='mt-3 font-mono text-xs text-muted-foreground'>
                        当前文件：{props.filename}
                      </div>
                    ) : null}
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    <Button asChild>
                      <label>
                        <Upload className='size-4' />
                        上传并解析
                        <input
                          type='file'
                          className='hidden'
                          accept='.json,.xmi,.xml,.sysml,.kerml,.txt,.ipynb,.m,.mlx'
                          onChange={handleFileChange}
                        />
                      </label>
                    </Button>
                    <Button
                      variant='outline'
                      onClick={() => props.onParse()}
                      disabled={!hasSource || props.busy === 'mdk-parse'}
                    >
                      {props.busy === 'mdk-parse' ? (
                        <Loader2 className='size-4 animate-spin' />
                      ) : (
                        <Search className='size-4' />
                      )}
                      重新解析
                    </Button>
                  </div>
                </div>

                <Collapsible className='mt-4'>
                  <CollapsibleTrigger asChild>
                    <Button variant='ghost' size='sm'>
                      <Code2 className='size-4' />
                      高级：粘贴外部模型内容
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className='mt-3 space-y-3'>
                    <Field label='文件名'>
                      <Input
                        value={props.filename}
                        onChange={(event) => props.setFilename(event.target.value)}
                        placeholder='model.json / model.xmi / analysis.ipynb'
                      />
                    </Field>
                    <Textarea
                      className='min-h-[260px] font-mono text-xs'
                      value={props.content}
                      onChange={(event) => props.setContent(event.target.value)}
                      placeholder='粘贴 JSON、XMI、SysML v2 文本、Notebook 或 MATLAB 标记内容'
                    />
                  </CollapsibleContent>
                </Collapsible>
              </div>

              <div className='rounded-2xl bg-muted/25 p-4'>
                <div className='text-sm font-semibold'>导入确认</div>
                <p className='mt-1 text-xs text-muted-foreground'>
                  解析无误后创建任务，再确认写入当前项目分支。
                </p>
                <div className='mt-4 space-y-3'>
                  <label className='flex items-center gap-2 text-sm'>
                    <Checkbox
                      checked={props.commit}
                      onCheckedChange={(checked) => props.setCommit(Boolean(checked))}
                    />
                    导入后自动提交
                  </label>
                  <Field label='提交说明'>
                    <Input
                      value={props.message}
                      onChange={(event) => props.setMessage(event.target.value)}
                      disabled={!props.commit}
                    />
                  </Field>
                  <div className='grid gap-2'>
                    <Button
                      variant='outline'
                      onClick={props.onCreateJob}
                      disabled={!props.parseResult || props.busy === 'mdk-job'}
                    >
                      {props.busy === 'mdk-job' ? (
                        <Loader2 className='size-4 animate-spin' />
                      ) : (
                        <Archive className='size-4' />
                      )}
                      创建导入任务
                    </Button>
                    <Button
                      onClick={props.onApplyJob}
                      disabled={!canApply || props.busy === 'mdk-apply'}
                    >
                      {props.busy === 'mdk-apply' ? (
                        <Loader2 className='size-4 animate-spin' />
                      ) : (
                        <Save className='size-4' />
                      )}
                      确认导入
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {props.parseResult && (
              <div className='grid gap-3 sm:grid-cols-4'>
                <MdkMetric label='元素' value={props.parseResult.parsed_model.element_count} />
                <MdkMetric label='跳过' value={report?.skipped.length || 0} />
                <MdkMetric label='转换' value={report?.converted.length || 0} />
                <MdkMetric label='降级' value={report?.downgraded.length || 0} />
              </div>
            )}
          </CardContent>
        </Card>

        {props.importJob && (
          <Card className='sysml-card'>
            <CardHeader>
              <div className='flex items-center justify-between gap-3'>
                <div>
                  <CardTitle>导入任务</CardTitle>
                  <CardDescription>{props.importJob.id}</CardDescription>
                </div>
                <Badge variant={props.importJob.status === 'applied' ? 'secondary' : 'outline'}>
                  {props.importJob.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className='grid gap-3 text-sm sm:grid-cols-2'>
              <div>
                <span className='text-muted-foreground'>目标：</span>
                {props.importJob.project} / {props.importJob.branch}
              </div>
              <div>
                <span className='text-muted-foreground'>来源：</span>
                {props.importJob.adapter} / {props.importJob.filename || '-'}
              </div>
              <div>
                <span className='text-muted-foreground'>创建：</span>
                {props.importJob.created_by} / {props.importJob.created_at}
              </div>
              <div>
                <span className='text-muted-foreground'>应用：</span>
                {props.importJob.applied_at || '等待确认'}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className='sysml-card overflow-hidden'>
          <CardHeader className='bg-muted/20'>
            <div className='flex items-center justify-between gap-3'>
              <div>
                <CardTitle>映射报告</CardTitle>
                <CardDescription>
                  {props.parseResult
                    ? `${props.parseResult.parsed_model.adapter} / ${props.parseResult.parsed_model.type}`
                    : '解析后显示转换、跳过和降级详情'}
                </CardDescription>
              </div>
              {props.parseResult && (
                <Badge variant='secondary'>
                  imported {props.parseResult.mapping_report.imported}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {props.parseResult ? (
              <div className='grid gap-4 xl:grid-cols-2'>
                <MappingReportGroup
                  title='跳过'
                  items={props.parseResult.mapping_report.skipped}
                  empty='没有跳过的内容'
                />
                <MappingReportGroup
                  title='转换'
                  items={props.parseResult.mapping_report.converted}
                  empty='没有需要转换的内容'
                />
                <MappingReportGroup
                  title='降级'
                  items={props.parseResult.mapping_report.downgraded}
                  empty='没有降级内容'
                />
                <div className='rounded-md border p-3'>
                  <h3 className='mb-2 text-sm font-semibold'>警告</h3>
                  {props.parseResult.mapping_report.warnings.length ? (
                    <div className='space-y-2 text-sm'>
                      {props.parseResult.mapping_report.warnings.map((warning) => (
                        <div key={warning} className='rounded-md bg-muted p-2'>
                          {warning}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className='text-sm text-muted-foreground'>没有警告</p>
                  )}
                </div>
              </div>
            ) : (
              <div className='rounded-2xl bg-muted/25 p-4 text-sm text-muted-foreground'>
                等待解析。上传文件或展开高级粘贴内容后，点击解析即可查看映射报告。
              </div>
            )}
          </CardContent>
        </Card>

        {props.parseResult?.parsed_model.elements.length ? (
          <Card className='sysml-card'>
            <CardHeader>
              <CardTitle>解析出的元素</CardTitle>
              <CardDescription>
                {props.parseResult.parsed_model.elements.length} 个元素将导入当前分支
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className='h-[220px] rounded-md border'>
                <div className='divide-y'>
                  {props.parseResult.parsed_model.elements.map((element) => (
                    <div key={element.id} className='px-3 py-2 text-sm'>
                      <div className='flex items-center justify-between gap-2'>
                        <span className='font-mono font-semibold'>{element.id}</span>
                        <Badge variant='outline'>{labelType(element.type)}</Badge>
                      </div>
                      <p className='truncate text-muted-foreground'>
                        {element.name || '未命名元素'}
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className='grid gap-2'>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function CapabilityBadge({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <Badge variant={enabled ? 'secondary' : 'outline'} className='rounded-sm'>
      {label}
    </Badge>
  )
}

function MdkAdapterGroup({
  title,
  description,
  adapters,
  selectedTool,
  onSelect,
}: {
  title: string
  description: string
  adapters: MdkAdapter[]
  selectedTool: string
  onSelect: (value: string) => void
}) {
  if (!adapters.length) return null

  return (
    <div className='space-y-2'>
      <div className='px-1'>
        <div className='text-xs font-medium uppercase text-muted-foreground'>{title}</div>
        <p className='mt-1 text-xs text-muted-foreground'>{description}</p>
      </div>
      <div className='space-y-1'>
        {adapters.map((adapter) => (
          <button
            key={adapter.id}
            type='button'
            onClick={() => onSelect(adapter.id)}
            className={cn(
              'relative w-full rounded-2xl p-3 text-left transition-colors hover:bg-muted/55',
              selectedTool === adapter.id && 'bg-muted'
            )}
          >
            <span
              className={cn(
                'absolute left-0 top-3 h-8 w-1 rounded-full bg-transparent',
                selectedTool === adapter.id && 'bg-primary'
              )}
            />
            <div className='flex items-center justify-between gap-3'>
              <div className='min-w-0'>
                <div className='truncate text-sm font-medium'>{adapter.label}</div>
                <div className='truncate font-mono text-xs text-muted-foreground'>
                  {(adapter.supported_extensions || adapter.formats).join(', ')}
                </div>
              </div>
              <Badge variant='outline'>
                {adapter.source_kind === 'verification_evidence' ? '证据' : '模型'}
              </Badge>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function MdkStepBar({ activeStep }: { activeStep: number }) {
  const steps = ['选择来源', '解析检查', '创建任务', '确认导入']

  return (
    <div className='flex flex-wrap gap-2'>
      {steps.map((step, index) => {
        const number = index + 1
        const active = activeStep === number
        const done = activeStep > number
        return (
          <div
            key={step}
            className={cn(
              'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs',
              done || active
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            )}
          >
            <span
              className={cn(
                'flex size-5 items-center justify-center rounded-full text-[10px]',
                done || active
                  ? 'bg-primary-foreground/20'
                  : 'bg-background text-muted-foreground'
              )}
            >
              {number}
            </span>
            {step}
          </div>
        )
      })}
    </div>
  )
}

function MdkMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className='rounded-md border bg-muted/25 p-3'>
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className='mt-1 text-2xl font-semibold'>{value}</div>
    </div>
  )
}

function MappingReportGroup({
  title,
  items,
  empty,
}: {
  title: string
  items: Record<string, unknown>[]
  empty: string
}) {
  return (
    <div className='rounded-md border p-3'>
      <h3 className='mb-2 text-sm font-semibold'>{title}</h3>
      {items.length ? (
        <ScrollArea className='h-[180px]'>
          <div className='space-y-2 pr-3 text-xs'>
            {items.map((item, index) => (
              <pre
                key={`${title}-${index}`}
                className='overflow-x-auto rounded-md bg-muted p-2 font-mono'
              >
                {JSON.stringify(item, null, 2)}
              </pre>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <p className='text-sm text-muted-foreground'>{empty}</p>
      )}
    </div>
  )
}

function adapterFromFilename(filename: string, adapters: MdkAdapter[]) {
  const lowerName = filename.toLowerCase()
  return adapters.find((adapter) =>
    (adapter.supported_extensions || adapter.formats).some((extension) => {
      const normalized = extension.startsWith('.') ? extension : `.${extension}`
      return lowerName.endsWith(normalized.toLowerCase())
    })
  )
}

function tabFromHash(hash: string): WorkbenchTab {
  const value = hash.replace(/^#/, '')
  return workbenchTabs.includes(value as WorkbenchTab)
    ? (value as WorkbenchTab)
    : 'model'
}

function pickInitialProject(projects: Project[], username: string) {
  if (!projects.length) return null
  const storedProjectId = window.localStorage.getItem(projectStorageKey)
  const storedProject = projects.find((project) => project.id === storedProjectId)
  if (storedProject) return storedProject

  const nonEmptyOwned = projects.find(
    (project) => project.owner === username && (project.elements || 0) > 0
  )
  if (nonEmptyOwned) return nonEmptyOwned

  const nonEmptyAccessible = projects.find((project) => (project.elements || 0) > 0)
  if (nonEmptyAccessible) return nonEmptyAccessible

  const personalWorkspace = projects.find(
    (project) =>
      project.kind === 'workspace' &&
      project.owner === username &&
      project.visibility !== 'shared'
  )
  return personalWorkspace || projects[0] || null
}

function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className='flex min-h-[180px] flex-col items-center justify-center gap-2 p-8 text-center'>
      <Braces className='size-8 text-muted-foreground' />
      <div className='font-medium'>{title}</div>
      <p className='max-w-sm text-sm text-muted-foreground'>{description}</p>
    </div>
  )
}

function TraceBadge({ status }: { status: TraceabilityRow['status'] }) {
  const classes = {
    closed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    partial: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    open: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  }
  const labels = {
    closed: '闭环',
    partial: '部分',
    open: '未闭环',
  }
  return (
    <span className={cn('inline-flex rounded-md px-2 py-1 text-xs font-medium', classes[status])}>
      {labels[status]}
    </span>
  )
}

function formatRefs(refs: { id: string; name: string }[]) {
  if (!refs.length) return <span className='text-muted-foreground'>-</span>
  return (
    <div className='space-y-1'>
      {refs.map((ref) => (
        <div key={ref.id}>
          <span className='font-mono font-medium'>{ref.id}</span>{' '}
          <span className='text-muted-foreground'>{ref.name}</span>
        </div>
      ))}
    </div>
  )
}

function labelType(type: string) {
  return displayTypeNames[type] || typeNames[type] || type
}

function labelRelation(type: string) {
  return displayRelationNames[type] || relationNames[type] || type
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = getKey(item)
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
}

function includedElementList(attributesText: string) {
  const attributes = parseJsonSafe<Record<string, unknown>>(attributesText, {})
  const values = Array.isArray(attributes.included_elements)
    ? attributes.included_elements
    : []
  return values.map(String)
}

function stringList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

function elementsTypes(elements: SysmlElement[]) {
  return Array.from(new Set(elements.map((element) => element.type)))
    .filter((type) => type !== 'View')
    .sort()
}

function allRelationOptions(elements: SysmlElement[]) {
  const base = [
    'satisfy',
    'verify',
    'refine',
    'constrain',
    'compose',
    'connect',
    'allocate',
    'include',
    'conform',
  ]
  const fromModel = elements.flatMap((element) =>
    (element.relations || []).map((relation) => relation.type)
  )
  return Array.from(new Set([...base, ...fromModel].filter(Boolean))).sort()
}

function formatList(values: string[], label: (value: string) => string) {
  if (!values.length) return ''
  const labels = values.map(label)
  if (labels.length <= 4) return labels.join(' / ')
  return `${labels.slice(0, 4).join(' / ')} +${labels.length - 4}`
}

function mergeQuery(base: Record<string, unknown>, override: Record<string, unknown>) {
  const merged = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) {
      continue
    }
    merged[key] = value
  }
  return merged
}

function previewQueryElements(elements: SysmlElement[], query: Record<string, unknown>) {
  const requestedTypes = new Set(stringList(query.types))
  const requestedOwners = new Set(stringList(query.owners))
  const relationFilter = new Set(stringList(query.relations))
  const text = String(query.text || query.q || '').trim().toLowerCase()
  const depth = Number(query.relation_depth ?? 0) || 0
  const hasDirectFilter = requestedTypes.size > 0 || requestedOwners.size > 0 || text.length > 0
  const byId = new Map(elements.map((element) => [element.id, element]))

  const directMatches = hasDirectFilter
    ? elements
        .filter((element) => {
          if (requestedTypes.size && !requestedTypes.has(element.type)) return false
          if (requestedOwners.size && !requestedOwners.has(element.owner || '')) return false
          if (!text) return true
          const searchable = [
            element.id,
            element.name,
            element.description || '',
            element.owner || '',
            JSON.stringify(element.attributes || {}),
          ]
            .join(' ')
            .toLowerCase()
          return searchable.includes(text)
        })
        .map((element) => element.id)
    : []

  const selected: string[] = [...directMatches]
  const seen = new Set(selected)
  let frontier = [...selected]
  for (let i = 0; i < depth; i += 1) {
    const nextFrontier: string[] = []
    for (const elementId of frontier) {
      const element = byId.get(elementId)
      if (!element) continue
      for (const relation of element.relations || []) {
        if (relationFilter.size && !relationFilter.has(relation.type)) continue
        const target = String(relation.target || '').trim()
        if (target && !seen.has(target)) {
          seen.add(target)
          selected.push(target)
          nextFrontier.push(target)
        }
      }
      for (const [candidateId, candidate] of byId) {
        if (seen.has(candidateId)) continue
        if (
          (candidate.relations || []).some(
            (relation) =>
              relation.target === elementId &&
              (!relationFilter.size || relationFilter.has(relation.type))
          )
        ) {
          seen.add(candidateId)
          selected.push(candidateId)
          nextFrontier.push(candidateId)
        }
      }
    }
    frontier = nextFrontier
  }

  const resolved = selected
    .map((id) => byId.get(id))
    .filter((element): element is SysmlElement => Boolean(element))

  return {
    direct_count: directMatches.length,
    match_count: resolved.length,
    matches: resolved,
    types: stringList(query.types),
    owners: stringList(query.owners),
    relations: stringList(query.relations),
    keyword: String(query.text || query.q || '').trim(),
    depth,
    has_filters: hasDirectFilter || relationFilter.size > 0 || depth > 0,
  }
}

function parseJson<T>(value: string, label: string, fallback: T): T {
  try {
    return (value.trim() ? JSON.parse(value) : fallback) as T
  } catch {
    throw new Error(`${label} 格式不正确`)
  }
}

function parseJsonSafe<T>(value: string, fallback: T): T {
  try {
    return (value.trim() ? JSON.parse(value) : fallback) as T
  } catch {
    return fallback
  }
}

function memberNames(value: string) {
  return value
    .split(/[,\n;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function buildProjectMembers(editorMembers: string, viewerMembers: string) {
  return [
    ...memberNames(editorMembers).map((username) => `${username}:editor`),
    ...memberNames(viewerMembers).map((username) => `${username}:viewer`),
  ].join(', ')
}

function membersByRole(project: Project, role: 'editor' | 'viewer') {
  return (
    project.members
      ?.filter((member) => member.role === role)
      .map((member) => member.username)
      .join(', ') || ''
  )
}

function notifyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  toast.error(message)
}

function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function downloadBase64(filename: string, base64Text: string, type: string) {
  const binary = atob(base64Text)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  const blob = new Blob([bytes], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function shortLabel(value: string, maxLength: number) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`
}

function MarkdownMessage({
  content,
  compact,
}: {
  content: string
  compact?: boolean
}) {
  const blocks = parseMarkdownBlocks(content)
  return (
    <div className={cn('space-y-3 leading-6', compact ? 'text-sm' : 'text-[15px]')}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const HeadingTag = block.level === 2 ? 'h3' : 'h4'
          return (
            <HeadingTag
              key={`${block.type}-${index}`}
              className={cn(
                'font-semibold tracking-normal text-foreground',
                block.level === 2 ? 'text-base' : 'text-sm'
              )}
            >
              {renderInlineMarkdown(block.text)}
            </HeadingTag>
          )
        }
        if (block.type === 'list') {
          return (
            <ul key={`${block.type}-${index}`} className='space-y-1.5'>
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`} className='flex gap-2'>
                  <CheckCircle2 className='mt-1 size-3.5 shrink-0 text-emerald-600' />
                  <span>{renderInlineMarkdown(item)}</span>
                </li>
              ))}
            </ul>
          )
        }
        if (block.type === 'table') {
          return (
            <div
              key={`${block.type}-${index}`}
              className='overflow-x-auto rounded-md border'
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    {block.headers.map((header, headerIndex) => (
                      <TableHead key={`${header}-${headerIndex}`}>
                        {renderInlineMarkdown(header)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {block.rows.map((row, rowIndex) => (
                    <TableRow key={`row-${rowIndex}`}>
                      {block.headers.map((_, cellIndex) => (
                        <TableCell key={`cell-${rowIndex}-${cellIndex}`}>
                          {renderInlineMarkdown(row[cellIndex] || '')}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        }
        return (
          <p key={`${block.type}-${index}`} className='text-muted-foreground'>
            {renderInlineMarkdown(block.text)}
          </p>
        )
      })}
    </div>
  )
}

type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  let paragraph: string[] = []
  let listItems: string[] = []
  let tableRows: string[][] = []

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
      paragraph = []
    }
  }
  const flushList = () => {
    if (listItems.length) {
      blocks.push({ type: 'list', items: listItems })
      listItems = []
    }
  }
  const flushTable = () => {
    if (tableRows.length >= 2) {
      const [headers, separator, ...rows] = tableRows
      if (isMarkdownTableSeparator(separator)) {
        blocks.push({ type: 'table', headers, rows })
      } else {
        paragraph.push(...tableRows.map((row) => `| ${row.join(' | ')} |`))
      }
    } else if (tableRows.length) {
      paragraph.push(...tableRows.map((row) => `| ${row.join(' | ')} |`))
    }
    tableRows = []
  }

  content.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim()
    if (!line) {
      flushTable()
      flushParagraph()
      flushList()
      return
    }
    if (isMarkdownTableRow(line)) {
      flushParagraph()
      flushList()
      tableRows.push(splitMarkdownTableRow(line))
      return
    }
    flushTable()
    const heading = line.match(/^(#{2,4})\s+(.+)$/)
    if (heading) {
      flushParagraph()
      flushList()
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        text: heading[2].trim(),
      })
      return
    }
    const list = line.match(/^[-*]\s+(.+)$/)
    if (list) {
      flushParagraph()
      listItems.push(list[1].trim())
      return
    }
    flushList()
    paragraph.push(line)
  })
  flushTable()
  flushParagraph()
  flushList()
  return blocks
}

function isMarkdownTableRow(line: string) {
  return line.startsWith('|') && line.endsWith('|') && line.includes('|')
}

function splitMarkdownTableRow(line: string) {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isMarkdownTableSeparator(row: string[]) {
  return row.length > 0 && row.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={index}
          className='rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]'
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    return <span key={index}>{part}</span>
  })
}
