import { useEffect, useState } from 'react'
import SetupScreen from './components/SetupScreen.jsx'
import CalibrationScreen from './components/CalibrationScreen.jsx'
import ResultScreen from './components/ResultScreen.jsx'
import { saveRun, loadHistory } from './lib/storage.js'

export default function App() {
  const [step, setStep] = useState('setup') // setup | calibrate | result
  const [setup, setSetup] = useState(null)
  const [result, setResult] = useState(null)
  const [history, setHistory] = useState([])

  useEffect(() => {
    setHistory(loadHistory())
  }, [])

  const handleStart = (nextSetup) => {
    setSetup(nextSetup)
    setResult(null)
    setStep('calibrate')
  }

  const handleFinish = (nextResult) => {
    setResult(nextResult)
    setStep('result')
    saveRun({
      dpi: setup.dpi,
      edpi: nextResult.edpi,
      sensitivity: nextResult.sensitivity,
      rounds: nextResult.rounds,
    })
    setHistory(loadHistory())
  }

  const restart = () => {
    setResult(null)
    setStep('setup')
  }

  return (
    <main className={`app step-${step}`}>
      {step === 'setup' && <SetupScreen onStart={handleStart} initial={setup} />}

      {step === 'calibrate' && setup && (
        <CalibrationScreen setup={setup} onFinish={handleFinish} />
      )}

      {step === 'result' && result && setup && (
        <ResultScreen setup={setup} result={result} onRestart={restart} />
      )}

      {step === 'setup' && history.length > 0 && (
        <section className="history">
          <p className="eyebrow">历史记录</p>
          <ul>
            {history.slice(0, 5).map((h) => (
              <li key={h.id}>
                <span>{new Date(h.at).toLocaleDateString('zh-CN')}</span>
                <span>
                  {h.dpi} DPI · {Number(h.sensitivity).toFixed(3)}
                </span>
                <span className="muted">{Math.round(h.edpi)} eDPI</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
