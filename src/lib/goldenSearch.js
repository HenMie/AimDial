/**
 * Golden-section search over a 1-D sensitivity axis.
 *
 * The harness keeps two interior probes inside the current bracket. After each
 * pair of scores the losing side is discarded, so every round shrinks the
 * bracket by the golden ratio (0.618) instead of the bisection's 0.5 — fewer
 * rounds for the same precision, and it tolerates noisier per-round scores
 * because it never commits to a bracket based on a single probe.
 */

export const PHI = 0.6180339887
export const INITIAL_SPAN = 0.4 // base ±40%
export const TOLERANCE = 0.1 // stop when span / centre <= 10%
export const MAX_ROUNDS = 14
export const REPS_PER_PROBE = 1
// Two probes closer than this (in eDPI) are the same physical sensitivity.
export const PRECISION = 0.5

export function createSearch(baseEdpi, options = {}) {
  if (!Number.isFinite(baseEdpi) || baseEdpi <= 0) {
    throw new Error('baseEdpi must be a positive number')
  }
  const span = options.span ?? INITIAL_SPAN
  const tolerance = options.tolerance ?? TOLERANCE
  const maxRounds = options.maxRounds ?? MAX_ROUNDS

  const lo = baseEdpi * (1 - span)
  const hi = baseEdpi * (1 + span)

  const state = {
    lo,
    hi,
    initialLo: lo,
    initialHi: hi,
    baseEdpi,
    tolerance,
    maxRounds,
    rounds: 0,
    // probe value -> { scores: number[], average }
    probes: new Map(),
    nextProbe: null,
    best: null,
    lastComparison: null,
  }

  reseed(state)
  return state
}

/**
 * The next eDPI the user should test, or null when converged.
 */
export function currentProbe(state) {
  if (isDone(state)) return null
  return state.nextProbe
}

/**
 * Submit one round's score for `edpi`. Returns the updated state.
 */
export function submit(state, edpi, score) {
  if (!Number.isFinite(score)) return state

  const key = Number(edpi)
  const entry = state.probes.get(key) ?? { scores: [], average: 0 }
  entry.scores.push(score)
  entry.average = entry.scores.reduce((a, b) => a + b, 0) / entry.scores.length
  state.probes.set(key, entry)

  if (!state.best || entry.average > state.best.score) {
    state.best = { edpi: key, score: entry.average }
  }

  // Both probes of the current bracket measured? Then shrink.
  const { x1, x2 } = bracketProbes(state)
  const left = lookup(state, x1)
  const right = lookup(state, x2)

  if (left && right) {
    // Never let a bracket shrink to nothing: if the two probes are closer than
    // PRECISION they are the same physical sensitivity and we are done.
    if (Math.abs(x2 - x1) <= PRECISION) {
      state.rounds = Math.max(state.rounds, 1)
      state.lo = Math.min(x1, x2)
      state.hi = Math.max(x1, x2)
      state.nextProbe = null
      return state
    }

    state.rounds += 1
    const leftBetter = left.average >= right.average
    state.lastComparison = {
      left: { edpi: left.key, score: left.average },
      right: { edpi: right.key, score: right.average },
      winner: leftBetter ? 'low' : 'high',
    }
    if (leftBetter) {
      state.hi = x2
    } else {
      state.lo = x1
    }
    reseed(state)
  } else {
    // Still missing the other probe — measure it next.
    state.nextProbe = left ? x2 : x1
  }

  if (isDone(state)) state.nextProbe = null
  return state
}

export function isDone(state) {
  const centre = (state.lo + state.hi) / 2
  if (!Number.isFinite(centre) || centre <= 0) return true
  if (state.rounds >= state.maxRounds) return true
  if (state.rounds === 0) return false
  return (state.hi - state.lo) / centre <= state.tolerance
}

/**
 * Converged recommendation. Prefers the best measured probe when it sits
 * inside the surviving bracket; otherwise falls back to the bracket centre.
 *
 * If the search ended pressed against an outer edge, the true peak may lie
 * beyond the range we were allowed to probe — flag it so the UI can say so
 * instead of silently presenting a local optimum as the answer.
 */
export function recommend(state) {
  const centre = (state.lo + state.hi) / 2
  const best = state.best
  const inside = best && best.edpi >= state.lo - PRECISION && best.edpi <= state.hi + PRECISION

  const centreEntry = findNear(state.probes, centre)

  let edpi = centre
  let score = centreEntry?.average ?? 0
  if (best && inside && best.score >= score) {
    edpi = best.edpi
    score = best.score
  }

  // A boundary optimum means the surviving bracket still touches an outer edge
  // we were never allowed to probe past: the true peak is likely beyond it.
  // Brackets that merely ended up near an interior point are normal for golden
  // section and must not trigger the warning.
  const edgeTol = state.baseEdpi * 0.005
  const touchingLow = Math.abs(state.lo - state.initialLo) <= edgeTol
  const touchingHigh = Math.abs(state.hi - state.initialHi) <= edgeTol

  return {
    edpi,
    score,
    lo: state.lo,
    hi: state.hi,
    bracketSpan: (state.hi - state.lo) / centre,
    rounds: state.rounds,
    convergedBy: state.rounds >= state.maxRounds ? 'max-rounds' : 'tolerance',
    boundaryWarning: touchingLow ? 'low' : touchingHigh ? 'high' : null,
    history: historyOf(state),
  }
}

export function historyOf(state) {
  return [...state.probes.entries()]
    .map(([edpi, entry]) => ({
      edpi,
      score: entry.average,
      trials: entry.scores.length,
    }))
    .sort((a, b) => a.edpi - b.edpi)
}

export function bracketProbes(state) {
  const span = state.hi - state.lo
  const x1 = state.hi - PHI * span
  const x2 = state.lo + PHI * span
  return { x1, x2 }
}

function reseed(state) {
  const { x1, x2 } = bracketProbes(state)
  const hasLeft = Boolean(lookup(state, x1))
  const hasRight = Boolean(lookup(state, x2))

  if (!hasLeft && !hasRight) {
    // Measure the narrow end first: the low probe is reused more often.
    state.nextProbe = x1
  } else if (hasLeft && hasRight) {
    state.nextProbe = null
  } else {
    state.nextProbe = hasLeft ? x2 : x1
  }
}

/**
 * Probe lookup with tolerance. Floating-point reseeding can drift a "new" probe
 * by ~1e-8 from the one already measured; exact Map hits would treat it as a
 * fresh point and the search would never advance.
 */
function lookup(state, value) {
  return findNear(state.probes, value)
}

export function findNear(map, value) {
  let found = null
  let bestKey = null
  let bestDelta = Infinity
  for (const [key, entry] of map) {
    const delta = Math.abs(key - value)
    if (delta < bestDelta) {
      bestDelta = delta
      bestKey = key
      found = entry
    }
  }
  // Anything further than PRECISION away is a different point, not a hit.
  if (bestDelta > PRECISION) return null
  return { ...found, key: bestKey }
}
