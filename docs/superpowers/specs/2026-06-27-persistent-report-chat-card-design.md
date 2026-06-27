# Persistent Report Chat Card Design

## Goal

After a workspace scan finishes, the generated traceability report should appear inside the investigation conversation as a persistent AI assistant message. Users should see the report again when they reopen the historical conversation, and they should be able to expand, collapse, and export the report from that conversation surface.

The report already exists on the workspace payload as `workspace.report`, and the standalone report tab already has a richer `ReportPanel`. This design adds a conversation-level report card without changing backend report generation.

## Existing Context

The investigation workspace uses `overview` as the "研判对话" tab in `frontend/src/features/security-platform/index.tsx`.

Current relevant behavior:

- `startFullAnalysis()` runs module scans and then calls `runWorkspaceScanSuite`.
- The backend returns a refreshed `SecurityWorkspace`.
- The refreshed workspace includes `report`, `assistant`, summary fields, graph data, and module results.
- `AgentConversationHome` renders the assistant message, preflight and GraphRAG thinking cards, scan progress, and module launch grid.
- `ReportPanel` already supports report preview, Markdown source, HTML export, Markdown export, and evidence package export on the report tab.

The new report card should be derived from persisted workspace data, not from transient scan completion state. That makes it durable across refreshes and historical conversation selection.

## Recommended Approach

Use a persistent assistant-message report card inside `AgentConversationHome`.

Render the card when all of these are true:

- A workspace is loaded.
- `workspace.report` is a non-empty string.
- The workspace scan is completed, partial, or otherwise has meaningful report data.

The card should sit in the current assistant message flow after the scan progress panel and before the module launch grid. This placement makes it feel like the assistant's conclusion after scanning, while keeping module navigation nearby.

Alternative approaches considered:

- Add the report to the scan progress panel only. This is simple but reads as process state rather than an AI conclusion.
- Automatically open the report tab after scan completion. This improves report visibility but interrupts the conversation.

## UI Design

The card should look like a compact security analyst conclusion package, not a marketing card.

Default collapsed state:

- Header: "溯源报告已生成"
- Status badge based on risk level.
- Small metadata line with generated time if available.
- Four compact metrics:
  - Risk score.
  - Attack path count.
  - Evidence or graph node count.
  - Average confidence if available.
- A short summary extracted from the report or assistant answer.
- Primary controls:
  - Expand / collapse.
  - Export Markdown.
  - Export HTML.
  - Export evidence package when a workspace id is available.
  - Open full report tab.

Expanded state:

- Show a concise report preview, not the full long Markdown by default.
- Include a compact evidence coverage or attack-stage list when graph path data exists.
- Include a "Markdown source" collapsible section for users who need exact text.
- Keep the card height bounded with internal scrolling for long content.

Suggested structure:

```text
[AI] 溯源报告已生成                         [高风险] [展开]
     该报告已固化本次扫描的结论、证据链、攻击路径和处置建议。

     风险 92/100   攻击路径 3   证据 42   置信度 86%

     摘要: ...

     [导出 Markdown] [导出 HTML] [导出证据包] [打开完整报告]

     展开后:
     - 报告摘要
     - 攻击路径片段
     - 证据覆盖
     - Markdown 源码
```

The visual treatment should use existing surface utilities:

- `surface-raised` for the outer card.
- `surface-inset` for metrics, preview blocks, and Markdown source.
- Semantic badges for risk level.
- Lucide icons for expand/collapse, export, report, evidence package, and open actions.

The card should stay within the existing max-width conversation column and must work in light and dark modes.

## Data Flow

No backend API changes are required.

Frontend data sources:

- `workspace.report`: Markdown report content.
- `workspace.summary.risk_score`: risk score.
- `workspace.summary.risk_level`: risk level.
- `workspace.summary.attack_paths` or `workspace.graph.summary.attack_path_count`: path count.
- `workspace.facts.summary.evidence_count`, `workspace.graph.summary.node_count`, or module summaries: evidence count fallback.
- `workspace.graph.summary.average_path_confidence` or primary attack path confidence.
- `workspace.graph.generated_at` or `workspace.generated_at`: generated time.
- `workspace.workspaceId` or `workspace.workspace.workspaceId`: export evidence package id.

Export behavior:

- Markdown export creates a client-side Markdown blob from `workspace.report`.
- HTML export can reuse a local HTML wrapper or call the existing report endpoint if already available through existing API helpers.
- Evidence package export should reuse `downloadWorkspaceEvidencePackage`.
- "Open full report" should call the existing `onOpenModule('report')`.

## Interaction States

Collapsed:

- Default after historical conversation load.
- Shows the report exists and provides exports.
- Summary and metrics are visible without expanding.

Expanded:

- User-triggered.
- Shows preview sections and Markdown source affordance.
- Does not navigate away from the conversation.

Missing report:

- Do not render the report card.
- Keep existing scan progress and module launch behavior.

Scan running:

- Do not show the final report card unless a previous persisted report exists for the workspace.
- If a previous report exists during a rerun, keep it visible but label it as the current saved report until the scan refreshes.

Export errors:

- Show toast errors using the existing `sonner` pattern.
- Keep the card open and preserve user state.

## Component Shape

Add a focused local component in `frontend/src/features/security-platform/index.tsx` unless the file becomes too hard to maintain. Suggested component name:

- `ConversationReportCard`

Props:

- `workspace: SecurityWorkspace`
- `onOpenReport: () => void`

Internal helpers:

- `hasWorkspaceReport(workspace)`
- `buildConversationReportMetrics(workspace)`
- `extractConversationReportSummary(report, workspace)`
- `downloadConversationReportMarkdown(report)`
- `downloadConversationReportHtml(workspace, report)`

The component should reuse existing helpers where safe, but avoid coupling to the private internals of `ReportPanel`.

## Error Handling

If report text is malformed or unexpectedly empty:

- Fall back to assistant answer summary.
- Avoid rendering raw `undefined` or empty metric values.

If clipboard, export, or evidence package download fails:

- Show a concise toast error.
- Leave UI state unchanged.

If graph data is missing:

- Hide attack-stage and confidence details.
- Keep summary and report export controls available.

## Testing And Verification

Frontend tests should cover:

- The report card renders in `AgentConversationHome` when `workspace.report` exists.
- The report card does not render when `workspace.report` is empty.
- Expand/collapse toggles the preview area.
- Markdown export creates a file from the report content.
- Evidence package export calls the existing workspace evidence package helper when a workspace id exists.
- The "Open full report" action calls `onOpenModule('report')`.

Build verification:

- Run `npm run build` in `frontend`.

Manual verification:

- Load a workspace with an existing report and confirm the report card appears in "研判对话".
- Reopen a historical conversation and confirm the card still appears.
- Run a scan and confirm the card appears after the refreshed workspace is applied.
- Check collapsed and expanded states in both light and dark mode.

## Scope Boundaries

In scope:

- Persistent conversation-level report card.
- Expand/collapse behavior.
- Markdown and HTML export from the conversation.
- Evidence package export from the conversation.
- Link to the full report tab.
- Light/dark visual fit with the existing security console.

Out of scope:

- Backend report generation changes.
- Conversation message persistence schema changes.
- New AI chat history storage.
- Replacing the standalone `ReportPanel`.
- Changing scan execution order or module scoring logic.
