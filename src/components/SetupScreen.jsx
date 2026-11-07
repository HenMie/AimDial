import { useMemo, useState } from 'react'
import { resolveSetup } from '../lib/sens.js'
import { stepFactors, ladderAnchor, MODES, DEFAULT_MODE, isDiscovery } from '../lib/rangeCalibration.js'
import { Crosshair, ConstellationPlate, TargetSpheres } from './marks.jsx'

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
 * The first three values a run will ask for, in ascending order, with the one
 * you already use marked. This is the whole preview: no scale, no ratios —
 * three numbers you can read straight off the page.
 *
 * The step is calibrated to this player's eDPI, so the same preview shows a
 * wider spread at low sensitivity and a narrower one at high sensitivity.
 */
function opening(base, dpi) {
  const factor = stepFactors(ladderAnchor({ dpi, sens: base }))[0]
  const low = quantize(base / factor)
  const high = quantize(base * factor)
  const candidates = [...new Set([low, base, high])].filter((value) => value > 0).sort((a, b) => a - b)
  return candidates.map((value) => ({
    value,
    current: value === base,
    direction: value < base ? '往下试' : value > base ? '往上试' : '现在',
  }))
}

/** The preview: the first values this run asks for, smallest number first. */
function OpeningPreview({ marks, placeholder, className = '' }) {
  return (
    <div className={`preview-frame ${className}`.trim()}>
      <div className="preview-head">
        <TargetSpheres className="preview-glyph" />
        <span className="preview-label">头几轮会试这几个</span>
      </div>
      <ol className="preview" aria-label="头几轮会试的灵敏度" data-placeholder={placeholder}>
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
    </div>
  )
}

/**
 * Two cards, not a toggle: the choice changes what gets measured, so it deserves
 * to be read rather than skimmed past.
 */
function ModeChoice({ mode, onChange }) {
  return (
    <fieldset className="mode-choice">
      <legend>你现在的情况</legend>
      <div className="mode-cards">
        {Object.values(MODES).map((entry) => (
          <label key={entry.key} className="mode-card" data-selected={mode === entry.key}>
            <input
              type="radio"
              name="calibration-mode"
              value={entry.key}
              checked={mode === entry.key}
              onChange={() => onChange(entry.key)}
            />
            <strong>{entry.label}</strong>
            <span className="mode-blurb">{entry.blurb}</span>
            <span className="mode-budget">
              {entry.discover ? '先从常见数值开始，再逐步调准' : '只在你现在的数值附近找'}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export default function SetupScreen({ onStart, initial }) {
  const [mode, setMode] = useState(initial?.mode ?? DEFAULT_MODE)
  const [dpi, setDpi] = useState(initial?.dpi ?? '800')
  const [sens, setSens] = useState(initial?.sens ? String(initial.sens) : '')
  const [error, setError] = useState(null)
  const discover = isDiscovery(mode)

  const resolved = resolveSetup(dpi, sens)
  const typed = String(sens).trim() === '' ? null : quantize(resolved.ok ? resolved.sens : NaN)
  const calibratedInput = Number.isFinite(typed) && typed > 0
  // Refine needs the player's real value; discovery only needs a DPI, because the
  // number it would show in the preview is the thing the run is going to find.
  const base = calibratedInput ? typed : quantize(HINT_EDPI / (Number(dpi) > 0 ? Number(dpi) : 800))
  const calibrated = base >= SCALE_MIN
  const showPreview = !discover && calibrated
  const marks = useMemo(
    () => (showPreview ? opening(base, Number(dpi) > 0 ? Number(dpi) : 800) : []),
    [showPreview, base, dpi],
  )

  const submit = (event) => {
    event.preventDefault()
    if (!(Number(dpi) > 0)) {
      setError('DPI 需为大于 0 的数字')
      return
    }
    if (isDiscovery(mode)) {
      // Discovery deliberately accepts no starting sensitivity.
      setError(null)
      onStart({ dpi: Number(dpi), mode })
      return
    }
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
    onStart({ dpi: r.dpi, sens: r.sens, edpi: r.edpi, mode })
  }

  return (
    <form className="setup" onSubmit={submit} noValidate>
      {/* The chart's title block: a plotted field behind the claim, so the page
          opens on the subject (aim as a measurable position) rather than on a
          headline floating in space. */}
      <div className="setup-head">
        <div className="setup-plot" aria-hidden="true">
          <ConstellationPlate className="setup-plot-lines" opacity={0.55} />
          <Crosshair className="setup-plot-cross" gap={14} arm={22} />
        </div>
        <p className="setup-kicker">瞄准标定 · 靶场实测</p>
        <h2>找到你真正打得准的灵敏度</h2>
      </div>

      <ModeChoice mode={mode} onChange={(next) => { setMode(next); setError(null) }} />

      {discover ? (
        <p className="preview-slot mode-note">
          不需要填现在的灵敏度。测试会从职业选手最常见的数值开始，往上下各试几个，再逐步调准。
        </p>
      ) : (
        <OpeningPreview className="preview-slot" marks={marks} placeholder={!calibratedInput} />
      )}

      <div className="entry">
        {/* The one field that starts the whole run, and the action it feeds. In
            discovery mode the sensitivity is exactly what the run is going to find,
            so asking for it would contradict the premise. */}
        {!discover && (
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
        )}

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
