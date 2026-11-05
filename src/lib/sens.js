// Valorant/WinInput-style yaw constant: degrees of view rotation per mouse count.
// sensitivity * 0.07 = degrees per count => 360 / (sens * 0.07) counts for a full turn.
export const DEG_PER_COUNT = 0.07

// Equivalent eDPI for the common "high DPI, low sens" profiles
// (1600 x 0.16, 800 x 0.32, 400 x 0.64 all land on 256).
export const DEFAULT_EDPI = 256

/**
 * Game sensitivity that yields `edpi` at the given DPI.
 */
export function sensFromEdpi(edpi, dpi) {
  if (!isPositive(dpi)) return NaN
  return edpi / dpi
}

/**
 * Resolve the user's setup into a single normalised shape.
 * `sensRaw` may be empty, in which case the default eDPI tier is assumed.
 */
export function resolveSetup(dpiRaw, sensRaw) {
  const dpi = toNumber(dpiRaw)
  const rawSens = String(sensRaw ?? '').trim()
  const sensGiven = rawSens !== ''
  const sens = sensGiven ? toNumber(rawSens) : DEFAULT_EDPI / dpi

  if (!isPositive(dpi)) {
    return { ok: false, error: 'DPI 必须是大于 0 的数字', dpi, sens: NaN }
  }
  if (sensGiven && !isPositive(sens)) {
    return { ok: false, error: '灵敏度必须是大于 0 的数字', dpi, sens: NaN }
  }

  const edpi = dpi * sens
  return {
    ok: true,
    error: null,
    dpi,
    sens,
    sensWasDefaulted: !sensGiven,
    edpi,
    cm360: cm360(dpi, sens),
  }
}

/**
 * Centimetres of mouse travel for a full 360° turn.
 */
export function cm360(dpi, sens) {
  if (!isPositive(dpi) || !isPositive(sens)) return NaN
  const counts = 360 / (sens * DEG_PER_COUNT)
  return (counts / dpi) * 2.54
}

export function isPositive(value) {
  return Number.isFinite(value) && value > 0
}

function toNumber(value) {
  const n = Number(String(value ?? '').trim())
  return Number.isFinite(n) ? n : NaN
}

export function round(value, digits = 2) {
  if (!Number.isFinite(value)) return '—'
  const f = 10 ** digits
  return Math.round(value * f) / f
}
