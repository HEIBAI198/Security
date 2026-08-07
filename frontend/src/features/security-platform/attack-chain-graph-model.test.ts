import { describe, expect, it } from "vitest";
import type {
  SecurityAttackPath,
  SecurityGraphEdge,
  SecurityGraphNode,
} from "@/lib/security-api";
import {
  buildAttackPathFocusNodeIds,
  buildGraphOverview,
  graphRelationLabel,
} from "./attack-chain-graph-model";

const nodes: SecurityGraphNode[] = [
  {
    id: "dependency",
    label: "axios@1.6.8",
    type: "DependencyPackage",
    risk: "high",
    description: "",
  },
  {
    id: "code",
    label: "src/client.ts",
    type: "CodeFile",
    risk: "medium",
    description: "",
  },
  {
    id: "build",
    label: "desktop-release.yml",
    type: "CIWorkflow",
    risk: "high",
    description: "",
  },
  {
    id: "artifact",
    label: "desktop.tar.gz",
    type: "BuildArtifact",
    risk: "critical",
    description: "",
  },
  {
    id: "runtime",
    label: "desktop-app",
    type: "RuntimeService",
    risk: "critical",
    description: "",
  },
  ...Array.from({ length: 30 }, (_, index) => ({
    id: `context-${index}`,
    label: `context-${index}`,
    type: "DependencyPackage",
    risk: "low",
    description: "",
  })),
];

const edges: SecurityGraphEdge[] = [
  { id: "e1", source: "dependency", target: "code", label: "imported by" },
  { id: "e2", source: "code", target: "build", label: "built by" },
  { id: "e3", source: "build", target: "artifact", label: "produces" },
  { id: "e4", source: "artifact", target: "runtime", label: "deployed to" },
];

const path: SecurityAttackPath = {
  id: "path-1",
  title: "依赖到运行期异常",
  category: "supply-chain",
  severity: "critical",
  score: 100,
  description: "",
  recommendation: "",
  entry_node_id: "dependency",
  target_node_id: "runtime",
  edge_ids: edges.map((edge) => edge.id),
  node_ids: nodes.map((node) => node.id),
};

describe("buildAttackPathFocusNodeIds", () => {
  it("优先使用真实路径边，不把全部关联节点带入聚焦视图", () => {
    expect(buildAttackPathFocusNodeIds(path, nodes, edges)).toEqual([
      "dependency",
      "code",
      "build",
      "artifact",
      "runtime",
    ]);
  });

  it("缺少路径边时回退到 node_ids，并限制最大节点数", () => {
    const fallbackPath = { ...path, edge_ids: [] };
    const focused = buildAttackPathFocusNodeIds(fallbackPath, nodes, edges, 8);

    expect(focused).toHaveLength(8);
    expect(focused[0]).toBe("dependency");
    expect(focused).toContain("runtime");
  });

  it("可以通过 path_steps 匹配路径节点", () => {
    const stepPath = {
      ...path,
      edge_ids: [],
      node_ids: [],
      path_steps: [
        {
          source: "axios@1.6.8",
          source_type: "DependencyPackage",
          target: "src/client.ts",
          target_type: "CodeFile",
        },
        {
          source: "src/client.ts",
          source_type: "CodeFile",
          target: "desktop-release.yml",
          target_type: "CIWorkflow",
        },
      ],
    };

    expect(buildAttackPathFocusNodeIds(stepPath, nodes, edges)).toEqual([
      "dependency",
      "code",
      "build",
      "runtime",
    ]);
  });
});

describe("buildGraphOverview", () => {
  it("按供应链阶段聚合节点和跨阶段关系", () => {
    const overview = buildGraphOverview(nodes, edges);

    expect(
      overview.groups.map((group) => [group.key, group.nodeCount]),
    ).toEqual([
      ["dependency", 31],
      ["code", 1],
      ["build", 1],
      ["artifact", 1],
      ["runtime", 1],
    ]);
    expect(overview.relations).toEqual([
      {
        id: "dependency->code",
        source: "dependency",
        target: "code",
        count: 1,
        labels: ["被导入"],
        label: "被导入 1 条",
        edgeIds: ["e1"],
      },
      {
        id: "code->build",
        source: "code",
        target: "build",
        count: 1,
        labels: ["由构建"],
        label: "由构建 1 条",
        edgeIds: ["e2"],
      },
      {
        id: "build->artifact",
        source: "build",
        target: "artifact",
        count: 1,
        labels: ["生成"],
        label: "生成 1 条",
        edgeIds: ["e3"],
      },
      {
        id: "artifact->runtime",
        source: "artifact",
        target: "runtime",
        count: 1,
        labels: ["部署到"],
        label: "部署到 1 条",
        edgeIds: ["e4"],
      },
    ]);
  });

  it("分别统计阶段内部关系和严重风险节点", () => {
    const overview = buildGraphOverview(nodes, [
      ...edges,
      {
        id: "internal",
        source: "dependency",
        target: "context-0",
        label: "depends on",
      },
    ]);
    const dependency = overview.groups.find(
      (group) => group.key === "dependency",
    );

    expect(dependency?.internalRelationCount).toBe(1);
    expect(dependency?.riskCount).toBe(1);
    expect(dependency?.criticalCount).toBe(0);
  });

  it("把机器关系类型转换为可读的中文标签", () => {
    expect(graphRelationLabel("DEPENDS_ON")).toBe("依赖");
    expect(graphRelationLabel("TRIGGERS", "触发构建")).toBe("触发构建");
  });
});
