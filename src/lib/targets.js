// Target-field rules for the Sixshot-style drill, kept pure so the spawn
// behaviour can be unit-tested without a canvas.
import { wrapAngle, clampPitch } from './aimModel.js'

export const TARGETS_ON_FIELD = 6
// Sixshot keeps the whole field on one plane in front of the player, so spawns
// are anchored to this heading instead of to wherever the view is pointing. A
// kill never asks the player to turn around; it only asks for a flick.
export const FIELD_ANCHOR = Object.freeze({ yaw: 0, pitch: 0 })
// Spread as a fraction of each half-FOV. Measured off Sixshot footage: the six
// balls sit in a cluster roughly 48° wide by 37° tall, centred on where the
// player is looking — a third of the screen, not a wall-wide sweep.
export const SPREAD_YAW_FRACTION = 0.46
export const SPREAD_PITCH_FRACTION = 0.5
// A new target must not sit under the crosshair, or the player gets a free kill.
export const MIN_CROSSHAIR_OFFSET = (6 * Math.PI) / 180
// Nor on top of another target, or two clicks could resolve to one ball. Tighter
// than the old field allowed: the cluster is dense in Sixshot.
export const MIN_TARGET_SEPARATION = (8 * Math.PI) / 180
const MAX_SPAWN_ATTEMPTS = 40

// Fallback spawn box used when the caller does not pass canvas-derived extents.
const DEFAULT_EXTENTS = { yaw: (24 * Math.PI) / 180, pitch: (19 * Math.PI) / 180 }

/**
 * Angular half-extents of the spawn box for a given field of view. `fovY` is the
 * vertical FOV in radians; the horizontal extent follows from the aspect ratio so
 * a wide canvas spreads targets horizontally instead of leaving them clustered.
 */
export function spawnExtents(fovY, aspect = 16 / 9) {
  const halfY = fovY / 2
  const halfX = Math.atan(Math.tan(halfY) * aspect)
  return {
    yaw: halfX * SPREAD_YAW_FRACTION,
    pitch: halfY * SPREAD_PITCH_FRACTION,
  }
}

/**
 * Pick a spawn point around `anchor` that satisfies both the crosshair offset and
 * the separation constraints. Pass FIELD_ANCHOR (not the live camera) to keep the
 * field pinned to one plane in front of the player. `rand` is injectable for
 * deterministic tests. Falls back to the first crosshair-clear candidate if the
 * field is too crowded.
 */
export function spawnTarget(cam, existing = [], rand = Math.random, extents = DEFAULT_EXTENTS) {
  let fallback = null
  for (let i = 0; i < MAX_SPAWN_ATTEMPTS; i += 1) {
    const yaw = cam.yaw + (rand() * 2 - 1) * extents.yaw
    const pitch = clampPitch(cam.pitch + (rand() * 2 - 1) * extents.pitch)

    const fromCrosshair = Math.hypot(yaw - cam.yaw, pitch - cam.pitch)
    if (fromCrosshair < MIN_CROSSHAIR_OFFSET) continue

    const candidate = { yaw, pitch }
    fallback ??= candidate

    const tooClose = existing.some(
      (t) => Math.hypot(wrapAngle(t.yaw - yaw), t.pitch - pitch) < MIN_TARGET_SEPARATION,
    )
    if (!tooClose) return candidate
  }
  return fallback ?? { yaw: cam.yaw + MIN_CROSSHAIR_OFFSET, pitch: cam.pitch }
}

/**
 * Six targets spread across the plane in front of the player at the start of a
 * round.
 */
export function buildField(cam, count = TARGETS_ON_FIELD, rand = Math.random, extents = DEFAULT_EXTENTS) {
  const field = []
  for (let i = 0; i < count; i += 1) {
    field.push(spawnTarget(cam, field, rand, extents))
  }
  return field
}

/**
 * Remove the target at `index` and put a fresh one on the field so the count
 * never drops. Returns a new array; never mutates the input.
 */
export function replaceTarget(field, index, cam, rand = Math.random, extents = DEFAULT_EXTENTS) {
  const remaining = field.filter((_, i) => i !== index)
  return [...remaining, spawnTarget(cam, remaining, rand, extents)]
}
