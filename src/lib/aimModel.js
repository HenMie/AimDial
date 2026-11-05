// Spherical aiming model shared by the canvas renderer and the search adapter.
//
// The camera has yaw (horizontal, unbounded, wraps) and pitch (vertical,
// clamped). Targets live on a sphere of radius 1 in front of the camera, so a
// target's screen position depends only on angular distance from the view
// centre when we use a simple linear (rectilinear-ish) projection — good
// enough for a 2D crosshair trainer and, crucially, monotonic in sensitivity.

// How far the view may swing off the room's forward axis. The arena is a
// closed box, so a view turned past these bounds points at bare wall with no
// target board in front of it — the field scatters and balls end up off-screen.
//
// Bounds are derived from the board, not guessed: a ball can sit BRD_Y off the
// board centre, so the wall has to cover YAW_LIMIT + BRD_Y. room.js sizes the
// box to match, and room.test.js asserts the two stay consistent.
export const YAW_LIMIT = (50 * Math.PI) / 180
export const PITCH_LIMIT = (26 * Math.PI) / 180
// Vertical FOV, matching Aim Lab's default of 70 (about 103° horizontal at
// 16:9). A wider lens exaggerates the stretch at the edges of the frame, which
// is what makes turning feel like the wall is rushing past.
export const FOV_Y = (70 * Math.PI) / 180

export function clampPitch(pitch) {
  return Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch))
}

/**
 * Keep the view inside the room. Yaw is unbounded by nature (it wraps), which
 * let a long sweep drift the board out past the walls; clamping both axes is
 * what keeps the six balls in front of the player.
 */
export function clampYaw(yaw) {
  return Math.max(-YAW_LIMIT, Math.min(YAW_LIMIT, yaw))
}

/**
 * Project a target (yaw, pitch, on the unit sphere) into screen pixels.
 * Returns null when the target is behind the camera.
 */
export function project(target, cam, width, height) {
  const focal = height / 2 / Math.tan(FOV_Y / 2)

  // Camera-space direction of the target, using the canvas convention where
  // yaw increases to the right and pitch increases upward.
  const dYaw = wrapAngle(target.yaw - cam.yaw)
  const dPitch = target.pitch - cam.pitch
  const cosP = Math.cos(dPitch)
  const x3 = Math.sin(dYaw) * cosP
  const y3 = Math.sin(dPitch)
  const z3 = Math.cos(dYaw) * cosP

  if (z3 <= 0.001) return null // behind or extremely oblique

  return {
    x: width / 2 + (x3 / z3) * focal,
    y: height / 2 - (y3 / z3) * focal,
    depth: z3,
    focal,
  }
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

/**
 * Angular distance in radians between two (yaw, pitch) pairs.
 */
export function angularDistance(a, b) {
  const dYaw = wrapAngle(a.yaw - b.yaw)
  const dPitch = a.pitch - b.pitch
  const ca = Math.cos(a.pitch)
  const cb = Math.cos(b.pitch)
  const dot = ca * cb * Math.cos(dYaw) + Math.sin(a.pitch) * Math.sin(b.pitch)
  return Math.acos(Math.max(-1, Math.min(1, dot)))
}

/**
 * Screen-space pixels per degree for a given canvas height.
 */
export function pxPerDegree(height) {
  return height / ((FOV_Y * 180) / Math.PI)
}

// Sixshot-style targets keep a constant on-screen size regardless of depth, so
// the test measures pointer accuracy rather than a distance/size tradeoff. The
// size is measured off Sixshot footage: about 17px across at 1080p.
export const TARGET_RADIUS_RATIO = 0.0078
export const MIN_TARGET_RADIUS_PX = 3
export const MAX_TARGET_RADIUS_PX = 12

/**
 * On-screen radius in pixels for a target. Deliberately independent of `depth`.
 */
export function targetRadiusPx(width, height) {
  const base = Math.min(width, height) * TARGET_RADIUS_RATIO
  return Math.max(MIN_TARGET_RADIUS_PX, Math.min(MAX_TARGET_RADIUS_PX, base))
}

/**
 * Is the crosshair (always screen centre) inside this target? Split out from the
 * canvas so the hit test can be unit-tested without a DOM.
 */
export function isHit(target, cam, width, height) {
  const p = project(target, cam, width, height)
  const radius = targetRadiusPx(width, height)
  if (!p) return { hit: false, projected: null, radius, dist: Infinity }
  const dist = Math.hypot(p.x - width / 2, p.y - height / 2)
  return { hit: dist <= radius, projected: p, radius, dist }
}
