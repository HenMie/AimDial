import { useId } from 'react'

// The dial is the product's hero: a log-scale instrument whose marker is the
// sensitivity the player will type into the game. Everything it draws is
// derived from `from` (the bracket's base) so the three candidate settings the
// search tests land on exact ticks rather than near them.
const TICK_STOPS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5]
// Only whole fractions get a printed label: ×0.5, ×0.75, ×1, ×1.25, ×1.5. Every
// other stop is a bare tick, so the scale never reads as a row of fractions.
const MAJOR_RATIOS = [0.5, 0.75, 1, 1.25, 1.5]

// Logarithmic, so equal factors land at equal distances. The scale spans ×0.5 to
// ×1.5 around the bracket's base, which covers every candidate any ladder emits
// (the coarse rung tops out at ±25% of the player's own value).
const project = (ratio) => Math.log(ratio / 0.5) / Math.log(3)

const clampRatio = (ratio) => Math.min(1.5, Math.max(0.5, ratio))

/** Ratio of one sensitivity relative to the bracket's base, in the closed range [0.5, 1.5]. */
export function ratioOf(value, base) {
  if (!Number.isFinite(value) || !Number.isFinite(base) || base <= 0 || value <= 0) return null
  return clampRatio(value / base)
}

/** Where a ratio sits on the dial, as a percentage from the left edge. */
export function dialPercent(ratio) {
  return project(ratio) * 100
}

const tickLabel = (stop) =>
  stop === 1 ? '×1' : `×${String(stop).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')}`

/**
 * Place value labels without dropping any.
 *
 * Labels that would collide are pushed to a second row instead of being hidden:
 * a sweep puts six settings close together, and hiding their numbers left the
 * scale covered in unexplained diamonds. Greedy left-to-right placement, two
 * rows, and every label clamped inside the frame — the outer marks sit at 0% and
 * 100% of the scale, so anchoring alone would push their text past the edge.
 */
function placeLabels(placed, minGap = 13) {
  const rows = [[], []]
  let lastAt = -Infinity
  let row = 0
  for (const marker of placed) {
    if (marker.at - lastAt < minGap) row = row === 0 ? 1 : 0
    rows[row].push(marker)
    lastAt = marker.at
  }
  return placed.map((marker) => {
    const r = rows[0].includes(marker) ? 0 : 1
    // Left of 8% anchors to its own left edge, right of 92% to its right edge,
    // everything else is centred. The frame has padding, so 8/92 never clips.
    const anchor = marker.at < 8 ? 'start' : marker.at > 92 ? 'end' : 'middle'
    return { ...marker, row: r, anchor }
  })
}

/** What the four marks on the scale mean. A shape nobody can decode is noise. */
const MARK_LEGEND = [
  { kind: 'base', label: '基准' },
  { kind: 'candidate', label: '待测' },
  { kind: 'active', label: '这一轮' },
  { kind: 'confirm', label: '已确认' },
]

export function Dial({
  base = 0.18,
  markers = [],
  ghost = null,
  readout = null,
  readoutCaption = null,
  referenceTicks = [],
  // The entry field already prints the number at display size, so the setup
  // dial is scale-only: same reason the run screen hides its readout.
  compact = false,
  className = '',
}) {
  const shell = useId()
  const byRatio = new Map()
  markers.forEach((marker) => {
    const ratio = ratioOf(marker.value, base)
    if (ratio == null) return
    const existing = byRatio.get(ratio)
    // A repeat of the same setting (the confirmation replay) gets a subscript
    // instead of a second label stacked on the first.
    if (existing) {
      existing.repeats += 1
      // There is only one needle; when the setting you are on IS the base, the
      // live state has to win so the mark still reads as active.
      if (marker.kind === 'active' || marker.kind === 'confirm') existing.kind = marker.kind
    } else byRatio.set(ratio, { ...marker, repeats: 0 })
  })
  const ghostRatio = ratioOf(ghost, base)
  const placed = placeLabels([...byRatio.values()]
    .map((marker) => ({ ...marker, at: project(ratioOf(marker.value, base)) * 100 }))
    .sort((a, b) => a.at - b.at))

  const showValues = placed.length > 0

  return (
    <div className={`dial${compact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`}>
      <div className="dial-inner">
        <div className="dial-readout">
          {readout != null && <span className="dial-value num">{readout}</span>}
          {readoutCaption && <span className="dial-caption">{readoutCaption}</span>}
        </div>
        <div className="dial-frame">
        {/* The scale is stretched horizontally to fill the frame, so anything
            with a shape of its own cannot live inside it: a rotated square became
            a lozenge, and a tapered blade became a spindle. The needles are drawn
            on the stretched canvas (a vertical line is safe), and the heads ride
            in their own fixed-aspect layer above it. */}
        <svg
          className="dial-svg"
          viewBox="0 0 600 120"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
        <title id={shell}>
          刻度盘，基准 {base.toFixed(3)}，
          {markers.map((marker) => `${marker.value.toFixed(3)}${marker.kind === 'base' ? '（基准）' : ''}`).join('、')}
        </title>
        {TICK_STOPS.map((stop) => {
          const x = project(stop) * 600
          const major = MAJOR_RATIOS.includes(stop)
          return (
            <line
              key={`t${stop}`}
              className={major ? 'dial-tick is-major' : 'dial-tick'}
              x1={x}
              x2={x}
              y1={major ? 68 : 73}
              y2={112}
            />)
        })}
        <line className="dial-rail" x1="0" x2="600" y1="112" y2="112" />
        {readout != null && ghostRatio != null && (
          <line
            className="dial-ghost"
            x1={project(ghostRatio) * 600}
            x2={project(ghostRatio) * 600}
            y1="34"
            y2="112"
          />
        )}
        {placed.map((marker) => {
          const x = marker.at * 6
          return (
            <g key={marker.value} className="dial-marker" data-kind={marker.kind ?? 'candidate'}>
              {/* The head is a fixed 18px layer pinned to the frame top, and the
                  canvas is 120 units tall over that same box, so the tip sits at
                  18/96 * 120 = 22.5 units. The shaft begins a few units below that:
                  a real pointer's tip and its needle are separate parts, and the
                  hairline of ground between them is what reads as machined rather
                  than as one solid shape. */}
              <line x1={x} x2={x} y1="27" y2="112" className="dial-needle" />
            </g>
          )
        })}
        </svg>
        {/* Heads in their own layer, positioned as percentages so they land on the
            same x as their needles without inheriting the horizontal stretch. Each
            head is a tiny fixed-size SVG, so its shape keeps real proportions. */}
        <div className="dial-heads" aria-hidden="true">
          {placed.map((marker) => (
            <svg
              key={marker.value}
              className="dial-head"
              data-kind={marker.kind ?? 'candidate'}
              style={{ left: `${marker.at}%` }}
              viewBox="0 0 12 18"
              width="12"
              height="18"
            >
              {/* A kite: shoulders high, tapering to a point that meets the scale. */}
              <path
                className="dial-head-body"
                d="M6 17.2 L0.8 5.6 L6 0.8 L11.2 5.6 Z"
                vectorEffect="non-scaling-stroke"
              />
              <circle className="dial-head-pin" cx="6" cy="5.6" r="1.3" />
            </svg>
          ))}
        </div>
      </div>
      <div className="dial-ticks" aria-hidden="true">
        {MAJOR_RATIOS.map((stop) => {
          const p = project(stop)
          return (
            <span
              key={stop}
              className="dial-tick-label num"
              data-edge={p < 0.06 ? 'start' : p > 0.94 ? 'end' : undefined}
              style={{ left: `${p * 100}%` }}
            >
              {tickLabel(stop)}
            </span>
          )
        })}
      </div>
      {showValues && (
        <ol className="dial-marks" data-rows={placed.some((m) => m.row === 1) ? 2 : 1}>
          {placed.map((marker) => (
            <li
              key={marker.value}
              className="dial-mark"
              data-kind={marker.kind ?? 'candidate'}
              data-anchor={marker.anchor}
              data-row={marker.row}
              style={{ '--at': `${marker.at}%` }}
            >
              <span className="dial-mark-value num">
                {marker.value.toFixed(3)}
                {marker.repeats > 0 && <sup>×{marker.repeats + 1}</sup>}
              </span>
              {marker.label && <span className="dial-mark-label">{marker.label}</span>}
            </li>
          ))}
        </ol>
      )}
      {/* The scale's vocabulary, spelled out. Without this the four marks are
          just shapes: a reader cannot tell a setting still to be tested from one
          the search already accepted. Each swatch is the same kite the scale
          draws, so the legend maps to the marks without a second explanation. */}
      <ul className="dial-legend">
        {MARK_LEGEND.map((entry) => (
          <li key={entry.kind} data-kind={entry.kind}>
            <svg className="dial-legend-mark" viewBox="0 0 12 18" width="9" height="13" aria-hidden="true">
              <path className="dial-legend-shape" d="M6 17.2 L0.8 5.6 L6 0.8 L11.2 5.6 Z" vectorEffect="non-scaling-stroke" />
            </svg>
            {entry.label}
          </li>
        ))}
      </ul>
      {referenceTicks.length > 0 && (
        <p className="dial-reference">
          {referenceTicks.map((tick) => (
            <span key={tick.key ?? tick.value}>
              <span className="num">{tick.value.toFixed(3)}</span> {tick.label}
            </span>
          ))}
        </p>
      )}
      </div>
    </div>
  )
}

/**
 * A measured value set as an instrument reading: label above, tabular numeral
 * at the size the number deserves, optional footnote under the rule.
 */
export function Reading({ label, value, unit, note, tone = 'ink', size = 'md', style }) {
  return (
    <div className={`reading reading-${size} tone-${tone}`} style={style}>
      <span className="reading-label">{label}</span>
      <span className="reading-value num">
        {value}
        {unit && <span className="reading-unit">{unit}</span>}
      </span>
      {note && <span className="reading-note">{note}</span>}
    </div>
  )
}

/** Section heading set as a calibrated mark: number, rule, title. */
/** Section heading set as a measured mark: the title, a rule, and a count. */
export function SectionMark({ title, note, id }) {
  return (
    <header className="mark">
      <span className="mark-line">
        <h2 className="mark-title" id={id}>
          {title}
        </h2>
      </span>
      {note && <span className="mark-note">{note}</span>}
    </header>
  )
}

/** Horizontal kill bar, scaled to the 30-bot round. */
export function KillBar({ value, max = 30, tone = 'ink' }) {
  const width = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <span className="killbar" data-tone={tone} style={{ '--fill': `${width}%` }} aria-hidden="true">
      <span className="killbar-fill" />
    </span>
  )
}
