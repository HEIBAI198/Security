import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion, useSpring, useTransform } from 'motion/react'
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  AlertTriangle, ArrowRight, ChevronRight, ClipboardList, Copy,
  Download, ExternalLink, FileText, Loader2,
  PackageCheck, Search, ShieldAlert, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { downloadWorkspaceEvidencePackage, type SecurityWorkspace } from '@/lib/security-api'
import type { PlatformTab } from './investigation-workflow'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

/* ══ Types ══ */
interface ReportPathStage { id: string; title: string; source: string; target: string; relationship: string; confidence: number; evidenceCount: number; evidenceGroups: string[]; severity: string; why_abusable?: string }
interface ReportTrustBreakpoint { id: string; title: string; evidence: string; severity: string }
interface ReportActionItem { priority: '最高优先级'|'高优先级'|'中优先级'; title: string; detail: string; tone: 'red'|'orange'|'cyan' }
interface RiskSourceDetail { title: string; severity: string; evidence: string }
interface RiskSourceItem { name: string; value: number; details: RiskSourceDetail[]; module: PlatformTab }
interface EvidenceCoverageItem { label: string; module: PlatformTab; hit: boolean; count: number; detail: string }

function listOf<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function num(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function textOf(value: unknown, fallback = '-') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function _buildRiskSources(w: SecurityWorkspace) {
  const items: RiskSourceItem[] = []
  if (w.code_audit?.summary) items.push({name:'代码审查',value:num(w.code_audit.summary.total),module:'code',details:listOf(w.code_audit.findings).slice(0,5).map(f=>({title:textOf(f.title),severity:textOf(f.severity, 'medium'),evidence:`${textOf(f.risk_file)}:${textOf(f.line)} · ${textOf(f.evidence)}`}))})
  if (w.dependency_audit?.summary) items.push({name:'供应链',value:num(w.dependency_audit.summary.finding_count),module:'supply',details:listOf(w.dependency_audit.findings).slice(0,5).map(f=>({title:textOf(f.title),severity:textOf(f.severity, 'medium'),evidence:`${textOf(f.dependency)} · ${textOf(f.source_file)} · ${textOf(f.evidence)}`}))})
  if (w.cicd_audit?.summary) items.push({name:'CI/CD',value:num(w.cicd_audit.summary.finding_count),module:'pipeline',details:listOf(w.cicd_audit.findings).slice(0,5).map(f=>({title:textOf(f.title),severity:textOf(f.severity, 'medium'),evidence:`${textOf(f.workflow)}${f.job_id?` / ${f.job_id}`:''} · ${textOf(f.evidence)}`}))})
  if (w.artifact_trust?.summary) items.push({name:'产物可信',value:num(w.artifact_trust.summary.failed),module:'artifact',details:[
    ...listOf(w.artifact_trust.findings).slice(0,4).map(f=>({title:textOf(f.title),severity:textOf(f.severity, 'medium'),evidence:textOf(f.evidence)})),
    ...listOf(w.artifact_trust.checks).filter(c=>['fail','warn','missing'].includes(String(c.status||''))).slice(0,4).map(c=>({title:artifactCheckTitle(textOf(c.name)),severity:c.status==='fail'?'critical':c.status==='warn'?'high':'medium',evidence:textOf(c.evidence, String(c.status || '-'))})),
  ].slice(0,5)})
  if (w.log_audit?.summary) items.push({name:'日志印证',value:num(w.log_audit.summary.finding_count),module:'logs',details:listOf(w.log_audit.findings).slice(0,5).map(f=>({title:textOf(f.title),severity:textOf(f.severity, 'medium'),evidence:`${textOf(f.source)} · ${textOf(f.signal)} · ${textOf(f.evidence)}`}))})
  if (w.multimodal_audit?.summary) {
    const directFindings = listOf(w.multimodal_audit.findings)
    const evidenceFindings = listOf(w.multimodal_audit.evidence).flatMap(item =>
      listOf(item.findings).map(finding => ({ ...finding, source_name: item.original_filename || item.filename }))
    )
    items.push({
      name:'外部告警',
      value:num(w.multimodal_audit.summary.finding_count),
      module:'multimodal',
      details:[...directFindings, ...evidenceFindings].slice(0,5).map(f=>({title:textOf(f.title),severity:textOf(f.severity, 'medium'),evidence:`${textOf(f.source_name)} · ${textOf(f.evidence || f.reason || f.rule_id)}`}))
    })
  }
  if (w.graph?.summary) items.push({name:'图谱',value:num(w.graph.summary.attack_path_count),module:'graph',details:listOf(w.graph.attack_paths).slice(0,5).map(p=>({title:textOf(p.title),severity:textOf(p.severity, 'medium'),evidence:textOf(p.conclusion||p.description)}))})
  return items.filter(i=>i.value>0)
}
function _buildStages(w: SecurityWorkspace): ReportPathStage[] {
  const path = sortedAttackPaths(w)[0]
  return listOf(path?.path_steps).map((s:any,i)=>({
    id:`${i}`, title:textOf(s.relationship||s.edge_type, `步骤${i+1}`),
    source:textOf(s.source, ''), target:textOf(s.target, ''), relationship:textOf(s.relationship||s.edge_type, ''),
    confidence:num(s.confidence, 0.8), evidenceCount:listOf(s.evidence_ids).length+1,
    evidenceGroups:evidenceGroups(s), severity:i===0?'critical':i===1?'high':'medium',
    why_abusable:textOf(s.why_abusable, ''),
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
function _buildBreakpoints(w:SecurityWorkspace):ReportTrustBreakpoint[]{
  return listOf(w.artifact_trust?.checks).filter(c=>['fail','warn','missing'].includes(String(c.status||''))).slice(0,5).map(c=>({
    id:textOf(c.name),title:artifactCheckTitle(textOf(c.name)),evidence:textOf(c.evidence, String(c.status || '')),
    severity:textOf(c.severity, c.status==='fail'?'high':'medium'),
  }))
}

function sortedAttackPaths(w: SecurityWorkspace) {
  return [...listOf<NonNullable<SecurityWorkspace['graph']>['attack_paths'][number]>(w.graph?.attack_paths)]
    .sort((a,b)=>num(b.confidence)-num(a.confidence))
}

function artifactCheckTitle(name:string){
  const labels:Record<string,string>={
    artifact_digest_matches_subject:'产物哈希与来源证明不一致',
    builder_trusted:'未配置可信构建器',
    runner_environment_trusted:'构建 Runner 环境不符合策略',
    signature_verified:'签名验证失败或超时',
    provenance_type:'来源证明类型异常',
    attestation_max_age:'来源证明时间异常',
    expected_workflow:'构建 workflow 不符合预期',
  }
  return labels[name]||name
}

function _buildActionItems(w:SecurityWorkspace, breakpoints:ReportTrustBreakpoint[], stages:ReportPathStage[]):ReportActionItem[]{
  const items:ReportActionItem[]=[]
  if((w.summary.risk_score??0)>=90||breakpoints.some(bp=>['critical','high'].includes(bp.severity))){
    items.push({priority:'最高优先级',title:'阻断发布并冻结当前产物',detail:'当前风险已经进入供应链关键链路，先停止发布或合并，避免污染产物进入用户环境。',tone:'red'})
  }
  if(w.dependency_audit?.summary?.finding_count){
    items.push({priority:'最高优先级',title:'隔离高危依赖并复核来源',detail:'优先处理高危依赖、可疑 postinstall、依赖混淆或 VEX 可达问题，确认是否由 AI 推荐或手动引入。',tone:'red'})
  }
  if(w.artifact_trust?.summary?.failed||breakpoints.length){
    items.push({priority:'高优先级',title:'使用干净 Runner 重新构建产物',detail:'重新生成 artifact、provenance 和 attestation，校验 digest、commit、workflow、builder 与策略是否一致。',tone:'orange'})
  }
  if(w.log_audit?.summary?.finding_count){
    items.push({priority:'高优先级',title:'排查运行期外联和敏感接口访问',detail:'对日志中的外联 IP、敏感路径和异常行为做封禁、回溯和影响面确认。',tone:'orange'})
  }
  if(stages.length){
    items.push({priority:'中优先级',title:'补齐证据缺口并复扫攻击链',detail:'补充缺失日志、签名、可信 builder 和外部告警后重新扫描，确认攻击链是否仍然成立。',tone:'cyan'})
  }
  return items.slice(0,6)
}

function severityLabel(severity:string){
  if(severity==='critical')return'严重'
  if(severity==='high')return'高危'
  if(severity==='medium')return'中危'
  if(severity==='low')return'低危'
  return severity||'风险'
}

function severityBadgeClass(severity:string){
  if(severity==='critical')return'border-red-500/40 text-red-400'
  if(severity==='high')return'border-orange-500/40 text-orange-400'
  if(severity==='medium')return'border-amber-500/40 text-amber-400'
  if(severity==='low')return'border-cyan-500/40 text-cyan-400'
  return'border-border text-muted-foreground'
}

function _extractParagraphs(report:string,limit:number):string[]{
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

function normalizeReportTitle(report:string){
  const title='# SupplyGuard KG 供应链攻击溯源报告'
  const trimmed=report.trimStart()
  if(/^#\s+SupplyGuard KG 供应链攻击溯源报告/m.test(trimmed))return report
  if(/^#\s+APT 供应链攻击溯源报告/m.test(trimmed))return report.replace(/^#\s+APT 供应链攻击溯源报告/m,title)
  if(/^#\s+.*溯源报告.*$/m.test(trimmed))return report.replace(/^#\s+.*溯源报告.*$/m,title)
  return `${title}\n\n${report}`.trimEnd()
}

const ATTACK_PATH_OVERVIEW_SECTION_TITLES=new Set(['攻击路径','攻击路径总览'])
const ATTACK_PATH_DETAIL_SECTION_TITLES=new Set(['攻击路径详情','攻击链路详情','攻击链路详细','攻击链路详细部分'])
const CONCLUSION_SECTION_TITLES=new Set(['一句话结论','结论'])

export function normalizeReportForDisplay(report:string, workspace:SecurityWorkspace){
  const withTitle=normalizeReportTitle(report)
  const withoutCaution=removeReportAdmonitionBlocks(withTitle)
  const withoutRedundantSections=removeMarkdownSectionsByTitle(withoutCaution,new Set(['风险总览','路径判定','技术明细']))
  const withCompactConclusion=rewriteConclusionSection(withoutRedundantSections,workspace)
  const withoutOldAttackPathDetails=removeMarkdownSectionsByTitle(withCompactConclusion,ATTACK_PATH_DETAIL_SECTION_TITLES)
  const withFriendlyAttackPaths=rewriteAttackPathSection(withoutOldAttackPathDetails,workspace)
  const withAiReview=rewriteAiTriageSection(withFriendlyAttackPaths,workspace)
  const withFormalLabels=normalizeReportSectionLabels(withAiReview)
  return renumberNumberedReportSections(withFormalLabels)
}

function normalizeReportSectionLabels(markdown:string){
  return markdown
    .replace(/^(##\s+)(?:\d+[.、]\s+)?一句话结论\s*$/gm,'$1结论')
    .replace(/^(##\s+)(?:\d+[.、]\s+)?用户该做什么\s*$/gm,'$1处置建议与优先级')
    .replace(/^一句话结论[：:]\s*/gm,'结论：')
    .replace(/^立即建议[：:]\s*/gm,'建议优先执行：')
}

function removeReportAdmonitionBlocks(markdown:string){
  const lines=markdown.split(/\r?\n/)
  const kept:string[]=[]
  let skipping=false

  for(const line of lines){
    const trimmed=line.trim()
    if(/^>\s*\[!(?:CAUTION|WARNING|IMPORTANT|NOTE|TIP)\]/i.test(trimmed)){
      skipping=true
      while(kept.length&&kept[kept.length-1].trim()==='')kept.pop()
      continue
    }

    if(skipping){
      if(trimmed===''||trimmed.startsWith('>'))continue
      skipping=false
    }

    kept.push(line)
  }

  return kept.join('\n').replace(/\n{3,}/g,'\n\n').trimEnd()
}

function rewriteConclusionSection(markdown:string, workspace:SecurityWorkspace){
  const rewritten=buildCompactConclusionSection(workspace)
  const range=findMarkdownSectionRange(markdown,CONCLUSION_SECTION_TITLES)
  if(!range)return insertSectionAfterReportIntro(markdown,rewritten)
  return `${markdown.slice(0,range.start).trimEnd()}\n\n${rewritten}\n\n${markdown.slice(range.end).replace(/^\n+/,'')}`.trimEnd()
}

function buildCompactConclusionSection(workspace:SecurityWorkspace){
  const primaryPath=sortedAttackPaths(workspace)[0]
  const confidence=formatConfidence(primaryPath?.confidence ?? workspace.graph?.summary?.average_path_confidence)
  const riskScore=num(workspace.summary?.risk_score)
  const riskLevel=chineseReportRiskLevel(workspace.summary?.risk_level||'')
  const subject=primaryRiskSubject(workspace)
  const runtime=primaryRuntimeSignal(workspace)
  const priority=reportPriorityLabel(riskScore,riskLevel,primaryPath?.verdict==='likely-real-attack-path'?1:0)
  const runtimePart=runtime&&runtime!=='尚未命中运行期证据'?`，并触达运行期证据 ${runtime}`:''

  return `## 结论

结论：当前证据显示 ${markdownCellText(subject)} 相关风险已串联依赖、构建、产物与运行期线索${markdownCellText(runtimePart)}，综合置信度 ${confidence || 0}%，建议按${markdownCellText(priority)}处置。

## 关键指标

| 指标 | 结果 |
| --- | --- |
| 综合风险 | ${riskScore} / 100 |
| 风险等级 | ${markdownCellText(riskLevel||'-')} |
| 首要风险对象 | ${markdownCellText(subject)} |
| 运行期证据 | ${markdownCellText(runtime)} |
| 处置优先级 | ${markdownCellText(priority)} |`
}

function insertSectionAfterReportIntro(markdown:string,section:string){
  const headings=[...markdown.matchAll(/^##\s+.+?\s*$/gm)]
  if(!headings.length)return `${markdown.trimEnd()}\n\n${section}`.trimEnd()
  const first=headings[0]
  return `${markdown.slice(0,first.index).trimEnd()}\n\n${section}\n\n${markdown.slice(first.index).replace(/^\n+/,'')}`.trimEnd()
}

function removeMarkdownSectionsByTitle(markdown:string,titles:Set<string>){
  const lines=markdown.split(/\r?\n/)
  const kept:string[]=[]
  let skippingLevel=0

  for(const line of lines){
    const heading=parseMarkdownHeading(line)

    if(skippingLevel){
      if(!heading||heading.level>skippingLevel)continue
      skippingLevel=0
    }

    if(heading&&titles.has(heading.title)){
      skippingLevel=heading.level
      while(kept.length&&kept[kept.length-1].trim()==='')kept.pop()
      continue
    }

    kept.push(line)
  }

  return kept.join('\n').replace(/\n{3,}/g,'\n\n').trimEnd()
}

function parseMarkdownHeading(line:string){
  const match=/^(#{1,6})\s+(.+?)\s*$/.exec(line.trim())
  if(!match)return null
  const title=match[2]
    .replace(/^\d+[.、]\s*/,'')
    .replace(/[`*_]/g,'')
    .trim()
  return {level:match[1].length,title}
}

function findMarkdownSectionRange(markdown:string,titles:Set<string>){
  const headings=[...markdown.matchAll(/^(#{1,6})\s+(.+?)\s*$/gm)]
  for(let index=0;index<headings.length;index++){
    const match=headings[index]
    const parsed=parseMarkdownHeading(match[0])
    if(!parsed||!titles.has(parsed.title))continue

    const start=match.index ?? 0
    let end=markdown.length
    for(let nextIndex=index+1;nextIndex<headings.length;nextIndex++){
      const next=headings[nextIndex]
      const nextLevel=next[1].length
      if(nextLevel<=parsed.level){
        end=next.index ?? markdown.length
        break
      }
    }
    return {start,end}
  }
  return null
}

function renumberNumberedReportSections(markdown:string){
  let index=0
  return markdown.replace(/^##\s+(?:\d+[.、]\s+)?(.+?)\s*$/gm,(_match,title)=>`## ${++index}. ${title}`)
}

function primaryRiskSubject(workspace:SecurityWorkspace){
  const dependencyFinding=listOf(workspace.dependency_audit?.findings)[0] as Record<string,unknown>|undefined
  const graphPath=sortedAttackPaths(workspace)[0]
  const fromDependency=textOf(dependencyFinding?.dependency || dependencyFinding?.package || dependencyFinding?.title, '')
  if(fromDependency)return fromDependency
  const fromPath=listOf(graphPath?.path_steps).map((step:any)=>step.source || step.target).find(value=>/npm:|pypi:|@/.test(String(value||'')))
  if(fromPath)return shortAttackPathSubject(fromPath, '依赖风险')
  return workspace.workspace?.repository || workspace.workspace?.name || '当前项目'
}

function primaryRuntimeSignal(workspace:SecurityWorkspace){
  const path=sortedAttackPaths(workspace)[0]
  const runtimeStep=listOf(path?.path_steps).find((step:any)=>/log|runtime|egress|ip|外联|日志|45\./i.test(`${step.source||''} ${step.target||''} ${step.relationship||''}`))
  if(runtimeStep)return `${shortAttackPathSubject(runtimeStep.source,'运行服务')} → ${shortAttackPathSubject(runtimeStep.target,'异常目标')}`
  const finding=listOf(workspace.log_audit?.findings)[0] as Record<string,unknown>|undefined
  const source=textOf(finding?.source,'')
  const target=textOf(finding?.target || finding?.dst_ip || finding?.ip || finding?.signal,'')
  if(source&&target)return `${source} → ${target}`
  const evidence=textOf(finding?.signal || finding?.title || finding?.evidence, '')
  if(evidence)return evidence.length>42?`${evidence.slice(0,40)}...`:evidence
  return '尚未命中运行期证据'
}

function buildEvidenceCoverage(workspace:SecurityWorkspace, stages:ReportPathStage[], riskSources:RiskSourceItem[]):EvidenceCoverageItem[]{
  const sourceValue=(name:string)=>riskSources.find(item=>item.name===name)?.value??0
  const stageHas=(pattern:RegExp)=>stages.some(stage=>pattern.test(`${stage.title} ${stage.source} ${stage.target} ${stage.relationship} ${stage.evidenceGroups.join(' ')}`))
  return [
    {label:'依赖',module:'supply',hit:!!workspace.dependency_audit?.summary||stageHas(/依赖|组件|package|npm:|pypi:/i),count:sourceValue('供应链'),detail:'依赖、SBOM、VEX 和可达性证据'},
    {label:'构建',module:'pipeline',hit:!!workspace.cicd_audit?.summary||stageHas(/CI\/CD|构建|workflow|runner|action/i),count:sourceValue('CI/CD'),detail:'workflow、Action、runner 和构建步骤'},
    {label:'产物',module:'artifact',hit:!!workspace.artifact_trust?.summary||stageHas(/产物|artifact|digest|hash|签名|attestation/i),count:sourceValue('产物可信'),detail:'哈希、签名、provenance 和 attestation'},
    {label:'日志',module:'logs',hit:!!workspace.log_audit?.summary||stageHas(/日志|运行|runtime|egress|外联|ip/i),count:sourceValue('日志印证'),detail:'运行期外联、敏感路径和异常事件'},
    {label:'告警',module:'multimodal',hit:!!workspace.multimodal_audit?.summary||stageHas(/告警|截图|OCR|ASR|多模态/i),count:sourceValue('外部告警'),detail:'截图、语音、告警文本和外部材料'},
    {label:'代码',module:'code',hit:!!workspace.code_audit?.summary||stageHas(/代码|源码|import|call/i),count:sourceValue('代码审查'),detail:'代码引用、入口命中和调用路径'},
  ]
}

function decisionConclusion(workspace:SecurityWorkspace, confidence:number){
  const score=num(workspace.summary?.risk_score)
  const subject=primaryRiskSubject(workspace)
  if(score>=90)return `当前最需要先处理的是 ${subject} 相关链路。风险已经达到严重级别，并且已有多类证据指向供应链攻击路径。`
  if(score>=75)return `${subject} 相关链路风险较高，建议先复核依赖来源、构建环境和产物可信证据。`
  return `当前风险处于可研判状态，建议先补齐关键证据，再确认是否需要阻断发布。置信度约 ${confidence}%。`
}

function _ReportDecisionDashboard({
  workspace,
  stages,
  actionItems,
  riskSources,
  breakpoints,
  ready: _ready,
  onOpenModule,
}:{
  workspace:SecurityWorkspace
  stages:ReportPathStage[]
  actionItems:ReportActionItem[]
  riskSources:RiskSourceItem[]
  breakpoints:ReportTrustBreakpoint[]
  ready:boolean
  onOpenModule?:(module:PlatformTab)=>void
}){
  const primaryPath=sortedAttackPaths(workspace)[0]
  const confidence=formatConfidence(primaryPath?.confidence ?? workspace.graph?.summary?.average_path_confidence)
  const coverage=buildEvidenceCoverage(workspace,stages,riskSources)

  return(
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
      <Card className="surface-raised overflow-hidden border-cyan-400/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-black"><ShieldAlert className="size-4 text-red-400"/>先看结论</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-xl border border-red-400/25 bg-red-950/15 p-5">
            <div className="text-lg font-black leading-relaxed text-foreground">{decisionConclusion(workspace,confidence)}</div>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">建议先处理能阻断攻击链的动作，再进入下方证据和 Markdown 详情复核。</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-5">
        <Card className="surface-raised border-cyan-400/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-black"><ClipboardList className="size-4 text-cyan-400"/>证据支撑</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {coverage.map(item=>(
                <button key={item.label} type="button" onClick={()=>onOpenModule?.(item.module)} className={cn('rounded-lg border p-3 text-left transition hover:-translate-y-0.5',item.hit?'border-cyan-400/25 bg-cyan-950/10':'border-border/70 bg-[color:var(--surface-inset)] opacity-75')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-foreground">{item.label}</span>
                    <Badge variant="outline" className={cn('text-[10px]',item.hit?'border-emerald-400/30 text-emerald-300':'border-amber-400/30 text-amber-300')}>{item.hit?'已命中':'待补充'}</Badge>
                  </div>
                  <div className="mt-2 text-xl font-black text-cyan-200">{item.count}</div>
                  <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{item.detail}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="surface-raised border-orange-400/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-black"><PackageCheck className="size-4 text-orange-400"/>建议先做</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(actionItems.length?actionItems:[{priority:'中优先级',title:'补齐证据后复扫',detail:'补充依赖、CI/CD、产物和日志材料后，再确认攻击链是否成立。',tone:'cyan'} as ReportActionItem]).slice(0,5).map((item,index)=>(
              <div key={`${item.title}-${index}`} className="flex gap-3 rounded-lg border border-border/60 bg-[color:var(--surface-inset)] p-3">
                <div className={cn('grid size-7 shrink-0 place-items-center rounded-md text-xs font-black',item.tone==='red'?'bg-red-500/15 text-red-300':item.tone==='orange'?'bg-orange-500/15 text-orange-300':'bg-cyan-500/15 text-cyan-300')}>{index+1}</div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-foreground">{item.title}</span>
                    <Badge variant="outline" className="text-[10px]">{item.priority}</Badge>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>
                </div>
              </div>
            ))}
            {breakpoints.length?<div className="pt-1 text-[11px] text-muted-foreground">已识别 {breakpoints.length} 个可信断点，建议同步复核产物和构建策略。</div>:null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

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

/* ══ Risk Ring — with glow aura ══ */
function RiskRing({score,level:_level,ready}:{score:number;level:string;ready:boolean}){
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
function _GlowBar(props:any){
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
function _StageCard({stage,index,ready,onClick}:{stage:ReportPathStage;index:number;ready:boolean;onClick:()=>void}){
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

/* 攻击节点详情抽屉 */
function _StageDrawer({stage,open,onClose}:{stage:ReportPathStage|null;open:boolean;onClose:()=>void}){
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

function _RiskDetailDrawer({source,detail,open,onClose}:{source:RiskSourceItem|null;detail:RiskSourceDetail|null;open:boolean;onClose:()=>void}){
  if(!source||!detail)return null
  return(
    <Sheet open={open} onOpenChange={v=>{if(!v)onClose()}}>
      <SheetContent side="right" className="!w-[42vw] !max-w-[620px] overflow-y-auto p-0">
        <div className="border-b border-border/50 px-7 py-5">
          <SheetHeader><SheetTitle className="text-lg font-black tracking-tight">风险详情</SheetTitle></SheetHeader>
          <p className="mt-2 text-xs text-muted-foreground">来自 {source.name} 的风险信号，点击标题列表可切换查看。</p>
        </div>
        <div className="space-y-5 px-7 py-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">风险来源</div>
              <div className="rounded-lg surface-inset p-3 text-sm font-bold">{source.name}</div>
            </div>
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">风险等级</div>
              <div className="rounded-lg surface-inset p-3"><Badge variant="outline" className={cn('text-xs',severityBadgeClass(detail.severity))}>{severityLabel(detail.severity)}</Badge></div>
            </div>
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">信号总数</div>
              <div className="rounded-lg surface-inset p-3 text-sm font-bold">{source.value} 个</div>
            </div>
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">当前标题</div>
              <div className="rounded-lg surface-inset p-3 text-sm font-bold break-words [overflow-wrap:anywhere]">{detail.title}</div>
            </div>
          </div>
          <div className="rounded-xl border border-border/40 bg-[color:var(--surface-panel)] p-5">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">证据详情</div>
            <EvidenceDetailView evidence={detail.evidence}/>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function EvidenceDetailView({evidence}:{evidence:string}){
  const parsed=parseEvidenceDetail(evidence)
  if(!evidence)return <p className="text-sm text-muted-foreground">暂无证据详情</p>
  return(
    <div className="space-y-4">
      {parsed.subject&&(
        <div className="rounded-lg surface-inset p-3">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">主体信息</div>
          <p className="max-w-full break-words text-sm font-bold text-foreground [overflow-wrap:anywhere]">{parsed.subject}</p>
        </div>
      )}
      {parsed.files.length>0&&(
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">关联文件</div>
          <div className="flex flex-wrap gap-2">
            {parsed.files.map(file=><code key={file} className="rounded-md bg-muted/40 px-2 py-1 text-xs font-semibold text-cyan-700 dark:text-cyan-200">{file}</code>)}
          </div>
        </div>
      )}
      {parsed.osv.length>0&&(
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">漏洞编号 OSV</div>
            <Badge variant="outline" className="text-[10px]">{parsed.osv.length} 个</Badge>
          </div>
          <div className="grid max-h-44 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {parsed.osv.map(id=><code key={id} className="rounded-md border border-red-500/15 bg-red-500/5 px-2 py-1 text-xs font-semibold text-red-500">{id}</code>)}
          </div>
        </div>
      )}
      {parsed.signals.length>0&&(
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">行为与状态信号</div>
          <div className="flex flex-wrap gap-2">
            {parsed.signals.map(signal=><span key={signal} className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-300">{signal}</span>)}
          </div>
        </div>
      )}
      {parsed.other.length>0&&(
        <div className="rounded-lg surface-inset p-3">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">其它证据</div>
          <div className="space-y-1">
            {parsed.other.map(item=><p key={item} className="max-w-full break-words text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{highlightEvidenceText(item)}</p>)}
          </div>
        </div>
      )}
    </div>
  )
}

function parseEvidenceDetail(evidence:string){
  const parts=evidence.split(/[;；]/).map(item=>item.trim()).filter(Boolean)
  const osv:string[]=[]
  const files:string[]=[]
  const signals:string[]=[]
  const other:string[]=[]
  let subject=''

  for(const part of parts){
    const osvMatches=[...part.matchAll(/GHSA-[a-z0-9-]+/gi)].map(match=>match[0])
    if(osvMatches.length){
      osv.push(...osvMatches)
      const rest=part.replace(/OSV:\s*/gi,'').replace(/GHSA-[a-z0-9-]+/gi,'').replace(/[,\s]+$/,'').trim()
      if(rest&&!/^OSV:?$/i.test(rest))other.push(rest)
      continue
    }
    if(/\.(json|lock|txt|ya?ml|toml|py|ts|tsx|js|jsx)$/i.test(part)||/[\\/]/.test(part)){
      if(!subject&&/@/.test(part)){
        const [first,...rest]=part.split(/\s*·\s*|\s+-\s+|\s*,\s*/)
        subject=first.trim()
        files.push(...rest.map(item=>item.trim()).filter(Boolean))
      }else{
        files.push(part)
      }
      continue
    }
    if(/reachable|attack surface|VEX|affected|not_affected|under_investigation|fixed|exact version|transitive|install script|postinstall|digest|runner|builder|signature|provenance/i.test(part)){
      signals.push(part)
      continue
    }
    if(!subject&&/@/.test(part))subject=part
    else other.push(part)
  }

  return {
    subject,
    files:[...new Set(files)].slice(0,8),
    osv:[...new Set(osv)].slice(0,80),
    signals:[...new Set(signals)].slice(0,12),
    other:[...new Set(other)].slice(0,8),
  }
}

function highlightEvidenceText(text:string){
  const parts=text.split(/(GHSA-[a-z0-9-]+|VEX|reachable|affected|fixed|digest|runner|builder|signature|provenance)/gi).filter(Boolean)
  return parts.map((part,index)=>{
    if(/^(GHSA-|VEX$|reachable$|affected$|fixed$|digest$|runner$|builder$|signature$|provenance$)/i.test(part)){
      return <strong key={index} className="font-bold text-foreground">{part}</strong>
    }
    return part
  })
}

type ReportMarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; rows: string[][] }
  | { type: 'code'; language: string; code: string }
  | { type: 'quote'; text: string }
  | { type: 'details'; summary: string; content: string }
  | { type: 'rule' }

function ReportMarkdownPreview({text,search}:{text:string;search:string}){
  const blocks=useMemo(()=>parseReportMarkdown(text),[text])
  const needle=search.trim().toLowerCase()
  const visibleBlocks=needle?blocks.filter(block=>markdownBlockText(block).toLowerCase().includes(needle)):blocks
  return(
    <div className="space-y-4">
      {visibleBlocks.length?visibleBlocks.map((block,index)=><ReportMarkdownBlockView key={index} block={block}/>):(
        <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">没有匹配的报告内容。</div>
      )}
    </div>
  )
}

function ReportMarkdownBlockView({block}:{block:ReportMarkdownBlock}){
  if(block.type==='heading'){
    const Tag=(block.level<=1?'h2':block.level===2?'h3':'h4') as 'h2'|'h3'|'h4'
    return <Tag className={cn('font-black tracking-tight text-foreground',block.level<=1?'text-2xl':block.level===2?'text-lg':'text-base')}>{renderReportInlineMarkdown(block.text)}</Tag>
  }
  if(block.type==='quote'){
    return (
      <div className="rounded-xl border border-red-500/25 bg-red-950/20 p-4 text-sm leading-7 text-red-100">
        <div className="mb-2 flex items-center gap-2 text-sm font-black text-red-200">
          <AlertTriangle className="size-4" />
          风险提示
        </div>
        <div className="text-red-100/85">{renderReportInlineMarkdown(block.text || '当前报告面向供应链攻击检测与溯源研判，请优先处理最高风险链路，再展开后续证据复核。')}</div>
      </div>
    )
  }
  if(block.type==='list'){
    return(
      <div className="space-y-2">
        {block.items.map((item,index)=>(
          <div key={`${item}-${index}`} className="flex gap-2 rounded-lg bg-[color:var(--surface-inset)] px-3 py-2 text-sm leading-6">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-cyan-500"/>
            <span>{renderReportInlineMarkdown(item)}</span>
          </div>
        ))}
      </div>
    )
  }
  if(block.type==='table'){
    const [head,...body]=block.rows
    return(
      <div className="overflow-x-auto rounded-xl border border-border bg-[color:var(--surface-card)]">
        <table className="w-full min-w-[620px] text-sm">
          {head&&(
            <thead>
              <tr className="border-b border-border bg-[color:var(--surface-inset)]">
                {head.map((cell,index)=><th key={index} className="px-3 py-2.5 text-left text-xs font-bold text-muted-foreground">{renderReportInlineMarkdown(cell)}</th>)}
              </tr>
            </thead>
          )}
          <tbody>
            {body.map((row,rowIndex)=>(
              <tr key={rowIndex} className="border-b border-border/40 last:border-0">
                {row.map((cell,index)=><td key={index} className="px-3 py-2.5 align-top text-xs leading-6 text-muted-foreground">{renderReportInlineMarkdown(cell)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  if(block.type==='code'){
    if(block.language.trim().toLowerCase()==='mermaid')return <MermaidDiagram code={block.code}/>
    return(
      <div className="overflow-hidden rounded-xl border border-border bg-slate-950">
        <div className="border-b border-white/10 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-cyan-300">{block.language||'code'}</div>
        <pre className="max-h-[420px] overflow-auto p-4 text-xs leading-6 text-slate-200">{block.code}</pre>
      </div>
    )
  }
  if(block.type==='details'){
    return(
      <details className="rounded-xl border border-border bg-[color:var(--surface-card)] p-4">
        <summary className="cursor-pointer text-sm font-bold text-foreground">{block.summary}</summary>
        <div className="mt-4 border-t border-border pt-4">
          <ReportMarkdownPreview text={block.content} search=""/>
        </div>
      </details>
    )
  }
  if(block.type==='rule')return <div className="h-px bg-border"/>
  return <p className="text-sm leading-7 text-muted-foreground">{renderReportInlineMarkdown(block.text)}</p>
}

function MermaidDiagram({code}:{code:string}){
  const idRef=useRef(`sg-mermaid-${Math.random().toString(36).slice(2)}`)
  const scrollerRef=useRef<HTMLDivElement|null>(null)
  const dragRef=useRef({down:false,startX:0,scrollLeft:0})
  const [svg,setSvg]=useState('')
  const [error,setError]=useState('')

  useEffect(()=>{
    let alive=true
    setSvg('')
    setError('')
    ;(async()=>{
      try{
        const mermaidModule=await import('mermaid')
        const mermaid=mermaidModule.default
        mermaid.initialize({
          startOnLoad:false,
          securityLevel:'strict',
          theme:'base',
          themeVariables:{
            background:'transparent',
            primaryColor:'#e0f2fe',
            primaryTextColor:'#0f172a',
            primaryBorderColor:'#0891b2',
            lineColor:'#0891b2',
            secondaryColor:'#ecfeff',
            tertiaryColor:'#f8fafc',
            fontFamily:'Inter, ui-sans-serif, system-ui, sans-serif',
          },
        })
        const result=await mermaid.render(`${idRef.current}-${Date.now()}`,code)
        if(alive)setSvg(result.svg)
      }catch(e){
        if(alive)setError(e instanceof Error?e.message:'Mermaid 图渲染失败')
      }
    })()
    return()=>{alive=false}
  },[code])

  if(error){
    return(
      <div className="overflow-hidden rounded-xl border border-amber-500/30 bg-amber-500/5">
        <div className="border-b border-amber-500/20 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-amber-600">Mermaid 渲染失败</div>
        <div className="p-4 text-xs leading-6 text-amber-700 dark:text-amber-200">{error}</div>
        <pre className="max-h-[320px] overflow-auto border-t border-amber-500/20 p-4 text-xs leading-6 text-muted-foreground">{code}</pre>
      </div>
    )
  }

  return(
    <div
      ref={scrollerRef}
      className="cursor-grab overflow-x-auto rounded-xl border border-cyan-500/20 bg-white p-4 shadow-sm active:cursor-grabbing"
      onMouseDown={(event)=>{
        const el=scrollerRef.current
        if(!el)return
        dragRef.current={down:true,startX:event.pageX-el.offsetLeft,scrollLeft:el.scrollLeft}
      }}
      onMouseLeave={()=>{dragRef.current.down=false}}
      onMouseUp={()=>{dragRef.current.down=false}}
      onMouseMove={(event)=>{
        const el=scrollerRef.current
        if(!el||!dragRef.current.down)return
        event.preventDefault()
        const x=event.pageX-el.offsetLeft
        el.scrollLeft=dragRef.current.scrollLeft-(x-dragRef.current.startX)
      }}
    >
      {svg?(
        <div className="min-w-[760px] select-none [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-none" dangerouslySetInnerHTML={{__html:svg}}/>
      ):(
        <div className="flex h-36 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin"/>正在渲染 Mermaid 图...
        </div>
      )}
    </div>
  )
}

function parseReportMarkdown(markdown:string):ReportMarkdownBlock[]{
  const lines=markdown.split(/\r?\n/)
  const blocks:ReportMarkdownBlock[]=[]
  let index=0
  let listItems:string[]=[]

  const flushList=()=>{if(listItems.length){blocks.push({type:'list',items:listItems});listItems=[]}}

  while(index<lines.length){
    const raw=lines[index]
    const line=raw.trim()
    if(!line){flushList();index++;continue}

    if(line.startsWith('<details>')){
      flushList()
      const detailLines:string[]=[]
      let summary='展开详情'
      index++
      while(index<lines.length&&!lines[index].trim().startsWith('</details>')){
        const current=lines[index].trim()
        const summaryMatch=current.match(/^<summary>(.*)<\/summary>$/)
        if(summaryMatch)summary=summaryMatch[1]
        else detailLines.push(lines[index])
        index++
      }
      blocks.push({type:'details',summary,content:detailLines.join('\n').trim()})
      index++
      continue
    }

    if(line.startsWith('```')){
      flushList()
      const language=line.replace(/^```/,'').trim()
      const codeLines:string[]=[]
      index++
      while(index<lines.length&&!lines[index].trim().startsWith('```')){
        codeLines.push(lines[index])
        index++
      }
      blocks.push({type:'code',language,code:codeLines.join('\n')})
      index++
      continue
    }

    if(line.startsWith('|')&&line.endsWith('|')){
      flushList()
      const tableLines:string[]=[]
      while(index<lines.length&&lines[index].trim().startsWith('|')&&lines[index].trim().endsWith('|')){
        tableLines.push(lines[index].trim())
        index++
      }
      const rows=tableLines
        .filter(item=>!/^\|\s*-+/.test(item))
        .map(item=>item.slice(1,-1).split('|').map(cell=>cell.trim()))
      if(rows.length)blocks.push({type:'table',rows})
      continue
    }

    if(/^#{1,4}\s+/.test(line)){
      flushList()
      const match=line.match(/^(#{1,4})\s+(.*)$/)
      blocks.push({type:'heading',level:match?.[1].length||2,text:match?.[2]||line})
      index++
      continue
    }

    if(line.startsWith('>')){
      flushList()
      const quoteLines:string[]=[]
      while(index<lines.length&&lines[index].trim().startsWith('>')){
        quoteLines.push(lines[index].trim().replace(/^>\s?/,'').trim())
        index++
      }
      const cleaned=quoteLines
        .filter((item,index)=>!(index===0&&/^\[!(CAUTION|WARNING|IMPORTANT|NOTE|TIP)\]$/i.test(item)))
        .join(' ')
        .trim()
      blocks.push({type:'quote',text:cleaned})
      continue
    }

    if(/^-{3,}$/.test(line)){
      flushList()
      blocks.push({type:'rule'})
      index++
      continue
    }

    const listMatch=line.match(/^(?:[-*]|\d+\.)\s+(.*)$/)
    if(listMatch){
      listItems.push(listMatch[1])
      index++
      continue
    }

    flushList()
    const paragraph=[line]
    index++
    while(index<lines.length){
      const next=lines[index].trim()
      if(!next||next.startsWith('#')||next.startsWith('|')||next.startsWith('```')||next.startsWith('>')||next.startsWith('<details>')||/^(?:[-*]|\d+\.)\s+/.test(next))break
      paragraph.push(next)
      index++
    }
    blocks.push({type:'paragraph',text:paragraph.join(' ')})
  }
  flushList()
  return blocks
}

function markdownBlockText(block:ReportMarkdownBlock):string{
  if(block.type==='list')return block.items.join(' ')
  if(block.type==='table')return block.rows.flat().join(' ')
  if(block.type==='code')return block.code
  if(block.type==='details')return `${block.summary} ${block.content}`
  if(block.type==='rule')return ''
  return block.text
}

function renderReportInlineMarkdown(text:string){
  const parts=text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean)
  return parts.map((part,index)=>{
    if(part.startsWith('`')&&part.endsWith('`'))return <code key={index} className="rounded bg-muted/50 px-1.5 py-0.5 text-xs font-semibold text-cyan-700 dark:text-cyan-200">{part.slice(1,-1)}</code>
    if(part.startsWith('**')&&part.endsWith('**'))return <strong key={index} className="font-bold text-foreground">{part.slice(2,-2)}</strong>
    return <span key={index}>{part}</span>
  })
}

function _normalizeReportMarkdown(markdown:string, workspace:SecurityWorkspace){
  const withCompactSummary=replaceRiskSummarySection(markdown,workspace)
  const withoutPathJudgement=removePathJudgementSection(withCompactSummary)
  const withPathOverview=rewriteAttackPathSection(withoutPathJudgement,workspace)
  const withAiTriage=rewriteAiTriageSection(withPathOverview,workspace)
  const withoutAppendix=removeReportAppendixSection(withAiTriage)
  return localizeReportMarkdownLabels(withoutAppendix)
}

function replaceRiskSummarySection(markdown:string, workspace:SecurityWorkspace){
  const headingMatch=/^## 风险摘要\s*$/m.exec(markdown)
  if(!headingMatch)return markdown

  const sectionStart=headingMatch.index
  const contentStart=sectionStart+headingMatch[0].length
  const tail=markdown.slice(contentStart)
  const nextHeading=/\n##\s+/.exec(tail)
  const sectionEnd=nextHeading?contentStart+nextHeading.index:markdown.length
  const compactSummary=buildCompactRiskSummary(markdown,workspace)

  return `${markdown.slice(0,sectionStart)}## 风险摘要\n\n${compactSummary}\n${markdown.slice(sectionEnd)}`
}

function buildCompactRiskSummary(markdown:string, workspace:SecurityWorkspace){
  const block=extractRiskSummaryBlock(markdown)
  const riskScore=firstNumber(
    parseFirstNumber(readRiskSummaryValue(block,['综合风险','综合风险评分'])),
    workspace.summary?.risk_score,
  )
  const rawRiskLevel=readRiskSummaryValue(block,['风险等级'])||workspace.summary?.risk_level||''
  const riskLevel=chineseReportRiskLevel(rawRiskLevel)
  const highRealPathCount=firstNumber(
    parseFirstNumber(readRiskSummaryValue(block,['高可信真实路径','高度可信真实路径'])),
    workspace.graph?.summary?.real_attack_path_count,
    workspace.graph?.summary?.path_verdicts?.['likely-real-attack-path'],
  )
  const priority=reportPriorityLabel(riskScore,riskLevel,highRealPathCount)

  return `| 指标 | 结果 |
| --- | --- |
| 综合风险 | ${riskScore} / 100 |
| 风险等级 | ${riskLevel} |
| 高可信真实路径 | ${highRealPathCount} 条 |
| 处置优先级 | ${priority} |`
}

function removePathJudgementSection(markdown:string){
  const headingMatch=/^## 路径判定\s*$/m.exec(markdown)
  if(!headingMatch)return markdown
  const sectionStart=headingMatch.index
  const contentStart=sectionStart+headingMatch[0].length
  const tail=markdown.slice(contentStart)
  const nextHeading=/\n##\s+/.exec(tail)
  const sectionEnd=nextHeading?contentStart+nextHeading.index:markdown.length
  return `${markdown.slice(0,sectionStart).trimEnd()}\n\n${markdown.slice(sectionEnd).replace(/^\n+/,'')}`
}

function removeReportAppendixSection(markdown:string){
  const topLevel=/^## 附录\s*$/m.exec(markdown)
  if(topLevel){
    return markdown.slice(0,topLevel.index).trimEnd()
  }

  const nested=/^### 附录\s*$/m.exec(markdown)
  if(!nested)return markdown
  const sectionStart=nested.index
  const contentStart=sectionStart+nested[0].length
  const tail=markdown.slice(contentStart)
  const nextHeading=/\n#{1,3}\s+/.exec(tail)
  const sectionEnd=nextHeading?contentStart+nextHeading.index:markdown.length
  return `${markdown.slice(0,sectionStart).trimEnd()}\n\n${markdown.slice(sectionEnd).replace(/^\n+/,'')}`.trimEnd()
}

function rewriteAiTriageSection(markdown:string, workspace:SecurityWorkspace){
  const headingMatch=/^##\s*(?:\d+\.\s*)?(?:GraphRAG\s*\/\s*GNN\s*(?:风险增强|辅助研判)|AI 辅助研判|AI 引入风险复核)\s*$/m.exec(markdown)
  if(!headingMatch)return markdown
  const sectionStart=headingMatch.index
  const contentStart=sectionStart+headingMatch[0].length
  const tail=markdown.slice(contentStart)
  const nextHeading=/\n##\s+/.exec(tail)
  const sectionEnd=nextHeading?contentStart+nextHeading.index:markdown.length
  const replacement=buildAiTriageSection(workspace)
  return `${markdown.slice(0,sectionStart)}${replacement}\n\n${markdown.slice(sectionEnd).replace(/^\n+/,'')}`
}

function buildAiTriageSection(workspace:SecurityWorkspace){
  const candidates=getAiReviewCandidates(workspace)
  const conclusion=candidates.length
    ? `当前未发现可直接证明由 AI 生成或推荐导致的攻击证据，但有 ${candidates.length} 个可疑对象需要复核来源、版本和安装脚本。`
    : '当前未发现可直接证明由 AI 生成或推荐导致的攻击证据，也未识别出需要优先复核的 AI 引入对象。'
  const rows=candidates.map(item=>`| ${markdownCellText(item.label)} | ${markdownCellText(aiTriageConcern(item))} | ${markdownCellText(aiTriageAdvice(item))} |`).join('\n')
  return `## AI 引入风险复核

结论：${conclusion}${rows?`

| 复核对象 | 风险关注点 | 建议动作 |
| --- | --- | --- |
${rows}`:''}`
}

function getAiReviewCandidates(workspace:SecurityWorkspace){
  const seen=new Set<string>()
  const candidates:Array<{label:string;score:number}>=[]
  for(const item of getGnnCandidateNodes(workspace)){
    const key=item.label.trim().toLowerCase()
    if(!key||seen.has(key))continue
    seen.add(key)
    candidates.push(item)
    if(candidates.length>=3)break
  }
  return candidates
}

function aiTriageConcern(item:{label:string;score:number}){
  const label=item.label.toLowerCase()
  if(/build-agent|builder|runner|workflow|ci/.test(label))return '构建相关对象，可能影响产物生成或发布链路'
  if(/codec|serialize|parser|json|yaml/.test(label))return '解析或编解码相关依赖，需确认是否参与敏感路径'
  if(/npm:|pypi:|@/.test(label))return '第三方依赖来源不明，需确认引入方式和安装脚本'
  if(item.score>=0.75)return '图谱排序靠前，建议确认是否与当前攻击链有关'
  return '可疑度较低，但建议结合引入记录做来源复核'
}

function getGnnCandidateNodes(workspace:SecurityWorkspace){
  const nodes=workspace.graph?.nodes??[]
  return nodes
    .map(node=>{
      const properties=((node.properties?.properties&&typeof node.properties.properties==='object')?node.properties.properties:node.properties) as Record<string,unknown>|undefined
      const score=Number(properties?.gnn_score)
      return {
        label:String(node.label||node.id||'-'),
        score:Number.isFinite(score)?score:0,
      }
    })
    .filter(item=>item.score>0)
    .sort((a,b)=>b.score-a.score)
}

function aiTriageAdvice(item:{label:string;score:number}){
  const label=item.label.toLowerCase()
  if(/build-agent|builder|runner|workflow|ci/.test(label))return '复核来源、版本、安装脚本和是否由 AI 推荐引入'
  if(/codec|serialize|parser|json|yaml/.test(label))return '检查调用位置、锁定版本，并确认是否参与敏感路径'
  if(/npm:|pypi:|@/.test(label))return '检查依赖来源、锁定版本和可达调用路径'
  if(item.score>=0.75)return '作为高风险对象优先排查'
  return '低优先级复核，结合实际证据判断'
}

function rewriteAttackPathSection(markdown:string, workspace:SecurityWorkspace){
  const rewritten=buildAttackPathSection(workspace)
  if(!rewritten)return markdown
  const range=findMarkdownSectionRange(markdown,ATTACK_PATH_OVERVIEW_SECTION_TITLES)
  if(!range)return `${markdown.trimEnd()}\n\n${rewritten}`
  return `${markdown.slice(0,range.start).trimEnd()}\n\n${rewritten}\n\n${markdown.slice(range.end).replace(/^\n+/,'')}`.trimEnd()
}

function buildAttackPathSection(workspace:SecurityWorkspace){
  const paths=getSortedAttackPaths(workspace)
  if(!paths.length)return ''
  return `## 攻击路径

${paths.map((path,index)=>buildFriendlyAttackPathCard(path,index)).join('\n\n')}`
}

function buildFriendlyAttackPathCard(path:NonNullable<SecurityWorkspace['graph']>['attack_paths'][number], index:number){
  const confidence=formatConfidence(path.confidence)
  const conclusion=friendlyAttackPathConclusion(path,confidence)
  const mermaid=buildCompactMermaid(path,index)
  const priority=reportPriorityLabel(path.score??0,chineseReportRiskLevel(path.severity||''),path.verdict==='likely-real-attack-path'?1:0)
  const impact=summarizeImpactAssets(path)
  const evidenceRows=buildEvidenceMatrixRows(path)
  const detailRows=buildAttackPathDetailRows(path)
  const actions=buildActionList(path)
  return `### ${index+1}. ${friendlyAttackPathTitle(path,index)}

**结论：** ${markdownCellText(conclusion)}

| 关键信息 | 结果 |
| --- | --- |
| 置信度 | ${confidence}% |
| 严重等级 | ${markdownCellText(chineseReportRiskLevel(path.severity||''))} |
| 修复优先级 | ${markdownCellText(priority)} |
| 影响对象 | ${markdownCellText(impact)} |

\`\`\`mermaid
${mermaid}
\`\`\`

**攻击链路详情**

| 顺序 | 阶段 | 关键对象 | 说明 | 状态 |
| ---: | --- | --- | --- | --- |
${detailRows.map(row=>`| ${row.map(markdownCellText).join(' | ')} |`).join('\n')}

**证据矩阵**

| 阶段 | 关键证据 | 状态 |
| --- | --- | --- |
${evidenceRows.map(row=>`| ${row.map(markdownCellText).join(' | ')} |`).join('\n')}

**优先动作**

| 优先级 | 动作 | 目的 |
| --- | --- | --- |
${actions.map((item,actionIndex)=>`| ${actionIndex===0?'最高':actionIndex<3?'高':'中'} | ${markdownCellText(item)} | ${markdownCellText(actionPurpose(item))} |`).join('\n')}`
}

function friendlyAttackPathTitle(path:NonNullable<SecurityWorkspace['graph']>['attack_paths'][number], index:number){
  const title=String(path.title||'').trim()
  if(/多模态|外部告警|OCR|ASR/i.test(title))return '发现一条外部告警印证的供应链攻击链路'
  if(/供应链投毒|likely-real|真实攻击|证据可串成/i.test(`${title} ${path.verdict||''}`))return '发现一条高可信供应链攻击链路'
  if(/构建|provenance|attestation|完整性/i.test(`${title} ${path.verdict||''}`))return '发现一条构建/产物可信风险链路'
  if(/运行期|日志|外联|runtime/i.test(`${title} ${path.verdict||''}`))return '发现一条运行期触达风险链路'
  if(title&&!/证据可串成|路径$/i.test(title))return title
  return index===0?'发现一条高可信供应链攻击链路':`供应链风险链路 ${index+1}`
}

function friendlyAttackPathConclusion(path:NonNullable<SecurityWorkspace['graph']>['attack_paths'][number], confidence:number){
  const impact=summarizeImpactAssets(path)
  const priority=reportPriorityLabel(path.score??0,chineseReportRiskLevel(path.severity||''),path.verdict==='likely-real-attack-path'?1:0)
  const runtimeTouched=hasPathKind(path,/runtime|log|egress|ip|外联|运行|日志/)
  const artifactTouched=hasPathKind(path,/artifact|attestation|digest|hash|产物|签名/)
  const buildTouched=hasPathKind(path,/workflow|runner|ci|action|build|构建/)
  const parts=[
    hasPathKind(path,/dependency|package|npm:|pypi:|依赖/)?'依赖入口':null,
    buildTouched?'构建环境':null,
    artifactTouched?'产物可信':null,
    runtimeTouched?'运行期行为':null,
  ].filter(Boolean).join('、')
  const scope=parts||'关键证据'
  return `当前证据支持“${impact}”这条风险链路，已覆盖${scope}，可信度 ${confidence}%。建议按${priority}处理，先阻断可执行影响，再复核技术细节。`
}

function summarizeImpactAssets(path:NonNullable<SecurityWorkspace['graph']>['attack_paths'][number]){
  const nodes=compactPathNodes(path).map(item=>item.subject).filter(Boolean)
  if(!nodes.length)return '待确认'
  return nodes.slice(0,6).join(' → ')
}

function buildEvidenceMatrixRows(path:NonNullable<SecurityWorkspace['graph']>['attack_paths'][number]){
  const nodes=compactPathNodes(path)
  const steps=path.path_steps??[]
  const rows:Array<[string,string,string]>=[]
  const push=(stage:string,evidence:string,status:string)=>{
    if(rows.some(row=>row[0]===stage&&row[1]===evidence))return
    rows.push([stage,evidence,status])
  }

  for(const node of nodes){
    if(/依赖|入口|package|npm|pypi/i.test(`${node.stage} ${node.subject}`))push('依赖入口',`${node.subject} 已进入风险链路`,'已确认')
    else if(/构建|CI|runner|workflow|Action/i.test(`${node.stage} ${node.subject}`))push('构建环境',`${node.subject} 可影响构建产物`,'需加固')
    else if(/产物|artifact|tar|zip|hash|digest/i.test(`${node.stage} ${node.subject}`))push('产物可信',`${node.subject} 需要校验哈希和 provenance`,'需复核')
    else if(/日志|运行|runtime|ip|外联|service/i.test(`${node.stage} ${node.subject}`))push('运行期',`${node.subject} 命中运行期证据`,'已确认')
  }

  for(const step of steps){
    const text=`${step.source||''} ${step.relationship||''} ${step.target||''} ${step.why_abusable||''}`
    if(/digest|hash|attestation|provenance|subject/i.test(text))push('产物可信','产物哈希、签名或来源证明需要复核','需复核')
    if(/egress|外联|log|日志|runtime|45\./i.test(text))push('运行期','运行日志出现外联或敏感行为证据','已确认')
    if(/runner|workflow|Action|self-hosted|构建/i.test(text))push('构建环境','构建环境或 Runner 可信度需要加固','需加固')
    if(/dependency|package|npm:|pypi:|依赖/i.test(text))push('依赖入口','依赖节点与攻击链路存在关联','已确认')
  }

  if(!rows.length)push('证据链路','当前路径需要结合依赖、构建、产物和日志材料复核','待补充')
  return rows.slice(0,6)
}

function buildAttackPathDetailRows(path:NonNullable<SecurityWorkspace['graph']>['attack_paths'][number]){
  const steps=path.path_steps??[]
  const rows:Array<[string,string,string,string,string]>=[]

  if(steps.length){
    steps.slice(0,7).forEach((step,index)=>{
      const source=shortAttackPathSubject(step.source,'起点')
      const target=shortAttackPathSubject(step.target,'目标')
      const stage=attackPathNodeLabel(step.target_type)||attackPathNodeLabel(step.source_type)||attackPathNodeLabel(step.target)||attackPathNodeLabel(step.source)||'链路节点'
      rows.push([
        `${index+1}`,
        stage,
        `${source} → ${target}`,
        attackPathStepSummary(step),
        attackPathStepStatus(step),
      ])
    })
  }

  if(!rows.length){
    compactPathNodes(path).slice(0,7).forEach((node,index)=>{
      rows.push([`${index+1}`,node.stage,node.subject,'该节点参与当前风险链路，需要结合上下游证据复核。','待复核'])
    })
  }

  return rows.length?rows:[['1','证据链路','待确认','当前路径需要补充依赖、构建、产物或日志证据后再判断。','待补充']]
}

function attackPathStepSummary(step:{source?:string;target?:string;source_type?:string;target_type?:string;relationship?:string;why_abusable?:string}){
  const text=`${step.source||''} ${step.relationship||''} ${step.target||''} ${step.why_abusable||''}`
  if(/digest|hash|attestation|provenance|subject/i.test(text))return '用于判断产物哈希、签名或来源证明是否可信。'
  if(/egress|外联|log|日志|runtime|45\./i.test(text))return '用于确认构建期风险是否已经在运行期触发。'
  if(/runner|workflow|Action|self-hosted|构建/i.test(text))return '用于确认构建环境是否可能影响最终产物。'
  if(/dependency|package|npm:|pypi:|依赖/i.test(text))return '用于确认风险是否从依赖入口进入工程链路。'
  return '用于串联上下游证据，帮助判断攻击链是否成立。'
}

function attackPathStepStatus(step:{source?:string;target?:string;relationship?:string;why_abusable?:string}){
  const text=`${step.source||''} ${step.relationship||''} ${step.target||''} ${step.why_abusable||''}`.toLowerCase()
  if(/fail|不一致|缺失|blocks proof|self-hosted/.test(text))return '需优先处理'
  if(/warn|needs|attestation|provenance|启发式/.test(text))return '需复核'
  if(/observed|log|日志|runtime|egress|外联/.test(text))return '已命中'
  return '已关联'
}

function actionPurpose(action:string){
  if(/隔离|阻断|回滚|封禁/.test(action))return '先阻断可执行影响，避免风险继续扩散。'
  if(/Runner|runner|构建|workflow|权限/.test(action))return '降低构建链被继续利用的可能性。'
  if(/哈希|签名|provenance|attestation|产物/.test(action))return '确认发布产物是否可信，避免错误放行。'
  if(/日志|外联|敏感|时间窗/.test(action))return '确认运行期影响范围，保留取证材料。'
  return '补齐处置闭环，便于复扫验证。'
}

function getSortedAttackPaths(workspace:SecurityWorkspace){
  return [...(workspace.graph?.attack_paths??[])]
    .sort((a,b)=>(b.confidence??0)-(a.confidence??0))
    .slice(0,5)
}

function _cleanConclusion(value:string, confidence:number){
  const text=value
    .replace(/^一句话结论[：:]\s*/,'')
    .replace(/\s+/g,' ')
    .trim()
  if(/置信度|可信|风险路径|攻击路径/.test(text))return text
  return `${text} 综合置信度 ${confidence}%，建议按当前优先级处理。`
}

function buildCompactMermaid(path:NonNullable<SecurityWorkspace['graph']>['attack_paths'][number], index:number){
  const labels=compactPathNodes(path)
  const safeLabels=labels.length>=2?labels:[
    {stage:'风险入口',subject:'待确认'},
    {stage:'构建/产物',subject:'待验证'},
    {stage:'影响资产',subject:'待评估'},
  ]
  const nodes=safeLabels.map((node,i)=>`  P${index+1}_${i+1}["${mermaidSafeLabel(node.stage)}<br/>${mermaidSafeLabel(node.subject)}"]`)
  const edges=safeLabels.slice(1).map((_,i)=>`  P${index+1}_${i+1} --> P${index+1}_${i+2}`)
  return ['flowchart LR',...nodes,...edges].join('\n')
}

function compactPathNodes(path:NonNullable<SecurityWorkspace['graph']>['attack_paths'][number]){
  const steps=path.path_steps??[]
  const labels:Array<{stage:string;subject:string}>=[]
  for(const step of steps){
    const sourceNode=attackPathNodeInfo(step.source_type,step.source)
    const targetNode=attackPathNodeInfo(step.target_type,step.target)
    if(sourceNode&&!sameAttackPathNode(labels[labels.length-1],sourceNode))labels.push(sourceNode)
    if(targetNode&&!sameAttackPathNode(labels[labels.length-1],targetNode))labels.push(targetNode)
  }
  return labels.slice(0,7)
}

function sameAttackPathNode(a:{stage:string;subject:string}|undefined,b:{stage:string;subject:string}){
  return !!a&&a.stage===b.stage&&a.subject===b.subject
}

function attackPathNodeInfo(typeValue:unknown, subjectValue:unknown){
  const stage=attackPathNodeLabel(typeValue)||attackPathNodeLabel(subjectValue)
  if(!stage)return null
  return {stage,subject:shortAttackPathSubject(subjectValue,stage)}
}

function shortAttackPathSubject(value:unknown, fallback:string){
  const raw=String(value||'').trim()
  if(!raw)return fallback
  const withoutPrefix=raw
    .replace(/^(DependencyPackage|CIStep|BuildArtifact|RuntimeService|LogEvent|AttackStage|SourceCommit|Workflow|TrustedBuilder|Finding):\s*/i,'')
    .replace(/^https:\/\/github\.com\/actions\/runner\/self-hosted$/i,'self-hosted runner')
    .replace(/^https:\/\/github\.com\//i,'github/')
  if(withoutPrefix.startsWith('npm:')||withoutPrefix.startsWith('pypi:'))return withoutPrefix.replace(/^(npm:|pypi:)/,'')
  if(/^[a-f0-9]{32,}$/i.test(withoutPrefix.replace(/^commit\s+/i,'')))return 'commit'
  if(withoutPrefix.length<=26)return withoutPrefix
  const parts=withoutPrefix.split(/[\\/]/).filter(Boolean)
  const tail=parts.at(-1)
  return (tail&&tail.length<=26?tail:withoutPrefix.slice(0,24)+'...')
}

function mermaidSafeLabel(value:string){
  return value.replace(/["<>]/g,'').slice(0,28)
}

function buildActionList(path:{verdict?:string;severity?:string;recommendation?:string;path_steps?:Array<{source?:string;target?:string;source_type?:string;target_type?:string}>}){
  const actions:string[]=[]
  if(path.verdict==='likely-real-attack-path'||path.verdict==='runtime-touched-risk'){
    actions.push('立即阻断当前产物发布或合并，避免风险进入用户环境。')
  }
  if(hasPathKind(path,/dependency|package|npm:|pypi:|依赖/)){
    actions.push('隔离高危依赖，复核依赖来源、版本锁定和安装脚本。')
  }
  if(hasPathKind(path,/workflow|runner|ci|action|build|构建/)){
    actions.push('使用干净 Runner 重新构建，并收敛 workflow 权限。')
  }
  if(hasPathKind(path,/artifact|attestation|digest|hash|产物|签名/)){
    actions.push('校验产物哈希、签名、provenance 和 attestation 是否一致。')
  }
  if(hasPathKind(path,/runtime|log|egress|ip|外联|运行|日志/)){
    actions.push('排查运行期外联、敏感接口访问和同时间窗异常行为。')
  }
  if(!actions.length&&path.recommendation)actions.push(path.recommendation)
  if(!actions.length)actions.push(attackPathAction(path))
  return [...new Set(actions)].slice(0,5)
}

function hasPathKind(path:{path_steps?:Array<{source?:string;target?:string;source_type?:string;target_type?:string}>}, pattern:RegExp){
  return (path.path_steps??[]).some(step=>pattern.test(`${step.source_type||''} ${step.source||''} ${step.target_type||''} ${step.target||''}`.toLowerCase()))
}

function _attackPathVerdictLabel(verdict?:string){
  const labels:Record<string,string>={
    'likely-real-attack-path':'高可信真实攻击路径',
    'runtime-touched-risk':'运行期已触达风险路径',
    'provenance-risk-path':'构建/产物可信风险路径',
    'plausible-attack-path':'疑似攻击路径',
  }
  return labels[String(verdict||'')]||verdict||'待判定'
}

function formatConfidence(confidence?:number){
  if(typeof confidence!=='number'||!Number.isFinite(confidence))return 0
  return Math.round(confidence<=1?confidence*100:confidence)
}

function _summarizeAttackPath(path:NonNullable<SecurityWorkspace['graph']>['attack_paths'][number]){
  const steps=path.path_steps??[]
  const labels:string[]=[]
  for(const step of steps){
    for(const value of [step.source_type,step.source,step.relationship,step.target_type,step.target]){
      const label=attackPathNodeLabel(value)
      if(label&&labels[labels.length-1]!==label)labels.push(label)
    }
  }
  const compact=labels.filter((label,index)=>index===0||label!==labels[index-1])
  if(compact.length>=2)return compact.slice(0,7).join(' → ')
  return path.title||path.description||'供应链风险链路'
}

function attackPathNodeLabel(value:unknown){
  const text=String(value||'').toLowerCase()
  if(!text)return ''
  if(/sourcecommit|commit/.test(text))return '代码提交'
  if(/dependency|package|npm:|pypi:|依赖/.test(text))return '依赖'
  if(/workflow|cistep|ci\/cd|action|runner|build|构建/.test(text))return 'CI/CD'
  if(/artifact|attestation|digest|hash|产物|签名/.test(text))return '产物'
  if(/runtime|service|deployed|运行/.test(text))return '运行环境'
  if(/logevent|egress|ip|外联|日志|45\./.test(text))return '运行日志'
  if(/finding|blocks proof|阻断|不一致|缺失/.test(text))return '可信断点'
  if(/attackstage|stage|攻击阶段/.test(text))return '攻击阶段'
  return ''
}

function attackPathAction(path:{verdict?:string;severity?:string;recommendation?:string}){
  if(path.verdict==='likely-real-attack-path'||path.verdict==='runtime-touched-risk')return '立即阻断发布并隔离高危资产'
  if(path.verdict==='provenance-risk-path')return '校验 digest、签名、builder 和 provenance'
  if(path.severity==='critical')return '最高优先级复核并补齐证据'
  if(path.severity==='high')return '高优先级排查并复扫'
  return '补齐证据后复验'
}

function markdownCellText(value:string){
  return String(value||'-').replace(/\|/g,'\\|').replace(/\n/g,' ')
}

function extractRiskSummaryBlock(markdown:string){
  const headingMatch=/^## 风险摘要\s*$/m.exec(markdown)
  if(!headingMatch)return ''
  const start=headingMatch.index+headingMatch[0].length
  const tail=markdown.slice(start)
  const nextHeading=/\n##\s+/.exec(tail)
  return tail.slice(0,nextHeading?nextHeading.index:undefined)
}

function readRiskSummaryValue(block:string, labels:string[]){
  for(const label of labels){
    const escaped=escapeRegExp(label)
    const tableMatch=new RegExp(`\\|\\s*${escaped}\\s*\\|\\s*([^|\\n]+?)\\s*\\|`).exec(block)
    if(tableMatch)return tableMatch[1].trim()
    const bulletMatch=new RegExp(`(?:^|\\n)\\s*[-*]\\s*${escaped}\\s*[：:]\\s*([^\\n]+)`).exec(block)
    if(bulletMatch)return bulletMatch[1].trim()
    const plainMatch=new RegExp(`(?:^|\\n)\\s*${escaped}\\s*[：:]\\s*([^\\n]+)`).exec(block)
    if(plainMatch)return plainMatch[1].trim()
  }
  return ''
}

function escapeRegExp(value:string){
  return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
}

function parseFirstNumber(value:string|number|undefined|null){
  if(typeof value==='number')return Number.isFinite(value)?value:undefined
  const match=String(value||'').match(/\d+/)
  return match?Number(match[0]):undefined
}

function firstNumber(...values:Array<number|undefined|null>){
  for(const value of values){
    if(typeof value==='number'&&Number.isFinite(value))return value
  }
  return 0
}

function chineseReportRiskLevel(level:string){
  const normalized=String(level||'').trim().toLowerCase()
  if(['critical','严重','严重威胁'].includes(normalized))return '严重'
  if(['high','高危','高风险'].includes(normalized))return '高危'
  if(['medium','中危','中风险'].includes(normalized))return '中危'
  if(['low','低危','低风险'].includes(normalized))return '低危'
  return level||'-'
}

function reportPriorityLabel(riskScore:number, riskLevel:string, highRealPathCount:number){
  if(riskLevel==='严重'||riskScore>=90||highRealPathCount>0)return '最高优先级'
  if(riskLevel==='高危'||riskScore>=75)return '高优先级'
  return '中优先级'
}

function localizeReportMarkdownLabels(markdown:string){
  return markdown
    .replace(/风险等级[：:]\s*critical/gi,'风险等级：严重')
    .replace(/风险等级[：:]\s*high/gi,'风险等级：高危')
    .replace(/风险等级[：:]\s*medium/gi,'风险等级：中危')
    .replace(/风险等级[：:]\s*low/gi,'风险等级：低危')
    .replace(/严重级别[：:]\s*critical/gi,'严重级别：严重')
    .replace(/严重级别[：:]\s*high/gi,'严重级别：高危')
    .replace(/严重级别[：:]\s*medium/gi,'严重级别：中危')
    .replace(/严重级别[：:]\s*low/gi,'严重级别：低危')
    .replace(/修复优先级[：:]\s*P0/g,'修复优先级：最高优先级')
    .replace(/修复优先级[：:]\s*P1/g,'修复优先级：高优先级')
    .replace(/修复优先级[：:]\s*P2/g,'修复优先级：中优先级')
    .replace(/\*\*P0\s*·/g,'**最高优先级 ·')
    .replace(/\*\*P1\s*·/g,'**高优先级 ·')
    .replace(/\*\*P2\s*·/g,'**中优先级 ·')
    .replace(/\|\s*critical\s*(?=\|)/gi,'| 严重 ')
    .replace(/\|\s*high\s*(?=\|)/gi,'| 高危 ')
    .replace(/\|\s*medium\s*(?=\|)/gi,'| 中危 ')
    .replace(/\|\s*low\s*(?=\|)/gi,'| 低危 ')
}

/* ════════════════════════════════════════════════════
   MAIN
   ════════════════════════════════════════════════════ */
export function ReportPanel({workspace,animationKey,onOpenModule}:{workspace:SecurityWorkspace;animationKey:number;onOpenModule?:(module:PlatformTab)=>void}){
  const rm=useReducedMotion()
  const [ready,setReady]=useState(false)
  const [mode,setMode]=useState<'preview'|'source'>('preview')
  const [exporting,setExporting]=useState(false)
  const [mdSearch,setMdSearch]=useState('')
  const [heatCell,setHeatCell]=useState<{stage:ReportPathStage;type:string}|null>(null)
  const [selectedRiskSource,setSelectedRiskSource]=useState<string|null>(null)
  const [riskDrawer,setRiskDrawer]=useState<{source:RiskSourceItem;detail:RiskSourceDetail}|null>(null)

  const report=normalizeReportForDisplay(workspace.report||'# SupplyGuard KG 供应链攻击溯源报告\n\n暂无报告内容。',workspace)
  const wsId=workspace.workspaceId||workspace.workspace?.workspaceId

  // Unified animation trigger
  useEffect(()=>{setReady(false);const t=setTimeout(()=>setReady(true),100);return()=>clearTimeout(t)},[animationKey])

  const riskSources=useMemo(()=>_buildRiskSources(workspace),[workspace])
  const stages=useMemo(()=>_buildStages(workspace),[workspace])
  const breakpoints=useMemo(()=>_buildBreakpoints(workspace),[workspace])
  const actionItems=useMemo(()=>_buildActionItems(workspace,breakpoints,stages),[workspace,breakpoints,stages])
  const activeRiskSource=riskSources.find(item=>item.name===selectedRiskSource)||riskSources[0]

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
    downloadBlob(new Blob([`<!DOCTYPE html><html><head><meta charset="utf-8"><title>SupplyGuard KG 供应链攻击溯源报告</title><style>${css}</style></head><body>${report.replace(/\n/g,'<br>')}</body></html>`],{type:'text/html'}),'report.html');toast.success('已导出')
  }
  function openRiskSource(item: RiskSourceItem) {
    setSelectedRiskSource(item.name)
    onOpenModule?.(item.module)
  }
  const riskLevel=workspace.summary.risk_level
  const levelColor=riskLevel==='critical'?'#ef4444':riskLevel==='high'?'#f97316':'#06b6d4'
  const levelLabel=riskLevel==='critical'?'严重威胁':riskLevel==='high'?'高风险':'活跃'

  const fadeIn=rm?{}:{initial:{opacity:0,y:16},animate:{opacity:1,y:0},transition:{duration:.5,ease:[.16,1,.3,1]}}

  return(
    <motion.div className="max-w-full space-y-8 pb-24" {...fadeIn}>
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
                SupplyGuard KG 供应链攻击溯源报告
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

      </div>

      <Tabs value={mode} onValueChange={v=>setMode(v as 'preview'|'source')}>
        <TabsList className="h-12 rounded-xl border border-cyan-400/25 bg-cyan-950/20 p-1.5 shadow-[0_0_24px_rgba(6,182,212,0.08)]">
          <TabsTrigger value="preview" className="h-9 rounded-lg px-5 text-sm font-bold data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-100 data-[state=active]:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.45)]">报告预览</TabsTrigger>
          <TabsTrigger value="source" className="h-9 rounded-lg px-5 text-sm font-bold data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-100 data-[state=active]:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.45)]">Markdown 预览</TabsTrigger>
        </TabsList>

        <TabsContent value="preview" className="mt-5 space-y-6">
          {riskSources.length>0&&(
            <Card className="surface-raised overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2"><AlertTriangle className="size-4 text-cyan-400"/>风险来源分布</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <svg width="0" height="0"><defs><filter id="barGlow"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs></svg>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={riskSources}
                    margin={{top:12,right:12,left:-16,bottom:0}}
                    onClick={(event)=>{const item=event?.activePayload?.[0]?.payload as RiskSourceItem|undefined;if(item)openRiskSource(item)}}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={.2}/>
                    <XAxis dataKey="name" tick={{fontSize:11,fill:'var(--muted-foreground)'}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:10,fill:'var(--muted-foreground)'}} axisLine={false} tickLine={false}/>
                    <Tooltip
                      cursor={{fill:'rgba(6,182,212,0.08)'}}
                      contentStyle={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:10,fontSize:12,boxShadow:'0 8px 24px rgba(0,0,0,0.3)'}}
                    />
                    <Bar dataKey="value" fill="#0891b2" radius={[5,5,0,0]} isAnimationActive={false} shape={<_GlowBar/>} key={`bar-${animationKey}`}/>
                  </BarChart>
                </ResponsiveContainer>
                {activeRiskSource&&(
                  <div className="rounded-xl border border-border/60 bg-[color:var(--surface-inset)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold">{activeRiskSource.name} 风险明细</div>
                        <p className="mt-1 text-xs text-muted-foreground">共 {activeRiskSource.value} 个信号，优先展示最高风险证据。</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {riskSources.map(item=>(
                          <button
                            key={item.name}
                            onClick={()=>setSelectedRiskSource(item.name)}
                            className={cn('rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                              activeRiskSource.name===item.name?'border-cyan-400/60 bg-cyan-500/10 text-cyan-500':'border-border text-muted-foreground hover:text-foreground')}
                          >
                            {item.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {activeRiskSource.details.length?activeRiskSource.details.map((detail,index)=>(
                        <button
                          key={`${detail.title}-${index}`}
                          onClick={()=>setRiskDrawer({source:activeRiskSource,detail})}
                          className="group flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border/50 bg-[color:var(--surface-card)] px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-cyan-400/40 hover:bg-cyan-500/5"
                          title={detail.title}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <Badge variant="outline" className={cn('shrink-0 text-[10px] px-1 py-0 h-4',severityBadgeClass(detail.severity))}>{severityLabel(detail.severity)}</Badge>
                            <span className="min-w-0 truncate text-xs font-semibold text-muted-foreground group-hover:text-foreground">{detail.title}</span>
                          </div>
                          <ChevronRight className="size-3 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-cyan-400"/>
                        </button>
                      )):<div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">该来源暂无可下钻风险详情。</div>}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {actionItems.length>0&&(
            <Card className="surface-raised">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2"><ShieldAlert className="size-4 text-orange-400"/>处置建议与优先级</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {actionItems.map(item=>(
                    <div key={`${item.priority}-${item.title}`} className={cn('rounded-xl border p-4',
                      item.tone==='red'?'border-red-500/20 bg-red-950/15':item.tone==='orange'?'border-orange-500/20 bg-orange-950/15':'border-cyan-500/20 bg-cyan-950/15')}
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-5',
                          item.tone==='red'?'border-red-500/40 text-red-400':item.tone==='orange'?'border-orange-500/40 text-orange-400':'border-cyan-500/40 text-cyan-400')}
                        >
                          {item.priority}
                        </Badge>
                        <div className="text-sm font-bold">{item.title}</div>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-5 max-w-full">
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
              <CardContent>
                <div className="max-h-[260px] space-y-2 overflow-y-auto pr-2">
                  {breakpoints.length?breakpoints.map(bp=>(
                    <div key={bp.id} className={cn('min-w-0 overflow-hidden rounded-lg border p-3',bp.severity==='critical'?'border-red-500/20 bg-red-950/20':bp.severity==='high'?'border-orange-500/20 bg-orange-950/20':'border-amber-500/15 bg-amber-950/15')}>
                      <div className="flex min-w-0 items-start gap-1.5">
                        <Badge variant="outline" className={cn('shrink-0 text-[10px] px-1 py-0 h-4',bp.severity==='critical'?'border-red-500/40 text-red-400':bp.severity==='high'?'border-orange-500/40 text-orange-400':'border-amber-500/40 text-amber-400')}>{bp.severity==='critical'?'严重':bp.severity==='high'?'高危':'中危'}</Badge>
                        <span className="min-w-0 break-words text-xs font-semibold [overflow-wrap:anywhere]">{bp.title}</span>
                      </div>
                      {bp.evidence&&<p className="mt-1.5 max-w-full whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{bp.evidence}</p>}
                    </div>
                  )):<p className="text-xs text-muted-foreground">暂无断点</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="source" className="mt-5">
          <Card className="surface-raised">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold">Markdown 预览</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative"><Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground"/><Input value={mdSearch} onChange={e=>setMdSearch(e.target.value)} placeholder="搜索..." className="h-7 w-48 pl-7 text-xs"/>{mdSearch&&<button onClick={()=>setMdSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2"><X className="size-3 text-muted-foreground"/></button>}</div>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={()=>{navigator.clipboard.writeText(report);toast.success('已复制')}}><Copy className="size-3"/>复制</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-[72vh] overflow-y-auto rounded-xl border border-cyan-400/15 bg-[color:var(--surface-inset)] p-5 shadow-inner">
                <ReportMarkdownPreview text={report} search={mdSearch}/>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <_RiskDetailDrawer source={riskDrawer?.source??null} detail={riskDrawer?.detail??null} open={!!riskDrawer} onClose={()=>setRiskDrawer(null)}/>

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
