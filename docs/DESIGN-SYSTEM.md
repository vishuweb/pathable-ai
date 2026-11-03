# PathAble design system

One design language for every screen — public, reporting flow and owner workspace.
Implemented as layered CSS loaded in this order (later files refine earlier ones):
`app/globals.css` (base) → `app/design.css` (tokens, header/footer, buttons, dialogs,
toasts, skeletons) → `app/design-home.css` (landing) → `app/design-pages.css`
(explorer, profiles, flows, reports, needs, workspace, demo, target sizes).
No page may invent its own colours, radii or spacing — extend the tokens here.

## Tokens (`app/design.css` `:root`, state colours in `app/globals.css`)

| Token | Value / role |
| --- | --- |
| `--bg` / `--surface` / `--surface-2` | Page, card and inset backgrounds (`#f6f5f1` / white / `#eeede6`) |
| `--text` / `--muted` | Body text `#16211f`, secondary `#4d5a57` — both ≥4.5:1 on their backgrounds |
| `--accent` / `--accent-hover` / `--accent-soft` | Primary brand teal `#0b5d5b` / `#084a48` / `#e2f0ee` |
| `--ink` / `--on-ink` / `--on-ink-muted` | Dark footer and toast surface `#10302e` |
| `--border` / `--border-strong` | Hairlines `#d9d7cd`, control borders `#8a9490` (≥3:1) |
| `--ok-*`, `--warn-*`, `--danger-*` | Success, warning, error background+text pairs (globals.css) |
| `--amber`, `--focus` | Map highlight; focus ring `#16211f`, 3px with 2px offset |
| `--radius` / `--radius-lg` | 10px controls, 16px cards/dialogs |
| `--shadow-sm` / `--shadow-md` | Resting and raised surfaces |
| `--page` / `--gutter` | 1180px content width; `clamp(1rem, 4vw, 2rem)` gutters |

## Typography

Atkinson Hyperlegible (Braille Institute), bundled at build time — no font-service
request. `h1` clamps 1.75–2.5rem, `h2` 1.25–1.6rem, body 1rem/1.55, metadata 0.82–0.95rem.
Headings use -0.012em tracking; nothing below 0.82rem is used for information.

## Component rules

- **Buttons:** `.button-primary` / `.button-secondary` / `.button-solid-danger`,
  min-height 44px, radius 9px, disabled state keeps readable contrast.
- **Chips/filters:** `.filter-button`, pill, `aria-pressed` fills with accent.
- **Cards:** 1px `--border`, `--radius-lg`, `--shadow-sm`; whole-card link targets
  use a stretched `::after` (place cards).
- **Status:** `.provenance-*` badges — every state carries a *word*, never colour alone:
  Unknown, Recorded in OpenStreetMap, Community reported, Reporter confirmed,
  AI suggested (`Unverified AI finding`), Independently verified, Outdated, Resolved.
- **Forms:** `.field` controls min-height 44px, 1.5px `--border-strong`.
- **Dialogs/drawers/toasts:** native `<dialog>` (`.modal`, `.modal-drawer`),
  `.toasts` bottom-right, errors use the danger surface.
- **Loading/empty:** `.skeleton*` shimmer (disabled under reduced motion),
  `.empty-state` dashed panel — empty results never read as good news.

## Interaction & accessibility minimums (enforced by `ui-review/pages.spec.ts`)

- Interactive targets ≥24px (WCAG 2.5.8); primary controls, nav, buttons,
  checkboxes (24–26px), selects and standalone action links are 44px-class.
  Links *inside a sentence* are the WCAG prose exemption and keep text flow.
- Keyboard: visible 3px focus, focus never hidden under sticky bars
  (`scroll-padding-top` 90–150px), phone menu closes on Escape and restores focus,
  skip link paints above the header (z-index 3000, inside the header landmark).
- `prefers-reduced-motion` collapses all animation in `design.css`.
- Colour is never the only cue: numbered markers, labels and icons accompany colour.

## Responsive

Mobile-first. Breakpoints in use: 420, 520, 640, 720, 860–880, 959–1000px.
Verified by screenshot at 360, 390, 768, 1280 and 1920px in the UI review —
no horizontal overflow, no clipped sticky bars, map/list toggle below 960px.

## Data honesty (design-level)

Unknown stays unknown and looks different (dashed `.feature-unknown`); demo data
only ever appears behind the sticky `Illustrative demo — not verified campus data`
banner; no ratings, scores or completeness percentages are rendered unless they
are calculated from real records and labelled as such.
