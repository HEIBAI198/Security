import type {
  SecurityAttackPath,
  SecurityGraphEdge,
  SecurityGraphNode,
} from "@/lib/security-api";

export type GraphOverviewGroupKey =
  | "dependency"
  | "code"
  | "build"
  | "artifact"
  | "runtime"
  | "evidence";

export interface GraphOverviewGroup {
  key: GraphOverviewGroupKey;
  nodeIds: string[];
  nodeCount: number;
  riskCount: number;
  criticalCount: number;
  internalRelationCount: number;
}

export interface GraphOverviewRelation {
  id: string;
  source: GraphOverviewGroupKey;
  target: GraphOverviewGroupKey;
  count: number;
  labels: string[];
  label: string;
  edgeIds: string[];
}

const GROUP_ORDER: GraphOverviewGroupKey[] = [
  "dependency",
  "code",
  "build",
  "artifact",
  "runtime",
  "evidence",
];

const NODE_GROUPS: Record<string, GraphOverviewGroupKey> = {
  DependencyPackage: "dependency",
  Vulnerability: "dependency",
  Finding: "dependency",
  SourceCommit: "code",
  CodeFile: "code",
  CIStep: "build",
  CIWorkflow: "build",
  Workflow: "build",
  TrustedBuilder: "build",
  BuildArtifact: "artifact",
  Attestation: "artifact",
  TrustFinding: "artifact",
  RuntimeService: "runtime",
  LogEvent: "runtime",
  Asset: "runtime",
  MultimodalEvidence: "evidence",
  AudioEvidence: "evidence",
  VisualEvidence: "evidence",
  MultimodalFinding: "evidence",
  RecognizedEntity: "evidence",
  AttackStage: "evidence",
  EvidenceChain: "evidence",
};

const RELATION_LABELS: Record<string, string> = {
  IMPORTS: "导入",
  IMPORTED_BY: "被导入",
  IMPORTED: "被导入",
  DEPENDS_ON: "依赖",
  USED_BY: "被使用",
  BUILT_BY: "由构建",
  BUILT: "由构建",
  BUILDS: "构建",
  PRODUCES: "生成",
  GENERATED: "生成",
  DEPLOYED_TO: "部署到",
  DEPLOYED: "部署到",
  RUNS_ON: "运行于",
  ATTESTATION: "来源证明",
  ATTESTATION_SUBJECT: "证明主体",
  PROVENANCE: "来源追溯",
  TRIGGERS: "触发",
  CALLS: "调用",
  REFERENCES: "引用",
  ASSOCIATED_WITH: "关联",
};

export function graphRelationLabel(
  type?: string,
  label?: string,
  fallback = "关联",
) {
  const raw = String(label || type || "")
    .trim()
    .replace(/[_-]+/g, " ");
  if (!raw) return fallback;
  const key = raw.replace(/\s+/g, "_").toUpperCase();
  return RELATION_LABELS[key] || String(label || type).trim();
}

function overviewRelationLabel(labels: string[], count: number) {
  const unique = [...new Set(labels.filter(Boolean))];
  if (!unique.length) return `${count} 条关系`;
  const preview = unique.slice(0, 2).join("、");
  return unique.length > 2 || count > unique.length
    ? `${preview}等 ${count} 条`
    : `${preview} ${count} 条`;
}

export function graphOverviewGroupKey(nodeType?: string) {
  return NODE_GROUPS[nodeType ?? ""] ?? "evidence";
}

export function buildGraphOverview(
  nodes: SecurityGraphNode[],
  edges: SecurityGraphEdge[],
) {
  const nodeGroupById = new Map(
    nodes.map((node) => [node.id, graphOverviewGroupKey(node.type)]),
  );
  const groups = new Map<GraphOverviewGroupKey, GraphOverviewGroup>(
    GROUP_ORDER.map((key) => [
      key,
      {
        key,
        nodeIds: [],
        nodeCount: 0,
        riskCount: 0,
        criticalCount: 0,
        internalRelationCount: 0,
      },
    ]),
  );

  for (const node of nodes) {
    const key = nodeGroupById.get(node.id) ?? "evidence";
    const group = groups.get(key)!;
    group.nodeIds.push(node.id);
    group.nodeCount += 1;
    if (["critical", "high", "medium"].includes(node.risk))
      group.riskCount += 1;
    if (node.risk === "critical") group.criticalCount += 1;
  }

  const relationCounts = new Map<string, GraphOverviewRelation>();
  for (const edge of edges) {
    const source = nodeGroupById.get(edge.source);
    const target = nodeGroupById.get(edge.target);
    if (!source || !target) continue;
    if (source === target) {
      groups.get(source)!.internalRelationCount += 1;
      continue;
    }
    const id = `${source}->${target}`;
    const relation = relationCounts.get(id);
    if (relation) {
      relation.count += 1;
      relation.labels.push(graphRelationLabel(edge.type, edge.label));
      relation.edgeIds.push(edge.id);
      relation.label = overviewRelationLabel(relation.labels, relation.count);
    } else {
      const labels = [graphRelationLabel(edge.type, edge.label)];
      relationCounts.set(id, {
        id,
        source,
        target,
        count: 1,
        labels,
        label: overviewRelationLabel(labels, 1),
        edgeIds: [edge.id],
      });
    }
  }

  return {
    groups: GROUP_ORDER.map((key) => groups.get(key)!).filter(
      (group) => group.nodeCount > 0,
    ),
    relations: [...relationCounts.values()],
  };
}

function normalizeGraphLabel(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function findStepNodeId(
  label: string | undefined,
  type: string | undefined,
  nodes: SecurityGraphNode[],
) {
  const normalizedLabel = normalizeGraphLabel(label);
  const normalizedType = normalizeGraphLabel(type);
  if (!normalizedLabel) return undefined;

  const candidates = nodes.filter((node) => {
    if (!normalizedType) return true;
    return normalizeGraphLabel(node.type) === normalizedType;
  });
  const exact = candidates.find(
    (node) => normalizeGraphLabel(node.label) === normalizedLabel,
  );
  if (exact) return exact.id;
  return candidates.find((node) => {
    const nodeLabel = normalizeGraphLabel(node.label);
    return (
      nodeLabel.includes(normalizedLabel) || normalizedLabel.includes(nodeLabel)
    );
  })?.id;
}

export function buildAttackPathFocusNodeIds(
  path: SecurityAttackPath | null | undefined,
  nodes: SecurityGraphNode[],
  edges: SecurityGraphEdge[],
  maxNodes = 20,
) {
  if (!path || maxNodes <= 0) return [];

  const validNodeIds = new Set(nodes.map((node) => node.id));
  const edgesById = new Map(edges.map((edge) => [edge.id, edge]));
  const ordered: string[] = [];
  const selected = new Set<string>();
  const add = (id?: string | null) => {
    if (!id || !validNodeIds.has(id) || selected.has(id)) return;
    selected.add(id);
    ordered.push(id);
  };

  add(path.entry_node_id);
  for (const edgeId of path.edge_ids ?? []) {
    const edge = edgesById.get(edgeId);
    add(edge?.source);
    add(edge?.target);
  }
  for (const step of path.path_steps ?? []) {
    add(findStepNodeId(step.source, step.source_type, nodes));
    add(findStepNodeId(step.target, step.target_type, nodes));
  }
  add(path.target_node_id);

  const fallbackIds = path.node_ids ?? [];
  const minimumUsefulSize = Math.min(4, fallbackIds.length);
  if (ordered.length < minimumUsefulSize) {
    for (const id of fallbackIds) add(id);
  }

  const limited = ordered.slice(0, maxNodes);
  if (
    path.target_node_id &&
    validNodeIds.has(path.target_node_id) &&
    !limited.includes(path.target_node_id)
  ) {
    if (limited.length === maxNodes)
      limited[limited.length - 1] = path.target_node_id;
    else limited.push(path.target_node_id);
  }
  return limited;
}
