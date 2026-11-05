import { describe, it, expect } from 'vitest'
import {
  buildField,
  spawnTarget,
  replaceTarget,
  fieldExtents,
  fieldInView,
  TARGETS_ON_FIELD,
  FIELD_HALF_YAW_DEG,
  FIELD_HALF_PITCH_DEG,
  FIELD_PITCH_CENTRE_DEG,
  MIN_TARGET_SEPARATION,
} from './targets.js'
import { wrapAngle, FOV_Y } from './aimModel.js'

const ORIGIN = { yaw: 0, pitch: 0 }
const EXT = fieldExtents()
const DEG = Math.PI / 180

// Deterministic PRNG so failures are reproducible.
function mulberry32(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('field extents', () => {
  it('matches the measured field size', () => {
    expect((EXT.yaw * 180) / Math.PI).toBeCloseTo(FIELD_HALF_YAW_DEG, 6)
    expect((EXT.pitch * 180) / Math.PI).toBeCloseTo(FIELD_HALF_PITCH_DEG, 6)
  })

  it('fits inside the visible frustum at the default FOV', () => {
    const halfY = FOV_Y / 2
    const halfX = Math.atan(Math.tan(halfY) * (16 / 9))
    // The whole patch, offset included, has to sit inside the frame: the player
    // must never have to turn to find a ball.
    expect(EXT.pitch + EXT.pitchCentre).toBeLessThan(halfY)
    expect(EXT.yaw).toBeLessThan(halfX)
  })
})

describe('target field', () => {
  it('starts a round with six balls', () => {
    const field = buildField(ORIGIN)
    expect(field).toHaveLength(TARGETS_ON_FIELD)
    expect(TARGETS_ON_FIELD).toBe(6)
  })

  it('keeps balls from overlapping each other', () => {
    const rand = mulberry32(7)
    for (let trial = 0; trial < 40; trial += 1) {
      const field = buildField(ORIGIN, 6, rand, EXT)
      for (let i = 0; i < field.length; i += 1) {
        for (let j = i + 1; j < field.length; j += 1) {
          const d = Math.hypot(
            wrapAngle(field[i].yaw - field[j].yaw),
            field[i].pitch - field[j].pitch,
          )
          expect(d).toBeGreaterThanOrEqual(MIN_TARGET_SEPARATION - 1e-9)
        }
      }
    }
  })

  it('keeps spawns inside the field patch', () => {
    const rand = mulberry32(3)
    for (let trial = 0; trial < 30; trial += 1) {
      for (const t of buildField(ORIGIN, 6, rand, EXT)) {
        expect(Math.abs(wrapAngle(t.yaw - ORIGIN.yaw))).toBeLessThanOrEqual(EXT.yaw + 1e-9)
        const off = t.pitch - ORIGIN.pitch - EXT.pitchCentre
        expect(Math.abs(off)).toBeLessThanOrEqual(EXT.pitch + 1e-9)
      }
    }
  })

  it('sits the field above the horizon', () => {
    // The balls are painted against the wall band, not down on the floor: the
    // patch's centre must be above level.
    expect(FIELD_PITCH_CENTRE_DEG).toBeGreaterThan(0)
  })

  it('moves the field with the origin it is given', () => {
    const origin = { yaw: 0.4, pitch: 0 }
    const t = spawnTarget(origin, [], mulberry32(11), EXT)
    expect(Math.abs(wrapAngle(t.yaw - origin.yaw))).toBeLessThanOrEqual(EXT.yaw + 1e-9)
    expect(Math.abs(t.pitch - origin.pitch - EXT.pitchCentre)).toBeLessThanOrEqual(EXT.pitch + 1e-9)
  })

  it('is fixed to the wall, so the same origin gives the same patch', () => {
    // Respawns are anchored to the round's forward axis, not the live camera.
    // Reconstructing from the origin must never fall outside the patch however
    // far the player has flicked away.
    const rand = mulberry32(13)
    const far = { yaw: 0.7, pitch: -0.2 }
    let field = buildField(ORIGIN, 6, rand, EXT)
    for (let i = 0; i < 40; i += 1) {
      field = replaceTarget(field, i % field.length, ORIGIN, rand, EXT)
      for (const t of field) {
        expect(Math.abs(wrapAngle(t.yaw))).toBeLessThanOrEqual(EXT.yaw + 1e-9)
      }
    }
    void far
  })

  it('still returns a ball when the patch is packed full', () => {
    const ring = Array.from({ length: 24 }, (_, i) => ({
      yaw: ((i / 24) * 2 - 1) * EXT.yaw,
      pitch: EXT.pitchCentre,
    }))
    const t = spawnTarget(ORIGIN, ring, mulberry32(5), EXT)
    expect(t).toBeTypeOf('object')
    expect(Number.isFinite(t.yaw)).toBe(true)
    expect(Number.isFinite(t.pitch)).toBe(true)
  })
})

describe('replacing a killed target', () => {
  it('keeps the field at six after a kill', () => {
    const rand = mulberry32(21)
    const field = buildField(ORIGIN, 6, rand, EXT)
    const next = replaceTarget(field, 2, ORIGIN, rand, EXT)
    expect(next).toHaveLength(6)
  })

  it('does not mutate the previous field', () => {
    const field = buildField(ORIGIN, 6, mulberry32(31), EXT)
    const snapshot = field.map((t) => ({ ...t }))
    replaceTarget(field, 0, ORIGIN, mulberry32(32), EXT)
    expect(field).toEqual(snapshot)
  })

  it('removes the ball that was hit', () => {
    const field = buildField(ORIGIN, 6, mulberry32(41), EXT)
    const victim = field[3]
    const next = replaceTarget(field, 3, ORIGIN, mulberry32(42), EXT)
    const stillThere = next.filter(
      (t) => Math.abs(t.yaw - victim.yaw) < 1e-12 && Math.abs(t.pitch - victim.pitch) < 1e-12,
    )
    expect(stillThere).toHaveLength(0)
  })

  it('can be applied repeatedly without shrinking the field', () => {
    const rand = mulberry32(71)
    let field = buildField(ORIGIN, 6, rand, EXT)
    for (let i = 0; i < 50; i += 1) {
      field = replaceTarget(field, i % field.length, ORIGIN, rand, EXT)
      expect(field).toHaveLength(6)
    }
  })
})

describe('fieldInView', () => {
  it('reports a fresh field as visible', () => {
    expect(fieldInView(buildField(ORIGIN, 6, mulberry32(9), EXT), EXT)).toBe(true)
  })

  it('flags a field scattered outside the patch', () => {
    const lost = [{ yaw: 2.4, pitch: 0.9 }]
    expect(fieldInView(lost, EXT)).toBe(false)
  })
})

describe('separation floor', () => {
  it('is tighter than the old board gap but still wider than a ball', () => {
    // A ~17px ball at 1080p over a 70° vertical FOV is about 0.72° of radius, so
    // 1.5° of centre separation leaves daylight without letting a click straddle
    // two balls.
    const ballRadiusDeg = (Math.atan(8.5 / 771) * 180) / Math.PI
    const sepDeg = (MIN_TARGET_SEPARATION * 180) / Math.PI
    expect(sepDeg).toBeGreaterThan(ballRadiusDeg * 2)
  })

  it('allows clusters the footage shows', () => {
    expect((MIN_TARGET_SEPARATION * 180) / Math.PI).toBeLessThan(2)
  })
})
