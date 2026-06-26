import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion, useSpring, useTransform } from 'motion/react'
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  AlertTriangle, ArrowRight, ChevronRight, ClipboardList, Copy,
  Download, ExternalLink, FileText, Layers, Loader2,
  PackageCheck, Route, Search, ShieldAlert, TrendingUp, X, Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { downloadWorkspaceEvidencePackage, type SecuritySeverity, type SecurityWorkspace } from '@/lib/security-api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

/* ══ Types ══ */
interface ReportMetric { label: string; value: string; detail: string; tone: 'red'|'cyan'|'orange'|'emerald'|'slate' }
interface ReportPathStage { id: string; title: string; source: string; target: string; relationship: string; confidence: number; evidenceCount: number; evidenceGroups: string[]; severity: string; why_abusable?: string }
interface ReportTrustBreakpoint { id: string; title: string; evidence: string; severity: string }

/* ══ Data builders (unchanged) ══ */
function buildMetrics(w: SecurityWorkspace): ReportMetric[] {
  const s = w.summary; const g = w.graph?.summary
  const risk = s.risk_score
  const paths = g?.actionable_attack_path_count ?? g?.attack_path_count ?? s.attack_paths
  const primaryPath = w.graph?.attack_paths?.sort((a,b)=>(b.confidence??0)-(a.confidence??0))[0]
  const conf = Math.round((primaryPath?.confidence ?? g?.average_path_confidence ?? 0)*100)
  return [
    { label:'综合风险', value:`${risk}/100`, detail:s.risk_level, tone:risk>=90?'red':risk>=75?'orange':'cyan' },
    { label:'攻击路径', value:`${paths}`, detail:'候选链', tone:'cyan' },
    { label:'置信度', value:`${conf}%`, detail:'路径均值', tone:conf>=80?'emerald':conf>=60?'orange':'slate' },
    { label:'证据', value:`${g?.node_count ?? w.facts?.summary?.evidence_count ?? s.open_findings}`, detail:'节点+证据', tone:'slate' },
  ]
}
function buildRiskSources(w: SecurityWorkspace) {
  const items: {name:string;value:number}[] = []
  if (w.code_audit?.summary) items.push({name:'代码审查',value:w.code_audit.summary.total})
  if (w.dependency_audit?.summary) items.push({name:'供应链',value:w.dependency_audit.summary.finding_count})
  if (w.cicd_audit?.summary) items.push({name:'CI/CD',value:w.cicd_audit.summary.finding_count})
  if (w.artifact_trust?.summary) items.push({name:'产物可信',value:w.artifact_trust.summary.failed})
  if (w.log_audit?.summary) items.push({name:'日志印证',value:w.log_audit.summary.finding_count})
  if (w.multimodal_audit?.summary) items.push({name:'外部告警',value:w.multimodal_audit.summary.finding_count})
  if (w.graph?.summary) items.push({name:'图谱',value:w.graph.summary.attack_path_count??0})
  return items.filter(i=>i.value>0)
}
function buildStages(w: SecurityWorkspace): ReportPathStage[] {
  const path = w.graph?.attack_paths?.sort((a,b)=>(b.confidence??0)-(a.confidence??0))[0]
  return (path?.path_steps??[]).map((s:any,i)=>({
    id:`${i}`, title:s.relationship||s.edge_type||`步骤${i+1}`,
    source:s.source||'', target:s.target||'', relationship:s.relationship||s.edge_type||'',
    confidence:s.confidence??0.8, evidenceCount:(s.evidence_ids?.length??0)+1,
    evidenceGroups:evidenceGroups(s), severity:i===0?'critical':i===1?'high':'medium',
    why_abusable:s.why_abusable||'',
  }))
}
function evidenceGroups(step:any):string[]{
  const t=`${step.source||''} ${step.target||''} ${step.relationship||''} ${step.why_abusable||''}`.toLowerCase()
  const g:string[]=[]
  if(/dependency|package|sbom|vex|依赖/.test(t))g.push('组件')
  if(/workflow|runner|ci|action|build|构建/.test(t))g.push('CI/CD')
  if(/artifact|attestation|digest|hash|产物|签名/.test(t))g.push('产物')
  if(/log|runtime|外联|访问|事件|运行/.test(t))g.push('日志')
  if(/image|audio|video|ocr|asr|截图|告警/.test(t))g.push('外部告警')
  if(/code|import|call|源码|路径/.test(t))g.push('代码')
  return g.length?g:['组件']
}
function buildBreakpoints(w:SecurityWorkspace):ReportTrustBreakpoint[]{
  return (w.artifact_trust?.checks??[]).filter(c=>['fail','warn','missing'].includes(c.status||'')).slice(0,5).map(c=>({
    id:c.name,title:c.name,evidence:c.evidence||c.status||'',
    severity:c.severity||(c.status==='fail'?'high':'medium'),
  }))
}
function extractParagraphs(report:string,limit:number):string[]{
  const lines=report.split('\n');let inCB=false
  const c:string[]=[]
  for(const l of lines){const t=l.trim()
    if(t.startsWith('```')){inCB=!inCB;continue}
    if(inCB)continue
    if(t.startsWith('#')||t.startsWith('-')||t.startsWith('|')||t.startsWith('!')||t.startsWith('['))continue
    if(/^[A-Z]+\d*\[/.test(t)||/-->/.test(t)||/^\s*>/.test(t)||/^\d+\./.test(t)||/mermaid/i.test(t))continue
    if(t.length>40)c.push(t)
  }
  return c.slice(0,limit)
}
function downloadBlob(blob:Blob,filename:string){const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=filename;a.click();URL.revokeObjectURL(u)}

/* ════════════════════════════════════════════════════
   ANIMATED NUMBER
   ════════════════════════════════════════════════════ */
function AnimatedNumber({target,ready,className}:{target:number;ready:boolean;className?:string}){
  const spring=useSpring(0,{stiffness:35,damping:16})
  const [display,setDisplay]=useState(0)
  useEffect(()=>{if(ready)spring.set(target)},[ready,target,spring])
  useEffect(()=>{
    const unsub=spring.on('change',(v:number)=>setDisplay(Math.round(v)))
    return()=>unsub()
  },[spring])
  return <span className={cn('tabular-nums',className)}>{display}</span>
}

/* ══ Glow KPI card — spotlight hover, animated number, shimmer ══ */
function GlowKpi({metric,delay,ready}:{metric:ReportMetric;delay:number;ready:boolean}){
  const rm=useReducedMotion()
  const toneMap:Record<string,{text:string;glow:string;bg:string}> = {
    red:{text:'text-console-red',glow:'rgba(239,68,68,0.15)',bg:'rgba(239,68,68,0.04)'},
    cyan:{text:'text-console-cyan',glow:'rgba(6,182,212,0.15)',bg:'rgba(6,182,212,0.04)'},
    orange:{text:'text-console-orange',glow:'rgba(249,115,22,0.15)',bg:'rgba(249,115,22,0.04)'},
    emerald:{text:'text-console-emerald',glow:'rgba(52,211,153,0.15)',bg:'rgba(52,211,153,0.04)'},
    slate:{text:'text-muted-foreground',glow:'rgba(148,163,184,0.08)',bg:'rgba(148,163,184,0.02)'},
  }
  const t=toneMap[metric.tone]
  // Extract numeric value for animation
  const numVal=parseInt(metric.value)||0
  return(
    <motion.div
      className="group relative overflow-hidden rounded-2xl border border-border bg-[color:var(--surface-card)] p-5 cursor-default"
      initial={rm?{}:{opacity:0,y:20,scale:.95}}
      animate={ready?{opacity:1,y:0,scale:1}:{}}
      transition={{duration:.55,delay,ease:[.16,1,.3,1]}}
      whileHover={{y:-3,transition:{duration:.3}}}
    >
      {/* Spotlight hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{background:`radial-gradient(circle at 50% 0%, ${t.glow} 0%, transparent 60%)`}}/>
      {/* Top glow bar */}
      <div className="absolute top-0 left-4 right-4 h-px opacity-40 group-hover:opacity-100 transition-opacity duration-500"
        style={{background:`linear-gradient(90deg, transparent, ${t.glow.replace('0.15','0.6')}, transparent)`}}/>
      <span className="relative text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{metric.label}</span>
      <div className={cn('relative text-3xl font-black tracking-tighter mt-1',t.text)}>
        <AnimatedNumber target={numVal} ready={ready} />
        <span className="text-lg">{metric.value.replace(/^\d+/,'')}</span>
      </div>
      <span className="relative text-[11px] text-muted-foreground truncate block mt-0.5">{metric.detail}</span>
    </motion.div>
  )
}

/* ══ Risk Ring — with glow aura ══ */
function RiskRing({score,level,ready}:{score:number;level:string;ready:boolean}){
  const r=92,cx=104,cy=104,circ=Math.round(2*Math.PI*r)
  const tgt=circ-(score/100)*circ
  const spr=useSpring(0,{stiffness:16,damping:11,mass:.8})
  useEffect(()=>{if(ready)spr.set(tgt)},[ready,tgt,spr])
  const tone=score>=90?'#ef4444':score>=75?'#f97316':score>=55?'#f59e0b':'#22c55e'
  const label=score>=90?'严重威胁':score>=75?'高风险':score>=55?'中风险':'低风险'
  const rm=useReducedMotion()
  return(
    <motion.div className="relative size-56 grid place-items-center shrink-0"
      initial={rm?{}:{opacity:0,scale:.75}} animate={ready?{opacity:1,scale:1}:{}}
      transition={{duration:.7,delay:.15,ease:[.16,1,.3,1]}}>
      {/* Outer glow aura */}
      <div className="absolute inset-0 rounded-full opacity-20 animate-pulse" style={{background:`radial-gradient(circle, ${tone}40, transparent 70%)`,filter:'blur(20px)'}}/>
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 208 208">
        <defs>
          <filter id="ringGlow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={9} className="text-border/60"/>
        <motion.circle cx={cx} cy={cy} r={r} fill="none" stroke={tone} strokeWidth={9} strokeLinecap="round"
          strokeDasharray={circ} style={{strokeDashoffset:spr}} filter="url(#ringGlow)"/>
      </svg>
      <div className="relative flex flex-col items-center">
        <AnimatedNumber target={score} ready={ready} className={cn('text-5xl font-black')} />
        <span className="text-xs font-bold uppercase tracking-widest mt-1.5 px-3 py-0.5 rounded-full" style={{color:tone,background:`${tone}15`}}>{label}</span>
      </div>
    </motion.div>
  )
}

/* ══ Glow bar for chart ══ */
function GlowBar(props:any){
  const{x,y,width,height,fill,index}=props
  if(width==null||height==null)return null
  const progress=useSpring(0,{stiffness:50,damping:13})
  useEffect(()=>{const t=setTimeout(()=>progress.set(1),(index||0)*120);return()=>clearTimeout(t)},[progress,index])
  const h=useTransform(progress,[0,1],[0,height])
  const op=useTransform(progress,[0,1],[0,1])
  return(
    <g>
      <motion.rect x={x} y={useTransform(progress,v=>y+height-v*height)} width={width} height={h as any}
        fill={fill||'#0891b2'} rx={5} opacity={op as any}
        style={{filter:'url(#barGlow)'}}/>
      {progress.get()>.5&&(
        <motion.rect x={x} y={y-2} width={width} height={2} fill="#67e8f9" rx={1} opacity={useTransform(progress,[.5,1],[0,.9])}/>
      )}
    </g>
  )
}

/* ══ Stage entry card — glow hover button ══ */
function StageCard({stage,index,ready,onClick}:{stage:ReportPathStage;index:number;ready:boolean;onClick:()=>void}){
  const rm=useReducedMotion()
  const sevColors:Record<string,string>={critical:'#ef4444',high:'#f97316',medium:'#f59e0b'}
  const accent=sevColors[stage.severity]||'#06b6d4'
  return(
    <motion.button
      initial={rm?{}:{opacity:0,y:16,scale:.96}}
      animate={ready?{opacity:1,y:0,scale:1}:{}}
      transition={{delay:.12+index*.07,duration:.45,ease:[.16,1,.3,1]}}
      onClick={onClick}
      className="group relative overflow-hidden rounded-lg border border-border bg-[color:var(--surface-card)] p-4 text-left
        transition-all duration-500 hover:-translate-y-1 hover:shadow-lg hover:border-ring/35
        active:translate-y-0 active:scale-[0.98]"
    >
      {/* Hover glow beam */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
        style={{background:`radial-gradient(ellipse at 30% 0%, ${accent}15, transparent 60%)`}}/>
      {/* Shine sweep */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 pointer-events-none"/>
      {/* Left accent */}
      <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full opacity-50 group-hover:opacity-100 transition-all duration-500"
        style={{background:accent,boxShadow:`0 0 8px ${accent}`}}/>
      <div className="pl-2">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">阶段 {index+1}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 group-hover:border-current transition-colors duration-300"
            style={{color:accent,borderColor:`${accent}40`}}>{Math.round(stage.confidence*100)}%</Badge>
        </div>
        <div className="text-sm font-bold leading-snug line-clamp-2 mb-2.5 group-hover:text-foreground transition-colors duration-300">{stage.title}</div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {stage.evidenceGroups.slice(0,3).map(g=>(
            <span key={g} className="rounded-md surface-inset px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors duration-300">{g}</span>
          ))}
        </div>
        <div className="flex items-center gap-1 text-[11px] opacity-0 group-hover:opacity-100 transition-all duration-300"
          style={{color:accent}}>
          <ExternalLink className="size-3"/> 查看详情 <ChevronRight className="size-3 group-hover:translate-x-1 transition-transform"/>
        </div>
      </div>
    </motion.button>
  )
}

/* ══ Stage Drawer ══ */
function StageDrawer({stage,open,onClose}:{stage:ReportPathStage|null;open:boolean;onClose:()=>void}){
  if(!stage)return null
  return(
    <Sheet open={open} onOpenChange={v=>{if(!v)onClose()}}>
      <SheetContent side="right" className="!w-[65vw] !max-w-[740px] overflow-hidden flex flex-col p-0">
        <div className="shrink-0 border-b border-border/50 px-8 py-5">
          <SheetHeader><SheetTitle className="text-lg font-black tracking-tight">{stage.title}</SheetTitle></SheetHeader>
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-[10px]">{Math.round(stage.confidence*100)}% 置信度</Badge>
            <span>{stage.evidenceCount} 条证据</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-5">
          <Tabs defaultValue="overview">
            <TabsList className="h-9 mb-5"><TabsTrigger value="overview" className="text-[11px] h-7">概览</TabsTrigger><TabsTrigger value="evidence" className="text-[11px] h-7">证据</TabsTrigger><TabsTrigger value="connection" className="text-[11px] h-7">上下游</TabsTrigger><TabsTrigger value="advice" className="text-[11px] h-7">建议</TabsTrigger></TabsList>
            <TabsContent value="overview" className="mt-0 space-y-5">
              <div className="grid grid-cols-2 gap-5">
                {[['来源',stage.source],['目标',stage.target],['关系',stage.relationship],['置信度',`${Math.round(stage.confidence*100)}%`]].map(([l,v])=>(
                  <div key={l} className="space-y-1.5"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">{l}</div><div className="rounded-lg surface-inset p-3 text-sm font-bold break-all">{v||'—'}</div></div>
                ))}
              </div>
              {stage.why_abusable&&<div className="space-y-1.5"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">可利用性</div><p className="text-sm leading-relaxed text-muted-foreground">{stage.why_abusable}</p></div>}
            </TabsContent>
            <TabsContent value="evidence" className="mt-0 space-y-3">
              <div className="flex flex-wrap gap-2">{stage.evidenceGroups.map(g=><Badge key={g} variant="secondary" className="text-xs px-2.5 py-1">{g}</Badge>)}</div>
              <p className="text-sm text-muted-foreground">共 <span className="font-bold text-foreground">{stage.evidenceCount}</span> 条证据记录</p>
            </TabsContent>
            <TabsContent value="connection" className="mt-0">
              <div className="flex items-center gap-4 rounded-xl surface-base p-6">
                <div className="text-center shrink-0"><div className="font-mono text-xs font-bold text-muted-foreground truncate max-w-[200px]">{stage.source||'入口'}</div></div>
                <div className="flex flex-col items-center gap-1"><ArrowRight className="size-5 text-cyan-400"/><span className="text-[10px] text-muted-foreground">{stage.relationship}</span></div>
                <div className="text-center shrink-0"><div className="font-mono text-xs font-bold text-muted-foreground truncate max-w-[200px]">{stage.target||'目标'}</div></div>
              </div>
            </TabsContent>
            <TabsContent value="advice" className="mt-0">
              <div className="rounded-xl border border-amber-500/20 bg-amber-950/15 p-5"><p className="text-sm leading-relaxed text-amber-200/80">建议对 {stage.source} → {stage.target} 的 {stage.relationship} 链路进行审计，补全 {stage.evidenceGroups.join('、')} 证据。{stage.why_abusable?`可利用性分析：${stage.why_abusable}`:''}</p></div>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/* ════════════════════════════════════════════════════
   MAIN
   ════════════════════════════════════════════════════ */
export function ReportPanel({workspace,animationKey}:{workspace:SecurityWorkspace;animationKey:number}){
  const rm=useReducedMotion()
  const [ready,setReady]=useState(false)
  const [mode,setMode]=useState<'preview'|'source'>('preview')
  const [exporting,setExporting]=useState(false)
  const [detailStage,setDetailStage]=useState<ReportPathStage|null>(null)
  const [mdSearch,setMdSearch]=useState('')
  const [heatCell,setHeatCell]=useState<{stage:ReportPathStage;type:string}|null>(null)

  const report=workspace.report||'# APT 供应链攻击溯源报告\n\n暂无报告内容。'
  const wsId=workspace.workspaceId||workspace.workspace?.workspaceId

  // Unified animation trigger
  useEffect(()=>{setReady(false);const t=setTimeout(()=>setReady(true),100);return()=>clearTimeout(t)},[animationKey])

  const metrics=useMemo(()=>buildMetrics(workspace),[workspace])
  const riskSources=useMemo(()=>buildRiskSources(workspace),[workspace])
  const stages=useMemo(()=>buildStages(workspace),[workspace])
  const breakpoints=useMemo(()=>buildBreakpoints(workspace),[workspace])
  const paragraphs=useMemo(()=>extractParagraphs(report,6),[report])
  const mdLines=useMemo(()=>report.split('\n'),[report])

  async function exportEvidence(){
    if(!wsId){toast.error('缺少 workspaceId');return}
    setExporting(true)
    try{const b=await downloadWorkspaceEvidencePackage(wsId);downloadBlob(b,`${wsId}-evidence-package.zip`);toast.success('证据包已导出')}
    catch(e){toast.error(e instanceof Error?e.message:'导出失败')}
    finally{setExporting(false)}
  }
  function expMd(){downloadBlob(new Blob([report],{type:'text/markdown;charset=utf-8'}),'report.md');toast.success('已导出')}
  function expHtml(){
    const css='body{max-width:900px;margin:2rem auto;padding:1.5rem;font-family:system-ui;background:#0a0f1a;color:#e2e8f0;line-height:1.8}h1,h2,h3{color:#f8fafc}pre{background:#1a2030;padding:1rem;border-radius:10px;overflow-x:auto}code{background:#1a2030;padding:.2em .5em;border-radius:5px}'
    downloadBlob(new Blob([`<!DOCTYPE html><html><head><meta charset="utf-8"><title>APT溯源报告</title><style>${css}</style></head><body>${report.replace(/\n/g,'<br>')}</body></html>`],{type:'text/html'}),'report.html');toast.success('已导出')
  }

  const riskLevel=workspace.summary.risk_level
  const levelColor=riskLevel==='critical'?'#ef4444':riskLevel==='high'?'#f97316':'#06b6d4'
  const levelLabel=riskLevel==='critical'?'严重威胁':riskLevel==='high'?'高风险':'活跃'

  const fadeIn=rm?{}:{initial:{opacity:0,y:16},animate:{opacity:1,y:0},transition:{duration:.5,ease:[.16,1,.3,1]}}

  return(
    <motion.div className="space-y-8 pb-24" {...fadeIn}>
      {/* ════════════════════════════════════════════════
         HERO — beam background, glow aura, spotlight
         ════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden rounded-lg border border-border bg-[color:var(--surface-panel)] p-8 lg:p-10">
        {/* Animated background beams */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Radial glow centers */}
          <div className="absolute -top-40 -right-20 w-96 h-96 rounded-full opacity-20 animate-pulse"
            style={{background:`radial-gradient(circle, ${levelColor}30, transparent 70%)`,filter:'blur(40px)'}}/>
          <div className="absolute -bottom-20 left-1/4 w-80 h-80 rounded-full opacity-10"
            style={{background:'radial-gradient(circle, #06b6d420, transparent 70%)',filter:'blur(30px)'}}/>
          {/* Scanning beam */}
          <div className="absolute top-0 left-1/4 w-px h-full opacity-20"
            style={{background:`linear-gradient(180deg, transparent, ${levelColor}60, transparent)`,animation:'scanBeam 4s ease-in-out infinite'}}/>
          <div className="absolute top-0 left-3/4 w-px h-full opacity-10"
            style={{background:'linear-gradient(180deg, transparent, #06b6d440, transparent)',animation:'scanBeam 6s ease-in-out infinite 1s'}}/>
          {/* Grid dots */}
          <div className="absolute inset-0 opacity-[0.03]"
            style={{backgroundImage:'radial-gradient(circle, #fff 1px, transparent 1px)',backgroundSize:'32px 32px'}}/>
        </div>

        <style>{`@keyframes scanBeam{0%,100%{transform:translateY(-100%)}50%{transform:translateY(100%)}}`}</style>

        <div className="relative grid gap-8 lg:grid-cols-[1fr_260px] items-center">
          <div className="space-y-5">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-page-title">
                APT 供应链攻击溯源报告
              </h1>
              <Badge variant="outline" className="text-xs px-2.5 py-0.5 font-bold" style={{borderColor:`${levelColor}50`,color:levelColor,background:`${levelColor}10`}}>
                {levelLabel}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">
              基于代码审查、供应链依赖、CI/CD 链路、产物可信验证、日志印证、多模态外部告警的全链路溯源分析
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" className="gap-1.5 bg-cyan-700 hover:bg-cyan-600 shadow-[0_0_20px_rgba(6,182,212,0.15)]" onClick={exportEvidence} disabled={exporting}>
                {exporting?<Loader2 className="size-3.5 animate-spin"/>:<PackageCheck className="size-3.5"/>}导出证据包
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 hover:border-ring/40" onClick={expMd}><Download className="size-3.5"/>Markdown</Button>
              <Button variant="outline" size="sm" className="gap-1.5 hover:border-ring/40" onClick={expHtml}><FileText className="size-3.5"/>HTML</Button>
              <span className="text-[10px] text-muted-foreground ml-2">
                生成于 {workspace.graph?.generated_at?.slice(0,19).replace('T',' ')||workspace.generated_at?.slice(0,19).replace('T',' ')||'—'}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-center"><RiskRing score={workspace.summary.risk_score} level={riskLevel} ready={ready}/></div>
        </div>

        {/* KPI row */}
        <div className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-8">
          {metrics.map((m,i)=><GlowKpi key={m.label} metric={m} delay={.08+i*.1} ready={ready}/>)}
        </div>
      </div>

      {/* ══ TABS ══ */}
      <Tabs value={mode} onValueChange={v=>setMode(v as 'preview'|'source')}>
        <TabsList className="h-9 surface-inset"><TabsTrigger value="preview" className="text-xs h-7">报告预览</TabsTrigger><TabsTrigger value="source" className="text-xs h-7">Markdown 源码</TabsTrigger></TabsList>

        <TabsContent value="preview" className="mt-5 space-y-6">
          {/* ══ Bar Chart ══ */}
          {riskSources.length>0&&(
            <Card className="surface-raised overflow-hidden">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-bold flex items-center gap-2"><TrendingUp className="size-4 text-cyan-400"/>风险来源分布</CardTitle></CardHeader>
              <CardContent>
                <svg width="0" height="0"><defs><filter id="barGlow"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs></svg>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={riskSources} margin={{top:12,right:12,left:-16,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={.2}/>
                    <XAxis dataKey="name" tick={{fontSize:11,fill:'var(--muted-foreground)'}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:10,fill:'var(--muted-foreground)'}} axisLine={false} tickLine={false}/>
                    <Tooltip contentStyle={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:10,fontSize:12,boxShadow:'0 8px 24px rgba(0,0,0,0.3)'}}/>
                    <Bar dataKey="value" fill="#0891b2" radius={[5,5,0,0]} isAnimationActive={false} shape={<GlowBar/>} key={`bar-${animationKey}`}/>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* ══ Path stages ══ */}
          {stages.length>0&&(
            <Card className="surface-raised">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-bold flex items-center gap-2"><Route className="size-4 text-cyan-400"/>攻击路径流程</CardTitle></CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {stages.slice(0,9).map((s,i)=><StageCard key={s.id} stage={s} index={i} ready={ready} onClick={()=>setDetailStage(s)}/>)}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ══ Heatmap + Breakpoints ══ */}
          <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
            {stages.length>0&&(
              <Card className="surface-raised">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-bold flex items-center gap-2"><ClipboardList className="size-4 text-cyan-400"/>证据覆盖矩阵</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[540px]">
                    <thead><tr className="[&>th]:px-2 [&>th]:py-2.5 [&>th]:text-left [&>th]:font-medium [&>th]:text-muted-foreground border-b border-border/50"><th>阶段</th>{['组件','CI/CD','产物','日志','告警','代码'].map(t=><th key={t}>{t}</th>)}</tr></thead>
                    <tbody>{stages.slice(0,6).map(stage=>(
                      <tr key={stage.id} className="border-b border-border/30 hover:bg-[color:var(--surface-inset)] transition-colors">
                        <td className="px-2 py-2.5 font-medium truncate max-w-[100px]">{stage.title?.slice(0,18)}</td>
                        {['组件','CI/CD','产物','日志','外部告警','代码'].map(type=>{
                          const hit=stage.evidenceGroups.includes(type)||(type==='告警'&&stage.evidenceGroups.includes('外部告警'))
                          return(
                            <td key={type} className="px-2 py-2.5">
                              <button onClick={()=>hit&&setHeatCell({stage,type:type==='告警'?'外部告警':type})} className={cn('rounded-lg px-2.5 py-1 text-[10px] font-bold transition-all duration-200',
                                hit?'bg-console-emerald-soft text-console-emerald hover:-translate-y-0.5 cursor-pointer shadow-[0_0_6px_rgba(52,211,153,0.08)]':'text-muted-foreground/40',
                              )}>{hit?stage.evidenceCount:'—'}</button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}</tbody>
                  </table>
                </CardContent>
              </Card>
            )}
            <Card className="surface-raised">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-bold flex items-center gap-2"><AlertTriangle className="size-4 text-amber-400"/>可信断点</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {breakpoints.length?breakpoints.map(bp=>(
                  <div key={bp.id} className={cn('rounded-lg border p-3',bp.severity==='critical'?'border-red-500/20 bg-red-950/20':bp.severity==='high'?'border-orange-500/20 bg-orange-950/20':'border-amber-500/15 bg-amber-950/15')}>
                    <div className="flex items-center gap-1.5"><Badge variant="outline" className={cn('text-[10px] px-1 py-0 h-4',bp.severity==='critical'?'border-red-500/40 text-red-400':bp.severity==='high'?'border-orange-500/40 text-orange-400':'border-amber-500/40 text-amber-400')}>{bp.severity==='critical'?'严重':bp.severity==='high'?'高危':'中危'}</Badge><span className="text-xs font-semibold">{bp.title}</span></div>
                    {bp.evidence&&<p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">{bp.evidence}</p>}
                  </div>
                )):<p className="text-xs text-muted-foreground">暂无断点</p>}
              </CardContent>
            </Card>
          </div>

          {/* ══ Summary ══ */}
          {paragraphs.length>0&&(
            <Card className="surface-raised">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-bold flex items-center gap-2"><FileText className="size-4 text-cyan-400"/>正文摘要</CardTitle></CardHeader>
              <CardContent><div className="grid gap-3 md:grid-cols-2">{paragraphs.map((p,i)=><div key={i} className="rounded-xl surface-inset p-4 text-sm leading-relaxed text-muted-foreground">{p}</div>)}</div></CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ══ SOURCE ══ */}
        <TabsContent value="source" className="mt-5">
          <Card className="surface-raised">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold">Markdown 源码</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative"><Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground"/><Input value={mdSearch} onChange={e=>setMdSearch(e.target.value)} placeholder="搜索..." className="h-7 w-48 pl-7 text-xs"/>{mdSearch&&<button onClick={()=>setMdSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2"><X className="size-3 text-muted-foreground"/></button>}</div>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={()=>{navigator.clipboard.writeText(report);toast.success('已复制')}}><Copy className="size-3"/>复制</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg surface-inset p-5 font-mono text-xs leading-relaxed max-h-[70vh] overflow-y-auto">
                {mdSearch?mdLines.filter(l=>l.toLowerCase().includes(mdSearch.toLowerCase())).map((l,i)=>(<div key={i} className="py-0.5">{l}</div>)):<pre className="whitespace-pre-wrap break-all text-muted-foreground">{report}</pre>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <StageDrawer stage={detailStage} open={!!detailStage} onClose={()=>setDetailStage(null)}/>

      {/* ══ Heat cell drawer ══ */}
      <Sheet open={!!heatCell} onOpenChange={v=>{if(!v)setHeatCell(null)}}>
        <SheetContent side="right" className="!w-[48vw] !max-w-[520px] overflow-y-auto p-0">
          {heatCell&&(<>
            <div className="border-b border-border/50 px-6 py-4">
              <SheetHeader><SheetTitle className="text-base font-bold">证据覆盖详情</SheetTitle></SheetHeader>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div className="grid grid-cols-2 gap-x-5 gap-y-4 text-sm">
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">阶段</div>
                  <div className="rounded-lg surface-inset p-3 text-sm font-bold">{heatCell.stage.title}</div>
                </div>
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">类别</div>
                  <div className="rounded-lg surface-inset p-3"><Badge variant="secondary">{heatCell.type}</Badge></div>
                </div>
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">证据数量</div>
                  <div className="rounded-lg surface-inset p-3 text-sm font-bold">{heatCell.stage.evidenceCount} 条</div>
                </div>
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">置信度</div>
                  <div className="rounded-lg surface-inset p-3 text-sm font-bold">{Math.round(heatCell.stage.confidence*100)}%</div>
                </div>
              </div>
              <div className="rounded-xl border border-border/40 bg-[color:var(--surface-panel)] p-5 text-sm leading-relaxed text-muted-foreground">
                该阶段覆盖了 <strong className="text-foreground">{heatCell.type}</strong> 类证据，关系类型为 <strong className="text-foreground">{heatCell.stage.relationship}</strong>，
                来源 <code className="text-xs bg-muted/30 px-1 py-0.5 rounded">{heatCell.stage.source}</code>，目标 <code className="text-xs bg-muted/30 px-1 py-0.5 rounded">{heatCell.stage.target}</code>。
              </div>
            </div>
          </>)}
        </SheetContent>
      </Sheet>
    </motion.div>
  )
}
