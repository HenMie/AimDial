import { useCallback, useEffect, useRef, useState } from 'react'
import {
  project,
  clampPitch,
  wrapAngle,
  isHit,
  targetRadiusPx,
  FOV_Y,
} from '../lib/aimModel.js'
import {
  buildField,
  replaceTarget,
  spawnExtents,
  TARGETS_ON_FIELD,
  FIELD_ANCHOR,
} from '../lib/targets.js'
import { summarize, meanOvershoot } from '../lib/scoring.js'
import { DEG_PER_COUNT } from '../lib/sens.js'
import { usePointerLock } from '../hooks/usePointerLock.js'
import {
  focalFor,
  projectSegment,
  projectPolygon,
  roomSurfaces,
  pointOn,
  corners,
} from '../lib/room.js'

// Sixshot rules: the clock is the only win condition. The field never empties.
const ROUND_MS = 60_000
const COUNTDOWN_MS = 3000

// How long the field may sit entirely off screen before the view eases back.
const OFFVIEW_RECENTER_MS = 900
// One event this large is a pointer-lock warp or a driver spike, not a flick.
// Raw counts are much finer-grained than CSS pixels, so this is generous.
const MAX_MOVE_DELTA = 600

// HUD refresh cadence — fast enough to feel live, slow enough to skip renders.
const HUD_TICK_MS = 80
const HIT_FLASH_MS = 150
const RING_MS = 320
const SPAWN_MS = 140

// World size of one wall panel. Small, so the wall reads as a big surface seen
// from a distance rather than a backdrop a step away.
const GRID = 0.4
const TAU = Math.PI * 2

/**
 * One static-clicking round (Sixshot-style) at a fixed sensitivity: six small
 * fixed-size targets sit on a plane in front of the player at all times, and each
 * kill is replaced immediately at a fresh spot on that same plane — the view is
 * never asked to turn around, only to flick.
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

  const { locked, request } = usePointerLock(canvasRef)

  // Mutable simulation state — kept out of React to avoid re-renders per frame.
  const sim = useRef(null)
  const sizeRef = useRef({ w: 0, h: 0 })
  const idleField = useRef(null)

  // Degrees the view turns per unit of reported pointer movement. Pointer Lock
  // reports movement in CSS pixels, i.e. raw counts divided by the display
  // scale factor — on a 150% display one count arrives as 0.667px — so the
  // ratio has to be multiplied back out or the view turns too slowly.
  const countsPerUnit = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3)
  const degPerUnit = DEG_PER_COUNT * Math.max(sensitivity, 0.01) * countsPerUnit

  if (!idleField.current) {
    idleField.current = buildField(FIELD_ANCHOR, TARGETS_ON_FIELD, Math.random)
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
    const aspect = rect.height > 0 ? rect.width / rect.height : 16 / 9
    const extents = spawnExtents(FOV_Y, aspect)
    const now = performance.now()

    sim.current = {
      cam,
      width: rect.width,
      height: rect.height,
      // Spawn box follows the canvas aspect so a wide frame spreads targets
      // horizontally instead of bunching them in the middle.
      extents,
      targets: buildField(FIELD_ANCHOR, TARGETS_ON_FIELD, Math.random, extents).map((t) => ({
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
      offViewSince: 0,
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
      s.cam.yaw += e.movementX * radPerUnit
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
        // Replace the killed target so the field stays at six. The replacement
        // is anchored to the same frontal plane, never to the current view.
        s.targets = replaceTarget(s.targets, bestIndex, FIELD_ANCHOR, Math.random, s.extents).map(
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
          } else {
            driftTargetIntoView(s, now)
            if (now - lastHud >= HUD_TICK_MS) {
              lastHud = now
              publishHud(s, elapsed)
            }
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

  const leftFrac = Math.max(0, Math.min(1, hud.left / ROUND_MS))

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
          <div className="hud-timer">
            <span style={{ width: `${leftFrac * 100}%` }} data-low={hud.left < 10_000} />
          </div>
          <div className="hud-score">{Math.round(hud.score)}</div>
          {hud.shots > 0 && (
            <div className="hud-acc">{Math.round(hud.acc * 100)}%</div>
          )}
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

  // Backdrop for anything the room does not cover (a steep look up or down).
  ctx.fillStyle = '#3a3c40'
  ctx.fillRect(0, 0, w, h)

  drawRoom(ctx, w, h, cam)
  drawVignette(ctx, w, h)

  if (phase === 'idle') {
    drawTargets(ctx, cam, idle, w, h, now, 0.85)
  } else if (sim) {
    if (phase !== 'finished') {
      drawTargets(ctx, sim.cam, sim.targets, w, h, now, 1)
      drawEffects(ctx, sim, now)
    }
    const flash = sim.hitAt ? Math.max(0, 1 - (now - sim.hitAt) / HIT_FLASH_MS) : 0
    drawCrosshair(ctx, w / 2, h / 2, flash, h)
  }

  if (phase === 'countdown') {
    drawCountdown(ctx, w, h, countdownLeft)
  }
}

const IDLE_CAM = { yaw: 0, pitch: 0 }

function drawRoom(ctx, w, h, cam) {
  const focal = focalFor(h)
  const room = roomSurfaces()

  // Sixshot's arena is a lit grey box, not a void: a bright floor, mid-grey
  // walls, a darker ceiling. The tonal difference between the three surfaces is
  // what makes the wall read as a distant plane instead of a backdrop.
  fillSurface(ctx, room.ceiling, cam, w, h, focal, '#6a6c70')
  fillSurface(ctx, room.left, cam, w, h, focal, '#696b6f')
  fillSurface(ctx, room.right, cam, w, h, focal, '#696b6f')
  fillSurface(ctx, room.back, cam, w, h, focal, '#74767a')
  fillSurface(ctx, room.floor, cam, w, h, focal, '#97999c')

  // Light falls off toward the ceiling, which also keeps the top HUD readable.
  const shade = ctx.createLinearGradient(0, 0, 0, h * 0.42)
  shade.addColorStop(0, 'rgba(8,10,13,0.14)')
  shade.addColorStop(1, 'rgba(8,10,13,0)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, w, h * 0.42)

  ctx.lineWidth = 1
  drawGrid(ctx, room.back, cam, w, h, focal, 'rgba(24,28,33,0.07)', 'rgba(24,28,33,0.115)')
  drawGrid(ctx, room.left, cam, w, h, focal, 'rgba(24,28,33,0.06)', 'rgba(24,28,33,0.1)')
  drawGrid(ctx, room.right, cam, w, h, focal, 'rgba(24,28,33,0.06)', 'rgba(24,28,33,0.1)')
  drawGrid(ctx, room.floor, cam, w, h, focal, 'rgba(24,28,33,0.075)', 'rgba(24,28,33,0.125)')

  // Skirting around the base of the room anchors the corner.
  ctx.strokeStyle = 'rgba(20,24,29,0.16)'
  ctx.beginPath()
  const base = corners(room.floor)
  for (let i = 0; i < base.length; i += 1) {
    segment(ctx, base[i], base[(i + 1) % base.length], cam, w, h, focal)
  }
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

function drawGrid(ctx, surf, cam, w, h, focal, minor, major) {
  const uN = Math.max(1, Math.round(surf.uLen / GRID))
  const vN = Math.max(1, Math.round(surf.vLen / GRID))

  for (const isMajor of [false, true]) {
    ctx.strokeStyle = isMajor ? major : minor
    ctx.beginPath()
    for (let i = 0; i <= uN; i += 1) {
      if ((i % 5 === 0) !== isMajor) continue
      const s = i / uN
      segment(ctx, pointOn(surf, s, 0), pointOn(surf, s, 1), cam, w, h, focal)
    }
    for (let j = 0; j <= vN; j += 1) {
      if ((j % 5 === 0) !== isMajor) continue
      const t = j / vN
      segment(ctx, pointOn(surf, 0, t), pointOn(surf, 1, t), cam, w, h, focal)
    }
    ctx.stroke()
  }
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
    Math.min(w, h) * 0.34,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.76,
  )
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.22)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

let sphereSprite = null

/** One shaded sphere, drawn once and blitted — cheaper than six gradients a frame. */
function getSphere() {
  if (sphereSprite) return sphereSprite
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.34

  const glow = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, size / 2)
  glow.addColorStop(0, 'rgba(96,222,242,0.26)')
  glow.addColorStop(1, 'rgba(96,222,242,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, size, size)

  // Cyan, like Sixshot's default target colour: it separates from a grey wall
  // without the bloom that makes a white ball look like it is right in front.
  const body = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.4, r * 0.06, cx, cy, r * 1.04)
  body.addColorStop(0, '#d8faff')
  body.addColorStop(0.32, '#8ce6f4')
  body.addColorStop(0.72, '#38bfd6')
  body.addColorStop(1, '#12707f')
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, TAU)
  ctx.fill()

  sphereSprite = canvas
  return canvas
}

function drawTargets(ctx, cam, targets, w, h, now, alpha) {
  const sprite = getSphere()
  const radius = targetRadiusPx(w, h)
  // The sprite's sphere occupies 34% of its edge; scale so the drawn sphere
  // lands exactly on `radius` regardless of the glow margin around it.
  const scale = 1 / 0.34

  for (const target of targets) {
    const p = project(target, cam, w, h)
    // Targets outside the view are simply not drawn; with six on the field the
    // player always has something to shoot at.
    if (!p) continue
    if (p.x < -radius * 3 || p.x > w + radius * 3) continue
    if (p.y < -radius * 3 || p.y > h + radius * 3) continue

    const age = now - (target.bornAt ?? 0)
    const grow = age < SPAWN_MS ? 0.72 + 0.28 * easeOut(age / SPAWN_MS) : 1
    const fade = age < SPAWN_MS ? 0.4 + 0.6 * (age / SPAWN_MS) : 1
    const d = radius * grow * scale

    ctx.globalAlpha = alpha * fade
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

    // A short flash sells the pop now that the target itself is gone.
    ctx.globalAlpha = (1 - t) * 0.4
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(e.x, e.y, e.r * (0.7 + 0.8 * out), 0, TAU)
    ctx.fill()

    ctx.globalAlpha = (1 - t) * 0.85
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2.6 * (1 - t) + 0.5
    ctx.beginPath()
    ctx.arc(e.x, e.y, e.r * (0.9 + 2.1 * out), 0, TAU)
    ctx.stroke()

    ctx.globalAlpha = (1 - t) * 0.75
    ctx.fillStyle = '#ffffff'
    const spread = e.r * (0.5 + 2.4 * out)
    for (let i = 0; i < 5; i += 1) {
      const a = e.seed + (i * TAU) / 5
      ctx.beginPath()
      ctx.arc(e.x + Math.cos(a) * spread, e.y + Math.sin(a) * spread, 1.7 * (1 - t) + 0.6, 0, TAU)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}

function drawCrosshair(ctx, cx, cy, flash, h) {
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
    // Same dark underlay as the crosshair: a bare white tick disappears against
    // the lit wall the moment it fires.
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
  ctx.fillStyle = 'rgba(5,8,12,0.62)'
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

/**
 * If every target has left the screen, ease the camera back toward the nearest
 * one. The field itself is anchored to a fixed plane, so this only fires after a
 * wild flick — the player is never stranded on an empty wall.
 */
function driftTargetIntoView(sim, now) {
  if (!sim.targets.length) return

  const margin = 40
  const inView = sim.targets.some((t) => {
    const p = project(t, sim.cam, sim.width, sim.height)
    if (!p) return false
    return (
      p.x > -margin && p.x < sim.width + margin && p.y > -margin && p.y < sim.height + margin
    )
  })
  if (inView) {
    sim.offViewSince = 0
    return
  }
  if (!sim.offViewSince) {
    sim.offViewSince = now
    return
  }
  if (now - sim.offViewSince < OFFVIEW_RECENTER_MS) return

  // Head for whichever target is angularly closest to where we are looking.
  let nearest = sim.targets[0]
  let nearestDist = Infinity
  for (const t of sim.targets) {
    const d = Math.hypot(wrapAngle(t.yaw - sim.cam.yaw), t.pitch - sim.cam.pitch)
    if (d < nearestDist) {
      nearestDist = d
      nearest = t
    }
  }

  const dYaw = wrapAngle(nearest.yaw - sim.cam.yaw)
  const dPitch = nearest.pitch - sim.cam.pitch
  sim.cam.yaw += dYaw * 0.12
  sim.cam.pitch = clampPitch(sim.cam.pitch + dPitch * 0.12)
}

function easeOut(t) {
  return 1 - (1 - Math.max(0, Math.min(1, t))) ** 3
}
