import { describe, expect, it } from 'vitest'
import {
  createSession, parseKills, recordKills, summarizeSession, undoLastRun, completeEarly,
  stepFactors, ladderAnchor, STEP_DELTAS, LADDER_ANCHOR, CONFIRM_PAIRS, CONFIRM_ROUNDS,
  discoverRungs, ladderFor, MODES, EDPI_FLOOR, EDPI_CEILING,
} from './rangeCalibration.js'

const setup = { dpi: 1600, sens: 0.18 }
const enterPlan = (session, values) => values.reduce(recordKills, session)

// One full interleaved repeat: alternates which setting opens each pair.
const confirmOrder = (base, challenger, opensWith = base) =>
  Array.from({ length: CONFIRM_PAIRS }).flatMap((_, pair) => {
    const opens = (pair % 2 === 0 ? opensWith : base === opensWith ? challenger : base)
    return [opens, opens === base ? challenger : base]
  })

describe('step ladder', () => {
  it('sets a step as a fixed cm/360 distance, not a fixed percentage', () => {
    // At 0.07 deg/count, cm/360 = 130.66 / eDPI, so a delta of `d` eDPI at the
    // anchor is the same number of centimetres whatever the player's eDPI is.
    const cmPer360 = (edpi) => 130.66 / edpi
    for (const anchor of [LADDER_ANCHOR, 120, 288, 640]) {
      const factors = stepFactors(anchor)
      factors.forEach((factor, index) => {
        const stepEdpi = anchor - anchor / factor
        expect(stepEdpi).toBeCloseTo(STEP_DELTAS[index], 6)
      })
      // Same absolute change in cm/360 means the fraction shrinks as eDPI rises.
      const lowest = cmPer360(anchor) - cmPer360(anchor + STEP_DELTAS[0])
      expect(lowest).toBeGreaterThan(0)
    }
  })

  it('produces a coarser step at low eDPI and a finer one at high eDPI', () => {
    const low = stepFactors(120)[0]
    const mid = stepFactors(LADDER_ANCHOR)[0]
    const high = stepFactors(640)[0]
    expect(low).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(high)
    // A 1.25x step at 640 eDPI would move 5.2 cm of 360; ours moves ~1.9 cm.
    expect(high).toBeLessThan(1.05)
    expect(low).toBeLessThan(1.25)
  })

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
    expect(() => stepFactors(NaN)).toThrow(RangeError)
  })

  it('keeps the anchor at the centre of the measured pro population', () => {
    // ValorantHub, 540 published pro setups, checked 2026-10-27:
    // eDPI p10 160, p25 192, median 240, mean 252, p75 280, p90 344.
    // The anchor sits at that centre; if the population moves, this fails and the
    // constant has to be re-measured rather than quietly drifting.
    expect(LADDER_ANCHOR).toBeGreaterThanOrEqual(220)
    expect(LADDER_ANCHOR).toBeLessThanOrEqual(280)
  })

  it('puts the first step inside a feelable hand movement for the pro band', () => {
    const CM_PER_360_PER_EDPI = 13062.86
    const cmPer360 = (edpi) => CM_PER_360_PER_EDPI / edpi
    const firstStepCm = (edpi) => {
      const factor = stepFactors(edpi)[0]
      return cmPer360(edpi) - cmPer360(edpi * factor)
    }
    // Across the interquartile range of real pros the first step stays within
    // roughly 3–7 cm of 360: big enough to notice, small enough to keep the grip.
    for (const edpi of [192, 240, 280, 344]) {
      expect(firstStepCm(edpi)).toBeGreaterThan(2)
      expect(firstStepCm(edpi)).toBeLessThan(8)
    }
    // The old fixed ×1.25 ladder would have asked 8–16 cm here, which is why it
    // was replaced. Guard the contrast so nobody reintroduces a flat ratio.
    const oldCm = cmPer360(240) - cmPer360(240 * 1.25)
    expect(oldCm).toBeGreaterThan(8)
    expect(firstStepCm(240)).toBeLessThan(oldCm / 1.5)
  })
})

describe('adaptive in-game range calibration', () => {
  it('starts from current sensitivity and symmetric multiplicative candidates', () => {
    const session = createSession(setup)
    expect(session.plan.schedule).toEqual([0.18, 0.167, 0.193])
    expect(session.plan.candidates).toEqual([0.167, 0.18, 0.193])
    expect(session.factors).toEqual(stepFactors(288))
    expect(session.pairs).toBe(CONFIRM_PAIRS)
  })

  it('calibrates the first step to the player eDPI', () => {
    // Same DPI, twice the sensitivity: the first bracket must be about half as wide.
    const wide = createSession({ dpi: 1600, sens: 0.18 })
    const tight = createSession({ dpi: 1600, sens: 0.36 })
    const spread = (session) =>
      (session.plan.candidates.at(-1) - session.plan.candidates[0]) / session.incumbent
    expect(spread(tight)).toBeLessThan(spread(wide) * 0.75)
  })

  it('validates kill counts without coercing unrelated values', () => {
    expect(parseKills('0')).toBe(0)
    expect(parseKills('30')).toBe(30)
    for (const value of ['', ' ', -1, 31, 1.5, 'abc', Infinity, null, undefined, true]) {
      expect(() => parseKills(value)).toThrow(RangeError)
    }
  })

  it('does not move on a noisy or weak initial comparison and narrows the factor', () => {
    const session = createSession(setup)
    const next = enterPlan(session, [24, 24, 24])
    expect(next.done).toBe(false)
    expect(next.plan.phase).toBe('screen')
    expect(next.level).toBe(1)
    expect(next.incumbent).toBe(0.18)
    // Next rung is half the eDPI distance of the first: 288-10, not 288-20.
    const expected = Number((0.18 * (288 / (288 - 10))).toFixed(3))
    expect(next.plan.candidates).toContain(expected)
  })

  it('runs the interleaved repeat as alternating pairs', () => {
    const screened = enterPlan(createSession(setup), [20, 24, 25])
    expect(screened.plan.phase).toBe('confirm')
    expect(screened.plan.challenger).toBe(0.193)
    expect(screened.plan.schedule).toEqual(confirmOrder(0.18, 0.193))
    // ABBA then BAAB: the opening setting flips every pair.
    expect(screened.plan.schedule).toEqual([0.18, 0.193, 0.193, 0.18, 0.18, 0.193])
    expect(screened.plan.schedule).toHaveLength(CONFIRM_ROUNDS)
    const base = screened.plan.schedule.filter((v) => v === 0.18).length
    expect(base).toBe(CONFIRM_PAIRS)
  })

  it('treats an accepted outside challenge in refine mode as a wrong starting point', () => {
    // In refine mode the player's value is the premise. If the outside rung wins a
    // full repeat, that premise is gone: the run stops and points at discovery
    // instead of walking the ladder a rung at a time.
    let session = enterPlan(createSession(setup), [20, 24, 25])
    const challenger = session.plan.challenger
    session = enterPlan(session, session.plan.schedule.map((sens) => (sens === challenger ? 26 : 20)))
    expect(session.incumbent).toBe(challenger)
    expect(session.done).toBe(true)
    expect(session.reason).toBe('runaway')
    expect(summarizeSession(session).message).toContain('第一次找灵敏度')
  })

  it('rejects a challenge that only wins some pairs, and narrows in place', () => {
    const screened = enterPlan(createSession(setup), [20, 24, 25])
    const challenger = screened.plan.challenger
    const losing = screened.plan.schedule.map((sens, index) => {
      if (sens !== challenger) return 20
      return index === 2 ? 18 : 28
    })
    const rejected = enterPlan(screened, losing)
    expect(rejected.incumbent).toBe(0.18)
    expect(rejected.plan.phase).toBe('screen')
    expect(rejected.level).toBe(1)
    expect(rejected.done).toBe(false)
  })

  it('ends at fine local plateau and reports actual tested history', () => {
    // A player whose value is the true optimum: every challenge fails, the ladder
    // narrows four times, then the run ends with their own value intact.
    let session = createSession(setup)
    let guard = 0
    while (!session.done && guard++ < 200) {
      session = enterPlan(session, session.plan.schedule.map((sens) => (sens === session.incumbent ? 26 : 22)))
    }
    expect(session.done).toBe(true)
    expect(session.incumbent).toBe(0.18)
    const result = summarizeSession(session)
    expect(result.sensitivity).toBe(0.18)
    expect(result.reason).toBe('plateau')
    expect(result.history.length).toBeGreaterThan(2)
    expect(result.rounds).toBe(session.runs.length)
  })

  it('supports undo by rebuilding the dynamic plan', () => {
    const session = enterPlan(createSession(setup), [20, 24])
    const undone = undoLastRun(session)
    expect(undone.runs).toHaveLength(1)
    expect(undone.plan.schedule[undone.plan.cursor]).toBe(0.167)
    expect(undone.pairs).toBe(session.pairs)
  })

  it('keeps the incumbent when stopping early mid-repeat', () => {
    const session = enterPlan(createSession(setup), [20, 24, 25])
    expect(session.plan.phase).toBe('confirm')
    const stopped = completeEarly(session)
    const result = summarizeSession(stopped)
    // The challenger led the screen but never finished its repeat, so it cannot win.
    expect(result.sensitivity).toBe(0.18)
    expect(result.reason).toBe('manual')
    expect(() => completeEarly(createSession(setup))).toThrow(Error)
  })

  it('ignores old high scores when confirming a recent challenger', () => {
    const screened = enterPlan(createSession(setup), [27, 27, 29])
    const challenger = screened.plan.challenger
    // Screen said 29; the repeat says the challenger is really worse.
    const confirmed = enterPlan(screened, screened.plan.schedule.map((sens) => (sens === challenger ? 18 : 22)))
    expect(confirmed.incumbent).toBe(0.18)
  })

  it('never promotes an unconfirmed high score on early finish', () => {
    const session = enterPlan(createSession(setup), [20, 19, 30])
    expect(session.plan.phase).toBe('confirm')
    expect(summarizeSession(completeEarly(session)).sensitivity).toBe(0.18)
  })

  it('can confirm a lower sensitivity as well as a higher one', () => {
    const screened = enterPlan(createSession(setup), [20, 25, 19])
    expect(screened.plan.challenger).toBe(0.167)
    expect(screened.plan.schedule).toEqual([0.18, 0.167, 0.167, 0.18, 0.18, 0.167])
    const challenger = screened.plan.challenger
    expect(enterPlan(screened, screened.plan.schedule.map((sens) => (sens === challenger ? 22 : 18))).incumbent)
      .toBe(0.167)
  })

  it.each([[30, 'ceiling'], [0, 'floor']])('explains why %s across all settings cannot distinguish them', (score, reason) => {
    const session = enterPlan(createSession(setup), [score, score, score])
    expect(session.done).toBe(true)
    expect(summarizeSession(session).reason).toBe(reason)
    expect(session.incumbent).toBe(0.18)
  })

  it('handles settings that round to the same game value', () => {
    const session = recordKills(createSession({ dpi: 800, sens: 0.001 }), 20)
    expect(session.reason).toBe('resolution')
    expect(summarizeSession(session).sensitivity).toBe(0.001)
  })

  it('does not impose a fixed run cap when the ladder keeps finding real wins', () => {
    // A player whose value improves monotonically: every challenge is rejected, so
    // no single fixed number of runs may end the search early.
    let session = createSession(setup)
    let guard = 0
    while (!session.done && guard++ < 200) {
      session = enterPlan(session, session.plan.schedule.map((sens) => (sens === session.incumbent ? 25 : 20)))
    }
    expect(session.runs.length).toBeGreaterThan(8)
    expect(session.reason).toBe('plateau')
  })

  it('undoes a confirmation and restores the previous baseline without mutating the snapshot', () => {
    const screened = enterPlan(createSession(setup), [20, 19, 25])
    const original = structuredClone(screened)
    const challenger = screened.plan.challenger
    const confirmed = enterPlan(screened, screened.plan.schedule.map((sens) => (sens === challenger ? 23 : 20)))
    const undone = undoLastRun(confirmed)
    expect(undone.incumbent).toBe(0.18)
    expect(undone.plan.phase).toBe('confirm')
    expect(undone.plan.cursor).toBe(screened.plan.schedule.length - 1)
    expect(screened).toEqual(original)
  })

  it('rejects an invalid repeat length', () => {
    expect(() => createSession(setup, { pairs: 0 })).toThrow(RangeError)
    expect(() => createSession(setup, { pairs: 1.5 })).toThrow(RangeError)
  })
})

describe('discovery mode', () => {
  it('offers exactly two modes and defaults to refining', () => {
    expect(Object.keys(MODES).sort()).toEqual(['discover', 'refine'])
    expect(createSession(setup).mode).toBe('refine')
    expect(createSession(setup, { mode: 'discover' }).mode).toBe('discover')
    expect(() => createSession(setup, { mode: 'nonsense' })).toThrow(RangeError)
  })

  it('starts from the population centre, not the player value', () => {
    // The player's own number is the thing in doubt, so it must not steer the sweep.
    const a = createSession({ dpi: 800, sens: 0.1 }, { mode: 'discover' })
    const b = createSession({ dpi: 800, sens: 0.9 }, { mode: 'discover' })
    expect(a.plan.schedule).toEqual(b.plan.schedule)
    expect(a.plan.phase).toBe('sweep')
    // Within one game-resolution step of the 250-eDPI centre.
    expect(a.plan.schedule[0] * 800).toBeCloseTo(250, 0)
  })

  it('does not require a starting sensitivity at all', () => {
    const session = createSession({ dpi: 1600 }, { mode: 'discover' })
    expect(session.plan.schedule.length).toBeGreaterThan(3)
    // A result from a discovery run must never claim a delta from a starting value.
    const early = summarizeSession(completeEarly(recordKills(session, 20)))
    expect(early.initialSensitivity).toBeNull()
  })

  it('sweeps outward on both sides of the centre', () => {
    const { centre, candidates } = discoverRungs(800)
    const above = candidates.filter((v) => v > centre)
    const below = candidates.filter((v) => v < centre)
    // Both sides must be covered, and cover the same number of rungs.
    expect(above.length).toBeGreaterThan(1)
    expect(below.length).toBeGreaterThan(1)
    expect(above.length).toBe(below.length)
    // Each side reaches roughly the same distance from the centre in eDPI terms.
    const topReach = Math.log((above.at(-1) * 800) / (centre * 800))
    const bottomReach = Math.log((centre * 800) / (below[0] * 800))
    expect(Math.abs(topReach - bottomReach)).toBeLessThan(0.15)
  })

  it('stays inside the range humans actually play at', () => {
    for (const dpi of [400, 800, 1600, 3200]) {
      for (const sens of discoverRungs(dpi).candidates) {
        const edpi = sens * dpi
        expect(edpi).toBeGreaterThanOrEqual(EDPI_FLOOR - 1)
        expect(edpi).toBeLessThanOrEqual(EDPI_CEILING + 1)
      }
    }
  })

  it('re-anchors the fine ladder on the sweep winner, not the centre', () => {
    const dpi = 800
    const score = (sens) => Math.round(16 + 9 * Math.exp(-0.5 * ((Math.log((sens * dpi) / 470) / 0.45) ** 2)))
    let session = createSession({ dpi }, { mode: 'discover' })
    while (session.plan.phase === 'sweep') {
      session = recordKills(session, score(session.plan.schedule[session.plan.cursor]))
    }
    expect(session.plan.phase).toBe('screen')
    // The winner is well above the 250 centre, so the ladder must have moved with it.
    expect(session.incumbent * dpi).toBeGreaterThan(380)
    expect(session.anchorEdpi).toBeCloseTo(250, 5)
    expect(session.factors).toEqual(stepFactors(session.incumbent * dpi))
  })

  it('finds a band anywhere in the range without a starting value', () => {
    const dpi = 800
    const sigma = 0.45
    const scoreAt = (opt) => (sens) =>
      Math.max(0, Math.min(30, Math.round(16 + 9 * Math.exp(-0.5 * (Math.log((sens * dpi) / opt) / sigma) ** 2))))
    for (const opt of [130, 250, 470, 620]) {
      const score = scoreAt(opt)
      let session = createSession({ dpi }, { mode: 'discover' })
      let guard = 0
      while (!session.done && guard++ < 300) {
        session = recordKills(session, score(session.plan.schedule[session.plan.cursor]))
      }
      const result = summarizeSession(session)
      expect(Math.abs(Math.log(result.edpi / opt))).toBeLessThan(Math.log(1.12))
      expect(result.rounds).toBeLessThan(30)
    }
  })
})

describe('refine mode stays local', () => {
  const dpi = 800

  it('keeps a value that is already near the optimum', () => {
    const score = (sens) => Math.round(16 + 9 * Math.exp(-0.5 * (Math.log((sens * dpi) / 250) / 0.45) ** 2))
    let session = createSession({ dpi, sens: 250 / dpi }, { mode: 'refine' })
    let guard = 0
    while (!session.done && guard++ < 300) {
      session = recordKills(session, score(session.plan.schedule[session.plan.cursor]))
    }
    const result = summarizeSession(session)
    expect(Math.abs(Math.log(result.edpi / 250))).toBeLessThan(Math.log(1.05))
    expect(result.reason).toBe('plateau')
    expect(result.rounds).toBeLessThan(20)
  })

  it('bails out instead of crawling when the starting value is far off', () => {
    // Optimum is 1.7x away: an accepted outside rung means the premise of this mode
    // is wrong, so it must stop early and point at discovery rather than walk across
    // the whole ladder three rounds at a time.
    const score = (sens) => Math.max(0, Math.min(30,
      Math.round(16 + 9 * Math.exp(-0.5 * (Math.log((sens * dpi) / 410) / 0.6) ** 2))))
    let session = createSession({ dpi, sens: 240 / dpi }, { mode: 'refine' })
    let guard = 0
    while (!session.done && guard++ < 300) {
      session = recordKills(session, score(session.plan.schedule[session.plan.cursor]))
    }
    expect(session.reason).toBe('runaway')
    expect(session.runs.length).toBeLessThan(15)
    expect(summarizeSession(session).message).toContain('第一次找灵敏度')
  })

  it('never returns a value outside the playable range', () => {
    for (const start of [100, 250, 500, 900]) {
      let session = createSession({ dpi, sens: start / dpi }, { mode: 'refine' })
      let guard = 0
      while (!session.done && guard++ < 300) {
        session = recordKills(session, 20)
      }
      const result = summarizeSession(session)
      expect(result.edpi).toBeGreaterThan(0)
      expect(Number.isFinite(result.edpi)).toBe(true)
    }
  })
})
