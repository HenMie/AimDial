import { describe, expect, it } from 'vitest'
import {
  PRO_ROSTER, nearestPros, edpiLandmarks, closestPro, ROSTER_SOURCE,
} from './pros.js'

describe('pro reference roster', () => {
  it('ships a usable roster with derived eDPI', () => {
    expect(PRO_ROSTER.length).toBeGreaterThan(500)
    for (const pro of PRO_ROSTER.slice(0, 50)) {
      expect(pro.dpi).toBeGreaterThan(0)
      expect(pro.sens).toBeGreaterThan(0)
      // eDPI is derived, never stored, so it cannot drift from the sourced pair.
      expect(pro.edpi).toBeCloseTo(pro.dpi * pro.sens, 6)
    }
    expect(ROSTER_SOURCE.url).toContain('valoranthub')
  })

  it('carries a country for every player', () => {
    // Country is part of the reference: it tells the player whose number they are
    // looking at, and a blank one would render a hole in the row.
    for (const pro of PRO_ROSTER) {
      expect(typeof pro.country).toBe('string')
      expect(pro.country.length).toBeGreaterThan(0)
      expect(pro.country).not.toMatch(/&#|&amp;|&quot;/)
    }
    expect(new Set(PRO_ROSTER.map((pro) => pro.country)).size).toBeGreaterThan(20)
  })

  it('ships crosshair codes that decode, and nothing else', () => {
    const withCode = PRO_ROSTER.filter((pro) => pro.crosshair)
    expect(withCode.length).toBeGreaterThan(400)
    expect(ROSTER_SOURCE.withCrosshair).toBe(withCode.length)
    for (const pro of withCode) {
      expect(pro.crosshair.startsWith('0')).toBe(true)
      // A stored code that cannot be drawn would be a blank glyph in the row.
      // Empty profiles ("0") are dropped by the capture, so nothing blank ships.
      expect(pro.crosshair).not.toBe('0')
      expect(pro.crosshairShape).not.toBeNull()
      expect(pro.crosshairShape.colourHex).toMatch(/^#[0-9a-f]{6}$/)
      expect(pro.crosshairShape.shape.length).toBeGreaterThan(0)
    }
    // Players without a code must not carry a shape either.
    for (const pro of PRO_ROSTER.filter((p) => !p.crosshair)) {
      expect(pro.crosshairShape).toBeNull()
    }
  })

  it('ships no malformed rows', () => {
    for (const pro of PRO_ROSTER) {
      expect(Number.isFinite(pro.edpi)).toBe(true)
      expect(pro.edpi).toBeGreaterThan(20)
      expect(pro.edpi).toBeLessThan(5000)
      expect(typeof pro.name).toBe('string')
      expect(pro.name.length).toBeGreaterThan(0)
    }
  })

  it('places the population where the source says it is', () => {
    // Independently measured from the same capture on 2026-11-07.
    const marks = edpiLandmarks()
    expect(marks.median).toBeGreaterThanOrEqual(230)
    expect(marks.median).toBeLessThanOrEqual(250)
    expect(marks.p25).toBeGreaterThanOrEqual(185)
    expect(marks.p25).toBeLessThanOrEqual(200)
    expect(marks.p75).toBeGreaterThanOrEqual(275)
    expect(marks.p75).toBeLessThanOrEqual(290)
  })

  it('returns the genuinely nearest players, not just any within tolerance', () => {
    const near = nearestPros(320, { limit: 5 })
    expect(near.length).toBeGreaterThan(0)
    // Every returned player must be within 12% of the target.
    for (const pro of near) expect(Math.abs(pro.edpi / 320 - 1)).toBeLessThan(0.13)
    // And nothing closer may have been skipped.
    const closest = PRO_ROSTER
      .map((pro) => ({ pro, d: Math.abs(Math.log(pro.edpi / 320)) }))
      .sort((a, b) => a.d - b.d)[0]
    expect(near[0].name).toBe(closest.pro.name)
  })

  it('ranks in multiplicative distance, not absolute eDPI', () => {
    // 240 vs 250 is the same perceptual gap as 480 vs 500, so a target at 480
    // must not be swamped by the far larger absolute spread at high eDPI.
    const near = nearestPros(480, { limit: 3 })
    for (const pro of near) expect(Math.abs(pro.edpi / 480 - 1)).toBeLessThan(0.13)
  })

  it('returns nothing rather than a misleading comparison when alone', () => {
    // 1200 eDPI is the roster maximum; nobody sits within 12% of an extreme.
    expect(nearestPros(5000, { limit: 5 })).toEqual([])
    expect(closestPro(30)).toBeNull()
    expect(nearestPros(NaN)).toEqual([])
    expect(nearestPros(0)).toEqual([])
  })

  it('respects the limit and sorts closest first', () => {
    const near = nearestPros(256, { limit: 3 })
    expect(near.length).toBeLessThanOrEqual(3)
    for (let i = 1; i < near.length; i += 1) {
      expect(near[i].distance).toBeGreaterThanOrEqual(near[i - 1].distance)
    }
  })

  it('keeps a wider tolerance available for callers that want it', () => {
    const narrow = nearestPros(300, { limit: 999, tolerance: 0.02 })
    const wide = nearestPros(300, { limit: 999, tolerance: 0.30 })
    expect(wide.length).toBeGreaterThan(narrow.length)
    // A tight tolerance must still only return genuinely close players.
    for (const pro of narrow) expect(Math.abs(pro.edpi / 300 - 1)).toBeLessThan(0.03)
  })
})
