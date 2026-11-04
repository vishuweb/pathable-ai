# PathAble design system

One quiet design language for every screen: public pages, the report flow and the owner workspace. It lives in one stylesheet, `app/styles.css`, and nothing else defines colours, type or spacing.

## Principles

- **Type and space do the work.** Structure comes from a clear type scale, generous margins and hairlines, not from boxes. A surface is used only when something sits above something else: dialogs, the search bar, photos.
- **One ink, one accent.** Near-black for text and primary actions; a single deep green for small highlights. State colours appear only where a state is being reported.
- **One main thing per screen.** Secondary controls fold away: explorer filters, the observation form, the sources note, long lists.
- **Unknown stays unknown, and looks calm.** A missing detail is one quiet line with a hollow marker, not an alarming box.

## Tokens (`:root` in `app/styles.css`)

| Token | Role |
| --- | --- |
| `--bg`, `--tint` | White page; warm off-white for the rare surface (`#f6f5f1`) |
| `--text`, `--muted` | Ink `#111614`; secondary `#59625f`, at least 4.5:1 on both backgrounds |
| `--line`, `--line-strong` | Hairlines `#e7e5df`; control borders `#858c89`, at least 3:1 |
| `--accent`, `--accent-tint` | Deep green `#1a5c4c`, used sparingly |
| `--danger`, `--warn`, `--ok`, `--info` and their `-bg` pairs | State text and background, each at least 4.5:1 |
| `--text-sm` … `--text-3xl` | Type scale: 0.875, 1, 1.125, about 1.5, about 2.5 and about 4.5rem |
| `--page`, `--reading` | 1160px page, 720px reading column for flows and forms |
| `--gutter`, `--section` | Fluid side margins and section spacing |

## Typography

Atkinson Hyperlegible Next, a variable font from the Braille Institute that keeps similar letters distinct for low-vision readers. It is bundled at build time, so no visitor request goes to a font service. Headings use weight 600 with slight negative tracking. Large numbers use 500, because the slashed zero is heavy when bold. Nothing smaller than 0.82rem carries information.

## Components

- **Buttons:** `.button-primary` is solid ink; `.button-secondary` is a hairline outline; `.button-link` is underlined text. All are at least 44px tall except text links in a sentence.
- **Filters:** `.filter-button` pills; pressed means solid ink with white text, plus `aria-pressed`.
- **Status:** `.provenance-*` is a coloured dot followed by the word: Unknown (hollow), Recorded in OpenStreetMap, Suggested by AI, Community reported, Recorded by the project team, Independently verified, Outdated, Resolved. The word always carries the meaning.
- **Lists:** places, reports, queue items, surveys and features are rows separated by hairlines, not cards.
- **Dialogs, drawers, toasts:** the native `<dialog>` element (`.modal`, `.modal-drawer`), and ink toasts at the bottom right.
- **Progress:** one line of text and a 2px bar (`StepProgress`).

## Page structure

- **Home:** large headline, one search field, four text links, and the real campus outline. Then calm sections divided by hairlines: needs, categories as an index, how it works, verification labels, and ways to contribute. Recent reports appear only when there are some.
- **Explore:** search first, then one scrolling row of kinds; needs, filters and sort sit behind one disclosure. Results are a list beside a sticky map, with a list/map toggle on phones.
- **Place profile:** a reading column (overview, barriers, known, checked on site, unknown, community, contribute) beside a sticky side column with the campus position and the counts. Empty sections collapse to a heading and one line.
- **Report flow:** a single 720px column with one question per step, widening to photo and suggestions side by side only for review.
- **Workspace:** a quiet text sidebar on wide screens and a tab strip on phones; figures are large numbers with plain labels.

## Accessibility minimums (checked by `npm run ui:review`)

- Targets at least 24px (WCAG 2.5.8). Primary controls are 44px. Links inside a sentence are exempt.
- 2px focus outline; focus never hidden under the sticky header (`scroll-padding-top`). The phone menu closes on Escape and returns focus.
- Each demo step moves focus to its heading.
- `prefers-reduced-motion` removes all animation and transitions.
- Colour is never the only cue.
- No sideways scrolling from 360px to 1920px.

## Data honesty

Demo content appears only under the "Illustrative demo — not verified campus data." notice. No rating, score or completeness percentage is shown. Counts are labelled as counts, and an empty result says it does not mean "accessible".
