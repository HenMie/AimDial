import { useCallback, useEffect, useState } from 'react'
import { SIGMA_KILLS } from '../lib/rangeCalibration.js'
import { nearestPros, edpiLandmarks, ROSTER_SOURCE } from '../lib/pros.js'
import { describeCrosshair } from '../lib/crosshair.js'
import { KillBar, Reading, SectionMark } from './instrument.jsx'

const END_NOTE = {
  resolved: '已经分不出高低的那几个数值，挑手感最顺手的那个就行。',
  confirmed: '最好的那个已经明显比其它都好，不必再测了。',
  noise: '再测下去也分不出差别了，就用现在这个。',
  ceiling: '几乎每轮都接近满分，这个难度已经分不出高低了。建议换更难的靶场重测。',
  floor: '几乎每轮都只有 0–1 杀，测试条件可能有问题，请检查后再测。',
  manual: '你提前结束了，结果取目前表现最好的那个。',
  edge: '已经调到正常人不会用的极端数值，就此停下。',
  resolution: '游戏灵敏度最小只能改到 0.001，再细也分不出来了。',
}

/**
 * Where this result sits among published pro setups.
 *
 * This is a reference, not a recommendation: the roster is a fact about other
 * people's mice, and copying a value that belongs to someone with a different
 * pad, grip and role would undo the point of measuring. So the section names the
 * nearest players and says plainly that the measured number wins any
 * disagreement. No percentile: the band already shows where the value sits, and a
 * rank adds a second, weaker way of saying the same thing.
 *
 * The band under the row is the roster's own p10–p90, with the player marked on
 * the same log scale the search uses — the same reason the ranking is in log
 * space, since sensitivity is multiplicative.
 */
function ProReference({ edpi, dpi }) {
  const near = nearestPros(edpi, { limit: 6 })
  const marks = edpiLandmarks()
  const closest = near[0] ?? null
  if (!Number.isFinite(edpi) || edpi <= 0) return null

  // Position on the band, clamped so an outlier still renders inside the rule.
  const lo = Math.log(marks.p10)
  const hi = Math.log(marks.p90)
  const place = (value) => {
    const clamped = Math.min(hi, Math.max(lo, Math.log(value)))
    return ((clamped - lo) / (hi - lo)) * 100
  }

  // Said as a position on the band, not as a rank: the reader can see the mark.
  const reads = edpi >= marks.p75
    ? '在职业选手里偏高'
    : edpi >= marks.p25
      ? '落在职业选手最常见的区间里'
      : '在职业选手里偏低'

  return (
    <section className="pros" aria-labelledby="pros-title">
      <SectionMark title="和职业选手比" note={ROSTER_SOURCE.count + ' 位公开设置'} id="pros-title" />

      <p className="pros-lede">
        你这次的 <span className="num">{Math.round(edpi)}</span> eDPI（<span className="num">{dpi}</span> DPI ×{' '}
        <span className="num">{result_sens(edpi, dpi)}</span>）{reads}
        {closest && (
          <>
            ，和 <strong>{closest.name}</strong>（{Math.round(closest.edpi)} eDPI）几乎一样
          </>
        )}
        。
      </p>

      <div className="pros-band" role="img" aria-label={`职业选手的 eDPI 大多在 ${marks.p10} 到 ${marks.p90} 之间，你在 ${Math.round(edpi)}`}>
        <div className="pros-track">
          <span className="pros-fill" style={{ left: 0, width: '100%' }} />
          <span className="pros-you" style={{ left: `${place(edpi)}%` }} data-outside={place(edpi) <= 0 || place(edpi) >= 100} />
        </div>
        <div className="pros-scale">
          <span style={{ left: `${place(marks.p10)}%` }}>{marks.p10}</span>
          <span style={{ left: `${place(marks.median)}%` }} className="is-mid">中位 {marks.median}</span>
          <span style={{ left: `${place(marks.p90)}%` }} className="is-end">{marks.p90}</span>
        </div>
      </div>

      {near.length > 0 ? (
        <table className="pros-table">
          <colgroup>
            <col className="pros-col-who" />
            <col className="pros-col-setting" />
            <col className="pros-col-edpi" />
            <col className="pros-col-delta" />
            <col className="pros-col-crosshair" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">选手</th>
              <th scope="col">DPI × 灵敏度</th>
              <th scope="col">eDPI</th>
              <th scope="col">与你相差</th>
              <th scope="col">准星</th>
            </tr>
          </thead>
          <tbody>
            {near.map((pro) => (
              <ProRow key={`${pro.name}-${pro.dpi}-${pro.sens}`} pro={pro} edpi={edpi} />
            ))}
          </tbody>
        </table>
      ) : (
        <p className="pros-empty">这个数值附近没有公开设置的职业选手。</p>
      )}

      <p className="pros-foot">
        参考数据来自 <a href={ROSTER_SOURCE.url} target="_blank" rel="noreferrer">{ROSTER_SOURCE.label}</a>
        （{ROSTER_SOURCE.captured} 抓取，{ROSTER_SOURCE.count} 位选手的 DPI × 游戏内灵敏度，
        其中 {ROSTER_SOURCE.withCrosshair} 位公开了准星代码）。准星按代码实时解码绘制，不是图片。
      </p>
    </section>
  )
}

// Sensitivity is what the player actually types; derive it back from eDPI so the
// two numbers in the sentence can never disagree.
function result_sens(edpi, dpi) {
  return (edpi / dpi).toFixed(3)
}

/**
 * One player's row.
 *
 * Every cell starts at the same left edge as its column head: a reference table
 * is read down a column, so a right-aligned eDPI would put a 3-digit and a
 * 4-digit value on different edges and break the comparison the table exists
 * for. The crosshair cell carries the preview and the copy action together —
 * what you see and the string you paste are the same thing, one step apart.
 */
function ProRow({ pro, edpi }) {
  const { copied, failed, copy } = useCopy(pro.crosshair)
  const shape = pro.crosshairShape
  const delta = Math.abs(pro.edpi - edpi) < 0.5
    ? '相同'
    : `${pro.edpi > edpi ? '+' : '−'}${Math.abs((pro.edpi / edpi - 1) * 100).toFixed(1)}%`
  return (
    <tr>
      <th scope="row" className="pros-who">
        <span className="pros-name">
          <strong>{pro.name}</strong>
          <span className="pros-team">{cleanTeam(pro.team)}</span>
        </span>
        {pro.country && <span className="pros-country num">{pro.country}</span>}
      </th>
      <td className="pros-setting num">
        {pro.dpi} × {pro.sens.toFixed(3)}
      </td>
      <td className="pros-edpi num" data-label="eDPI">{Math.round(pro.edpi)}</td>
      <td className="pros-delta num">{delta}</td>
      <td className="pros-crosshair-cell">
        {pro.crosshairCode ? (
          <div className="pros-crosshair-actions">
            <CrosshairMark code={pro.crosshairCode} size={24} />
            <button
              type="button"
              className="pros-copy"
              onClick={copy}
              data-state={failed ? 'error' : copied ? 'copied' : 'idle'}
              aria-label={copied
                ? `${pro.name} 的准星代码已复制`
                : `复制 ${pro.name} 的准星代码`}
            >
              {failed
                ? '复制失败'
                : copied
                  ? <><CheckIcon />已复制</>
                  : <><CopyIcon />复制代码</>}
            </button>
          </div>
        ) : (
          <span className="pros-no-code">无公开代码</span>
        )}
      </td>
    </tr>
  )
}

// Two 12px marks for the copy button: the action, and its own result. Drawn
// rather than emoji, so a phone with no emoji font still shows them.
function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="5.5" y="5.5" width="8" height="8" />
      <path d="M10.5 3.5v-1h-8v8h1" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 8.5 6.2 12 13 4" />
    </svg>
  )
}

// Roster team strings carry state suffixes that do not help here.
function cleanTeam(team) {
  if (!team) return '—'
  return team.replace(/\s*\((Inactive|loan|Streamer|Content creator|coach|head coach|assistant coach|GC|Academy)\)\s*/gi, '').trim() || '—'
}

/**
 * Copy a value and report what happened.
 *
 * The clipboard API is unavailable outside a secure context and can be refused
 * outright (Safari, a denied permission), so a failure is a state the button has
 * to show — silently doing nothing leaves the player pasting the previous value.
 * The confirmation resets, because six rows each holding "已复制" forever would
 * stop saying anything.
 */
function useCopy(value) {
  const [state, setState] = useState('idle')
  useEffect(() => {
    if (state === 'idle') return undefined
    const timer = setTimeout(() => setState('idle'), 1800)
    return () => clearTimeout(timer)
  }, [state])
  const copy = useCallback(async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(value)
      setState('copied')
    } catch {
      setState('failed')
    }
  }, [value])
  return { copied: state === 'copied', failed: state === 'failed', copy }
}

/**
 * A player's crosshair, drawn from their code.
 *
 * The code is the source: this is the geometry the decoder reads out of it, not
 * an impression of the shape. Arm length, gap and thickness come from the
 * profile's own numbers, scaled by one factor that depends only on the box, so
 * two crosshairs drawn at the same size keep their real proportions relative to
 * each other.
 */
function CrosshairMark({ code, size = 22 }) {
  const primary = code?.primary
  if (!primary) return null
  const { inner, outer, centreDot, colourHex, colourName, outline } = primary
  const colour = colourHex
  const mid = size / 2
  // The game's units are loosely 1px at 1080p. At 22px that scale would be
  // invisible, so lengths are drawn from a shared scale with a floor: the cell is
  // a glyph, not a measurement, and it has to be legible at arm's length.
  const scale = size / 26
  const armLength = (units) => Math.max(4.2, Math.min(9.5, units)) * scale
  const armGap = (units) => Math.max(0.6, Math.min(6, units)) * 0.75 * scale + 0.8
  const arms = []
  if (inner.on) {
    arms.push({ length: armLength(inner.length), gap: armGap(inner.offset), width: (inner.thickness <= 1 ? 1.5 : 2.4) * scale })
  }
  if (outer.on) {
    arms.push({ length: armLength(outer.length), gap: armGap(outer.offset) + 1, width: (outer.thickness <= 1 ? 1.2 : 1.8) * scale })
  }
  const segments = []
  for (const group of arms) {
    segments.push(
      [mid - group.gap, mid, mid - group.gap - group.length, mid, group.width],
      [mid + group.gap, mid, mid + group.gap + group.length, mid, group.width],
      [mid, mid - group.gap, mid, mid - group.gap - group.length, group.width],
      [mid, mid + group.gap, mid, mid + group.gap + group.length, group.width],
    )
  }
  const dotRadius = centreDot.on ? Math.max(1.2, Math.min(3, centreDot.size)) * 0.55 * scale : 0
  return (
    <svg
      className="pros-crosshair"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`准星：${colourName}，${describeCrosshair(code).shape}`}
    >
      {/* An outline is a dark halo behind each arm — literally its job in game:
          keep the crosshair off a wall it would otherwise vanish into. */}
      {outline.on && segments.map(([x1, y1, x2, y2, width], index) => (
        <line
          key={`o${index}`}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="#05070b"
          strokeWidth={width + 1.8 * scale}
          strokeLinecap="butt"
        />
      ))}
      {segments.map(([x1, y1, x2, y2, width], index) => (
        <line
          key={`a${index}`}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={colour}
          strokeWidth={width}
          strokeLinecap="butt"
        />
      ))}
      {centreDot.on && <circle cx={mid} cy={mid} r={dotRadius} fill={colour} />}
    </svg>
  )
}

export default function ResultScreen({ result, onRestart }) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(null)
  if (!result) return null

  const decisions = result.decisions ?? []
  const history = result.history ?? []
  const runs = result.runs ?? []
  // A discovery run has no starting value at all: `initialSensitivity` is null on
  // purpose, so `??` would fall back to the synthetic centre and claim a delta
  // the player never gave us. Distinguish "absent" from "not recorded".
  const discovery = result.testMode === 'discover'
  const initial = discovery ? null : (result.initialSensitivity ?? result.setup?.sens ?? null)
  const difference = initial ? (result.sensitivity / initial - 1) * 100 : null
  // "Moved" is now a claim about the measurement: the recommendation differs
  // from the starting value by more than the test can dismiss as noise.
  const moved = difference != null && Math.abs(difference) > 1
  // The settings the data could not separate from the winner, winner excluded.
  // A list of seven numbers is not a way to choose, so the search reports a
  // shortlist or none at all — when it reports none, the copy below says the
  // field is still open instead of pretending the question was settled.
  const runnerUp = (result.leaders ?? []).filter((value) => value !== result.sensitivity)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.sensitivity.toFixed(3))
      setCopied(true)
      setCopyError(null)
    } catch (error) {
      setCopyError(`复制失败：${error.message}`)
    }
  }

  return (
    <div>
      <div className="run-top" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '10px 20px', marginBottom: 24 }}>
        <button type="button" className="back" onClick={onRestart}>
          <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M9.5 3.5 5 8l4.5 4.5" strokeLinecap="square" />
          </svg>
          返回首页
        </button>
        <span className="run-badge">
          {result.at ? new Date(result.at).toLocaleDateString('zh-CN') : '测试结果'}
          <span className="phase" data-phase={moved ? 'confirm' : 'screen'}>
            {moved ? '建议更新' : '保留原值'}
          </span>
        </span>
        <span className="mark-note" style={{ marginLeft: 'auto' }}>
          {result.rounds} 轮 · {result.dpi} DPI
        </span>      </div>

      <div className="result-hero">
        <div>
          <div className="verdict-value" data-tone={moved ? 'confirm' : 'ink'}>
            <span>
              {discovery
                ? (moved ? '这个灵敏度最适合你' : '建议先从常见范围里挑一个再细调')
                : (moved ? '建议改成这个灵敏度' : '建议保留当前灵敏度')}
            </span>
            <strong className="num">{result.sensitivity.toFixed(3)}</strong>
            <p>
              {initial != null ? (
                <>
                  原来 <span className="num">{initial.toFixed(3)}</span>
                  {difference != null && (
                    <>
                      ，{difference > 0 ? '调高' : difference < 0 ? '调低' : '不变'}{' '}
                      <span className="num">{Math.abs(difference).toFixed(1)}%</span>
                    </>
                  )}
                </>
              ) : discovery ? (
                `在 ${result.dpi} DPI 下从常见范围试出来的`
              ) : (
                `在 ${result.dpi} DPI 下`
              )}
            </p>
          </div>

          <div className="verdict-actions">
            <button type="button" className="primary" onClick={copy} style={{ minWidth: 200 }}>
              {copied ? '已复制到剪贴板' : '复制这个数值'}
            </button>
            <button type="button" className="quiet" onClick={onRestart}>
              重新测一次
            </button>
          </div>
          {copyError && (
            <p className="notice" data-tone="error" role="alert" style={{ marginTop: 12 }}>
              {copyError}
            </p>
          )}

          <p className="receipt" style={{ marginTop: 22, fontSize: '0.875rem' }}>
            <span>{result.message ?? END_NOTE[result.outcomeReason ?? result.reason] ?? '以下为此前保存的数据。'}</span>
            {result.tied && runnerUp.length > 0 && result.discriminating && (
              <span>
                {'和 '}
                <span className="num">{runnerUp.map((value) => value.toFixed(3)).join('、')}</span>
                {' 分不出高低，挑手感顺手的那个就行。'}
              </span>
            )}
            {!result.tied && result.contested && result.discriminating && (
              <span>还有几个数值和它咬得很紧，只是多测一两轮就能分开；想更确定可以再测一次。</span>
            )}
            {result.warning && <span>{result.warning}</span>}
          </p>
        </div>

        <div className="readings">
          <Reading
            label="平均每轮击杀"
            value={result.score == null ? '—' : result.score.toFixed(1)}
            unit="/ 30"
            note="推荐数值在每一轮的平均成绩"
            tone={moved ? 'confirm' : 'ink'}
          />
          <Reading
            label="手感波动"
            value={`±${SIGMA_KILLS.toFixed(1)}`}
            unit="杀"
            note="每轮成绩天然会有这么大起伏，比这更小的差距不算数"
          />
          <Reading label="记录轮次" value={String(result.rounds)} unit="轮" note="每轮 = 一次中等难度 30 bot 靶场" />
        </div>
      </div>

      <ProReference edpi={result.edpi} dpi={result.dpi} />

      <section style={{ marginTop: 'clamp(36px, 6vw, 60px)' }} aria-labelledby="bracket-title">
        <SectionMark title="测过的数值" note={`${history.length} 个`} id="bracket-title" />
        <table className="brackets">
          <thead>
            <tr>
              <th scope="col">灵敏度</th>
              <th scope="col">各轮击杀</th>
              <th scope="col">平均</th>
            </tr>
          </thead>
          <tbody>
            {history.map((entry) => {
              const sensitivity = entry.sensitivity ?? entry.edpi / result.dpi
              const kills = entry.kills ?? []
              const selected = sensitivity === result.sensitivity
              return (
                <tr key={entry.edpi ?? entry.sensitivity} data-selected={selected}>
                  <td>
                    <span className="bv num">{sensitivity.toFixed(3)}</span>
                    {selected && <span className="tag">采用</span>}
                    {!selected && (entry.rounds ?? kills.length) > 1 && (
                      <span className="tag" data-tone="muted">测过 {entry.rounds ?? kills.length} 轮</span>
                    )}
                  </td>
                  <td>
                    <KillBar value={entry.score} tone={selected ? 'confirm' : 'ink'} />
                    <span className="note">
                      {kills.length
                        ? `${kills.join(' · ')}（最高 ${Math.max(...kills)}，最低 ${Math.min(...kills)}）`
                        : '—'}
                    </span>
                  </td>
                  <td>
                    <span className="score">
                      {entry.score.toFixed(1)}
                      <small> / 30</small>
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      {decisions.length > 0 && (
        <section style={{ marginTop: 'clamp(28px, 5vw, 44px)' }} aria-labelledby="decision-title">
          <SectionMark title="测试过程" note={`${decisions.length} 轮`} id="decision-title" />
          <details className="fold">
            <summary>
              每一轮的成绩
              <span className="meta">{decisions.length} 轮</span>
            </summary>
            <div className="fold-body">
              <ol className="decisions">
                {decisions.map((decision, index) => (
                  <li key={index}>
                    <h3>
                      <span className="num">{index + 1}.</span>
                      <span className="num">{decision.sensitivity?.toFixed(3)}</span>
                      {' → '}
                      <span className="num">{decision.kills}</span>
                      {' 杀'}
                      {decision.leaderChanged && <span className="tag">目前最好</span>}
                    </h3>
                    <p>
                      {decision.leader != null && (
                        <>
                          {'目前最好：'}
                          <span className="num">{decision.leader.toFixed(3)}</span>
                          {decision.rounds > 1 && `（测了 ${decision.rounds} 轮，平均 ${decision.score.toFixed(1)} 杀）`}
                        </>
                      )}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </details>
        </section>
      )}

      {runs.length > 0 && (
        <section style={{ marginTop: 'clamp(20px, 3vw, 28px)' }} aria-labelledby="runs-title">
          <SectionMark title="逐轮成绩" note={`${runs.length} 轮`} id="runs-title" />
          <div className="ledger">
            <ol>
              {runs.map((run, index) => (
                <li key={index}>
                  <span className="n num">{index + 1}</span>
                  <span className="s num">{run.sensitivity.toFixed(3)}</span>
                  <KillBar value={run.kills} tone={run.sensitivity === result.sensitivity ? 'confirm' : 'ink'} />
                  <span className="k num">{run.kills}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}
    </div>
  )
}
