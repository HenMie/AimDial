import { useEffect, useRef, useState } from 'react'
import { CONFIRM_ROUNDS } from '../lib/rangeCalibration.js'

// Each step draws a different sketch so the four cards read as a sequence
// rather than four copies of one diagram. `path` is drawn left-to-right with
// a stroke animation; every other mark fades in after it.
const DIAGRAMS = {
  // Three candidates around the current value.
  screen: {
    label: '当前档位与上下各一档',
    marks: [
      { kind: 'dot', x: 20, y: 30, r: 5, base: false },
      { kind: 'dot', x: 100, y: 30, r: 8, base: true },
      { kind: 'dot', x: 180, y: 30, r: 5, base: false },
      { kind: 'text', x: 20, y: 56, text: '低一档', base: false },
      { kind: 'text', x: 100, y: 56, text: '当前', base: true },
      { kind: 'text', x: 180, y: 56, text: '高一档', base: false },
    ],
  },
  // New, old, old, new — the ABBA confirmation.
  confirm: {
    label: '交错复测的顺序',
    marks: [
      { kind: 'pill', x: 22, y: 30, text: '新', strong: true },
      { kind: 'pill', x: 66, y: 30, text: '旧', strong: false },
      { kind: 'pill', x: 110, y: 30, text: '旧', strong: false },
      { kind: 'pill', x: 154, y: 30, text: '新', strong: true },
      { kind: 'text', x: 100, y: 58, text: '每一对都是新档与旧档各一轮', base: false },
    ],
  },
  // Stair-step narrowing: each rung halves the hand movement. Each row declares
  // its own bar rectangle and a label baseline that sits in the clear gap above
  // the next row, so the text can never land on the bar below it.
  narrow: {
    label: '步长依次收紧',
    rows: [
      { x: 34, y: 14, w: 132, h: 10, label: '第一档', labelY: 38 },
      { x: 50, y: 46, w: 100, h: 10, label: '一半', labelY: 70 },
      { x: 66, y: 78, w: 68, h: 10, label: '再一半', labelY: 102 },
    ],
  },
  // A single accepted upgrade with a threshold gate. The gate sits on the
  // rail and its caption is offset to the right, clear of the dashed line;
  // the two dots mark the old and new settings either side of it.
  pick: {
    label: '提升要跨过门槛才生效',
    marks: [
      { kind: 'dot', x: 40, y: 30, r: 5, base: false },
      { kind: 'dot', x: 160, y: 30, r: 5, base: true },
      { kind: 'gate', x: 100, text: '+1 杀' },
      { kind: 'text', x: 40, y: 58, text: '原档', base: false },
      { kind: 'text', x: 160, y: 58, text: '新档', base: true },
    ],
  },
}

function Diagram({ name }) {
  const config = DIAGRAMS[name]
  // The staircase sketch stacks three labelled rows; the single-row diagrams
  // share one height.
  const height = name === 'narrow' ? 112 : 66
  return (
    <svg className="explain-diagram" viewBox={`0 0 200 ${height}`} role="img" aria-label={config.label}>
      {name !== 'narrow' && (
        <line className="diagram-rail" x1="12" y1="30" x2="188" y2="30" pathLength="1" />
      )}
      {name === 'narrow' && config.rows.map((row, index) => (
        <g key={row.label} className="diagram-step" style={{ animationDelay: `${160 + index * 90}ms` }}>
          <rect x={row.x} y={row.y} width={row.w} height={row.h} rx={row.h / 2} />
          <text x="100" y={row.labelY} textAnchor="middle">{row.label}</text>
        </g>
      ))}
      {config.marks?.map((mark, index) => {
        const stagger = 160 + index * 90
        if (mark.kind === 'dot') {
          return (
            <circle
              key={index}
              className={mark.base ? 'diagram-dot is-base' : 'diagram-dot'}
              cx={mark.x} cy={mark.y} r={mark.r}
              style={{ animationDelay: `${stagger}ms` }}
            />
          )
        }
        if (mark.kind === 'text') {
          return (
            <text
              key={index}
              className={mark.base ? 'diagram-label is-base' : 'diagram-label'}
              x={mark.x} y={mark.y} textAnchor="middle"
              style={{ animationDelay: `${stagger}ms` }}
            >{mark.text}</text>
          )
        }
        if (mark.kind === 'pill') {
          return (
            <g key={index} className={mark.strong ? 'diagram-pill is-strong' : 'diagram-pill'}
              style={{ animationDelay: `${stagger}ms` }}>
              <rect x={mark.x - 16} y={mark.y - 13} width="32" height="26" rx="13" />
              <text x={mark.x} y={mark.y + 5} textAnchor="middle">{mark.text}</text>
            </g>
          )
        }
        return (
          <g key={index} className="diagram-gate" style={{ animationDelay: `${stagger}ms` }}>
            <line x1={mark.x} y1="14" x2={mark.x} y2="46" />
            {/* Offset right of the dashed line and above the rail so the
                caption never sits on the stroke. */}
            <text x={mark.x + 9} y="24" textAnchor="start">{mark.text}</text>
          </g>
        )
      })}
    </svg>
  )
}

// Play the draw-in once, the first time the section is scrolled into view.
function useRevealOnScroll() {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      setShown(true)
      return
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShown(true)
        observer.disconnect()
      }
    }, { threshold: 0.2 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return [ref, shown]
}

const STEPS = [
  {
    key: 'screen',
    title: '先测当前档和左右各一档',
    body: '从你现在的灵敏度出发，往上、往下各挪一格。三档各打一轮，比较平均击杀。',
    detail: '每一步对应固定的手部移动量，所以灵敏度越高，这一步的比例越小。例如 0.400 上下各一档是 0.388 与 0.413（±3.2%）；0.150 则是 0.125 与 0.180（±20%）。',
  },
  {
    key: 'confirm',
    title: '领先的档位要交错复查',
    body: `单轮高分可能只是手感好。把领先档和原档交错再打 ${CONFIRM_ROUNDS} 轮，每一对都是新档一轮、旧档一轮。`,
    detail: '每一对都换一个先后顺序，抵消热身与疲劳带来的偏移；每一对都要新档赢，才算真的领先。',
  },
  {
    key: 'narrow',
    title: '没找到提升就收小台阶',
    body: '一圈下来没有更稳的档位，就把每一步的手部移动量收窄一半，在附近继续细找。',
    detail: '收紧到游戏里 0.001 的最小单位也分不出来时，测试结束。',
  },
  {
    key: 'pick',
    title: '只认重复出现的提升',
    body: '新档位要在每一对对比中都领先、平均多击杀 1 个以上，才会替换基准；否则保留原档位。',
    detail: '宁可不换，也不换一个只赢过一次的档位。',
  },
]

export default function ExplainSection() {
  const [ref, shown] = useRevealOnScroll()
  const [openKey, setOpenKey] = useState(null)

  return (
    <section className="explain" ref={ref} data-revealed={shown} aria-labelledby="explain-title">
      <h2 id="explain-title">它是怎么找到合适灵敏度的</h2>

      <ol className="explain-steps">
        {STEPS.map((step, index) => {
          const open = openKey === step.key
          return (
            <li key={step.key} className="explain-step" data-open={open}
              style={{ '--reveal-delay': `${index * 110}ms` }}>
              <button
                type="button"
                className="explain-step-head"
                aria-expanded={open}
                aria-controls={`explain-detail-${step.key}`}
                onClick={() => setOpenKey(open ? null : step.key)}
              >
                <span className="explain-index" aria-hidden="true">{index + 1}</span>
                <span className="explain-step-text">
                  <strong>{step.title}</strong>
                  <span>{step.body}</span>
                </span>
                <span className="explain-toggle" aria-hidden="true" />
              </button>
              <div className="explain-visual">
                <Diagram name={step.key} />
              </div>
              <p className="explain-detail" id={`explain-detail-${step.key}`} hidden={!open}>{step.detail}</p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
