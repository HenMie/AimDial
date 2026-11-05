// Pseudo-3D room geometry for the arena backdrop, modelled on the Sixshot range
// in Aim Lab.
//
// World space: +X right, +Y up, +Z forward, camera pinned at the origin. Yaw
// rotates about Y and pitch about X, using the same sign conventions as
// aimModel.js, so a wall point and a target at the same (yaw, pitch) land on the
// same pixel. Everything here is pure maths so the projection can be tested
// without a canvas.
//
// What the reference footage actually shows, since the numbers below are traced
// from it rather than invented:
//
//   - A closed box, but with no ceiling in the usual sense: looking up gives
//     open sky, and a shaft of daylight rakes across the floor. The upper
//     volume is a roof slab whose underside is the light grey plane overhead.
//   - Every surface is a two-tone checkerboard, laid out in world space so the
//     cells shrink with distance. This is what sells depth; a screen-space
//     texture reads as a flat backdrop no matter how the wall is shaped.
//   - The back wall is banded, not uniform: a darker upper band, a shadowed
//     moulding line, then a lighter lower band. The floor meets it in a darker
//     skirt.
//   - The back-right corner has a stack of grey blocks; the left wall carries
//     pilasters that only appear when the player turns.
import { FOV_Y } from './aimModel.js'

// A box the player stands inside. Walls exist on every side, so turning never
// reveals the edge of the world the way a single backdrop plane would.
//
// Width is the other place an early version got this wrong. With halfX 26 the
// back wall's corners sit at 73° — past the 51° half-screen — so the side walls
// never appear at all and the room reads as one flat plane. The footage clearly
// shows both corners converging, which puts the corners inside the frame: at
// backZ 8, halfX 9 lands them around x-fraction 0.95, just inside the edge.
//
// That width then sets the yaw budget: the view may swing YAW_LIMIT and the
// field reaches FIELD_HALF_YAW_DEG past it, and both must stay on the back wall
// (48.4° here). YAW_LIMIT of 30° leaves 47°, so nothing ever ends up past a
// corner. height is discussed below.
//
// Height: pinning the eye in the middle of a tall box pushes the ceiling past
// the top of the frame, so it never appears and the range reads as one flat
// wall a step away. The footage's ceiling seam sits about a fifth of the way
// down the frame with the wall carrying the rest, which at backZ 8 means
// ceilY ≈ 3.4 and floorY ≈ -4.2. Note the reference frames are pitched up,
// which lifts that seam — measuring one frame's proportions as if the camera
// were level gives a ceiling about a metre too low.
export const ROOM = {
  halfX: 10,
  backZ: 8,
  frontZ: -10,
  floorY: -4.2,
  ceilY: 3.4,
}

// The visible lip of the roof where it stops and the sky begins. In the footage
// this edge is a narrow sliver near the top of the frame with the roof plane
// filling most of the overhead view — not an open-topped box. Pushing the lip
// near the back wall leaves only that sliver of sky.
export const SKY_LIP_Z = 7.7

// Edge length of one checker cell, in world units.
//
// Calibrated against the footage rather than guessed: the back wall shows cells
// about 22px wide at 1080p. With a 70° vertical FOV the focal length is ~771px,
// so at backZ 8 a cell of side S spans S/8 * 771 px — 22px means S ≈ 0.27. An
// earlier 0.55 doubled that and the wall read as a coarse quilt.
export const CHECKER_SIZE = 0.274

// Geometry is clipped here before projection; dividing by a z near zero is what
// turns a wall into a screen-filling smear.
export const NEAR_Z = 0.4

/** Pixels per unit of tan(angle) for a canvas of this height. */
export function focalFor(height) {
  return height / 2 / Math.tan(FOV_Y / 2)
}

/**
 * Rotate a world point into camera space.
 */
export function toCamera(point, cam) {
  const cy = Math.cos(cam.yaw)
  const sy = Math.sin(cam.yaw)
  const x1 = point.x * cy - point.z * sy
  const z1 = point.x * sy + point.z * cy

  const cp = Math.cos(cam.pitch)
  const sp = Math.sin(cam.pitch)
  return {
    x: x1,
    y: point.y * cp - z1 * sp,
    z: point.y * sp + z1 * cp,
  }
}

/**
 * Project a camera-space point. Caller guarantees z > NEAR_Z.
 */
export function projectCamera(p, width, height, focal) {
  return {
    x: width / 2 + (p.x / p.z) * focal,
    y: height / 2 - (p.y / p.z) * focal,
  }
}

/**
 * Clip a camera-space polygon against the near plane (Sutherland–Hodgman).
 */
export function clipNear(points, near = NEAR_Z) {
  const out = []
  for (let i = 0; i < points.length; i += 1) {
    const cur = points[i]
    const next = points[(i + 1) % points.length]
    const curIn = cur.z >= near
    const nextIn = next.z >= near
    if (curIn) out.push(cur)
    if (curIn !== nextIn) {
      const t = (near - cur.z) / (next.z - cur.z)
      out.push({
        x: cur.x + (next.x - cur.x) * t,
        y: cur.y + (next.y - cur.y) * t,
        z: near,
      })
    }
  }
  return out
}

/**
 * Project a world-space polygon into screen space, or null when nothing of it
 * is in front of the camera.
 */
export function projectPolygon(points, cam, width, height, focal) {
  const clipped = clipNear(points.map((p) => toCamera(p, cam)))
  if (clipped.length < 3) return null
  return clipped.map((p) => projectCamera(p, width, height, focal))
}

/**
 * Project a world-space segment, clipping it against the near plane.
 * Returns null when the whole segment sits behind the camera.
 */
export function projectSegment(a, b, cam, width, height, focal) {
  const ca = toCamera(a, cam)
  const cb = toCamera(b, cam)
  let { x: ax, y: ay, z: az } = ca
  let { x: bx, y: by, z: bz } = cb

  if (az < NEAR_Z && bz < NEAR_Z) return null

  if (az < NEAR_Z) {
    const t = (NEAR_Z - az) / (bz - az)
    ax += (bx - ax) * t
    ay += (by - ay) * t
    az = NEAR_Z
  } else if (bz < NEAR_Z) {
    const t = (NEAR_Z - bz) / (az - bz)
    bx += (ax - bx) * t
    by += (ay - by) * t
    bz = NEAR_Z
  }

  return {
    x1: width / 2 + (ax / az) * focal,
    y1: height / 2 - (ay / az) * focal,
    x2: width / 2 + (bx / bz) * focal,
    y2: height / 2 - (by / bz) * focal,
  }
}

/**
 * A flat surface described by a corner, a horizontal edge vector and a vertical
 * edge vector. Grid lines and checker cells are laid out in (s, t) surface
 * coordinates so the same routine works for walls, floor and ceiling — and
 * because s/t run 0..1 whatever the surface size, the cell size stays physically
 * uniform: `s` spans `uLen` world units, so cells-per-row is `uLen / size`.
 */
export function surface(o, u, v) {
  return {
    o,
    u,
    v,
    uLen: Math.hypot(u.x, u.y, u.z),
    vLen: Math.hypot(v.x, v.y, v.z),
  }
}

export function pointOn(surf, s, t) {
  const { o, u, v } = surf
  return {
    x: o.x + u.x * s + v.x * t,
    y: o.y + u.y * s + v.y * t,
    z: o.z + u.z * s + v.z * t,
  }
}

export function corners(surf) {
  return [pointOn(surf, 0, 0), pointOn(surf, 1, 0), pointOn(surf, 1, 1), pointOn(surf, 0, 1)]
}

/**
 * Split a surface into horizontal bands between two heights (world Y). Bands are
 * how the back wall's darker upper section and lighter lower section are drawn:
 * the wall is not one quad with a gradient, it is genuinely two materials.
 */
export function band(surf, y0, y1) {
  const t0 = (y0 - surf.o.y) / surf.v.y
  const t1 = (y1 - surf.o.y) / surf.v.y
  const k = t1 - t0
  return surface(pointOn(surf, 0, t0), surf.u, {
    x: surf.v.x * k,
    y: surf.v.y * k,
    z: surf.v.z * k,
  })
}

/** The surfaces of the room. Back wall first, then the sides a view can reach. */
export function roomSurfaces() {
  const { halfX, backZ, frontZ, floorY, ceilY } = ROOM
  const width = halfX * 2
  const depth = backZ - frontZ
  const height = ceilY - floorY

  return {
    back: surface(
      { x: -halfX, y: floorY, z: backZ },
      { x: width, y: 0, z: 0 },
      { x: 0, y: height, z: 0 },
    ),
    left: surface(
      { x: -halfX, y: floorY, z: frontZ },
      { x: 0, y: 0, z: depth },
      { x: 0, y: height, z: 0 },
    ),
    right: surface(
      { x: halfX, y: floorY, z: frontZ },
      { x: 0, y: 0, z: depth },
      { x: 0, y: height, z: 0 },
    ),
    floor: surface(
      { x: -halfX, y: floorY, z: frontZ },
      { x: width, y: 0, z: 0 },
      { x: 0, y: 0, z: depth },
    ),
    ceiling: surface(
      { x: -halfX, y: ceilY, z: frontZ },
      { x: width, y: 0, z: 0 },
      { x: 0, y: 0, z: depth },
    ),
  }
}

/**
 * An axis-aligned box given by its two opposite corners, as six faces. Used for
 * the corner blocks and the wall pilasters: they are what keep a long left/right
 * sweep from looking like an infinite flat wall.
 */
export function boxFaces(min, max) {
  const { x: x0, y: y0, z: z0 } = min
  const { x: x1, y: y1, z: z1 } = max
  return {
    front: surface({ x: x0, y: y0, z: z0 }, { x: x1 - x0, y: 0, z: 0 }, { x: 0, y: y1 - y0, z: 0 }),
    back: surface({ x: x0, y: y0, z: z1 }, { x: 0, y: 0, z: 0 }, { x: 0, y: y1 - y0, z: 0 }),
    left: surface({ x: x0, y: y0, z: z0 }, { x: 0, y: 0, z: z1 - z0 }, { x: 0, y: y1 - y0, z: 0 }),
    right: surface({ x: x1, y: y0, z: z0 }, { x: 0, y: 0, z: z1 - z0 }, { x: 0, y: y1 - y0, z: 0 }),
    top: surface({ x: x0, y: y1, z: z0 }, { x: x1 - x0, y: 0, z: 0 }, { x: 0, y: 0, z: z1 - z0 }),
  }
}

/**
 * The clutter visible in the footage. Kept as data so the renderer stays a
 * projection loop and the test suite can assert the blocks never intrude on the
 * band where targets can spawn.
 */
export const PROPS = {
  // Stepped blocks in the back-right corner, growing toward the wall.
  //
  // They must sit past YAW_LIMIT + the field's half-width (47° at backZ 8, i.e.
  // x ≈ 8.6) or a legitimate flick could put a ball behind one. With halfX 9
  // that leaves almost nothing, so in a head-on build these are shallow steps
  // hugging the corner: they carry the same "built-in storage" read as the
  // footage without ever occluding a spawn. room.test.js enforces the margin.
  cornerBlocks: [
    { min: { x: 8.7, y: -4.2, z: 6.8 }, max: { x: 10, y: 1.2, z: 8 } },
    { min: { x: 8.7, y: -4.2, z: 5.6 }, max: { x: 10, y: 0.6, z: 6.8 } },
  ],
  // Pilasters on the side walls. Only reachable at a hard yaw, so they are cheap
  // depth cues rather than set dressing the player stares at.
  pilasters: [
    { min: { x: -10, y: -4.2, z: 1.2 }, max: { x: -9.2, y: 3.0, z: 3.4 } },
    { min: { x: -10, y: -4.2, z: -5.4 }, max: { x: -9.2, y: 3.0, z: -3.2 } },
    { min: { x: 9.2, y: -4.2, z: 1.2 }, max: { x: 10, y: 3.0, z: 3.4 } },
    { min: { x: 9.2, y: -4.2, z: -5.4 }, max: { x: 10, y: 3.0, z: -3.2 } },
  ],
}

/**
 * Bands of the back wall, as (top, bottom) heights in world Y. Traced off the
 * footage: the wall breaks into a darker upper field and a lighter lower field
 * along a horizontal seam a little below eye level, with a shadowed moulding
 * sitting on that seam. At backZ 8 the seam lands around y=0.75, which puts it
 * about 55% down the frame — the proportion the reference shows.
 */
export const WALL_BANDS = {
  upper: [-0.6, ROOM.ceilY],
  moulding: [-1.05, -0.6],
  lower: [ROOM.floorY, -1.05],
}

/**
 * The shaft of daylight on the floor. A parallelogram rather than a rectangle:
 * in the footage it enters at an angle, which is what makes it read as light
 * from an opening instead of a painted stripe.
 *
 * Placed across the near floor so it is visible from a level view — the patch in
 * the reference runs from the bottom of the frame up to the wall base, not in
 * some far corner the player would have to look down to find.
 */
export function lightShaft() {
  const y = ROOM.floorY + 0.004
  // Straddling the near floor. The floor's visible band on screen is only the
  // last ~15% of the frame (y 787..900 of 900 at a level view), and it covers
  // world z 4.4..8, so the patch has to reach forward of that to occupy any
  // meaningful area — z 2.2..6.6 spans roughly y 800..900 on screen.
  return [
    { x: -4.6, y, z: 2.4 },
    { x: 9.4, y, z: 3.2 },
    { x: 8.2, y, z: 6.4 },
    { x: -3.4, y, z: 6.0 },
  ]
}
