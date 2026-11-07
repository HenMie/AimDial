import { useId } from 'react'

// The dial is the product's hero: a log-scale instrument whose marker is the
// sensitivity the player will type into the game. Everything it draws is
// derived from `from` (the bracket's base) so the three candidate settings the
// search tests land on exact ticks rather than near them.
const TICK_STOPS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5]
// Only whole fractions get a printed label: ×0.5, ×0.75, ×1, ×1.25, ×1.5. Every
// other stop is a bare tick, so the scale never reads as a row of fractions.
const MAJOR_RATIOS = [0.5, 0.75, 1, 1.25, 1.5]
const STEP = 1.25

// Logarithmic, so equal factors land at equal distances: the ±1.25 bracket sits
// on the same spacing whatever the base is.
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
  const placed = [...byRatio.values()]
    // Outermost labels anchor inward so nothing hangs past the frame.
    .map((marker) => {
      const at = project(ratioOf(marker.value, base)) * 100
      return { ...marker, at, anchor: at < 6 ? 'start' : at > 94 ? 'end' : 'middle' }
    })
    .sort((a, b) => a.at - b.at)

  // The thin end of the scale would put two labels on top of each other. When
  // that happens the dial keeps drawing and hands its numbers to the list,
  // which always has room.
  const crowded = placed.some((marker, i) => i > 0 && marker.at - placed[i - 1].at < 17)
  const showValues = placed.length > 0 && !crowded

  return (
    <div className={`dial${compact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`}>
      <div className="dial-readout">
        {readout != null && <span className="dial-value num">{readout}</span>}
        {readoutCaption && <span className="dial-caption">{readoutCaption}</span>}
      </div>
      <div className="dial-frame">
        <svg
          className="dial-svg"
          viewBox="0 0 600 120"
          preserveAspectRatio="none"
          role="img"
          aria-labelledby={shell}
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
              <line x1={x} x2={x} y1="50" y2="112" className="dial-needle" />
              <rect x={x - 4.5} y="20" width="9" height="9" className="dial-cap" transform={`rotate(45 ${x} 24.5)`} />
            </g>
          )
        })}
        </svg>
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
        <ol className="dial-marks">
          {placed.map((marker) => (
            <li
              key={marker.value}
              className="dial-mark"
              data-kind={marker.kind ?? 'candidate'}
              data-anchor={marker.anchor}
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

export { STEP }
