// Target-field rules for the Sixshot-style drill, kept pure so the spawn
// behaviour can be unit-tested without a canvas.
//
// Measured off a 65s Sixshot recording: the six balls are pinned to their own
// little board, not to the room. The board keeps its orientation and travels
// with the view — a ball killed on the right respawns on that same board — so
// the whole field is one rigid slab that slides with the crosshair.
import { wrapAngle, clampPitch } from './aimModel.js'

export const TARGETS_ON_FIELD = 6
// The board follows the view, so spawns are anchored to wherever the player is
// looking rather than to the heading the round started on. Passing `null` asks
// for "anchor to the live camera".
export const FIELD_ANCHOR = null
// Board half-extents, in degrees. Footage of the board at rest spans about
// 44° across and 40° tall; these are the angular bounds a ball can land in,
// measured from the board centre.
export const BOARD_HALF_YAW_DEG = 22
export const BOARD_HALF_PITCH_DEG = 20
// Balls are packed tight on the board: nearest neighbours in the footage sit as
// close as 0.6° apart, with a median around 2°. The only hard rule is that two
// balls must not overlap — kept just above the target's apparent diameter so a
// click can never resolve to two balls at once.
export const MIN_TARGET_SEPARATION = (1.6 * Math.PI) / 180
// A fresh ball may sit under the crosshair. In the footage respawns land on the
// aim point constantly, so there is no crosshair keep-out.
export const MIN_CROSSHAIR_OFFSET = 0
const MAX_SPAWN_ATTEMPTS = 60

const DEG = Math.PI / 180

// The board offsets every spawn, so a caller that does not pass one gets it
// derived from the camera: the board is a fixed rectangle around the aim point.
export function boardExtents(fovY, aspect = 16 / 9) {
  void fovY
  void aspect
  return { yaw: BOARD_HALF_YAW_DEG * DEG, pitch: BOARD_HALF_PITCH_DEG * DEG }
}

/**
 * Relative offset of a spawn from the board centre. Uniform over the board, so
 * the cluster density matches the footage rather than bunching at the centre.
 */
function randomOffset(rand, extents) {
  return {
    yaw: (rand() * 2 - 1) * extents.yaw,
    pitch: (rand() * 2 - 1) * extents.pitch,
  }
}

/**
 * Pick a spawn on the board centred on `anchor`. `rand` is injectable for
 * deterministic tests. Falls back to the least-crowded candidate if the board
 * is too full to find a clear spot.
 */
export function spawnTarget(anchor, existing = [], rand = Math.random, extents = boardExtents()) {
  let fallback = null
  let fallbackGap = -Infinity
  for (let i = 0; i < MAX_SPAWN_ATTEMPTS; i += 1) {
    const off = randomOffset(rand, extents)
    const candidate = {
      yaw: anchor.yaw + off.yaw,
      pitch: clampPitch(anchor.pitch + off.pitch),
    }

    let gap = Infinity
    for (const t of existing) {
      const d = Math.hypot(wrapAngle(t.yaw - candidate.yaw), t.pitch - candidate.pitch)
      if (d < gap) gap = d
    }
    if (gap >= MIN_TARGET_SEPARATION) return candidate
    if (gap > fallbackGap) {
      fallbackGap = gap
      fallback = candidate
    }
  }
  return fallback ?? { yaw: anchor.yaw + MIN_TARGET_SEPARATION, pitch: anchor.pitch }
}

/**
 * Six balls on the board in front of the player at the start of a round.
 */
export function buildField(anchor, count = TARGETS_ON_FIELD, rand = Math.random, extents = boardExtents()) {
  const field = []
  for (let i = 0; i < count; i += 1) {
    field.push(spawnTarget(anchor, field, rand, extents))
  }
  return field
}

/**
 * Remove the ball at `index` and drop a fresh one on the board so the count
 * never drops. Returns a new array; never mutates the input.
 */
export function replaceTarget(field, index, anchor, rand = Math.random, extents = boardExtents()) {
  const remaining = field.filter((_, i) => i !== index)
  return [...remaining, spawnTarget(anchor, remaining, rand, extents)]
}

/**
 * The board slides with the view: respawns are measured from where the player
 * is looking now, not from where the round began.
 */
export function boardAnchor(cam) {
  return { yaw: cam.yaw, pitch: cam.pitch }
}
