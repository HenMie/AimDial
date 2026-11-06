import { useState } from 'react'

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
  const decisions = result.decisions ?? []
  const history = result.history ?? []
  const runs = result.runs ?? []
  const confirmed = decisions.filter((decision) => decision.phase === 'confirm' && decision.accepted)
  const lastConfirmation = confirmed.at(-1)
  const initial = result.initialSensitivity ?? result.setup?.sens
  const difference = initial ? (result.sensitivity / initial - 1) * 100 : null
  const copy = async () => {
    try { await navigator.clipboard.writeText(result.sensitivity.toFixed(3)); setCopied(true); setCopyError(null) }
    catch (error) { setCopyError(`复制失败：${error.message}`) }
  }
  let confirmedGain = null
  if (lastConfirmation) {
    const baseline = lastConfirmation.entries.find((entry) => entry.sensitivity === lastConfirmation.baseline)
    const challenger = lastConfirmation.entries.find((entry) => entry.sensitivity === lastConfirmation.challenger)
    confirmedGain = challenger.score - baseline.score
  }
  return <section className="panel result">
    <header className="range-heading"><button className="text-button" onClick={onRestart}>← 返回</button><span>{result.at ? new Date(result.at).toLocaleDateString('zh-CN') : '测试结果'}</span><span>{result.rounds} 轮</span></header>
    <div className="sensitivity-focus">
      <h1>{confirmed.length ? '建议灵敏度' : '保留当前灵敏度'}</h1>
      <strong>{result.sensitivity.toFixed(3)}</strong>
      <p>{initial != null ? `原为 ${initial.toFixed(3)}` : `${result.dpi} DPI`}{difference != null && ` · ${difference > 0 ? '调高' : difference < 0 ? '调低' : '不变'} ${Math.abs(difference).toFixed(1)}%`}</p>
    </div>
    <div className="report-metrics">
      <div><strong>{result.score == null ? '—' : result.score.toFixed(1)}<small> / 30</small></strong><span>平均每轮击杀</span></div>
      <div><strong>{confirmed.length}</strong><span>经复查确认的提升</span></div>
    </div>
    <p className="report-verdict">{result.message ?? END_NOTE[result.reason] ?? '以下为此前保存的数据。'}</p>
    {confirmedGain != null && <p className="report-verdict">最近一次复查：{lastConfirmation.baseline.toFixed(3)} → {lastConfirmation.challenger.toFixed(3)}，平均多击杀 {confirmedGain.toFixed(1)} 个，两次对比分别多 {lastConfirmation.differences.map((value) => `+${value}`).join('、')} 个。</p>}
    {result.tied && <p className="report-verdict">多个档位表现接近（{result.leaders.map((value) => value.toFixed(3)).join('、')}），差距不足 {result.minGain} 个击杀，可从中选择手感合适的档位。</p>}
    {result.warning && <p className="warn">{result.warning}</p>}
    <button className="btn primary block" onClick={copy}>{copied ? '已复制' : '复制灵敏度'}</button>
    {copyError && <p className="error" role="alert">{copyError}</p>}
    {history.length > 0 && <section className="report-section"><h2>各档表现</h2><div className="setting-results">
      {history.map((entry) => {
        const sensitivity = entry.sensitivity ?? entry.edpi / result.dpi
        const kills = entry.kills ?? []
        return <article key={entry.edpi ?? entry.sensitivity} className="setting-result" data-selected={sensitivity === result.sensitivity}>
          <div className="setting-result-top"><strong>{sensitivity.toFixed(3)}</strong><span>{kills.length ? `${kills.length} 轮` : ''}</span><b>{entry.score.toFixed(1)}<small> / 30</small></b></div>
          <div className="bar-track"><div className="bar-fill" data-best={sensitivity === result.sensitivity} style={{ width: `${Math.min(100, entry.score / 30 * 100)}%` }} /></div>
          {kills.length > 0 && <p>{kills.join(' · ')}<span>最高 {Math.max(...kills)}，最低 {Math.min(...kills)}</span></p>}
        </article>
      })}
    </div></section>}
    {decisions.length > 0 && <details className="disclosure"><summary>判定过程<span>{decisions.length} 组</span></summary>
      <ol className="decision-list">{decisions.map((decision, index) => <li key={index}>
        <h3>{index + 1}. {decision.phase === 'screen' ? '初测' : decision.accepted ? '复查通过' : '复查未通过'}{decision.challenger != null && ` · ${decision.challenger.toFixed(3)}`}</h3>
        <p>{decision.entries.map((entry) => `${entry.sensitivity.toFixed(3)}：${entry.kills.join('、')} 杀`).join(' / ')}</p>
        {decision.differences && <p>成对差值 {decision.differences.map((value) => `${value > 0 ? '+' : ''}${value}`).join('、')}；{decision.accepted ? '更新基准，继续探索' : '保留基准，缩小步长'}</p>}
      </li>)}</ol>
    </details>}
    {runs.length > 0 && <details className="disclosure"><summary>逐轮成绩<span>{runs.length} 轮</span></summary>
      <ol className="run-list">{runs.map((run, index) => <li key={index}><span>{index + 1}. {run.sensitivity.toFixed(3)}</span><strong>{run.kills} / 30</strong></li>)}</ol>
    </details>}
  </section>
}
