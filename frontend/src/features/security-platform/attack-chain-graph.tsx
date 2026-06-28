import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dagre from 'dagre'
import {
  Background, Controls, MiniMap, ReactFlow,
  type Node, type Edge, type ReactFlowInstance,
  Handle, Position, BaseEdge, getBezierPath,
} from '@xyflow/react'
import {
  AlertTriangle, ArrowRight, Box, Code2, Container, Cpu, Eye, EyeOff,
  FileText, Fingerprint, Globe, Layers, Maximize2, Minimize2,
  Network, Package, Radio, Route, Server, Shield, ShieldAlert,
  Siren, Terminal, Upload, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { SecurityWorkspace } from '@/lib/security-api'

type GNode = NonNullable<NonNullable<SecurityWorkspace['graph']>['nodes']>[number]
type GEdge = NonNullable<NonNullable<SecurityWorkspace['graph']>['edges']>[number]
type GPath = NonNullable<NonNullable<SecurityWorkspace['graph']>['attack_paths']>[number]

/* ══ Node type config ══ */
interface NC { label: string; color: string; Icon: typeof Shield }

const NODE_MAP: Record<string, NC> = {
  MultimodalEvidence: { label:'外部告警', color:'#06b6d4', Icon: Upload },
  AudioEvidence:      { label:'音频证据', color:'#06b6d4', Icon: Radio },
  VisualEvidence:     { label:'图像证据', color:'#06b6d4', Icon: Eye },
  MultimodalFinding:  { label:'告警命中', color:'#ef4444', Icon: Siren },
  DependencyPackage:  { label:'依赖包',   color:'#f59e0b', Icon: Package },
  Vulnerability:      { label:'漏洞',     color:'#ef4444', Icon: ShieldAlert },
  RecognizedEntity:   { label:'提取实体', color:'#a78bfa', Icon: Fingerprint },
  CIStep:             { label:'CI 步骤',  color:'#fb923c', Icon: Terminal },
  CIWorkflow:         { label:'CI 流程',  color:'#fb923c', Icon: Route },
  Workflow:           { label:'Workflow', color:'#fb923c', Icon: Route },
  BuildArtifact:      { label:'构建产物', color:'#22d3ee', Icon: Box },
  Attestation:        { label:'签名证明', color:'#4ade80', Icon: Shield },
  TrustedBuilder:     { label:'可信构建', color:'#4ade80', Icon: Cpu },
  TrustFinding:       { label:'可信发现', color:'#4ade80', Icon: Shield },
  RuntimeService:     { label:'运行服务', color:'#38bdf8', Icon: Globe },
  LogEvent:           { label:'日志事件', color:'#818cf8', Icon: FileText },
  Finding:            { label:'安全发现', color:'#ef4444', Icon: AlertTriangle },
  AttackStage:        { label:'攻击阶段', color:'#ef4444', Icon: ShieldAlert },
  EvidenceChain:      { label:'证据链',   color:'#4ade80', Icon: Route },
  Asset:              { label:'目标资产', color:'#818cf8', Icon: Server },
  SourceCommit:       { label:'源码提交', color:'#a78bfa', Icon: Code2 },
  CodeFile:           { label:'代码文件', color:'#818cf8', Icon: Code2 },
}
const DEFAULT_NC: NC = { label:'节点', color:'#6b7280', Icon: Container }
function nc(n: GNode): NC { return NODE_MAP[n.type] || DEFAULT_NC }

/* ══ Main node ══ */
function GraphNode({ data }: any) {
  const c = nc(data.raw); const hl = data.highlighted; const semi = data.semi
  const Icon = c.Icon
  return (
    <div className="relative cursor-pointer rounded-xl border transition-all duration-500 overflow-hidden select-none"
      style={{
        width: data._w || 175, opacity: data.dimmed ? 0.45 : 1,
        background: hl ? `color-mix(in oklch, var(--card) 70%, ${c.color})` : semi ? `color-mix(in oklch, var(--card) 85%, ${c.color})` : 'var(--card)',
        borderColor: hl ? c.color : semi ? `${c.color}50` : 'var(--border)',
        boxShadow: hl ? `0 0 20px ${c.color}30, 0 2px 8px rgba(0,0,0,0.3)` : semi ? `0 0 8px ${c.color}10` : '0 1px 3px rgba(0,0,0,0.15)',
      }}>
      <Handle type="target" position={Position.Left} style={{ background: c.color, width: 8, height: 8, border: '2px solid var(--background)', opacity: hl ? 1 : 0.5 }} />
      <Handle type="source" position={Position.Right} style={{ background: c.color, width: 8, height: 8, border: '2px solid var(--background)', opacity: hl ? 1 : 0.5 }} />
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: c.color, opacity: hl ? 1 : semi ? 0.6 : 0.3 }} />
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="flex size-7 items-center justify-center rounded-lg shrink-0" style={{ background: `${c.color}18`, color: hl ? c.color : `${c.color}99` }}>
          <Icon className="size-3.5" /></div>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: hl ? c.color : 'var(--muted-foreground)' }}>{c.label}</div>
          <div className="text-[12px] font-bold leading-snug truncate mt-0.5" style={{ color: hl ? 'var(--foreground)' : 'var(--muted-foreground)' }}>{data.label}</div>
        </div>
        {data.riskLevel && data.riskLevel !== 'low' && (
          <span className="ml-auto size-2 rounded-full shrink-0" style={{ background: data.riskLevel === 'critical' ? '#ef4444' : data.riskLevel === 'high' ? '#f97316' : '#f59e0b' }} />)}
      </div>
    </div>
  )
}

/* ══ Cluster bubble ══ */
function ClusterBubble({ data }: any) {
  return (
    <div className="relative cursor-pointer rounded-2xl border border-dashed transition-all duration-300 hover:border-cyan-400/40 hover:shadow-[0_0_16px_rgba(6,182,212,0.08)] select-none"
      style={{ width: data._w || 160, height: 80, opacity: 0.55,
        background: 'color-mix(in oklch, var(--card) 50%, transparent)',
        borderColor: 'var(--border)' }}>
      <Handle type="target" position={Position.Left} style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Right} style={{ visibility: 'hidden' }} />
      <div className="flex flex-col items-center justify-center h-full gap-1 px-3">
        <div className="flex items-center gap-1.5">
          <Layers className="size-3.5 text-muted-foreground" />
          <span className="text-[11px] font-semibold text-muted-foreground">{data.label}</span>
        </div>
        <span className="text-[10px] text-muted-foreground/60">{data.count} 节点 · 点击展开</span>
      </div>
    </div>
  )
}

const nodeTypes = { graphNode: GraphNode, clusterBubble: ClusterBubble }

/* ══ Bezier edge — layered opacity ══ */
function BezierEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, style }: any) {
  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, curvature: 0.25 })
  const isPath = data?.isPath; const isSemi = data?.isSemi; const trust = data?.isTrust
  const opacity = style?.opacity ?? 1
  const c = trust ? '#4ade80' : isPath ? '#ef4444' : isSemi ? '#06b6d4' : 'var(--border)'
  const sw = isPath ? 3 : isSemi ? 1.8 : 0.8

  if (!isPath && !isSemi) {
    return <BaseEdge id={id} path={path} style={{ stroke: 'var(--border)', strokeWidth: 0.6, opacity: 0.15 * opacity }} />
  }

  return (
    <g>
      {isPath && <path d={path} fill="none" stroke={c} strokeWidth={8} strokeLinecap="round" opacity={0.08 * opacity} style={{ filter: 'blur(4px)' }} />}
      <path d={path} fill="none" stroke={c} strokeWidth={sw} strokeDasharray={isSemi ? '3 3' : undefined} strokeLinecap="round" opacity={isPath ? 1 : isSemi ? 0.3 : 0.15} />
      {isPath && (
        <path d={path} fill="none" stroke={trust ? '#86efac' : '#fca5a5'} strokeWidth={1.2} strokeLinecap="round" strokeDasharray="6 36" opacity={0.7}>
          <animate attributeName="stroke-dashoffset" from="42" to="0" dur="1.8s" repeatCount="indefinite" />
        </path>
      )}
      {data?.bundleCount > 1 && (
        <text x={(sourceX + targetX) / 2} y={(sourceY + targetY) / 2 - 10} textAnchor="middle" fill="#06b6d4" fontSize="9" fontWeight="700" opacity={0.5}>
          ×{data.bundleCount}
        </text>
      )}
    </g>
  )
}

const edgeTypes = { bezier: BezierEdge }

/* ══ Dagre layout — only for visible nodes ══ */
function layoutNodes(visibleNodes: GNode[], allEdges: GEdge[], totalN: number) {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  const ns = totalN <= 8 ? 90 : totalN <= 15 ? 70 : 55
  const rs = totalN <= 8 ? 200 : totalN <= 15 ? 160 : 130
  g.setGraph({ rankdir: 'LR', nodesep: ns, ranksep: rs, marginx: 60, marginy: 60 })

  const nw = totalN <= 8 ? 200 : totalN <= 15 ? 175 : 155
  const nh = 66
  const idSet = new Set(visibleNodes.map(n => n.id))

  for (const n of visibleNodes) g.setNode(n.id, { width: nw, height: nh })
  for (const e of allEdges) {
    if (idSet.has(e.source) && idSet.has(e.target)) g.setEdge(e.source, e.target, {})
  }
  dagre.layout(g)

  return {
    nodes: visibleNodes.map(n => {
      const pos = g.node(n.id)
      return pos ? { ...n, _x: pos.x - nw / 2, _y: pos.y - nh / 2 } : { ...n, _x: 0, _y: 0 }
    }),
    nodeW: nw, nodeH: nh,
  }
}

/* ════════════════════════════════════════════════════
   MAIN
   ════════════════════════════════════════════════════ */
export function AttackChainGraph({ workspace }: { workspace: SecurityWorkspace }) {
  const graph = workspace.graph
  const rawNodes: GNode[] = graph?.nodes ?? []
  const rawEdges: GEdge[] = graph?.edges ?? []
  const attackPaths: GPath[] = graph?.attack_paths ?? []
  const graphSummary = graph?.summary

  const [selectedPathId, setSelectedPathId] = useState<string | null>(attackPaths[0]?.id ?? null)
  const [detailNode, setDetailNode] = useState<GNode | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [pathOnlyMode, setPathOnlyMode] = useState(false)
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // ResizeObserver: recalculate layout on container resize + evidence change
  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const obs = new ResizeObserver(() => {
      if (flowInstance) {
        setTimeout(() => flowInstance.fitView({ padding: 0.1, duration: 400 }), 200)
      }
    })
    obs.observe(el); return () => obs.disconnect()
  }, [flowInstance, fullscreen])

  const selectedPath = attackPaths.find(p => p.id === selectedPathId) ?? null
  const isAllMode = selectedPathId === null

  // Node classification
  const pathNodeIds = useMemo(() => new Set(selectedPath?.node_ids ?? []), [selectedPath])
  const pathEdgeIds = useMemo(() => new Set(selectedPath?.edge_ids ?? []), [selectedPath])

  const semiNodeIds = useMemo(() => {
    if (isAllMode) return new Set<string>() // all mode: no "semi" needed
    const s = new Set<string>()
    for (const e of rawEdges) {
      if (pathNodeIds.has(e.source) && !pathNodeIds.has(e.target)) s.add(e.target)
      if (pathNodeIds.has(e.target) && !pathNodeIds.has(e.source)) s.add(e.source)
    }
    return s
  }, [rawEdges, pathNodeIds, isAllMode])

  // Layout: in "all" mode, ALL nodes participate; in path mode, only path+semi+expanded
  const layoutInput = useMemo(() => {
    if (isAllMode) return rawNodes
    // Path mode: only show path + semi nodes; rest are hidden (not rendered as clusters)
    const visible = new Set([...pathNodeIds, ...semiNodeIds])
    return rawNodes.filter(n => visible.has(n.id))
  }, [rawNodes, pathNodeIds, semiNodeIds, isAllMode])

  // Dynamic layout
  const layoutResult = useMemo(
    () => layoutNodes(layoutInput, rawEdges, layoutInput.length),
    [layoutInput, rawEdges])
  const layoutNodesOut = layoutResult.nodes
  const nodeW = layoutResult.nodeW

  // ReactFlow nodes — filter hidden in pathOnlyMode
  const rfNodes: Node[] = useMemo(() => {
    return layoutNodesOut
      .filter(n => {
        if (!pathOnlyMode || !selectedPath) return true
        return pathNodeIds.has(n.id)
      })
      .map(n => {
        const onPath = pathNodeIds.has(n.id)
        const semi = semiNodeIds.has(n.id)
        const dimmed = !isAllMode && selectedPath && !onPath && !semi
        const pos = (n as any)._x != null ? { x: (n as any)._x, y: (n as any)._y } : { x: 0, y: 0 }
        return {
          id: n.id, type: 'graphNode', position: pos,
          data: { label: n.label, raw: n, highlighted: onPath, semi, dimmed, _w: nodeW },
          draggable: false, selectable: true,
        }
      })
  }, [layoutNodesOut, pathNodeIds, semiNodeIds, selectedPath, isAllMode, pathOnlyMode, nodeW])

  // Edges: filter non-path in pathOnlyMode
  const rfEdges: Edge[] = useMemo(() => {
    const pathOnlyVisible = pathOnlyMode && selectedPath
    return rawEdges
      .filter(e => {
        if (isAllMode) return true
        if (!pathOnlyVisible) return true
        return pathEdgeIds.has(e.id)
      })
      .map(e => {
        if (isAllMode) {
          const trust = e.type?.includes('TRUST_') || e.type?.includes('ATTESTATION_') || e.type?.includes('PROVENANCE')
          return {
            id: e.id, source: e.source, target: e.target, type: 'bezier',
            style: { opacity: 1 },
            data: { isPath: false, isSemi: true, isTrust: trust, label: e.label, bundleCount: 1 },
          }
        }
        const onPath = pathEdgeIds.has(e.id)
        const trust = e.type?.includes('TRUST_') || e.type?.includes('ATTESTATION_') || e.type?.includes('PROVENANCE')
        const connectedToPath = pathNodeIds.has(e.source) || pathNodeIds.has(e.target)
        const dimmed = selectedPath && !onPath && !connectedToPath
        return {
          id: e.id, source: e.source, target: e.target, type: 'bezier',
          style: { opacity: dimmed ? 0.28 : 1 },
          data: { isPath: onPath, isSemi: (connectedToPath || isAllMode) && !onPath, isTrust: trust, label: e.label, bundleCount: 1 },
        }
      })
  }, [rawEdges, pathEdgeIds, pathNodeIds, selectedPath, isAllMode, pathOnlyMode])

  // FitView: simple, covers all visible nodes
  useEffect(() => {
    if (!flowInstance || !rfNodes.length) return
    const t = setTimeout(() => {
      flowInstance.fitView({ padding: 0.1, duration: 600, maxZoom: 2 })
    }, 300)
    return () => clearTimeout(t)
  }, [flowInstance, selectedPathId, rfNodes.length])

  // Auto-refit on container resize or new data
  useEffect(() => {
    if (!flowInstance || !rfNodes.length) return
    const t = setTimeout(() => {
      flowInstance.fitView({ padding: 0.1, duration: 400, maxZoom: 2 })
    }, 200)
    return () => clearTimeout(t)
  }, [rawNodes.length])

  const onNodeClick = useCallback((_e: any, node: Node) => {
    setDetailNode((node.data as any).raw as GNode)
  }, [])

  const onPaneClick = useCallback(() => setSelectedPathId(null), [])

  if (!rawNodes.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-full text-muted-foreground">
        <Network className="size-20 text-muted-foreground/8" />
        <p className="text-sm">运行扫描后生成攻击链图谱</p>
      </div>
    )
  }

  const score = selectedPath?.score ?? graphSummary?.risk_score ?? 0
  const sc = score >= 90 ? '#ef4444' : score >= 75 ? '#f97316' : score >= 55 ? '#f59e0b' : '#22c55e'
  const conf = Math.round((selectedPath?.confidence ?? graphSummary?.average_path_confidence ?? 0) * 100)

  const bar = (
    <div className={cn('flex items-center gap-2 shrink-0 rounded-lg surface-raised px-3 py-1.5 text-xs', fullscreen && 'bg-[color:var(--surface-overlay)] backdrop-blur border border-border')}>
      <span className="text-muted-foreground">风险</span>
      <span className="text-base font-black tabular-nums" style={{ color: sc }}>{score}</span>
      <span className="w-px h-4 bg-border/30" />
      <span className="text-muted-foreground">置信度</span>
      <span className="font-bold text-cyan-400">{conf}%</span>
      <span className="w-px h-4 bg-border/30" />
      <span className="text-muted-foreground">{graphSummary?.actionable_attack_path_count ?? graphSummary?.attack_path_count ?? 0} 路径</span>
      <span className="w-px h-4 bg-border/30" />
      <span className="text-muted-foreground">{rawNodes.length} 节点</span>
      <div className="flex items-center gap-1 ml-1 overflow-x-auto">
        {attackPaths.map(p => (
          <button key={p.id} onClick={() => setSelectedPathId(p.id === selectedPathId ? null : p.id)} className={cn(
            'flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium shrink-0 transition-all duration-200 hover:-translate-y-0.5',
            p.id === selectedPathId ? 'border-cyan-400/40 bg-console-cyan-soft text-console-cyan' : 'border-border bg-[color:var(--surface-inset)] hover:border-ring/30',
          )}>
            <span className="size-1.5 rounded-full" style={{ background: p.severity === 'critical' ? '#ef4444' : p.severity === 'high' ? '#f97316' : '#f59e0b' }} />
            {p.title?.slice(0, 18)} <span className="font-bold">{p.score}</span>
          </button>
        ))}
      </div>
      <div className="flex-1" />
      {pathOnlyMode && selectedPath ? (
        <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setPathOnlyMode(false)}>
          <EyeOff className="size-3" /> 显示全部
        </Button>
      ) : selectedPath ? (
        <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setPathOnlyMode(true)}>
          <Eye className="size-3" /> 只看当前链路
        </Button>
      ) : null}
      {selectedPathId && <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => { setSelectedPathId(null); setPathOnlyMode(false) }}><X className="size-3" /> 全部</Button>}
      <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setFullscreen(!fullscreen)}>
        {fullscreen ? <><Minimize2 className="size-3" /> 退出</> : <><Maximize2 className="size-3" /> 全屏</>}
      </Button>
    </div>
  )

  const canvas = (
    <div ref={containerRef} className="flex-1 min-h-0 rounded-lg overflow-hidden border border-border"
      style={{ background: 'radial-gradient(ellipse at 25% 50%, rgba(6,182,212,0.04) 0%, transparent 55%), radial-gradient(ellipse at 70% 50%, rgba(239,68,68,0.03) 0%, transparent 55%), var(--background)' }}>
      <ReactFlow
        nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        onNodeClick={onNodeClick} onPaneClick={onPaneClick} onInit={setFlowInstance}
        fitView fitViewOptions={{ padding: 0.15 }}
        nodesDraggable nodesConnectable={false} elementsSelectable
        minZoom={0.08} maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--border)" gap={48} size={0.6} />
        <div
          style={{
            ['--xy-controls-button-background-color' as string]: 'transparent',
            ['--xy-controls-button-background-color-hover' as string]: 'var(--surface-hover)',
            ['--xy-controls-button-color' as string]: 'var(--muted-foreground)',
            ['--xy-controls-button-color-hover' as string]: 'var(--foreground)',
            ['--xy-controls-button-border-color' as string]: 'var(--border)',
          }}
        >
          <Controls
            className="!rounded-lg !overflow-hidden backdrop-blur"
            style={{
              border: '1px solid var(--border)',
              background: 'var(--surface-overlay)',
              boxShadow: 'var(--shadow-soft)',
            }}
          />
        </div>
        <MiniMap
          pannable zoomable
          className="!rounded-lg backdrop-blur"
          style={{
            border: '1px solid var(--border)',
            background: 'var(--surface-overlay)',
            boxShadow: 'var(--shadow-soft)',
          }}
          maskColor="color-mix(in oklch, var(--background) 95%, black)"
          nodeColor={n => {
            const d = (n as any)?.data
            if (n.type === 'clusterBubble') return '#6b7280'
            return nc(d?.raw || { type: '' }).color
          }} />
      </ReactFlow>
    </div>
  )

  const content = (
    <div className={cn('flex flex-col gap-1.5 min-h-0', fullscreen ? 'h-svh fixed inset-0 z-50 bg-background p-2' : 'h-[calc(100vh-7rem)]')}>
      {bar}{canvas}
    </div>
  )

  return (
    <>
      {content}
      <Sheet open={!!detailNode} onOpenChange={v => { if (!v) setDetailNode(null) }}>
        <SheetContent side="right" className="!w-[68vw] !max-w-[820px] overflow-hidden flex flex-col p-0">
          {detailNode && (() => {
            const c = nc(detailNode)
            const Icon = c.Icon
            const connEdges = rawEdges.filter(e => e.source === detailNode.id || e.target === detailNode.id)
            const connIds = new Set(connEdges.map(e => e.source === detailNode.id ? e.target : e.source))
            const connNodes = rawNodes.filter(n => connIds.has(n.id))
            const onPath = selectedPath?.node_ids?.includes(detailNode.id)
            return (<>
              <div className="shrink-0 border-b border-border/50 px-6 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-12 items-center justify-center rounded-xl shrink-0" style={{ background: `${c.color}12`, border: `1px solid ${c.color}30`, color: c.color }}>
                    <Icon className="size-6" /></div>
                  <div className="min-w-0">
                    <SheetTitle className="text-lg font-bold tracking-tight">{detailNode.label}</SheetTitle>
                    <div className="flex items-center gap-2 mt-1 text-xs">
                      <span className="px-2 py-0.5 rounded-full font-semibold text-[10px]" style={{ background: `${c.color}15`, color: c.color }}>{c.label}</span>
                      <span className="font-mono text-muted-foreground">{detailNode.id}</span>
                      {onPath && <Badge variant="secondary" className="text-[10px]">当前攻击链</Badge>}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <Tabs defaultValue="overview">
                  <TabsList className="h-9 mb-4 surface-inset">
                    <TabsTrigger value="overview" className="text-[11px] h-7">概览</TabsTrigger>
                    {connNodes.length > 0 && <TabsTrigger value="connections" className="text-[11px] h-7">上下游 ({connNodes.length})</TabsTrigger>}
                    {detailNode.evidence_ids?.length ? <TabsTrigger value="evidence" className="text-[11px] h-7">证据 ({detailNode.evidence_ids.length})</TabsTrigger> : null}
                  </TabsList>
                  <TabsContent value="overview" className="mt-0 space-y-5">
                    <div className="grid grid-cols-4 gap-4">
                      {[['类型', c.label], ['风险等级', detailNode.risk || '—'], ['评分', detailNode.score != null ? String(detailNode.score) : '—'], ['来源', detailNode.source_model || detailNode.source || '—']].map(([l, v]) => (
                        <div key={l}><div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{l}</div><div className="text-sm font-bold">{v}</div></div>))}
                    </div>
                    {detailNode.description && <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">描述</div><p className="text-sm leading-relaxed text-muted-foreground">{detailNode.description}</p></div>}
                  </TabsContent>
                  <TabsContent value="connections" className="mt-0 space-y-2">
                    {connEdges.map(e => {
                      const isOut = e.source === detailNode.id
                      const other = connNodes.find(n => n.id === (isOut ? e.target : e.source))
                      const oc = other ? nc(other) : null
                      return (<div key={e.id} className="flex items-center gap-3 rounded-xl border border-border/40 bg-[color:var(--surface-panel)] p-3">
                        <ArrowRight className={cn('size-4 shrink-0', !isOut && 'rotate-180')} style={{ color: isOut ? '#ef4444' : '#06b6d4' }} />
                        <div className="min-w-0 flex-1">{other ? <><div className="text-sm font-bold truncate">{other.label}</div><div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">{oc && <span style={{ color: oc.color }}>{oc.label}</span>}<span>·</span><span>{e.type || e.label}</span>{e.confidence != null && <span>· {Math.round(e.confidence * 100)}%</span>}</div></> : <span className="text-sm font-mono text-muted-foreground">{(isOut ? e.target : e.source)}</span>}</div>
                      </div>)})}
                  </TabsContent>
                  <TabsContent value="evidence" className="mt-0">
                    <div className="flex flex-wrap gap-2">{detailNode.evidence_ids?.slice(0, 32).map(id => (<span key={id} className="rounded-lg bg-muted/30 border border-border/40 px-3 py-1.5 font-mono text-[11px]">{id}</span>))}{(detailNode.evidence_ids?.length || 0) > 32 && <span className="text-[11px] text-muted-foreground self-center">+{(detailNode.evidence_ids?.length || 0) - 32}</span>}</div>
                  </TabsContent>
                </Tabs>
              </div>
            </>)})()}
        </SheetContent>
      </Sheet>
    </>
  )
}
