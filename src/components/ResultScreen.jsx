import { useState } from 'react'
import { SIGMA_KILLS } from '../lib/rangeCalibration.js'
import { nearestPros, edpiLandmarks, ROSTER_SOURCE } from '../lib/pros.js'
import { KillBar, Reading, SectionMark } from './instrument.jsx'

const END_NOTE = {
  resolved: '这几个数值表现几乎一样，挑手感最顺手的那个就行。',
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
        <p className="pros-caption">中间一段是职业选手的 80%（p10–p90），你的位置标红。</p>
      </div>

      {near.length > 0 ? (
        <ul className="pros-list">
          {near.map((pro) => (
            <li key={`${pro.name}-${pro.dpi}-${pro.sens}`}>
              <span className="pros-name">
                <strong>{pro.name}</strong>
                <span className="pros-team">{cleanTeam(pro.team)}</span>
              </span>
              <span className="pros-setting num">
                {pro.dpi} × {pro.sens.toFixed(3)}
              </span>
              <span className="pros-edpi num">{Math.round(pro.edpi)}<small> eDPI</small></span>
              <span className="pros-delta num">
                {Math.abs(pro.edpi - edpi) < 0.5
                  ? '相同'
                  : `${pro.edpi > edpi ? '+' : '−'}${Math.abs((pro.edpi / edpi - 1) * 100).toFixed(1)}%`}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pros-empty">这个数值附近没有公开设置的职业选手。</p>
      )}

      <p className="pros-foot">
        参考数据来自 <a href={ROSTER_SOURCE.url} target="_blank" rel="noreferrer">{ROSTER_SOURCE.label}</a>
        （{ROSTER_SOURCE.captured} 抓取，{ROSTER_SOURCE.count} 位选手的 DPI × 游戏内灵敏度）。
      </p>
    </section>
  )
}

// Sensitivity is what the player actually types; derive it back from eDPI so the
// two numbers in the sentence can never disagree.
function result_sens(edpi, dpi) {
  return (edpi / dpi).toFixed(3)
}

// Roster team strings carry state suffixes that do not help here.
function cleanTeam(team) {
  if (!team) return '—'
  return team.replace(/\s*\((Inactive|loan|Streamer|Content creator|coach|head coach|assistant coach|GC|Academy)\)\s*/gi, '').trim() || '—'
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
  // The runner-up, if the data could not separate it from the winner.
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
            {result.tied && result.discriminating && (
              <span className="num">
                {'和 '}
                {runnerUp.map((value) => value.toFixed(3)).join('、')}
                {' 表现几乎一样，挑手感顺手的那个就行。'}
              </span>
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
