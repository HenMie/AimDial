import { describe, it, expect } from 'vitest'
import {
  createSearch,
  currentProbe,
  submit,
  isDone,
  recommend,
  bracketProbes,
} from './goldenSearch.js'

// Known unimodal landscape: peak at the given eDPI, steep enough that the
// golden section can resolve it in a handful of rounds.
const peakAt = (peak) => (x) => -((x - peak) ** 2) / 100 + 100

function runSearch(base, peak = base * 1.05, noise = 0) {
  const f = peakAt(peak)
  let state = createSearch(base)
  let guard = 0
  while (!isDone(state) && guard++ < 100) {
    const probe = currentProbe(state)
    expect(probe).toBeTypeOf('number')
    const jitter = noise ? (Math.random() - 0.5) * noise : 0
    state = submit(state, probe, f(probe) + jitter)
  }
  return state
}

describe('golden search', () => {
  it('starts bracketed at base ±40%', () => {
    const s = createSearch(256)
    expect(s.lo).toBeCloseTo(153.6, 5)
    expect(s.hi).toBeCloseTo(358.4, 5)
    const { x1, x2 } = bracketProbes(s)
    expect(x1).toBeGreaterThan(s.lo)
    expect(x2).toBeLessThan(s.hi)
    // Interior probes sit at 1 - PHI and PHI of the bracket; their gap is
    // (2*PHI - 1) of the span, roughly 23.6%.
    expect(x2 - x1).toBeCloseTo((s.hi - s.lo) * (2 * 0.6180339887 - 1), 4)
  })

  it('converges near the peak of a known unimodal function', () => {
    const s = runSearch(500, 520)
    const rec = recommend(s)
    expect(Math.abs(rec.edpi - 520) / 520).toBeLessThan(0.05)
    expect(rec.rounds).toBeLessThanOrEqual(14)
    expect(isDone(s)).toBe(true)
    expect(rec.boundaryWarning).toBeNull()
  })

  it('tolerates moderate per-round noise', () => {
    // Noise well under the score gap between probes near convergence.
    const s = runSearch(500, 520, 3)
    const rec = recommend(s)
    expect(Math.abs(rec.edpi - 520) / 520).toBeLessThan(0.15)
  })

  it('never asks for the same probe twice in a row', () => {
    const f = peakAt(320)
    let s = createSearch(300)
    let last = null
    let guard = 0
    while (!isDone(s) && guard++ < 100) {
      const probe = currentProbe(s)
      expect(probe).not.toBe(last)
      last = probe
      s = submit(s, probe, f(probe))
    }
  })

  it('stops at max rounds even without meeting tolerance', () => {
    const f = peakAt(500)
    let s = createSearch(500, { tolerance: 1e-9, maxRounds: 4 })
    let guard = 0
    while (!isDone(s) && guard++ < 100) {
      const probe = currentProbe(s)
      const jitter = Math.random() * 2000
      s = submit(s, probe, f(probe) + jitter)
    }
    expect(s.rounds).toBe(4)
    expect(recommend(s).convergedBy).toBe('max-rounds')
  })

  it('drops a probe that resolves to the same point as the other', () => {
    // Tiny bracket: both probes land inside PRECISION of each other.
    let s = createSearch(300, { span: 0.0005 })
    let guard = 0
    while (!isDone(s) && guard++ < 20) {
      const probe = currentProbe(s)
      s = submit(s, probe, 1)
    }
    expect(isDone(s)).toBe(true)
    expect(currentProbe(s)).toBeNull()
    expect(s.rounds).toBeGreaterThan(0)
  })

  it('ignores non-finite scores', () => {
    let s = createSearch(256)
    const probe = currentProbe(s)
    s = submit(s, probe, NaN)
    expect(s.probes.size).toBe(0)
    expect(currentProbe(s)).toBe(probe)
  })

  it('averages repeated trials on the same probe', () => {
    let s = createSearch(256)
    const probe = currentProbe(s)
    s = submit(s, probe, 10)
    s = submit(s, probe, 20)
    expect(s.probes.get(probe).average).toBe(15)
    expect(s.probes.get(probe).scores).toHaveLength(2)
  })

  it('recommendation keeps the best probe when it survives the bracket', () => {
    const s = runSearch(500, 520)
    const rec = recommend(s)
    expect(rec.score).toBeGreaterThan(0)
    expect(rec.history.length).toBeGreaterThan(2)
    const best = Math.max(...rec.history.map((h) => h.score))
    expect(rec.score).toBeCloseTo(best, 5)
  })

  it('flags a boundary optimum instead of hiding it as a local peak', () => {
    // Peak outside the ±40% bracket: the search can only walk to the upper edge.
    const s = runSearch(200, 900)
    const rec = recommend(s)
    expect(rec.boundaryWarning).toBe('high')
    expect(rec.edpi).toBeGreaterThan(200 * 1.3)
  })

  it('rejects a bad base eDPI', () => {
    expect(() => createSearch(0)).toThrow()
    expect(() => createSearch(-1)).toThrow()
    expect(() => createSearch(NaN)).toThrow()
  })
})
