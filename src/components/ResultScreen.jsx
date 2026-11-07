import { useState } from 'react'
import { BOTS_PER_RUN } from '../lib/rangeCalibration.js'
import { KillBar, Reading, SectionMark } from './instrument.jsx'

const END_NOTE = {
  plateau: '更小的步长没有带来稳定提升，保留当前档位。',
  resolution: '游戏灵敏度最小只能调到 0.001，已无法进一步区分。',
  ceiling: '各档位均接近满分，当前难度区分度不足。建议换用更难的方式重测。',
  floor: '各档位均只有 0–1 杀，测试条件可能有误，请检查后重测。',
  manual: '你已提前结束，结果取当前基准档位。',
}

export default function ResultScreen({ result, onRestart }) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(null)
  if (!result) return null

  const decisions = result.decisions ?? []
  const history = result.history ?? []
  const runs = result.runs ?? []
  const confirmed = decisions.filter((decision) => decision.phase === 'confirm' && decision.accepted)
  const lastConfirmation = confirmed.at(-1)
  const initial = result.initialSensitivity ?? result.setup?.sens
  const difference = initial ? (result.sensitivity / initial - 1) * 100 : null
  const moved = confirmed.length > 0

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.sensitivity.toFixed(3))
      setCopied(true)
      setCopyError(null)
    } catch (error) {
      setCopyError(`复制失败：${error.message}`)
    }
  }

  let confirmedGain = null
  if (lastConfirmation) {
    const baseline = lastConfirmation.entries.find((entry) => entry.sensitivity === lastConfirmation.baseline)
    const challenger = lastConfirmation.entries.find((entry) => entry.sensitivity === lastConfirmation.challenger)
    confirmedGain = challenger.score - baseline.score
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
            <span>{moved ? '建议改成这个灵敏度' : '建议保留当前灵敏度'}</span>
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
            <span>{result.message ?? END_NOTE[result.reason] ?? '以下为此前保存的数据。'}</span>
            {confirmedGain != null && (
              <span className="num">
                最近一次复查：{lastConfirmation.baseline.toFixed(3)} → {lastConfirmation.challenger.toFixed(3)}，
                平均多击杀 <strong>{confirmedGain.toFixed(1)}</strong> 个；两次对比分别多{' '}
                {lastConfirmation.differences.map((value) => `+${value}`).join('、')} 个。
              </span>
            )}
            {result.tied && (
              <span className="num">
                接近的档位：{result.leaders.map((value) => value.toFixed(3)).join('、')}，差距不足{' '}
                {result.minGain} 个击杀，从中挑手感顺手的即可。
              </span>
            )}
            {result.warning && <span>{result.warning}</span>}
          </p>
        </div>

        <div className="readings">
          <Reading
            label="平均每轮击杀"
            value={result.score == null ? '—' : result.score.toFixed(1)}
            unit={`/ ${BOTS_PER_RUN}`}
            note="推荐档位在所有轮次上的平均成绩"
            tone={moved ? 'confirm' : 'ink'}
          />
          <Reading
            label="经复查确认的提升"
            value={String(confirmed.length)}
            unit="次"
            note={
              confirmed.length
                ? '每次都要在交错对比中两次领先，并平均多杀 1 个'
                : '所有候选都没能稳定超过基准，因此没有换'
            }
          />
          <Reading label="记录轮次" value={String(result.rounds)} unit="轮" note="每轮 = 一次中等难度 30 bot 靶场" />
        </div>
      </div>

      <section style={{ marginTop: 'clamp(36px, 6vw, 60px)' }} aria-labelledby="bracket-title">
        <SectionMark title="各档表现" note={`${history.length} 个档位`} id="bracket-title" />
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
                    {!selected && kills.length > 1 && <span className="tag" data-tone="muted">测过 {kills.length} 轮</span>}
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
                      <small> / {BOTS_PER_RUN}</small>
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
          <SectionMark title="判定过程" note={`${decisions.length} 组`} id="decision-title" />
          <details className="fold">
            <summary>
              每一步怎么判的
              <span className="meta">{decisions.length} 组判定</span>
            </summary>
            <div className="fold-body">
              <ol className="decisions">
                {decisions.map((decision, index) => (
                  <li key={index}>
                    <h3>
                      <span className="num">{index + 1}.</span>
                      {decision.phase === 'screen' ? '初测' : decision.accepted ? '复查通过' : '复查未通过'}
                      {decision.challenger != null && <span className="num">{decision.challenger.toFixed(3)}</span>}
                    </h3>
                    <p>
                      {decision.entries
                        .map((entry) => `${entry.sensitivity.toFixed(3)}：${entry.kills.join('、')} 杀`)
                        .join(' / ')}
                    </p>
                    {decision.differences && (
                      <p>
                        成对差值{' '}
                        {decision.differences.map((value) => `${value > 0 ? '+' : ''}${value}`).join('、')}；
                        {decision.accepted ? '更新基准，继续探索' : '保留基准，缩小步长'}
                      </p>
                    )}
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
