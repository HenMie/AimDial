# Design

<!-- impeccable:design-schema 1 -->

AimDial is a night chart for aim. The interface exists to answer one question at
a glance — *what number do I type into the game right now* — and then to record
the result without ceremony. What follows is written from the built interface in
`src/`, not from a mood board.

The scene is fixed and drives everything below: one person, alone at night, one
monitor lit, playing a tactical shooter whose own interface is dark with bright
data on top. The page matches that room rather than glowing cream-white into it.

## Surface modes

| Surface | Mode | Why |
| --- | --- | --- |
| `#/setup` (screens `01`) | Operate | Two inputs and one action; the plate previews the bracket the run will test. |
| `#/run` (screen `02`) | Operate | Repeated data entry mid-game-session, often one-handed on a phone. |
| `#/result` (screen `03`) | Read | The player scans a recommendation, its evidence, and where it sits among pros. |
| Method section (home) | Read | Four explanatory steps, each figure beside its text. |

Persuade does not appear anywhere. There is nothing to sell and no visitor to
convert; a marketing register here would be a costume.

## Colour

Committed *Restrained*, on a dark ground: a deep ink field, chalk data at four
strengths, brass for construction, and exactly two colours with jobs.

| Token | Value | Job |
| --- | --- | --- |
| `--void` | `#080b11` | The ground itself. Deepest at the page edges, where the light falls off. |
| `--ink-0` | `#0b0f16` | A plate seated directly on the ground (preview frame). |
| `--ink-1` | `#10151e` | The instrument face and raised plates (dial, keypad keys). |
| `--ink-2` | `#161c27` | Hovered plates and secondary raised surfaces. |
| `--ink-3` | `#1e2634` | Pressed states and input wells. |
| `--chalk` | `#e9e5d9` | Primary data and headings. Warm white, never a pure `#fff`, which vibrates on ink. |
| `--chalk-2` | `#c3c0b6` | Body copy, secondary figures. 8.9:1 on `--void`. |
| `--chalk-3` | `#8d8f92` | Labels, captions, notes. 4.9:1 on `--void` — the floor for anything readable. |
| `--chalk-4` | `#5f6672` | Disabled and empty placeholders only. Never load-bearing. |
| `--brass` | `#c9a961` | Kickers, legend marks, corner ticks, the marked bearings on a plate. |
| `--brass-2` | `#8a7340` | The graduated rule under the hero input, dial frame, scrollbar thumb. |
| `--brass-dim` | `#4a4126` | Structural hairlines between rows and around plates. |
| `--signal` | `#ff4655` | Exactly two jobs: the number the player must act on, and the player's own mark among the pros. |
| `--signal-ink` | `#ff8b93` | Signal as text on ink, where full-strength red would fail contrast. |
| `--signal-wash` | `rgba(255,70,85,.14)` | Error notice ground and the selected mode plate. |
| `--confirm` | `#3fd0c9` | Exactly one job: a value the search has *confirmed*. 9.6:1 on `--void`. |
| `--confirm-ink` | `#8ff0ea` | Confirm as text. |
| `--confirm-wash` | `rgba(63,208,201,.13)` | Confirmed row ground. |
| `--focus` | `#6fd3ff` | Focus rings only. Deliberately neither red nor teal: focus, "the number", and "confirmed" must never be confusable. |

Rules of the palette:

- **Signal red is never decoration.** If it is red, it is the setting to type, the
  current step, the primary action, or the player's own position on the chart.
- **Teal is never a candidate.** It appears only once a comparison has *accepted*
  a setting, so the result page is readable by colour alone.
- **Brass is construction, not ornament.** It draws the frame, the rules, the
  graduations and the micro-labels. It never fills a surface or colours body text.
- **Chalk carries hierarchy.** Headings, body, labels and captions are one colour at
  four strengths; that is the whole type hierarchy, and it keeps the page calm.

## Type

No webfonts are loaded. The page opens in a phone browser beside a running game,
so the faces are ones already on the machine. Numerals are the design, and both
faces ship tabular figures.

| Token | Stack | Use |
| --- | --- | --- |
| `--sans` | `'Segoe UI Variable Display', 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', system-ui, sans-serif` | Headings, body, buttons, plate copy. |
| `--mono` | `'Cascadia Mono', 'Consolas', 'SF Mono', ui-monospace, 'Menlo', monospace` | Every measured value, every micro-label, the kicker, dates. |

`.num` is the single class that applies the mono face, `font-variant-numeric:
tabular-nums`, `zero` and `-0.02em` tracking. Every number carries it, so digits
never shift width as a value updates.

Micro-labels (`.setup-kicker`, `.preview-label`) are mono at 0.6875rem with
`0.16–0.22em` tracking and uppercase: on this page that is the chart's own
legend voice, not "technical" costume — every one of them labels a measurement.

Scale (fixed rem, ratio ≈ 1.14 — product UI, not a brand page):

| Token | Size | Use |
| --- | --- | --- |
| `--step-0` | 0.8125rem | Micro labels inside tables and ledgers. |
| `--step-1` | 0.9375rem | Body default. |
| `--step-2` | 1.0625rem | Plate lede copy. |
| `--step-3` | 1.375rem | `Reading` values. |
| `--step-4` | 2rem | Reserved; not currently used at rest. |
| `--step-5` | `clamp(3.5rem, 12vw, 5.5rem)` | The one hero number per screen. |

Display sizes are `clamp()`ed because the hero number must fill a 390px phone and
a 1440px screen at the same optical weight. Tracking floor is `-0.035em` on the
hero, `-0.02em` on mono body, and never tighter than `-0.03em` on sans headings.

## Instrument grammar

The components are the vocabulary. They live in `src/components/instrument.jsx`
(measurement parts) and `src/components/marks.jsx` (authored symbols).

### Authored marks (`marks.jsx`)

None of these is official Valorant artwork. The game enters at the level of an
instrument's parts — the vocabulary a player already reads without being told:

- `Crosshair` — four arms and a gap, plus a centre dot. The aiming reticle,
  reduced to geometry. Signal red where it marks the point being measured.
- `CompassRing` — a ring graduated in 72 ticks with every sixth tick major, and
  one bearing needle. A real graduated scale, not a decorative circle.
- `SprayPlot` — where shots landed around the centre of mass, on a dashed
  crosshair with two range circles. Deterministic, so a session redraws the same.
- `TargetSpheres` — the medium range read as a diagram: one near sphere, three
  far ones, on a sight line.
- `ConstellationPlate` — fixed node/edge data drawn as a chart furniture texture.
  Masked out of the type's way; never used where it would read as illustration.
- `DialMark` — the wordmark's astrolabe: bezel, inner ring, pointer, hub.

Every one is a bare `viewBox` SVG with **no intrinsic size**, so each usage must
set its own width/height class. A mark without one fills its parent — this bit
the footer compass during the build and is why the defaults exist.

### `Dial`

The product's signature device, drawn as an astrolabe face. A log-scale ruler
over the closed ratio range `[0.5, 1.5]`, so equal factors land at equal
distances: `project(r) = log(r / 0.5) / log 3`. Ratios are taken against the
bracket's base, so candidates sit at the same spacing whatever the base is.

- Face: `--ink-1` fading into `--void` under a warm brass pool, framed in
  `--brass-2`. It reads as a lit instrument sunk into the chart, not a card.
- Ticks: 11 stops, five *major* and printed (`×0.5`, `×0.75`, `×1`, `×1.25`,
  `×1.5`) — whole fractions only.
- Markers: a needle plus a diamond cap per tested setting. Four kinds —
  `base` (chalk, solid cap), `candidate` (chalk, hollow), `active` (signal red,
  the setting you are on), `confirm` (teal, a confirmed winner). Duplicates
  collapse into a subscript (`×2`).
- **Every marker carries its own value, and the four kinds are named in a legend
  under the scale.** Hiding a label because two of them were close left the scale
  covered in unexplained diamonds — the reader could see six marks and not know a
  single number. Colliding labels move to a second row instead. A shape that
  carries information and no key is noise, however elegant.
- Values print as three-decimal numerals under their needle, clamped inside the
  frame: the outer marks sit at 0% and 100% of the scale, so the first and last
  labels anchor to their own inner edge rather than centring past it.
- `.is-compact` hides the big readout (visually only, still announced) on the run
  screen, where the same number is already the page heading.
- The frame is a caliper: two short brass tabs outside the box, `--pad` inside.

### `Reading`

Label / value+unit / note, on a hairline row. Tones `ink`, `confirm`, `signal`.
Used only on the result page's measurement column.

### `SectionMark`

The section label: the title and a right-aligned count on one brass hairline.
**The mark owns the divider for its whole group.** Whatever follows it starts
rule-less (`.mark + .history-list`, `.ledger`, `.steps-list`, `.pros-list`), so a
heading rule never stacks against a list rule — two hairlines a few pixels apart
read as a mistake and cut the page into unrelated strips.

### `KillBar`

A ruler-backed bar over the 30-bot round: a 1px repeating-gradient scale with a
solid fill whose width is the kill count. Tones `ink`, `signal`, `confirm`. It
replaces any chart library; the maximum is always 30, so bars compare down a
column.

### `KillPad`

The run screen's input: a two-digit display plus a 10-key grid (`1–9`, 清除,
`0`, 30) and the record action, each key a `--ink-1` plate on a brass hairline.
Digits are taken from the `document` keydown as well, skipping real form fields,
so a desktop player can type `24` ⏎ without finding a field. The maximum is 30
and the app refuses anything above it inline rather than truncating.

### Method figures

Four figures explaining one four-stage loop. They share the palette and the
10px mono label voice, and **nothing else** — no shared rail, no shared box, no
shared plate. Each exploits a different drawing device, so the four are
distinguishable by silhouette while scrolling:

| Step | Device | What the shape asserts |
| --- | --- | --- |
| 01 screen | A graduated strip with a caliper span | Three settings on a continuous axis, and the span one round covers |
| 02 confirm | A timeline of six ticks in three bracketed pairs | A sequence in time, and why six rounds mean three verdicts |
| 03 narrow | A stacked ladder where length is distance | The halving of hand movement, read as halving |
| 04 gate | A verdict table with column heads | The accept rule applied across two real pairwise differences |

Rules for this section:

- **No plate per step.** The rows are separated by their own hairlines and the
  figure sits beside its text, not in a box below it. Boxing each step turned one
  loop into four identical cards.
- **Every figure must assert a number, not a motto.** Step 04 originally drew a
  threshold with two dots and the caption "门槛 +1 杀" while showing no value
  crossing it; it now shows the two pairwise differences that decide the verdict.
- Labels sit in their own column so none can land on a bar, a dot, or a rule.
- Nothing in a figure repeats a label already in the same row: column heads carry
  the pairing, so rows do not repeat "第 1 对".

## Layout

- One column, `min(1120px, 100%)`, `--gutter: clamp(20px, 4vw, 44px)`;
  at ≤620px the gutter drops to 18px.
- Two-column compositions (`setup`, `run`, `result-hero`) are
  `minmax(0, 1.42fr) minmax(0, 1fr)` with a `clamp(24px, 5vw, 64px)` gap: the
  instrument is 1.4× the entry column. Both collapse to one column at ≤900px.
- **Phone placement is explicit.** `.setup-head` and `.entry` become
  `display: contents` under 900px, so every block inside them must name its own
  `grid-row`. A block without one lands on top of its neighbour; the rows are
  heading → kicker → mode choice → field → preview → action → DPI.
- Spacing rhythm: 8px base; groups 16–22px; section separation
  `clamp(36px, 6vw, 64px)`; more space above a heading than below it.
- Plates, not cards: a bordered box carries corner ticks drawn in brass
  (`.preview-frame`), and the only other boxed surfaces are the dial and the
  keypad keys. There are no rounded corners and no nested cards.
- The ground carries a fixed coordinate grid at 88px, plus a brass pool at the
  top and a faint signal pool at the bottom, so the page has a light source.

## Motion

One authored moment per state change, exponential ease-out only
(`--ease: cubic-bezier(0.16, 1, 0.3, 1)`):

- Step entry: `settle` — 10px rise and fade over 420ms.
- Dial marker: `left` transitions over 320ms, so the needle glides.
- `KillBar` fill: width over 340ms.
- Ledger rows: `row-in`, 300ms, 6px slide.
- Keys and buttons: 80–140ms background/border/transform only; the primary plate
  drops its offset shadow 2px on press.

No bounce, no elastic, no parallax, no scroll choreography. All of it is disabled
wholesale under `prefers-reduced-motion: reduce`, and the default state is always
the visible one — nothing animates *in* from a hidden start on load.

## States

Every interactive component has default, hover, focus-visible, active and
disabled; errors are inline notices, never alerts.

| State | Treatment |
| --- | --- |
| Hover | Plate lifts to `--ink-3`, or a hairline brightens to `--brass-2`. |
| Focus-visible | `2px solid var(--focus)`, `offset: 3px`, on every focusable element including `<summary>`. |
| Active | 2px translate down; the primary plate drops its shadow. |
| Disabled | `--chalk-4` text on `--ink-3`, no shadow, `cursor: default`. |
| Error | `.notice[data-tone='error']`: signal wash fading to transparent, `--signal-ink` text, `role="alert"`. Never a red border. |
| Confirm | `.notice[data-tone='confirm']` and the `采用` tag, both teal. |
| Selected | The chosen mode plate: signal border, signal wash, and a 2px inset bottom bar. |
| Empty | The sensitivity field shows its tick row but no value; history and ledger render nothing rather than an empty shell. |
| Loading | The save indicator (`已保存` / `保存中` / `保存失败`) is the only async state: text plus a dot, never a spinner. |

## Browser surfaces

The page owns what the browser draws: `::selection` is signal red on ink;
`caret-color` is signal red; the scrollbar is thumbed in `--brass-2` on `--void`
with `scrollbar-color`/`scrollbar-width` declared for Gecko; `theme-color` is the
void so a phone's chrome matches; `color-scheme: dark` stops native controls
inverting to light; number spinners are removed (`appearance: textfield`) because
they are unusable at 44px; `<summary>` markers are replaced with a drawn `+`/`−`.

## Do not

- Do not introduce a fourth hue. The palette is ink, chalk, brass, and two
  meaning colours, and that is the whole budget.
- Do not give signal red to anything that is not the actionable number, the
  current step, a primary action, or the player's own mark on the chart.
- Do not use an official Valorant logo, agent portrait, map image, or rank badge.
  The game enters as authored geometry at the level of an instrument part.
- Do not draw a second rule against `.mark`; if a section needs a divider, it is
  the mark's.
- Do not add a card, a rounded corner, or a nested surface.
- Do not set a display face or a webfont: the page must render offline on the
  device it is used on.
- Do not place an authored SVG without giving it a width and height class.
- Do not animate anything that does not convey a state change.
