import { useState } from 'react'
import { round } from '../lib/sens.js'

export default function ResultScreen({ setup, result, onRestart }) {
  const [copied, setCopied] = useState(false)
  const maxScore = Math.max(...result.history.map((h) => h.score), 1)

  const copy = async () => {
    const text = `${round(result.sensitivity, 3)} (${round(result.edpi, 0)} eDPI)`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="panel result">
      <p className="eyebrow">推荐灵敏度</p>
      <div className="hero-value">
        <span className="hero-number">{round(result.sensitivity, 3)}</span>
        <span className="hero-unit">游戏内</span>
      </div>

      <div className="readout">
        <div className="readout-item">
          <span className="readout-value">{round(result.edpi, 0)}</span>
          <span className="readout-label">eDPI</span>
        </div>
        <div className="readout-item">
          <span className="readout-value">{round(result.cm360, 1)}</span>
          <span className="readout-label">cm / 360°</span>
        </div>
        <div className="readout-item">
          <span className="readout-value">{round(setup.dpi, 0)}</span>
          <span className="readout-label">你的 DPI</span>
        </div>
      </div>

      <p className="note">
        在瓦罗兰特设置里把灵敏度填为 {round(result.sensitivity, 3)}。
        测试用了 {result.rounds} 轮，区间收窄到 ±
        {((result.bracketSpan / 2) * 100).toFixed(1)}%
        {result.convergedBy === 'max-rounds' ? '（达到轮数上限）' : ''}。
      </p>

      {result.boundaryWarning && (
        <p className="warn">
          最优值落在搜索区间的
          {result.boundaryWarning === 'high' ? '上' : '下'}边界，说明你的真实最佳灵敏度可能
          {result.boundaryWarning === 'high' ? '更高' : '更低'}。
          建议以 {round(result.sensitivity, 3)} 为新的基准值再校准一次。
        </p>
      )}

      <button type="button" className="btn block" onClick={copy}>
        {copied ? '已复制' : '复制灵敏度'}
      </button>

      <section className="chart-section">
        <p className="eyebrow">每轮得分</p>
        <div className="chart">
          {result.history.map((h) => (
            <div key={h.edpi} className="bar-row">
              <span className="bar-label">{round(h.edpi, 0)}</span>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${(h.score / maxScore) * 100}%` }}
                  data-best={Math.abs(h.edpi - result.edpi) < 0.5}
                />
              </div>
              <span className="bar-value">{h.score.toFixed(1)}</span>
            </div>
          ))}
        </div>
      </section>

      <button type="button" className="btn ghost block" onClick={onRestart}>
        重新校准
      </button>
    </div>
  )
}
