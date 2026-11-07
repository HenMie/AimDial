import { LAYOUT_STEPS, SIGMA_KILLS } from '../lib/rangeCalibration.js'

/**
 * Four figures, one instrument. Each states its own idea with its own drawing
 * device; they share only the palette and the type, never the shape. A reader
 * scrolling past should be able to tell them apart by silhouette alone.
 *
 * What they describe is the search that actually runs: a response curve is
 * estimated from every round played, and the next setting is read off that
 * curve. There are no rungs and no plateaus to explain, because the search no
 * longer works that way.
 */
const CM_PER_360_PER_EDPI = 13062.86
const cmPer360 = (edpi) => CM_PER_360_PER_EDPI / edpi

/* ------------------------------------------------------------------ step 01 */

/**
 * Step 1 — the opening sweep, drawn as a **scale with a bracket being filled**.
 *
 * Two rungs each side of the starting value, marked as measured, and the next
 * one open. This is the only figure that shows the axis as a whole; the others
 * act on a curve.
 */
function ScreenFigure() {
  const W = 360
  const x0 = 26
  const x1 = W - 26
  const mid = (x0 + x1) / 2
  const step = 42
  const ticks = Array.from({ length: 37 }, (_, i) => x0 + ((x1 - x0) / 36) * i)
  const marks = [
    { x: mid - step * 2, filled: true },
    { x: mid - step, filled: true },
    { x: mid, filled: true, current: true },
    { x: mid + step, filled: true },
    { x: mid + step * 2, filled: true },
    { x: mid + step * 3, filled: false },
  ]
  return (
    <svg viewBox="0 0 360 112" role="img" aria-label={`从当前灵敏度向上下各试 ${LAYOUT_STEPS[0]} 个数值，先看看两边差多少`}>
      <g>
        {ticks.map((x, i) => (
          <line
            key={x}
            className={i % 6 === 0 ? 'fig-tick is-major' : 'fig-tick'}
            x1={x} x2={x} y1={i % 6 === 0 ? 50 : 55} y2={67}
          />
        ))}
      </g>
      <path className="fig-caliper" d={`M${mid - step * 2} 78 v8 H${mid + step * 2} v-8`} />
      <text className="fig-label is-muted" x={mid} y={102} textAnchor="middle">
        先在上下各试 {LAYOUT_STEPS[0]} 个
      </text>
      {marks.map((mark, index) => (
        <g key={index}>
          <circle
            className={mark.filled ? 'fig-dot is-ink' : 'fig-dot'}
            cx={mark.x} cy="42"
            r={mark.current ? 7 : 4.5}
            fill={mark.filled ? undefined : 'none'}
          />
          {mark.current && <text className="fig-label is-signal" x={mark.x} y={24} textAnchor="middle">当前</text>}
          {!mark.filled && <text className="fig-label is-muted" x={mark.x} y={24} textAnchor="middle">下一轮</text>}
        </g>
      ))}
    </svg>
  )
}

/* ------------------------------------------------------------------ step 02 */

/**
 * Step 2 — the response curve, drawn as an actual fitted shape.
 *
 * This is the heart of the method and the part the previous version got wrong:
 * the search is not comparing candidates one against another, it is estimating
 * where the curve peaks. Drawn as a smooth hump with the measured points on it
 * and one open point where the next round goes.
 */
function CurveFigure() {
  const W = 360
  const H = 132
  const x0 = 30
  const x1 = W - 24
  const base = 108
  const top = 30
  // A true Gaussian in log-eDPI, sampled to a path.
  const peakX = x0 + (x1 - x0) * 0.58
  const width = (x1 - x0) * 0.19
  const yOf = (x) => base - (base - top) * Math.exp(-0.5 * ((x - peakX) / width) ** 2)
  const path = Array.from({ length: 61 }, (_, i) => {
    const x = x0 + ((x1 - x0) / 60) * i
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${yOf(x).toFixed(1)}`
  }).join(' ')
  const measured = [0.2, 0.36, 0.52, 0.74, 0.9].map((f) => x0 + (x1 - x0) * f)
  const nextX = x0 + (x1 - x0) * 0.58
  return (
    <svg viewBox="0 0 360 132" role="img" aria-label="把全部成绩放在一起，下一轮挑最值得试的数值">
      <line className="fig-axis" x1={x0} y1={base} x2={x1} y2={base} />
      <path className="fig-curve" d={path} fill="none" />
      {measured.map((x, i) => (
        <circle key={i} className="fig-dot is-ink" cx={x} cy={yOf(x)} r="3.6" />
      ))}
      {/* The proposal: where the fitted curve peaks, and therefore where the
          next round goes. A stem, not a dot, so it reads as "not yet played". */}
      <line className="fig-stem is-signal" x1={nextX} y1={yOf(nextX)} x2={nextX} y2={base + 14} />
      <circle className="fig-dot is-signal" cx={nextX} cy={yOf(nextX)} r="5.5" fill="none" />
      <text className="fig-label is-signal" x={nextX} y={24} textAnchor="middle">下一轮</text>
      <text className="fig-label is-muted" x={x0} y={126} textAnchor="start">低</text>
      <text className="fig-label is-muted" x={x1} y={126} textAnchor="end">高</text>
      <text className="fig-label is-muted" x={W / 2} y={126} textAnchor="middle">灵敏度</text>
    </svg>
  )
}

/* ------------------------------------------------------------------ step 03 */

/**
 * Step 3 — why a one-kill difference proves nothing, drawn as **rounds
 * accumulating on one setting**.
 *
 * Three columns for one setting played one, two and three times. The bar is the
 * running mean; the whisker is the uncertainty, and it is the thing that
 * shrinks. This is the figure that justifies the whole stopping rule.
 */
function NoiseFigure() {
  const H = 132
  const base = 104
  const top = 26
  const columns = [1, 2, 3].map((rounds, index) => {
    const x = 76 + index * 92
    const se = SIGMA_KILLS / Math.sqrt(rounds)
    const scale = 17 // px per kill
    const mean = 22
    const y = base - (mean / 30) * (base - top)
    return { x, se, scale, y, rounds }
  })
  return (
    <svg viewBox="0 0 360 132" role="img" aria-label="同一个数值打得越多，结论越可靠">
      <line className="fig-axis" x1="30" y1={base} x2="336" y2={base} />
      {columns.map((column) => (
        <g key={column.rounds}>
          {/* Half the confidence interval either side of the mean. */}
          <line className="fig-stem" x1={column.x} y1={column.y - column.se * column.scale} x2={column.x} y2={column.y + column.se * column.scale} />
          <line className="fig-axis" x1={column.x - 10} y1={column.y - column.se * column.scale} x2={column.x + 10} y2={column.y - column.se * column.scale} />
          <line className="fig-axis" x1={column.x - 10} y1={column.y + column.se * column.scale} x2={column.x + 10} y2={column.y + column.se * column.scale} />
          <circle className="fig-dot is-ink" cx={column.x} cy={column.y} r="5" />
          <text className="fig-label is-muted" x={column.x} y={base + 20} textAnchor="middle">
            {column.rounds} 轮
          </text>
        </g>
      ))}
      <text className="fig-label is-muted" x="180" y="18" textAnchor="middle">
        同一个数值测得越多越可靠
      </text>
    </svg>
  )
}

/* ------------------------------------------------------------------ step 04 */

/**
 * Step 4 — the stopping rule, drawn as **two overlapping error bars**.
 *
 * The only thing that decides whether a run is over: can the leader and the
 * runner-up be told apart, given how uncertain each one still is? Two cases
 * side by side — overlapping (keep going or call it a tie) and separated
 * (done) — because the rule is exactly that comparison.
 */
function GateFigure() {
  const scale = 7.4 // px per kill
  const cases = [
    { label: '还分不开', a: 21, b: 23.4, seA: 1.9, seB: 1.9, verdict: '继续测 / 算平手' },
    { label: '分得开', a: 17.5, b: 25.5, seA: 1.1, seB: 1.1, verdict: '结束' },
  ]
  return (
    <svg viewBox="0 0 360 132" role="img" aria-label="两个数值成绩接近就分不出高下，拉开差距才算有结论">
      <line className="fig-axis" x1="16" y1="22" x2="344" y2="22" />
      <text className="fig-label is-muted" x="16" y="14">两组成绩</text>
      <text className="fig-label is-muted" x="344" y="14" textAnchor="end">结论</text>
      {cases.map((row, index) => {
        const y = 54 + index * 52
        const xFor = (kills) => 40 + kills * scale
        const separated = row.b - row.a > 2 * Math.max(row.seA, row.seB)
        return (
          <g key={row.label}>
            <text className="fig-label" x="16" y={y + 4}>{row.label}</text>
            {/* Two whiskers on the same row: overlap is what "not decided" looks like. */}
            <line className="fig-stem" x1={xFor(row.a)} y1={y - 14} x2={xFor(row.a)} y2={y + 14} />
            <line className="fig-axis" x1={xFor(row.a - row.seA)} y1={y} x2={xFor(row.a + row.seA)} y2={y} />
            <circle className="fig-dot is-ink" cx={xFor(row.a)} cy={y} r="3.6" />
            <line className="fig-stem" x1={xFor(row.b)} y1={y - 14} x2={xFor(row.b)} y2={y + 14} />
            <line className="fig-axis" x1={xFor(row.b - row.seB)} y1={y} x2={xFor(row.b + row.seB)} y2={y} />
            <circle className={separated ? 'fig-dot is-signal' : 'fig-dot'} cx={xFor(row.b)} cy={y} r="3.6" />
            <text className={separated ? 'fig-label is-signal' : 'fig-label is-muted'} x="344" y={y + 4} textAnchor="end">
              {separated ? '结束' : '继续'}
            </text>
          </g>
        )
      })}
      <line className="fig-axis" x1="16" y1="112" x2="344" y2="112" />
      <text className="fig-label is-muted" x="16" y="126">成绩挨在一起就分不出，拉开了才有结论</text>
    </svg>
  )
}

/* ------------------------------------------------------------------- content */

const STEPS = [
  {
    title: '先在现在的位置两边都试试',
    body: `从你现在的灵敏度出发，往上往下各试 ${LAYOUT_STEPS[0]} 个数值，看看两边手感差多少。`,
    figure: <ScreenFigure />,
  },
  {
    title: '每一轮都会算进去',
    body: '把测过的所有数值和成绩放在一起，看哪个灵敏度打得最准，下一轮就挑最值得试的地方。',
    figure: <CurveFigure />,
  },
  {
    title: '同一个数值会重复测几次',
    body: '一次打得好可能只是手感好，所以靠近的好成绩会回头再确认，避免被偶然发挥骗到。',
    figure: <NoiseFigure />,
  },
  {
    title: '确定拉开差距就结束',
    body: '最好的那个明显比其它都好，测试才结束；如果最后只剩两三个数值分不出高低，会让你自己挑顺手的那个。',
    figure: <GateFigure />,
  },
]

export default function MethodSection() {
  return (
    <section className="method" aria-labelledby="method-title">
      <header className="mark">
        <span className="mark-line">
          <h2 className="mark-title" id="method-title">它是怎么找到合适灵敏度的</h2>
        </span>
        <span className="mark-note">四步一轮</span>
      </header>
      {/* One list, no per-step plate: the figures carry their own boundaries and
          the row hairlines are the only dividers. Boxing each step made four
          identical cards out of what is really one four-stage loop. */}
      <ol className="steps-list">
        {STEPS.map((step) => (
          <li key={step.title}>
            <div className="step-body">
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
            <div className="step-figure">{step.figure}</div>
          </li>
        ))}
      </ol>
    </section>
  )
}
