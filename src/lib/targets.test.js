import { describe, it, expect } from 'vitest'
import {
  buildField,
  spawnTarget,
  replaceTarget,
  spawnExtents,
  TARGETS_ON_FIELD,
  FIELD_ANCHOR,
  MIN_CROSSHAIR_OFFSET,
  MIN_TARGET_SEPARATION,
} from './targets.js'
import { wrapAngle, FOV_Y } from './aimModel.js'

const CAM = { yaw: 0, pitch: 0 }
const EXT = spawnExtents(FOV_Y, 16 / 9)

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

describe('spawn extents', () => {
  it('widens horizontally on a wider canvas', () => {
    const wide = spawnExtents(FOV_Y, 21 / 9)
    const square = spawnExtents(FOV_Y, 1)
    expect(wide.yaw).toBeGreaterThan(square.yaw)
    // Vertical extent depends only on the vertical FOV.
    expect(wide.pitch).toBeCloseTo(square.pitch, 12)
  })

  it('stays inside the visible frustum', () => {
    const halfY = FOV_Y / 2
    const halfX = Math.atan(Math.tan(halfY) * (16 / 9))
    expect(EXT.pitch).toBeLessThan(halfY)
    expect(EXT.yaw).toBeLessThan(halfX)
  })
})

describe('target field', () => {
  it('starts a round with six targets', () => {
    const field = buildField(CAM)
    expect(field).toHaveLength(TARGETS_ON_FIELD)
    expect(TARGETS_ON_FIELD).toBe(6)
  })

  it('keeps every target clear of the crosshair', () => {
    const rand = mulberry32(1)
    for (let trial = 0; trial < 40; trial += 1) {
      const field = buildField(CAM, 6, rand, EXT)
      for (const t of field) {
        const d = Math.hypot(t.yaw - CAM.yaw, t.pitch - CAM.pitch)
        expect(d).toBeGreaterThanOrEqual(MIN_CROSSHAIR_OFFSET - 1e-9)
      }
    }
  })

  it('keeps targets apart from each other', () => {
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

  it('keeps spawns inside the forward view', () => {
    const rand = mulberry32(3)
    const field = buildField(CAM, 6, rand, EXT)
    for (const t of field) {
      expect(Math.abs(wrapAngle(t.yaw - CAM.yaw))).toBeLessThanOrEqual(EXT.yaw + 1e-9)
    }
  })

  it('spawns around the anchor it is given', () => {
    const cam = { yaw: 1.2, pitch: 0.3 }
    const t = spawnTarget(cam, [], mulberry32(11), EXT)
    expect(Math.abs(wrapAngle(t.yaw - cam.yaw))).toBeLessThanOrEqual(EXT.yaw + 1e-9)
    expect(Math.abs(t.pitch - cam.pitch)).toBeLessThan(0.6)
  })

  it('keeps a field anchored in front of the player, never behind', () => {
    // Sixshot never asks for a turn: every respawn stays on the frontal plane
    // the round started on, whatever the view is doing.
    const rand = mulberry32(13)
    for (let trial = 0; trial < 30; trial += 1) {
      const field = buildField(FIELD_ANCHOR, 6, rand, EXT)
      for (const t of field) {
        expect(Math.abs(wrapAngle(t.yaw))).toBeLessThanOrEqual(EXT.yaw + 1e-9)
        expect(Math.abs(t.pitch)).toBeLessThanOrEqual(EXT.pitch + 1e-9)
        expect(Math.abs(t.yaw)).toBeLessThan(Math.PI / 2)
      }
      const next = replaceTarget(field, trial % 6, FIELD_ANCHOR, rand, EXT)
      for (const t of next) expect(Math.abs(wrapAngle(t.yaw))).toBeLessThan(Math.PI / 2)
    }
  })

  it('always returns a target even when the field is densely packed', () => {
    // Existing targets ring the camera, leaving little room.
    const ring = Array.from({ length: 24 }, (_, i) => ({
      yaw: (i / 24) * Math.PI * 2,
      pitch: 0,
    }))
    const t = spawnTarget(CAM, ring, mulberry32(5))
    expect(t).toBeTypeOf('object')
    expect(Number.isFinite(t.yaw)).toBe(true)
    expect(Number.isFinite(t.pitch)).toBe(true)
  })
})

describe('replacing a killed target', () => {
  it('keeps the field at six after a kill', () => {
    const rand = mulberry32(21)
    const field = buildField(CAM, 6, rand, EXT)
    const next = replaceTarget(field, 2, CAM, rand)
    expect(next).toHaveLength(6)
  })

  it('does not mutate the previous field', () => {
    const field = buildField(CAM, 6, mulberry32(31))
    const snapshot = field.map((t) => ({ ...t }))
    replaceTarget(field, 0, CAM, mulberry32(32))
    expect(field).toEqual(snapshot)
  })

  it('removes the target that was hit', () => {
    const field = buildField(CAM, 6, mulberry32(41))
    const victim = field[3]
    const next = replaceTarget(field, 3, CAM, mulberry32(42))
    const stillThere = next.filter(
      (t) => Math.abs(t.yaw - victim.yaw) < 1e-12 && Math.abs(t.pitch - victim.pitch) < 1e-12,
    )
    // A replacement could coincidentally land on the same spot only if the
    // generator returned it verbatim; it must not.
    expect(stillThere).toHaveLength(0)
  })

  it('can be applied repeatedly without shrinking the field', () => {
    const rand = mulberry32(51)
    let field = buildField(CAM, 6, rand, EXT)
    for (let i = 0; i < 50; i += 1) {
      field = replaceTarget(field, i % field.length, CAM, rand)
      expect(field).toHaveLength(6)
    }
  })
})
