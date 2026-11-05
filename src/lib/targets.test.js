import { describe, it, expect } from 'vitest'
import {
  buildField,
  spawnTarget,
  replaceTarget,
  boardExtents,
  boardAnchor,
  TARGETS_ON_FIELD,
  BOARD_HALF_YAW_DEG,
  BOARD_HALF_PITCH_DEG,
  MIN_TARGET_SEPARATION,
} from './targets.js'
import { wrapAngle, FOV_Y } from './aimModel.js'

const CAM = { yaw: 0, pitch: 0 }
const EXT = boardExtents(FOV_Y, 16 / 9)

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

describe('board extents', () => {
  it('matches the measured board size', () => {
    expect((EXT.yaw * 180) / Math.PI).toBeCloseTo(BOARD_HALF_YAW_DEG, 6)
    expect((EXT.pitch * 180) / Math.PI).toBeCloseTo(BOARD_HALF_PITCH_DEG, 6)
  })

  it('fits inside the visible frustum at the default FOV', () => {
    const halfY = FOV_Y / 2
    const halfX = Math.atan(Math.tan(halfY) * (16 / 9))
    expect(EXT.pitch).toBeLessThan(halfY)
    expect(EXT.yaw).toBeLessThan(halfX)
  })
})

describe('target field', () => {
  it('starts a round with six balls', () => {
    const field = buildField(CAM)
    expect(field).toHaveLength(TARGETS_ON_FIELD)
    expect(TARGETS_ON_FIELD).toBe(6)
  })

  it('keeps balls from overlapping each other', () => {
    const rand = mulberry32(7)
    for (let trial = 0; trial < 40; trial += 1) {
      const field = buildField(CAM, 6, rand, EXT)
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

  it('allows a ball right under the crosshair', () => {
    // The footage respawns on the aim point all the time, so there is no
    // keep-out zone around the crosshair: some ball must land within a couple
    // of degrees of it.
    const rand = mulberry32(3)
    let closest = Infinity
    for (let trial = 0; trial < 60; trial += 1) {
      for (const t of buildField(CAM, 6, rand, EXT)) {
        closest = Math.min(closest, Math.hypot(wrapAngle(t.yaw), t.pitch))
      }
    }
    expect(closest).toBeLessThan((2 * Math.PI) / 180)
  })

  it('keeps spawns on the board around the anchor', () => {
    const rand = mulberry32(3)
    for (let trial = 0; trial < 30; trial += 1) {
      for (const t of buildField(CAM, 6, rand, EXT)) {
        expect(Math.abs(wrapAngle(t.yaw - CAM.yaw))).toBeLessThanOrEqual(EXT.yaw + 1e-9)
        expect(Math.abs(t.pitch - CAM.pitch)).toBeLessThanOrEqual(EXT.pitch + 1e-9)
      }
    }
  })

  it('moves the board with the anchor it is given', () => {
    const cam = { yaw: 1.2, pitch: 0.3 }
    const t = spawnTarget(boardAnchor(cam), [], mulberry32(11), EXT)
    expect(Math.abs(wrapAngle(t.yaw - cam.yaw))).toBeLessThanOrEqual(EXT.yaw + 1e-9)
    expect(Math.abs(t.pitch - cam.pitch)).toBeLessThanOrEqual(EXT.pitch + 1e-9)
  })

  it('still returns a ball when the board is packed full', () => {
    const ring = Array.from({ length: 24 }, (_, i) => ({
      yaw: (i / 24) * Math.PI * 2,
      pitch: 0,
    }))
    const t = spawnTarget(CAM, ring, mulberry32(5), EXT)
    expect(t).toBeTypeOf('object')
    expect(Number.isFinite(t.yaw)).toBe(true)
    expect(Number.isFinite(t.pitch)).toBe(true)
  })
})

describe('replacing a killed target', () => {
  it('keeps the field at six after a kill', () => {
    const rand = mulberry32(21)
    const field = buildField(CAM, 6, rand, EXT)
    const next = replaceTarget(field, 2, boardAnchor(CAM), rand, EXT)
    expect(next).toHaveLength(6)
  })

  it('does not mutate the previous field', () => {
    const field = buildField(CAM, 6, mulberry32(31), EXT)
    const snapshot = field.map((t) => ({ ...t }))
    replaceTarget(field, 0, boardAnchor(CAM), mulberry32(32), EXT)
    expect(field).toEqual(snapshot)
  })

  it('removes the ball that was hit', () => {
    const field = buildField(CAM, 6, mulberry32(41), EXT)
    const victim = field[3]
    const next = replaceTarget(field, 3, boardAnchor(CAM), mulberry32(42), EXT)
    const stillThere = next.filter(
      (t) => Math.abs(t.yaw - victim.yaw) < 1e-12 && Math.abs(t.pitch - victim.pitch) < 1e-12,
    )
    expect(stillThere).toHaveLength(0)
  })

  it('respawns relative to the live view, not the round start', () => {
    // A flick to the right then a kill: the replacement belongs to the board
    // centred on the new aim direction, so it can sit outside the old board.
    const rand = mulberry32(51)
    const field = buildField(CAM, 6, rand, EXT)
    const turned = { yaw: 0.6, pitch: 0 }
    let sawFarSpawn = false
    for (let i = 0; i < 20; i += 1) {
      const next = replaceTarget(field, 0, boardAnchor(turned), rand, EXT)
      const fresh = next[next.length - 1]
      if (Math.abs(wrapAngle(fresh.yaw)) > EXT.yaw) sawFarSpawn = true
    }
    expect(sawFarSpawn).toBe(true)
  })

  it('can be applied repeatedly without shrinking the field', () => {
    const rand = mulberry32(71)
    let field = buildField(CAM, 6, rand, EXT)
    for (let i = 0; i < 50; i += 1) {
      field = replaceTarget(field, i % field.length, boardAnchor(CAM), rand, EXT)
      expect(field).toHaveLength(6)
    }
  })
})
