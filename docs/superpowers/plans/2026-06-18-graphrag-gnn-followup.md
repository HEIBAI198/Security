# GraphRAG + GNN Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the GraphRAG + GNN feature from a working prototype into a competition-ready demo with clear evidence, stable fallback behavior, and optional real-GNN upgrade path.

**Architecture:** The current implementation already has data cleaning, weak negatives, graph-feature training, backend scoring, GraphRAG retrieval, assistant integration, and frontend evidence display. The follow-up work should focus on demo quality, report/export integration, runtime verification, and only then attempt PyTorch/GraphSAGE if time allows.

**Tech Stack:** Python 3.13 via `D:\Anaconda3\python.exe`, scikit-learn, NetworkX, FastAPI backend, React/Vite frontend, OpenSSF malicious-packages OSV JSON.

---

## Current Checkpoint

The project is currently at the end of Day 6 / start of Day 7.

Completed:

- OpenSSF malicious package cleaning.
- Weak negative sample generation.
- Graph node/edge feature generation.
- Lightweight graph-feature risk model training.
- Backend `gnn_score`, `gnn_label`, `gnn_reasons` inference.
- Knowledge graph dependency node enrichment.
- GraphRAG core retrieval with 2-hop expansion, PageRank, GNN score weighting.
- `/assistant` GraphRAG integration.
- Frontend dependency GNN badge and Copilot GraphRAG evidence card.
- Chinese implementation document.

Known caveat:

- Current model is a graph-feature risk model, not a true GraphSAGE/PyG model.
- Current training metric is based on OpenSSF positives plus local weak negatives; it should be presented as a ranking signal, not production detection accuracy.

## Task 1: Runtime API Smoke Test

**Files:**
- Read: `supplyguard/routes/security.py`
- Read: `supplyguard/app.py`
- Verify: API response from `/api/security/assistant`

- [ ] **Step 1: Start backend server in the worktree**

Run:

```powershell
D:\Anaconda3\python.exe -m uvicorn supplyguard.app:app --host 127.0.0.1 --port 8001
```

Expected:

```text
Uvicorn running on http://127.0.0.1:8001
```

- [ ] **Step 2: Call assistant endpoint**

Run in another shell:

```powershell
curl.exe -s -X POST http://127.0.0.1:8001/api/security/assistant -H "Content-Type: application/json" -d "{\"question\":\"当前项目最危险的供应链风险是什么？\"}"
```

Expected:

- JSON contains `answer`.
- JSON contains `retrieval`.
- JSON contains `graph_rag`.
- `graph_rag.explanation.method` is `GraphRAG`.

- [ ] **Step 3: Verify GNN fields in dependency payload**

Call the workspace or dependency endpoint used by the UI and verify at least one dependency has:

```json
{
  "gnn_score": 0.0,
  "gnn_label": "low",
  "gnn_reasons": []
}
```

The exact score may differ.

## Task 2: Frontend Demo Verification

**Files:**
- Verify: `frontend/src/features/security-platform/index.tsx`
- Verify: `frontend/src/lib/security-api.ts`

- [ ] **Step 1: Start frontend dev server**

Run:

```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 5174
```

Expected:

```text
Local: http://127.0.0.1:5174/
```

- [ ] **Step 2: Open Security page and ask Copilot question**

Use the UI question:

```text
当前项目最危险的供应链风险是什么？
```

Expected:

- Copilot answer renders normally.
- Right panel shows `GraphRAG 证据`.
- GraphRAG card shows seed count, hop count, expanded node count.
- Top nodes include risk badges and possibly `GNN xx%`.

- [ ] **Step 3: Open supply-chain dependency table**

Expected:

- Dependency risk column shows normal risk bar.
- Dependencies with model fields show `GNN xx%`.
- Selected dependency detail shows `GraphRAG/GNN 风险信号`.

## Task 3: Report Export Integration

**Files:**
- Modify: `supplyguard/dependency_audit.py`
- Modify: report generation section in `supplyguard/routes/security.py` or workspace report builder, depending on current report path
- Test: add focused Python unit test if a pure report helper exists

- [ ] **Step 1: Find report generation entry**

Run:

```powershell
rg -n "report|report_html|build_.*report|markdown" supplyguard
```

Expected:

- Identify the function that writes workspace report markdown/html.

- [ ] **Step 2: Add GNN risk summary section**

Add a short section:

```markdown
## GraphRAG / GNN 风险增强

- 模型类型：sklearn_logistic_regression_graph_features
- 依赖风险字段：gnn_score / gnn_label / gnn_reasons
- GraphRAG 排序：关键词种子 + 2-hop 图扩展 + PageRank + GNN 风险加权
```

- [ ] **Step 3: Verify report includes the section**

Run the report generation command or API flow already used by the project.

Expected:

- Generated report contains `GraphRAG / GNN 风险增强`.

## Task 4: Demo Script And Screenshots

**Files:**
- Create: `docs/graphrag-gnn-demo-script.md`
- Optional assets: screenshots saved outside Git or in an ignored demo folder

- [ ] **Step 1: Create demo script document**

Include these sections:

```markdown
# GraphRAG + GNN 演示脚本

## 演示 1：依赖风险排序
问题：当前项目最危险的供应链风险是什么？

## 演示 2：GraphRAG 证据召回
问题：GraphRAG 召回了哪些证据？

## 演示 3：攻击路径解释
问题：给我解释这条攻击路径为什么高风险。

## 演示 4：模型边界说明
说明：当前模型是图特征风险排序信号，不宣称生产级恶意包检测准确率。
```

- [ ] **Step 2: Add expected talking points**

For every demo question, add:

- What UI area to show.
- What backend feature is being demonstrated.
- What limitation should be stated honestly.

## Task 5: Optional True-GNN Feasibility Spike

**Files:**
- Optional create: `scripts/gnn/train_graphsage_package_risk.py`
- Optional modify: `requirements-gnn.txt`

- [ ] **Step 1: Check torch availability**

Run:

```powershell
D:\Anaconda3\python.exe -c "import torch; print(torch.__version__)"
```

Expected if unavailable:

```text
ModuleNotFoundError: No module named 'torch'
```

- [ ] **Step 2: If user approves dependency install, install torch**

Only run with explicit approval:

```powershell
D:\Anaconda3\python.exe -m pip install torch
```

- [ ] **Step 3: Decide whether GraphSAGE is worth it**

Proceed only if:

- `torch` installs cleanly.
- Training script can be finished in less than half a day.
- Current demo/report work is already stable.

If not, keep current graph-feature model and describe GraphSAGE as future work.

## Task 6: Final Verification

**Files:**
- Verify all modified backend, frontend, docs, and scripts

- [ ] **Step 1: Run Python unit tests**

Run:

```powershell
D:\Anaconda3\python.exe -m unittest discover -s tests
```

Expected:

```text
Ran 16 tests
OK
```

- [ ] **Step 2: Run Python syntax check**

Run:

```powershell
D:\Anaconda3\python.exe -m py_compile supplyguard\routes\security.py supplyguard\llm_assistant.py supplyguard\graph_rag.py supplyguard\gnn_risk.py supplyguard\dependency_audit.py supplyguard\knowledge_graph.py scripts\gnn\clean_openssf_malicious.py scripts\gnn\build_weak_negatives.py scripts\gnn\build_graph_features.py scripts\gnn\train_package_risk.py
```

Expected:

- Exit code 0.

- [ ] **Step 3: Run frontend build**

Run:

```powershell
cd frontend
npm run build
```

Expected:

- `tsc -b` passes.
- Vite build passes.

- [ ] **Step 4: Confirm ignored artifacts**

Run:

```powershell
git status --short --ignored frontend\node_modules frontend\dist storage\gnn_datasets storage\graph_models
```

Expected:

- `frontend/node_modules`, `frontend/dist`, `storage/gnn_datasets`, and `storage/graph_models` are ignored.

