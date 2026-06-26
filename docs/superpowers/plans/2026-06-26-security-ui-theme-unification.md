# Security UI Theme Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the frontend into a professional security operations console with polished, consistent light and dark modes.

**Architecture:** Centralize visual decisions in CSS tokens and shared surface utilities first, then update shared components and page-level hard-coded styling to consume those tokens. Avoid changing API calls, routing, data models, scan flows, authentication behavior, or report generation logic.

**Tech Stack:** React 19, Vite, Tailwind CSS v4, shadcn-style components, Radix UI, Recharts, React Flow, Motion.

## Global Constraints

- Preserve light and dark mode switching.
- Use global CSS tokens as the source of truth.
- Dark mode must use a deep blue-black page background, not absolute black.
- Dark mode must make page, shell, panel, card, inset, and overlay surfaces visibly distinct.
- Light mode must use a cool off-white / blue-gray page background, not pure white.
- Cyan is the primary action and selection signal.
- Do not change API calls, routing, data models, scan flows, authentication behavior, or report generation logic.
- Run `npm run build` in `frontend` before claiming completion.

---

## File Structure

- Modify `frontend/src/styles/theme.css`: global light/dark color tokens, surface tokens, shadow tokens, sidebar tokens, typography tokens.
- Modify `frontend/src/styles/index.css`: base body background, surface utility classes, React Flow styling, shared code/evidence styling.
- Modify shared UI components:
  - `frontend/src/components/ui/card.tsx`
  - `frontend/src/components/ui/button.tsx`
  - `frontend/src/components/ui/input.tsx`
  - `frontend/src/components/ui/textarea.tsx`
  - `frontend/src/components/ui/select.tsx`
  - `frontend/src/components/ui/tabs.tsx`
  - `frontend/src/components/ui/dialog.tsx`
  - `frontend/src/components/ui/dropdown-menu.tsx`
  - `frontend/src/components/ui/popover.tsx`
  - `frontend/src/components/ui/sheet.tsx`
  - `frontend/src/components/ui/sidebar.tsx`
- Modify page/panel styling:
  - `frontend/src/features/security-platform/index.tsx`
  - `frontend/src/features/project-import/index.tsx`
  - `frontend/src/features/project-preflight/index.tsx`
  - `frontend/src/features/security-platform/report-panel.tsx`
  - `frontend/src/features/security-platform/multimodal-evidence-panel.tsx`
  - `frontend/src/features/security-platform/attack-chain-graph.tsx`
  - `frontend/src/components/ui/animated-characters-login-page.tsx`

## Task 1: Global Theme Tokens And Surface Utilities

**Files:**
- Modify: `frontend/src/styles/theme.css`
- Modify: `frontend/src/styles/index.css`

**Interfaces:**
- Consumes: Existing Tailwind token names such as `--background`, `--card`, `--border`, `--input`, `--sidebar`.
- Produces: New CSS variables `--surface-shell`, `--surface-panel`, `--surface-card`, `--surface-inset`, `--surface-overlay`, `--surface-hover`, `--shadow-soft`, `--shadow-raised`, `--shadow-interactive`.

- [ ] **Step 1: Update light and dark tokens**

In `frontend/src/styles/theme.css`, replace the root and `.dark` token values with a cool light palette and layered dark palette. Keep existing variable names and add the new surface/shadow variables.

- [ ] **Step 2: Wire surface tokens into Tailwind theme**

In the `@theme inline` block, expose the new surface variables as color tokens if Tailwind utilities need them:

```css
--color-surface-shell: var(--surface-shell);
--color-surface-panel: var(--surface-panel);
--color-surface-card: var(--surface-card);
--color-surface-inset: var(--surface-inset);
--color-surface-overlay: var(--surface-overlay);
--color-surface-hover: var(--surface-hover);
```

- [ ] **Step 3: Refine base page styling**

In `frontend/src/styles/index.css`, update `body` so the app background uses the new page token and has a subtle professional console feel in both themes without decorative orbs.

- [ ] **Step 4: Replace surface utilities**

Update `surface-raised`, `surface-base`, `surface-inset`, and `surface-glow` so they use the new surface and shadow tokens. Add `surface-panel` and `surface-overlay` utilities if useful.

- [ ] **Step 5: Improve evidence and flow surfaces**

Update `code-evidence`, `action-advice`, and `.security-flow` styles so nested panels remain legible in both light and dark modes.

- [ ] **Step 6: Build-check CSS validity**

Run: `npm run build`

Working directory: `frontend`

Expected: Vite build completes without CSS or Tailwind errors.

## Task 2: Shared UI Component Alignment

**Files:**
- Modify: `frontend/src/components/ui/card.tsx`
- Modify: `frontend/src/components/ui/button.tsx`
- Modify: `frontend/src/components/ui/input.tsx`
- Modify: `frontend/src/components/ui/textarea.tsx`
- Modify: `frontend/src/components/ui/select.tsx`
- Modify: `frontend/src/components/ui/tabs.tsx`
- Modify: `frontend/src/components/ui/dialog.tsx`
- Modify: `frontend/src/components/ui/dropdown-menu.tsx`
- Modify: `frontend/src/components/ui/popover.tsx`
- Modify: `frontend/src/components/ui/sheet.tsx`
- Modify: `frontend/src/components/ui/sidebar.tsx`

**Interfaces:**
- Consumes: Surface variables and utilities from Task 1.
- Produces: Shared components whose default, hover, active, focus, disabled, selected, and overlay states are consistent in both themes.

- [ ] **Step 1: Align Card defaults**

Update the Card root class to use `surface-raised` or equivalent tokenized background, border, and shadow while preserving existing `className` overrides.

- [ ] **Step 2: Align Button variants**

Refine primary, secondary, outline, ghost, link, and destructive variants so hover and active states are visible in light and dark mode. Keep existing variant names and sizes.

- [ ] **Step 3: Align form controls**

Update Input, Textarea, Select trigger, Checkbox, Radio, Switch if needed so backgrounds are not transparent in dark mode and focus rings remain visible.

- [ ] **Step 4: Align tabs**

Update TabsList and TabsTrigger so active tabs are clearly separated from the list background in both themes.

- [ ] **Step 5: Align overlays**

Update Dialog, DropdownMenu, Popover, and Sheet content classes to use `surface-overlay`, visible border, and raised shadow.

- [ ] **Step 6: Align sidebar**

Update sidebar container and active menu item classes to use `--sidebar`, `--sidebar-accent`, and visible active borders/shadows.

- [ ] **Step 7: Build-check shared components**

Run: `npm run build`

Working directory: `frontend`

Expected: Vite build completes without TypeScript or CSS errors.

## Task 3: Main Workspace And Security Panels

**Files:**
- Modify: `frontend/src/features/security-platform/index.tsx`
- Modify: `frontend/src/features/security-platform/report-panel.tsx`
- Modify: `frontend/src/features/security-platform/multimodal-evidence-panel.tsx`
- Modify: `frontend/src/features/security-platform/attack-chain-graph.tsx`

**Interfaces:**
- Consumes: Shared component styles and surface utilities from Tasks 1 and 2.
- Produces: Investigation workspace, report, graph, and multimodal panels with consistent page/card/inset hierarchy.

- [ ] **Step 1: Replace shared workspace class constants**

Update `actionButtonClass`, `fileInputClass`, `moduleCardClass`, and related constants in `security-platform/index.tsx` to use token-compatible classes instead of dark-only slate/cyan surfaces.

- [ ] **Step 2: Improve workspace shell**

Update root workspace, fixed header, side assistant column, and tab content containers so each layer has a visible border/background difference in both themes.

- [ ] **Step 3: Replace repeated dark-only blocks**

Use targeted replacements for `bg-slate-950`, `bg-slate-900`, `dark:bg-...950/45`, and `bg-background/70` where they represent cards, panels, upload zones, or list rows. Prefer `surface-raised`, `surface-base`, or `surface-inset`.

- [ ] **Step 4: Align ReportPanel surfaces**

Update report metric cards, report summary panels, heatmap cells, export buttons, and evidence blocks to use shared surfaces and restrained interactions.

- [ ] **Step 5: Align MultimodalEvidencePanel surfaces**

Update upload zone, risk cards, entity cards, finding cards, source cards, and detail overlay to use shared surfaces while preserving severity colors.

- [ ] **Step 6: Align AttackChainGraph surfaces**

Update graph node cards, fullscreen shell, evidence side panels, and React Flow container colors to use shared surfaces and visible borders.

- [ ] **Step 7: Build-check workspace**

Run: `npm run build`

Working directory: `frontend`

Expected: Vite build completes without TypeScript or CSS errors.

## Task 4: Import, Preflight, And Login Pages

**Files:**
- Modify: `frontend/src/features/project-import/index.tsx`
- Modify: `frontend/src/features/project-preflight/index.tsx`
- Modify: `frontend/src/components/ui/animated-characters-login-page.tsx`

**Interfaces:**
- Consumes: Shared component styles and surface utilities from Tasks 1 and 2.
- Produces: Entry, import, and preflight experiences that match the main workspace in both modes.

- [ ] **Step 1: Align ProjectImportPage**

Update root background, header, preset cards, custom project card, upload/git/local form groups, icon containers, and action button classes to use the shared surface and action system.

- [ ] **Step 2: Align ProjectPreflightPage**

Update summary panel, readiness cards, metric cards, chart cards, coverage matrix, key file list, alerts, and judgement blocks to use shared surfaces and readable semantic colors.

- [ ] **Step 3: Align login page**

Update `animated-characters-login-page.tsx` background, login form card, tabs, provider buttons, inputs, checkbox, and primary action so the page still feels animated but belongs to the same security console palette.

- [ ] **Step 4: Build-check entry pages**

Run: `npm run build`

Working directory: `frontend`

Expected: Vite build completes without TypeScript or CSS errors.

## Task 5: Final Verification And Cleanup

**Files:**
- Review modified files from Tasks 1-4.

**Interfaces:**
- Consumes: Completed visual updates.
- Produces: Verified build and concise completion summary.

- [ ] **Step 1: Scan for remaining hard-coded dark surfaces**

Run:

```powershell
rg "bg-slate-950|bg-slate-900|bg-zinc-950|bg-black|dark:bg-slate-950|dark:bg-slate-900" frontend\src
```

Expected: Remaining matches are intentional fixed visuals, code snippets, or animation assets; not generic UI panels.

- [ ] **Step 2: Scan for token usage**

Run:

```powershell
rg "surface-raised|surface-base|surface-inset|surface-panel|surface-overlay" frontend\src frontend\src\styles
```

Expected: Surface utilities are used by global styles and major pages/panels.

- [ ] **Step 3: Run final build**

Run: `npm run build`

Working directory: `frontend`

Expected: Vite build completes successfully.

- [ ] **Step 4: Summarize changed files**

Run:

```powershell
git status --short
```

Expected: Modified files are limited to the design spec, implementation plan, and intended frontend styling/component/page files, plus pre-existing unrelated user changes.

## Self-Review

- Spec coverage: Tasks cover global tokens, surface utilities, shared components, main workspace, import, preflight, login, report, graph, multimodal panels, and final verification.
- Placeholder scan: The plan contains no TBD/TODO/fill-in placeholders.
- Scope check: All tasks are visual styling and interaction polish only; no backend, routing, data model, or scan-flow changes are included.
