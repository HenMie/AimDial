// Pseudo-3D room geometry for the arena backdrop.
//
// World space: +X right, +Y up, +Z forward, camera pinned at the origin. Yaw
// rotates about Y and pitch about X, using the same sign conventions as
// aimModel.js, so a wall point and a target at the same (yaw, pitch) land on the
// same pixel. Everything here is pure maths so the projection can be tested
// without a canvas.
import { FOV_Y } from './aimModel.js'

// A box the player stands inside. Walls exist on every side, so turning never
// reveals the edge of the world the way a single backdrop plane would. The eye
// sits at the vertical centre of the room, so the target band is framed by wall
// above and below instead of hugging the floor.
export const ROOM = {
  halfX: 13,
  backZ: 8,
  frontZ: -10,
  floorY: -4.2,
  ceilY: 4.2,
}

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
 * edge vector. Grid lines are laid out in (s, t) surface coordinates so the same
 * routine works for walls, floor and ceiling.
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

/** The five surfaces of the room, back wall first. */
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
