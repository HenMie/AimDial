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
  PROPS,
  WALL_BANDS,
  NEAR_Z,
} from './room.js'
import { project, YAW_LIMIT, PITCH_LIMIT, FOV_Y } from './aimModel.js'
import { FIELD_HALF_YAW_DEG, FIELD_HALF_PITCH_DEG, FIELD_PITCH_CENTRE_DEG } from './targets.js'

const W = 1280
const H = 720
const FOCAL = focalFor(H)
const LEVEL = { yaw: 0, pitch: 0 }
const DEG = Math.PI / 180

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

describe('room proportions', () => {
  // The ceiling and floor have to land inside the frame. An earlier build put
  // the ceiling at y=9, which is 48° up — past the 35° half-screen — so the roof
  // never appeared and the range read as one flat wall. These assertions are what
  // stop that from silently coming back.
  const halfScreenDeg = (Math.atan(H / 2 / FOCAL) * 180) / Math.PI
  const angleDeg = (y) => (Math.atan(Math.abs(y) / ROOM.backZ) * 180) / Math.PI

  it('keeps the ceiling inside the top of the frame', () => {
    expect(angleDeg(ROOM.ceilY)).toBeLessThan(halfScreenDeg)
    // And high enough to read as a ceiling rather than a low overhang: the wall
    // should still carry the bulk of the frame, so the ceiling takes at most the
    // top third or so.
    expect(angleDeg(ROOM.ceilY)).toBeGreaterThan(halfScreenDeg * 0.45)
  })

  it('keeps the floor line above the bottom of the frame', () => {
    // The floor meets the back wall at about 27.7° down, inside the 35° half
    // screen: the seam is visible and the floor fills the strip below it.
    expect(angleDeg(ROOM.floorY)).toBeLessThan(halfScreenDeg)
    expect(angleDeg(ROOM.floorY)).toBeGreaterThan(halfScreenDeg * 0.6)
  })

  it('lets the wall dominate the frame over the ceiling', () => {
    // The range is a shooting gallery, not a hall: the wall the targets sit on
    // should be the largest surface on screen, with the ceiling a band above it.
    // Wall height on screen is everything between the ceiling seam and the
    // floor seam, i.e. from angleDeg(ceilY) up to angleDeg(floorY) down.
    const ceilingDeg = angleDeg(ROOM.ceilY)
    const wallDeg = ceilingDeg + angleDeg(ROOM.floorY)
    expect(wallDeg).toBeGreaterThan(ceilingDeg * 2)
  })

  it('leaves pitch headroom above the field', () => {
    // The view may pitch up PITCH_LIMIT with a ball at the top of the field.
    const needed =
      (PITCH_LIMIT * 180) / Math.PI + FIELD_HALF_PITCH_DEG + FIELD_PITCH_CENTRE_DEG
    expect(angleDeg(ROOM.ceilY)).toBeGreaterThan(needed)
  })

  it('puts the wall seam below eye level, inside the frame', () => {
    const seamDeg = (Math.atan(WALL_BANDS.upper[0] / ROOM.backZ) * 180) / Math.PI
    expect(seamDeg).toBeLessThan(0)
    expect(Math.abs(seamDeg)).toBeLessThan(halfScreenDeg)
  })
})

describe('props stay clear of the target field', () => {
  it('no corner block faces the patch the field can occupy', () => {
    // The real requirement: a ball must never be occluded by a block. A ball can
    // land anywhere in [±FIELD_HALF_YAW, centre ± FIELD_HALF_PITCH], and the view
    // may be turned, so the reachable band on the back wall is the field patch
    // plus the whole yaw/pitch swing. Blocks live at the corner, outside it.
    const yawReachDeg = ((YAW_LIMIT + FIELD_HALF_YAW_DEG * DEG) * 180) / Math.PI
    const pitchTopDeg = FIELD_PITCH_CENTRE_DEG + FIELD_HALF_PITCH_DEG

    for (const b of PROPS.cornerBlocks) {
      // Nearest edge of the block, in wall angles.
      const blockYawDeg = (Math.atan(Math.abs(b.min.x) / ROOM.backZ) * 180) / Math.PI
      const blockTopDeg = (Math.atan(b.max.y / ROOM.backZ) * 180) / Math.PI

      // Either it starts beyond the reachable yaw, or it tops out below the
      // field's lowest ball while the view is level.
      const besideTheField = blockYawDeg >= yawReachDeg
      const belowTheField = blockTopDeg <= FIELD_PITCH_CENTRE_DEG - FIELD_HALF_PITCH_DEG
      expect(besideTheField || belowTheField).toBe(true)
      expect(blockTopDeg).toBeLessThan(pitchTopDeg)
    }
  })

  it('props are shorter than the ceiling and above the floor', () => {
    for (const b of [...PROPS.cornerBlocks, ...PROPS.pilasters]) {
      expect(b.max.y).toBeLessThan(ROOM.ceilY)
      expect(b.max.y).toBeGreaterThan(ROOM.floorY)
      expect(b.min.x).toBeGreaterThanOrEqual(-ROOM.halfX)
      expect(b.max.x).toBeLessThanOrEqual(ROOM.halfX)
    }
  })
})

describe('room holds the whole target field', () => {
  // The field is fixed to the wall around the round's forward axis, and the view
  // may swing ±YAW_LIMIT away from it. If the wall does not cover that swing plus
  // the field's own half-width, a long flick leaves balls hanging in empty space
  // — that is the "球飞到页面外" bug.
  const deg = (r) => (r * 180) / Math.PI

  it('back wall is wide enough for the field at full yaw', () => {
    const needed = deg(YAW_LIMIT + FIELD_HALF_YAW_DEG * DEG)
    const available = deg(Math.atan(ROOM.halfX / ROOM.backZ))
    expect(available).toBeGreaterThan(needed)
  })

  it('ceiling covers the field at full pitch up', () => {
    const needed =
      deg(PITCH_LIMIT) + FIELD_HALF_PITCH_DEG + FIELD_PITCH_CENTRE_DEG
    expect(deg(Math.atan(ROOM.ceilY / ROOM.backZ))).toBeGreaterThan(needed)
  })

  it('keeps the floor line on screen', () => {
    // The floor is deliberately shallower than the ceiling. If it drops below
    // the vertical half-FOV the room reads as one flat wall with no horizon.
    const halfScreen = deg(Math.atan(H / 2 / FOCAL))
    expect(deg(Math.atan(Math.abs(ROOM.floorY) / ROOM.backZ))).toBeLessThan(halfScreen)
  })

  it('keeps a corner ball on screen and on the wall at the yaw limit', () => {
    // Worst case: view pinned at +YAW_LIMIT, a ball at the field's far corner.
    const cam = { yaw: YAW_LIMIT, pitch: 0 }
    const ball = {
      yaw: FIELD_HALF_YAW_DEG * DEG,
      pitch: (FIELD_PITCH_CENTRE_DEG + FIELD_HALF_PITCH_DEG) * DEG,
    }
    const p = project(ball, cam, W, H)
    expect(p).not.toBeNull()
    expect(p.x).toBeGreaterThan(0)
    expect(p.x).toBeLessThan(W)
    expect(p.y).toBeGreaterThan(0)
    expect(p.y).toBeLessThan(H)
  })

  it('keeps the whole field on screen from the forward axis', () => {
    // The framing that matters most: a round starts looking straight ahead and
    // all six balls must already be visible without a turn.
    const cam = { yaw: 0, pitch: 0 }
    const far = {
      yaw: FIELD_HALF_YAW_DEG * DEG,
      pitch: (FIELD_PITCH_CENTRE_DEG + FIELD_HALF_PITCH_DEG) * DEG,
    }
    const p = project(far, cam, W, H)
    expect(p.x).toBeGreaterThan(0)
    expect(p.x).toBeLessThan(W)
    expect(p.y).toBeGreaterThan(0)
    expect(p.y).toBeLessThan(H)
    void FOV_Y
  })
})
