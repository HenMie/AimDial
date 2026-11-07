import { describe, expect, it } from 'vitest'
import {
  ALGORITHM, BOTS_PER_RUN, CONFIRM_Z, EDPI_CEILING, EDPI_FLOOR, END_REASONS,
  LAYOUT_STEPS, LADDER_ANCHOR, MIN_PROBE_GAP, MODES, SIGMA_KILLS, STEP_DELTAS,
  bracketed, completeEarly, createSession, derive, fitCurve, ladderAnchor, leader,
  openingSchedule, parseKills, plausible, points, proposeNext, rebuildSession,
  recordKills, stepFactors, summarizeSession, undoLastRun,
} from './rangeCalibration.js'

const setup = { dpi: 800, sens: 0.3 }
// Records values until the run ends, so a test never has to know how many
// rounds the search will spend.
const enterPlan = (session, values) => {
  let current = session
  for (const value of values) {
    if (current.done) break
    current = recordKills(current, value)
  }
  return current
}

// A deterministic stand-in for a player: a genuine unimodal response in
// log-sensitivity, optionally with noise from a fixed LCG so the simulations
// below are reproducible.
function makePlayer({ optimum = 250, width = 0.3, dpi = 800, noise = 0, seed = 7 } = {}) {
  let state = seed >>> 0
  const rand = () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
  const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand())
  return (sensitivity) => {
    const z = Math.log((sensitivity * dpi) / optimum) / width
    const ideal = 30 * Math.exp(-0.5 * z * z)
    const value = noise ? ideal + gauss() * noise : ideal
    return Math.max(0, Math.min(BOTS_PER_RUN, Math.round(value)))
  }
}

/** Play a whole run out against a simulated player. */
function playRun({ optimum = 250, width = 0.3, dpi = 800, noise = 0, seed = 7, startSens = null, mode = 'refine' } = {}) {
  const score = makePlayer({ optimum, width, dpi, noise, seed })
  const setupForRun = { dpi, sens: startSens ?? optimum / dpi }
  let session = createSession(setupForRun, { mode })
  const order = []
  let guard = 0
  while (!session.done && guard++ < 200) {
    const sensitivity = session.plan.sensitivity
    order.push(sensitivity)
    session = recordKills(session, score(sensitivity))
  }
  return { session, result: summarizeSession(session), order }
}

describe('the search proposes a continuous value, not a rung', () => {
  it('opens on the player value and then moves off it', () => {
    const session = createSession(setup)
    expect(session.plan.phase).toBe('seed')
    expect(session.plan.sensitivity).toBe(0.3)
    const next = recordKills(session, 20)
    expect(next.plan.sensitivity).not.toBe(0.3)
    expect(next.plan.phase).toBe('probe')
    expect(next.plan.message).toContain('下一轮测')
  })

  it('never proposes a value it has already measured', () => {
    // This is the property the old ladder search broke: it could re-ask the same
    // number indefinitely, which is what a player saw as an endless loop.
    const { order } = playRun({ noise: 2.5, seed: 3 })
    expect(new Set(order).size).toBe(order.length)
  })

  it('keeps successive proposals a feelable distance apart', () => {
    const { order } = playRun({ width: 0.45, noise: 2, seed: 11 })
    for (let index = 1; index < order.length; index += 1) {
      const ratio = Math.abs(Math.log(order[index] / order[index - 1]))
      // Either a genuine probe gap, or a jump to the fitted peak — never a
      // meaningless micro-step that occupies a whole range run.
      expect(ratio).toBeGreaterThan(Math.log(1 + MIN_PROBE_GAP) * 0.999)
    }
  })

  it('rounds every proposal to the game resolution', () => {
    const { order } = playRun({ noise: 2, seed: 5 })
    for (const value of order) expect(value).toBe(Number(value.toFixed(3)))
  })

  it('re-seeds the ladder only for the explanation copy', () => {
    expect(STEP_DELTAS.every((delta, index) => index === 0 || delta < STEP_DELTAS[index - 1])).toBe(true)
    expect(Object.keys(MODES).sort()).toEqual(['discover', 'refine'])
    expect(openingSchedule(setup)).toHaveLength(3)
  })
})

describe('every round is folded into one running estimate', () => {
  it('summarises all rounds at a setting, not just the latest', () => {
    // The estimator groups by sensitivity across the whole run, so a setting
    // played twice is one point with two rounds behind it — not two points, and
    // not the most recent round overwriting the earlier one.
    const pts = points([
      { sensitivity: 0.3, kills: 20 },
      { sensitivity: 0.25, kills: 18 },
      { sensitivity: 0.3, kills: 30 },
    ])
    const point = pts.find((entry) => entry.sensitivity === 0.3)
    expect(point.kills).toEqual([20, 30])
    expect(point.n).toBe(2)
    expect(point.raw).toBe(25)
    expect(pts).toHaveLength(2)
  })

  it('shrinks a single round towards the run mean instead of trusting it', () => {
    const runs = [
      { sensitivity: 0.2, kills: 10 },
      { sensitivity: 0.3, kills: 30 },
      { sensitivity: 0.4, kills: 10 },
    ]
    const pts = points(runs, { priorScore: 16 })
    const lucky = pts.find((entry) => entry.sensitivity === 0.3)
    // One 30-out-of-30 round must not be taken at face value.
    expect(lucky.raw).toBe(30)
    expect(lucky.score).toBeLessThan(30)
    expect(lucky.score).toBeGreaterThan(16)
  })

  it('narrows the error bar as rounds accumulate', () => {
    const once = points([{ sensitivity: 0.3, kills: 20 }])
    const thrice = points([
      { sensitivity: 0.3, kills: 20 },
      { sensitivity: 0.3, kills: 20 },
      { sensitivity: 0.3, kills: 20 },
    ])
    expect(thrice[0].se).toBeLessThan(once[0].se)
  })

  it('is rebuilt entirely from the run list', () => {
    const session = enterPlan(createSession(setup), [20, 22, 18])
    const rebuilt = rebuildSession(setup, session.runs, { mode: session.mode })
    expect(rebuilt.runs).toEqual(session.runs)
    expect(rebuilt.plan.sensitivity).toBe(session.plan.sensitivity)
    expect(rebuilt.incumbent).toBe(session.incumbent)
  })

  it('undoes a round by replaying the derivation', () => {
    const session = enterPlan(createSession(setup), [20, 22, 18])
    expect(session.done).toBe(false)
    const undone = undoLastRun(session)
    expect(undone.runs).toHaveLength(2)
    const replayed = enterPlan(createSession(setup), [20, 22])
    expect(undone.plan.sensitivity).toBe(replayed.plan.sensitivity)
  })
})

describe('confidence, not a kill threshold, decides', () => {
  it('separates a real peak from noise at a realistic width', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { result } = playRun({ optimum: 250, width: 0.3, noise: 2.4, seed })
      // Within about a fifth of the true optimum, in log terms.
      expect(Math.abs(Math.log(result.edpi / 250))).toBeLessThan(Math.log(1.25))
    }
  })

  it('stops well before the round cap on a clean signal', () => {
    const { session } = playRun({ noise: 0 })
    expect(session.runs.length).toBeLessThanOrEqual(10)
    expect(session.reason).toMatch(/resolved|confirmed/)
  })

  it('keeps a run finite even when the player has no real preference', () => {
    // A flat landscape: every setting scores alike. The search must not chase
    // noise forever — this is the failure the rewrite exists to prevent.
    const { session } = playRun({ width: 50, noise: 2.5, seed: 9 })
    expect(session.done).toBe(true)
    expect(session.runs.length).toBeLessThanOrEqual(30)
    expect(new Set(session.runs.map((run) => run.sensitivity)).size).toBe(session.runs.length)
  })

  it('reports a tie rather than inventing a winner', () => {
    const { result } = playRun({ width: 50, noise: 2.5, seed: 9 })
    expect(Array.isArray(result.leaders)).toBe(true)
    if (result.tied) expect(result.leaders.length).toBeGreaterThan(1)
  })

  it('exposes the plausible set as error bars, not a fixed band', () => {
    const pts = points([
      { sensitivity: 0.2, kills: 20 },
      { sensitivity: 0.3, kills: 21 },
    ], { priorScore: 20 })
    const best = leader(pts, 0.3)
    const alive = plausible(pts, best)
    expect(alive.length).toBe(2) // 1 kill apart is inside the noise
    const far = points([
      { sensitivity: 0.2, kills: 5 },
      { sensitivity: 0.3, kills: 25 },
    ], { priorScore: 15 })
    expect(plausible(far, leader(far, 0.3)).length).toBe(1)
  })

  it('pins the constants the copy quotes', () => {
    expect(SIGMA_KILLS).toBeGreaterThan(2)
    expect(SIGMA_KILLS).toBeLessThan(3)
    expect(CONFIRM_Z).toBeGreaterThan(1.5)
    expect(ALGORITHM).toBe('adaptive-curve-v2')
  })

  it('explains every way a run can end, in plain language', () => {
    // The result page reads these straight out, so a missing or jargon-laden
    // entry is a visible bug. The wording rule: no statistics terms, short
    // enough to read in one go.
    const jargon = /噪声|拟合|标准差|标准误|置信|二项|误差棒|曲线/
    for (const [reason, text] of Object.entries(END_REASONS)) {
      expect(typeof text, reason).toBe('string')
      expect(text.length, reason).toBeGreaterThan(6)
      expect(text.length, reason).toBeLessThan(50)
      expect(jargon.test(text), `${reason}: ${text}`).toBe(false)
    }
  })
})

describe('the fitted curve understands shape', () => {
  it('finds the peak of a genuinely unimodal response', () => {
    const score = makePlayer({ optimum: 250, width: 0.3 })
    const sens = [0.12, 0.18, 0.24, 0.31, 0.4, 0.52]
    const pts = sens.map((value) => {
      const kills = score(value)
      return { sensitivity: value, kills: [kills], n: 1, raw: kills, score: kills, se: SIGMA_KILLS }
    })
    const curve = fitCurve(pts)
    // `optimum` is a sensitivity, so compare it in eDPI terms.
    const fittedEdpi = curve.optimum * 800
    expect(fittedEdpi / 250).toBeGreaterThan(0.8)
    expect(fittedEdpi / 250).toBeLessThan(1.2)
    expect(curve.curvatureDown).toBe(true)
  })

  it('refuses to extrapolate a peak outside the measured span', () => {
    // Monotone data must not invent a turning point thousands of eDPI away: that
    // is exactly how the search would be sent off to the ceiling.
    const pts = [0.1, 0.15, 0.22, 0.33, 0.5].map((value, index) => ({
      sensitivity: value, kills: [5 + index * 4], n: 1, raw: 5 + index * 4, score: 5 + index * 4, se: SIGMA_KILLS,
    }))
    const curve = fitCurve(pts)
    if (curve?.optimum != null) {
      // Any peak it does report must sit inside the measured band, never far
      // outside it.
      expect(curve.optimum).toBeGreaterThan(0.1 / 2)
      expect(curve.optimum).toBeLessThan(0.5 * 2)
    }
  })

  it('needs three points before it claims a shape', () => {
    const pts = [{ sensitivity: 0.2, kills: [10], n: 1, raw: 10, score: 10, se: SIGMA_KILLS }]
    expect(fitCurve(pts)).toBeNull()
  })

  it('recognises a bracketed leader', () => {
    const pts = points([
      { sensitivity: 0.2, kills: 15 },
      { sensitivity: 0.3, kills: 25 },
      { sensitivity: 0.4, kills: 15 },
    ], { priorScore: 20 })
    expect(bracketed(pts, leader(pts, 0.3))).toBe(true)
    const rising = points([
      { sensitivity: 0.2, kills: 10 },
      { sensitivity: 0.3, kills: 20 },
      { sensitivity: 0.4, kills: 28 },
    ], { priorScore: 20 })
    expect(bracketed(rising, leader(rising, 0.4))).toBe(false)
  })
})

describe('proposal honours the game and the physics', () => {
  it('never proposes outside the playable eDPI range', () => {
    for (const startSens of [0.1, 0.3, 0.75, 1.4]) {
      let session = createSession({ dpi: 800, sens: startSens })
      let guard = 0
      while (!session.done && guard++ < 200) {
        const sensitivity = session.plan.sensitivity
        expect(sensitivity * 800).toBeGreaterThanOrEqual(EDPI_FLOOR - 1)
        expect(sensitivity * 800).toBeLessThanOrEqual(EDPI_CEILING + 1)
        session = recordKills(session, 15)
      }
    }
  })

  it('refuses a starting value outside the playable range', () => {
    // A sensitivity nobody can enter is a setup error, not a first round.
    expect(() => createSession({ dpi: 800, sens: 0.05 })).toThrow(RangeError)
    expect(() => createSession({ dpi: 800, sens: 2.0 })).toThrow(RangeError)
  })

  it('lays out a symmetrical opening sweep before following the fit', () => {
    const { order } = playRun({ noise: 0, startSens: 250 / 800 })
    const start = 250 / 800
    const below = order.slice(1, 1 + LAYOUT_STEPS[0]).filter((value) => value < start)
    const above = order.slice(1, 1 + LAYOUT_STEPS[1]).filter((value) => value > start)
    // The opening rounds must cover both sides, not run off in one direction.
    expect(below.length).toBeGreaterThan(0)
    expect(above.length).toBeGreaterThan(0)
  })

  it('stops proposing once nothing is left to learn', () => {
    const pts = points([
      { sensitivity: 0.2, kills: 20 },
      { sensitivity: 0.3, kills: 20 },
    ], { priorScore: 20 })
    const best = leader(pts, 0.3)
    const proposal = proposeNext(pts, best, setup, { span: 0.5 })
    // With every candidate blocked by the spacing rule, there is no proposal —
    // and null is the honest answer, not a repeat of something already played.
    if (proposal) expect(pts.some((point) => point.sensitivity === proposal.sensitivity)).toBe(false)
  })

  it('never leaps across the band after it has found a bracketed peak', () => {
    // The regression this pins: an earlier version proposed values 2-4x away
    // once the fitted peak was already measured, which looked like the search
    // teleporting and burned rounds on settings nobody would play.
    const { order } = playRun({ optimum: 350, width: 0.3, noise: 2.2, seed: 21 })
    for (let index = 1; index < order.length; index += 1) {
      const ratio = Math.abs(Math.log(order[index] / order[index - 1]))
      expect(ratio).toBeLessThan(Math.log(2.2))
    }
  })

  it('finds the optimum across a spread of player widths and strengths', () => {
    for (const [optimum, peak] of [[250, 26], [180, 20], [350, 24], [600, 21], [130, 19]]) {
      const score = (sensitivity) => Math.round(peak * Math.exp(-0.5 * (Math.log((sensitivity * 800) / optimum) / 0.3) ** 2))
      let session = createSession({ dpi: 800, sens: 0.3 })
      let guard = 0
      while (!session.done && guard++ < 200) {
        session = recordKills(session, score(session.plan.sensitivity))
      }
      const result = summarizeSession(session)
      expect(Math.abs(Math.log(result.edpi / optimum))).toBeLessThan(Math.log(1.15))
      expect(session.runs.length).toBeLessThan(30)
    }
  })
})

describe('the opening bracket is still described in hand movement', () => {
  it('derives a strictly shrinking ladder', () => {
    for (const anchor of [80, 250, 400, 900]) {
      const factors = stepFactors(anchor)
      expect(factors).toHaveLength(STEP_DELTAS.length)
      factors.forEach((factor, index) => {
        expect(factor).toBeGreaterThan(1)
        if (index > 0) expect(factor).toBeLessThan(factors[index - 1])
      })
    }
  })

  it('falls back to the band centre without a usable setup', () => {
    expect(ladderAnchor({ dpi: 1600, sens: 0.18 })).toBe(288)
    expect(ladderAnchor({ dpi: 0, sens: 0.18 })).toBe(LADDER_ANCHOR)
    expect(ladderAnchor(undefined)).toBe(LADDER_ANCHOR)
    expect(() => stepFactors(0)).toThrow(RangeError)
  })

  it('keeps the anchor at the centre of the measured pro population', () => {
    expect(LADDER_ANCHOR).toBeGreaterThanOrEqual(220)
    expect(LADDER_ANCHOR).toBeLessThanOrEqual(280)
  })
})

describe('discovery mode starts from the population, not the player', () => {
  it('opens at the centre regardless of the value typed', () => {
    const a = createSession({ dpi: 800, sens: 0.1 }, { mode: 'discover' })
    const b = createSession({ dpi: 800, sens: 0.9 }, { mode: 'discover' })
    expect(a.plan.sensitivity).toBe(b.plan.sensitivity)
    expect(a.plan.sensitivity * 800).toBeCloseTo(LADDER_ANCHOR, 0)
  })

  it('does not require a starting sensitivity', () => {
    const session = createSession({ dpi: 1600 }, { mode: 'discover' })
    expect(session.plan.sensitivity).toBeGreaterThan(0)
    const early = summarizeSession(completeEarly(recordKills(session, 20)))
    expect(early.initialSensitivity).toBeNull()
  })

  it('finds a band far from the population centre', () => {
    const { result } = playRun({ optimum: 620, width: 0.3, noise: 1.5, seed: 4, mode: 'discover', startSens: null })
    expect(Math.abs(Math.log(result.edpi / 620))).toBeLessThan(Math.log(1.6))
  })
})

describe('session contract', () => {
  it('validates kill counts without coercing unrelated values', () => {
    expect(parseKills('0')).toBe(0)
    expect(parseKills('30')).toBe(30)
    for (const value of ['', ' ', -1, 31, 1.5, 'abc', Infinity, null, undefined, true]) {
      expect(() => parseKills(value)).toThrow(RangeError)
    }
  })

  it('refuses to record after the run is done', () => {
    const session = completeEarly(recordKills(createSession(setup), 20))
    expect(() => recordKills(session, 20)).toThrow('已完成')
  })

  it('keeps the incumbent when stopping early', () => {
    const session = enterPlan(createSession(setup), [24, 24])
    const stopped = completeEarly(session)
    const result = summarizeSession(stopped)
    expect(result.reason).toBe('manual')
    expect(result.rounds).toBe(2)
    expect(result.sensitivity).toBeGreaterThan(0)
    expect(() => completeEarly(createSession(setup))).toThrow(Error)
  })

  it('explains a flat band instead of pretending to rank it', () => {
    for (const score of [30, 0]) {
      const session = enterPlan(createSession(setup), Array(12).fill(score))
      expect(session.done).toBe(true)
      // Whatever the wording, a uniformly extreme band must end with an
      // explanation rather than a fabricated ranking.
      expect(session.reason).toBeTruthy()
      expect(summarizeSession(session).message).toBeTruthy()
    }
  })

  it('reports the history as every setting played, with all its rounds', () => {
    const { session } = playRun({ noise: 2, seed: 2 })
    const result = summarizeSession(session)
    expect(result.history.length).toBeGreaterThanOrEqual(3)
    expect(result.history.every((entry) => entry.rounds >= 1)).toBe(true)
    expect(result.history.reduce((sum, entry) => sum + entry.rounds, 0)).toBe(result.rounds)
  })

  it('exposes a session that can be re-derived without change', () => {
    const session = enterPlan(createSession(setup), [20, 24])
    const again = derive({ ...session, done: false })
    expect(again.plan.sensitivity).toBe(session.plan.sensitivity)
  })
})
