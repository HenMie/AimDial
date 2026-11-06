import { useState } from 'react'
import { resolveSetup, round } from '../lib/sens.js'

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
      setError('游戏灵敏度按三位小数取整后必须大于 0。')
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
      <p className="lede">中等难度 · 30 bot · 游戏内实测</p>

      <label className="field">
        <span className="field-label">鼠标 DPI</span>
        <input
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          value={dpi}
          onChange={(e) => setDpi(e.target.value)}
          autoComplete="off"
          required
        />
      </label>

      <label className="field">
        <span className="field-label">当前游戏内灵敏度</span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.001"
          placeholder="例如 0.18"
          value={sens}
          onChange={(e) => setSens(e.target.value)}
          autoComplete="off"
          required
        />
      </label>

      <div className="readout">
        {preview ? (
          <>
            <div className="readout-item">
              <span className="readout-value">{round(preview.edpi, 0)}</span>
              <span className="readout-label">eDPI</span>
            </div>
            <div className="readout-item">
              <span className="readout-value">{round(preview.sens, 3)}</span>
              <span className="readout-label">游戏灵敏度</span>
            </div>
            <div className="readout-item">
              <span className="readout-value">{round(preview.cm360, 1)}</span>
              <span className="readout-label">cm / 360°</span>
            </div>
          </>
        ) : (
          <p className="readout-hint">DPI 与灵敏度都填对后显示换算结果。</p>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <button type="submit" className="btn primary block">
        开始校准
      </button>

    </form>
  )
}
