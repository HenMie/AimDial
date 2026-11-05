import { describe, it, expect } from 'vitest'
import { summarize, meanOvershoot, MIN_TTK } from './scoring.js'

describe('scoring', () => {
  it('does not produce NaN with zero shots', () => {
    const s = summarize({ shots: 0, hits: 0, durationMs: 30_000 })
    expect(s.score).toBe(0)
    expect(s.accuracy).toBe(0)
    expect(s.ttk).toBeNull()
  })

  it('scores a clean fast run highly', () => {
    const s = summarize({ shots: 30, hits: 30, durationMs: 30_000 })
    expect(s.accuracy).toBe(1)
    expect(s.ttk).toBeCloseTo(1, 6)
    expect(s.score).toBeCloseTo(100, 6)
  })

  it('punishes accuracy quadratically', () => {
    // Same duration per kill, different accuracy: only the squared term differs.
    const halfAcc = summarize({ shots: 20, hits: 10, durationMs: 20_000 })
    const full = summarize({ shots: 20, hits: 20, durationMs: 20_000 })
    // Both have ttk = 1s and accuracy 0.5 / 1.0.
    expect(halfAcc.ttk).toBeCloseTo(2, 6)
    expect(full.ttk).toBeCloseTo(1, 6)
    // score = acc^2 * 100 / ttk => 0.25*50 = 12.5 vs 1*100 = 100
    expect(halfAcc.score).toBeCloseTo(12.5, 6)
    expect(full.score).toBeCloseTo(100, 6)
    expect(halfAcc.score / full.score).toBeCloseTo(0.125, 6)
  })

  it('caps the score through the TTK floor', () => {
    const s = summarize({ shots: 5, hits: 5, durationMs: 1 })
    expect(s.score).toBeCloseTo(100 / MIN_TTK, 6)
    expect(Number.isFinite(s.score)).toBe(true)
  })

  it('returns 0 when nothing was hit', () => {
    const s = summarize({ shots: 10, hits: 0, durationMs: 30_000 })
    expect(s.score).toBe(0)
    expect(s.ttk).toBeNull()
  })

  it('averages overshoot and ignores bad samples', () => {
    expect(meanOvershoot([{ delta: 2 }, { delta: -4 }, {}])).toBe(-1)
    expect(meanOvershoot([])).toBeNull()
  })
})
