import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  motion, AnimatePresence, useReducedMotion, useSpring,
} from 'motion/react'
import {
  AlertTriangle, ArrowRight, Boxes, CheckCircle2, ChevronDown,
  ChevronRight, ClipboardList, Copy, Eye, FileSearch, FileText,
  Fingerprint, ImageIcon, Images, Loader2, Music2, Network,
  PackageCheck, Radar, RefreshCw, Search, ShieldAlert, ShieldCheck,
  Siren, TerminalSquare, Upload, Video, X, Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  analyzeMultimodalRecognizedText, loadMultimodalEvidenceLatest,
  runMultimodalEvidenceScan,
  type MultimodalAuditResult, type MultimodalEntity,
  type MultimodalEvidence, type MultimodalFinding,
  type MultimodalSourceType, type SecuritySeverity,
} from '@/lib/security-api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip as UiTooltip, TooltipContent as UiTooltipContent, TooltipTrigger as UiTooltipTrigger } from '@/components/ui/tooltip'

/* ── Types ── */
type MultimodalEntityRow = MultimodalEntity & { evidence_id: string; source_name: string; source_type: MultimodalSourceType }
type MultimodalFindingRow = MultimodalFinding & { source_name: string; source_type: MultimodalSourceType }
type MultimodalEntityGroup = 'package' | 'ioc' | 'service' | 'behavior' | 'time' | 'other'
type MultimodalEntityRuleSummary = { key: string; title: string; ruleId: string; severity: SecuritySeverity; score: number; count: number; evidenceCount: number; keywords: string[]; entities: string[]; sourceNames: string[]; recommendation: string }
type MultimodalEntitySummary = { key: string; type: string; value: string; normalized: string; count: number; sourceCount: number; confidence: number; sourceNames: string[]; evidenceIds: string[]; examples: string[]; group: MultimodalEntityGroup; ruleCount: number; maxRuleScore: number; maxRuleSeverity: SecuritySeverity | null; ruleSummaries: MultimodalEntityRuleSummary[] }

/* ── Constants ── */
const SEV: Record<SecuritySeverity, { label: string; border: string; bg: string; text: string; glow: string }> = {
  critical: { label:'严重', border:'border-red-500/40', bg:'bg-red-950/40', text:'text-red-300', glow:'shadow-[0_0_24px_rgba(239,68,68,0.15)]' },
  high:     { label:'高危', border:'border-orange-500/35', bg:'bg-orange-950/35', text:'text-orange-300', glow:'shadow-[0_0_18px_rgba(249,115,22,0.12)]' },
  medium:   { label:'中危', border:'border-amber-500/25', bg:'bg-amber-950/30', text:'text-amber-300', glow:'shadow-[0_0_12px_rgba(245,158,11,0.08)]' },
  low:      { label:'低危', border:'border-emerald-500/25', bg:'bg-emerald-950/30', text:'text-emerald-300', glow:'' },
}
const SEV_ORDER: Record<SecuritySeverity, number> = { critical:0, high:1, medium:2, low:3 }

const SRC_ICONS: Record<MultimodalSourceType, typeof ImageIcon> = { image:ImageIcon, audio:Music2, video:Video }
const SRC_LABEL: Record<MultimodalSourceType, string> = { image:'图像', audio:'音频', video:'视频' }

const EG_LABEL: Record<MultimodalEntityGroup, string> = { package:'依赖包', ioc:'网络 IOC', service:'服务与接口', behavior:'行为特征', time:'时间标记', other:'其他' }
const EG_ICONS: Record<MultimodalEntityGroup, typeof PackageCheck> = { package:PackageCheck, ioc:Radar, service:Network, behavior:AlertTriangle, time:ClipboardList, other:Fingerprint }

const TYPE_LABEL: Record<string, string> = { ip:'IP', domain:'域名', cve:'CVE', package:'软件包', api_path:'API路径', service:'服务名', action:'可疑操作', time:'时间点', secret_keyword:'凭据' }

/* ── Helpers ── */
const tLabel = (v:string) => TYPE_LABEL[v]||v
const eColor = (t:string) => t==='ip'||t==='package'?SEV.high:t==='api_path'||t==='secret_keyword'?SEV.medium:t==='action'?SEV.critical:SEV.low
const eGroup = (t:string):MultimodalEntityGroup => t==='package'||t==='cve'?'package':t==='ip'||t==='domain'||t==='url'?'ioc':t==='api_path'||t==='service'?'service':t==='action'||t==='secret_keyword'||t==='command'?'behavior':t==='time'?'time':'other'
const stronger = (a:SecuritySeverity|null,b:SecuritySeverity|null):SecuritySeverity|null => !a?b:!b?a:SEV_ORDER[a]<SEV_ORDER[b]?a:b
const uniq = (vs:string[]):string[] => { const s=new Set<string>(); return vs.filter(v=>{const k=v.trim().toLowerCase();if(!k||s.has(k))return false;s.add(k);return true})}
const short = (v:unknown,n:number):string => { const t=String(v??'').replace(/\n/g,' ').trim(); return t.length<=n?t:`${t.slice(0,n-3)}...` }
const fmtBytes = (b:number):string => b>=1073741824?`${(b/1073741824).toFixed(1)}GB`:b>=1048576?`${(b/1048576).toFixed(1)}MB`:b>=1024?`${(b/1024).toFixed(0)}KB`:`${b}B`

/* ── Aggregation ── */
function aggregateEntities(entityRows:MultimodalEntityRow[],findings:MultimodalFindingRow[]):MultimodalEntitySummary[] {
  const m=new Map<string,MultimodalEntitySummary>()
  for(const r of entityRows){
    const k=`${r.type}:${r.normalized||r.value}`, ex=m.get(k)
    if(ex){ex.count++;ex.confidence=Math.max(ex.confidence,r.confidence);if(!ex.sourceNames.includes(r.source_name))ex.sourceNames.push(r.source_name);if(!ex.evidenceIds.includes(r.evidence_id))ex.evidenceIds.push(r.evidence_id);if(ex.examples.length<3)ex.examples.push(r.evidence)}
    else m.set(k,{key:k,type:r.type,value:r.value,normalized:r.normalized||r.value,count:1,sourceCount:1,confidence:r.confidence,sourceNames:[r.source_name],evidenceIds:[r.evidence_id],examples:[r.evidence].filter(Boolean),group:eGroup(r.type),ruleCount:0,maxRuleScore:0,maxRuleSeverity:null,ruleSummaries:[]})
  }
  for(const f of findings) for(const[,s] of m){
    const lt=(x:string)=>(x||'').toLowerCase(), t=lt(s.normalized||s.value)
    if(t.length>=2&&(lt(f.evidence).includes(t)||f.entities.some(e=>lt(e.value).includes(t)||lt(e.normalized).includes(t)))){s.ruleCount++;s.maxRuleScore=Math.max(s.maxRuleScore,f.score);s.maxRuleSeverity=stronger(s.maxRuleSeverity,f.severity)}
  }
  const gw:Record<MultimodalEntityGroup,number>={package:60,ioc:55,service:50,behavior:35,time:20,other:10}
  return Array.from(m.values()).sort((a,b)=>gw[b.group]-gw[a.group]||b.confidence*10-a.confidence*10||b.count-a.count)
}

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
    <svg className="absolute inset-0 -rotate-90" viewBox="0 0 200 200">
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
  const [textType,setTextType]=useState<MultimodalSourceType>('image')
  const [sevF,setSevF]=useState<SecuritySeverity|'all'>('all')
  const [srcF,setSrcF]=useState<MultimodalSourceType|'all'>('all')
  const [detail,setDetail]=useState<MultimodalEvidence|null>(null)
  const [eExp,setEExp]=useState(false)
  const [rawOpen,setRawOpen]=useState(false)
  const [eFilt,setEFilt]=useState<string|null>(null)

  /* derived */
  const eRows:MultimodalEntityRow[]=useMemo(()=>ev.flatMap(e=>e.entities.map(en=>({...en,evidence_id:e.evidence_id,source_name:e.original_filename,source_type:(e.source_type as MultimodalSourceType)||'image'}))),[ev])
  const fRows:MultimodalFindingRow[]=useMemo(()=>ev.flatMap(e=>e.findings.map(f=>({...f,source_name:e.original_filename,source_type:(e.source_type as MultimodalSourceType)||'image'}))),[ev])
  const eSum=useMemo(()=>aggregateEntities(eRows,fRows),[eRows,fRows])
  const topE=useMemo(()=>eSum.slice(0,12),[eSum])
  const sources=useMemo(()=>[...ev].map(e=>({...e,_w:e.findings.length*100+e.entities.length*10+e.recognitions.length})).sort((a,b)=>b._w-a._w),[ev])

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
  async function analyze(){
    if(!text.trim())return; setAnalyzing(true)
    try{const r=await analyzeMultimodalRecognizedText({workspaceId,recognizedText:text.trim(),sourceType:textType,evidenceType:textType==='audio'?'audio_asr':'visual_ocr',sourceName:`manual-${textType}-text.txt`,confidence:.92});await onScanned(r);setText('');toast.success('分析完成')}catch(e){toast.error(e instanceof Error?e.message:'分析失败')}
    finally{setAnalyzing(false)}
  }

  const handleDO=(e:React.DragEvent)=>{e.preventDefault();e.stopPropagation()}
  const handleDrop=(e:React.DragEvent)=>{e.preventDefault();e.stopPropagation();const fs=Array.from(e.dataTransfer.files??[]);if(fs.length){setFiles(fs);upload(fs)}}

  const hasEv=ev.length>0; const hasF=fRows.length>0
  const riskLevel=(sum?.risk_level as string)||'low'; const riskScore=sum?.risk_score??0

  const ani=rm?{}:{initial:{opacity:0,y:12},animate:{opacity:1,y:0},transition:{duration:.45,ease:[.16,1,.3,1]}}

  /* ── EMPTY ── */
  if(!hasEv&&!uploading)return <motion.div {...ani} className="space-y-6">
    {/* Upload zone: recessed tray */}
    <label onDragOver={handleDO} onDrop={handleDrop} className={cn(
      'flex cursor-pointer flex-col items-center gap-5 rounded-2xl border-2 border-dashed border-border/50',
      'bg-subtle-grid px-10 py-14 transition-all duration-500',
      'hover:border-cyan-500/35 hover:shadow-[0_0_48px_rgba(6,182,212,0.06)]',
      'surface-inset',
    )}>
      <motion.div className="flex size-16 items-center justify-center rounded-2xl bg-cyan-950/40 ring-1 ring-cyan-500/15" whileHover={{scale:1.04}} transition={{type:'spring',stiffness:300,damping:20}}>
        <Upload className="size-7 text-cyan-400/80"/>
      </motion.div>
      <div className="text-center">
        <h2 className="text-xl font-bold tracking-tight">外部告警证据工作台</h2>
        <p className="mt-1.5 text-sm text-muted-foreground max-w-md">拖放或点击上传截图、音频、视频 —— 自动 OCR/ASR 识别、实体抽取、规则命中</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        {(['image','audio','video'] as MultimodalSourceType[]).map(t=>{const I=SRC_ICONS[t];return<span key={t} className="flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/30 px-3 py-1"><I className="size-3"/>{SRC_LABEL[t]}</span>})}
        <span className="text-muted-foreground/50">≤100 MB/文件</span>
      </div>
      <input type="file" multiple accept="audio/*,image/*,video/*" className="hidden" onChange={e=>{const fs=Array.from(e.target.files??[]);if(fs.length){setFiles(fs);upload(fs)}}}/>
    </label>
    {/* Text strip: recessed */}
    <div className="flex items-center gap-3 rounded-xl surface-inset px-4 py-3">
      <FileText className="size-4 text-muted-foreground shrink-0"/>
      <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:inline">或粘贴识别文本</span>
      <Select value={textType} onValueChange={v=>setTextType(v as MultimodalSourceType)}><SelectTrigger className="w-24 h-8 text-[11px] shrink-0"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="image">截图OCR</SelectItem><SelectItem value="audio">音频ASR</SelectItem><SelectItem value="video">视频帧</SelectItem></SelectContent></Select>
      <Textarea value={text} onChange={e=>setText(e.target.value)} placeholder="粘贴 ASR / OCR 结果..." className="min-h-[40px] flex-1 font-mono text-[11px] h-10 py-2" rows={1}/>
      <Button size="sm" className="h-8 gap-1.5 border border-cyan-500/25 bg-cyan-950/40 text-cyan-200 hover:bg-cyan-900/50 hover:text-white hover:shadow-[0_0_16px_rgba(6,182,212,0.12)] transition-all duration-300 active:scale-[0.97]" onClick={analyze} disabled={analyzing||!text.trim()}>
        {analyzing?<Loader2 className="size-3.5 animate-spin"/>:<Search className="size-3.5"/>}分析
      </Button>
    </div>
    {tools.length>0&&<div className="flex items-center justify-between rounded-lg surface-base px-4 py-2.5"><ToolDot tools={tools}/>{sum?.storage_relative_dir&&<span className="text-[11px] text-muted-foreground truncate max-w-xs">{sum.storage_relative_dir}</span>}</div>}
  </motion.div>

  /* ── MAIN ── */
  return <motion.div {...ani} className="space-y-5">
    {/* ══ COMMAND BAR: recessed tray ══ */}
    <div onDragOver={handleDO} onDrop={handleDrop} className={cn('relative rounded-2xl surface-inset px-5 py-3.5 flex flex-wrap items-center gap-3 transition-all duration-500',uploading&&'border-cyan-500/30 shadow-[0_0_28px_rgba(6,182,212,0.08)]')}>
      {/* Upload btn: raised from inset */}
      <label className={cn('flex cursor-pointer items-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-950/35 px-4 py-2 text-sm font-medium text-cyan-200 transition-all duration-300 hover:border-cyan-400/50 hover:bg-cyan-900/50 hover:text-white hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(6,182,212,0.14)] active:scale-[0.98] active:translate-y-0')}>
        <Upload className="size-4"/>上传证据
        <input type="file" multiple accept="audio/*,image/*,video/*" className="hidden" onChange={e=>{const fs=Array.from(e.target.files??[]);if(fs.length){setFiles(fs);upload(fs)}}}/>
      </label>
      <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-[11px] hover:-translate-y-0.5 transition-transform active:scale-[0.97]" onClick={refresh} disabled={refreshing}>{refreshing?<Loader2 className="size-3.5 animate-spin"/>:<RefreshCw className="size-3.5"/>}刷新</Button>
      <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-[11px] hover:-translate-y-0.5 transition-transform active:scale-[0.97]" onClick={()=>{setRawOpen(true);setTimeout(()=>{(document.querySelector('[data-mm-textarea]') as HTMLTextAreaElement)?.scrollIntoView({behavior:'smooth'});(document.querySelector('[data-mm-textarea]') as HTMLTextAreaElement)?.focus()},300)}}><FileText className="size-3.5"/>文本分析</Button>
      {files.length>0&&<motion.span initial={{opacity:0,scale:.9}} animate={{opacity:1,scale:1}} className="flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-950/30 px-3 py-1 text-[11px] text-cyan-300"><Loader2 className="size-3 animate-spin"/>{files.length} 个文件</motion.span>}
      <div className="flex-1"/>
      {tools.length>0&&<ToolDot tools={tools}/>}
      <span className="flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/20 px-3 py-1 text-[11px] text-muted-foreground"><Images className="size-3"/>{ev.length} 证据</span>
    </div>

    {/* ══ RISK BENTO: raised surfaces on recessed bg ══ */}
    {hasEv&&<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Score: raised */}
      <Card className="surface-raised group transition-all duration-500 hover:shadow-[0_8px_32px_rgba(0,0,0,0.35)] hover:-translate-y-0.5"><CardContent className="flex flex-col items-center p-5"><span className="mb-3 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">综合风险评分</span><RiskRing score={riskScore} level={riskLevel}/><span className={cn('mt-3 rounded-full px-3 py-0.5 text-[11px] font-bold',riskLevel==='critical'?'bg-red-950/50 text-red-300 ring-1 ring-red-500/25':riskLevel==='high'?'bg-orange-950/50 text-orange-300 ring-1 ring-orange-500/25':riskLevel==='medium'?'bg-amber-950/50 text-amber-300 ring-1 ring-amber-500/25':'bg-emerald-950/50 text-emerald-300 ring-1 ring-emerald-500/25')}>{riskLevel==='critical'?'严重风险':riskLevel==='high'?'高风险':riskLevel==='medium'?'中风险':'低风险'}</span></CardContent></Card>

      {/* Findings: raised */}
      <Card className="surface-raised group transition-all duration-500 hover:shadow-[0_8px_32px_rgba(0,0,0,0.35)] hover:-translate-y-0.5"><CardContent className="p-5"><span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">规则命中</span><div className="mt-2 text-[2rem] font-black tabular-nums tracking-tighter">{sum?.finding_count??0}</div><div className="mt-3 space-y-2">{(['critical','high','medium','low'] as SecuritySeverity[]).map(s=>{const n=sum?.[s]??0;if(!n)return null;const t=sum?.finding_count||1;const c=SEV[s];return<div key={s} className="space-y-0.5"><div className="flex justify-between text-[11px]"><span className={c.text}>{c.label}</span><span className="font-bold tabular-nums">{n}</span></div><div className="h-1 rounded-full bg-border/20 overflow-hidden"><motion.div className={cn('h-full rounded-full',s==='critical'?'bg-red-500/50':s==='high'?'bg-orange-500/40':s==='medium'?'bg-amber-500/35':'bg-emerald-500/35')} initial={{width:0}} animate={{width:`${(n/t)*100}%`}} transition={{duration:.8,ease:[.16,1,.3,1],delay:.3}}/></div></div>})}</div></CardContent></Card>

      {/* Entities: raised */}
      <Card className="surface-raised group transition-all duration-500 hover:shadow-[0_8px_32px_rgba(0,0,0,0.35)] hover:-translate-y-0.5"><CardContent className="p-5"><span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">安全实体</span><div className="mt-2 text-[2rem] font-black tabular-nums tracking-tighter">{eSum.length}</div><div className="mt-3 flex flex-wrap gap-1.5">{(['package','ioc','service','behavior'] as MultimodalEntityGroup[]).map(g=>{const its=eSum.filter(e=>e.group===g);if(!its.length)return null;const I=EG_ICONS[g];return<span key={g} className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-muted/20 px-2 py-1 text-[10px] text-muted-foreground"><I className="size-3"/>{EG_LABEL[g]}<span className="font-bold text-foreground/60">{its.length}</span></span>})}</div></CardContent></Card>

      {/* Sources: raised */}
      <Card className="surface-raised group transition-all duration-500 hover:shadow-[0_8px_32px_rgba(0,0,0,0.35)] hover:-translate-y-0.5"><CardContent className="p-5"><span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">证据来源</span><div className="mt-2 text-[2rem] font-black tabular-nums tracking-tighter">{ev.length}</div><div className="mt-3 flex flex-wrap items-center gap-2.5">{(['image','audio','video'] as MultimodalSourceType[]).map(t=>{const n=sum?.[t]??0;if(!n)return null;const I=SRC_ICONS[t];return<div key={t} className="flex items-center gap-1 text-[11px] text-muted-foreground"><I className="size-3"/>{n}</div>})}{sum&&<span className="ml-auto text-[11px] font-mono text-muted-foreground">{fmtBytes(sum.total_size_bytes)}</span>}</div></CardContent></Card>
    </div>}

    {/* ══ FINDINGS: raised card stream ══ */}
    {hasF&&<Card className="surface-raised overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
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
      <CardContent className="space-y-2 pb-4">
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
              :<div className="mt-2 hidden group-hover:block rounded-lg border border-amber-500/10 surface-inset px-3 py-2 text-[11px] text-amber-200/50 leading-relaxed transition-opacity"><span className="font-medium text-amber-300">建议: </span>{f.recommendation}</div>}
            </div></div></div>
            </motion.div>
          })}
        </AnimatePresence>
        {ff.length>25&&<div className="pt-3 text-center text-[11px] text-muted-foreground">显示前25条，共{ff.length}条。使用筛选缩小范围。</div>}
      </CardContent>
    </Card>}

    {/* ══ ENTITIES: raised ══ */}
    {eSum.length>0&&<Card className="surface-raised overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-bold tracking-tight"><Fingerprint className="size-4 text-cyan-400"/>安全实体<Badge variant="outline" className="text-[11px]">{eSum.length}</Badge>{eFilt&&<Badge variant="secondary" className="text-[11px] gap-1">筛选:{eFilt}<button onClick={()=>setEFilt(null)}><X className="size-3"/></button></Badge>}</CardTitle>
        <Button variant="ghost" size="sm" className="h-7 text-[11px] hover:-translate-y-0.5 transition-transform active:scale-[0.97]" onClick={()=>setEExp(!eExp)}>{eExp?'收起':`全部(${eSum.length})`}<ChevronDown className={cn('size-3.5 ml-1 transition-transform duration-300',eExp&&'rotate-180')}/></Button>
      </CardHeader>
      <CardContent className="pb-4">
        {/* Group stats: inset pills */}
        <div className="mb-4 flex flex-wrap gap-2.5">{(['package','ioc','service','behavior','time'] as MultimodalEntityGroup[]).map(g=>{const its=eSum.filter(e=>e.group===g);if(!its.length)return null;const I=EG_ICONS[g];const crit=its.some(e=>e.maxRuleSeverity==='critical');return<button key={g} onClick={()=>{const f=its[0];if(f)setEFilt(eFilt===f.value?null:f.value)}} className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]',crit?'border-red-500/15 bg-red-950/15 text-red-300/70':'border-border/40 bg-muted/15 text-muted-foreground')}><I className="size-3"/>{EG_LABEL[g]}<span className="font-bold">{its.length}</span></button>})}</div>
        {/* Entity grid: base cards with raised hover */}
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{(eExp?eSum:topE).map((e,i)=>{const c=eColor(e.type);const hit=e.ruleCount>0;const on=eFilt===e.value
          return <motion.button key={e.key} initial={rm?{}:{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{delay:Math.min(i*.025,.35),duration:.2}} onClick={()=>{setEFilt(on?null:e.value);setSevF('all')}}
            className={cn('relative flex flex-col gap-2.5 rounded-xl border p-3.5 text-left transition-all duration-300 surface-base hover:-translate-y-1 active:translate-y-0 active:scale-[0.98]',on?'border-cyan-400/50 bg-cyan-950/25 ring-1 ring-cyan-400/15 shadow-[0_0_20px_rgba(6,182,212,0.10)]':[c.border,c.bg,'hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)]'].join(' '))}>
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="text-[10px] text-muted-foreground">{tLabel(e.type)}</div><div className={cn('mt-0.5 text-sm font-bold font-mono truncate',c.text)}>{e.value}</div></div>{hit&&<motion.span animate={on?{scale:[1,1.12,1]}:{}} transition={{repeat:Infinity,duration:2}} className="shrink-0 rounded-full bg-black/30 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">{e.ruleCount}</motion.span>}</div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground"><span>{e.count}次</span><span>·</span><span>{e.sourceCount}源</span></div>
            {e.maxRuleSeverity&&<div className={cn('absolute top-2 right-2 size-2 rounded-full',e.maxRuleSeverity==='critical'?'bg-red-500 animate-pulse':e.maxRuleSeverity==='high'?'bg-orange-500':e.maxRuleSeverity==='medium'?'bg-amber-500':'bg-emerald-500')}/>}
          </motion.button>})}
        </div>
      </CardContent>
    </Card>}

    {/* ══ SOURCES: raised ══ */}
    {sources.length>0&&<Card className="surface-raised">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3"><CardTitle className="flex items-center gap-2 text-base font-bold tracking-tight"><ClipboardList className="size-4 text-cyan-400"/>证据来源<Badge variant="outline" className="text-[11px]">{ev.length}</Badge></CardTitle></CardHeader>
      <CardContent className="pb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{sources.map(s=>{const I=SRC_ICONS[(s.source_type as MultimodalSourceType)||'image'];const risky=s.risk_level&&s.risk_level!=='low'
          return <button key={s.evidence_id} onClick={()=>setDetail(s)} className={cn('group flex flex-col gap-3 rounded-xl border border-border/40 surface-base p-4 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)] active:translate-y-0',risky&&'ring-1 ring-red-500/8')}>
            <div className="flex items-start justify-between gap-2"><div className="flex items-center gap-2 min-w-0"><div className="flex size-7 items-center justify-center rounded-lg surface-inset"><I className="size-3.5 text-cyan-400"/></div><span className="text-sm font-bold truncate">{s.original_filename}</span></div>{risky&&<SevBadge s={s.risk_level as SecuritySeverity}/>}</div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground"><span>发现{s.findings.length}</span><span>实体{s.entities.length}</span><span className="ml-auto font-mono">{fmtBytes(s.size_bytes)}</span></div>
            <div className="flex items-center gap-1.5 text-[11px] text-cyan-400/50 opacity-0 group-hover:opacity-100 transition-opacity"><Eye className="size-3"/>查看详情<ArrowRight className="size-3 group-hover:translate-x-0.5 transition-transform"/></div>
          </button>})}
        </div>
      </CardContent>
    </Card>}

    {/* ══ RAW DATA: recessed, collapsed ══ */}
    <Collapsible open={rawOpen} onOpenChange={setRawOpen}>
      <div className={cn('rounded-2xl surface-inset transition-all duration-300',rawOpen&&'border-cyan-500/10')}>
        <CollapsibleTrigger asChild>
          <button type="button" className={cn('flex w-full items-center justify-between px-5 py-3.5 text-left text-sm font-medium transition-all duration-200 hover:bg-white/[0.02] rounded-2xl',rawOpen&&'border-b border-border/30 rounded-b-none')}>
            <span className="flex items-center gap-2.5"><span className="flex size-7 items-center justify-center rounded-lg bg-muted/30"><FileSearch className="size-3.5 text-muted-foreground"/></span><span>原始数据<span className="ml-2 text-[11px] text-muted-foreground font-normal">规则命中 · 文本分析 · 派生产物 · 存储</span></span></span>
            <ChevronRight className={cn('size-4 text-muted-foreground transition-transform duration-300',rawOpen&&'rotate-90')}/>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent><div className="space-y-5 p-5">
          <div><h4 className="mb-2.5 text-sm font-bold">手动文本分析</h4><div className="flex gap-2"><Select value={textType} onValueChange={v=>setTextType(v as MultimodalSourceType)}><SelectTrigger className="w-28 h-9 text-[11px]"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="image">截图OCR</SelectItem><SelectItem value="audio">音频ASR</SelectItem><SelectItem value="video">视频帧</SelectItem></SelectContent></Select><Textarea data-mm-textarea value={text} onChange={e=>setText(e.target.value)} placeholder="粘贴 ASR/OCR 文本..." className="min-h-[60px] flex-1 font-mono text-[11px]" rows={3}/><Button size="sm" className="h-9 gap-1.5 border border-cyan-500/25 bg-cyan-950/40 text-cyan-200 hover:bg-cyan-900/50 hover:text-white transition-all duration-300 active:scale-[0.97]" onClick={analyze} disabled={analyzing||!text.trim()}>{analyzing?<Loader2 className="size-3.5 animate-spin"/>:<Search className="size-3.5"/>}分析</Button></div></div>
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

    <DetailSheet evidence={detail} open={!!detail} onClose={()=>setDetail(null)}/>
  </motion.div>
}
