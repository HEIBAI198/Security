import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const riskLevel=(sum?.risk_level as string)||'low'; const riskScore=sum?.risk_score??0

  const ani=rm?{}:{initial:{opacity:0,y:12},animate:{opacity:1,y:0},transition:{duration:.45,ease:[.16,1,.3,1]}}

  /* ── EMPTY / MAIN ── */
  return <>
    {(!hasEv&&!uploading)?<motion.div {...ani} className="space-y-6">
    {/* Upload zone: recessed tray */}
    <div className="flex flex-col items-center gap-6 rounded-2xl surface-inset border-2 border-dashed border-border/50 bg-subtle-grid px-10 py-14 transition-all duration-500">
      <motion.div className="flex size-16 items-center justify-center rounded-2xl bg-cyan-950/40 ring-1 ring-cyan-500/15" whileHover={{scale:1.04}} transition={{type:'spring',stiffness:300,damping:20}}>
        <Upload className="size-7 text-cyan-400/80"/>
      </motion.div>
      <div className="text-center">
        <h2 className="text-xl font-bold tracking-tight">外部告警证据工作台</h2>
        <p className="mt-1.5 text-sm text-muted-foreground max-w-md">上传截图或粘贴文本 —— 自动 OCR 识别、实体抽取、规则命中</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/30 px-3 py-1"><ImageIcon className="size-3"/>图像</span>
        <span className="flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/30 px-3 py-1"><FileText className="size-3"/>文本</span>
        <span className="text-muted-foreground/50">≤100 MB/文件</span>
      </div>
      {/* Unified dropdown button */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={cn('flex cursor-pointer items-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-950/35 px-4 py-2 text-sm font-medium text-cyan-200 transition-all duration-300 hover:border-cyan-400/50 hover:bg-cyan-900/50 hover:text-white hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(6,182,212,0.14)] active:scale-[0.98] active:translate-y-0')}>
            <Upload className="size-4"/>上传证据
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-40 surface-overlay border-cyan-500/15">
          <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2.5 cursor-pointer">
            <Camera className="size-4 text-cyan-400"/>照片
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTextDialogOpen(true)} className="flex items-center gap-2.5 cursor-pointer">
            <FileText className="size-4 text-cyan-400"/>输入文本
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={e=>{const fs=Array.from(e.target.files??[]);if(fs.length){setFiles(fs);upload(fs)}}}/>
    </div>
    {tools.length>0&&<div className="flex items-center justify-between rounded-lg surface-base px-4 py-2.5"><ToolDot tools={tools}/>{sum?.storage_relative_dir&&<span className="text-[11px] text-muted-foreground truncate max-w-xs">{sum.storage_relative_dir}</span>}</div>}
  </motion.div>:<motion.div {...ani} className="space-y-5">
    {/* ══ COMMAND BAR: recessed tray ══ */}
    <div onDragOver={handleDO} onDrop={handleDrop} className={cn('relative rounded-2xl surface-inset px-5 py-3.5 flex flex-wrap items-center gap-3 transition-all duration-500',uploading&&'border-cyan-500/30 shadow-[0_0_28px_rgba(6,182,212,0.08)]')}>
      {/* Upload btn: dropdown with two options */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={cn('flex cursor-pointer items-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-950/35 px-4 py-2 text-sm font-medium text-cyan-200 transition-all duration-300 hover:border-cyan-400/50 hover:bg-cyan-900/50 hover:text-white hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(6,182,212,0.14)] active:scale-[0.98] active:translate-y-0')}>
            <Upload className="size-4"/>上传证据
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40 surface-overlay border-cyan-500/15">
          <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2.5 cursor-pointer">
            <Camera className="size-4 text-cyan-400"/>照片
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTextDialogOpen(true)} className="flex items-center gap-2.5 cursor-pointer">
            <FileText className="size-4 text-cyan-400"/>输入文本
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={e=>{const fs=Array.from(e.target.files??[]);if(fs.length){setFiles(fs);upload(fs)}}}/>
      <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-[11px] hover:-translate-y-0.5 transition-transform active:scale-[0.97]" onClick={refresh} disabled={refreshing}>{refreshing?<Loader2 className="size-3.5 animate-spin"/>:<RefreshCw className="size-3.5"/>}刷新</Button>
      {files.length>0&&<motion.span initial={{opacity:0,scale:.9}} animate={{opacity:1,scale:1}} className="flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-950/30 px-3 py-1 text-[11px] text-cyan-300"><Loader2 className="size-3 animate-spin"/>{files.length} 个文件</motion.span>}
      <div className="flex-1"/>
      {tools.length>0&&<ToolDot tools={tools}/>}
      <span className="flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/20 px-3 py-1 text-[11px] text-muted-foreground"><Images className="size-3"/>{ev.length} 证据</span>
    </div>

    {/* ══ RISK SCORE + FINDINGS: 2-column grid ══ */}
    {(hasEv||hasF)&&<div className={cn(hasEv&&hasF?'grid grid-cols-[340px_1fr] gap-4 items-stretch':'')}>
      {/* Risk score card - left column */}
      {hasEv&&<Card className="surface-raised flex flex-col">
        <CardContent className="flex flex-1 flex-col items-center justify-center px-4 py-4">
          <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">综合风险评分</span>
          <div className="relative w-40 aspect-square my-3">
            <svg className="absolute inset-0 -rotate-90 overflow-visible" viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="84" fill="none" stroke="currentColor" strokeWidth="7" className="text-border/8"/>
              <circle cx="100" cy="100" r="84" fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round"
                strokeDasharray="528" strokeDashoffset={528-riskScore/100*528}
                className={riskLevel==='critical'?'text-red-400':riskLevel==='high'?'text-orange-400':riskLevel==='medium'?'text-amber-400':'text-emerald-400'}
                style={{filter:'blur(8px)',opacity:.35}}/>
              <circle cx="100" cy="100" r="84" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round"
                strokeDasharray="528" strokeDashoffset={528-riskScore/100*528}
                className={cn(riskLevel==='critical'?'text-red-400 drop-shadow-[0_0_10px_currentColor]':riskLevel==='high'?'text-orange-400 drop-shadow-[0_0_10px_currentColor]':riskLevel==='medium'?'text-amber-400 drop-shadow-[0_0_10px_currentColor]':'text-emerald-400 drop-shadow-[0_0_10px_currentColor]')}/>
            </svg>
            <span className={cn('absolute inset-0 grid place-items-center text-[clamp(2.8rem,10cqi,5.6rem)] font-black tabular-nums tracking-tighter leading-none',riskLevel==='critical'?'text-red-400':riskLevel==='high'?'text-orange-400':riskLevel==='medium'?'text-amber-400':'text-emerald-400')}>{riskScore}</span>
          </div>
          <span className={cn('rounded-full px-3 py-0.5 text-[11px] font-bold',riskLevel==='critical'?'bg-red-950/50 text-red-300 ring-1 ring-red-500/25':riskLevel==='high'?'bg-orange-950/50 text-orange-300 ring-1 ring-orange-500/25':riskLevel==='medium'?'bg-amber-950/50 text-amber-300 ring-1 ring-amber-500/25':'bg-emerald-950/50 text-emerald-300 ring-1 ring-emerald-500/25')}>{riskLevel==='critical'?'严重风险':riskLevel==='high'?'高风险':riskLevel==='medium'?'中风险':'低风险'}</span>
        </CardContent>
      </Card>}
      {/* Findings - right column */}
      {hasF&&<Card className="surface-raised flex flex-col h-full">
      <CardHeader className="shrink-0 flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-bold tracking-tight">
          <ShieldAlert className={cn('size-4',ff.some(f=>f.severity==='critical')?'text-red-400':'text-amber-400')}/>
          风险发现{eFilt&&<Badge variant="secondary" className="text-[11px] gap-1">实体:{eFilt}<button onClick={()=>setEFilt(null)}><X className="size-3"/></button></Badge>}
          <Badge variant="outline" className="text-[11px]">{ff.length}</Badge>
        </CardTitle>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">{(['all','critical','high','medium','low'] as const).map(s=>{const on=sevF===s;const c=s!=='all'?SEV[s as SecuritySeverity]:null;return<button key={s} onClick={()=>setSevF(s)} className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.96]',on?s==='all'?'bg-foreground/8 text-foreground':cn(c!.border,c!.bg,c!.text,'ring-1 ring-current/15'):'text-muted-foreground hover:text-foreground')}>{s==='all'?'全部':SEV[s as SecuritySeverity].label}</button>})}</div>
          <Select value={srcF} onValueChange={v=>setSrcF(v as MultimodalSourceType|'all')}><SelectTrigger className="h-7 w-24 text-[11px]"><SelectValue placeholder="全部类型"/></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem><SelectItem value="image">图像</SelectItem><SelectItem value="audio">音频</SelectItem><SelectItem value="video">视频</SelectItem></SelectContent></Select>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-2 overflow-y-auto overscroll-contain pb-4 min-h-0 max-h-[300px]">
        <AnimatePresence mode="popLayout">
          {ff.length===0?<motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground"><ShieldCheck className="size-10 text-muted-foreground/20"/>无匹配结果{eFilt&&<Button variant="ghost" size="sm" onClick={()=>setEFilt(null)}>清除筛选</Button>}</motion.div>
          :ff.slice(0,25).map((f,i)=>{const c=SEV[f.severity]
            return <motion.div key={f.id} layout={!rm} initial={rm?{}:{opacity:0,y:10,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,scale:.96,transition:{duration:.15}}} transition={{delay:Math.min(i*.015,.25),duration:.3,ease:[.16,1,.3,1]}}
              className={cn('group relative rounded-xl border border-border/40 surface-base p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_28px_rgba(0,0,0,0.35)]',c.glow)}>
              <div className={cn('absolute left-0 top-0 bottom-0 w-1 rounded-l-xl',f.severity==='critical'?'bg-red-500/50':f.severity==='high'?'bg-orange-500/40':f.severity==='medium'?'bg-amber-500/35':'bg-emerald-500/35')}/>
              <div className="pl-3"><div className="flex items-start gap-3"><SevBadge s={f.severity} pulse={f.severity==='critical'} className="mt-0.5 shrink-0"/><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-sm font-bold leading-snug">{f.title}</div><div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"><span className="font-mono">{f.rule_id}</span><span>·</span><button onClick={()=>{const s=ev.find(e=>e.findings.some(fi=>fi.id===f.id));if(s)setDetail(s)}} className="flex items-center gap-1 hover:text-cyan-400 transition-colors">{(()=>{const I=SRC_ICONS[f.source_type];return<I size={11}/>})()}{f.source_name}</button><span>·</span><span>{f.score}分</span></div></div><div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0"><Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={()=>{const s=ev.find(e=>e.findings.some(fi=>fi.id===f.id));if(s)setDetail(s)}}><Eye className="size-3"/>详情</Button></div></div>
              {f.matched_keywords.length>0&&<div className="mt-2.5 flex flex-wrap gap-1">{f.matched_keywords.slice(0,8).map(kw=><span key={kw} className="rounded-md surface-inset border-cyan-500/8 px-2 py-0.5 text-[10px] font-mono text-cyan-300/80 transition-all hover:border-cyan-400/25 hover:text-cyan-200 hover:shadow-[0_0_8px_rgba(6,182,212,0.08)] cursor-default">{kw}</span>)}{f.matched_keywords.length>8&&<span className="text-[10px] text-muted-foreground">+{f.matched_keywords.length-8}</span>}</div>}
              {f.entities.length>0&&<div className="mt-2.5 flex flex-wrap gap-1.5">{f.entities.slice(0,6).map((e,ei)=><button key={ei} onClick={()=>setEFilt(eFilt===e.value?null:e.value)} className={cn('rounded-md border px-2 py-0.5 text-[10px] font-medium transition-all duration-200 hover:scale-[1.03] active:scale-[0.97]',eFilt===e.value?'border-cyan-400/50 bg-cyan-950/40 text-cyan-200':eColor(e.type).border+' '+eColor(e.type).bg+' text-foreground/70 hover:text-foreground')}>{tLabel(e.type)}:<span className="font-bold">{e.value}</span></button>)}</div>}
              {f.severity==='critical'?<div className="mt-3 rounded-lg border border-amber-500/15 surface-inset px-3 py-2 text-[11px] text-amber-200/60 leading-relaxed"><span className="font-medium text-amber-300">建议: </span>{f.recommendation}</div>
              :<div className="mt-2 rounded-lg border border-amber-500/10 surface-inset px-3 py-2 text-[11px] text-amber-200/50 leading-relaxed"><span className="font-medium text-amber-300">建议: </span>{f.recommendation}</div>}
            </div></div></div>
            </motion.div>
          })}
        </AnimatePresence>
        {ff.length>25&&<div className="pt-3 text-center text-[11px] text-muted-foreground">显示前25条，共{ff.length}条。使用筛选缩小范围。</div>}
      </CardContent>
    </Card>}
    </div>}




    {/* ══ RAW DATA: recessed, collapsed ══ */}
    <Collapsible open={rawOpen} onOpenChange={setRawOpen}>
      <div className={cn('rounded-2xl surface-inset transition-all duration-300',rawOpen&&'border-cyan-500/10')}>
        <CollapsibleTrigger asChild>
          <button type="button" className={cn('flex w-full items-center justify-between px-5 py-3.5 text-left text-sm font-medium transition-all duration-200 hover:bg-white/[0.02] rounded-2xl',rawOpen&&'border-b border-border/30 rounded-b-none')}>
            <span className="flex items-center gap-2.5"><span className="flex size-7 items-center justify-center rounded-lg bg-muted/30"><FileSearch className="size-3.5 text-muted-foreground"/></span><span>原始数据<span className="ml-2 text-[11px] text-muted-foreground font-normal">规则命中 · 派生产物 · 存储</span></span></span>
            <ChevronRight className={cn('size-4 text-muted-foreground transition-transform duration-300',rawOpen&&'rotate-90')}/>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent><div className="space-y-5 p-5">
          {ev.some(e=>e.derived.length>0)&&<div><h4 className="mb-2.5 text-sm font-bold">派生产物</h4><div className="flex flex-wrap gap-2">{ev.flatMap(e=>e.derived.map((d,i)=><div key={`${e.evidence_id}-${i}`} className="flex items-center gap-2 rounded-md border border-border/30 bg-black/20 px-3 py-1.5 text-[11px]"><span className="font-medium">{d.kind}</span><span className="text-muted-foreground">via {d.tool}</span><span className="font-mono text-muted-foreground">{fmtBytes(d.size_bytes)}</span></div>))}</div></div>}
          {fRows.length>0&&<div><h4 className="mb-2.5 text-sm font-bold">原始规则命中 ({fRows.length})</h4><div className="max-h-80 overflow-auto rounded-xl border border-border/30"><table className="w-full text-[11px]"><thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur"><tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium [&>th]:text-muted-foreground"><th>等级</th><th>规则ID</th><th>关键词</th><th>来源</th><th className="text-right">分数</th></tr></thead><tbody className="divide-y divide-border/15">{fRows.map(f=><tr key={f.id} className="hover:bg-muted/15 transition-colors"><td className="px-3 py-2"><SevBadge s={f.severity}/></td><td className="px-3 py-2 font-mono">{f.rule_id}</td><td className="px-3 py-2 max-w-[200px] truncate font-mono text-muted-foreground" title={f.matched_keywords.join(', ')}>{f.matched_keywords.slice(0,3).join(', ')}{f.matched_keywords.length>3&&` +${f.matched_keywords.length-3}`}</td><td className="px-3 py-2 text-muted-foreground truncate max-w-[140px]">{f.source_name}</td><td className="px-3 py-2 text-right font-bold tabular-nums">{f.score}</td></tr>)}</tbody></table></div></div>}
          {sum&&<div className="flex flex-wrap items-center gap-4 rounded-lg surface-inset px-4 py-3 text-[11px] text-muted-foreground"><span className="flex items-center gap-1.5"><Boxes className="size-3"/>存储:<span className="font-mono text-foreground/60">{sum.storage_relative_dir}</span></span><span>总大小:<span className="font-mono text-foreground/60">{fmtBytes(sum.total_size_bytes)}</span></span>{sum.duration_seconds&&<span>耗时:<span className="font-mono text-foreground/60">{sum.duration_seconds}s</span></span>}</div>}
        </div></CollapsibleContent>
      </div>
    </Collapsible>

    {/* ══ LOADING OVERLAY ══ */}
    <AnimatePresence>{uploading&&<motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
      <motion.div initial={{scale:.92,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.95,opacity:0}} className="flex flex-col items-center gap-4 rounded-2xl surface-raised px-10 py-8">
        <motion.div animate={{rotate:360}} transition={{repeat:Infinity,duration:1.4,ease:'linear'}}><Loader2 className="size-10 text-cyan-400"/></motion.div>
        <span className="text-sm font-bold">正在处理证据</span>
        <span className="text-[11px] text-muted-foreground">{files.length}个文件 · OCR/ASR · 实体抽取 · 规则匹配</span>
        <div className="flex gap-1.5">{[0,1,2].map(i=><motion.span key={i} className="size-2 rounded-full bg-cyan-500/40" animate={{opacity:[.3,1,.3],scale:[.8,1.2,.8]}} transition={{repeat:Infinity,duration:1.1,delay:i*.2}}/>)}</div>
      </motion.div>
    </motion.div>}</AnimatePresence>

    </motion.div>}
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
