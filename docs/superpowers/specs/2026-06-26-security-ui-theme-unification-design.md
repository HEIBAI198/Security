# Security UI Theme Unification Design

## Goal

Unify the frontend into a professional security operations console while preserving light and dark mode switching. Both modes should feel intentional, readable, and consistent across the investigation workspace, project import, preflight report, login page, report panel, graph views, multimodal evidence, and shared UI components.

## Visual Direction

The interface should feel like a focused security control room: quiet blue-gray structure, precise borders, measured depth, and cyan used as the primary action and selection signal. The UI should avoid a pure black dark mode and avoid a flat pure white light mode.

The signature visual element is a layered "situational surface" system: page, shell, panel, card, inset, and overlay each have distinct color, border, shadow, and hover behavior. This gives dark mode clear boundaries without relying on heavy glow.

## Color System

Use global CSS tokens as the source of truth.

Light mode:

- Page background: cool off-white / blue-gray, not pure white.
- Cards and panels: clean white with visible blue-gray borders.
- Inset surfaces: slightly cooler gray-blue for tables, upload areas, metadata blocks, and empty states.
- Primary action: controlled cyan-blue.
- Text: dark slate with softer secondary and metadata tones.

Dark mode:

- Page background: deep blue-black, not absolute black.
- Main shell: one step lighter than page background.
- Cards and panels: elevated navy surfaces, clearly distinct from the page.
- Inset surfaces: darker but bordered, so nested areas remain visible.
- Borders: visible blue-gray lines with stronger opacity than the current dark theme.
- Shadows: subtle dark elevation plus a small cool outline, not broad neon glow.

Status colors remain semantic:

- Critical / high: red and orange.
- Medium: amber.
- Low / success: emerald.
- Active / selected / primary flow: cyan.

## Theme Tokens

Add or refine tokens for:

- `--background`
- `--foreground`
- `--card`
- `--popover`
- `--muted`
- `--accent`
- `--border`
- `--input`
- `--ring`
- `--sidebar`
- `--surface-shell`
- `--surface-panel`
- `--surface-card`
- `--surface-inset`
- `--surface-overlay`
- `--surface-hover`
- `--shadow-soft`
- `--shadow-raised`
- `--shadow-interactive`

Existing Tailwind utilities and shadcn components should continue to work through the standard tokens. New surface tokens should be used by shared utilities, not copied manually into every page.

## Surface Utilities

Refine these utilities in `frontend/src/styles/index.css`:

- `surface-raised`: primary cards and major panels.
- `surface-base`: secondary cards and list rows.
- `surface-inset`: nested evidence blocks, upload zones, code snippets, matrices, and form groups.
- `surface-glow`: restrained interaction highlight only.
- Add optional utility classes for page shell and subtle section backgrounds if needed.

The utilities must render distinctly in both light and dark modes.

## Shared Components

Update shared component styling where needed:

- `Card`: should use tokenized card background, border, and shadow consistently.
- `Button`: primary, outline, ghost, and secondary states should have unified hover, active, disabled, and focus behavior.
- `Input`, `Textarea`, `Select`: should use visible input backgrounds in both themes.
- `Tabs`: active tab should be obvious in both themes.
- `Sidebar`: should have a separate shell color and active item state.
- `Dialog`, `Dropdown`, `Popover`, `Sheet`: overlay surfaces should stand above page and cards.
- `Alert` and `Badge`: semantic colors should remain readable in both modes.

## Page Updates

Investigation workspace:

- Replace hard-coded dark card backgrounds with surface utilities where practical.
- Keep the compact security-dashboard layout.
- Make the header, side assistant panel, workspace cards, upload blocks, and evidence lists visually separate.
- Keep the cyan action style but reduce overly heavy dark-only shadows.

Project import:

- Align cards, upload panels, preset buttons, and form groups with the global surface system.
- Fix dark-mode button styling so it does not feel disconnected from the rest of the UI.
- Preserve light/dark toggle and import flows.

Project preflight:

- Use the same hero/summary panel treatment as the investigation workspace.
- Improve chart containers, coverage matrix, readiness cards, and judgement panels in both themes.

Login:

- Preserve the animated login experience.
- Bring its background, form card, tabs, inputs, and actions closer to the shared dark console palette.
- Ensure it still reads well as a standalone entry screen.

Report, graph, and multimodal panels:

- Replace isolated dark-only surfaces with shared elevated and inset surfaces where possible.
- Keep data density and existing interactions.
- Preserve graph readability, minimap controls, and fullscreen behavior.

## Interaction Rules

- Hover states may lift by at most a few pixels and should also change border/background color.
- Active states should visibly press down or reduce elevation.
- Focus states must remain visible in both themes.
- Disabled states should be subdued but still legible.
- Motion should respect `prefers-reduced-motion`.
- Avoid heavy glow except for selected graph/path/status moments.

## Testing And Verification

Run at least:

- `npm run build` in `frontend`.

If feasible, run or inspect the app in both light and dark modes and verify:

- Major pages have clear surface separation.
- Header/sidebar/card/input/overlay boundaries are visible.
- Text contrast remains readable.
- No button or badge text overflows its container.
- Theme switching still works.

## Scope Boundaries

This design only changes visual styling and interaction polish. It should not change API calls, routing, data models, scan flows, authentication behavior, or report generation logic.
