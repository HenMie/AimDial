import { describe, it, expect } from 'vitest'
import {
  project,
  isHit,
  angularDistance,
  clampPitch,
  wrapAngle,
  targetRadiusPx,
  PITCH_LIMIT,
  MIN_TARGET_RADIUS_PX,
  MAX_TARGET_RADIUS_PX,
} from './aimModel.js'

const W = 1140
const H = 565
const CAM = { yaw: 0, pitch: 0 }

describe('aim projection', () => {
  it('puts a dead-ahead target exactly on the crosshair', () => {
    const p = project({ yaw: 0, pitch: 0 }, CAM, W, H)
    expect(p.x).toBeCloseTo(W / 2, 6)
    expect(p.y).toBeCloseTo(H / 2, 6)
  })

  it('projects a target to the right further right on screen', () => {
    const right = project({ yaw: 0.3, pitch: 0 }, CAM, W, H)
    const left = project({ yaw: -0.3, pitch: 0 }, CAM, W, H)
    expect(right.x).toBeGreaterThan(W / 2)
    expect(left.x).toBeLessThan(W / 2)
  })

  it('projects an upward target above the centre (smaller y)', () => {
    const up = project({ yaw: 0, pitch: 0.3 }, CAM, W, H)
    expect(up.y).toBeLessThan(H / 2)
  })

  it('returns null for a target behind the camera', () => {
    expect(project({ yaw: Math.PI, pitch: 0 }, CAM, W, H)).toBeNull()
  })

  it('is symmetric: equal angles either side give mirrored offsets', () => {
    const a = project({ yaw: 0.4, pitch: 0 }, CAM, W, H)
    const b = project({ yaw: -0.4, pitch: 0 }, CAM, W, H)
    expect(a.x - W / 2).toBeCloseTo(W / 2 - b.x, 6)
  })
})

describe('target radius', () => {
  it('keeps a constant on-screen size regardless of depth', () => {
    // Sixshot targets do not shrink with distance; the radius depends only on
    // canvas dimensions.
    const near = { yaw: 0.02, pitch: 0 }
    const far = { yaw: 0.6, pitch: 0.3 }
    const a = isHit(near, CAM, W, H).radius
    const b = isHit(far, CAM, W, H).radius
    expect(a).toBe(b)
  })

  it('scales with the canvas but stays within pixel bounds', () => {
    expect(targetRadiusPx(W, H)).toBeGreaterThan(targetRadiusPx(320, 180))
    expect(targetRadiusPx(4000, 4000)).toBe(MAX_TARGET_RADIUS_PX)
    expect(targetRadiusPx(100, 60)).toBe(MIN_TARGET_RADIUS_PX)
  })

  it('stays Sixshot-small', () => {
    // Sixshot targets are small: roughly a 20px ball at 1080p. At 565p that is
    // a radius in the mid single digits — nowhere near the old 14px floor.
    expect(targetRadiusPx(1140, 565)).toBeLessThanOrEqual(7)
    expect(targetRadiusPx(1140, 565)).toBeGreaterThanOrEqual(4)
    expect(targetRadiusPx(1920, 1080)).toBeLessThanOrEqual(12)
  })
})

describe('hit test', () => {
  it('hits a target under the crosshair', () => {
    expect(isHit({ yaw: 0, pitch: 0 }, CAM, W, H).hit).toBe(true)
  })

  it('hits a target just inside the pixel radius', () => {
    // Radius at this canvas is ~9px; 0.004 rad is well inside it.
    expect(isHit({ yaw: 0.004, pitch: 0 }, CAM, W, H).hit).toBe(true)
  })

  it('misses a target well outside the pixel radius', () => {
    expect(isHit({ yaw: 0.09, pitch: 0 }, CAM, W, H).hit).toBe(false)
  })

  it('never hits a target behind the camera', () => {
    expect(isHit({ yaw: Math.PI, pitch: 0 }, CAM, W, H).hit).toBe(false)
  })

  it('hit radius scales with canvas height', () => {
    const small = isHit({ yaw: 0.045, pitch: 0 }, CAM, W, 320)
    const large = isHit({ yaw: 0.045, pitch: 0 }, CAM, W, 1080)
    expect(large.radius).toBeGreaterThan(small.radius)
  })
})

describe('angles', () => {
  it('wraps yaw into [-pi, pi]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 6)
    expect(wrapAngle(-3 * Math.PI)).toBeCloseTo(-Math.PI, 6)
    expect(wrapAngle(0.5)).toBeCloseTo(0.5, 6)
  })

  it('clamps pitch to the vertical limit', () => {
    expect(clampPitch(9)).toBeCloseTo(PITCH_LIMIT, 6)
    expect(clampPitch(-9)).toBeCloseTo(-PITCH_LIMIT, 6)
    expect(clampPitch(0.1)).toBeCloseTo(0.1, 6)
  })

  it('measures angular distance roughly linearly at small angles', () => {
    const a = { yaw: 0, pitch: 0 }
    const b = { yaw: 0.1, pitch: 0 }
    expect(angularDistance(a, b)).toBeCloseTo(0.1, 3)
  })

  it('is zero for identical directions and max for opposite', () => {
    expect(angularDistance(CAM, CAM)).toBeCloseTo(0, 6)
    expect(angularDistance(CAM, { yaw: Math.PI, pitch: 0 })).toBeCloseTo(Math.PI, 5)
  })
})
