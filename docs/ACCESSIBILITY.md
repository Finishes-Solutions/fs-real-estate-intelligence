# Accessibility review: the feasibility workspace (WCAG 2.1 AA)

Run on 2026-10-24 on the sample project, at every step, at desktop (1440×1000) and phone (390×844) sizes.

**How it was checked**
- axe-core (`@axe-core/playwright`, tags wcag2a, wcag2aa, wcag21a, wcag21aa) on `#wsRoot`, run by `scripts/screenshots.mjs`. The results are in `docs/screenshots/axe-results.json`.
- A manual pass of keyboard, focus, names, contrast and motion.

(The `design:accessibility-review` skill could not be loaded in this environment, so its checklist was applied by hand. See docs/DECISIONS.md.)

## Found and fixed

| Issue | WCAG | Fix |
|---|---|---|
| Step buttons' `aria-label` didn't contain their visible text ("3 Plans") | 2.5.3 Label in Name | Removed the `aria-label`. The name is now the visible number and label, plus a screen-reader-only state ("(ready)") |
| Wide tables (sensitivity grids, scenario comparison) scroll sideways but couldn't be reached by keyboard | 2.1.1 Keyboard | Each sits in `.ws-scroll` with `tabindex="0"`, `role="region"` and an `aria-label`, plus a visible focus ring |
| The app's amber `#b7791f` on white is 3.6:1 (the audit found it on warnings in the site plan editor) | 1.4.3 Contrast | The workspace uses `#8a5a12` (5.9:1 on white, 5.5:1 on its tint) for warning text and chips. The editor's own rules are unchanged (out of scope) |
| Site plan editor's Layers / Items tabs called the project page's tab function (a duplicate `setTab` in one scope), so keyboard and click tab switching broke | 4.1.2 / 2.1.1 | Renamed to `setLayTab` (found by the new lint) |

## Checked and passing

- **Keyboard**
  - Every control is a native button, input, select or summary.
  - The stepper supports arrow keys, Home and End.
  - After a step change, focus moves to the step heading (`#wsH`, `tabindex=-1`).
  - Focus and caret are restored after live redraws.
  - Blocked steps say why instead of failing silently.
- **Names and labels**
  - Every input has a visible `<label>`.
  - Budget-rate and include inputs have screen-reader labels naming their line.
  - Source chips expose the full source to screen readers.
  - Tables have captions and `th` scopes.
- **Status**
  - Loading uses `role=status`, errors use `role=alert`.
  - The break-even line, which changes as you edit, is `aria-live="polite"`.
- **Contrast**: no axe-core contrast violations. KPI labels and muted text use `--muted` (5.2:1 on white).
- **Motion**: spinners, skeletons and transitions stop under `prefers-reduced-motion`.
- **Reflow**: one column at 390px with no horizontal page scroll. Only data tables scroll, inside their own regions.
- **Targets**: steps and disclosure summaries are at least 44px tall; inputs are 36–40px.
- **Charts**: the tornado SVG has `role=img` and a label, and the same figures are in the table beside it.

## Known limits

- Report PDFs are rendered untagged (`lib/pdf.mjs` turns tagging off to keep files under Vercel's 4.5 MB response limit). The HTML report ("Open the report here") is fully structured, and the workbook and CSVs carry the same data.
- The map-based site plan editor (drawing on the map) was not re-audited. Keyboard parity for drawing is outside this branch.
