import { useEffect, useRef, useState } from 'react'

// Each step draws a different sketch so the four cards read as a sequence
// rather than four copies of one diagram. `path` is drawn left-to-right with
// a stroke animation; every other mark fades in after it.
const DIAGRAMS = {
  // The opening sweep: tries a few values on either side of where you start.
  screen: {
    label: '在现在的上下各试几个',
    marks: [
      { kind: 'dot', x: 20, y: 30, r: 5, base: false },
      { kind: 'dot', x: 60, y: 30, r: 5, base: false },
      { kind: 'dot', x: 100, y: 30, r: 8, base: true },
      { kind: 'dot', x: 140, y: 30, r: 5, base: false },
      { kind: 'dot', x: 180, y: 30, r: 5, base: false },
      { kind: 'text', x: 40, y: 56, text: '往下试', base: false },
      { kind: 'text', x: 100, y: 56, text: '当前', base: true },
      { kind: 'text', x: 160, y: 56, text: '往上试', base: false },
    ],
  },
  // Every round feeds the same picture of which value suits you best.
  confirm: {
    label: '每一轮都会算进去',
    marks: [
      { kind: 'dot', x: 30, y: 46, r: 4, base: false },
      { kind: 'dot', x: 70, y: 30, r: 4, base: false },
      { kind: 'dot', x: 130, y: 28, r: 4, base: false },
      { kind: 'dot', x: 170, y: 46, r: 4, base: false },
      { kind: 'dot', x: 100, y: 20, r: 7, base: true },
      { kind: 'text', x: 100, y: 62, text: '下一轮挑最值得试的', base: true },
    ],
  },
  // The same value measured again becomes more trustworthy.
  narrow: {
    label: '重复测几次更可靠',
    rows: [
      { x: 34, y: 14, w: 132, h: 10, label: '1 轮', labelY: 38 },
      { x: 50, y: 46, w: 100, h: 10, label: '2 轮', labelY: 70 },
      { x: 66, y: 78, w: 68, h: 10, label: '3 轮', labelY: 102 },
    ],
  },
  // Two values whose results still sit on top of each other: undecided.
  pick: {
    label: '成绩拉开了才有结论',
    marks: [
      { kind: 'dot', x: 40, y: 30, r: 5, base: false },
      { kind: 'dot', x: 160, y: 30, r: 5, base: true },
      { kind: 'gate', x: 100, text: '差不多' },
      { kind: 'text', x: 40, y: 58, text: '第二好', base: false },
      { kind: 'text', x: 160, y: 58, text: '最好', base: true },
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
    title: '先在现在的位置两边都试试',
    body: `从你现在的灵敏度出发，往上往下各试几个数值，看看两边手感差多少。`,
    detail: '只试一边看不出哪边更好，所以两边都要试一遍。',
  },
  {
    key: 'confirm',
    title: '每一轮都会算进去',
    body: '测过的数值和成绩会放在一起比较，下一轮就挑最值得试的那个。',
    detail: '所以每次给的数值都不一样，都是根据你前面打出来的成绩挑的。',
  },
  {
    key: 'narrow',
    title: '靠近的好成绩会再测一次',
    body: '一次打得好可能只是手感好，所以好成绩会回头确认，避免被偶然发挥骗到。',
    detail: '同一个数值多打几轮，结论就越来越可靠。',
  },
  {
    key: 'pick',
    title: '确定拉开差距就结束',
    body: '最好的那个明显比其它都好，测试就结束。',
    detail: '如果几个数值表现几乎一样，会直接告诉你挑顺手的即可，不会硬选一个。',
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
