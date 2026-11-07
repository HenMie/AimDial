import { STEP_DELTAS, CONFIRM_ROUNDS, LADDER_ANCHOR } from '../lib/rangeCalibration.js'

/**
 * Four figures, one instrument. Each states its own idea with its own drawing
 * device; they share only the palette and the type, never the shape. A reader
 * scrolling past should be able to tell them apart by silhouette alone.
 *
 * The step is quoted in cm/360 rather than as a ratio: the ratio changes with the
 * player's eDPI — that is the whole point of the ladder — so a fixed "×1.25" here
 * would state something the search does not do. cm/360 = 13062.86 / eDPI for the
 * 0.07 deg/count yaw constant.
 */
const CM_PER_360_PER_EDPI = 13062.86
const cmPer360 = (edpi) => CM_PER_360_PER_EDPI / edpi
const cmPerStep = (delta) => cmPer360(LADDER_ANCHOR) - cmPer360(LADDER_ANCHOR + delta)

/* ------------------------------------------------------------------ step 01 */

/**
 * Step 1 — one position on a continuous axis, with its two neighbours.
 *
 * Drawn as a graduated strip seen from above rather than a dot on a rail: the
 * graduations give it the character of a scale, and the red bracket marks the
 * span the first round actually covers. This is the only figure that shows the
 * axis, because the other three happen at a single point on it.
 */
function ScreenFigure() {
  const W = 360
  const x0 = 26
  const x1 = W - 26
  const mid = (x0 + x1) / 2
  const span = 88
  const low = mid - span
  const high = mid + span
  const ticks = Array.from({ length: 37 }, (_, i) => x0 + ((x1 - x0) / 36) * i)
  return (
    <svg viewBox="0 0 360 112" role="img" aria-label="当前灵敏度与上下各一档，标在同一条刻度上">
      {/* The graduated strip: minor ticks, with a heavier mark every sixth. */}
      <g>
        {ticks.map((x, i) => (
          <line
            key={x}
            className={i % 6 === 0 ? 'fig-tick is-major' : 'fig-tick'}
            x1={x} x2={x} y1={i % 6 === 0 ? 50 : 55} y2={67}
          />
        ))}
      </g>
      {/* The span this round covers, measured as a caliper under the scale. */}
      <path className="fig-caliper" d={`M${low} 78 v8 H${high} v-8`} />
      <text className="fig-label is-muted" x={mid} y={102} textAnchor="middle">
        第一轮测这三档
      </text>

      {/* The three settings: the current one heavier, the two candidates open. */}
      <circle className="fig-dot is-ink" cx={mid} cy="42" r="7" />
      <circle className="fig-dot" cx={low} cy="42" r="4.5" />
      <circle className="fig-dot" cx={high} cy="42" r="4.5" />
      <text className="fig-label is-signal" x={mid} y={24} textAnchor="middle">当前</text>
      <line className="fig-leader" x1={mid} y1="49" x2={mid} y2="56" />
      <text className="fig-label is-muted" x={low} y={24} textAnchor="middle">低一档</text>
      <text className="fig-label is-muted" x={high} y={24} textAnchor="middle">高一档</text>
    </svg>
  )
}

/* ------------------------------------------------------------------ step 02 */

/**
 * Step 2 — the interleaved repeat, drawn as a **timeline**, which is what it is.
 *
 * Six rounds left to right, each a tick on a time axis, coloured by which setting
 * it plays. The three brackets underneath are the pairwise comparisons, so the
 * reader sees why six rounds mean three verdicts. This is deliberately a
 * different shape from step 1: a sequence, not a scale.
 */
function ConfirmFigure() {
  // new, old | old, new | new, old — the opening setting flips every pair.
  const sequence = ['new', 'old', 'old', 'new', 'new', 'old']
  const x0 = 34
  const gap = 52
  return (
    <svg
      viewBox="0 0 360 118"
      role="img"
      aria-label={`按新、旧交错打 ${CONFIRM_ROUNDS} 轮，每两轮组成一次对比`}
    >
      <line className="fig-axis" x1={x0 - 12} y1="46" x2={x0 + gap * 5 + 12} y2="46" />
      {sequence.map((kind, i) => {
        const x = x0 + gap * i
        const isNew = kind === 'new'
        return (
          <g key={i}>
            <line className={isNew ? 'fig-stem is-signal' : 'fig-stem'} x1={x} x2={x} y1="46" y2={isNew ? 22 : 30} />
            <circle className={isNew ? 'fig-dot is-signal' : 'fig-dot'} cx={x} cy="46" r={isNew ? 6.5 : 4.5} />
            <text className={isNew ? 'fig-label is-signal' : 'fig-label is-muted'} x={x} y="16" textAnchor="middle">
              {isNew ? '新' : '旧'}
            </text>
            <text className="fig-label is-muted" x={x} y="66" textAnchor="middle">{i + 1}</text>
          </g>
        )
      })}
      {/* Pairwise comparisons: three brackets, each covering two adjacent rounds. */}
      {[0, 2, 4].map((start) => {
        const a = x0 + gap * start
        const b = x0 + gap * (start + 1)
        return <path key={start} className="fig-caliper" d={`M${a - 10} 78 v8 H${b + 10} v-8`} />
      })}
      <text className="fig-label is-muted" x="180" y="106" textAnchor="middle">
        每两轮算一次对比，三对全赢才算数
      </text>
    </svg>
  )
}

/* ------------------------------------------------------------------ step 03 */

/**
 * Step 3 — the hand step narrowing, drawn as a **stacked ladder** where length IS
 * the physical distance. Three rungs of 3.9, 2.0 and 1.0 cm on a shared left
 * edge, so the halving is visible as halving rather than asserted in a caption.
 */
function NarrowFigure() {
  const rungs = [STEP_DELTAS[0], STEP_DELTAS[1], STEP_DELTAS[2], STEP_DELTAS[3]]
  const maxCm = cmPerStep(rungs[0])
  const barMax = 168
  const left = 122
  return (
    <svg viewBox="0 0 360 132" role="img" aria-label="四级的 360° 手移动量逐级减半">
      {rungs.map((delta, i) => {
        const cm = cmPerStep(delta)
        const w = (cm / maxCm) * barMax
        const y = 14 + i * 26
        const last = i === rungs.length - 1
        return (
          <g key={delta}>
            <text className="fig-label" x={left - 12} y={y + 11} textAnchor="end">
              {cm.toFixed(cm < 1 ? 2 : 1)} cm
            </text>
            <rect className={last ? 'fig-rung is-signal' : 'fig-rung'} x={left} y={y} width={w} height="12" />
          </g>
        )
      })}
      {/* The rung labels sit clear of the bars, right-aligned in the column the
          shortest bar cannot reach, so no label ever lands on a bar. */}
      <text className="fig-label is-muted" x="330" y="25" textAnchor="end">粗扫</text>
      <text className="fig-label is-muted" x="330" y="103" textAnchor="end">最细</text>
      <line className="fig-axis" x1={left - 1} y1="8" x2={left - 1} y2="122" />
    </svg>
  )
}

/* ------------------------------------------------------------------ step 04 */

/**
 * Step 4 — the gate, drawn as **two verdicts on the same pair of rounds**.
 *
 * The old figure asserted a threshold with two dots and a caption. This one shows
 * the only thing that matters: two pairwise differences, and the difference
 * between accepting and rejecting. A row of paired marks where each pair either
 * favours the new setting or does not, with the accept rule applied across them.
 */
function GateFigure() {
  const cases = [
    { case: '都赢', verdict: '换', diffs: [3, 2] },
    { case: '输一对', verdict: '不换', diffs: [3, -1] },
  ]
  return (
    <svg viewBox="0 0 360 132" role="img" aria-label="两次对比都领先才接受，任何一对落后就拒绝">
      {/* Column heads sit on the rule, so each column is labelled once instead of
          repeating "第 1 对 / 第 2 对" inside every row. The left column names the
          scenario, so the reader knows which row is which without decoding signs. */}
      <text className="fig-label is-muted" x="16" y="14">情形</text>
      <text className="fig-label is-muted" x="104" y="14">第 1 对</text>
      <text className="fig-label is-muted" x="212" y="14">第 2 对</text>
      <text className="fig-label is-muted" x="344" y="14" textAnchor="end">结果</text>
      <line className="fig-axis" x1="16" y1="22" x2="344" y2="22" />
      {cases.map((row, rowIndex) => {
        const y = 48 + rowIndex * 44
        const accepted = row.diffs.every((d) => d > 0)
        return (
          <g key={row.verdict}>
            <text className="fig-label" x="16" y={y}>{row.case}</text>
            {row.diffs.map((d, i) => (
              <text
                key={i}
                className={d > 0 ? 'fig-label is-signal' : 'fig-label is-muted'}
                x={i === 0 ? 104 : 212}
                y={y}
              >
                {d > 0 ? `+${d}` : d}
              </text>
            ))}
            <text
              className={accepted ? 'fig-label is-signal' : 'fig-label is-muted'}
              x="344" y={y} textAnchor="end"
            >
              {row.verdict}
            </text>
          </g>
        )
      })}
      <line className="fig-axis" x1="16" y1="112" x2="344" y2="112" />
      <text className="fig-label is-muted" x="16" y="126">两对都为正才换，出现负值就保留原档</text>
    </svg>
  )
}

/* ------------------------------------------------------------------- content */

const STEPS = [
  {
    title: '先测当前档和左右各一档',
    body: '从现在的灵敏度上下各挪一格，三档各打一轮，比较平均击杀。每一步对应的手部移动量是固定的，所以灵敏度越高，这一步的比例就越小。',
    figure: <ScreenFigure />,
  },
  {
    title: '领先的档位要交错复查',
    body: `单轮高分可能只是手感好，所以领先档和原档交错再打 ${CONFIRM_ROUNDS} 轮，每两轮算一次对比。`,
    figure: <ConfirmFigure />,
  },
  {
    title: '没找到提升就收小台阶',
    body: '一圈下来没有更稳的档位，就把每一步的手部移动量收窄一半，在附近继续细找四轮。',
    figure: <NarrowFigure />,
  },
  {
    title: '只认重复出现的提升',
    body: '新档位要每一对对比都领先、平均多杀 1 个以上，才会替换基准；任何一对落后就保留原档。',
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
