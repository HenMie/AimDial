import { STEP_DELTAS, CONFIRM_ROUNDS } from '../lib/rangeCalibration.js'
// Four sketches, one vocabulary: ink rail, red measure, teal confirmation. They
// are drawn rather than illustrated, so each one has to state its own idea with
// positions and ticks alone.
//
// The step is quoted in cm/360 rather than as a ratio: the ratio changes with the
// player's eDPI (that is the whole point of the ladder), so a fixed "×1.25" here
// would state something the search does not do. At 0.07 deg/count one eDPI of step
// is 130.66/eDPI cm, so the anchor value below converts the deltas at the band centre.
// The step is quoted in cm/360 rather than as a ratio: the ratio changes with the
// player's eDPI (that is the whole point of the ladder), so a fixed "×1.25" here
// would state something the search does not do. cm/360 = 13062.86 / eDPI for the
// 0.07 deg/count yaw constant, so a delta of d eDPI at the band centre is:
const H = 96
const BAND_CENTRE_EDPI = 250
const CM_PER_360_PER_EDPI = 13062.86
const cmPer360 = (edpi) => CM_PER_360_PER_EDPI / edpi
const cmPerStep = (delta) => cmPer360(BAND_CENTRE_EDPI) - cmPer360(BAND_CENTRE_EDPI + delta)

function Rail({ y = 52, x1 = 8, x2 = 352, strong = false }) {
  return <line className={strong ? 'fig-rail-strong' : 'fig-rail'} x1={x1} x2={x2} y1={y} y2={y} />
}

function Ticks({ y = 52, stops = [8, 94, 180, 266, 352] }) {
  return stops.map((x) => (
    <line key={x} className="fig-tick" x1={x} x2={x} y1={y - 4} y2={y + 4} />
  ))
}

/** Step 1 — three candidates around the current value, on one scale. */
function ScreenFigure() {
  return (
    <svg viewBox={`0 0 360 ${H}`} role="img" aria-label="当前档位加上下各一档，三个候选在同一刻度上">
      <Rail />
      <Ticks />
      <circle className="fig-dot" cx="94" cy="52" r="4.5" />
      <circle className="fig-dot is-ink" cx="180" cy="52" r="6.5" />
      <circle className="fig-dot" cx="266" cy="52" r="4.5" />
      <line className="fig-rail-strong" x1="180" x2="180" y1="30" y2="74" />
      <text className="fig-label is-signal" x="180" y="24" textAnchor="middle">当前</text>
      <text className="fig-label" x="94" y="86" textAnchor="middle">低一档</text>
      <text className="fig-label" x="180" y="86" textAnchor="middle" />
      <text className="fig-label" x="266" y="86" textAnchor="middle">高一档</text>
      <path className="fig-bracket" d="M94 34 h-7 v36 h7" />
      <path className="fig-bracket" d="M266 34 h7 v36 h-7" />
    </svg>
  )
}

/** Step 2 — the interleaved repeat: pairs alternating new and old. */
function ConfirmFigure() {
  // Each pair is one new + one old round; the opening setting flips per pair,
  // which is what the ABBA / BAAB pattern is for. The sketch shows three pairs
  // because that is the block length the search actually uses.
  const cells = [
    { x: 16, label: '新', tone: 'is-signal' },
    { x: 68, label: '旧', tone: '' },
    { x: 120, label: '旧', tone: '' },
    { x: 172, label: '新', tone: 'is-signal' },
    { x: 224, label: '新', tone: 'is-signal' },
    { x: 276, label: '旧', tone: '' },
  ]
  const pairs = [[16, 68], [120, 172], [224, 276]]
  return (
    <svg
      viewBox={`0 0 360 ${H}`}
      role="img"
      aria-label={`按新、旧、旧、新、新、旧交错打 ${CONFIRM_ROUNDS} 轮，每一对里新旧各一轮`}
    >
      <Rail y="44" x1="16" x2="276" />
      {cells.map((cell) => (
        <g key={cell.x}>
          <rect
            className="fig-box"
            x={cell.x - 20}
            y="26"
            width="40"
            height="36"
            rx="2"
            fill={cell.tone ? 'var(--confirm-wash)' : 'var(--paper-top)'}
            stroke={cell.tone ? 'var(--confirm)' : 'var(--ink-3)'}
          />
          <text className={cell.tone ? 'fig-label is-signal' : 'fig-label'} x={cell.x} y="49" textAnchor="middle">
            {cell.label}
          </text>
        </g>
      ))}
      {pairs.map(([from, to]) => (
        <path key={from} className="fig-bracket" d={`M${from - 20} 74 v6 h${to - from + 40} v-6`} />
      ))}
      <text className="fig-label is-muted" x="180" y="94" textAnchor="middle">
        每一对各自算一次胜负
      </text>
    </svg>
  )
}

/** Step 3 — the hand step shrinking around the same value. */
function NarrowFigure() {
  const rows = [
    { y: 16, w: 260, delta: STEP_DELTAS[0], tone: 'is-muted' },
    { y: 40, w: 178, delta: STEP_DELTAS[1], tone: 'is-muted' },
    { y: 64, w: 110, delta: STEP_DELTAS[2], tone: 'is-signal' },
  ]
  const labels = rows.map((row) => `${cmPerStep(row.delta).toFixed(1)} cm`)
  return (
    <svg
      viewBox={`0 0 360 ${H}`}
      role="img"
      aria-label={`每档的 360° 手移动量从 ${labels[0]} 收到 ${labels.at(-1)}`}
    >
      {rows.map((row) => {
        const x = 352 - row.w
        return (
          <g key={row.delta}>
            <rect className={`fig-bar ${row.tone}`} x={x} y={row.y} width={row.w} height="10" rx="1.5" />
            <text className="fig-label" x={x - 10} y={row.y + 9} textAnchor="end">
              {cmPerStep(row.delta).toFixed(1)} cm
            </text>
          </g>
        )
      })}
      <text className="fig-label is-muted" x="352" y="92" textAnchor="end">
        都是围绕同一个基准
      </text>
    </svg>
  )
}

/** Step 4 — the gate a new setting has to clear before it replaces the incumbent. */
function GateFigure() {
  return (
    <svg viewBox={`0 0 360 ${H}`} role="img" aria-label="新档要跨过至少 1 杀的门槛才会替换基准">
      <Rail />
      <Ticks stops={[8, 180, 352]} />
      <circle className="fig-dot is-ink" cx="80" cy="52" r="6" />
      <circle className="fig-dot" cx="272" cy="52" r="6" />
      <line className="fig-bracket" x1="176" x2="176" y1="16" y2="88" strokeDasharray="3 3" />
      <text className="fig-label is-signal" x="182" y="24">
        门槛 +1 杀
      </text>
      <text className="fig-label" x="80" y="76" textAnchor="middle">原档</text>
      <text className="fig-label" x="272" y="76" textAnchor="middle">新档</text>
      <path className="fig-bracket" d="M186 52 h76" markerEnd="" strokeDasharray="2 3" />
    </svg>
  )
}

const STEPS = [
  {
    title: '先测当前档和左右各一档',
    body: '从现在的灵敏度上下各挪一格，三档各打一轮，比较平均击杀。每一步对应的手部移动量是固定的，所以灵敏度越高，这一步的比例就越小。',
    figure: <ScreenFigure />,
  },
  {
    title: '领先的档位要交错复查',
    body: `单轮高分可能只是手感好，所以领先档和原档交错再打 ${CONFIRM_ROUNDS} 轮，看是不是每一对对比都赢。`,
    figure: <ConfirmFigure />,
  },
  {
    title: '没找到提升就收小台阶',
    body: '一圈下来没有更稳的档位，就把每一步的手部移动量收窄一半，在附近继续细找。',
    figure: <NarrowFigure />,
  },
  {
    title: '只认重复出现的提升',
    body: '新档位要每一对对比都领先、平均多杀 1 个以上，才会替换基准。',
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
      </header>
      <ol className="steps-list">
        {STEPS.map((step) => (
          <li key={step.title}>
            <div className="step-body">
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <figure className="step-figure">{step.figure}</figure>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
