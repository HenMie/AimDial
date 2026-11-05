// Target-field rules for the Sixshot-style drill, kept pure so the spawn
// behaviour can be unit-tested without a canvas.
//
// Modelled off a 65s Sixshot recording. What the footage shows, and how that
// differs from a "board that follows the view":
//
//   - The six balls are pinned to the back wall of the range. They do not ride
//     with the crosshair; when a ball dies the replacement appears in the same
//     patch of wall, which is why the player never has to hunt.
//   - That patch sits around eye level, spanning roughly 34° wide and 22° tall
//     measured from the round's starting heading — wide enough to make a flick,
//     narrow enough that the whole field stays inside one screen.
//   - Balls can sit very close together. Nothing in the footage enforces a
//     comfortable gap; the only hard rule is that two balls must not overlap,
//     because a click between them has to resolve to exactly one.
//
// Positions are kept in world (yaw, pitch) on the unit sphere, matching
// aimModel.js, so a spawn does not depend on where the player happens to be
// looking at the instant they fire.
import { wrapAngle, clampPitch } from './aimModel.js'

export const TARGETS_ON_FIELD = 6

// The wall patch the field occupies, in degrees from the round's forward axis.
// Sized off the footage: at 16:9 and the game's 70° vertical FOV the screen
// half-angle is about 51°, so ±17°/±11° puts the whole patch comfortably inside
// the frame with room for a flick.
export const FIELD_HALF_YAW_DEG = 17
export const FIELD_HALF_PITCH_DEG = 11
// The patch is centred slightly above the horizon: in the footage the balls sit
// against the wall band above the floor line, not down on the ground.
export const FIELD_PITCH_CENTRE_DEG = 2

// Two balls may not overlap. The target's apparent radius is ~0.72° at the
// game's FOV (a ~17px ball at 1080p over 70° vertical), so 1.5° of centre
// separation leaves a sliver of daylight and guarantees a click can only land
// inside one. This is much tighter than a "readable board" would need — the
// footage packs balls far closer than that, and it is the point of the drill.
export const MIN_TARGET_SEPARATION = (1.5 * Math.PI) / 180

const MAX_SPAWN_ATTEMPTS = 80
const DEG = Math.PI / 180

/**
 * Angular bounds of the field, in radians, relative to the round's forward axis.
 */
export function fieldExtents() {
  return {
    yaw: FIELD_HALF_YAW_DEG * DEG,
    pitch: FIELD_HALF_PITCH_DEG * DEG,
    pitchCentre: FIELD_PITCH_CENTRE_DEG * DEG,
  }
}

/**
 * A uniformly random spot inside the field patch. Uniform over the rectangle, so
 * the cluster's density is even rather than bunching at the centre — the footage
 * fills its patch flatly.
 */
function randomSpot(rand, extents, origin) {
  return {
    yaw: origin.yaw + (rand() * 2 - 1) * extents.yaw,
    pitch: clampPitch(origin.pitch + extents.pitchCentre + (rand() * 2 - 1) * extents.pitch),
  }
}

/** Angular gap between two balls, in radians. */
function gapBetween(a, b) {
  return Math.hypot(wrapAngle(a.yaw - b.yaw), a.pitch - b.pitch)
}

/**
 * Pick a spawn in the field. `rand` is injectable for deterministic tests.
 *
 * `origin` is the round's forward axis, not the live camera: the field is fixed
 * to the wall so a respawn does not depend on where the player last flicked.
 * Falls back to the least-crowded candidate when the patch is too full to find a
 * clear spot.
 */
export function spawnTarget(origin, existing = [], rand = Math.random, extents = fieldExtents()) {
  let fallback = null
  let fallbackGap = -Infinity
  for (let i = 0; i < MAX_SPAWN_ATTEMPTS; i += 1) {
    const candidate = randomSpot(rand, extents, origin)

    let gap = Infinity
    for (const t of existing) {
      const d = gapBetween(t, candidate)
      if (d < gap) gap = d
    }
    if (gap >= MIN_TARGET_SEPARATION) return candidate
    if (gap > fallbackGap) {
      fallbackGap = gap
      fallback = candidate
    }
  }
  return fallback ?? { yaw: origin.yaw + MIN_TARGET_SEPARATION, pitch: origin.pitch }
}

/**
 * Six balls on the wall in front of the player at the start of a round.
 */
export function buildField(origin, count = TARGETS_ON_FIELD, rand = Math.random, extents = fieldExtents()) {
  const field = []
  for (let i = 0; i < count; i += 1) {
    field.push(spawnTarget(origin, field, rand, extents))
  }
  return field
}

/**
 * Remove the ball at `index` and drop a fresh one in the same patch so the count
 * never drops. Returns a new array; never mutates the input.
 */
export function replaceTarget(field, index, origin, rand = Math.random, extents = fieldExtents()) {
  const remaining = field.filter((_, i) => i !== index)
  return [...remaining, spawnTarget(origin, remaining, rand, extents)]
}

/**
 * Whether every ball has drifted out of the field patch. Used by the renderer as
 * a safety net: the patch is fixed, so this should never fire, but a clamp bug
 * that scattered the field must not strand the player on an empty wall.
 */
export function fieldInView(field, extents = fieldExtents(), slack = 1.4) {
  return field.some(
    (t) =>
      Math.abs(t.yaw) <= extents.yaw * slack &&
      Math.abs(t.pitch - extents.pitchCentre) <= extents.pitch * slack,
  )
}
