import { useCallback, useEffect, useRef, useState } from 'react'
import { project, clampPitch, clampYaw, isHit, targetRadiusPx, FOV_Y } from '../lib/aimModel.js'
import {
  buildField,
  replaceTarget,
  fieldExtents,
  TARGETS_ON_FIELD,
} from '../lib/targets.js'
import { summarize, meanOvershoot } from '../lib/scoring.js'
import { degPerPointerUnit } from '../lib/sens.js'
import { usePointerLock } from '../hooks/usePointerLock.js'
import {
  focalFor,
  projectSegment,
  projectPolygon,
  roomSurfaces,
  pointOn,
  corners,
  band,
  boxFaces,
  lightShaft,
  toCamera,
  projectCamera,
  surface,
  ROOM,
  PROPS,
  WALL_BANDS,
  CHECKER_SIZE,
  NEAR_Z,
} from '../lib/room.js'

// Sixshot rules: the clock is the only win condition. The field never empties.
const ROUND_MS = 60_000
const COUNTDOWN_MS = 3000

// One event this large is a pointer-lock warp or a driver spike, not a flick.
// Raw counts are much finer-grained than CSS pixels, so this is generous.
const MAX_MOVE_DELTA = 600

// HUD refresh cadence — fast enough to feel live, slow enough to skip renders.
const HUD_TICK_MS = 80
const HIT_FLASH_MS = 120
const RING_MS = 260
const SPAWN_MS = 90

const TAU = Math.PI * 2

// Cell size for the floor and ceiling: see the note in drawRoom.
const FLOOR_CELL = CHECKER_SIZE * 2

// Muted greys matched to the available Aimlabs gameplay screenshot.
const COLORS = {
  sky: ['#7fb0d8', '#c4dceb'],
  ceiling: '#55575a',
  wallUpper: '#5b5d60',
  wallLower: '#696b6e',
  wallMoulding: '#595b5e',
  sideWall: '#57595c',
  floor: '#777977',
  skirt: '#484a4d',
  prop: '#737578',
  propSide: '#616366',
  checkerLight: 'rgba(255,255,255,0.09)',
  checkerDark: 'rgba(0,0,0,0.09)',
}

/**
 * One static-clicking round (Sixshot-style) at a fixed sensitivity: six small
 * fixed-size targets sit on the range's back wall at all times, and each kill is
 * replaced immediately elsewhere in the same wall patch — the view is never
 * asked to turn around, only to flick.
 *
 * `sensitivity` is the game sensitivity for this round, and the view turns at
 * exactly the in-game rate for it, so a flick covers the same mouse distance it
 * would in Valorant. `onComplete(result)` fires when the player moves on.
 */
export default function AimCanvas({ sensitivity, meta, round = 0, rounds = 0, onComplete }) {
  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const [phase, setPhase] = useState('idle') // idle | countdown | running | finished
  const phaseRef = useRef('idle')
  const [hud, setHud] = useState({ score: 0, acc: 1, shots: 0, left: ROUND_MS })
  const [result, setResult] = useState(null)

  const { locked, request, rawInput } = usePointerLock(canvasRef)

  // Mutable simulation state — kept out of React to avoid re-renders per frame.
  const sim = useRef(null)
  const sizeRef = useRef({ w: 0, h: 0 })
  const idleField = useRef(null)

  // The round's forward axis. The target field is fixed to the wall around it,
  // so respawns do not depend on where the player last flicked.
  const origin = useRef({ yaw: 0, pitch: 0 })

  // Degrees the view turns per unit of reported pointer movement. Pointer Lock
  // under `unadjustedMovement` reports raw device counts — the same unit the
  // game reads — so the gain is the game's yaw constant and nothing more.
  //
  // Two wrong turns live in the history here, both worth naming so they are not
  // reintroduced: multiplying by devicePixelRatio (display scaling, unrelated
  // to the mouse, and 1.0 on an unscaled display so it silently did nothing)
  // and multiplying by dpi/96 (treats the count as a CSS pixel, which made the
  // view spin 16x too fast).
  const degPerUnit = degPerPointerUnit(sensitivity)

  if (!idleField.current) {
    idleField.current = buildField({ yaw: 0, pitch: 0 }, TARGETS_ON_FIELD, Math.random)
  }

  const setPhaseSafe = useCallback((next) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  const startRound = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const cam = { yaw: 0, pitch: 0 }
    const extents = fieldExtents()
    const now = performance.now()
    origin.current = { yaw: 0, pitch: 0 }

    sim.current = {
      cam,
      width: rect.width,
      height: rect.height,
      extents,
      targets: buildField(origin.current, TARGETS_ON_FIELD, Math.random, extents).map((t) => ({
        ...t,
        bornAt: now,
      })),
      hits: 0,
      shots: 0,
      // The clock only advances while the pointer is locked, so Esc pauses.
      elapsed: 0,
      runningSince: 0,
      countdownStart: now,
      overshoots: [],
      effects: [],
      hitAt: 0,
      finished: false,
    }

    setResult(null)
    setHud({ score: 0, acc: 1, shots: 0, left: ROUND_MS })
    setPhaseSafe('countdown')
  }, [setPhaseSafe])

  const finishRound = useCallback(() => {
    const s = sim.current
    if (!s || s.finished) return
    s.finished = true
    if (s.runningSince) {
      s.elapsed += performance.now() - s.runningSince
      s.runningSince = 0
    }
    const summary = summarize({
      shots: s.shots,
      hits: s.hits,
      durationMs: Math.min(s.elapsed, ROUND_MS),
    })
    const payload = {
      ...summary,
      sensitivity,
      overshoot: meanOvershoot(s.overshoots),
    }
    setResult(payload)
    setPhaseSafe('finished')
    if (document.pointerLockElement) document.exitPointerLock?.()
  }, [sensitivity, setPhaseSafe])

  // Canvas sizing follows the stage, so the arena is always full-bleed.
  useEffect(() => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage) return undefined

    const resize = () => {
      const rect = stage.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      const ctx = canvas.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      sizeRef.current = { w: rect.width, h: rect.height }
      if (sim.current) {
        sim.current.width = rect.width
        sim.current.height = rect.height
      }
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  // Mouse movement turns the camera at the game's own gain, so flick distances
  // transfer directly: a swipe that crosses 90° in Valorant crosses 90° here.
  useEffect(() => {
    const onMove = (e) => {
      const s = sim.current
      if (!s || phaseRef.current !== 'running' || !locked || !s.runningSince) return
      // Some drivers and pointer-lock transitions emit one enormous delta when
      // the cursor is warped. Those are not player input; dropping them keeps a
      // single glitch from throwing the view across the map.
      if (Math.abs(e.movementX) > MAX_MOVE_DELTA || Math.abs(e.movementY) > MAX_MOVE_DELTA) {
        return
      }
      const radPerUnit = (degPerUnit * Math.PI) / 180
      s.cam.yaw = clampYaw(s.cam.yaw + e.movementX * radPerUnit)
      s.cam.pitch = clampPitch(s.cam.pitch - e.movementY * radPerUnit)
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [locked, degPerUnit])

  // Clicking: the shot resolves against whichever target the crosshair is in.
  useEffect(() => {
    const onDown = (e) => {
      const s = sim.current
      if (!s || s.finished || phaseRef.current !== 'running' || !locked || !s.runningSince) {
        return
      }
      if (e.button !== 0) return
      e.preventDefault?.()
      s.shots += 1
      const now = performance.now()

      // Targets never overlap, so at most one can contain the crosshair; take
      // the closest anyway to stay deterministic if they ever do.
      let best = null
      let bestIndex = -1
      s.targets.forEach((t, i) => {
        const res = isHit(t, s.cam, s.width, s.height)
        if (res.hit && (!best || res.dist < best.dist)) {
          best = res
          bestIndex = i
        }
      })

      if (best) {
        const deltaDeg = (Math.atan2(best.dist, best.projected.focal) * 180) / Math.PI
        s.overshoots.push({ delta: deltaDeg })
        s.hits += 1
        s.hitAt = now
        s.effects.push({
          x: best.projected.x,
          y: best.projected.y,
          r: best.radius,
          at: now,
          seed: Math.random() * TAU,
        })
        // Replace the killed ball so the field stays at six. The patch is fixed
        // to the wall, so the replacement lands near the others rather than at
        // wherever the player happens to be looking.
        s.targets = replaceTarget(s.targets, bestIndex, origin.current, Math.random, s.extents).map(
          (t) => ({ ...t, bornAt: t.bornAt ?? now }),
        )
      }
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [locked])

  // Lock loss freezes the clock; regaining it resumes from the same instant.
  useEffect(() => {
    const s = sim.current
    if (!s || s.finished || phaseRef.current !== 'running') return
    const now = performance.now()
    if (!locked && s.runningSince) {
      s.elapsed += now - s.runningSince
      s.runningSince = 0
    } else if (locked && !s.runningSince) {
      s.runningSince = now
    }
  }, [locked])

  // Leaving the test must not strand the cursor in pointer lock.
  useEffect(
    () => () => {
      if (document.pointerLockElement) document.exitPointerLock?.()
    },
    [],
  )

  // One loop drives the clock, the HUD and the frame.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    let raf = 0
    let lastHud = 0

    const publishHud = (s, elapsed) => {
      const acc = s.shots > 0 ? s.hits / s.shots : 1
      const ttk = s.hits > 0 ? elapsed / s.hits / 1000 : Infinity
      const score = Number.isFinite(ttk) ? (acc ** 2) * 100 / Math.max(ttk, 0.15) : 0
      setHud({ score, acc, shots: s.shots, left: Math.max(0, ROUND_MS - elapsed) })
    }

    const frame = (now) => {
      const s = sim.current
      const { w, h } = sizeRef.current

      if (phaseRef.current === 'countdown' && s) {
        if (now - s.countdownStart >= COUNTDOWN_MS) {
          // Every round starts framed on the middle of the field, whatever the
          // cursor did while the lock was being acquired.
          s.cam.yaw = 0
          s.cam.pitch = 0
          s.runningSince = now
          setPhaseSafe('running')
        }
      }

      if (phaseRef.current === 'running' && s && !s.finished) {
        if (s.runningSince) {
          const elapsed = s.elapsed + (now - s.runningSince)
          if (elapsed >= ROUND_MS) {
            finishRound()
          } else if (now - lastHud >= HUD_TICK_MS) {
            lastHud = now
            publishHud(s, elapsed)
          }
        }
      }

      renderScene(ctx, {
        sim: s,
        idle: idleField.current,
        phase: phaseRef.current,
        countdownLeft: s ? Math.max(0, COUNTDOWN_MS - (now - s.countdownStart)) : 0,
        w,
        h,
        now,
      })

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [finishRound, setPhaseSafe])

  const begin = () => {
    startRound()
    request()
  }

  return (
    <div
      className="stage"
      ref={stageRef}
      onMouseDown={() => {
        if (phase === 'running' && !locked) request()
      }}
    >
      <canvas ref={canvasRef} className="stage-canvas" />

      {phase === 'running' && (
        <div className="hud" aria-hidden="true">
          <div className="hud-stats">
            <div><small>分数</small><strong>{Math.round(hud.score)}</strong></div>
            <div><small>时间</small><strong>{`${Math.floor(Math.ceil(hud.left / 1000) / 60)}:${String(Math.ceil(hud.left / 1000) % 60).padStart(2, '0')}`}</strong></div>
            <div><small>准确率</small><strong>{Math.round(hud.acc * 100)}%</strong></div>
          </div>
        </div>
      )}

      {phase !== 'running' && phase !== 'idle' && (
        <div className="stage-foot" aria-hidden="true">
          <span className="stage-sens">{formatSens(sensitivity)}</span>
          {meta && <span className="stage-meta">{meta}</span>}
        </div>
      )}

      {rounds > 0 && phase !== 'finished' && phase !== 'running' && (
        <div className="stage-rounds" aria-hidden="true">
          {Array.from({ length: Math.min(rounds, 12) }).map((_, i) => (
            <i key={i} data-on={i < round - 1} data-now={i === round - 1} />
          ))}
        </div>
      )}

      {phase === 'idle' && (
        <div className="stage-overlay">
          <p className="overlay-value">{formatSens(sensitivity)}</p>
          {meta && <p className="overlay-meta">{meta}</p>}
          <button type="button" className="stage-start" onClick={begin}>
            开始
          </button>
          <p className="overlay-hint">鼠标锁定 · Esc 暂停</p>
        </div>
      )}

      {phase === 'running' && !locked && (
        <div className="stage-overlay dim">
          <p className="overlay-value small">已暂停</p>
          <button type="button" className="stage-start" onClick={request}>
            继续
          </button>
          {rawInput === false && (
            <p className="overlay-hint warn">
              浏览器拒绝了原始输入，系统鼠标加速会介入，本轮手感仅供参考。
            </p>
          )}
        </div>
      )}

      {phase === 'finished' && result && (
        <div className="stage-overlay">
          <p className="overlay-value">{Math.round(result.score)}</p>
          <p className="overlay-meta">
            {Math.round(result.accuracy * 100)}% 命中 · {result.hits} 击杀
          </p>
          <button type="button" className="stage-start" onClick={() => onComplete?.(result)}>
            下一轮
          </button>
        </div>
      )}
    </div>
  )
}

function formatSens(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : '—'
}

/* ------------------------------------------------------------------ */
/* scene                                                               */
/* ------------------------------------------------------------------ */

function renderScene(ctx, { sim, idle, phase, countdownLeft, w, h, now }) {
  if (!w || !h) return

  const cam = sim ? sim.cam : IDLE_CAM

  // The range is static geometry, so it is rendered into an offscreen layer and
  // only re-rendered when the camera moves enough to matter. Repainting ~3,000
  // checker cells every frame set the frame time at seconds, not milliseconds;
  // quantizing the camera to a fraction of a degree makes a still or slow-turning
  // view free, and a fast flick costs one background rebuild per step.
  drawCachedBackground(ctx, w, h, cam)

  // Balls go in after the room but before the vignette, so they sit on the wall
  // rather than floating over a darkened frame edge.
  const targets =
    phase === 'idle' ? idle : sim && (phase === 'countdown' || phase === 'running') ? sim.targets : null

  drawTargets(ctx, cam, targets, w, h, now, phase === 'idle' ? 0.9 : 1)
  if (sim && phase === 'running') drawEffects(ctx, sim, now)

  if (sim) {
    const flash = sim.hitAt ? Math.max(0, 1 - (now - sim.hitAt) / HIT_FLASH_MS) : 0
    drawCrosshair(ctx, w / 2, h / 2, flash, h, phase === 'running' || phase === 'idle')
  } else {
    drawCrosshair(ctx, w / 2, h / 2, 0, h, phase === 'idle')
  }

  if (phase === 'countdown') {
    drawCountdown(ctx, w, h, countdownLeft)
  }
}

// Background cache. `step` is roughly a third of a degree: a 1080p frame is
// about 26 px/degree, so a step moves the image under 9 px — and the cache is
// rebuilt the moment the camera moves past it, so the error never accumulates.
const BG_STEP = (0.35 * Math.PI) / 180
const bgCache = { canvas: null, w: 0, h: 0, yaw: NaN, pitch: NaN, dpr: 1 }

function drawCachedBackground(ctx, w, h, cam) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const yawQ = Math.round(cam.yaw / BG_STEP) * BG_STEP
  const pitchQ = Math.round(cam.pitch / BG_STEP) * BG_STEP

  const stale =
    !bgCache.canvas ||
    bgCache.w !== w ||
    bgCache.h !== h ||
    bgCache.dpr !== dpr ||
    bgCache.yaw !== yawQ ||
    bgCache.pitch !== pitchQ

  if (stale) {
    if (!bgCache.canvas) bgCache.canvas = document.createElement('canvas')
    const c = bgCache.canvas
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr)
      c.height = Math.round(h * dpr)
    }
    const bctx = c.getContext('2d')
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    bctx.clearRect(0, 0, w, h)
    drawRoom(bctx, w, h, { yaw: yawQ, pitch: pitchQ })

    bgCache.w = w
    bgCache.h = h
    bgCache.dpr = dpr
    bgCache.yaw = yawQ
    bgCache.pitch = pitchQ
  }

  ctx.drawImage(bgCache.canvas, 0, 0, w, h)
}

const IDLE_CAM = { yaw: 0, pitch: 0 }

/**
 * Draw the range. Surfaces go back-to-front so overdraw stays bounded: sky,
 * then the room's six planes, then the props, then the balls sitting on the wall
 * behind everything.
 */
function drawRoom(ctx, w, h, cam) {
  const focal = focalFor(h)
  const room = roomSurfaces()

  // Sky: a flat gradient above the roof lip. Drawn first, so anything the room
  // covers simply hides it.
  drawSky(ctx, w, h)

  // Floor, before the walls: its checkers are the brightest thing in frame and
  // they run under the wall's base, so the skirt line reads as a shadow.
  //
  // Floor and ceiling use a coarser cell than the walls. Perspective already
  // magnifies the near floor enormously, so a wall-sized cell there would be a
  // few dozen huge quads at the bottom of the frame and thousands of slivers at
  // the horizon; doubling the cell halves the quad count on the two largest
  // surfaces without changing how the texture reads.
  fillSurface(ctx, room.floor, cam, w, h, focal, COLORS.floor)
  drawChecker(ctx, room.floor, cam, w, h, focal, {
    a: COLORS.checkerLight,
    b: COLORS.checkerDark,
  }, FLOOR_CELL)
  drawLightShaft(ctx, cam, w, h, focal)

  // Side walls, then the back wall: the back wall is the far surface, so it is
  // painted after the sides to win the pixels along the corner seam.
  for (const side of ['left', 'right']) {
    fillSurface(ctx, room[side], cam, w, h, focal, COLORS.sideWall)
    drawChecker(ctx, room[side], cam, w, h, focal, {
      a: COLORS.checkerLight,
      b: COLORS.checkerDark,
    })
    drawWallBase(ctx, room[side], cam, w, h, focal)
  }

  // Back wall, in its three bands.
  const back = room.back
  const upper = band(back, WALL_BANDS.upper[0], WALL_BANDS.upper[1])
  const moulding = band(back, WALL_BANDS.moulding[0], WALL_BANDS.moulding[1])
  const lower = band(back, WALL_BANDS.lower[0], WALL_BANDS.lower[1])

  fillSurface(ctx, lower, cam, w, h, focal, COLORS.wallLower)
  drawChecker(ctx, lower, cam, w, h, focal, {
    a: COLORS.checkerLight,
    b: COLORS.checkerDark,
  })
  fillSurface(ctx, moulding, cam, w, h, focal, COLORS.wallMoulding)
  fillSurface(ctx, upper, cam, w, h, focal, COLORS.wallUpper)
  drawChecker(ctx, upper, cam, w, h, focal, {
    a: COLORS.checkerLight,
    b: COLORS.checkerDark,
  })

  // A hairline under the moulding sells it as a projecting lip rather than a
  // colour change on one flat plane.
  ctx.strokeStyle = 'rgba(40,46,52,0.3)'
  ctx.lineWidth = 2
  ctx.beginPath()
  edgeLine(ctx, back, WALL_BANDS.moulding[0], cam, w, h, focal)
  ctx.stroke()

  drawProps(ctx, cam, w, h, focal)

  // Roof last among the room planes: it hangs over the wall tops, and its lip
  // against the sky is the line the player sees when looking up.
  drawRoof(ctx, room.ceiling, cam, w, h, focal)

  drawVignette(ctx, w, h)
}

function drawSky(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h * 0.5)
  g.addColorStop(0, COLORS.sky[0])
  g.addColorStop(1, COLORS.sky[1])
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h * 0.55)
}

/**
 * The roof slab.
 *
 * With the camera at eye level in a normal-height room, the roof's underside
 * covers the entire upper half of the frame — its near edge projects far above
 * the top and its far edge meets the back wall's top. So there is no gap for sky
 * to show through from a level view; sky is only revealed by looking up past the
 * roof's near edge, which the pitch clamp prevents.
 *
 * An earlier version cut the roof short of the back wall to expose a strip of
 * sky, which from a level view produced a blue band straight across the frame —
 * the projected gap landed on screen as a stripe rather than as depth.
 */
function drawRoof(ctx, surf, cam, w, h, focal) {
  fillSurface(ctx, surf, cam, w, h, focal, COLORS.ceiling)
  drawChecker(ctx, surf, cam, w, h, focal, {
    a: COLORS.checkerLight,
    b: COLORS.checkerDark,
  }, FLOOR_CELL)

  // A soft contact shadow where the roof meets the back wall, so the corner
  // reads as a real edge instead of two coplanar greys meeting in a line.
  ctx.strokeStyle = 'rgba(70,76,82,0.35)'
  ctx.lineWidth = 3
  ctx.beginPath()
  segment(
    ctx,
    { x: -ROOM.halfX, y: ROOM.ceilY, z: ROOM.backZ },
    { x: ROOM.halfX, y: ROOM.ceilY, z: ROOM.backZ },
    cam,
    w,
    h,
    focal,
  )
  ctx.stroke()
}

function fillSurface(ctx, surf, cam, w, h, focal, fill) {
  const poly = projectPolygon(corners(surf), cam, w, h, focal)
  if (!poly) return
  ctx.beginPath()
  poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
}

/**
 * World-space checkerboard on a surface.
 *
 * This is the piece that makes the range read as a room instead of a backdrop:
 * cells are sized in world units, so their on-screen size falls off with depth
 * and they shear correctly along a side wall. A screen-space pattern would stay
 * the same size however far away the wall was, and the brain reads that as a
 * flat picture.
 *
 * Performance is the whole story here, and it is why the loop looks the way it
 * does. Rotating every cell's corners into camera space is eight trig calls per
 * cell, and at ~11,000 cells that alone ran a frame in 16 seconds. Camera space
 * is linear, so the surface is rotated once and each cell's corners come from
 * interpolating between the rotated surface corners — no trig per cell.
 *
 * A tiled-texture version was also tried and abandoned: canvas has no
 * perspective-correct drawImage, and driving a per-triangle affine warp through
 * pattern.setTransform never produced a frame at all.
 */
function drawChecker(ctx, surf, cam, w, h, focal, colors, cell = CHECKER_SIZE) {
  const uN = Math.max(1, Math.round(surf.uLen / cell))
  const vN = Math.max(1, Math.round(surf.vLen / cell))

  // Rotate the surface's four corners into camera space once. Because the
  // rotation is linear in the corner positions, camera-space (s,t) is a bilinear
  // blend of these, so every cell below is pure arithmetic.
  const c00 = toCamera(pointOn(surf, 0, 0), cam)
  const c10 = toCamera(pointOn(surf, 1, 0), cam)
  const c01 = toCamera(pointOn(surf, 0, 1), cam)
  const c11 = toCamera(pointOn(surf, 1, 1), cam)

  const buf = scratch
  for (const parity of [0, 1]) {
    ctx.beginPath()
    for (let j = 0; j < vN; j += 1) {
      const t0 = j / vN
      const t1 = (j + 1) / vN
      for (let i = 0; i < uN; i += 1) {
        if ((i + j) % 2 !== parity) continue
        const s0 = i / uN
        const s1 = (i + 1) / uN
        addCell(cam, w, h, focal, buf, c00, c10, c01, c11, s0, t0, s1, t1)
        if (buf.count < 3) continue
        for (let k = 0; k < buf.count; k += 1) {
          const q = buf.pts[k]
          if (k === 0) ctx.moveTo(q.x, q.y)
          else ctx.lineTo(q.x, q.y)
        }
        ctx.closePath()
      }
    }
    ctx.fillStyle = parity === 0 ? colors.a : colors.b
    ctx.fill()
  }
}

// Reused across cells so a frame allocates no per-cell arrays.
const scratch = { pts: Array.from({ length: 8 }, () => ({ x: 0, y: 0, z: 0 })), count: 0 }

/**
 * Project one cell of a surface and write its clipped outline into `buf`.
 *
 * Camera-space corners are bilinear blends of the surface's four rotated
 * corners. Every corner is in front of the near plane for the surfaces this room
 * has when the camera is inside it, so the common path is a plain projection
 * with no clipping; the near-plane case is handled by the room's geometry rather
 * than per cell.
 */
function addCell(cam, w, h, focal, buf, c00, c10, c01, c11, s0, t0, s1, t1) {
  buf.count = 0
  const cx = w / 2
  const cy = h / 2

  // Four corners in (s,t) order: (s0,t0) (s1,t0) (s1,t1) (s0,t1).
  const coords = [
    [s0, t0],
    [s1, t0],
    [s1, t1],
    [s0, t1],
  ]

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  for (let i = 0; i < 4; i += 1) {
    const [s, t] = coords[i]
    const p = buf.pts[i]
    p.x = blend(c00.x, c10.x, c01.x, c11.x, s, t)
    p.y = blend(c00.y, c10.y, c01.y, c11.y, s, t)
    p.z = blend(c00.z, c10.z, c01.z, c11.z, s, t)
    if (p.z < NEAR_Z) return
    const sx = cx + (p.x / p.z) * focal
    const sy = cy - (p.y / p.z) * focal
    p.x = sx
    p.y = sy
    if (sx < minX) minX = sx
    if (sx > maxX) maxX = sx
    if (sy < minY) minY = sy
    if (sy > maxY) maxY = sy
  }

  // Wholly off screen: the cheapest possible rejection, and the common case for
  // every surface except the one being looked at.
  if (maxX < 0 || minX > w || maxY < 0 || minY > h) return

  buf.count = 4
}

/** Bilinear blend of a surface-corner attribute at surface coords (s, t). */
function blend(a00, a10, a01, a11, s, t) {
  return a00 * (1 - s) * (1 - t) + a10 * s * (1 - t) + a01 * (1 - s) * t + a11 * s * t
}

function edgeLine(ctx, surf, y, cam, w, h, focal, tOverride = null) {
  const t = tOverride ?? (y - surf.o.y) / surf.v.y
  segment(ctx, pointOn(surf, 0, t), pointOn(surf, 1, t), cam, w, h, focal)
}

/** Darker skirt where a side wall meets the floor. */
function drawWallBase(ctx, surf, cam, w, h, focal) {
  const strip = band(surf, ROOM.floorY, ROOM.floorY + 0.45)
  fillSurface(ctx, strip, cam, w, h, focal, 'rgba(52,58,64,0.28)')
}

/**
 * The daylight on the floor. A soft white wash inside a hard-edged shaft, plus a
 * second, dimmer bounce rectangle offset inside it — the footage shows the light
 * falling off rather than a uniform patch.
 */
function drawLightShaft(ctx, cam, w, h, focal) {
  const poly = projectPolygon(lightShaft(), cam, w, h, focal)
  if (!poly) return

  ctx.save()
  ctx.beginPath()
  poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.closePath()
  ctx.clip()

  // The lit floor is brighter than bare floor but not white: it is a wash over
  // the same checker, and letting the checker show through is what makes the
  // light sit on a surface.
  const grad = ctx.createLinearGradient(0, h * 0.45, 0, h)
  grad.addColorStop(0, 'rgba(246,246,238,0.62)')
  grad.addColorStop(1, 'rgba(246,246,238,0.3)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

function drawProps(ctx, cam, w, h, focal) {
  const boxes = [...PROPS.cornerBlocks, ...PROPS.pilasters]
  // Sort by distance from the camera so near blocks overlap far ones.
  const withDepth = boxes
    .map((b) => {
      const c = {
        x: (b.min.x + b.max.x) / 2,
        y: (b.min.y + b.max.y) / 2,
        z: (b.min.z + b.max.z) / 2,
      }
      return { b, z: toCamera(c, cam).z }
    })
    .sort((a, b) => b.z - a.z)

  for (const { b, z } of withDepth) {
    if (z < NEAR_Z) continue
    const faces = boxFaces(b.min, b.max)
    // Order the faces far to near for this box.
    const order = ['back', 'left', 'right', 'top', 'front']
    const sorted = order
      .map((k) => ({ k, f: faces[k] }))
      .sort((p, q) => faceDepth(q.f) - faceDepth(p.f))
    for (const { k, f } of sorted) {
      const shade = k === 'top' ? COLORS.prop : k === 'front' ? COLORS.propSide : COLORS.propSide
      fillSurface(ctx, f, cam, w, h, focal, shade)
      drawChecker(ctx, f, cam, w, h, focal, {
        a: COLORS.checkerLight,
        b: COLORS.checkerDark,
      })
    }
  }
}

function faceDepth(f) {
  const c = {
    x: f.o.x + f.u.x / 2 + f.v.x / 2,
    y: f.o.y + f.u.y / 2 + f.v.y / 2,
    z: f.o.z + f.u.z / 2 + f.v.z / 2,
  }
  return c.z
}

function segment(ctx, a, b, cam, w, h, focal) {
  const seg = projectSegment(a, b, cam, w, h, focal)
  if (!seg) return
  ctx.moveTo(seg.x1, seg.y1)
  ctx.lineTo(seg.x2, seg.y2)
}

function drawVignette(ctx, w, h) {
  const g = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.46,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.8,
  )
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.1)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

let sphereSprite = null

/**
 * One shaded sphere, drawn once and blitted — cheaper than six gradients a frame.
 *
 * The footage's target is nearly flat: a cyan ball with a small darker rim and a
 * faint highlight, no bloom. An earlier version carried a wide glow, which read
 * as "target is closer than the wall" and made the ball look bigger than it was.
 */
function getSphere() {
  if (sphereSprite) return sphereSprite
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.42

  const body = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r)
  body.addColorStop(0, '#7ff3f5')
  body.addColorStop(0.55, '#2fd8e2')
  body.addColorStop(1, '#0f8fa2')
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, TAU)
  ctx.fill()

  // A one-pixel dark edge keeps the ball distinct against the pale floor when
  // it drifts down the wall.
  ctx.strokeStyle = 'rgba(6,52,60,0.55)'
  ctx.lineWidth = size * 0.035
  ctx.beginPath()
  ctx.arc(cx, cy, r - ctx.lineWidth / 2, 0, TAU)
  ctx.stroke()

  sphereSprite = canvas
  return canvas
}

function drawTargets(ctx, cam, targets, w, h, now, alpha) {
  if (!targets) return
  const sprite = getSphere()
  const radius = targetRadiusPx(w, h)
  // The sprite's sphere occupies 84% of its edge; scale so the drawn sphere
  // lands exactly on `radius`.
  const scale = 1 / 0.84

  for (const target of targets) {
    const p = project(target, cam, w, h)
    // Targets outside the view are simply not drawn; with six in the field the
    // player always has something to shoot at.
    if (!p) continue
    if (p.x < -radius * 3 || p.x > w + radius * 3) continue
    if (p.y < -radius * 3 || p.y > h + radius * 3) continue

    const age = now - (target.bornAt ?? 0)
    const grow = age < SPAWN_MS ? 0.55 + 0.45 * easeOut(age / SPAWN_MS) : 1
    const d = radius * 2 * grow * scale

    ctx.globalAlpha = alpha
    ctx.drawImage(sprite, p.x - d / 2, p.y - d / 2, d, d)
  }
  ctx.globalAlpha = 1
}

function drawEffects(ctx, sim, now) {
  if (!sim.effects.length) return
  sim.effects = sim.effects.filter((e) => now - e.at < RING_MS)

  for (const e of sim.effects) {
    const t = (now - e.at) / RING_MS
    const out = easeOut(t)

    ctx.globalAlpha = (1 - t) * 0.32
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(e.x, e.y, e.r * (0.7 + 0.9 * out), 0, TAU)
    ctx.fill()

    ctx.globalAlpha = (1 - t) * 0.8
    ctx.strokeStyle = '#9ff4f8'
    ctx.lineWidth = 2.2 * (1 - t) + 0.4
    ctx.beginPath()
    ctx.arc(e.x, e.y, e.r * (0.8 + 2 * out), 0, TAU)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function drawCrosshair(ctx, cx, cy, flash, h, visible) {
  if (!visible) return
  // Scaled off the frame so the reticle keeps Sixshot's proportions — smaller
  // than the ball it is aiming at, not a HUD-sized cross.
  const k = Math.max(0.7, Math.min(1.8, h / 900))
  const gap = 2 * k
  const arm = 4.5 * k
  const marks = [
    [cx - gap - arm, cy, cx - gap, cy],
    [cx + gap, cy, cx + gap + arm, cy],
    [cx, cy - gap - arm, cx, cy - gap],
    [cx, cy + gap, cx, cy + gap + arm],
  ]

  ctx.lineCap = 'butt'
  // Dark underlay keeps the crosshair legible on top of a cyan target.
  for (const [color, width] of [
    ['rgba(4,8,11,0.8)', 3.2 * k],
    ['rgba(255,255,255,0.96)', 1.3 * k],
  ]) {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    for (const [x1, y1, x2, y2] of marks) {
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
    }
    ctx.stroke()
  }

  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.beginPath()
  ctx.arc(cx, cy, 0.9 * k, 0, TAU)
  ctx.fill()

  if (flash > 0) {
    ctx.lineCap = 'round'
    const inner = (4 + (1 - flash) * 3) * k
    const outer = inner + 6 * k
    for (const [color, width] of [
      [`rgba(6,10,14,${0.5 * flash})`, 3.4 * k],
      [`rgba(255,255,255,${0.95 * flash})`, 1.6 * k],
    ]) {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.beginPath()
      for (const [sx, sy] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        ctx.moveTo(cx + sx * inner, cy + sy * inner)
        ctx.lineTo(cx + sx * outer, cy + sy * outer)
      }
      ctx.stroke()
    }
  }
}

function drawCountdown(ctx, w, h, remaining) {
  ctx.fillStyle = 'rgba(5,8,12,0.5)'
  ctx.fillRect(0, 0, w, h)

  const size = Math.round(Math.min(w, h) * 0.17)
  const cx = w / 2
  const cy = h / 2
  const frac = (remaining % 1000) / 1000 || 1
  const n = Math.max(1, Math.ceil(remaining / 1000))

  ctx.strokeStyle = 'rgba(255,255,255,0.14)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, size * 0.95, 0, TAU)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(255,255,255,0.8)'
  ctx.beginPath()
  ctx.arc(cx, cy, size * 0.95, -Math.PI / 2, -Math.PI / 2 + TAU * frac)
  ctx.stroke()

  ctx.fillStyle = '#eef4fb'
  ctx.font = `700 ${size}px ui-monospace, 'SF Mono', Consolas, monospace`
  ctx.textAlign = 'center'
  // Alphabetical baseline plus half a cap height centres the glyph optically;
  // 'middle' rides high because the em box carries more space above than below.
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(String(n), cx, cy + size * 0.355)
}

function easeOut(t) {
  return 1 - (1 - Math.max(0, Math.min(1, t))) ** 3
}
