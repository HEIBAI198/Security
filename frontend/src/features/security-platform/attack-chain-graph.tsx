import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dagre from "dagre";
import {
  Background,
  BaseEdge,
  EdgeLabelRenderer,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  getSmoothStepPath,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Box,
  Code2,
  Container,
  Cpu,
  Eye,
  FileText,
  Fingerprint,
  Globe,
  Layers,
  Maximize2,
  Minimize2,
  Network,
  Package,
  Radio,
  Route,
  Server,
  Shield,
  ShieldAlert,
  Siren,
  Terminal,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SecurityWorkspace } from "@/lib/security-api";
import { cn } from "@/lib/utils";
import {
  buildAttackPathFocusNodeIds,
  buildGraphOverview,
  graphRelationLabel,
  type GraphOverviewGroup,
  type GraphOverviewGroupKey,
} from "./attack-chain-graph-model";

type GNode = NonNullable<
  NonNullable<SecurityWorkspace["graph"]>["nodes"]
>[number];
type GEdge = NonNullable<
  NonNullable<SecurityWorkspace["graph"]>["edges"]
>[number];
type GPath = NonNullable<
  NonNullable<SecurityWorkspace["graph"]>["attack_paths"]
>[number];
type GraphViewMode = "focus" | "all";

interface NodeConfig {
  label: string;
  color: string;
  Icon: typeof Shield;
}

interface OverviewGroupConfig extends NodeConfig {
  description: string;
}

const NODE_MAP: Record<string, NodeConfig> = {
  MultimodalEvidence: { label: "外部告警", color: "#0891b2", Icon: Upload },
  AudioEvidence: { label: "音频证据", color: "#0891b2", Icon: Radio },
  VisualEvidence: { label: "图像证据", color: "#0891b2", Icon: Eye },
  MultimodalFinding: { label: "告警命中", color: "#dc2626", Icon: Siren },
  DependencyPackage: { label: "依赖包", color: "#d97706", Icon: Package },
  Vulnerability: { label: "漏洞", color: "#dc2626", Icon: ShieldAlert },
  RecognizedEntity: { label: "提取实体", color: "#7c3aed", Icon: Fingerprint },
  CIStep: { label: "CI 步骤", color: "#ea580c", Icon: Terminal },
  CIWorkflow: { label: "CI 流程", color: "#ea580c", Icon: Route },
  Workflow: { label: "Workflow", color: "#ea580c", Icon: Route },
  BuildArtifact: { label: "构建产物", color: "#0891b2", Icon: Box },
  Attestation: { label: "签名证明", color: "#16a34a", Icon: Shield },
  TrustedBuilder: { label: "可信构建", color: "#16a34a", Icon: Cpu },
  TrustFinding: { label: "可信发现", color: "#16a34a", Icon: Shield },
  RuntimeService: { label: "运行服务", color: "#0284c7", Icon: Globe },
  LogEvent: { label: "日志事件", color: "#4f46e5", Icon: FileText },
  Finding: { label: "安全发现", color: "#dc2626", Icon: AlertTriangle },
  AttackStage: { label: "攻击阶段", color: "#dc2626", Icon: ShieldAlert },
  EvidenceChain: { label: "证据链", color: "#16a34a", Icon: Route },
  Asset: { label: "目标资产", color: "#4f46e5", Icon: Server },
  SourceCommit: { label: "源码提交", color: "#7c3aed", Icon: Code2 },
  CodeFile: { label: "代码文件", color: "#4f46e5", Icon: Code2 },
};

const DEFAULT_NODE_CONFIG: NodeConfig = {
  label: "节点",
  color: "#64748b",
  Icon: Container,
};
const ATTACK_STAGES = ["依赖", "代码", "构建", "产物", "运行"];

const OVERVIEW_GROUP_MAP: Record<GraphOverviewGroupKey, OverviewGroupConfig> = {
  dependency: {
    label: "依赖与漏洞",
    description: "组件、漏洞与安全发现",
    color: "#d97706",
    Icon: Package,
  },
  code: {
    label: "源码与提交",
    description: "代码文件与版本提交",
    color: "#4f46e5",
    Icon: Code2,
  },
  build: {
    label: "构建流程",
    description: "Workflow、Job 与构建环境",
    color: "#ea580c",
    Icon: Terminal,
  },
  artifact: {
    label: "产物可信",
    description: "产物、签名与来源证明",
    color: "#0891b2",
    Icon: Box,
  },
  runtime: {
    label: "运行印证",
    description: "服务、资产与日志事件",
    color: "#0284c7",
    Icon: Globe,
  },
  evidence: {
    label: "外部证据",
    description: "告警、实体与证据链",
    color: "#7c3aed",
    Icon: Fingerprint,
  },
};

function nodeConfig(node: GNode): NodeConfig {
  return NODE_MAP[node.type] || DEFAULT_NODE_CONFIG;
}

function severityLabel(severity?: string) {
  if (severity === "critical") return "严重";
  if (severity === "high") return "高危";
  if (severity === "medium") return "中危";
  return "低危";
}

function severityColor(severity?: string) {
  if (severity === "critical") return "#dc2626";
  if (severity === "high") return "#ea580c";
  if (severity === "medium") return "#d97706";
  return "#0891b2";
}

function confidencePercent(value?: number) {
  const normalized = value ?? 0;
  return Math.round(normalized <= 1 ? normalized * 100 : normalized);
}

function nodeLabelById(nodes: GNode[], id?: string) {
  if (!id) return "待确认";
  return nodes.find((node) => node.id === id)?.label || id;
}

const HANDLE_POSITIONS = [
  ["left", Position.Left],
  ["right", Position.Right],
  ["top", Position.Top],
  ["bottom", Position.Bottom],
] as const;

function GraphHandles({ color }: { color: string }) {
  return (
    <>
      {HANDLE_POSITIONS.map(([id, position]) => (
        <span key={id}>
          <Handle
            id={`target-${id}`}
            type="target"
            position={position}
            style={{
              width: 7,
              height: 7,
              background: color,
              border: "2px solid var(--background)",
              opacity: 0.72,
            }}
          />
          <Handle
            id={`source-${id}`}
            type="source"
            position={position}
            style={{
              width: 7,
              height: 7,
              background: color,
              border: "2px solid var(--background)",
              opacity: 0.72,
            }}
          />
        </span>
      ))}
    </>
  );
}

function GraphNode({ data }: any) {
  const config = nodeConfig(data.raw);
  const highlighted = data.highlighted;
  const context = data.context;
  const Icon = config.Icon;

  return (
    <div
      className="relative cursor-pointer select-none overflow-hidden rounded-md border transition-[border-color,background-color,opacity] duration-200"
      style={{
        width: data.width || 188,
        opacity: data.dimmed ? 0.42 : 1,
        background: highlighted
          ? `color-mix(in oklch, var(--card) 78%, ${config.color})`
          : context
            ? `color-mix(in oklch, var(--card) 90%, ${config.color})`
            : "var(--card)",
        borderColor: highlighted
          ? config.color
          : context
            ? `${config.color}55`
            : "var(--border)",
        boxShadow: highlighted ? `inset 3px 0 0 ${config.color}` : "none",
      }}
    >
      <GraphHandles color={config.color} />
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div
          className="flex size-7 shrink-0 items-center justify-center rounded-md"
          style={{ background: `${config.color}18`, color: config.color }}
        >
          <Icon className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="text-[10px] font-semibold uppercase"
            style={{
              color: highlighted ? config.color : "var(--muted-foreground)",
            }}
          >
            {config.label}
          </div>
          <div
            className="mt-0.5 truncate text-xs font-bold text-foreground"
            title={data.label}
          >
            {data.label}
          </div>
        </div>
        {data.riskLevel && data.riskLevel !== "low" ? (
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: severityColor(data.riskLevel) }}
          />
        ) : null}
      </div>
    </div>
  );
}

function ClusterBubble({ data }: any) {
  const config = OVERVIEW_GROUP_MAP[data.group.key as GraphOverviewGroupKey];
  const Icon = config.Icon;
  return (
    <div
      className="group relative w-[224px] cursor-pointer select-none overflow-hidden rounded-md border bg-[color:var(--surface-card)] transition-[border-color,background-color] duration-200"
      style={{
        borderColor: `${config.color}66`,
        boxShadow: `inset 3px 0 0 ${config.color}`,
      }}
    >
      <GraphHandles color={config.color} />
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-md"
            style={{ background: `${config.color}14`, color: config.color }}
          >
            <Icon className="size-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-foreground">
              {config.label}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {config.description}
            </div>
          </div>
          <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>
        <div className="mt-4 grid grid-cols-3 divide-x divide-border rounded-md border border-border bg-[color:var(--surface-inset)] py-2">
          <div className="text-center">
            <div className="text-sm font-bold tabular-nums text-foreground">
              {data.group.nodeCount}
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">节点</div>
          </div>
          <div className="text-center">
            <div
              className="text-sm font-bold tabular-nums"
              style={{
                color: data.group.riskCount
                  ? "#dc2626"
                  : "var(--muted-foreground)",
              }}
            >
              {data.group.riskCount}
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">风险</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-bold tabular-nums text-foreground">
              {data.group.internalRelationCount}
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              内部关系
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const nodeTypes = { graphNode: GraphNode, clusterBubble: ClusterBubble };

function AttackEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  interactionWidth,
  markerEnd,
}: any) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 10,
    offset: 24,
  });
  const isPath = data?.isPath;
  const isContext = data?.isContext;
  const isTrust = data?.isTrust;
  const label = data?.label || "关联";
  const confidence = data?.confidence;
  const selected = data?.selected;
  const opacity = style?.opacity ?? 1;
  const color =
    data?.color ||
    (isTrust
      ? "#16a34a"
      : isPath
        ? "#dc2626"
        : isContext
          ? "#0891b2"
          : "#64748b");

  if (!isPath && !isContext) {
    return (
      <g>
        <BaseEdge
          id={id}
          path={path}
          interactionWidth={interactionWidth ?? 18}
          markerEnd={markerEnd}
          style={{ stroke: color, strokeWidth: selected ? 2 : 1.2, opacity }}
        />
        <EdgeLabelRenderer>
          <div
            className={cn(
              "nodrag nopan pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-4",
              selected
                ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-700"
                : "border-border bg-[color:var(--surface-card)] text-muted-foreground",
            )}
            style={{ left: labelX, top: labelY }}
          >
            {label}
            {confidence != null ? ` · ${confidence}%` : ""}
          </div>
        </EdgeLabelRenderer>
      </g>
    );
  }

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={isPath ? 2.8 : 1.5}
        strokeDasharray={isContext ? "4 4" : undefined}
        strokeLinecap="round"
        opacity={isPath ? 1 : 0.72}
        markerEnd={markerEnd}
      />
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={interactionWidth ?? 22}
        pointerEvents="stroke"
      />
      <EdgeLabelRenderer>
        <div
          className={cn(
            "nodrag nopan pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-4",
            selected
              ? "border-red-500/60 bg-red-500/10 text-red-700"
              : "border-border bg-[color:var(--surface-card)] text-muted-foreground",
          )}
          style={{ left: labelX, top: labelY }}
        >
          {label}
          {confidence != null ? ` · ${confidence}%` : ""}
        </div>
      </EdgeLabelRenderer>
      {isPath ? (
        <path
          d={path}
          fill="none"
          stroke={isTrust ? "#86efac" : "#fecaca"}
          strokeWidth={1}
          strokeLinecap="round"
          strokeDasharray="6 32"
          opacity={0.8}
        >
          <animate
            attributeName="stroke-dashoffset"
            from="38"
            to="0"
            dur="1.8s"
            repeatCount="indefinite"
          />
        </path>
      ) : null}
    </g>
  );
}

const edgeTypes = { attackEdge: AttackEdge };

function layoutNodes(visibleNodes: GNode[], visibleEdges: GEdge[]) {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  const nodeCount = visibleNodes.length;
  const nodeWidth = nodeCount <= 8 ? 210 : nodeCount <= 15 ? 188 : 170;
  const nodeHeight = 66;
  graph.setGraph({
    rankdir: "LR",
    nodesep: nodeCount <= 10 ? 72 : 54,
    ranksep: nodeCount <= 10 ? 190 : 150,
    marginx: 64,
    marginy: 76,
  });

  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  visibleNodes.forEach((node) =>
    graph.setNode(node.id, { width: nodeWidth, height: nodeHeight }),
  );
  visibleEdges.forEach((edge) => {
    if (visibleIds.has(edge.source) && visibleIds.has(edge.target))
      graph.setEdge(edge.source, edge.target, {});
  });
  dagre.layout(graph);

  return {
    nodeWidth,
    nodes: visibleNodes.map((node) => {
      const position = graph.node(node.id);
      return {
        ...node,
        x: position ? position.x - nodeWidth / 2 : 0,
        y: position ? position.y - nodeHeight / 2 : 0,
      };
    }),
  };
}

function layoutOverviewGroups(groups: GraphOverviewGroup[]) {
  const positions: Record<
    GraphOverviewGroupKey,
    { x: number; y: number; target: Position; source: Position }
  > = {
    dependency: { x: 0, y: 0, target: Position.Left, source: Position.Right },
    code: { x: 288, y: 0, target: Position.Left, source: Position.Right },
    build: { x: 576, y: 0, target: Position.Left, source: Position.Bottom },
    artifact: { x: 576, y: 220, target: Position.Top, source: Position.Left },
    runtime: { x: 288, y: 220, target: Position.Right, source: Position.Left },
    evidence: { x: 0, y: 220, target: Position.Right, source: Position.Left },
  };

  return groups.map((group) => ({ group, ...positions[group.key] }));
}

function riskPriority(risk?: string) {
  if (risk === "critical") return 4;
  if (risk === "high") return 3;
  if (risk === "medium") return 2;
  return 1;
}

function edgeHandleIds(
  source: { x: number; y: number } | undefined,
  target: { x: number; y: number } | undefined,
) {
  if (!source || !target)
    return { sourceHandle: "source-right", targetHandle: "target-left" };
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: "source-right", targetHandle: "target-left" }
      : { sourceHandle: "source-left", targetHandle: "target-right" };
  }
  return dy >= 0
    ? { sourceHandle: "source-bottom", targetHandle: "target-top" }
    : { sourceHandle: "source-top", targetHandle: "target-bottom" };
}

function relationColor(edge: GEdge, isPath: boolean) {
  if (isPath) return "#dc2626";
  const type = `${edge.type ?? ""} ${edge.label ?? ""}`.toUpperCase();
  if (/TRUST|ATTEST|PROVENANCE|SIGN/.test(type)) return "#16a34a";
  if (/BUILD|WORKFLOW|PRODUC|GENERAT/.test(type)) return "#ea580c";
  if (/DEPLOY|RUN|LOG|RUNTIME/.test(type)) return "#0284c7";
  if (/IMPORT|DEPEND|CALL|REFERENCE/.test(type)) return "#7c3aed";
  return "#64748b";
}

function AttackPathQueue({
  paths,
  nodes,
  selectedPathId,
  onSelect,
}: {
  paths: GPath[];
  nodes: GNode[];
  selectedPathId: string | null;
  onSelect: (path: GPath) => void;
}) {
  return (
    <aside className="flex min-h-[220px] min-w-0 flex-col overflow-hidden rounded-md border border-border bg-[color:var(--surface-card)] xl:min-h-0">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-foreground">攻击路径</div>
            <div className="mt-1 text-xs text-muted-foreground">
              按综合风险排序
            </div>
          </div>
          <span className="meta-chip tabular-nums">{paths.length}</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable] [scrollbar-width:thin]">
        {paths.length ? (
          paths.map((path, index) => {
            const selected = path.id === selectedPathId;
            const color = severityColor(path.severity);
            return (
              <button
                key={path.id}
                type="button"
                onClick={() => onSelect(path)}
                className={cn(
                  "w-full border-b border-border/70 px-4 py-3.5 text-left transition-colors",
                  selected
                    ? "bg-cyan-500/10 shadow-[inset_3px_0_0_rgb(6,182,212)]"
                    : "hover:bg-[color:var(--surface-inset)]",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    路径 {index + 1}
                  </span>
                  <span
                    className="rounded-full border px-2 py-0.5 text-[11px] font-bold"
                    style={{
                      borderColor: `${color}55`,
                      background: `${color}12`,
                      color,
                    }}
                  >
                    {severityLabel(path.severity)} {path.score}
                  </span>
                </div>
                <div
                  className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-foreground"
                  title={path.title}
                >
                  {path.title}
                </div>
                <div className="mt-3 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span
                    className="truncate"
                    title={nodeLabelById(nodes, path.entry_node_id)}
                  >
                    {nodeLabelById(nodes, path.entry_node_id)}
                  </span>
                  <ArrowRight className="size-3 shrink-0" />
                  <span
                    className="truncate"
                    title={nodeLabelById(nodes, path.target_node_id)}
                  >
                    {nodeLabelById(nodes, path.target_node_id)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>置信度 {confidencePercent(path.confidence)}%</span>
                  <span>{path.edge_ids?.length ?? 0} 个关系</span>
                </div>
              </button>
            );
          })
        ) : (
          <div className="grid h-full min-h-40 place-items-center px-6 text-center text-sm text-muted-foreground">
            暂无可研判的攻击路径
          </div>
        )}
      </div>
    </aside>
  );
}

function GraphInspector({
  node,
  edge,
  path,
  nodes,
  edges,
  viewMode,
  onClearNode,
  onClearEdge,
  onExpandNode,
}: {
  node: GNode | null;
  edge: GEdge | null;
  path: GPath | null;
  nodes: GNode[];
  edges: GEdge[];
  viewMode: GraphViewMode;
  onClearNode: () => void;
  onClearEdge: () => void;
  onExpandNode: (nodeId: string) => void;
}) {
  if (!node && edge) {
    const sourceNode = nodes.find((candidate) => candidate.id === edge.source);
    const targetNode = nodes.find((candidate) => candidate.id === edge.target);
    const edgeLabel = graphRelationLabel(edge.type, edge.label);
    return (
      <aside className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-md border border-cyan-500/35 bg-[color:var(--surface-card)] xl:min-h-0">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-md border border-cyan-500/35 bg-cyan-500/10 text-cyan-700">
              <ArrowRight className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-foreground">关系详情</div>
              <div
                className="mt-1 truncate font-mono text-[11px] text-muted-foreground"
                title={edge.id}
              >
                {edge.id}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="关闭关系详情"
              title="关闭关系详情"
              onClick={onClearEdge}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 [scrollbar-gutter:stable] [scrollbar-width:thin]">
          <div className="rounded-md border border-cyan-500/25 bg-cyan-500/5 p-3">
            <div className="text-xs font-semibold text-muted-foreground">
              关系类型
            </div>
            <div className="mt-1 text-base font-bold text-cyan-700">
              {edgeLabel}
            </div>
            {edge.type && edge.type !== edgeLabel ? (
              <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                {edge.type}
              </div>
            ) : null}
          </div>
          <div className="grid gap-2">
            <div className="rounded-md border border-border bg-[color:var(--surface-inset)] p-3">
              <div className="text-[11px] font-semibold text-muted-foreground">
                来源节点
              </div>
              <div
                className="mt-1 truncate text-sm font-bold text-foreground"
                title={sourceNode?.label || edge.source}
              >
                {sourceNode?.label || edge.source}
              </div>
              <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                {edge.source}
              </div>
            </div>
            <div className="flex justify-center text-cyan-700">
              <ArrowRight className="size-4" />
            </div>
            <div className="rounded-md border border-border bg-[color:var(--surface-inset)] p-3">
              <div className="text-[11px] font-semibold text-muted-foreground">
                目标节点
              </div>
              <div
                className="mt-1 truncate text-sm font-bold text-foreground"
                title={targetNode?.label || edge.target}
              >
                {targetNode?.label || edge.target}
              </div>
              <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                {edge.target}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-border px-3 py-2">
              <div className="text-xs text-muted-foreground">置信度</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-foreground">
                {edge.confidence != null
                  ? `${confidencePercent(edge.confidence)}%`
                  : "-"}
              </div>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <div className="text-xs text-muted-foreground">证据数量</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-foreground">
                {edge.evidence_ids?.length ?? 0}
              </div>
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-muted-foreground">
              关系原因
            </div>
            <p className="mt-2 text-sm leading-6 text-foreground">
              {edge.reason || "该关系由图谱实体和证据关联推导。"}
            </p>
          </div>
          {edge.evidence_ids?.length ? (
            <div>
              <div className="text-xs font-semibold text-muted-foreground">
                关联证据
              </div>
              <div className="mt-2 space-y-2">
                {edge.evidence_ids.map((id) => (
                  <div
                    key={id}
                    className="truncate rounded-md border border-border bg-[color:var(--surface-inset)] px-3 py-2 font-mono text-xs text-foreground"
                    title={id}
                  >
                    {id}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    );
  }

  if (!node) {
    return (
      <aside className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-md border border-border bg-[color:var(--surface-card)] xl:min-h-0">
        <div className="border-b border-border px-4 py-3">
          <div className="text-sm font-bold text-foreground">路径研判</div>
          <div className="mt-1 text-xs text-muted-foreground">
            风险结论与处置依据
          </div>
        </div>
        {path ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 [scrollbar-gutter:stable] [scrollbar-width:thin]">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{severityLabel(path.severity)}</Badge>
              <span
                className="text-2xl font-bold tabular-nums"
                style={{ color: severityColor(path.severity) }}
              >
                {path.score}
              </span>
              <span className="text-xs text-muted-foreground">/ 100</span>
              <span className="ml-auto meta-chip">
                置信度 {confidencePercent(path.confidence)}%
              </span>
            </div>
            <div>
              <div className="text-base font-bold leading-6 text-foreground">
                {path.title}
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {path.description || path.conclusion || "暂无路径描述"}
              </p>
            </div>
            <div className="rounded-md border border-border bg-[color:var(--surface-inset)] p-3">
              <div className="text-xs font-semibold text-muted-foreground">
                攻击入口
              </div>
              <div
                className="mt-1 truncate text-sm font-semibold text-foreground"
                title={nodeLabelById(nodes, path.entry_node_id)}
              >
                {nodeLabelById(nodes, path.entry_node_id)}
              </div>
              <div className="my-3 h-px bg-border" />
              <div className="text-xs font-semibold text-muted-foreground">
                影响目标
              </div>
              <div
                className="mt-1 truncate text-sm font-semibold text-foreground"
                title={nodeLabelById(nodes, path.target_node_id)}
              >
                {nodeLabelById(nodes, path.target_node_id)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-border px-3 py-2">
                <div className="text-xs text-muted-foreground">路径关系</div>
                <div className="mt-1 text-xl font-bold tabular-nums text-foreground">
                  {path.edge_ids?.length ?? 0}
                </div>
              </div>
              <div className="rounded-md border border-border px-3 py-2">
                <div className="text-xs text-muted-foreground">证据数量</div>
                <div className="mt-1 text-xl font-bold tabular-nums text-foreground">
                  {path.evidence_ids?.length ?? 0}
                </div>
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-muted-foreground">
                修复建议
              </div>
              <p className="mt-2 text-sm leading-6 text-foreground">
                {path.recommendation || "请结合节点证据复核处置优先级。"}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid flex-1 place-items-center px-6 text-center text-sm text-muted-foreground">
            当前没有路径结论
          </div>
        )}
      </aside>
    );
  }

  const config = nodeConfig(node);
  const Icon = config.Icon;
  const connectedEdges = edges.filter(
    (edge) => edge.source === node.id || edge.target === node.id,
  );
  const connectedIds = new Set(
    connectedEdges.map((edge) =>
      edge.source === node.id ? edge.target : edge.source,
    ),
  );
  const connectedNodes = nodes.filter((candidate) =>
    connectedIds.has(candidate.id),
  );

  return (
    <aside className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-md border border-border bg-[color:var(--surface-card)] xl:min-h-0">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-start gap-3">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-md border"
            style={{
              borderColor: `${config.color}45`,
              background: `${config.color}12`,
              color: config.color,
            }}
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div
              className="truncate text-sm font-bold text-foreground"
              title={node.label}
            >
              {node.label}
            </div>
            <div
              className="mt-1 truncate font-mono text-[11px] text-muted-foreground"
              title={node.id}
            >
              {node.id}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="关闭节点详情"
            title="关闭节点详情"
            onClick={onClearNode}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-4 mt-3 grid h-9 grid-cols-3 rounded-md">
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="connections">上下游</TabsTrigger>
          <TabsTrigger value="evidence">证据</TabsTrigger>
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 [scrollbar-gutter:stable] [scrollbar-width:thin]">
          <TabsContent value="overview" className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              <span
                className="rounded-full border px-2 py-0.5 text-xs font-bold"
                style={{
                  borderColor: `${config.color}45`,
                  background: `${config.color}12`,
                  color: config.color,
                }}
              >
                {config.label}
              </span>
              <Badge variant="secondary">{severityLabel(node.risk)}</Badge>
            </div>
            <div className="grid gap-2 text-sm">
              {[
                ["评分", node.score != null ? `${node.score}/100` : "-"],
                ["来源", node.source_model || node.source || "-"],
                ["关联关系", String(connectedEdges.length)],
                [
                  "是否在当前路径",
                  path?.node_ids?.includes(node.id) ? "是" : "否",
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-[color:var(--surface-inset)] px-3 py-2"
                >
                  <span className="text-xs font-semibold text-muted-foreground">
                    {label}
                  </span>
                  <span
                    className="min-w-0 truncate text-right text-xs font-semibold text-foreground"
                    title={value}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
            {node.description ? (
              <p className="text-sm leading-6 text-muted-foreground">
                {node.description}
              </p>
            ) : null}
            {viewMode === "focus" && connectedNodes.length ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => onExpandNode(node.id)}
              >
                <Network className="size-4" />
                展开直接上下游
              </Button>
            ) : null}
          </TabsContent>
          <TabsContent value="connections" className="mt-3 space-y-2">
            {connectedEdges.length ? (
              connectedEdges.map((edge) => {
                const outgoing = edge.source === node.id;
                const otherId = outgoing ? edge.target : edge.source;
                const otherNode = nodes.find(
                  (candidate) => candidate.id === otherId,
                );
                return (
                  <div
                    key={edge.id}
                    className="flex items-center gap-3 rounded-md border border-border bg-[color:var(--surface-inset)] p-3"
                  >
                    <ArrowRight
                      className={cn(
                        "size-4 shrink-0 text-cyan-600",
                        !outgoing && "rotate-180",
                      )}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {otherNode?.label || otherId}
                      </div>
                      <div className="mt-1 truncate text-[11px] text-muted-foreground">
                        {edge.type || edge.label}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">
                暂无上下游关系
              </div>
            )}
          </TabsContent>
          <TabsContent value="evidence" className="mt-3">
            {node.evidence_ids?.length ? (
              <div className="space-y-2">
                {node.evidence_ids.map((id) => (
                  <div
                    key={id}
                    className="truncate rounded-md border border-border bg-[color:var(--surface-inset)] px-3 py-2 font-mono text-xs text-foreground"
                    title={id}
                  >
                    {id}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">
                该节点暂无独立证据编号
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </aside>
  );
}

export function AttackChainGraph({
  workspace,
}: {
  workspace: SecurityWorkspace;
}) {
  const graph = workspace.graph;
  const rawNodes: GNode[] = graph?.nodes ?? [];
  const rawEdges: GEdge[] = graph?.edges ?? [];
  const attackPaths: GPath[] = graph?.attack_paths ?? [];
  const graphSummary = graph?.summary;
  const orderedPaths = useMemo(
    () => [...attackPaths].sort((left, right) => right.score - left.score),
    [attackPaths],
  );

  const [selectedPathId, setSelectedPathId] = useState<string | null>(
    orderedPaths[0]?.id ?? null,
  );
  const [selectedNode, setSelectedNode] = useState<GNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GEdge | null>(null);
  const [viewMode, setViewMode] = useState<GraphViewMode>(
    orderedPaths.length ? "focus" : "all",
  );
  const [selectedGroupKey, setSelectedGroupKey] =
    useState<GraphOverviewGroupKey | null>(null);
  const [groupNodeLimit, setGroupNodeLimit] = useState(24);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [fullscreen, setFullscreen] = useState(false);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!orderedPaths.length) {
      setSelectedPathId(null);
      setViewMode("all");
      return;
    }
    if (
      !selectedPathId ||
      !orderedPaths.some((path) => path.id === selectedPathId)
    ) {
      setSelectedPathId(orderedPaths[0].id);
      setViewMode("focus");
    }
  }, [orderedPaths, selectedPathId]);

  const selectedPath =
    orderedPaths.find((path) => path.id === selectedPathId) ??
    orderedPaths[0] ??
    null;
  const focusNodeIdList = useMemo(
    () => buildAttackPathFocusNodeIds(selectedPath, rawNodes, rawEdges, 20),
    [selectedPath, rawNodes, rawEdges],
  );
  const focusNodeIds = useMemo(
    () => new Set(focusNodeIdList),
    [focusNodeIdList],
  );
  const pathEdgeIds = useMemo(
    () => new Set(selectedPath?.edge_ids ?? []),
    [selectedPath],
  );

  const graphOverview = useMemo(
    () => buildGraphOverview(rawNodes, rawEdges),
    [rawNodes, rawEdges],
  );
  const overviewLayout = useMemo(
    () => layoutOverviewGroups(graphOverview.groups),
    [graphOverview.groups],
  );
  const selectedGroup = useMemo(
    () =>
      graphOverview.groups.find((group) => group.key === selectedGroupKey) ??
      null,
    [graphOverview.groups, selectedGroupKey],
  );
  const selectedGroupNodeIds = useMemo(
    () => new Set(selectedGroup?.nodeIds ?? []),
    [selectedGroup],
  );
  const selectedGroupNodes = useMemo(
    () =>
      rawNodes
        .filter((node) => selectedGroupNodeIds.has(node.id))
        .sort(
          (left, right) =>
            riskPriority(right.risk) - riskPriority(left.risk) ||
            (right.score ?? 0) - (left.score ?? 0) ||
            left.label.localeCompare(right.label, "zh-CN"),
        ),
    [rawNodes, selectedGroupNodeIds],
  );
  const displayedGroupNodes = useMemo(
    () => selectedGroupNodes.slice(0, groupNodeLimit),
    [selectedGroupNodes, groupNodeLimit],
  );

  const visibleNodeIds = useMemo(() => {
    if (viewMode === "all")
      return new Set(displayedGroupNodes.map((node) => node.id));
    if (!selectedPath) return new Set<string>();
    return new Set([...focusNodeIdList, ...expandedNodeIds]);
  }, [
    viewMode,
    selectedPath,
    displayedGroupNodes,
    focusNodeIdList,
    expandedNodeIds,
  ]);
  const visibleNodes = useMemo(
    () => rawNodes.filter((node) => visibleNodeIds.has(node.id)),
    [rawNodes, visibleNodeIds],
  );
  const visibleEdges = useMemo(
    () =>
      rawEdges.filter(
        (edge) =>
          visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target),
      ),
    [rawEdges, visibleNodeIds],
  );
  const layout = useMemo(() => {
    return layoutNodes(visibleNodes, visibleEdges);
  }, [visibleNodes, visibleEdges]);
  const flowPositionById = useMemo(
    () =>
      new Map(layout.nodes.map((node) => [node.id, { x: node.x, y: node.y }])),
    [layout.nodes],
  );
  const overviewPositionById = useMemo(
    () =>
      new Map(
        overviewLayout.map(({ group, x, y }) => [
          `group-${group.key}`,
          { x, y },
        ]),
      ),
    [overviewLayout],
  );

  const flowNodes: Node[] = useMemo(() => {
    if (viewMode === "all" && !selectedGroup) {
      return overviewLayout.map(({ group, x, y, target, source }) => ({
        id: `group-${group.key}`,
        type: "clusterBubble",
        position: { x, y },
        data: {
          group,
          targetPosition: target,
          sourcePosition: source,
        },
        draggable: false,
        selectable: true,
      }));
    }
    return layout.nodes.map((node) => ({
      id: node.id,
      type: "graphNode",
      position: { x: node.x, y: node.y },
      data: {
        label: node.label,
        raw: node,
        highlighted: focusNodeIds.has(node.id),
        context: expandedNodeIds.has(node.id) && !focusNodeIds.has(node.id),
        dimmed: false,
        width: layout.nodeWidth,
        riskLevel: node.risk,
      },
      draggable: false,
      selectable: true,
    }));
  }, [
    viewMode,
    selectedGroup,
    overviewLayout,
    layout,
    focusNodeIds,
    expandedNodeIds,
  ]);

  const flowEdges: Edge[] = useMemo(() => {
    if (viewMode === "all" && !selectedGroup) {
      return graphOverview.relations.map((relation) => {
        const source = `group-${relation.source}`;
        const target = `group-${relation.target}`;
        const handles = edgeHandleIds(
          overviewPositionById.get(source),
          overviewPositionById.get(target),
        );
        const relationEdge = rawEdges.find((edge) =>
          relation.edgeIds.includes(edge.id),
        );
        const color = relationEdge
          ? relationColor(relationEdge, false)
          : "#64748b";
        const selected = relationEdge?.id === selectedEdge?.id;
        return {
          id: relation.id,
          source,
          target,
          ...handles,
          type: "attackEdge",
          markerEnd: { type: MarkerType.ArrowClosed, color },
          style: { opacity: selected ? 1 : 0.82 },
          data: {
            label: relation.label,
            confidence: undefined,
            selected,
            isAggregate: true,
            edgeIds: relation.edgeIds,
            color,
          },
        };
      });
    }
    return visibleEdges.map((edge) => {
      const isPath = pathEdgeIds.has(edge.id);
      const isContext = viewMode === "focus" && !isPath;
      const isTrust =
        edge.type?.includes("TRUST_") ||
        edge.type?.includes("ATTESTATION_") ||
        edge.type?.includes("PROVENANCE");
      const handles = edgeHandleIds(
        flowPositionById.get(edge.source),
        flowPositionById.get(edge.target),
      );
      const color = relationColor(edge, isPath);
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        ...handles,
        type: "attackEdge",
        markerEnd: { type: MarkerType.ArrowClosed, color },
        style: { opacity: selectedEdge?.id === edge.id ? 1 : 0.88 },
        data: {
          isPath,
          isContext,
          isTrust,
          label: graphRelationLabel(edge.type, edge.label),
          confidence:
            edge.confidence != null
              ? confidencePercent(edge.confidence)
              : undefined,
          selected: selectedEdge?.id === edge.id,
          color,
        },
      };
    });
  }, [
    viewMode,
    selectedGroup,
    graphOverview.relations,
    visibleEdges,
    pathEdgeIds,
    overviewPositionById,
    flowPositionById,
    rawEdges,
    selectedEdge,
  ]);

  useEffect(() => {
    if (!flowInstance || !flowNodes.length) return;
    const timer = window.setTimeout(() => {
      flowInstance.fitView({
        padding: viewMode === "focus" ? 0.2 : selectedGroup ? 0.14 : 0.1,
        duration: 450,
        maxZoom: viewMode === "focus" ? 1.25 : selectedGroup ? 1.05 : 1.15,
      });
    }, 160);
    return () => window.clearTimeout(timer);
  }, [
    flowInstance,
    selectedPathId,
    viewMode,
    selectedGroup,
    groupNodeLimit,
    flowNodes.length,
    expandedNodeIds,
  ]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      if (!flowInstance || !flowNodes.length) return;
      window.setTimeout(
        () =>
          flowInstance.fitView({
            padding: viewMode === "focus" ? 0.2 : 0.12,
            duration: 280,
          }),
        120,
      );
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [flowInstance, fullscreen, flowNodes.length, viewMode, selectedGroup]);

  const selectPath = useCallback((path: GPath) => {
    setSelectedPathId(path.id);
    setSelectedNode(null);
    setSelectedEdge(null);
    setExpandedNodeIds(new Set());
    setSelectedGroupKey(null);
    setViewMode("focus");
  }, []);

  const expandNode = useCallback(
    (nodeId: string) => {
      const neighbors: string[] = [];
      for (const edge of rawEdges) {
        if (edge.source === nodeId) neighbors.push(edge.target);
        if (edge.target === nodeId) neighbors.push(edge.source);
        if (neighbors.length >= 12) break;
      }
      setExpandedNodeIds((current) => new Set([...current, ...neighbors]));
    },
    [rawEdges],
  );

  const selectGraphNode = useCallback((_event: unknown, node: Node) => {
    const data = node.data as {
      raw?: GNode;
      group?: GraphOverviewGroup;
    };
    if (data.group) {
      setSelectedGroupKey(data.group.key);
      setGroupNodeLimit(24);
      setSelectedNode(null);
      setSelectedEdge(null);
      return;
    }
    if (data.raw) {
      setSelectedNode(data.raw);
      setSelectedEdge(null);
    }
  }, []);

  const expandGraphNode = useCallback(
    (_event: unknown, node: Node) => {
      const raw = (node.data as { raw?: GNode }).raw;
      if (!raw) return;
      setSelectedNode(raw);
      setSelectedEdge(null);
      if (viewMode === "focus") expandNode(raw.id);
    },
    [viewMode, expandNode],
  );

  const showGraphOverview = useCallback(() => {
    setViewMode("all");
    setSelectedGroupKey(null);
    setSelectedNode(null);
    setSelectedEdge(null);
    setGroupNodeLimit(24);
  }, []);

  const selectGraphEdge = useCallback(
    (_event: unknown, edge: Edge) => {
      const data = edge.data as { edgeIds?: string[] } | undefined;
      const edgeId = data?.edgeIds?.[0] ?? edge.id;
      const raw = rawEdges.find((candidate) => candidate.id === edgeId);
      if (!raw) return;
      setSelectedEdge(raw);
      setSelectedNode(null);
    },
    [rawEdges],
  );

  if (!rawNodes.length) {
    return (
      <div className="grid h-full place-items-center rounded-md border border-border bg-[color:var(--surface-card)] text-center">
        <div>
          <Network className="mx-auto size-12 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            运行扫描后生成攻击链图谱
          </p>
        </div>
      </div>
    );
  }

  const score = selectedPath?.score ?? graphSummary?.risk_score ?? 0;
  const confidence = confidencePercent(
    selectedPath?.confidence ?? graphSummary?.average_path_confidence,
  );
  const pathCount =
    graphSummary?.actionable_attack_path_count ??
    graphSummary?.attack_path_count ??
    orderedPaths.length;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col gap-3 overflow-hidden",
        fullscreen
          ? "fixed inset-0 z-50 h-svh bg-background p-3"
          : "h-full",
      )}
    >
      <section className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-3 rounded-md border border-border bg-[color:var(--surface-card)] px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldAlert
            className="size-4"
            style={{ color: severityColor(selectedPath?.severity) }}
          />
          <span className="text-xs font-semibold text-muted-foreground">
            最高风险
          </span>
          <span
            className="text-xl font-bold tabular-nums"
            style={{ color: severityColor(selectedPath?.severity) }}
          >
            {score}
          </span>
        </div>
        <div className="h-5 w-px bg-border" />
        <div className="text-xs text-muted-foreground">
          置信度{" "}
          <strong className="font-bold text-foreground">{confidence}%</strong>
        </div>
        <div className="text-xs text-muted-foreground">
          攻击路径{" "}
          <strong className="font-bold text-foreground">{pathCount}</strong>
        </div>
        <div className="text-xs text-muted-foreground">
          图谱节点{" "}
          <strong className="font-bold text-foreground">
            {rawNodes.length}
          </strong>
        </div>
        <div
          className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground"
          title={selectedPath?.title}
        >
          {selectedPath?.title || "全部供应链关系"}
        </div>
        <div className="flex items-center rounded-md border border-border bg-[color:var(--surface-inset)] p-0.5">
          <Button
            variant={viewMode === "focus" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 rounded-sm px-2.5 text-xs"
            disabled={!selectedPath}
            onClick={() => {
              setViewMode("focus");
              setSelectedGroupKey(null);
              setSelectedNode(null);
              setSelectedEdge(null);
            }}
          >
            <Eye className="size-3.5" />
            聚焦路径
          </Button>
          <Button
            variant={viewMode === "all" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 rounded-sm px-2.5 text-xs"
            onClick={showGraphOverview}
          >
            <Network className="size-3.5" />
            全部图谱
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => setFullscreen((value) => !value)}
        >
          {fullscreen ? (
            <Minimize2 className="size-4" />
          ) : (
            <Maximize2 className="size-4" />
          )}
          {fullscreen ? "退出全屏" : "全屏"}
        </Button>
      </section>

      <div className="grid min-h-0 flex-1 auto-rows-min gap-3 overflow-y-auto xl:auto-rows-auto xl:grid-cols-[260px_minmax(0,1fr)_340px] xl:overflow-hidden">
        <AttackPathQueue
          paths={orderedPaths}
          nodes={rawNodes}
          selectedPathId={selectedPath?.id ?? null}
          onSelect={selectPath}
        />

        <main
          ref={containerRef}
          className="flex min-h-[520px] min-w-0 flex-col overflow-hidden rounded-md border border-border bg-[color:var(--surface-card)] xl:min-h-0"
        >
          <div className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
            <div className="flex min-w-0 items-center gap-2">
              {viewMode === "all" && selectedGroup ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title="返回图谱总览"
                  onClick={showGraphOverview}
                >
                  <ArrowLeft className="size-4" />
                </Button>
              ) : null}
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-foreground">
                  {viewMode === "focus"
                    ? "供应链攻击路径"
                    : selectedGroup
                      ? OVERVIEW_GROUP_MAP[selectedGroup.key].label
                      : "供应链图谱总览"}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {viewMode === "focus"
                    ? `${focusNodeIdList.length} 个路径节点${expandedNodeIds.size ? `，已展开 ${expandedNodeIds.size} 个上下文节点` : ""}`
                    : selectedGroup
                      ? `显示 ${displayedGroupNodes.length}/${selectedGroup.nodeCount} 个节点，按风险优先级排列`
                      : `${rawNodes.length} 个节点已归入 ${graphOverview.groups.length} 个业务阶段，连线数字代表跨阶段关系数量`}
                </div>
              </div>
            </div>
            {viewMode === "focus" ? (
              <div className="hidden items-center gap-1.5 text-[10px] font-semibold text-muted-foreground 2xl:flex">
                {ATTACK_STAGES.map((stage, index) => (
                  <span
                    key={stage}
                    className="inline-flex items-center gap-1.5"
                  >
                    <span className="rounded-sm border border-border bg-[color:var(--surface-inset)] px-2 py-1">
                      {stage}
                    </span>
                    {index < ATTACK_STAGES.length - 1 ? (
                      <ArrowRight className="size-3" />
                    ) : null}
                  </span>
                ))}
              </div>
            ) : selectedGroup &&
              displayedGroupNodes.length < selectedGroup.nodeCount ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setGroupNodeLimit((current) => current + 24)}
              >
                <Layers className="size-3.5" />
                再显示 24 个
              </Button>
            ) : viewMode === "all" && !selectedGroup ? (
              <div className="hidden items-center gap-2 text-[11px] text-muted-foreground 2xl:flex">
                <Layers className="size-3.5" />
                点击阶段查看具体节点
              </div>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 bg-[color:var(--surface-inset)]">
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodeClick={selectGraphNode}
              onNodeDoubleClick={expandGraphNode}
              onEdgeClick={selectGraphEdge}
              onPaneClick={() => {
                setSelectedNode(null);
                setSelectedEdge(null);
              }}
              onInit={setFlowInstance}
              fitView
              fitViewOptions={{ padding: viewMode === "focus" ? 0.2 : 0.1 }}
              nodesDraggable
              nodesConnectable={false}
              elementsSelectable
              minZoom={viewMode === "focus" ? 0.25 : 0.18}
              maxZoom={2.2}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="var(--border)" gap={40} size={0.6} />
              <Controls
                showInteractive={false}
                className="!overflow-hidden !rounded-md !border !border-border !bg-[color:var(--surface-card)] !shadow-none"
              />
              {fullscreen && viewMode === "all" ? (
                <MiniMap
                  pannable
                  zoomable
                  className="!rounded-md !border !border-border !bg-[color:var(--surface-card)] !shadow-none"
                  maskColor="color-mix(in oklch, var(--background) 90%, transparent)"
                  nodeColor={(node) => {
                    const data = node.data as {
                      raw?: GNode;
                      group?: GraphOverviewGroup;
                    };
                    if (data.group)
                      return OVERVIEW_GROUP_MAP[data.group.key].color;
                    return data.raw ? nodeConfig(data.raw).color : "#64748b";
                  }}
                />
              ) : null}
            </ReactFlow>
          </div>
        </main>

        <GraphInspector
          node={selectedNode}
          edge={selectedEdge}
          path={selectedPath}
          nodes={rawNodes}
          edges={rawEdges}
          viewMode={viewMode}
          onClearNode={() => setSelectedNode(null)}
          onClearEdge={() => setSelectedEdge(null)}
          onExpandNode={expandNode}
        />
      </div>
    </div>
  );
}
