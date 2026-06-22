import { apiBase } from './config.js';
import { listCases } from './cases.js';
import { createWorkspace, evidenceGaps, getLatestWorkspace, getWorkspace, getWorkspaceReport, keyFindings, moduleStatusFromWorkspace, nextActions, runModuleScan, runTrace, sanitizeForAgent, summarizeGraph, summarizeWorkspace, workspaceIdOf, } from './supplyguard-client.js';
import { ArtifactTrustScanSchema, CicdScanSchema, CreateWorkspaceSchema, DependencyScanSchema, LogScanSchema, ReachabilityScanSchema, ReportSchema, RunTraceSchema, WorkspaceIdSchema, textResult, } from './schemas.js';
function errorResult(error) {
    return textResult({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
    });
}
function workspaceResult(workspace, module) {
    const status = moduleStatusFromWorkspace(workspace, module);
    return textResult({
        status: status.status,
        workspaceId: workspaceIdOf(workspace),
        summary: summarizeWorkspace(workspace),
        keyFindings: keyFindings(workspace),
        evidenceGaps: evidenceGaps(workspace),
        nextActions: nextActions(workspace),
        completedModules: status.completedModules,
        failedModules: status.failedModules,
    });
}
export function registerTools(server) {
    server.registerTool('supplyguard.list_cases', {
        title: '列出内置案例',
        description: '读取 cases/*/case.yml，返回 3CX、SolarWinds 等防御性供应链案例摘要。',
        inputSchema: {},
    }, async () => {
        try {
            const cases = await listCases();
            return textResult({
                status: 'success',
                summary: { count: cases.length },
                raw: cases.map(({ raw: _raw, ...item }) => sanitizeForAgent(item)),
                nextActions: ['选择一个 caseId 创建工作区', '继续执行 supplyguard.create_workspace'],
            });
        }
        catch (error) {
            return errorResult(error);
        }
    });
    server.registerTool('supplyguard.get_latest_workspace', {
        title: '读取最新工作区',
        description: '调用 SupplyGuard 后端，返回最新 workspace 的摘要。',
        inputSchema: {},
    }, async () => {
        try {
            const workspace = await getLatestWorkspace();
            return workspaceResult(workspace);
        }
        catch (error) {
            return errorResult(error);
        }
    });
    server.registerTool('supplyguard.create_workspace', {
        title: '创建调查工作区',
        description: '根据 importId、preset 或 name 创建一个 SupplyGuard 调查工作区。',
        inputSchema: CreateWorkspaceSchema.shape,
    }, async (input) => {
        try {
            const workspace = await createWorkspace(input);
            return textResult({
                status: 'success',
                workspaceId: workspaceIdOf(workspace),
                summary: summarizeWorkspace(workspace),
                nextActions: ['继续执行 supplyguard.scan_dependencies 或 supplyguard.run_trace', '读取 workspace://latest'],
            });
        }
        catch (error) {
            return errorResult(error);
        }
    });
    server.registerTool('supplyguard.run_trace', {
        title: '执行一键溯源',
        description: '调用 scan-suite，执行完整防御性供应链溯源主线。',
        inputSchema: RunTraceSchema.shape,
    }, async (input) => {
        try {
            const { workspaceId, ...options } = input;
            const workspace = await runTrace(workspaceId, options);
            return workspaceResult(workspace);
        }
        catch (error) {
            return errorResult(error);
        }
    });
    server.registerTool('supplyguard.scan_dependencies', {
        title: '扫描依赖与 SBOM/VEX',
        description: '只执行依赖风险扫描，可同时启用代码审计作为可达性佐证。',
        inputSchema: DependencyScanSchema.shape,
    }, async ({ workspaceId, ...options }) => {
        try {
            const workspace = await runModuleScan(workspaceId, 'dependencies', options);
            return workspaceResult(workspace, 'dependencies');
        }
        catch (error) {
            return errorResult(error);
        }
    });
    server.registerTool('supplyguard.scan_cicd', {
        title: '检查 CI/CD 构建链',
        description: '只执行 workflow、权限、Action 固定版本和 runner 风险检查。',
        inputSchema: CicdScanSchema.shape,
    }, async ({ workspaceId, ...options }) => {
        try {
            const workspace = await runModuleScan(workspaceId, 'cicd', options);
            return workspaceResult(workspace, 'cicd');
        }
        catch (error) {
            return errorResult(error);
        }
    });
    server.registerTool('supplyguard.verify_artifact_trust', {
        title: '执行产物可信门禁',
        description: '只执行 artifact/provenance/commit/workflow/builder/runner 校验。',
        inputSchema: ArtifactTrustScanSchema.shape,
    }, async ({ workspaceId, ...options }) => {
        try {
            const workspace = await runModuleScan(workspaceId, 'artifact_trust', options);
            return workspaceResult(workspace, 'artifact_trust');
        }
        catch (error) {
            return errorResult(error);
        }
    });
    server.registerTool('supplyguard.analyze_logs', {
        title: '分析运行日志',
        description: '只执行运行期日志印证；MCP 不读取本地文件，只把 logPaths 交给后端。',
        inputSchema: LogScanSchema.shape,
    }, async ({ workspaceId, ...options }) => {
        try {
            const workspace = await runModuleScan(workspaceId, 'logs', options);
            return workspaceResult(workspace, 'logs');
        }
        catch (error) {
            return errorResult(error);
        }
    });
    server.registerTool('supplyguard.scan_reachability', {
        title: '验证风险可达性',
        description: '执行依赖、代码引用和可选日志印证，判断供应链风险是否能触达代码路径。',
        inputSchema: ReachabilityScanSchema.shape,
    }, async ({ workspaceId, ...options }) => {
        try {
            const workspace = await runModuleScan(workspaceId, 'reachability', options);
            return workspaceResult(workspace, 'reachability');
        }
        catch (error) {
            return errorResult(error);
        }
    });
    server.registerTool('supplyguard.build_attack_chain', {
        title: '生成攻击链地图',
        description: '不重跑重型扫描，只刷新当前 workspace 的图谱、候选路径和证据缺口摘要。',
        inputSchema: WorkspaceIdSchema.shape,
    }, async ({ workspaceId }) => {
        try {
            const workspace = await runModuleScan(workspaceId, 'attack_chain');
            return workspaceResult(workspace, 'attack_chain');
        }
        catch (error) {
            return errorResult(error);
        }
    });
    server.registerTool('supplyguard.generate_report', {
        title: '生成并读取溯源报告',
        description: '刷新当前 workspace 汇总后读取 Markdown 或 HTML 溯源报告。',
        inputSchema: ReportSchema.shape,
    }, async ({ workspaceId, format }) => {
        try {
            const workspace = await runModuleScan(workspaceId, 'report');
            const report = await getWorkspaceReport(workspaceId, format);
            const status = moduleStatusFromWorkspace(workspace, 'report');
            return textResult({
                status: status.status,
                workspaceId,
                summary: { format: report.format, length: report.content.length },
                completedModules: status.completedModules,
                failedModules: status.failedModules,
                raw: sanitizeForAgent(report),
            });
        }
        catch (error) {
            return errorResult(error);
        }
    });
    server.registerTool('supplyguard.query_attack_graph', {
        title: '查询攻击链图谱',
        description: '读取指定 workspace 的知识图谱摘要、候选攻击路径和证据缺口。',
        inputSchema: WorkspaceIdSchema.shape,
    }, async ({ workspaceId }) => {
        try {
            const workspace = await getWorkspace(workspaceId);
            const graph = summarizeGraph(workspace);
            return textResult({
                status: 'success',
                workspaceId,
                summary: graph.graphSummary,
                evidenceGaps: evidenceGaps(workspace),
                nextActions: nextActions(workspace),
                raw: graph,
            });
        }
        catch (error) {
            return errorResult(error);
        }
    });
    server.registerTool('supplyguard.get_report', {
        title: '读取溯源报告',
        description: '读取指定 workspace 的 Markdown 或 HTML 溯源报告。',
        inputSchema: ReportSchema.shape,
    }, async ({ workspaceId, format }) => {
        try {
            const report = await getWorkspaceReport(workspaceId, format);
            return textResult({
                status: 'success',
                workspaceId,
                summary: { format: report.format, length: report.content.length },
                raw: sanitizeForAgent(report),
            });
        }
        catch (error) {
            return errorResult(error);
        }
    });
    server.registerTool('supplyguard.get_evidence_package_info', {
        title: '读取证据包信息',
        description: '返回证据包下载接口和内容说明，不直接返回 zip 二进制。',
        inputSchema: WorkspaceIdSchema.shape,
    }, async ({ workspaceId }) => {
        try {
            return textResult({
                status: 'success',
                workspaceId,
                summary: {
                    downloadUrl: `${apiBase}/api/security/workspaces/${encodeURIComponent(workspaceId)}/evidence-package`,
                    contains: [
                        'workspace.json',
                        'evidence.json',
                        'attack-paths.json',
                        'report.md',
                        'report.html',
                        'raw module results',
                    ],
                },
                nextActions: ['在浏览器或后端接口中下载证据包', '不要通过 MCP 直接传输 zip 二进制'],
            });
        }
        catch (error) {
            return errorResult(error);
        }
    });
}
