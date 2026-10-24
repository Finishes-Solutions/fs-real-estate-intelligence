# Design system: the feasibility workspace

The workspace (`src/workspace.js`, `src/workspace.css`) is built on the app's existing tokens in `src/app.css` and the
Finishes Solutions brand system (the `finishes-solutions-design` skill):
- Palette: black / white / concrete grey, plus one brand green, `#006527` (`--green-700`).
- Type: Montserrat for display and body; IBM Plex Mono for uppercase labels and every figure.
- Shapes: hairline borders, tight radii, low cool shadows, quick purposeful motion. No emoji.

New UI uses these tokens and never literal values, except a few local status tints defined once at the top of
`workspace.css`.

## Tokens used

| Group | Tokens (app.css `:root`) | Notes |
|---|---|---|
| Brand | `--green-50…900` (`--green-700` primary), `--ink-50…950` | The brand ramp is identical to the design system's `tokens/colors.css` |
| Surfaces | `--panel`, `--panel-2`, `--bg`, `--line`, `--line-2` | Cards are `--panel` with a `--line` hairline |
| Text | `--text`, `--text-2`, `--muted` | `--muted` #686e71 is 5.2:1 on white, 4.9:1 on `--panel-2` |
| Status | `--danger` #b42318, local `--ws-warn` #8a5a12 (5.9:1 on white, 5.5:1 on its tint; replacing the app's 3.6:1 amber for text) | Success uses the brand green |
| Space | `--sp-1…8` (4px grid) | |
| Type | `--fs-label…2xl`, `--font-display`, `--font-mono` | Figures: mono, tabular numerals |
| Shape | `--r-sm` (4px) everywhere in the workspace, `--sh-1` | Square-ish, never pillowy |
| Control | `--tap` 44px (steps, summaries), `--ctl` 36/40px (inputs) | |
| Motion | `--dur-fast`, `--ease`; `prefers-reduced-motion` stops spinners and transitions | |
| Focus | `--focus` (green-600) 2px outline, offset 1–2px | |

## Components

| Component | Markup / classes | Behaviour and states |
|---|---|---|
| **Stepper** | `nav.ws-steps > ol > li > button.ws-step[data-step][data-state]`, `.ws-dot` (number or check), `.ws-sl` (label) | States: `done` (green dot, check), `ready` (outlined number), `blocked` (dashed, grey; clicking shows what it needs). The current step has `aria-current="step"` and a green underline. Arrow keys, Home and End move along it. Sticky under the app bar. Labels hide on phones except the current one |
| **Summary rail** | `aside.ws-rail > .ws-card` with `.ws-kpis`, the scenario picker and `.ws-risks` | Always beside the step (above it under 900px): acres, units, total cost, yield or margin, levered IRR and NPV, the scenario shown, and the top risks with level badges (`.ws-lv`) |
| **Card** | `.ws-card` (`h4` title, `.ws-c` count) | White, hairline, `--sh-1` |
| **KPI tile** | `.ws-kpis > .ws-kpi > b + span` (`.big` = 4 across) | Value in mono 16px, label in mono caps. The first tile carries the green rule |
| **Field** | `label.ws-f > span + input/select/textarea` (`.wide` = full row) | Visible labels always; `ws-num` right-aligns figures |
| **Assumption row** | `.ws-a` (`.edited` when changed): label, `.ws-ai` (input + unit), `.ws-src` chip, Reset link, range note (`small`, `.out` when outside), market check (`.ws-mc`) | Editing updates every number live (debounced 220 ms) and saves on the project (900 ms) |
| **Source chip** | `span.ws-src[data-kind]`: `data` / `derived` (green), `library` (blue), `house` (amber), `user` (solid green "Yours") | The full source, its date and confidence are in `title` and a screen-reader-only span |
| **Disclosure** | `details.ws-box > summary` (`span` title + count/amount) | Assumption groups and budget divisions; open state is kept across redraws |
| **Data table** | `table.ws-t` (`caption`, `thead th[scope=col]`, `tbody th[scope=row]`, `.r`, `.m`, `tr.b` totals, `tr.off` lines left out, `td.base` / `td.neg` in grids) | Wide tables sit in `.ws-scroll[tabindex=0][role=region][aria-label]` so the keyboard can scroll them |
| **Tornado chart** | `svg.ws-tor` (`rect.pos`, `rect.neg`, base line) | Decorative summary of the table below it (the table carries the numbers) |
| **Option picker** | `fieldset.ws-opts > label.ws-opt` (radio + name + `Open in site plan`) | The checked option is outlined in green |
| **Mix editor** | `fieldset.ws-mix > .ws-mixr` | Per-scenario unit mix (sf and %) |
| **Loading** | `.ws-loading` (`role=status`) with `.ws-spin` and `.ws-skel` bars; inline `.ws-busy` | Shown while the market data loads, a layout is generated or a file is made |
| **Empty** | `.ws-empty` (icon, `h4`, text, one primary action) | Every step has one: no parcels, no site option, not laid out, nothing to price, no report yet |
| **Error** | `.ws-err` (`role=alert`, optional Try again) | Study errors, API failures (with the offline alternative), survey problems |
| **Warning** | `.ws-warnbox` | Scope notes, budget checks, layout checks, missing market data |
| **Scope footer** | `.ws-scope` | The feasibility / schematic-only statement on every step |

## Layout and breakpoints

| Width | Layout |
|---|---|
| ≥ 1480px | Two columns: step and rail. Pro Forma puts assumptions and results side by side |
| 1100–1480px | Pro Forma's assumptions and results stack |
| ≤ 1100px | Pro Forma KPIs go 2 across |
| ≤ 900px | One column, with the rail above the step (3 KPIs across) |
| ≤ 560px | Step labels collapse to numbers except the current one; assumption rows wrap; file buttons go full width |

## Voice

- Sentence case for headings and buttons; mono uppercase for labels and units.
- Plain-English notes say where a number came from and what would settle it.
- Every screen repeats that the work is feasibility / schematic only.
