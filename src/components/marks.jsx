/**
 * Authored SVG vocabulary for the instrument.
 *
 * None of this is official Valorant artwork. The game enters at the level of an
 * instrument's parts: a crosshair drawn from four arms and a gap, a compass ring
 * graduated in degrees, a spray plot of misses around a centre, target spheres on
 * a sight line. Everything is stroke-authored on a 0..100 viewBox so a single
 * component scales from a 16px glyph to a full-width figure without redrawing.
 */

/** Four-arm crosshair. `gap` and `arm` are percentages of the box. */
export function Crosshair({ gap = 16, arm = 26, className = '', ...rest }) {
  const c = 50
  const inner = gap
  const outer = gap + arm
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" fill="none" {...rest}>
      <g stroke="currentColor" strokeWidth="4" strokeLinecap="square">
        <line x1={c} y1={c - inner} x2={c} y2={c - outer} />
        <line x1={c} y1={c + inner} x2={c} y2={c + outer} />
        <line x1={c - inner} y1={c} x2={c - outer} y2={c} />
        <line x1={c + inner} y1={c} x2={c + outer} y2={c} />
      </g>
      <circle cx={c} cy={c} r="2.2" fill="currentColor" />
    </svg>
  )
}

/**
 * Graduated compass ring. Tick density and the marked bearing make it a real
 * instrument rather than a decorative circle.
 */
export function CompassRing({ ticks = 72, bearing = 0, className = '', label = null }) {
  const c = 50
  const rOuter = 46
  const items = Array.from({ length: ticks }, (_, i) => {
    const angle = (i / ticks) * 360
    const major = i % 6 === 0
    const rad = (angle * Math.PI) / 180
    const r1 = major ? rOuter - 9 : rOuter - 4
    const r2 = rOuter
    return {
      key: i,
      x1: c + Math.sin(rad) * r1,
      y1: c - Math.cos(rad) * r1,
      x2: c + Math.sin(rad) * r2,
      y2: c - Math.cos(rad) * r2,
      major,
    }
  })
  const bRad = (bearing * Math.PI) / 180
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label={label ?? '罗盘'} fill="none">
      <circle cx={c} cy={c} r={rOuter} stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
      <circle cx={c} cy={c} r={rOuter - 13} stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
      {items.map((t) => (
        <line
          key={t.key}
          x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
          stroke="currentColor"
          strokeWidth={t.major ? 1.4 : 0.7}
          opacity={t.major ? 0.85 : 0.4}
        />
      ))}
      <line
        x1={c} y1={c}
        x2={c + Math.sin(bRad) * (rOuter - 16)}
        y2={c - Math.cos(bRad) * (rOuter - 16)}
        stroke="var(--signal, #ff4655)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx={c} cy={c} r="2.4" fill="currentColor" />
    </svg>
  )
}

/**
 * Spray plot: where shots actually landed around the centre of mass.
 * Deterministic so the same session draws the same figure.
 */
export function SprayPlot({ points, className = '', label = '弹道偏转' }) {
  const c = 50
  const scale = 42
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label={label}>
      <g stroke="currentColor" strokeWidth="0.5" opacity="0.22">
        <line x1="8" y1={c} x2="92" y2={c} strokeDasharray="2 3" />
        <line x1={c} y1="8" x2={c} y2="92" strokeDasharray="2 3" />
        <circle cx={c} cy={c} r={scale * 0.5} fill="none" />
        <circle cx={c} cy={c} r={scale} fill="none" />
      </g>
      {points.map((p, i) => (
        <circle
          key={i}
          cx={c + p.x * scale}
          cy={c + p.y * scale}
          r={p.r ?? 1.9}
          fill="currentColor"
          opacity={p.faint ? 0.45 : 0.92}
        />
      ))}
      <circle cx={c} cy={c} r="1.4" fill="var(--signal, #ff4655)" />
    </svg>
  )
}

/**
 * Target spheres on a sight line: foreground large, background small. This is
 * the in-game range read as a diagram.
 */
export function TargetSpheres({ className = '', label = '靶场目标' }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label={label}>
      <g stroke="currentColor" fill="none">
        <circle cx="50" cy="52" r="21" strokeWidth="1.6" opacity="0.9" />
        <circle cx="50" cy="52" r="13" strokeWidth="1" opacity="0.55" />
        <circle cx="50" cy="52" r="4.5" strokeWidth="1" opacity="0.4" />
        <circle cx="22" cy="40" r="8" strokeWidth="1.1" opacity="0.5" />
        <circle cx="78" cy="62" r="6" strokeWidth="1.1" opacity="0.4" />
        <circle cx="70" cy="27" r="4" strokeWidth="1" opacity="0.32" />
      </g>
      <g stroke="currentColor" strokeWidth="0.8" opacity="0.3" strokeDasharray="2 3">
        <line x1="50" y1="18" x2="50" y2="86" />
        <line x1="16" y1="52" x2="84" y2="52" />
      </g>
      <circle cx="50" cy="52" r="2.4" fill="var(--signal, #ff4655)" />
    </svg>
  )
}

/**
 * Decorative constellation: nodes joined by straight segments, used as a
 * low-contrast plate texture. Node positions are fixed, not random, so the page
 * is stable between renders.
 */
const CONSTELLATION = {
  nodes: [
    [12, 28], [26, 16], [41, 24], [38, 42], [22, 46], [54, 36],
    [68, 22], [82, 34], [76, 52], [60, 58], [46, 66], [30, 72],
    [16, 62], [88, 64], [70, 78], [50, 84],
  ],
  edges: [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [2, 5], [5, 6], [6, 7],
    [7, 8], [8, 5], [8, 9], [9, 10], [10, 11], [11, 12], [12, 4],
    [7, 13], [13, 14], [14, 15], [15, 10], [9, 14],
  ],
}

export function ConstellationPlate({ className = '', opacity = 0.5 }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" preserveAspectRatio="none" opacity={opacity}>
      <g stroke="currentColor" strokeWidth="0.35" fill="none">
        {CONSTELLATION.edges.map(([a, b], i) => {
          const [ax, ay] = CONSTELLATION.nodes[a]
          const [bx, by] = CONSTELLATION.nodes[b]
          return <line key={i} x1={ax} y1={ay} x2={bx} y2={by} />
        })}
      </g>
      {CONSTELLATION.nodes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 4 === 0 ? 0.9 : 0.55} fill="currentColor" />
      ))}
    </svg>
  )
}

/** The wordmark's dial: an astrolabe reduced to a bezel, a pointer and a hub. */
export function DialMark({ className = '' }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" fill="none">
      <circle className="bezel" cx="10" cy="10" r="8.4" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="10" cy="10" r="5.4" stroke="currentColor" strokeWidth="0.5" opacity="0.45" />
      <line className="pointer" x1="10" y1="10" x2="5.1" y2="5.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle className="hub" cx="10" cy="10" r="1.5" fill="currentColor" />
    </svg>
  )
}
