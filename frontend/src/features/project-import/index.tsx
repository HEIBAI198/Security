import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  FileArchive,
  FileText,
  FolderOpen,
  GitBranch,
  Loader2,
  PackageCheck,
  Play,
  ScanSearch,
  ShieldCheck,
  Upload,
  Workflow,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  checkImportApiReady,
  importGitProject,
  importLocalProject,
  loadLatestProjectImport,
  startProjectScan,
  uploadProjectArchive,
  type ProjectImportRecord,
  type ScanJob,
} from '@/lib/import-api'
import { runCodeAuditScan, runDependencyAuditScan } from '@/lib/security-api'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

type ImportMode = 'upload' | 'git' | 'local'

const sourceLabels: Record<ImportMode, string> = {
  upload: '压缩包',
  git: 'Git 仓库',
  local: '本地目录',
}

export function ProjectImportPage() {
  const [mode, setMode] = useState<ImportMode>('upload')
  const [archive, setArchive] = useState<File | null>(null)
  const [gitUrl, setGitUrl] = useState('')
  const [gitRef, setGitRef] = useState('')
  const [gitCommit, setGitCommit] = useState('')
  const [gitName, setGitName] = useState('')
  const [localPath, setLocalPath] = useState('')
  const [localName, setLocalName] = useState('')
  const [busy, setBusy] = useState<ImportMode | 'scan' | null>(null)
  const [apiReady, setApiReady] = useState<boolean | null>(null)
  const [apiError, setApiError] = useState('')
  const [record, setRecord] = useState<ProjectImportRecord | null>(null)
  const [scanJob, setScanJob] = useState<ScanJob | null>(null)

  const topLanguages = useMemo(
    () => record?.summary.languages.slice(0, 3) ?? [],
    [record]
  )

  useEffect(() => {
    let ignore = false
    checkImportApiReady()
      .then(() => {
        if (ignore) return undefined
        setApiReady(true)
        setApiError('')
        return loadLatestProjectImport()
      })
      .then((latestRecord) => {
        if (!ignore && latestRecord) setRecord(latestRecord)
      })
      .catch((error) => {
        if (ignore) return
        setApiReady(false)
        setApiError(error instanceof Error ? error.message : 'Backend service is unavailable')
      })
    return () => {
      ignore = true
    }
  }, [])

  async function runUpload() {
    if (!archive) {
      toast.error('请选择 .zip、.tar.gz 或 .tgz 文件')
      return
    }
    setBusy('upload')
    try {
      const nextRecord = await uploadProjectArchive(archive)
      setRecord(nextRecord)
      setScanJob(null)
      toast.success('导入预检已完成')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导入失败')
    } finally {
      setBusy(null)
    }
  }

  async function runGitImport() {
    if (!gitUrl.trim()) {
      toast.error('请输入 Git 仓库地址')
      return
    }
    setBusy('git')
    try {
      const nextRecord = await importGitProject({
        url: gitUrl.trim(),
        ref: gitRef.trim() || undefined,
        commit: gitCommit.trim() || undefined,
        projectName: gitName.trim() || undefined,
      })
      setRecord(nextRecord)
      setScanJob(null)
      toast.success('Git 仓库预检已完成')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导入失败')
    } finally {
      setBusy(null)
    }
  }

  async function runLocalImport() {
    if (!localPath.trim()) {
      toast.error('请输入服务端可访问的本地目录')
      return
    }
    setBusy('local')
    try {
      const nextRecord = await importLocalProject({
        path: localPath.trim(),
        projectName: localName.trim() || undefined,
      })
      setRecord(nextRecord)
      setScanJob(null)
      toast.success('本地目录预检已完成')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导入失败')
    } finally {
      setBusy(null)
    }
  }

  async function runScan() {
    if (!record) return
    setBusy('scan')
    try {
      const nextJob = await startProjectScan(record.importId, record.summary.scanScope)
      const audit = await runCodeAuditScan({ importId: record.importId })
      const dependencyAudit = await runDependencyAuditScan({
        importId: record.importId,
        includeOsv: true,
        includeCdxgen: false,
        includeCyclonedxPy: false,
      })
      setScanJob(nextJob)
      toast.success(
        `扫描任务已创建，代码审计发现 ${audit.summary.total} 项风险，依赖扫描发现 ${dependencyAudit.summary.total_dependencies} 个直接依赖`
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '创建扫描失败')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className='min-h-svh bg-background'>
      <Header fixed>
        <div className='flex min-w-0 flex-1 items-center justify-between gap-4'>
          <div className='min-w-0'>
            <div className='truncate text-sm font-semibold'>项目导入 / 扫描入口</div>
            <div className='truncate text-xs text-muted-foreground'>
              Backstage-style onboarding · Linguist-style preflight
            </div>
          </div>
          <div className='flex shrink-0 items-center gap-2'>
            <Search />
            <ThemeSwitch />
          </div>
        </div>
      </Header>

      <Main fluid className='space-y-5'>
        <div className='space-y-2'>
          <Badge variant='outline' className='rounded-md border-cyan-200 bg-cyan-50 text-cyan-700'>
            Import · Preflight · Scan Job
          </Badge>
          <h1 className='text-2xl font-semibold tracking-normal sm:text-3xl'>
            导入代码项目
          </h1>
          <p className='max-w-3xl text-sm leading-6 text-muted-foreground'>
            先选择代码来源，完成预检后确认扫描范围，再创建代码审计和供应链检测任务。
          </p>
        </div>

        {apiReady === false ? (
          <Alert variant='destructive' className='rounded-md'>
            <AlertTriangle className='size-4' />
            <AlertTitle>后端服务未连接</AlertTitle>
            <AlertDescription>
              请先启动 FastAPI 后端：python server.py --host 127.0.0.1 --port 8000。当前错误：{apiError}
            </AlertDescription>
          </Alert>
        ) : null}

        <section className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]'>
          <div className='grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]'>
            <StepRail hasSummary={Boolean(record)} hasScan={Boolean(scanJob)} />

            <Card className='rounded-md'>
              <CardHeader>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <FolderOpen className='size-4 text-cyan-600' />
                  选择来源
                </CardTitle>
                <CardDescription>
                  支持压缩包、Git URL 或服务端本地路径，预检完成后右侧会显示扫描摘要。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={mode} onValueChange={(value) => setMode(value as ImportMode)}>
                  <TabsList className='grid h-10 w-full grid-cols-3 rounded-md'>
                    <TabsTrigger value='upload'>
                      <FileArchive />
                      压缩包
                    </TabsTrigger>
                    <TabsTrigger value='git'>
                      <GitBranch />
                      Git
                    </TabsTrigger>
                    <TabsTrigger value='local'>
                      <FolderOpen />
                      本地
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value='upload' className='mt-4 space-y-4'>
                    <div className='space-y-2'>
                      <Label htmlFor='project-archive'>代码压缩包</Label>
                      <Input
                        id='project-archive'
                        type='file'
                        accept='.zip,.tar,.tar.gz,.tgz,application/zip,application/gzip'
                        onChange={(event) => setArchive(event.target.files?.[0] ?? null)}
                      />
                    </div>
                    {archive ? (
                      <FilePill
                        icon={FileArchive}
                        label={archive.name}
                        value={formatBytes(archive.size)}
                      />
                    ) : null}
                    <Button onClick={() => void runUpload()} disabled={busy !== null || apiReady === false} className='w-full sm:w-auto'>
                      {busy === 'upload' ? <Loader2 className='animate-spin' /> : <Upload />}
                      上传并预检
                    </Button>
                  </TabsContent>

                  <TabsContent value='git' className='mt-4 space-y-4'>
                    <div className='grid gap-4 md:grid-cols-2'>
                      <div className='space-y-2 md:col-span-2'>
                        <Label htmlFor='git-url'>Git URL</Label>
                        <Input
                          id='git-url'
                          value={gitUrl}
                          onChange={(event) => setGitUrl(event.target.value)}
                          placeholder='https://github.com/org/repo.git'
                        />
                      </div>
                      <div className='space-y-2'>
                        <Label htmlFor='git-ref'>Branch / Tag</Label>
                        <Input
                          id='git-ref'
                          value={gitRef}
                          onChange={(event) => setGitRef(event.target.value)}
                          placeholder='main'
                        />
                      </div>
                      <div className='space-y-2'>
                        <Label htmlFor='git-commit'>Commit</Label>
                        <Input
                          id='git-commit'
                          value={gitCommit}
                          onChange={(event) => setGitCommit(event.target.value)}
                          placeholder='optional'
                        />
                      </div>
                      <div className='space-y-2 md:col-span-2'>
                        <Label htmlFor='git-name'>项目名称</Label>
                        <Input
                          id='git-name'
                          value={gitName}
                          onChange={(event) => setGitName(event.target.value)}
                          placeholder='自动识别'
                        />
                      </div>
                    </div>
                    <Button onClick={() => void runGitImport()} disabled={busy !== null || apiReady === false} className='w-full sm:w-auto'>
                      {busy === 'git' ? <Loader2 className='animate-spin' /> : <GitBranch />}
                      拉取并预检
                    </Button>
                  </TabsContent>

                  <TabsContent value='local' className='mt-4 space-y-4'>
                    <div className='grid gap-4 md:grid-cols-2'>
                      <div className='space-y-2 md:col-span-2'>
                        <Label htmlFor='local-path'>本地路径</Label>
                        <Input
                          id='local-path'
                          value={localPath}
                          onChange={(event) => setLocalPath(event.target.value)}
                          placeholder='C:/Users/86189/Desktop/my-project'
                        />
                      </div>
                      <div className='space-y-2 md:col-span-2'>
                        <Label htmlFor='local-name'>项目名称</Label>
                        <Input
                          id='local-name'
                          value={localName}
                          onChange={(event) => setLocalName(event.target.value)}
                          placeholder='自动识别'
                        />
                      </div>
                    </div>
                    <Button onClick={() => void runLocalImport()} disabled={busy !== null || apiReady === false} className='w-full sm:w-auto'>
                      {busy === 'local' ? <Loader2 className='animate-spin' /> : <FolderOpen />}
                      导入并预检
                    </Button>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          <ProjectSummary
            record={record}
            topLanguages={topLanguages}
            scanJob={scanJob}
            busy={busy}
            onScan={() => void runScan()}
          />
        </section>
      </Main>
    </div>
  )
}

function StepRail({
  hasSummary,
  hasScan,
}: {
  hasSummary: boolean
  hasScan: boolean
}) {
  const steps = [
    { label: '选择来源', done: true },
    { label: '导入预检', done: hasSummary },
    { label: '创建扫描', done: hasScan },
  ]

  return (
    <Card className='rounded-md'>
      <CardHeader>
        <CardTitle className='text-base'>导入向导</CardTitle>
        <CardDescription>按顺序完成项目预检和扫描创建</CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
      {steps.map((step, index) => (
        <div key={step.label} className='flex items-center gap-3 rounded-md border p-3'>
          <div
            className={cn(
              'grid size-8 shrink-0 place-items-center rounded-md border text-sm font-semibold',
              step.done
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'border-border bg-muted text-muted-foreground'
            )}
          >
            {step.done ? <CheckCircle2 className='size-4' /> : index + 1}
          </div>
          <div className='min-w-0'>
            <div className='text-sm font-medium'>{step.label}</div>
            <div className='mt-0.5 text-xs text-muted-foreground'>
              {step.done ? '已完成' : '等待处理'}
            </div>
          </div>
        </div>
      ))}
      </CardContent>
    </Card>
  )
}

function ProjectSummary({
  record,
  topLanguages,
  scanJob,
  busy,
  onScan,
}: {
  record: ProjectImportRecord | null
  topLanguages: ProjectImportRecord['summary']['languages']
  scanJob: ScanJob | null
  busy: ImportMode | 'scan' | null
  onScan: () => void
}) {
  if (!record) {
    return (
      <Card className='rounded-md xl:sticky xl:top-20 xl:self-start'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-base'>
            <ScanSearch className='size-4 text-cyan-600' />
            预检摘要
          </CardTitle>
          <CardDescription>等待导入完成</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='grid min-h-[460px] place-items-center rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground'>
            <div className='space-y-3'>
              <div className='mx-auto grid size-12 place-items-center rounded-md bg-muted'>
                <ShieldCheck className='size-6' />
              </div>
              <div>项目名称、语言、依赖文件和 CI 文件会显示在这里</div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const summary = record.summary
  const statItems = [
    { label: '总文件', value: formatNumber(summary.fileStats.total), icon: FileText },
    { label: '参与扫描', value: formatNumber(summary.fileStats.scannable), icon: ScanSearch },
    { label: '已忽略', value: formatNumber(summary.fileStats.ignored), icon: AlertTriangle },
    { label: '依赖文件', value: formatNumber(summary.dependencyFiles.length), icon: PackageCheck },
  ]

  return (
    <div className='space-y-4 xl:sticky xl:top-20 xl:self-start'>
      <Card className='rounded-md'>
        <CardHeader>
          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div>
              <CardTitle className='flex items-center gap-2 text-base'>
                <ScanSearch className='size-4 text-cyan-600' />
                预检摘要
              </CardTitle>
              <CardDescription>{record.importId}</CardDescription>
            </div>
            <Badge variant='outline' className='rounded-md'>
              {sourceLabels[record.sourceType]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className='space-y-5'>
          <div className='flex flex-wrap items-start justify-between gap-4'>
            <div className='min-w-0'>
              <div className='truncate text-2xl font-semibold tracking-normal'>
                {record.projectName}
              </div>
              <div className='mt-1 truncate text-sm text-muted-foreground'>
                {sourceLabel(record)}
              </div>
            </div>
            <Button onClick={onScan} disabled={busy !== null} className='shrink-0'>
              {busy === 'scan' ? <Loader2 className='animate-spin' /> : <Play />}
              开始扫描
            </Button>
          </div>

          <div className='grid grid-cols-2 gap-3'>
            {statItems.map((item) => (
              <div key={item.label} className='rounded-md border p-3'>
                <div className='flex items-center justify-between gap-2'>
                  <span className='text-xs text-muted-foreground'>{item.label}</span>
                  <item.icon className='size-4 text-cyan-600' />
                </div>
                <div className='mt-2 text-2xl font-semibold'>{item.value}</div>
              </div>
            ))}
          </div>

          <div className='space-y-3'>
            <div className='flex items-center gap-2 text-sm font-medium'>
              <Code2 className='size-4 text-emerald-600' />
              语言分布
            </div>
            {topLanguages.length ? (
              <div className='space-y-3'>
                {topLanguages.map((language) => (
                  <div key={language.name} className='space-y-1'>
                    <div className='flex items-center justify-between gap-3 text-sm'>
                      <span>{language.name}</span>
                      <span className='text-muted-foreground'>
                        {language.percent}% · {language.files} files
                      </span>
                    </div>
                    <div className='h-2 overflow-hidden rounded-full bg-muted'>
                      <div
                        className='h-full rounded-full bg-cyan-600'
                        style={{ width: `${Math.max(language.percent, 2)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className='rounded-md border p-3 text-sm text-muted-foreground'>
                未识别到主要语言
              </div>
            )}
          </div>

          <Separator />

          <div className='grid gap-4 lg:grid-cols-2'>
            <FileList
              icon={PackageCheck}
              title='依赖文件'
              items={summary.dependencyFiles}
              empty='未发现依赖文件'
            />
            <FileList
              icon={Workflow}
              title='CI 文件'
              items={summary.ciFiles}
              empty='未发现 CI 文件'
            />
          </div>

          {summary.warnings.length ? (
            <>
              <Separator />
              <Alert className='rounded-md'>
                <AlertTriangle className='size-4' />
                <AlertTitle>预检提示</AlertTitle>
                <AlertDescription>
                  <div className='mt-2 grid gap-2'>
                    {summary.warnings.map((warning) => (
                      <div key={warning}>{warning}</div>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            </>
          ) : null}

          {scanJob ? (
            <Alert className='rounded-md border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/35 dark:text-emerald-200'>
              <CheckCircle2 className='size-4' />
              <AlertTitle>扫描任务已创建</AlertTitle>
              <AlertDescription>
                {scanJob.scanId} · {scanJob.engines.join(', ')}
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function FileList({
  icon: Icon,
  title,
  items,
  empty,
}: {
  icon: typeof PackageCheck
  title: string
  items: string[]
  empty: string
}) {
  return (
    <div className='rounded-md border p-3'>
      <div className='mb-3 flex items-center justify-between gap-3'>
        <div className='flex items-center gap-2 text-sm font-medium'>
          <Icon className='size-4 text-cyan-600' />
          {title}
        </div>
        <Badge variant='outline' className='rounded-md'>
          {items.length}
        </Badge>
      </div>
      {items.length ? (
        <div className='max-h-44 space-y-2 overflow-auto pr-1'>
          {items.slice(0, 24).map((item) => (
            <div key={item} className='truncate rounded-md bg-muted px-2 py-1.5 font-mono text-xs'>
              {item}
            </div>
          ))}
          {items.length > 24 ? (
            <div className='text-xs text-muted-foreground'>+{items.length - 24} more</div>
          ) : null}
        </div>
      ) : (
        <div className='rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground'>
          {empty}
        </div>
      )}
    </div>
  )
}

function FilePill({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileArchive
  label: string
  value: string
}) {
  return (
    <div className='flex items-center justify-between gap-3 rounded-md border p-3 text-sm'>
      <div className='flex min-w-0 items-center gap-2'>
        <Icon className='size-4 shrink-0 text-cyan-600' />
        <span className='truncate font-medium'>{label}</span>
      </div>
      <span className='shrink-0 text-muted-foreground'>{value}</span>
    </div>
  )
}

function sourceLabel(record: ProjectImportRecord) {
  if (record.sourceType === 'git') {
    return `${record.sourceRef.url ?? ''} ${record.sourceRef.ref ? `· ${record.sourceRef.ref}` : ''}`
  }
  if (record.sourceType === 'upload') {
    return String(record.sourceRef.filename ?? '')
  }
  return String(record.sourceRef.path ?? '')
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value)
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${value} B`
}
