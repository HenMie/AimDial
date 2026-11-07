import { STEP_FACTORS } from '../lib/rangeCalibration.js'
// Four sketches, one vocabulary: ink rail, red measure, teal confirmation. They
// are drawn rather than illustrated, so each one has to state its own idea with
// positions and ticks alone.
const H = 96

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
      <text className="fig-label" x="94" y="86" textAnchor="middle">÷1.25</text>
      <text className="fig-label" x="180" y="86" textAnchor="middle" />
      <text className="fig-label" x="266" y="86" textAnchor="middle">×1.25</text>
      <path className="fig-bracket" d="M94 34 h-7 v36 h7" />
      <path className="fig-bracket" d="M266 34 h7 v36 h-7" />
    </svg>
  )
}

/** Step 2 — the interleaved repeat: four runs alternating new and old. */
function ConfirmFigure() {
  const cells = [
    { x: 24, label: '新', tone: 'is-signal' },
    { x: 110, label: '旧', tone: '' },
    { x: 196, label: '旧', tone: '' },
    { x: 282, label: '新', tone: 'is-signal' },
  ]
  return (
    <svg viewBox={`0 0 360 ${H}`} role="img" aria-label="按新、旧、旧、新交错打四轮">
      <Rail y="44" x1="24" x2="282" />
      {cells.map((cell) => (
        <g key={cell.x}>
          <rect
            className="fig-box"
            x={cell.x - 22}
            y="26"
            width="44"
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
      <path className="fig-bracket" d="M24 74 v6 h86 v-6" />
      <path className="fig-bracket" d="M196 74 v6 h86 v-6" />
      <text className="fig-label is-muted" x="180" y="94" textAnchor="middle">
        两次对比各自算一次胜负
      </text>
    </svg>
  )
}

/** Step 3 — the step factor shrinking around the same value. */
function NarrowFigure() {
  const rows = [
    { y: 16, w: 260, factor: STEP_FACTORS[0], tone: 'is-muted' },
    { y: 40, w: 178, factor: STEP_FACTORS[1], tone: 'is-muted' },
    { y: 64, w: 110, factor: STEP_FACTORS[2], tone: 'is-signal' },
  ]
  return (
    <svg viewBox={`0 0 360 ${H}`} role="img" aria-label={`步长从 ${STEP_FACTORS.join('、')} 依次收紧`}>
      {rows.map((row) => {
        const x = 352 - row.w
        return (
          <g key={row.factor}>
            <rect className={`fig-bar ${row.tone}`} x={x} y={row.y} width={row.w} height="10" rx="1.5" />
            <text className="fig-label" x={x - 10} y={row.y + 9} textAnchor="end">
              ×{row.factor}
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
    body: '从不动的台阶上下各挪一格，三档各打一轮，比较平均击杀。',
    figure: <ScreenFigure />,
  },
  {
    title: '领先的档位要交错复查',
    body: '单轮高分可能只是手感好，所以领先档和原档交替再打四轮，看两次对比是不是都赢。',
    figure: <ConfirmFigure />,
  },
  {
    title: '没找到提升就收小台阶',
    body: '一圈下来没有更稳的档位，就把台阶收窄一档，在附近继续细找。',
    figure: <NarrowFigure />,
  },
  {
    title: '只认重复出现的提升',
    body: '新档位要两次都领先、平均多杀 1 个以上，才会替换基准。',
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
