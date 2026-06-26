# Supplement Files Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the relevant module entry points from “上传证据” to “补充文件” and ensure each entry uses the same module processing path as initial material handling.

**Architecture:** Add a tiny frontend copy/helper module for supplement-file UI text and success messages, then wire the three existing security-platform modules to it. Supply reachability and CI/CD will use their current workspace-level re-scan functions as the supplement processing path; artifact trust will keep using `uploadArtifactTrustScan` when artifact and attestation files are selected, preserving the existing same-rank upload path.

**Tech Stack:** React 19, TypeScript, Vite, Vitest browser runner, existing `security-api.ts` functions, existing shadcn-style UI components.

## Global Constraints

- Do not add a global file center.
- Do not redo the project import flow.
- Do not change backend storage models unless current APIs cannot express same-rank processing.
- Keep supplement entry points module-contextual; do not silently submit every file type to every module.
- Use TDD: write failing tests first, verify red, implement minimal code, verify green.
- Preserve unrelated dirty worktree changes.

---

## File Structure

- Create `frontend/src/features/security-platform/supplement-file-workflow.ts`
  - Owns supplement-file labels and module success message formatting.
  - Keeps “补充文件” copy consistent across security platform modules.
- Create `frontend/src/features/security-platform/supplement-file-workflow.test.ts`
  - Tests the helper copy and message behavior before production code uses it.
- Modify `frontend/src/features/security-platform/index.tsx`
  - Imports supplement copy helpers.
  - Replaces the three user-facing “上传证据” buttons in supply reachability, CI/CD, and artifact trust.
  - Routes supply and CI/CD supplement clicks into existing reprocessing functions.
  - Renames artifact trust input title and selected-file status copy.

---

### Task 1: Add Supplement-File Copy Contract

**Files:**
- Create: `frontend/src/features/security-platform/supplement-file-workflow.test.ts`
- Create: `frontend/src/features/security-platform/supplement-file-workflow.ts`

**Interfaces:**
- Produces:
  - `SUPPLEMENT_FILE_LABEL: '补充文件'`
  - `SUPPLEMENT_FILE_INPUT_TITLE: '补充文件'`
  - `supplementFileSuccessMessage(module: SupplementFileModule, detail?: { score?: number; count?: number }): string`
  - `type SupplementFileModule = 'reachability' | 'cicd' | 'artifact' | 'multimodal' | 'logs'`
- Consumes: no project-local code.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/security-platform/supplement-file-workflow.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  SUPPLEMENT_FILE_INPUT_TITLE,
  SUPPLEMENT_FILE_LABEL,
  supplementFileSuccessMessage,
} from './supplement-file-workflow'

describe('supplement file workflow copy', () => {
  it('uses supplement-file wording for module entry points', () => {
    expect(SUPPLEMENT_FILE_LABEL).toBe('补充文件')
    expect(SUPPLEMENT_FILE_INPUT_TITLE).toBe('补充文件')
  })

  it('describes reachability supplement processing as part of the analysis', () => {
    expect(supplementFileSuccessMessage('reachability')).toBe('补充文件已纳入可达性研判')
  })

  it('describes CI/CD supplement processing as part of the build-chain scan', () => {
    expect(supplementFileSuccessMessage('cicd', { count: 2 })).toBe('补充文件已纳入 CI/CD 构建链，发现 2 项风险')
  })

  it('describes artifact supplement processing as the same trust-gate verification path', () => {
    expect(supplementFileSuccessMessage('artifact', { score: 88 })).toBe('补充文件已完成产物可信验证，评分 88 / 100')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd frontend
npm test -- src/features/security-platform/supplement-file-workflow.test.ts
```

Expected: FAIL because `./supplement-file-workflow` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/features/security-platform/supplement-file-workflow.ts`:

```ts
export const SUPPLEMENT_FILE_LABEL = '补充文件'
export const SUPPLEMENT_FILE_INPUT_TITLE = '补充文件'

export type SupplementFileModule =
  | 'reachability'
  | 'cicd'
  | 'artifact'
  | 'multimodal'
  | 'logs'

export function supplementFileSuccessMessage(
  module: SupplementFileModule,
  detail: { score?: number; count?: number } = {}
) {
  if (module === 'reachability') return '补充文件已纳入可达性研判'
  if (module === 'cicd') {
    return `补充文件已纳入 CI/CD 构建链，发现 ${detail.count ?? 0} 项风险`
  }
  if (module === 'artifact') {
    return `补充文件已完成产物可信验证，评分 ${detail.score ?? 0} / 100`
  }
  if (module === 'logs') return '补充文件已纳入日志印证'
  return '补充文件已纳入多模态研判'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd frontend
npm test -- src/features/security-platform/supplement-file-workflow.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/security-platform/supplement-file-workflow.ts frontend/src/features/security-platform/supplement-file-workflow.test.ts
git commit -m "feat: add supplement file workflow copy"
```

---

### Task 2: Wire Supply, CI/CD, And Artifact Modules To Supplement Processing

**Files:**
- Modify: `frontend/src/features/security-platform/index.tsx`
- Test: `frontend/src/features/security-platform/supplement-file-workflow.test.ts`

**Interfaces:**
- Consumes:
  - `SUPPLEMENT_FILE_LABEL`
  - `SUPPLEMENT_FILE_INPUT_TITLE`
  - `supplementFileSuccessMessage(module, detail)`
- Produces:
  - Supply reachability “补充文件” button calls `rerunReachability()`.
  - CI/CD “补充文件” button calls `startCICDScan()`.
  - Artifact trust “补充文件” button scrolls to artifact/attestation inputs, and its input section uses supplement wording.

- [ ] **Step 1: Write the failing test**

Extend `frontend/src/features/security-platform/supplement-file-workflow.test.ts` with a source-level contract. This is intentionally narrow because the three panels live inside a large workbench component with many unrelated dependencies:

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))
const platformSource = () => readFileSync(join(currentDir, 'index.tsx'), 'utf8')

describe('security platform supplement-file integration', () => {
  it('does not expose upload-evidence copy on the three supplement entry buttons', () => {
    const source = platformSource()

    expect(source).toContain('SUPPLEMENT_FILE_LABEL')
    expect(source).not.toContain('>上传证据')
  })

  it('routes supplement entry points into current module processing paths', () => {
    const source = platformSource()

    expect(source).toContain("onClick={() => void rerunReachability()}")
    expect(source).toContain("onClick={() => void startCICDScan()}")
    expect(source).toContain("evidenceInputRef.current?.scrollIntoView")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd frontend
npm test -- src/features/security-platform/supplement-file-workflow.test.ts
```

Expected: FAIL because `index.tsx` still contains `>上传证据` and the supply/CI buttons still jump to logs instead of calling module processing functions.

- [ ] **Step 3: Write minimal implementation**

In `frontend/src/features/security-platform/index.tsx`, add this import near the existing local imports:

```ts
import {
  SUPPLEMENT_FILE_INPUT_TITLE,
  SUPPLEMENT_FILE_LABEL,
  supplementFileSuccessMessage,
} from './supplement-file-workflow'
```

In `SupplyReachabilityPanel`, change the second button:

```tsx
<Button size='sm' variant='outline' onClick={() => void rerunReachability()} disabled={scanning}>
  {scanning ? <Loader2 className='size-4 animate-spin' /> : <Upload className='size-4' />}
  {SUPPLEMENT_FILE_LABEL}
</Button>
```

In `PipelinePanel`, change the second button:

```tsx
<Button size='sm' variant='outline' onClick={() => void startCICDScan()} disabled={scanning}>
  {scanning ? <Loader2 className='size-4 animate-spin' /> : <Upload className='size-4' />}
  {SUPPLEMENT_FILE_LABEL}
</Button>
```

In `ArtifactTrustPanel`, change the top supplement button:

```tsx
<Button
  variant='outline'
  size='sm'
  onClick={() => evidenceInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
>
  <Upload />
  {SUPPLEMENT_FILE_LABEL}
</Button>
```

In `ArtifactTrustPanel`, change the input card header:

```tsx
<div className='flex items-center justify-between'>
  <span className='text-section-title !text-[20px]'>
    <Upload className='size-5 text-cyan-300' />
    {SUPPLEMENT_FILE_INPUT_TITLE}
  </span>
  <span className='meta-chip-dark'>{attestationFile ? 'Attestation 已选择' : 'Attestation 待补充'}</span>
</div>
```

In the artifact tab `onScanned`, change the success toast:

```ts
toast.success(supplementFileSuccessMessage('artifact', { score: artifactTrustScore(result) }))
```

In the CI/CD tab `onScanned`, change the success toast:

```ts
toast.success(supplementFileSuccessMessage('cicd', { count: audit.summary.finding_count }))
```

In the supply tab `onCodeScanned`, keep the current precise risk-count toast. In `onDependencyScanned`, change the success toast:

```ts
toast.success(supplementFileSuccessMessage('reachability'))
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd frontend
npm test -- src/features/security-platform/supplement-file-workflow.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/security-platform/index.tsx frontend/src/features/security-platform/supplement-file-workflow.test.ts
git commit -m "feat: wire supplement file module actions"
```

---

### Task 3: Final Verification

**Files:**
- Verify: `frontend/src/features/security-platform/index.tsx`
- Verify: `frontend/src/features/security-platform/supplement-file-workflow.ts`
- Verify: `frontend/src/features/security-platform/supplement-file-workflow.test.ts`

**Interfaces:**
- Consumes: all changes from Tasks 1 and 2.
- Produces: verified final state.

- [ ] **Step 1: Run focused test**

```bash
cd frontend
npm test -- src/features/security-platform/supplement-file-workflow.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run frontend type/build verification**

```bash
cd frontend
npm run build
```

Expected: exit code 0.

- [ ] **Step 3: Check no target copy remains**

```bash
rg -n ">上传证据|上传证据</Button>|证据输入" frontend/src/features/security-platform/index.tsx
```

Expected: no matches for the three target buttons or artifact input title. Existing non-target legacy or multimodal text should be reviewed manually if any matches remain.

- [ ] **Step 4: Review git diff**

```bash
git diff -- frontend/src/features/security-platform/index.tsx frontend/src/features/security-platform/supplement-file-workflow.ts frontend/src/features/security-platform/supplement-file-workflow.test.ts
```

Expected: only supplement-file workflow changes, no unrelated formatting churn.

- [ ] **Step 5: Commit any final verification-only fixes**

If Step 2 or Step 3 required a correction:

```bash
git add frontend/src/features/security-platform/index.tsx frontend/src/features/security-platform/supplement-file-workflow.ts frontend/src/features/security-platform/supplement-file-workflow.test.ts
git commit -m "fix: align supplement file workflow verification"
```

If no corrections were needed, do not create an empty commit.

---

## Self-Review

- Spec coverage: Task 2 covers all three named modules. Task 1 centralizes wording. Task 3 verifies tests, build, and target copy.
- Placeholder scan: no TODO/TBD placeholders are present.
- Type consistency: `SupplementFileModule` values used in Task 2 match the helper type from Task 1.
