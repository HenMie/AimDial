import { useState } from 'react'
import { useCalibration } from '../hooks/useCalibration.js'
import { parseKills } from '../lib/rangeCalibration.js'

export default function CalibrationScreen({ setup, id, initialSession, initialInput, onFinish, onHome }) {
  const { session, current, record, undo, stop, done, result, kills, setKills, saved, saveError } = useCalibration(setup, id, initialSession, initialInput)
  const [error, setError] = useState(null)
  const submit = (event) => {
    event.preventDefault()
    try { record(parseKills(kills)); setError(null) }
    catch (reason) { if (!(reason instanceof RangeError)) throw reason; setError(reason.message) }
  }
  if (done) return <section className="panel">
    <h1>测试已完成</h1><p>{session.runs.length} 轮成绩已记录。</p>
    {saveError && <p className="error" role="alert">{saveError}</p>}
    <button className="btn primary block" onClick={() => onFinish(result)}>查看报告</button>
    <button className="btn ghost block" onClick={undo}>撤销最后一轮</button>
  </section>
  return (
    <section className="panel range-panel">
      <header className="range-heading"><button className="text-button" onClick={onHome}>返回</button><span>第 {session.runs.length + 1} 轮 · {session.plan.phase === 'confirm' ? '交错确认' : ['粗测', '中调', '精调'][session.level]}</span><span className="save-status">{saved ? '已保存' : '未保存'}</span></header>
      <progress className="range-progress" value={session.plan.cursor} max={session.plan.schedule.length} aria-label="本组测试进度" />
      <div className="sensitivity-focus"><h1>将灵敏度设为</h1><strong>{current.toFixed(3)}</strong><p>{setup.dpi} DPI · 中等 · 30 bot</p></div>
      <form onSubmit={submit} noValidate>
        <label className="field"><span className="field-label">击杀数量 / 30</span>
          <input type="number" inputMode="numeric" min="0" max="30" step="1" value={kills}
            onChange={(event) => { setKills(event.target.value); setError(null) }} placeholder="0–30" required aria-invalid={Boolean(error)} aria-describedby={error ? 'kills-error' : undefined} />
        </label>
        {error && <p id="kills-error" className="error" role="alert">{error}</p>}
        {saveError && <p className="error" role="alert">{saveError}</p>}
        <button className="btn primary block" type="submit">记录，下一轮</button>
      </form>
      {session.warning && <p className="warn" role="status">{session.warning}</p>}
      <details className="disclosure"><summary>本轮安排 <span>{session.plan.cursor + 1} / {session.plan.schedule.length}</span></summary><p>{session.plan.message}</p><p>当前基准 {session.incumbent.toFixed(3)}。两次成对比较均领先、平均提升至少 {session.minGain} 杀才更新。请保持 DPI、武器、站位和护甲设置一致。</p></details>
      {session.runs.length > 0 && <details className="disclosure"><summary>已记录 <span>{session.runs.length} 轮</span></summary>
        <ol className="run-list">{session.runs.map((run, index) => <li key={index}><span>{index + 1}. {run.sensitivity.toFixed(3)}</span><strong>{run.kills} / 30</strong></li>)}</ol>
        <button className="text-button" onClick={() => { undo(); setError(null) }}>撤销上一轮</button>
      </details>}
      <button type="button" className="btn ghost block" disabled={!session.runs.length} onClick={stop}>结束测试</button>
    </section>
  )
}
