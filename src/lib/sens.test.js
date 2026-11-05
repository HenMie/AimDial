import { describe, it, expect } from 'vitest'
import { resolveSetup, cm360, sensFromEdpi, degPerPointerUnit, round } from './sens.js'

describe('sens conversions', () => {
  it('requires a sensitivity rather than inventing one', () => {
    // The gain has to match the game's own number, or every probe is offset by
    // the same factor. An empty field is an error.
    for (const blank of ['', '   ', undefined, null]) {
      const r = resolveSetup(1600, blank)
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/灵敏度/)
    }
  })

  it('accepts a full profile and derives eDPI', () => {
    const r = resolveSetup(1600, '0.18')
    expect(r.ok).toBe(true)
    expect(r.sens).toBeCloseTo(0.18, 6)
    expect(r.edpi).toBeCloseTo(288, 6)
    expect(r.sensWasDefaulted).toBeUndefined()
  })

  it('rejects missing or non-positive DPI', () => {
    for (const dpi of [0, -5, '', 'abc']) {
      const r = resolveSetup(dpi, '0.3')
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/DPI/)
    }
  })

  it('rejects a non-positive explicit sensitivity', () => {
    expect(resolveSetup(800, '0').ok).toBe(false)
    expect(resolveSetup(800, '-1').ok).toBe(false)
  })

  it('computes cm/360 with the 0.07 yaw constant', () => {
    // 800 DPI @ 0.32 => 1/(0.32*0.07) = 44.64 counts per degree
    // 360° needs 16071.4 counts => 20.09 inch => 51.04 cm
    expect(cm360(800, 0.32)).toBeCloseTo(51.04, 1)
    // The user's real profile: 1600 DPI @ 0.18 => 45.36 cm
    expect(cm360(1600, 0.18)).toBeCloseTo(45.36, 1)
  })

  it('round-trips eDPI back to sensitivity', () => {
    for (const dpi of [400, 800, 1600, 3200]) {
      const sens = 256 / dpi
      expect(sensFromEdpi(dpi * sens, dpi) * dpi).toBeCloseTo(256, 6)
    }
  })

  it('formats numbers without exploding on bad input', () => {
    expect(round(1.2345, 2)).toBe(1.23)
    expect(round(NaN)).toBe('—')
    expect(round(Infinity)).toBe('—')
  })
})

describe('pointer gain', () => {
  it('is the game yaw constant and nothing else', () => {
    // Pointer Lock under unadjustedMovement reports raw device counts, the same
    // unit the game reads, so one count must turn exactly as far here as there.
    expect(degPerPointerUnit(0.18)).toBeCloseTo(0.07 * 0.18, 12)
    expect(degPerPointerUnit(0.32)).toBeCloseTo(0.07 * 0.32, 12)
  })

  it('turns exactly 360 degrees over the cm/360 distance', () => {
    // The end-to-end check: pushing the mouse `cm360` centimetres must rotate
    // the view one full turn. Counts for that distance are cm/2.54 * dpi, and
    // each count turns 0.07*sens, so the DPI terms cancel.
    for (const [dpi, sens] of [[1600, 0.18], [800, 0.32], [800, 0.5], [3200, 0.09]]) {
      const counts = (cm360(dpi, sens) / 2.54) * dpi
      expect(counts * degPerPointerUnit(sens)).toBeCloseTo(360, 6)
    }
  })

  it('matches the counts actually reported on the target machine', () => {
    // Measured: half a small mouse pad moved the 1600 DPI mouse ~125 mm and the
    // page reported 8330 units. Raw counts for that travel are 7874.
    const counts = (125 / 25.4) * 1600
    expect(counts).toBeCloseTo(7874, 0)
    expect(8330 / counts).toBeLessThan(1.1) // within 10%: it really is counts
    expect(8330 * degPerPointerUnit(0.18)).toBeCloseTo(104.96, 1) // deg over that move
  })

  it('carries no DPI or display-scaling term', () => {
    // Both were tried and both were wrong: *dpr is display scaling, and
    // *(dpi/96) treats a count as a CSS pixel. The signature takes only sens,
    // so neither can creep back in.
    expect(degPerPointerUnit.length).toBe(1)
  })

  it('survives bad input without producing NaN', () => {
    expect(degPerPointerUnit(0)).toBe(0)
    expect(degPerPointerUnit(-1)).toBe(0)
    expect(degPerPointerUnit(NaN)).toBe(0)
  })
})
