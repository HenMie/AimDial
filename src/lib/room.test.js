import { describe, it, expect } from 'vitest'
import {
  toCamera,
  projectCamera,
  projectSegment,
  projectPolygon,
  clipNear,
  focalFor,
  roomSurfaces,
  corners,
  ROOM,
  NEAR_Z,
} from './room.js'
import { project } from './aimModel.js'

const W = 1280
const H = 720
const FOCAL = focalFor(H)
const LEVEL = { yaw: 0, pitch: 0 }

describe('world to camera', () => {
  it('is the identity when the camera looks down +Z', () => {
    const p = toCamera({ x: 1, y: 2, z: 3 }, LEVEL)
    expect(p.x).toBeCloseTo(1, 12)
    expect(p.y).toBeCloseTo(2, 12)
    expect(p.z).toBeCloseTo(3, 12)
  })

  it('cancels a yaw that points straight at the target', () => {
    const yaw = 0.6
    const p = toCamera({ x: Math.sin(yaw), y: 0, z: Math.cos(yaw) }, { yaw, pitch: 0 })
    expect(p.x).toBeCloseTo(0, 12)
    expect(p.z).toBeCloseTo(1, 12)
  })

  it('agrees with the target projection in aimModel', () => {
    const target = { yaw: 0.5, pitch: 0.1 }
    const world = {
      x: Math.sin(target.yaw) * Math.cos(target.pitch),
      y: Math.sin(target.pitch),
      z: Math.cos(target.yaw) * Math.cos(target.pitch),
    }
    // Level camera: the two models are the same projection.
    const expected = project(target, LEVEL, W, H)
    const actual = projectCamera(toCamera(world, LEVEL), W, H, FOCAL)
    expect(actual.x).toBeCloseTo(expected.x, 6)
    expect(actual.y).toBeCloseTo(expected.y, 6)

    // Pitched camera: aimModel measures pitch from the horizon, the room uses a
    // true camera rotation. They diverge by a couple of pixels off-axis, which
    // is invisible at target size and keeps the room's perspective honest.
    const cam = { yaw: 0.35, pitch: -0.2 }
    const offset = projectCamera(toCamera(world, cam), W, H, FOCAL)
    const reference = project(target, cam, W, H)
    expect(Math.abs(offset.x - reference.x)).toBeLessThan(6)
    expect(Math.abs(offset.y - reference.y)).toBeLessThan(6)
  })
})

describe('near clipping', () => {
  it('keeps a polygon that is fully in front', () => {
    const poly = [
      { x: -1, y: -1, z: 2 },
      { x: 1, y: -1, z: 2 },
      { x: 1, y: 1, z: 2 },
    ]
    expect(clipNear(poly)).toHaveLength(3)
  })

  it('drops a polygon that is fully behind', () => {
    const poly = [
      { x: -1, y: -1, z: -2 },
      { x: 1, y: -1, z: -2 },
      { x: 1, y: 1, z: -2 },
    ]
    expect(clipNear(poly)).toHaveLength(0)
  })

  it('splits a straddling polygon along the near plane', () => {
    const poly = [
      { x: -1, y: 0, z: -1 },
      { x: 1, y: 0, z: 2 },
      { x: 1, y: 1, z: 2 },
      { x: -1, y: 1, z: -1 },
    ]
    const clipped = clipNear(poly)
    expect(clipped.length).toBeGreaterThanOrEqual(3)
    for (const p of clipped) expect(p.z).toBeGreaterThanOrEqual(NEAR_Z - 1e-9)
  })
})

describe('segment projection', () => {
  it('maps a dead-ahead point to the screen centre', () => {
    const seg = projectSegment(
      { x: 0, y: 0, z: ROOM.backZ },
      { x: 0, y: 0, z: ROOM.backZ },
      LEVEL,
      W,
      H,
      FOCAL,
    )
    expect(seg.x1).toBeCloseTo(W / 2, 6)
    expect(seg.y1).toBeCloseTo(H / 2, 6)
  })

  it('drops segments entirely behind the camera', () => {
    const seg = projectSegment({ x: -1, y: 0, z: -3 }, { x: 1, y: 0, z: -3 }, LEVEL, W, H, FOCAL)
    expect(seg).toBeNull()
  })

  it('clips rather than discards a segment that straddles the camera', () => {
    const seg = projectSegment({ x: 0, y: 0, z: -3 }, { x: 0, y: 0, z: 3 }, LEVEL, W, H, FOCAL)
    expect(seg).not.toBeNull()
    // The visible end stays put, the hidden end is pulled to the near plane.
    expect(seg.x2).toBeCloseTo(W / 2, 6)
    expect(Number.isFinite(seg.x1)).toBe(true)
    expect(Math.abs(seg.x1)).toBeLessThan(1e7)
  })

  it('keeps a level wall line level, and lets it converge when yawed', () => {
    const level = projectSegment(
      { x: -6, y: 1, z: ROOM.backZ },
      { x: 6, y: 1, z: ROOM.backZ },
      LEVEL,
      W,
      H,
      FOCAL,
    )
    expect(level.y1).toBeCloseTo(level.y2, 6)

    // With yaw the wall is oblique, so horizontal lines converge on the horizon.
    const turned = projectSegment(
      { x: -6, y: 1, z: ROOM.backZ },
      { x: 6, y: 1, z: ROOM.backZ },
      { yaw: 0.4, pitch: 0 },
      W,
      H,
      FOCAL,
    )
    expect(turned.y1).not.toBeCloseTo(turned.y2, 1)
    expect(Math.abs(turned.y1 - H / 2)).toBeGreaterThan(Math.abs(turned.y2 - H / 2))
  })

  it('never divides by less than the near plane', () => {
    const seg = projectSegment(
      { x: 0, y: 0, z: NEAR_Z - 0.001 },
      { x: 0, y: 0, z: NEAR_Z + 0.001 },
      LEVEL,
      W,
      H,
      FOCAL,
    )
    expect(Number.isFinite(seg.x1)).toBe(true)
    expect(Number.isFinite(seg.y2)).toBe(true)
  })
})

describe('room', () => {
  it('wraps the camera on every side', () => {
    const room = roomSurfaces()
    // Every wall must be visible from some yaw; together they cover 360°.
    expect(room.back.uLen).toBeCloseTo(ROOM.halfX * 2, 6)
    expect(room.floor.vLen).toBeCloseTo(ROOM.backZ - ROOM.frontZ, 6)
    expect(room.left.o.x).toBeCloseTo(-ROOM.halfX, 6)
    expect(room.right.o.x).toBeCloseTo(ROOM.halfX, 6)
  })

  it('projects the back wall to a quad around the view centre', () => {
    const poly = projectPolygon(corners(roomSurfaces().back), LEVEL, W, H, FOCAL)
    expect(poly).toHaveLength(4)
    const xs = poly.map((p) => p.x)
    expect(Math.min(...xs)).toBeLessThan(W / 2)
    expect(Math.max(...xs)).toBeGreaterThan(W / 2)
  })

  it('returns null for a surface entirely behind the camera', () => {
    const behind = [
      { x: -1, y: 0, z: -2 },
      { x: 1, y: 0, z: -2 },
      { x: 1, y: 1, z: -2 },
    ]
    expect(projectPolygon(behind, LEVEL, W, H, FOCAL)).toBeNull()
  })
})
