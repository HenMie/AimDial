import { useState } from 'react'
import { resolveSetup, round } from '../lib/sens.js'

// Presets cover what the vast majority of mice ship or get set to; typing is
// still allowed for everything else.
const DPI_PRESETS = [400, 800, 1200, 1600, 3200]
// A sparse set only: sensitivity is personal enough that a long row of values
// reads as clutter, and players know their own number anyway.
const SENS_PRESETS = [0.15, 0.18, 0.2, 0.3]

export default function SetupScreen({ onStart, initial }) {
  const [dpi, setDpi] = useState(initial?.dpi ?? '800')
  const [sens, setSens] = useState(initial?.sens ?? '')
  const [error, setError] = useState(null)

  const resolved = resolveSetup(dpi, sens)
  const preview = resolved.ok ? resolved : null

  const submit = (e) => {
    e.preventDefault()
    const r = resolveSetup(dpi, sens)
    if (!r.ok) {
      setError(r.error)
      return
    }
    if (Number(r.sens.toFixed(3)) <= 0) {
      setError('灵敏度不能低于 0.001。')
      return
    }
    setError(null)
    onStart({ dpi: r.dpi, sens: r.sens, edpi: r.edpi })
  }

  return (
    <form className="panel setup" onSubmit={submit}>
      <h1 className="brand">
        Aim<span>Dial</span>
      </h1>
      <p className="lede">用游戏内靶场实测，找出最适合你的灵敏度</p>

      <div className="field">
        <span className="field-label">鼠标 DPI</span>
        <div className="chips" role="group" aria-label="常用 DPI">
          {DPI_PRESETS.map((value) => (
            <button
              key={value}
              type="button"
              className="chip"
              aria-pressed={Number(dpi) === value}
              onClick={() => setDpi(String(value))}
            >
              {value}
            </button>
          ))}
        </div>
        <input
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          value={dpi}
          onChange={(e) => setDpi(e.target.value)}
          autoComplete="off"
          aria-label="鼠标 DPI"
          required
        />
      </div>

      <div className="field">
        <span className="field-label">游戏内灵敏度</span>
        <div className="chips" role="group" aria-label="常用灵敏度">
          {SENS_PRESETS.map((value) => (
            <button
              key={value}
              type="button"
              className="chip"
              aria-pressed={Number(sens) === value}
              onClick={() => setSens(String(value))}
            >
              {value}
            </button>
          ))}
        </div>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.001"
          placeholder="例如 0.18"
          value={sens}
          onChange={(e) => setSens(e.target.value)}
          autoComplete="off"
          aria-label="游戏内灵敏度"
          required
        />
      </div>

      {preview && (
        <p className="setup-hint">
          从 <strong>{round(preview.sens, 3)}</strong> 开始，先测它和上下各一档，再逐步向上或向下收紧。
        </p>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      <button type="submit" className="btn primary block">
        开始测试
      </button>
    </form>
  )
}
