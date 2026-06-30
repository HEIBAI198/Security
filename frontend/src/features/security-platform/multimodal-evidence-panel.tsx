import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  motion, AnimatePresence, useReducedMotion, useSpring,
} from 'motion/react'
import {
  ArrowRight, Boxes, Camera,
  ChevronRight, Copy, Eye, FileSearch, FileText,
  ImageIcon, Images, Loader2, Music2,
  RefreshCw, Search, ShieldAlert, ShieldCheck,
  Siren, TerminalSquare, Upload, Video, X, Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  analyzeMultimodalRecognizedText, loadMultimodalEvidenceLatest,
  runMultimodalEvidenceScan,
  type MultimodalAuditResult,
  type MultimodalEvidence, type MultimodalFinding,
  type MultimodalSourceType, type SecuritySeverity,
} from '@/lib/security-api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip as UiTooltip, TooltipContent as UiTooltipContent, TooltipTrigger as UiTooltipTrigger } from '@/components/ui/tooltip'

/* ── Types ── */
type MultimodalFindingRow = MultimodalFinding & { source_name: string; source_type: MultimodalSourceType }

/* ── Constants ── */
const SEV: Record<SecuritySeverity, { label: string; border: string; bg: string; text: string; glow: string }> = {
  critical: { label:'严重', border:'border-red-500/40', bg:'bg-red-950/40', text:'text-red-300', glow:'shadow-[0_0_24px_rgba(239,68,68,0.15)]' },
  high:     { label:'高危', border:'border-orange-500/35', bg:'bg-orange-950/35', text:'text-orange-300', glow:'shadow-[0_0_18px_rgba(249,115,22,0.12)]' },
  medium:   { label:'中危', border:'border-amber-500/25', bg:'bg-amber-950/30', text:'text-amber-300', glow:'shadow-[0_0_12px_rgba(245,158,11,0.08)]' },
  low:      { label:'低危', border:'border-emerald-500/25', bg:'bg-emerald-950/30', text:'text-emerald-300', glow:'' },
}
const SRC_ICONS: Record<MultimodalSourceType, typeof ImageIcon> = { image:ImageIcon, audio:Music2, video:Video }
const SRC_LABEL: Record<MultimodalSourceType, string> = { image:'图像', audio:'音频', video:'视频' }

const TYPE_LABEL: Record<string, string> = { ip:'IP', domain:'域名', cve:'CVE', package:'软件包', api_path:'API路径', service:'服务名', action:'可疑操作', time:'时间点', secret_keyword:'凭据' }

/* ── Helpers ── */
const tLabel = (v:string) => TYPE_LABEL[v]||v
const eColor = (t:string) => t==='ip'||t==='package'?SEV.high:t==='api_path'||t==='secret_keyword'?SEV.medium:t==='action'?SEV.critical:SEV.low
const short = (v:unknown,n:number):string => { const t=String(v??'').replace(/\n/g,' ').trim(); return t.length<=n?t:`${t.slice(0,n-3)}...` }
const fmtBytes = (b:number):string => b>=1073741824?`${(b/1073741824).toFixed(1)}GB`:b>=1048576?`${(b/1048576).toFixed(1)}MB`:b>=1024?`${(b/1024).toFixed(0)}KB`:`${b}B`

/* ── Aggregation ── */
/* ── Severity Badge ── */
function SevBadge({s,pulse,className}:{s:SecuritySeverity;pulse?:boolean;className?:string}){
  const c=SEV[s]
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold',c.border,c.bg,c.text,pulse&&'animate-pulse',className)}>
    {(s==='critical'||s==='high')&&<span className={cn('size-1.5 rounded-full',s==='critical'?'bg-red-400':'bg-orange-400',pulse&&'animate-ping')}/>}
    {c.label}
  </span>
}

/* ── Animated Ring ── */
function RiskRing({score,level}:{score:number;level:string}){
  // Container is 1/3 of card width via w-[33%] + aspect-square
  const r=84, cx=100, cy=100, rw=7, circ=Math.round(2*Math.PI*r)
  const tgt=circ-(score/100)*circ
  const spr=useSpring(0,{stiffness:22,damping:12,mass:0.8})
  useEffect(()=>{spr.set(tgt)},[tgt,spr])
  const tone=level==='critical'?'text-red-400':level==='high'?'text-orange-400':level==='medium'?'text-amber-400':'text-emerald-400'
  return <div className="relative w-[33%] aspect-square mx-auto grid place-items-center">
    <svg className="absolute inset-0 -rotate-90 overflow-visible" viewBox="0 0 200 200">
      {/* Track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={rw} className="text-border/8"/>
      {/* Glow blur behind the arc */}
      <motion.circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={rw+4} strokeLinecap="round"
        strokeDasharray={circ} style={{strokeDashoffset:spr,filter:'blur(8px)',opacity:.35}} className={tone}/>
      {/* Main arc */}
      <motion.circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={rw} strokeLinecap="round"
        strokeDasharray={circ} style={{strokeDashoffset:spr}} className={cn(tone,'drop-shadow-[0_0_10px_currentColor]')}/>
    </svg>
    {/* Score number */}
    <motion.span
      className={cn('relative text-[clamp(1.8rem,5cqi,3.2rem)] font-black tabular-nums tracking-tighter leading-none',tone)}
      initial={{scale:0.5,opacity:0}} animate={{scale:1,opacity:1}}
      transition={{type:'spring',stiffness:180,damping:14,delay:.2}}>{score}</motion.span>
  </div>
}

/* ── Tool Health Dot ── */
function ToolDot({tools}:{tools:MultimodalAuditResult['tools']}){
  const ok=tools.filter(t=>t.available).length, total=tools.length
  return <UiTooltip>
    <UiTooltipTrigger asChild>
      <button type="button" className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-all duration-300 hover:scale-[1.03] active:scale-[0.97]',ok===total?'border-emerald-500/25 bg-emerald-950/30 text-emerald-300':'border-amber-500/25 bg-amber-950/30 text-amber-300')}>
        <span className={cn('size-1.5 rounded-full',ok===total?'bg-emerald-400':'bg-amber-400')}/>{ok}/{total}
      </button>
    </UiTooltipTrigger>
    <UiTooltipContent side="bottom" className="w-64 space-y-1 p-3">
      <p className="text-[11px] font-medium mb-1">多模态引擎</p>
      {tools.map(t=><div key={t.name} className="flex justify-between text-[11px]"><span className="text-muted-foreground">{t.name}</span><span className={cn('font-mono',t.available?'text-emerald-400':'text-red-400')}>{t.available?(t.version||'OK'):(t.error||'未安装')}</span></div>)}
    </UiTooltipContent>
  </UiTooltip>
}

function normalizeMultimodalRiskLevel(score: number, level?: string): SecuritySeverity {
  if (level === 'critical' || level === 'high' || level === 'medium' || level === 'low') return level
  if (score >= 90) return 'critical'
  if (score >= 75) return 'high'
  if (score >= 55) return 'medium'
  return 'low'
}

function externalGaugeTone(severity: SecuritySeverity) {
  if (severity === 'critical') return { glow: 'bg-red-500/10', pulse: 'bg-red-500/15', stroke: 'stroke-red-400', text: 'text-red-100' }
  if (severity === 'high') return { glow: 'bg-orange-500/10', pulse: 'bg-orange-500/15', stroke: 'stroke-orange-400', text: 'text-orange-100' }
  if (severity === 'medium') return { glow: 'bg-amber-500/10', pulse: 'bg-amber-500/15', stroke: 'stroke-amber-400', text: 'text-amber-100' }
  return { glow: 'bg-emerald-500/10', pulse: 'bg-emerald-500/15', stroke: 'stroke-emerald-400', text: 'text-emerald-100' }
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  const isTextValue = typeof value === 'string' || typeof value === 'number'
  return (
    <div className='grid min-w-0 grid-cols-[88px_minmax(0,1fr)] items-center gap-3 rounded-md border border-border bg-[color:var(--surface-inset)] px-3 py-2'>
      <span className='whitespace-nowrap text-[12px] font-semibold text-muted-foreground'>{label}</span>
      <div className='min-w-0 overflow-hidden text-right text-sm font-semibold text-[color:var(--type-body)]' title={isTextValue ? String(value) : undefined}>
        {isTextValue ? <span className='block truncate'>{value}</span> : value}
      </div>
    </div>
  )
}

function ExternalInfoBlock({
  title,
  children,
  tone = 'default',
}: {
  title: string
  children: ReactNode
  tone?: 'default' | 'risk' | 'action'
}) {
  const toneClass =
    tone === 'risk'
      ? 'border-red-300/25 bg-red-500/10 text-red-50'
      : tone === 'action'
        ? 'border-cyan-300/30 bg-cyan-400/10 text-cyan-50'
        : 'border-border bg-[color:var(--surface-inset)]'
  const titleClass =
    tone === 'risk'
      ? 'text-red-100'
      : tone === 'action'
        ? 'text-cyan-100'
        : 'text-[color:var(--type-body)]'
  return (
    <div className={cn('min-w-0 overflow-hidden rounded-md border p-3', toneClass)}>
      <div className={cn('mb-2 flex items-center gap-1.5 text-sm font-bold', titleClass)}>
        {tone === 'action' ? <ShieldCheck className='size-4' /> : null}
        {title}
      </div>
      <div className='break-words text-sm leading-6 [overflow-wrap:anywhere]'>{children}</div>
    </div>
  )
}

function ExternalEvidenceBlock({ finding }: { finding: MultimodalFindingRow }) {
  const snippet = finding.entities.find(entity => entity.evidence)?.evidence || finding.matched_keywords.join(' · ') || '未提供证据片段'
  return (
    <ExternalInfoBlock title='关键证据'>
      <div className='space-y-3'>
        {finding.matched_keywords.length > 0 && (
          <div>
            <div className='mb-1.5 text-[11px] text-muted-foreground'>命中关键词</div>
            <div className='flex flex-wrap gap-1.5'>
              {finding.matched_keywords.map(keyword => (
                <span key={keyword} className='rounded-md border border-cyan-300/15 bg-cyan-400/10 px-2 py-0.5 font-mono text-[10px] text-cyan-100'>{keyword}</span>
              ))}
            </div>
          </div>
        )}
        {finding.entities.length > 0 && (
          <div>
            <div className='mb-1.5 text-[11px] text-muted-foreground'>关联实体</div>
            <div className='flex flex-wrap gap-1.5'>
              {finding.entities.map((entity, index) => (
                <span key={`${entity.type}-${entity.value}-${index}`} className={cn('rounded-md border px-2 py-0.5 text-[10px] font-semibold', eColor(entity.type).border, eColor(entity.type).bg)}>
                  {tLabel(entity.type)}:<span className='ml-1 font-mono'>{entity.value}</span>
                </span>
              ))}
            </div>
          </div>
        )}
        <pre className='max-h-[170px] min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-md border border-cyan-300/20 bg-[color:var(--surface-panel)] px-3 py-2 font-mono text-xs font-semibold leading-5 text-cyan-50 [overflow-wrap:anywhere] [scrollbar-width:thin]'>
          {snippet}
        </pre>
      </div>
    </ExternalInfoBlock>
  )
}

function MultimodalRiskOverviewCard({
  score,
  level,
  evidenceCount,
  findingCount,
  derivedCount,
  findings,
}: {
  score: number
  level: SecuritySeverity
  evidenceCount: number
  findingCount: number
  derivedCount: number
  findings: MultimodalFindingRow[]
}) {
  const radius = 44
  const circumference = 2 * Math.PI * radius
  const reducedMotion = useReducedMotion()
  const tone = externalGaugeTone(level)
  const clampedScore = Math.max(0, Math.min(100, score))
  const severityData = [
    { label: '严重', value: findings.filter(f => f.severity === 'critical').length, color: 'bg-red-400' },
    { label: '高危', value: findings.filter(f => f.severity === 'high').length, color: 'bg-orange-400' },
    { label: '中危', value: findings.filter(f => f.severity === 'medium').length, color: 'bg-amber-300' },
    { label: '低危', value: findings.filter(f => f.severity === 'low').length, color: 'bg-cyan-300' },
  ]
  const severityTotal = Math.max(1, severityData.reduce((sum, item) => sum + item.value, 0))
  return (
    <Card className='group h-[560px] min-w-0 overflow-hidden rounded-md border-border bg-[color:var(--surface-card)] shadow-[0_14px_34px_rgba(2,6,23,0.24)] transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-cyan-300/25 xl:h-[560px]'>
      <CardContent className='relative flex h-full flex-col p-4'>
        <div className={cn('absolute -right-10 -top-12 size-32 rounded-full blur-3xl', tone.glow)} />
        <div className='relative flex items-center justify-between gap-3'>
          <div className='text-[12px] font-semibold text-muted-foreground'>风险评分</div>
          <SevBadge s={level} />
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
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: reducedMotion ? 0 : circumference * (1 - clampedScore / 100) }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
              />
            </svg>
            <div className='absolute inset-0 grid place-items-center'>
              <div className='text-center'>
                <div className={cn('text-5xl font-black tabular-nums tracking-tight', tone.text)}>{score}</div>
                <div className='mt-1 text-[12px] font-semibold text-muted-foreground'>风险评分</div>
              </div>
            </div>
          </div>
        </div>
        <div className='grid grid-cols-3 gap-2'>
          {[
            ['证据材料', evidenceCount, 'text-cyan-100'],
            ['风险发现', findingCount, 'text-red-100'],
            ['派生产物', derivedCount, 'text-amber-100'],
          ].map(([label, value, color]) => (
            <div key={label} className='rounded-md border border-border bg-[color:var(--surface-inset)] px-2 py-2 text-center'>
              <div className='text-[12px] font-semibold text-muted-foreground'>{label}</div>
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
                style={{ width: `${Math.max(item.value > 0 ? 10 : 6, (item.value / severityTotal) * 100)}%` }}
              />
            ))}
          </div>
          <div className='mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] font-semibold text-muted-foreground'>
            {severityData.map((item) => <span key={item.label} className='tabular-nums'>{item.label} {item.value}</span>)}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* ── Detail Sheet ── */
function DetailSheet({evidence,open,onClose}:{evidence:MultimodalEvidence|null;open:boolean;onClose:()=>void}){
  const [tab,setTab]=useState('overview')
  if(!evidence)return null
  const st=(evidence.source_type as MultimodalSourceType)||'image'
  const SIcon=SRC_ICONS[st]
  return <Sheet open={open} onOpenChange={v=>{if(!v)onClose()}}>
    <SheetContent side="right" className="!w-[58vw] !max-w-[680px] overflow-hidden flex flex-col p-0">
      <div className="shrink-0 border-b border-border/50 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg surface-inset"><SIcon className="size-4 text-cyan-400"/></div>
              <SheetTitle className="text-base font-bold tracking-tight truncate">{evidence.original_filename}</SheetTitle>
            </div>
            <SheetDescription className="mt-1.5 flex items-center gap-3 text-[11px]">
              <span className="font-mono">{evidence.evidence_id}</span><span>·</span><span>{SRC_LABEL[st]}</span><span>·</span><span>{fmtBytes(evidence.size_bytes)}</span>
              {evidence.risk_level&&evidence.risk_level!=='low'&&<><span>·</span><SevBadge s={evidence.risk_level as SecuritySeverity}/></>}
            </SheetDescription>
          </div>
        </div>
        <Tabs value={tab} onValueChange={setTab} className="mt-3">
          <TabsList className="h-8 surface-inset">
            <TabsTrigger value="overview" className="text-[11px] h-7">概览</TabsTrigger>
            {evidence.recognitions.length>0&&<TabsTrigger value="ocr" className="text-[11px] h-7">OCR/ASR<Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 h-4">{evidence.recognitions.length}</Badge></TabsTrigger>}
            {evidence.entities.length>0&&<TabsTrigger value="entities" className="text-[11px] h-7">实体<Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 h-4">{evidence.entities.length}</Badge></TabsTrigger>}
            {evidence.findings.length>0&&<TabsTrigger value="findings" className="text-[11px] h-7">命中<Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 h-4">{evidence.findings.length}</Badge></TabsTrigger>}
          </TabsList>
        </Tabs>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <Tabs value={tab}>
          <TabsContent value="overview" className="mt-0 space-y-5">
            <div className="grid grid-cols-3 gap-x-6 gap-y-3">
              {[['文件类型',SRC_LABEL[st]],['MIME',evidence.mime_type],['大小',fmtBytes(evidence.size_bytes)],['SHA256',evidence.sha256?`${evidence.sha256.slice(0,20)}...`:'—'],['上传时间',evidence.uploaded_at?.slice(0,19).replace('T',' ')],['风险评分',`${evidence.risk_score??0}`]].map(([l,v])=><div key={l}><div className="text-[10px] text-muted-foreground uppercase tracking-wider">{l}</div><div className="mt-0.5 text-sm font-medium break-all font-mono">{v}</div></div>)}
            </div>
            {evidence.derived.length>0&&<div><h4 className="mb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">派生产物</h4><div className="space-y-1.5">{evidence.derived.map((d,i)=><div key={i} className="flex items-center gap-2 rounded-lg surface-inset px-3 py-2 text-[11px]"><Boxes className="size-3 text-cyan-400"/><span className="font-medium">{d.kind}</span><span className="text-muted-foreground">via {d.tool}</span><span className="ml-auto font-mono text-muted-foreground">{fmtBytes(d.size_bytes)}</span></div>)}</div></div>}
            {evidence.metadata&&Object.keys(evidence.metadata).length>0&&<div><h4 className="mb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">元数据</h4><pre className="rounded-lg surface-inset p-3 font-mono text-[11px] text-muted-foreground max-h-48 overflow-y-auto">{JSON.stringify(evidence.metadata,null,2)}</pre></div>}
          </TabsContent>
          {evidence.recognitions.length>0&&<TabsContent value="ocr" className="mt-0 space-y-4">
            {evidence.recognitions.map((rec,i)=><div key={i} className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><span className="font-medium text-foreground/80">{rec.evidence_type==='audio_asr'?'音频 ASR':'视觉 OCR'}</span><span>·</span><span>{rec.engine}</span><span>·</span><span>置信度 {Math.round(rec.confidence*100)}%</span>{rec.language&&<><span>·</span><span>{rec.language}</span></>}</div>
              <div className="relative group"><pre className="rounded-lg border border-cyan-500/10 surface-inset p-4 font-mono text-sm leading-relaxed text-cyan-50/80 whitespace-pre-wrap break-all max-h-96 overflow-y-auto">{rec.recognized_text||'(无内容)'}</pre><Button variant="ghost" size="sm" className="absolute top-2 right-2 h-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={()=>{navigator.clipboard.writeText(rec.recognized_text);toast.success('已复制')}}><Copy className="size-3"/>复制</Button></div>
            </div>)}
          </TabsContent>}
          {evidence.entities.length>0&&<TabsContent value="entities" className="mt-0">
            <div className="flex flex-wrap gap-2">{evidence.entities.map((e,i)=>{const c=eColor(e.type);return<div key={i} className={cn('rounded-lg border px-3 py-2',c.border,c.bg)}><div className="flex items-center gap-1.5 text-[11px]"><span className="text-muted-foreground">{tLabel(e.type)}</span><span className={cn('text-sm font-bold font-mono',c.text)}>{e.value}</span></div>{e.evidence&&<div className="mt-1 text-[10px] text-muted-foreground/60 font-mono line-clamp-2">{short(e.evidence,120)}</div>}</div>})}</div>
          </TabsContent>}
          {evidence.findings.length>0&&<TabsContent value="findings" className="mt-0 space-y-3">
            {evidence.findings.sort((a,b)=>b.score-a.score).map(f=>{const c=SEV[f.severity];return<div key={f.id} className={cn('rounded-xl border p-4',c.border,c.bg)}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><SevBadge s={f.severity}/><span className="text-sm font-bold">{f.title}</span></div><div className="mt-1.5 text-[11px] text-muted-foreground"><span className="font-mono">{f.rule_id}</span><span className="mx-2">·</span>分数 {f.score}</div></div></div>{f.matched_keywords.length>0&&<div className="mt-2.5 flex flex-wrap gap-1">{f.matched_keywords.map(kw=><span key={kw} className="rounded-md surface-inset border-cyan-500/10 px-2 py-0.5 text-[10px] font-mono text-cyan-300">{kw}</span>)}</div>}<p className="mt-2.5 text-[11px] text-muted-foreground/80 leading-relaxed"><span className="font-medium text-amber-300">建议: </span>{f.recommendation}</p></div>})}
          </TabsContent>}
        </Tabs>
      </div>
    </SheetContent>
  </Sheet>
}

const multimodalFindingKey = (finding: MultimodalFindingRow) => `${finding.source_name}:${finding.id}`

function MultimodalFindingNameList({
  findings,
  selectedKey,
  severityFilter,
  sourceFilter,
  entityFilter,
  reducedMotion,
  onSelect,
  onSeverityFilterChange,
  onSourceFilterChange,
  onClearEntityFilter,
}: {
  findings: MultimodalFindingRow[]
  selectedKey: string | null
  severityFilter: SecuritySeverity | 'all'
  sourceFilter: MultimodalSourceType | 'all'
  entityFilter: string | null
  reducedMotion: boolean | null
  onSelect: (key: string) => void
  onSeverityFilterChange: (value: SecuritySeverity | 'all') => void
  onSourceFilterChange: (value: MultimodalSourceType | 'all') => void
  onClearEntityFilter: () => void
}) {
  return <Card className="flex h-[560px] min-w-0 flex-col overflow-hidden rounded-md border-border bg-[color:var(--surface-card)] shadow-[0_14px_34px_rgba(2,6,23,0.24)] xl:h-[560px]">
    <CardHeader className="shrink-0 pb-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className='min-w-0'>
          <div className='flex items-center gap-2'>
            <CardTitle className="text-section-title">风险发现</CardTitle>
            <span className='meta-chip'>{findings.length}</span>
          </div>
          <div className='mt-1 truncate text-xs text-muted-foreground'>
            {selectedKey ? findings.find(f => multimodalFindingKey(f) === selectedKey)?.title ?? '外部告警证据' : '外部告警证据'}
          </div>
        </div>
        {entityFilter && <Badge variant="secondary" className="shrink-0 gap-1 text-[11px]">
          实体:{entityFilter}
          <button type="button" onClick={onClearEntityFilter}><X className="size-3" /></button>
        </Badge>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {(['all', 'critical', 'high', 'medium', 'low'] as const).map(s => {
            const on = severityFilter === s
            const c = s !== 'all' ? SEV[s as SecuritySeverity] : null
            return <button
              key={s}
              type="button"
              onClick={() => onSeverityFilterChange(s)}
              className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.96]', on ? s === 'all' ? 'bg-foreground/8 text-foreground' : cn(c!.border, c!.bg, c!.text, 'ring-1 ring-current/15') : 'text-muted-foreground hover:text-foreground')}
            >
              {s === 'all' ? '全部' : SEV[s as SecuritySeverity].label}
            </button>
          })}
        </div>
        <Select value={sourceFilter} onValueChange={v => onSourceFilterChange(v as MultimodalSourceType | 'all')}>
          <SelectTrigger className="h-7 w-24 rounded-md border-border bg-[color:var(--surface-inset)] text-[11px] text-foreground"><SelectValue placeholder="全部类型" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="image">图像</SelectItem>
            <SelectItem value="audio">音频</SelectItem>
            <SelectItem value="video">视频</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </CardHeader>
    <CardContent className="min-h-0 flex-1">
      <div className='h-full min-h-0 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin]'>
        <div className='space-y-1.5 rounded-md border border-border bg-[color:var(--surface-inset)] p-3'>
      <AnimatePresence mode="popLayout">
        {findings.length === 0 ? <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
          <ShieldCheck className="size-10 text-muted-foreground/20" />
          无匹配结果
          {entityFilter && <Button variant="ghost" size="sm" onClick={onClearEntityFilter}>清除筛选</Button>}
        </motion.div> : findings.slice(0, 25).map((finding, index) => {
          const key = multimodalFindingKey(finding)
          const selected = selectedKey === key
          return <motion.button
            key={key}
            type="button"
            layout={!reducedMotion}
            initial={reducedMotion ? {} : { opacity: 0, y: 10, scale: .98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: .96, transition: { duration: .15 } }}
            transition={{ delay: Math.min(index * .015, .25), duration: .3, ease: [.16, 1, .3, 1] }}
            onClick={() => onSelect(key)}
            className={cn('grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-md border px-2.5 py-2 text-left text-xs transition-[border-color,background-color]', selected ? 'border-cyan-300/35 bg-cyan-400/10' : 'border-slate-400/10 bg-[color:var(--surface-inset)] hover:border-slate-300/25 hover:bg-[color:var(--surface-inset)]')}
          >
            <SevBadge s={finding.severity} />
            <div className='min-w-0'>
              <div className="truncate text-sm font-semibold text-foreground" title={finding.title}>{finding.title}</div>
              <div className='mt-0.5 truncate text-[11px] text-muted-foreground' title={`${finding.source_name} · ${finding.rule_id}`}>
                {finding.source_name} · {finding.score}分
              </div>
            </div>
          </motion.button>
        })}
      </AnimatePresence>
      {findings.length > 25 && <div className="pt-3 text-center text-[11px] text-muted-foreground">显示前25条，共{findings.length}条。使用筛选缩小范围。</div>}
        </div>
      </div>
    </CardContent>
  </Card>
}

function MultimodalFindingDetailPanel({
  finding,
  evidence,
  entityFilter,
  onOpenEvidence,
  onEntityFilter,
}: {
  finding: MultimodalFindingRow | null
  evidence: MultimodalEvidence | null
  entityFilter: string | null
  onOpenEvidence: (finding: MultimodalFindingRow) => void
  onEntityFilter: (value: string) => void
}) {
  if (!finding) {
    return <Card className="flex h-[560px] min-w-0 flex-col overflow-hidden rounded-md border-border bg-[color:var(--surface-card)] shadow-[0_14px_34px_rgba(2,6,23,0.24)] xl:h-[560px]">
      <CardHeader className='pb-3'>
        <CardTitle className='min-w-0 truncate text-base text-foreground'>风险属性</CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin]">
        <div className='rounded-md border border-slate-400/10 bg-[color:var(--surface-inset)] p-6 text-center text-sm text-muted-foreground'>
          选择一项风险后查看属性。
        </div>
      </CardContent>
    </Card>
  }
  const Icon = SRC_ICONS[finding.source_type]
  return <Card className="flex h-[560px] min-w-0 flex-col overflow-hidden rounded-md border-border bg-[color:var(--surface-card)] shadow-[0_14px_34px_rgba(2,6,23,0.24)] xl:h-[560px]">
    <CardHeader className="shrink-0 pb-3">
      <div className="flex items-start justify-between gap-3">
        <CardTitle className="min-w-0 truncate text-base text-foreground" title={finding.title}>
          {finding.title}
        </CardTitle>
        {evidence && <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5 text-[11px]" onClick={() => onOpenEvidence(finding)}>
          <Eye className="size-3.5" />
          原始材料
        </Button>}
      </div>
    </CardHeader>
    <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin]">
      <div className="flex flex-wrap gap-2">
        <SevBadge s={finding.severity} pulse={finding.severity === 'critical'} />
        <span className='rounded-full border border-red-400/25 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-200'>
          风险 {finding.score}
        </span>
        <span className='rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2 py-0.5 text-xs font-medium text-cyan-100'>
          {SRC_LABEL[finding.source_type]}
        </span>
      </div>
      <div className='grid gap-2 text-sm'>
        <DetailRow label='来源' value={finding.source_name} />
        <DetailRow label='规则' value={finding.rule_id} />
        <DetailRow label='类型' value={SRC_LABEL[finding.source_type]} />
      </div>
      <ExternalInfoBlock title='风险原因' tone='risk'>
        <p>
          外部告警材料触发 {SEV[finding.severity].label} 规则，说明截图、文本或告警内容中出现了与供应链攻击相关的异常行为或敏感线索。
        </p>
      </ExternalInfoBlock>
      <ExternalEvidenceBlock finding={finding} />
      <ExternalInfoBlock title='修复建议' tone='action'>
        <p className='font-semibold'>{finding.recommendation}</p>
      </ExternalInfoBlock>
    </CardContent>
  </Card>
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN PANEL
   ══════════════════════════════════════════════════════════════════════ */
export function MultimodalEvidencePanel({result,workspaceId,onScanned}:{
  result?:MultimodalAuditResult|null; workspaceId?:string
  onScanned:(r:MultimodalAuditResult)=>void|Promise<void>
}){
  const rm=useReducedMotion()
  const ev=result?.evidence??[]; const tools=result?.tools??[]; const sum=result?.summary

  const [files,setFiles]=useState<File[]>([])
  const [uploading,setUploading]=useState(false)
  const [refreshing,setRefreshing]=useState(false)
  const [text,setText]=useState('')
  const [analyzing,setAnalyzing]=useState(false)
  const [sevF,setSevF]=useState<SecuritySeverity|'all'>('all')
  const [srcF,setSrcF]=useState<MultimodalSourceType|'all'>('all')
  const [detail,setDetail]=useState<MultimodalEvidence|null>(null)
  const [rawOpen,setRawOpen]=useState(false)
  const [eFilt,setEFilt]=useState<string|null>(null)
  const [selectedFindingKey,setSelectedFindingKey]=useState<string|null>(null)
  const [textDialogOpen,setTextDialogOpen]=useState(false)
  const fileInputRef=useRef<HTMLInputElement>(null)

  /* derived */
  const fRows:MultimodalFindingRow[]=useMemo(()=>ev.flatMap(e=>e.findings.map(f=>({...f,source_name:e.original_filename,source_type:(e.source_type as MultimodalSourceType)||'image'}))),[ev])

  const ff=useMemo(()=>{
    let r=fRows
    if(sevF!=='all')r=r.filter(f=>f.severity===sevF)
    if(srcF!=='all')r=r.filter(f=>f.source_type===srcF)
    if(eFilt)r=r.filter(f=>f.entities.some(e=>(e.normalized||e.value).toLowerCase().includes(eFilt.toLowerCase())))
    return r.sort((a,b)=>b.score-a.score)
  },[fRows,sevF,srcF,eFilt])

  const selectedFinding = ff.find(f => multimodalFindingKey(f) === selectedFindingKey) ?? ff[0] ?? null
  const selectedFindingEvidence = selectedFinding ? ev.find(e => e.original_filename === selectedFinding.source_name && e.findings.some(f => f.id === selectedFinding.id)) ?? null : null

  useEffect(() => {
    if (!ff.length) {
      if (selectedFindingKey) setSelectedFindingKey(null)
      return
    }
    if (!selectedFindingKey || !ff.some(f => multimodalFindingKey(f) === selectedFindingKey)) {
      setSelectedFindingKey(multimodalFindingKey(ff[0]))
    }
  }, [ff, selectedFindingKey])

  /* actions */
  async function upload(fileList?: File[]){
    const f = fileList ?? files
    if(!f.length)return; setUploading(true)
    try{const r=await runMultimodalEvidenceScan(f,workspaceId);await onScanned(r);setFiles([]);toast.success(`已处理 ${r.summary.evidence_count} 条`)}catch(e){toast.error(e instanceof Error?e.message:'上传失败')}
    finally{setUploading(false)}
  }
  async function refresh(){
    setRefreshing(true)
    try{const r=await loadMultimodalEvidenceLatest(100);await onScanned(r as unknown as MultimodalAuditResult);toast.success('已同步')}catch(e){toast.error(e instanceof Error?e.message:'刷新失败')}
    finally{setRefreshing(false)}
  }
  const handleDO=(e:React.DragEvent)=>{e.preventDefault();e.stopPropagation()}
  const handleDrop=(e:React.DragEvent)=>{e.preventDefault();e.stopPropagation();const fs=Array.from(e.dataTransfer.files??[]);if(fs.length){setFiles(fs);upload(fs)}}

  const hasEv=ev.length>0; const hasF=fRows.length>0
  const riskScore=sum?.risk_score??0
  const riskLevel=normalizeMultimodalRiskLevel(riskScore, sum?.risk_level as string | undefined)
  const evidenceCount=sum?.evidence_count??ev.length
  const findingCount=fRows.length
  const derivedCount=sum?.derived_count??ev.reduce((total,item)=>total+item.derived.length,0)

  const ani=rm?{}:{initial:{opacity:0,y:12},animate:{opacity:1,y:0},transition:{duration:.45,ease:[.16,1,.3,1]}}

  /* ── EMPTY / MAIN ── */
  return <>
  {!hasEv && !uploading ? (
    <motion.div {...ani} className="space-y-6">
      <div
        onDragOver={handleDO}
        onDrop={handleDrop}
        className="flex flex-col items-center gap-6 rounded-2xl border-2 border-dashed border-border/50 bg-subtle-grid px-10 py-14 transition-all duration-500 surface-inset"
      >
        <motion.div
          className="flex size-16 items-center justify-center rounded-2xl bg-cyan-950/40 ring-1 ring-cyan-500/15"
          whileHover={{scale:1.04}}
          transition={{type:'spring',stiffness:300,damping:20}}
        >
          <Upload className="size-7 text-cyan-400/80"/>
        </motion.div>
        <div className="text-center">
          <h2 className="text-xl font-bold tracking-tight">外部告警证据工作台</h2>
          <p className="mt-1.5 max-w-md text-sm text-muted-foreground">上传截图或粘贴文本 —— 自动 OCR 识别、实体抽取、规则命中</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/30 px-3 py-1"><ImageIcon className="size-3"/>图像</span>
          <span className="flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/30 px-3 py-1"><FileText className="size-3"/>文本</span>
          <span className="text-muted-foreground/50">≤100 MB/文件</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex cursor-pointer items-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-950/35 px-4 py-2 text-sm font-medium text-cyan-200 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-400/50 hover:bg-cyan-900/50 hover:text-white hover:shadow-[0_0_20px_rgba(6,182,212,0.14)] active:translate-y-0 active:scale-[0.98]">
              <Upload className="size-4"/>上传证据
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-40 border-cyan-500/15 surface-overlay">
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="flex cursor-pointer items-center gap-2.5">
              <Camera className="size-4 text-cyan-400"/>照片
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTextDialogOpen(true)} className="flex cursor-pointer items-center gap-2.5">
              <FileText className="size-4 text-cyan-400"/>输入文本
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={e=>{const fs=Array.from(e.target.files??[]);if(fs.length){setFiles(fs);upload(fs)}}}/>
      </div>
      {tools.length>0&&<div className="flex items-center justify-between rounded-lg px-4 py-2.5 surface-base"><ToolDot tools={tools}/>{sum?.storage_relative_dir&&<span className="max-w-xs truncate text-[11px] text-muted-foreground">{sum.storage_relative_dir}</span>}</div>}
    </motion.div>
  ) : (
    <motion.div {...ani} className="space-y-4">
      <section
        onDragOver={handleDO}
        onDrop={handleDrop}
        className={cn('rounded-md border border-border bg-[color:var(--surface-card)] p-4 shadow-[0_14px_34px_rgba(2,6,23,0.24)] backdrop-blur', uploading && 'border-cyan-300/30')}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-md border border-cyan-300/25 bg-cyan-400/10 text-cyan-100">
                <Images className="size-5" />
              </span>
              <h2 className="text-page-title text-page-title-on-dark">外部告警证据</h2>
            </div>
            <div className="mt-2 h-px w-56 bg-gradient-to-r from-cyan-300/55 via-cyan-300/20 to-transparent" />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="meta-chip-dark">{evidenceCount} 证据</span>
              <span className="meta-chip-dark">{findingCount} 风险发现</span>
              <span className="meta-chip-dark">{derivedCount} 派生产物</span>
              <span className="meta-chip-dark">{riskScore} 风险评分</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="border-primary/70 bg-primary text-primary-foreground shadow-sm transition-[border-color,background-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-ring hover:bg-primary/90 hover:text-primary-foreground active:translate-y-0 active:scale-[0.98]">
                  <Upload className="size-4" />
                  上传证据
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 surface-overlay border-cyan-500/15">
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="flex cursor-pointer items-center gap-2.5">
                  <Camera className="size-4 text-cyan-400" />照片
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTextDialogOpen(true)} className="flex cursor-pointer items-center gap-2.5">
                  <FileText className="size-4 text-cyan-400" />输入文本
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={e=>{const fs=Array.from(e.target.files??[]);if(fs.length){setFiles(fs);upload(fs)}}}/>
            <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
              {refreshing?<Loader2 className="size-4 animate-spin"/>:<RefreshCw className="size-4"/>}
              刷新
            </Button>
            {tools.length>0&&<ToolDot tools={tools}/>}
          </div>
        </div>
      </section>
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,28fr)_minmax(0,47fr)_minmax(0,25fr)]">
        <MultimodalRiskOverviewCard
          score={riskScore}
          level={riskLevel}
          evidenceCount={evidenceCount}
          findingCount={findingCount}
          derivedCount={derivedCount}
          findings={fRows}
        />
        <MultimodalFindingNameList
          findings={ff}
          selectedKey={selectedFinding ? multimodalFindingKey(selectedFinding) : null}
          severityFilter={sevF}
          sourceFilter={srcF}
          entityFilter={eFilt}
          reducedMotion={rm}
          onSelect={setSelectedFindingKey}
          onSeverityFilterChange={setSevF}
          onSourceFilterChange={setSrcF}
          onClearEntityFilter={() => setEFilt(null)}
        />
        <MultimodalFindingDetailPanel
          finding={selectedFinding}
          evidence={selectedFindingEvidence}
          entityFilter={eFilt}
          onOpenEvidence={(finding) => {
            const source = ev.find(e => e.original_filename === finding.source_name && e.findings.some(item => item.id === finding.id))
            if (source) setDetail(source)
          }}
          onEntityFilter={(value) => setEFilt(eFilt === value ? null : value)}
        />
      </div>
    </motion.div>
  )}

  <AnimatePresence>{uploading&&<motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
      <motion.div initial={{scale:.92,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.95,opacity:0}} className="flex flex-col items-center gap-4 rounded-2xl surface-raised px-10 py-8">
        <motion.div animate={{rotate:360}} transition={{repeat:Infinity,duration:1.4,ease:'linear'}}><Loader2 className="size-10 text-cyan-400"/></motion.div>
        <span className="text-sm font-bold">正在处理证据</span>
        <span className="text-[11px] text-muted-foreground">{files.length}个文件 · OCR/ASR · 实体抽取 · 规则匹配</span>
        <div className="flex gap-1.5">{[0,1,2].map(i=><motion.span key={i} className="size-2 rounded-full bg-cyan-500/40" animate={{opacity:[.3,1,.3],scale:[.8,1.2,.8]}} transition={{repeat:Infinity,duration:1.1,delay:i*.2}}/>)}</div>
      </motion.div>
    </motion.div>}</AnimatePresence>
  <DetailSheet evidence={detail} open={!!detail} onClose={()=>setDetail(null)}/>
  {/* ══ TEXT INPUT DIALOG ══ */}
  <Dialog open={textDialogOpen} onOpenChange={setTextDialogOpen}>
      <DialogContent className="surface-overlay border-cyan-500/15 sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base font-bold tracking-tight">
            <FileText className="size-4 text-cyan-400"/>文本证据输入
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            粘贴截图 OCR 识别文本，系统将自动进行实体抽取与规则匹配。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-3 flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-2 flex-1">
            <label className="text-[11px] font-medium text-muted-foreground">文本内容</label>
            <Textarea
              value={text}
              onChange={e=>setText(e.target.value)}
              placeholder="在此粘贴截图 OCR 识别文本..."
              className="min-h-[120px] max-h-[40vh] w-full font-mono text-[12px] resize-y overflow-y-auto"
              rows={5}
            />
          </div>
          <div className="flex justify-end gap-2.5 pt-2 shrink-0">
            <Button variant="ghost" size="sm" className="h-9 text-[12px]" onClick={()=>{setTextDialogOpen(false);setText('')}}>
              取消
            </Button>
            <Button
              size="sm"
              className="h-9 gap-1.5 border border-cyan-500/25 bg-cyan-950/40 text-cyan-200 hover:bg-cyan-900/50 hover:text-white transition-all duration-300 active:scale-[0.97]"
              onClick={async ()=>{
                if(!text.trim())return;
                setAnalyzing(true)
                try{
                  const r=await analyzeMultimodalRecognizedText({
                    workspaceId,recognizedText:text.trim(),sourceType:'image',
                    evidenceType:'visual_ocr',
                    sourceName:'manual-image-text.txt',confidence:.92
                  });
                  await onScanned(r);setText('');setTextDialogOpen(false);toast.success('分析完成')
                }catch(e){toast.error(e instanceof Error?e.message:'分析失败')}
                finally{setAnalyzing(false)}
              }}
              disabled={analyzing||!text.trim()}
            >
              {analyzing?<Loader2 className="size-3.5 animate-spin"/>:<Search className="size-3.5"/>}
              分析
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
</>
}
