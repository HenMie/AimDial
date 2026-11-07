import { useMemo, useState } from 'react'
import { resolveSetup } from '../lib/sens.js'
import { STEP_FACTORS } from '../lib/rangeCalibration.js'

// Presets cover what the vast majority of mice ship with; anything else is typed.
const DPI_PRESETS = [400, 800, 1200, 1600, 3200]
const SENS_PRESETS = [0.15, 0.18, 0.2, 0.3]
// Before the player types a real sensitivity the dial borrows the industry-
// typical 256 eDPI at their DPI so it still has a scale to draw on.
const HINT_EDPI = 256
// A bracket's base sits at the dial's log centre only from 0.1 upward.
const SCALE_MIN = 0.1

const quantize = (value) => Number(value.toFixed(3))

/**
 * The three settings the run will test first, in ascending order, with the one
 * you already use marked. This is the whole preview: no scale, no ratios —
 * three numbers you can read straight off the page.
 */
function bracket(base) {
  const factor = STEP_FACTORS[0]
  const low = quantize(base / factor)
  const high = quantize(base * factor)
  const candidates = [...new Set([low, base, high])].filter((value) => value > 0).sort((a, b) => a - b)
  return candidates.map((value) => ({
    value,
    current: value === base,
    direction: value < base ? '低一档' : value > base ? '高一档' : '现在',
  }))
}

/** The preview: the settings this run starts with, smallest number first. */
function BracketPreview({ marks, placeholder, className = '' }) {
  return (
    <ol className={`preview ${className}`.trim()} aria-label="第一轮要试的三个灵敏度" data-placeholder={placeholder}>
      {marks.map((mark) => (
        <li key={mark.value} data-current={mark.current}>
          <span className="preview-value num">
            {mark.value.toFixed(3)}
            {mark.current && <span className="preview-tick" aria-hidden="true" />}
          </span>
          {!placeholder && (
            <span className="preview-note">{mark.current ? '你现在用的' : mark.direction}</span>
          )}
        </li>
      ))}
    </ol>
  )
}

export default function SetupScreen({ onStart, initial }) {
  const [dpi, setDpi] = useState(initial?.dpi ?? '800')
  const [sens, setSens] = useState(initial?.sens ? String(initial.sens) : '')
  const [error, setError] = useState(null)

  const resolved = resolveSetup(dpi, sens)
  const typed = String(sens).trim() === '' ? null : quantize(resolved.ok ? resolved.sens : NaN)
  const calibratedInput = Number.isFinite(typed) && typed > 0
  const base = calibratedInput ? typed : quantize(HINT_EDPI / (Number(dpi) > 0 ? Number(dpi) : 800))
  const calibrated = base >= SCALE_MIN
  const marks = useMemo(() => (calibrated ? bracket(base) : []), [base, calibrated])

  const submit = (event) => {
    event.preventDefault()
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
    <form className="setup" onSubmit={submit} noValidate>
      <div className="setup-head">
        {/* The heading alone; the preview is its own grid item so the phone can
            put it between the field and the action. */}
        <h2>找到你真正打得准的灵敏度</h2>
      </div>

      <BracketPreview className="preview-slot" marks={marks} placeholder={!calibratedInput} />

      <div className="entry">
        {/* The one field that starts the whole run, and the action it feeds. */}
        <div className="focus-block">
          <label className="field-label-hero" htmlFor="sens-input">
            游戏内灵敏度
          </label>
          <div className="hero-input">
            <input
              id="sens-input"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.001"
              placeholder="0.180"
              value={sens || ''}
              onChange={(event) => { setSens(event.target.value); setError(null) }}
              autoComplete="off"
              required
            />
          </div>
          <ul className="ticks" aria-label="常用灵敏度">
            {SENS_PRESETS.map((value) => (
              <li key={value}>
                <button
                  type="button"
                  aria-pressed={Number(sens) === value}
                  onClick={() => { setSens(String(value)); setError(null) }}
                >
                  {value.toFixed(2)}
                </button>
              </li>
            ))}
          </ul>

          {error && <p className="notice" data-tone="error" role="alert" style={{ marginTop: 16 }}>{error}</p>}
        </div>

        {/* Its own grid item, so the phone can put the preview between this
            field and the action. */}
        <button type="submit" className="primary hero-cta">开始测试</button>

        <div className="field field-minor">
          <label className="field-label" htmlFor="dpi-input">鼠标 DPI</label>
          <div className="input-shell">
            <input
              id="dpi-input"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={dpi}
              onChange={(event) => { setDpi(event.target.value); setError(null) }}
              autoComplete="off"
              required
            />
          </div>
          <ul className="ticks" aria-label="常用 DPI">
            {DPI_PRESETS.map((value) => (
              <li key={value}>
                <button
                  type="button"
                  aria-pressed={Number(dpi) === value}
                  onClick={() => { setDpi(String(value)); setError(null) }}
                >
                  {value}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </form>
  )
}
