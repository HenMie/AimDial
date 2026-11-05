/**
 * Per-round scoring shared by the test harness and the result charts.
 *
 * score = accuracy^2 * 100 / max(ttk, MIN_TTK)
 *   - accuracy is squared so missing shots hurts more than being slow
 *   - ttk is seconds per kill; the floor keeps a lucky double-tap from
 *     producing an infinite score.
 */
export const MIN_TTK = 0.15

export function summarize(round) {
  const shots = Math.max(0, round.shots | 0)
  const hits = Math.max(0, round.hits | 0)
  const durationMs = Math.max(0, round.durationMs || 0)

  const accuracy = shots > 0 ? hits / shots : 0
  const ttk = hits > 0 ? durationMs / hits / 1000 : Infinity
  const score = hits > 0 ? (accuracy ** 2) * 100 / Math.max(ttk, MIN_TTK) : 0

  return {
    shots,
    hits,
    durationMs,
    accuracy,
    ttk: Number.isFinite(ttk) ? ttk : null,
    score: Number.isFinite(score) ? score : 0,
  }
}

/**
 * Mean overshoot, in degrees, between where the crosshair ended up and the
 * centre of the target that was struck last. Positive = overshot.
 * Display-only; never feeds the search score.
 */
export function meanOvershoot(samples) {
  const usable = samples.filter((s) => Number.isFinite(s?.delta))
  if (!usable.length) return null
  const sum = usable.reduce((acc, s) => acc + s.delta, 0)
  return sum / usable.length
}
