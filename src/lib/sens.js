// Valorant/WinInput-style yaw constant: degrees of view rotation per mouse count.
// sensitivity * 0.07 = degrees per count => 360 / (sens * 0.07) counts for a full turn.
export const DEG_PER_COUNT = 0.07

/**
 * Degrees the view turns per unit of reported pointer movement.
 *
 * Pointer Lock under `unadjustedMovement` reports movementX in raw device
 * counts — the same unit Valorant uses — so the gain is exactly the game's own
 * yaw constant and nothing else. No DPI term and no devicePixelRatio term
 * belongs here: the counts already account for the mouse's DPI, and display
 * scaling never enters a raw-input stream.
 *
 * Measured on the target machine (1600 DPI, 0.18 sens): half a small mouse pad,
 * about 125 mm of travel, reported 8330 units. Raw counts over that distance
 * are 125/25.4*1600 = 7874 — close enough to confirm the unit, and two orders
 * of magnitude away from the ~470 CSS pixels the same movement would report.
 */
export function degPerPointerUnit(sens) {
  if (!isPositive(sens)) return 0
  return DEG_PER_COUNT * sens
}

// Equivalent eDPI for the common "high DPI, low sens" profiles
// (1600 x 0.16, 800 x 0.32, 400 x 0.64 all land on 256). Only used as a
// last-resort hint — the search needs the player's real value, because the
// probe window is centred on it and a 10% miss wastes most of the early rounds.
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
 *
 * Sensitivity is required. The gain here has to match the number the game is
 * actually running, otherwise every probe in the search is offset by the same
 * factor and the recommendation is meaningless. An empty value is an error, not
 * a default.
 */
export function resolveSetup(dpiRaw, sensRaw) {
  const dpi = toNumber(dpiRaw)
  const rawSens = String(sensRaw ?? '').trim()
  const sens = toNumber(rawSens)

  if (!isPositive(dpi)) {
    return { ok: false, error: 'DPI 需为大于 0 的数字', dpi, sens: NaN }
  }
  if (rawSens === '') {
    return { ok: false, error: '请填写游戏内当前灵敏度，它是测试的起点', dpi, sens: NaN }
  }
  if (!isPositive(sens)) {
    return { ok: false, error: '灵敏度需为大于 0 的数字', dpi, sens: NaN }
  }

  const edpi = dpi * sens
  return { ok: true, error: null, dpi, sens, edpi }
}

/**
 * Centimetres of mouse travel for a full 360° turn.
 *
 * Not shown anywhere in the UI — cm/360° means little to most players — but
 * kept as the shared physical reference that the pointer-gain test checks
 * against.
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
