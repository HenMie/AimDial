import { useEffect, useState } from 'react'
import SetupScreen from './components/SetupScreen.jsx'
import CalibrationScreen from './components/CalibrationScreen.jsx'
import ResultScreen from './components/ResultScreen.jsx'
import { discardDraft, finishRun, loadData, restoreDraft } from './lib/storage.js'

export default function App() {
  const [step, setStep] = useState('setup')
  const [active, setActive] = useState(null)
  const [report, setReport] = useState(null)
  const [data, setData] = useState({ history: [], draft: null })
  const [error, setError] = useState(null)
  useEffect(() => {
    try { setData(loadData()) } catch (reason) { setError(`读取失败：${reason.message}`) }
  }, [])
  const start = (setup) => {
    if (data.draft) {
      setError('请先继续或放弃未完成的测试。')
      return
    }
    setActive({ id: crypto.randomUUID(), setup })
    setError(null)
    setStep('calibrate')
  }
  const resume = () => {
    try {
      const draft = data.draft
      setActive({ id: draft.id, setup: draft.setup, initialSession: restoreDraft(draft), initialInput: draft.input })
      setError(null)
      setStep('calibrate')
    } catch (reason) { setError(`无法恢复：${reason.message}`) }
  }
  const finish = (result) => {
    try {
      const next = finishRun(active.id, result, active.setup)
      setData(next)
      setReport(next.history.find((entry) => entry.id === active.id))
      setError(null)
      setStep('result')
    } catch (reason) { setError(`报告未保存，进度仍保留：${reason.message}`) }
  }
  const home = () => {
    try { setData(loadData()); setError(null); setStep('setup') }
    catch (reason) { setError(`读取失败：${reason.message}`) }
  }
  const abandon = () => {
    try { setData(discardDraft()); setError(null) }
    catch (reason) { setError(`操作失败：${reason.message}`) }
  }
  return (
    <main className={`app step-${step}`}>
      {error && <p className="error app-error" role="alert">{error}</p>}
      {step === 'setup' && <>
        {data.draft && <section className="panel resume-card">
          <div><h2>继续上次测试</h2><p>已记录 {data.draft.runs.length} 轮 · {data.draft.setup.dpi} DPI</p></div>
          <button className="btn primary block" onClick={resume}>继续测试</button>
          <details><summary>放弃本次进度</summary><button className="btn ghost block" onClick={abandon}>确认放弃，重新开始</button></details>
        </section>}
        <SetupScreen onStart={start} initial={active?.setup} />
        {data.history.length > 0 && <section className="history">
          <h2>历史记录</h2>
          <ul>{data.history.map((entry) => <li key={entry.id}>
            <button className="history-entry" onClick={() => { setReport(entry); setStep('result') }}>
              <span><strong>{Number(entry.sensitivity).toFixed(3)}</strong><small>{new Date(entry.at).toLocaleString('zh-CN')} · {entry.rounds} 轮</small></span>
              <span>{entry.mode === 'range-medium-30' ? `${entry.score.toFixed(1)} / 30` : '旧版'} <span aria-hidden="true">↗</span></span>
            </button>
          </li>)}</ul>
        </section>}
      </>}
      {step === 'calibrate' && <CalibrationScreen key={active.id} {...active} onFinish={finish} onHome={home} />}
      {step === 'result' && <ResultScreen result={report} onRestart={home} />}
    </main>
  )
}
