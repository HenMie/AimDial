import { useEffect, useState } from 'react'
import SetupScreen from './components/SetupScreen.jsx'
import CalibrationScreen from './components/CalibrationScreen.jsx'
import ResultScreen from './components/ResultScreen.jsx'
import MethodSection from './components/MethodSection.jsx'
import { DialMark, CompassRing } from './components/marks.jsx'
import { discardDraft, finishRun, loadData, restoreDraft } from './lib/storage.js'

const STEPS = [
  { key: 'setup', label: '设置' },
  { key: 'calibrate', label: '测试' },
  { key: 'result', label: '结果' },
]

function StepScale({ step }) {
  const active = STEPS.findIndex((entry) => entry.key === step)
  return (
    <ol className="steps" aria-label="当前步骤">
      {STEPS.map((entry, index) => (
        <li
          key={entry.key}
          data-state={index === active ? 'current' : index < active ? 'done' : 'ahead'}
          aria-current={index === active ? 'step' : undefined}
        >
          <b aria-hidden="true">{String(index + 1).padStart(2, '0')}</b>
          {entry.label}
        </li>
      ))}
    </ol>
  )
}

export default function App() {
  const [step, setStep] = useState('setup')
  const [active, setActive] = useState(null)
  const [report, setReport] = useState(null)
  const [data, setData] = useState({ history: [], draft: null })
  const [error, setError] = useState(null)

  useEffect(() => {
    try {
      setData(loadData())
    } catch (reason) {
      setError(`读取本地数据失败：${reason.message}`)
    }
  }, [])

  const start = (setup) => {
    if (data.draft) {
      setError('还有一次测试未完成，请先继续或放弃该进度。')
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
    } catch (reason) {
      setError(`无法恢复上次进度：${reason.message}`)
    }
  }
  const finish = (result) => {
    try {
      const next = finishRun(active.id, result, active.setup)
      setData(next)
      setReport(next.history.find((entry) => entry.id === active.id))
      setError(null)
      setStep('result')
    } catch (reason) {
      setError(`结果未保存，测试进度仍保留：${reason.message}`)
    }
  }
  const home = () => {
    try {
      setData(loadData())
      setError(null)
      setStep('setup')
    } catch (reason) {
      setError(`读取失败：${reason.message}`)
    }
  }
  const abandon = () => {
    try {
      setData(discardDraft())
      setError(null)
    } catch (reason) {
      setError(`操作失败：${reason.message}`)
    }
  }

  const brand = (
    <>
      <span className="wordmark-dial" aria-hidden="true">
        <DialMark />
      </span>
      AimDial
      <small>灵敏度校准</small>
    </>
  )

  return (
    <div className="app">
      {/* The bar is the chart's frame: the wordmark anchors the left margin, the
          step scale is a graduated meter rather than a numbered list. */}
      <header className="bar">
        <div className="bar-inner">
          {step === 'setup' ? (
            <h1 className="wordmark">{brand}</h1>
          ) : (
            <button type="button" className="wordmark is-action" onClick={home}>
              {brand}
            </button>
          )}
          <StepScale step={step} />
        </div>
      </header>

      <main className="stage sheet" id="main">
        {error && (
          <p className="notice" data-tone="error" role="alert" style={{ marginBottom: 26 }}>
            {error}
          </p>
        )}

        {step === 'setup' && (
          <>
            {data.draft && (
              <section className="resume" aria-labelledby="resume-title">
                <div>
                  <span className="stamp">未完成</span>
                  <h2 id="resume-title">继续上次测试</h2>
                  <p>
                    已记录 <span className="num">{data.draft.runs.length}</span> 轮，将从第{' '}
                    <span className="num">{data.draft.runs.length + 1}</span> 轮继续。
                  </p>
                </div>
                <button type="button" className="primary" onClick={resume}>
                  继续测试
                </button>
                <div className="resume-abandon">
                  <button type="button" className="quiet" onClick={abandon}>
                    放弃本次进度，重新开始
                  </button>
                </div>
              </section>
            )}
            <SetupScreen onStart={start} initial={active?.setup} />
            <HistorySection history={data.history} onOpen={(entry) => { setReport(entry); setStep('result') }} />
            <MethodSection />
          </>
        )}

        {step === 'calibrate' && (
          <CalibrationScreen key={active.id} {...active} onFinish={finish} onHome={home} />
        )}

        {step === 'result' && <ResultScreen result={report} onRestart={home} />}
      </main>

      <footer className="foot">
        <div className="foot-inner">
          <CompassRing className="foot-compass" ticks={48} bearing={0} label="" />
          <span>Made by <strong>Chouann</strong></span>
          <span className="spacer" />
          <a href="https://github.com/HenMie/AimDial" target="_blank" rel="noreferrer">
            源码
          </a>
        </div>
      </footer>
    </div>
  )
}

function HistorySection({ history, onOpen }) {
  if (!history.length) return null
  return (
    <section className="method" aria-labelledby="history-title">
      <header className="mark">
        <span className="mark-line">
          <h2 className="mark-title" id="history-title">测过的记录</h2>
        </span>
        <span className="mark-note">{history.length} 份</span>
      </header>
      <ul className="history-list">
        {history.map((entry) => (
          <li key={entry.id}>
            <button type="button" className="history-entry" onClick={() => onOpen(entry)}>
              <strong className="num">{Number(entry.sensitivity).toFixed(3)}</strong>
              <span className="when">
                {new Date(entry.at).toLocaleString('zh-CN', {
                  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
                {' · '}
                {entry.rounds} 轮
                {entry.mode === 'range-medium-30' ? '' : ' · 旧版'}
              </span>
              <span className="score">
                {entry.mode === 'range-medium-30' ? (
                  <>平均 {entry.score.toFixed(1)}<small> 杀</small></>
                ) : (
                  '旧版记录'
                )}
                <span className="arrow" aria-hidden="true"> ↗</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
