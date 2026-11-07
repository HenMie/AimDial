# Design

<!-- impeccable:design-schema 1 -->

AimDial is a measuring instrument. Its interface exists to answer one question at
a glance — *what number do I type into the game right now* — and then to record
the result without ceremony. The design system below is what that job produced;
it is written from the built interface in `src/`, not from a mood board.

## Surface modes

| Surface | Mode | Why |
| --- | --- | --- |
| `#/setup` (screens `01`) | Operate | Two inputs and one action; the dial previews the bracket the run will test. |
| `#/run` (screen `02`) | Operate | Repeated data entry mid-game-session, often one-handed on a phone. |
| `#/result` (screen `03`) | Read | The player scans a recommendation and the evidence behind it. |
| Method section (home page) | Read | Four explanatory steps with drawn figures. |

Persuade does not appear anywhere in the product. There is nothing to sell and
no visitor to convert; a marketing register here would be a costume.

## Colour

Committed *Restrained*: two saturated colours, each with exactly one job, over a
warm paper ground. Every other surface is ink at a reduced strength.

| Token | Value | Job |
| --- | --- | --- |
| `--paper` | `#f3efe6` | Ground. Warm, not cream-white: read next to a lit monitor, the page must not glow. |
| `--paper-top` | `#f7f4ec` | Raised surfaces (dial face, keypad keys, figures). |
| `--paper-sunk` | `#ebe5d8` | Pressed and hovered states, tick-row hover. |
| `--ink` | `#15130d` | Primary text and all rules. Never pure black. |
| `--ink-2` | `#3d3830` | Body copy, secondary figures. 9.4:1 on paper. |
| `--ink-3` | `#6a6459` | Labels, captions, notes. 4.9:1 on paper — the floor for anything readable. |
| `--ink-4` | `#a29b8d` | Disabled text and empty placeholders only. Never load-bearing. |
| `--rule` | `#d8d1c1` | Separating rules inside a group. |
| `--rule-2` | `#c3bba9` | Structural rules, tick marks, keypad key borders. |
| `--signal` | `#c8402a` | Exactly one job: the sensitivity the player must act on, plus the current step in the step scale. 4.75:1 on paper, 4.95:1 on `--paper-top`. |
| `--signal-ink` | `#8e2a1a` | Signal's text-on-wash variant and the primary button's bottom edge. |
| `--signal-wash` | `#f6ded6` | Error notice ground. |
| `--confirm` | `#0e6659` | Exactly one job: a value the search has *confirmed*. 5.1:1 on paper. |
| `--confirm-wash` | `#dcece7` | Confirmed row ground, ABBA figure boxes. |
| `--focus` | `#135e8c` | Focus rings only. Deliberately not the signal red: focus and "the number" must never be confusable. |

Rules of the palette:

- **Signal red is never decoration.** If it is red, it is the setting to type, the
  current step, or a primary action. No red rules, no red headings, no red icons.
- **Teal is never a candidate.** It only appears once a comparison has *accepted*
  a setting, so a player can read the result page by colour alone.
- **Ink carries hierarchy.** Headings, body, labels and captions are one colour at
  four strengths; that is the whole type hierarchy, and it keeps the page calm.

## Type

No webfonts are loaded. The page opens in a phone browser beside a running game,
so the faces are ones already on the machine. Numerals are the design, and both
faces ship tabular figures.

| Token | Stack | Use |
| --- | --- | --- |
| `--sans` | `'Segoe UI Variable Display', 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', system-ui, sans-serif` | Headings, body, buttons, labels, step names. |
| `--mono` | `'Cascadia Mono', 'Consolas', 'SF Mono', ui-monospace, 'Menlo', monospace` | Every measured value: sensitivities, kill counts, tick labels, dates, the wordmark's kicker. |

`.num` is the single class that applies the mono face, `font-variant-numeric:
tabular-nums`, `zero` and `-0.02em` tracking. Every number in the product carries
it, so digits never shift width as a value updates.

Scale (fixed rem, ratio ≈ 1.14 — product UI, not a brand page):

| Token | Size | Use |
| --- | --- | --- |
| `--step-0` | 0.8125rem | Micro labels inside tables and ledgers. |
| `--step-1` | 0.9375rem | Body default. |
| `--step-2` | 1.0625rem | Setup lede. |
| `--step-3` | 1.375rem | `Reading` values. |
| `--step-4` | 2rem | Reserved; not currently used at rest. |
| `--step-5` | `clamp(3.5rem, 12vw, 5.5rem)` | The one hero number per screen. |

Display sizes are the exception to fixed rem: the hero number is `clamp()`ed
because it must fill a 390px phone and a 1440px screen at the same optical
weight. Tracking floor is `-0.06em` on the hero, `-0.02em` on mono body, and
never tighter than `-0.03em` on the sans headings.

## Instrument grammar

The components are the vocabulary. They are in `src/components/instrument.jsx`.

### `Dial`

The product's signature device. A log-scale ruler over the closed ratio range
`[0.5, 1.5]`, so equal factors land at equal distances: `project(r) =
log(r / 0.5) / log 3`. Ratios are taken against the bracket's base, which means
the ±1.25 candidates sit on the same spacing whatever the base is.

- Ticks: 11 stops, five of them *major* and printed (`×0.5`, `×0.75`, `×1`,
  `×1.25`, `×1.5`) — whole fractions only, so the row never reads as a wall of
  decimals.
- Markers: a needle plus a diamond cap, one per tested setting. Four kinds —
  `base` (ink, solid cap), `candidate` (ink, hollow cap), `active` (signal red,
  the setting you are on now), `confirm` (teal, a confirmed winner). Duplicate
  settings collapse into a subscript (`×2`) rather than stacking labels, and a
  live kind always wins over `base` when the two share a position.
- Values print as three-decimal numerals under their needle, with `data-anchor`
  flipping the outermost labels inward so nothing clips at the frame edge.
- `.is-compact` hides the big readout (visually only, still announced) for the
  run screen, where the same number is already the page heading.
- The frame is a caliper: two short tabs outside the box, `--pad` inside, so the
  scale never touches a page edge.

### `Reading`

Label / value+unit / note, on a hairline row. Tones: `ink`, `confirm`, `signal`.
Used only on the result page's measurement column.

### `SectionMark`

The section label: a single letter (`B`, `C`, `D`, `H`, `M`), the title, and a
right-aligned count, all sitting on a solid 1px ink rule. The letter is a
subscript in signal red, not a numbered chapter heading — the number would
imply a sequence the reader does not need, while a single mark is how a
instrument labels a scale.

### `KillBar`

A ruler-backed bar over the 30-bot round: a 1px repeating-linear-gradient scale
with a solid fill whose width is the kill count. Tones `ink`, `signal`,
`confirm`. It replaces any chart library; the maximum is always the same 30, so
bars are directly comparable down a column.

### `KillPad`

The run screen's input: a two-digit reading display plus a 10-key grid
(`1–9`, 清除, `0`, 30) and the record action. Digits are taken from the
`document` keydown as well, skipping real form fields, so a desktop player can
type `24` ⏎ without finding a field. The maximum is 30 and the app refuses
anything above it inline rather than silently truncating.

## Layout

- One column grid, `min(1120px, 100%)`, `--gutter: clamp(20px, 4vw, 44px)`.
  At ≤620px the gutter drops to 18px.
- Two-column compositions (`setup`, `run`, `result-hero`) are
  `minmax(0, 1.42fr) minmax(0, 1fr)` with a `clamp(24px, 5vw, 64px)` gap: the
  instrument is 1.4× the entry column, because the scale is what the page is
  about. Both collapse to one column at ≤900px.
- Spacing rhythm: 8px base; groups 16–22px; section separation
  `clamp(36px, 6vw, 64px)`; more space above a heading than below it.
- Rules, not borders: thin ink rules separate groups, section marks sit on a
  solid 1px rule, and the only boxed surfaces are the dial (ink 1px), the
  resume banner (ink 1px, diagonal hatch) and the keypad keys (`--rule-2`).
- No nested cards and no card grid. If a region needed a card, the region was
  wrong.

## Motion

One authored moment per state change, exponential ease-out only
(`--ease: cubic-bezier(0.16, 1, 0.3, 1)`):

- Step entry: `settle` — 10px rise and fade over 420ms.
- Dial marker: `left` transitions over 320ms, so the needle glides to the new
  setting instead of jumping.
- `KillBar` fill: width over 340ms.
- Ledger rows: `row-in`, 300ms, 6px slide.
- Keypad and buttons: 80–140ms background/border/transform feedback only.

No bounce, no elastic, no parallax, no scroll choreography. Everything above is
disabled wholesale under `prefers-reduced-motion: reduce`, and the page's default
state is always the visible one — nothing is animated *in* from a hidden start on
load.

## States

Every interactive component has default, hover, focus-visible, active, and
disabled; errors are inline notices, never alerts.

| State | Treatment |
| --- | --- |
| Hover | `--paper-sunk` ground, or a rule that darkens to `--ink`. |
| Focus-visible | `2px solid var(--focus)`, `offset: 3px`, on every focusable element including `<summary>`. |
| Active | 1px translate down on buttons; primary drops its bottom shadow. |
| Disabled | `--ink-4` text, no shadow, `cursor: default`. |
| Error | `.notice[data-tone='error']`: signal wash fading to transparent, `--signal-ink` text, `role="alert"`. Never a red border. |
| Confirm | `.notice[data-tone='confirm']` and the `采用` tag, both teal. |
| Empty | The sensitivity field shows `—.———` in the dial and borrows the 256 eDPI scale, captioned as borrowed. The history and ledger render nothing rather than an empty shell. |
| Loading | The save indicator (`已保存` / `保存中` / `保存失败`) is the only async state; it is text plus a dot, never a spinner. |

## Browser surfaces

The page owns what the browser draws: `::selection` inverts to ink on paper;
`caret-color` is signal red; the body scrollbar is thumbed in `--rule-2` with a
paper-coloured border; `scrollbar-color`/`scrollbar-width` are declared for
Gecko; `theme-color` is the paper ground so a phone's chrome matches the page;
`color-scheme: light` prevents forced-dark inversion of native controls; number
spinners are removed (`appearance: textfield`) because they are unusable at
44px; `<summary>` markers are replaced with a drawn `+` / `−`.

## Do not

- Do not introduce a third accent colour, a gradient, or a glow.
- Do not give signal red to anything that is not the actionable number, the
  current step, or a primary action.
- Do not use a card as a container, nest surfaces inside surfaces, or draw a
  coloured side border on a callout.
- Do not set a display face or a webfont: the page must render offline on the
  device it is used on.
- Do not use icons as decoration; the only icon is the back chevron and the
  wordmark bezel, both authored SVG.
- Do not animate anything that does not convey a state change.
