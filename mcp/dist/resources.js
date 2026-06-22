import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCase } from './cases.js';
import { getLatestWorkspace, getWorkspace, getWorkspaceReport, sanitizeForAgent, selectAttackPath, selectDependency, selectEvidence, selectFinding, summarizeGraph, summarizeWorkspace, workspaceIdOf, } from './supplyguard-client.js';
function jsonText(uri, payload) {
    return {
        contents: [
            {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(sanitizeForAgent(payload), null, 2),
            },
        ],
    };
}
function markdownText(uri, text) {
    return {
        contents: [
            {
                uri,
                mimeType: 'text/markdown',
                text,
            },
        ],
    };
}
function variable(value) {
    return Array.isArray(value) ? value[0] : String(value || '');
}
export function registerResources(server) {
    server.registerResource('workspace-latest', 'workspace://latest', {
        title: 'SupplyGuard 最新工作区',
        description: '最新 SupplyGuard 调查工作区摘要。',
        mimeType: 'application/json',
    }, async (uri) => {
        const workspace = await getLatestWorkspace();
        return jsonText(uri.href, summarizeWorkspace(workspace));
    });
    server.registerResource('workspace-by-id', new ResourceTemplate('workspace://{workspaceId}', { list: undefined }), {
        title: 'SupplyGuard 指定工作区',
        description: '按 workspaceId 读取工作区摘要。',
        mimeType: 'application/json',
    }, async (uri, variables) => {
        const workspaceId = variable(variables.workspaceId);
        const workspace = await getWorkspace(workspaceId);
        return jsonText(uri.href, summarizeWorkspace(workspace));
    });
    server.registerResource('case-by-id', new ResourceTemplate('case://{caseId}', { list: undefined }), {
        title: 'SupplyGuard 案例说明',
        description: '读取 cases 目录下的防御性案例元数据。',
        mimeType: 'application/json',
    }, async (uri, variables) => {
        const caseId = variable(variables.caseId);
        const item = await getCase(caseId);
        return jsonText(uri.href, item || { status: 'error', message: `case not found: ${caseId}` });
    });
    server.registerResource('graph-latest', 'graph://latest', {
        title: 'SupplyGuard 最新攻击链地图',
        description: '最新工作区的知识图谱摘要和候选攻击路径。',
        mimeType: 'application/json',
    }, async (uri) => {
        const workspace = await getLatestWorkspace();
        return jsonText(uri.href, summarizeGraph(workspace));
    });
    server.registerResource('report-latest', 'report://latest', {
        title: 'SupplyGuard 最新溯源报告',
        description: '最新工作区的 Markdown 报告。',
        mimeType: 'text/markdown',
    }, async (uri) => {
        const workspace = await getLatestWorkspace();
        const workspaceId = workspaceIdOf(workspace);
        if (workspaceId === 'latest')
            return markdownText(uri.href, workspace.report || '');
        const report = await getWorkspaceReport(workspaceId, 'markdown');
        return markdownText(uri.href, report.content);
    });
    server.registerResource('evidence-by-id', new ResourceTemplate('evidence://{workspaceId}/{evidenceId}', { list: undefined }), {
        title: 'SupplyGuard 证据详情',
        description: '按 workspaceId 和 evidenceId 读取单条证据。',
        mimeType: 'application/json',
    }, async (uri, variables) => {
        const workspaceId = variable(variables.workspaceId);
        const evidenceId = variable(variables.evidenceId);
        const workspace = await getWorkspace(workspaceId);
        const evidence = selectEvidence(workspace, evidenceId);
        return jsonText(uri.href, evidence || { status: 'error', message: `evidence not found: ${evidenceId}` });
    });
    server.registerResource('finding-by-id', new ResourceTemplate('finding://{workspaceId}/{findingId}', { list: undefined }), {
        title: 'SupplyGuard 风险发现详情',
        description: '按 workspaceId 和 findingId 读取单条 finding。',
        mimeType: 'application/json',
    }, async (uri, variables) => {
        const workspaceId = variable(variables.workspaceId);
        const findingId = variable(variables.findingId);
        const workspace = await getWorkspace(workspaceId);
        const finding = selectFinding(workspace, findingId);
        return jsonText(uri.href, finding || { status: 'error', message: `finding not found: ${findingId}` });
    });
    server.registerResource('attack-path-by-id', new ResourceTemplate('path://{workspaceId}/{pathId}', { list: undefined }), {
        title: 'SupplyGuard 攻击链详情',
        description: '按 workspaceId 和 pathId 读取候选攻击链。',
        mimeType: 'application/json',
    }, async (uri, variables) => {
        const workspaceId = variable(variables.workspaceId);
        const pathId = variable(variables.pathId);
        const workspace = await getWorkspace(workspaceId);
        const path = selectAttackPath(workspace, pathId);
        return jsonText(uri.href, path || { status: 'error', message: `attack path not found: ${pathId}` });
    });
    server.registerResource('dependency-by-name', new ResourceTemplate('dependency://{workspaceId}/{packageName}', { list: undefined }), {
        title: 'SupplyGuard 依赖详情',
        description: '按 workspaceId 和 packageName 读取依赖风险详情。',
        mimeType: 'application/json',
    }, async (uri, variables) => {
        const workspaceId = variable(variables.workspaceId);
        const packageName = variable(variables.packageName);
        const workspace = await getWorkspace(workspaceId);
        const dependency = selectDependency(workspace, packageName);
        return jsonText(uri.href, dependency || { status: 'error', message: `dependency not found: ${packageName}` });
    });
}
