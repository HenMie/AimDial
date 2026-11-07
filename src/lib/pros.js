import roster from './prosData.js'

/**
 * Reference roster of published pro setups, used to show the player where their
 * result sits.
 *
 * Source: ValorantHub's public pro settings table, captured 2026-11-07 (540
 * players with a published mouse DPI and in-game sensitivity). The table is
 * community-collected, so individual entries can lag a player's current setup;
 * it is sound for the *shape* of the distribution, which is all this uses.
 * Values are stored as DPI + sensitivity and multiplied here, so the sourced
 * numbers are the only thing persisted and eDPI can never drift from them.
 */
export const PRO_ROSTER = Object.freeze(roster.map((entry) => Object.freeze({
  name: entry.n,
  team: entry.t,
  country: entry.c,
  dpi: entry.d,
  sens: entry.s,
  edpi: entry.d * entry.s,
})))

export const ROSTER_SOURCE = {
  label: 'ValorantHub',
  url: 'https://valoranthub.com/proplayers',
  captured: '2026-11-07',
  count: PRO_ROSTER.length,
}

/**
 * Nearest players to a target eDPI.
 *
 * Distance is measured in log space: sensitivity is multiplicative, so 240 vs 250
 * is the same perceptual gap as 480 vs 500, and a linear ranking would flood the
 * list with high-eDPI players. `tolerance` bounds how far the list may reach —
 * a reference that is 80% away is not a comparison, it is a different game.
 */
export function nearestPros(edpi, { limit = 5, tolerance = 0.12 } = {}) {
  if (!Number.isFinite(edpi) || edpi <= 0) return []
  const reach = Math.log(1 + tolerance)
  return PRO_ROSTER
    .map((pro) => ({ ...pro, distance: Math.abs(Math.log(pro.edpi / edpi)) }))
    .filter((pro) => pro.distance <= reach)
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
    .slice(0, limit)
}

/** Distribution landmarks, so the UI can place the player without a histogram. */
export function edpiLandmarks() {
  const values = PRO_ROSTER.map((pro) => pro.edpi).sort((a, b) => a - b)
  const at = (q) => values[Math.floor((values.length - 1) * q)]
  return {
    p10: Math.round(at(0.1)),
    p25: Math.round(at(0.25)),
    median: Math.round(at(0.5)),
    p75: Math.round(at(0.75)),
    p90: Math.round(at(0.9)),
    min: Math.round(values[0]),
    max: Math.round(values[values.length - 1]),
  }
}

/** The closest single player, or null when nobody is near. */
export function closestPro(edpi, tolerance = 0.12) {
  return nearestPros(edpi, { limit: 1, tolerance })[0] ?? null
}
