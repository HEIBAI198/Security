# Artifact Trust Gate Materials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a frontend-only gate material checklist to the artifact trust panel with required/optional labels, material status, and required-file blocking.

**Architecture:** Keep the backend upload contract unchanged. Add small helper functions for material status and button copy, test those helpers and source-level integration, then wire `ArtifactTrustPanel` to render the checklist and block upload verification until Artifact and Attestation / Provenance are both selected.

**Tech Stack:** React 19, TypeScript, Vite, Vitest browser runner, shadcn-style UI components, lucide-react icons.

## Global Constraints

- Artifact and Attestation / Provenance are required.
- Policy, Signature / Certificate / Transparency Log Proof, and Expected Release Information are optional.
- Required materials missing must disable upload verification and show direct frontend guidance.
- Optional materials missing must not disable upload verification.
- Do not change backend endpoints, request payload shape, scoring logic, graph data, report data, or workspace models.
- Do not display uploaded file contents in the frontend.

---

### Task 1: Material Checklist Helpers And Tests

**Files:**
- Modify: `frontend/src/features/security-platform/supplement-file-workflow.ts`
- Modify: `frontend/src/features/security-platform/supplement-file-workflow.test.ts`

**Interfaces:**
- Produces: `ARTIFACT_TRUST_REQUIRED_MATERIALS`, `ARTIFACT_TRUST_OPTIONAL_MATERIALS`, `artifactTrustRequiredFilesReady`, `artifactTrustGateButtonLabel`, and `artifactTrustGateReadinessMessage`.

- [ ] **Step 1: Write failing helper tests**

Add tests that assert the required and optional material labels, required-file readiness, button copy, and readiness messages.

- [ ] **Step 2: Run focused test and verify failure**

Run: `npm run test -- src/features/security-platform/supplement-file-workflow.test.ts`

Expected: FAIL because the new helper exports do not exist yet.

- [ ] **Step 3: Implement helper exports**

Add the helper constants and functions to `supplement-file-workflow.ts`.

- [ ] **Step 4: Run focused test and verify pass**

Run: `npm run test -- src/features/security-platform/supplement-file-workflow.test.ts`

Expected: PASS for the new helper tests.

### Task 2: ArtifactTrustPanel Checklist UI

**Files:**
- Modify: `frontend/src/features/security-platform/index.tsx`
- Modify: `frontend/src/features/security-platform/supplement-file-workflow.test.ts`

**Interfaces:**
- Consumes: helpers from Task 1.
- Produces: `ArtifactTrustPanel` renders five material rows and disables verification until required files are selected.

- [ ] **Step 1: Write failing integration/source tests**

Add tests against `index.tsx?raw` that assert `ArtifactTrustMaterialRow`, required/optional material helper usage, `补齐必填材料后验证`, and `请先补充产物文件和来源证明` appear in the artifact panel source.

- [ ] **Step 2: Run focused test and verify failure**

Run: `npm run test -- src/features/security-platform/supplement-file-workflow.test.ts`

Expected: FAIL because the source does not yet contain the checklist UI and copy.

- [ ] **Step 3: Implement checklist UI**

Update `ArtifactTrustPanel` to render a material checklist in the input card. Keep artifact and attestation as real file inputs. Represent optional signature/certificate/log proof as frontend-only readiness state. Keep policy and expected release information mapped to existing configuration fields.

- [ ] **Step 4: Run focused test and verify pass**

Run: `npm run test -- src/features/security-platform/supplement-file-workflow.test.ts`

Expected: PASS.

### Task 3: Final Verification

**Files:**
- Review modified files from Tasks 1 and 2.

**Interfaces:**
- Consumes: Completed helper and UI changes.
- Produces: Verified frontend build.

- [ ] **Step 1: Run focused test**

Run: `npm run test -- src/features/security-platform/supplement-file-workflow.test.ts`

Expected: PASS.

- [ ] **Step 2: Run frontend build**

Run: `npm run build`

Working directory: `frontend`

Expected: Vite build completes successfully.

- [ ] **Step 3: Inspect git status**

Run: `git status --short`

Expected: Only the intended files are newly modified by this task, alongside pre-existing unrelated workspace changes.
