import { describe, expect, it } from 'vitest'
import { createSession, parseKills, recordKills, summarizeSession, undoLastRun, completeEarly } from './rangeCalibration.js'

const setup = { dpi: 1600, sens: 0.18 }
const enterPlan = (session, values) => values.reduce(recordKills, session)

describe('adaptive in-game range calibration', () => {
  it('starts from current sensitivity and symmetric multiplicative candidates', () => {
    const session = createSession(setup)
    expect(session.plan.schedule).toEqual([0.18, 0.144, 0.225])
    expect(session.plan.candidates).toEqual([0.144, 0.18, 0.225])
    expect(session.factors).toEqual([1.25, 1.12, 1.06])
  })

  it('validates kill counts without coercing unrelated values', () => {
    expect(parseKills('0')).toBe(0)
    expect(parseKills('30')).toBe(30)
    for (const value of ['', ' ', -1, 31, 1.5, 'abc', Infinity, null, undefined, true]) {
      expect(() => parseKills(value)).toThrow(RangeError)
    }
  })

  it('does not move on a noisy or weak initial comparison and narrows the factor', () => {
    const next = enterPlan(createSession(setup), [24, 24, 24])
    expect(next.done).toBe(false)
    expect(next.plan.phase).toBe('screen')
    expect(next.level).toBe(1)
    expect(next.incumbent).toBe(0.18)
    expect(next.plan.candidates).toEqual([0.161, 0.18, 0.202])
  })

  it('requires both ABBA comparisons and one average kill of gain before moving', () => {
    const screened = enterPlan(createSession(setup), [20, 24, 25])
    expect(screened.plan.phase).toBe('confirm')
    expect(screened.plan.schedule).toEqual([0.18, 0.225, 0.225, 0.18])
    const rejected = enterPlan(screened, [24, 26, 25, 25])
    expect(rejected.incumbent).toBe(0.18)
    expect(rejected.plan.phase).toBe('screen')
    expect(rejected.level).toBe(1)
    const accepted = enterPlan(screened, [24, 26, 27, 25])
    expect(accepted.incumbent).toBe(0.225)
    expect(accepted.plan.phase).toBe('screen')
    expect(accepted.plan.baseline).toBe(0.225)
  })

  it('can continue outward after a confirmed winner', () => {
    let session = enterPlan(createSession(setup), [20, 24, 25])
    session = enterPlan(session, [24, 26, 27, 25])
    expect(session.plan.candidates).toEqual([0.18, 0.225, 0.281])
    expect(session.plan.schedule).toEqual([0.225, 0.18, 0.281])
  })

  it('ends at fine local plateau and reports actual tested history', () => {
    let session = enterPlan(createSession(setup), [20, 24, 25])
    session = enterPlan(session, [24, 26, 27, 25])
    session = enterPlan(session, [26, 25, 25])
    expect(session.done).toBe(false)
    expect(session.level).toBe(1)
    session = enterPlan(session, [25, 25, 25])
    expect(session.done).toBe(false)
    session = enterPlan(session, [25, 25, 25])
    expect(session.done).toBe(true)
    const result = summarizeSession(session)
    expect(result.sensitivity).toBe(0.225)
    expect(result.reason).toBe('plateau')
    expect(result.history.length).toBeGreaterThan(2)
    expect(result.rounds).toBe(session.runs.length)
  })

  it('supports undo by rebuilding the dynamic plan', () => {
    const session = enterPlan(createSession(setup), [20, 24])
    const undone = undoLastRun(session)
    expect(undone.runs).toHaveLength(1)
    expect(undone.plan.schedule[undone.plan.cursor]).toBe(0.144)
  })

  it('keeps the confirmed incumbent when stopping early', () => {
    let session = enterPlan(createSession(setup), [20, 24, 25])
    session = enterPlan(session, [24, 26, 27, 25])
    const stopped = completeEarly(session)
    const result = summarizeSession(stopped)
    expect(result.sensitivity).toBe(0.225)
    expect(result.reason).toBe('manual')
    expect(() => completeEarly(createSession(setup))).toThrow(Error)
  })

  it('ignores old high scores when confirming a recent challenger', () => {
    const screened = enterPlan(createSession(setup), [27, 27, 29])
    const confirmed = enterPlan(screened, [18, 20, 20, 18])
    expect(confirmed.incumbent).toBe(0.225)
  })

  it('never promotes an unconfirmed high score on early finish', () => {
    const session = enterPlan(createSession(setup), [20, 19, 30, 20, 30])
    expect(summarizeSession(completeEarly(session)).sensitivity).toBe(0.18)
  })

  it('can confirm a lower sensitivity as well as a higher one', () => {
    const screened = enterPlan(createSession(setup), [20, 25, 19])
    expect(screened.plan.schedule).toEqual([0.18, 0.144, 0.144, 0.18])
    expect(enterPlan(screened, [20, 21, 21, 20]).incumbent).toBe(0.144)
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

  it('does not impose a fixed run cap and alternates confirmation order', () => {
    let session = createSession(setup)
    for (let iteration = 0; iteration < 4; iteration += 1) {
      const schedule = session.plan.schedule
      session = enterPlan(session, schedule.map((sens) => sens > session.incumbent ? 24 : 20))
      const expectedOrder = iteration % 2 === 0 ? [session.plan.baseline, session.plan.challenger, session.plan.challenger, session.plan.baseline]
        : [session.plan.challenger, session.plan.baseline, session.plan.baseline, session.plan.challenger]
      expect(session.plan.schedule).toEqual(expectedOrder)
      session = enterPlan(session, session.plan.schedule.map((sens) => sens === session.plan.challenger ? 24 : 20))
    }
    expect(session.runs.length).toBeGreaterThan(18)
    expect(session.done).toBe(false)
  })

  it('undoes a confirmation and restores the previous baseline without mutating the snapshot', () => {
    const screened = enterPlan(createSession(setup), [20, 19, 25])
    const original = structuredClone(screened)
    const confirmed = enterPlan(screened, [20, 23, 23, 20])
    const undone = undoLastRun(confirmed)
    expect(undone.incumbent).toBe(0.18)
    expect(undone.plan.phase).toBe('confirm')
    expect(undone.plan.cursor).toBe(3)
    expect(screened).toEqual(original)
  })
})
