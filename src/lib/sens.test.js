import { describe, it, expect } from 'vitest'
import { resolveSetup, cm360, sensFromEdpi, round, DEFAULT_EDPI } from './sens.js'

describe('sens conversions', () => {
  it('defaults to the 256 eDPI tier when sensitivity is blank', () => {
    expect(resolveSetup(1600, '').sens).toBeCloseTo(0.16, 6)
    expect(resolveSetup(800, '').sens).toBeCloseTo(0.32, 6)
    expect(resolveSetup(400, '   ').sens).toBeCloseTo(0.64, 6)
    expect(resolveSetup(1600, '').edpi).toBeCloseTo(DEFAULT_EDPI, 6)
  })

  it('uses the given sensitivity and flags that it was not defaulted', () => {
    const r = resolveSetup(800, '0.5')
    expect(r.sens).toBeCloseTo(0.5, 6)
    expect(r.edpi).toBeCloseTo(400, 6)
    expect(r.sensWasDefaulted).toBe(false)
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
  })

  it('round-trips eDPI back to sensitivity', () => {
    for (const dpi of [400, 800, 1600, 3200]) {
      const { edpi } = resolveSetup(dpi, '')
      expect(sensFromEdpi(edpi, dpi) * dpi).toBeCloseTo(edpi, 6)
    }
  })

  it('formats numbers without exploding on bad input', () => {
    expect(round(1.2345, 2)).toBe(1.23)
    expect(round(NaN)).toBe('—')
    expect(round(Infinity)).toBe('—')
  })
})
