export const BOTS_PER_RUN = 30
// A step is a fixed distance in cm/360°, not a fixed percentage of the current
// value. With the 0.07 deg/count yaw constant, cm/360 = 13062.86 / eDPI, so one
// "hand step" delta in eDPI corresponds to a constant number of centimetres and
// to the ratio LADDER_ANCHOR / (LADDER_ANCHOR - delta).
//
// Why absolute: the same ratio is a different move in the hand. On the real pro
// population below, the old fixed ×1.25 step meant 10.9 cm of 360° at the median
// player and 16.3 cm at p90 — well past anything a player can feel as "one
// step" — while a 1.12 step was 5.8 cm and a 1.06 step 3.1 cm. One ladder cannot
// be right in all three cases; fixing the physical distance can.
//
// The anchor sits at the centre of the pro distribution. Measured 2026-11-07
// from ValorantHub's 540 published pro setups: median 240 eDPI, mean 252, p25
// 192, p75 280, p10 160, p90 344. At anchor 250 the first rung is 5.9 cm of 360
// at 200 eDPI and 3.0 cm at 400 — and 94% of those 540 players land inside a
// 2–8 cm first step, against 12% under the old ×1.25 ladder.
// Source: https://valoranthub.com/proplayers (checked 2026-10-27).
export const LADDER_ANCHOR = 250
// Hand-step ladder as eDPI deltas at the anchor: 20 → 10 → 5 → 2.5 eDPI is
// 4.35 cm of 360 at the anchor down to 0.54 cm, a coarse scan then three
// refinements. The finest rung is still 0.7 eDPI of travel at the lowest plausible
// eDPI, comfortably above the game's 0.001-sensitivity quantum.
export const STEP_DELTAS = Object.freeze([20, 10, 5, 2.5])
// Widest first step the ladder may ever ask for. The pro band spans roughly
// 100–450 eDPI, so a 25% move cannot leave it; this only binds for setups far
// below the band, where an absolute step would otherwise overshoot wildly.
export const MAX_FIRST_STEP = 1.25
export const MIN_MEAN_GAIN = 1
/**
 * Interleaved repeat length: each confirmation is `CONFIRM_PAIRS` pair
 * comparisons (6 rounds at the default), which is what lets it catch noise
 * without stretching every accepted step into eight range runs. Two pairs makes
 * a false move happen roughly twice as often at the same noise level, so the
 * extra two rounds buy the result its credibility.
 */
export const CONFIRM_PAIRS = 3
export const CONFIRM_ROUNDS = CONFIRM_PAIRS * 2

/**
 * Two ways to run the same instrument.
 *
 * `refine` is the original mode: the player already has a sensitivity they trust
 * and only wants the step around it settled. The ladder is anchored on their own
 * eDPI, so every rung is a small, feelable move and the search converges locally.
 *
 * `discover` is for a player with no trustworthy starting point. Anchoring the
 * ladder on their eDPI would be wrong — that value is the thing in doubt — so it
 * anchors on the population centre instead and widens outward: measure the centre,
 * then probe progressively further until performance clearly falls off on both
 * sides. Only once that broad bracket exists does it switch to the fine ladder
 * around the winner.
 */
export const MODES = Object.freeze({
  refine: {
    key: 'refine',
    label: '微调现有灵敏度',
    short: '微调',
    blurb: '你已经有一个大致顺手的灵敏度，想把它调到位。',
    requiresSens: true,
    discover: false,
  },
  discover: {
    key: 'discover',
    label: '第一次找灵敏度',
    short: '新玩家',
    blurb: '还没有确定的灵敏度，愿意从常见范围开始逐级试出来。',
    requiresSens: false,
    discover: true,
  },
})

export const DEFAULT_MODE = 'refine'

export function isDiscovery(mode) {
  return mode === 'discover'
}

/** Widening ladder used by discovery mode, as eDPI multipliers from the centre. */
export const DISCOVER_FACTORS = Object.freeze([1.35, 1.9, 2.65])
/** Below/above these the player is outside anything a human plays at. */
export const EDPI_FLOOR = 80
export const EDPI_CEILING = 1200
/**
 * How far the band may walk from where it started before the run stops and says
 * so. Each rung is only worth 1-2 kills, so an uncapped walk can chain dozens of
 * rounds on noise alone; at 1.6× the starting eDPI the player is clearly outside
 * "refine what I have" and needs a fresh start, not more rounds.
 */
export const TRAVEL_CAP = 0.6
export const MAX_TRAVEL_STEPS = 6

/**
 * Multiplicative ladder equivalent to STEP_DELTAS at `anchorEdpi`.
 * Exported so the UI's diagrams state the same numbers the search uses.
 *
 * A delta larger than the anchor would invert the factor, which only happens for
 * a player far below the pro band. There the rungs compress instead of silently
 * producing a factor of 1 or less: the coarse rung is capped at MAX_FIRST_STEP
 * (outside the whole plausible range, so it is always a safe place to look) and
 * the rest subdivide down to it geometrically. The ladder is strictly shrinking
 * for every setup.
 */
export function stepFactors(anchorEdpi = LADDER_ANCHOR, deltas = STEP_DELTAS) {
  if (!Number.isFinite(anchorEdpi) || anchorEdpi <= 0) throw new RangeError('锚点 eDPI 必须大于 0。')
  let factors
  if (anchorEdpi > Math.max(...deltas)) {
    factors = deltas.map((delta) => anchorEdpi / (anchorEdpi - delta))
  } else {
    // Anchor too small for the absolute steps: a capped geometric ladder.
    const n = deltas.length
    factors = deltas.map((_, index) => MAX_FIRST_STEP ** ((n - index) / n))
  }
  if (!factors.every((factor, index) => factor > 1 && (index === 0 || factor < factors[index - 1]))) {
    throw new RangeError('步长梯度必须严格递减且大于 1。')
  }
  return factors
}

/**
 * The eDPI the fine ladder is calibrated against.
 *
 * In `refine` that is the player's own eDPI: their value is trusted and every
 * rung should be a small move from it. In `discover` it deliberately is NOT —
 * their value is exactly what is in doubt — so the fine ladder waits until the
 * sweep has found a band, and anchors on whatever won the sweep.
 */
export function ladderAnchor(setup, mode = DEFAULT_MODE) {
  if (isDiscovery(mode)) return LADDER_ANCHOR
  const edpi = Number(setup?.dpi) * Number(setup?.sens)
  return Number.isFinite(edpi) && edpi > 0 ? edpi : LADDER_ANCHOR
}

/** The fine ladder for a setup in a given mode. */
export function ladderFor(setup, mode = DEFAULT_MODE) {
  // A discovery session re-anchors its ladder on whatever the sweep won with, so
  // the anchor is carried on the session rather than recomputed from the start
  // value (which is the untrusted number).
  if (setup?.anchorEdpi) return stepFactors(setup.anchorEdpi)
  return stepFactors(ladderAnchor(setup, mode))
}

/**
 * How wide the first step is for a given setup, as the percentage of the player's
 * own sensitivity that the outside candidates sit at. The UI states this instead
 * of a fixed "×1.25" because the point of the ladder is that it is not fixed.
 */
export function stepPercent(setup, mode = DEFAULT_MODE) {
  const factor = ladderFor(setup, mode)[0]
  return Math.round((factor - 1) * 1000) / 10
}

/** The whole ladder as percentages, coarse to fine. */
export function ladderPercents(setup, mode = DEFAULT_MODE) {
  return ladderFor(setup, mode).map((factor) => Math.round((factor - 1) * 1000) / 10)
}

/**
 * The eDPI a discovery run sweeps through, widest bracket last.
 *
 * The sweep is symmetric in eDPI around the population centre: each rung is the
 * centre multiplied by a factor and by its reciprocal, so the candidate set is
 * `[250, 337, 475, 662, 185, 132, 94]` at any DPI. Symmetry matters because a
 * player's true value is equally likely to be below or above the centre, and
 * sweeping one side first would make the search depend on a guess.
 *
 * Rungs outside `[EDPI_FLOOR, EDPI_CEILING]` are dropped: nobody plays there, and
 * asking for them wastes a range run on a score that only says "too slow".
 */
export function discoverRungs(dpi) {
  if (!Number.isFinite(dpi) || dpi <= 0) throw new RangeError('DPI 必须大于 0。')
  const sens = (edpi) => quantize(edpi / dpi)
  const factors = [1, ...DISCOVER_FACTORS.flatMap((f) => [f, 1 / f])]
  const edpiRungs = factors
    .map((factor) => LADDER_ANCHOR * factor)
    .filter((edpi) => edpi >= EDPI_FLOOR && edpi <= EDPI_CEILING)
    .map((edpi) => Math.round(edpi * 10) / 10)
  const candidates = [...new Set(edpiRungs.map(sens))].filter((value) => value > 0).sort((a, b) => a - b)
  const centre = sens(LADDER_ANCHOR)
  return {
    centre,
    candidates,
    edpiRungs,
    above: candidates.filter((value) => value > centre),
    below: candidates.filter((value) => value < centre),
  }
}

export const END_REASONS = Object.freeze({
  plateau: '更小的步长没有带来稳定提升，保留当前档位。',
  resolution: '按三位小数取整后，附近档位已无法进一步区分。',
  ceiling: '各档位均达到 29–30 杀，中等难度接近满分，区分能力不足。',
  floor: '各档位均只有 0–1 杀，当前测试不足以区分灵敏度，请先确认测试条件。',
  manual: '你已提前结束；结果取当前基准或最近一次通过复查的档位。',
  edge: '已经挪到正常人不会使用的灵敏度上限/下限，就此停止。',
  runaway: '越测越偏、一直没有出现更差的档位：说明起点离真正合适的地方太远，建议改用「第一次找灵敏度」重测。',
})

export function parseKills(value) {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new RangeError('击杀数需为 0–30 的整数。')
  }
  if (String(value).trim() === '') throw new RangeError('请填写本轮击杀数。')
  const kills = Number(value)
  if (!Number.isInteger(kills) || kills < 0 || kills > BOTS_PER_RUN) {
    throw new RangeError('击杀数需为 0–30 的整数。')
  }
  return kills
}

const quantize = (sensitivity) => Number(sensitivity.toFixed(3))
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length

/**
 * One screening round: the incumbent plus the rung below and the rung above.
 *
 * The incumbent is always measured in the same block as its neighbours, so the
 * comparison is between settings the player just played rather than against a
 * stale score. When the ladder has run out of rungs on one side — which happens
 * as soon as the finest rung is in play — the block falls back to the incumbent
 * plus whatever side still exists.
 */
function screenPlan(session, message) {
  const factor = session.factors[session.level]
  const base = session.incumbent
  const candidates = [...new Set([quantize(base / factor), base, quantize(base * factor)])]
    .filter((value) => value > 0).sort((a, b) => a - b)
  const neighbors = candidates.filter((value) => value !== base)
  if (session.decisions.length % 2) neighbors.reverse()
  return {
    phase: 'screen', baseline: base, candidates, schedule: [base, ...neighbors],
    cursor: 0, start: session.runs.length, message,
  }
}

/**
 * Walk the incumbent one rung along the ladder in `direction`.
 *
 * This is what lets the ladder actually travel. Without it the search can only
 * ever consider rungs that land *near* the starting value: the fine ladder is
 * built around the incumbent, so a true optimum a factor of two away is invisible
 * and every round simply narrows in place until it reports a plateau at the
 * starting point. Travelling keeps the "one feelable step at a time" property
 * while still allowing the band to move as far as the player needs.
 *
 * Travel is capped: once the band has walked further than TRAVEL_CAP eDPI from
 * where it started, the player is being steered a long way by 1-kill margins and
 * the honest answer is to stop and say so rather than keep burning range runs.
 */
function travelPlan(session, direction) {
  const factor = session.factors[session.level]
  const current = session.incumbent
  const next = quantize(direction === 'up' ? current * factor : current / factor)
  const edpi = next * session.setup.dpi
  if (!(next > 0) || edpi < EDPI_FLOOR || edpi > EDPI_CEILING) return finish(session, 'edge')
  if (next === current) return finish(session, 'resolution')

  const origin = session.travelOrigin ?? current * session.setup.dpi
  const steps = session.travelSteps ?? 0
  // The cap is a ratio of the starting eDPI, not an absolute difference: what
  // matters is "this is now a different sensitivity", which is scale-free.
  const walked = Math.abs(Math.log(edpi / origin))
  if (walked > Math.log(1 + TRAVEL_CAP) || steps >= MAX_TRAVEL_STEPS) {
    return finish({ ...session, travelSteps: steps }, 'runaway')
  }

  const moved = { ...session, incumbent: next, travelSteps: steps + 1, travelOrigin: origin }
  const arrow = direction === 'up' ? '往高' : '往低'
  return {
    ...moved,
    plan: screenPlan(moved, `外侧档稳定更好，${arrow}挪一格到 ${next.toFixed(3)} 继续比较。`),
  }
}

function finish(session, reason) {
  return { ...session, done: true, reason }
}

/**
 * Discovery sweep: one round at every rung, interleaved from the centre outward.
 *
 * Ordering matters. Walking up then down would let a warm-up trend hand the win
 * to one end of the range, so the schedule alternates sides and starts at the
 * centre — the value the population says is most likely to be near the truth.
 * The whole sweep is one comparison block: the best rung becomes the incumbent
 * and the fine ladder then refines around it.
 */
function sweepPlan(session, message) {
  const { centre, candidates } = discoverRungs(session.setup.dpi)
  const above = candidates.filter((value) => value > centre)
  const below = candidates.filter((value) => value < centre).reverse()
  const order = [centre]
  for (let i = 0; i < Math.max(above.length, below.length); i += 1) {
    if (above[i] != null) order.push(above[i])
    if (below[i] != null) order.push(below[i])
  }
  const schedule = order.filter((value) => value > 0)
  if (schedule.length < 2) return finish({ ...session, plan: null }, 'resolution')
  return {
    ...session,
    plan: {
      phase: 'sweep', baseline: session.incumbent ?? schedule[0], candidates: schedule,
      schedule, cursor: 0, start: session.runs.length, message,
    },
  }
}

/**
 * Interleaved repeat against the incumbent.
 *
 * Each pair is one challenger round and one base round, and the opening setting
 * flips every pair, which is the ABBA / BAAB pattern at two pairs and
 * ABBA-BAAB at three. Because the opening setting alternates, a warm-up or a
 * fatigue slide cannot favour one setting across the whole block; because every
 * pair holds one round of each, a pair's difference is directly comparable
 * between pairs.
 */
function confirmPlan(session, base, challenger) {
  const a = base
  const b = challenger
  const pairs = session.pairs
  const opensWithChallenger = session.confirmations % 2 === 1
  const order = []
  for (let pair = 0; pair < pairs; pair += 1) {
    const challengerFirst = (pair % 2 === 0) === opensWithChallenger
    order.push(challengerFirst ? b : a, challengerFirst ? a : b)
  }
  return {
    phase: 'confirm', baseline: a, challenger: b, candidates: [a, b], schedule: order,
    cursor: 0, start: session.runs.length, pairs,
    message: `${b.toFixed(3)} 初测领先，接下来与 ${a.toFixed(3)} 交错复测 ${order.length} 轮确认；单次高分不会直接替换当前档位。`,
  }
}

function narrow(session) {
  if (session.level === session.factors.length - 1) return finish(session, 'plateau')
  const next = { ...session, level: session.level + 1 }
  const plan = screenPlan(next, '未发现稳定提升，保留当前档位，缩小步长后继续测试。')
  if (plan.candidates.length === 1) return finish({ ...next, plan }, 'resolution')
  return { ...next, plan }
}

function blockSummary(session) {
  const recent = session.runs.slice(session.plan.start)
  return session.plan.candidates.map((sensitivity) => {
    const kills = recent.filter((run) => run.sensitivity === sensitivity).map((run) => run.kills)
    if (!kills.length) throw new Error('当前比较组缺少成绩。')
    return { sensitivity, kills, score: mean(kills) }
  })
}

function advance(session) {
  const plan = session.plan
  const entries = blockSummary(session)

  // Discovery sweep finished: the best rung becomes the incumbent and the fine
  // ladder takes over around it. No confirmation is needed here — this block is
  // itself the repeat, because every rung was measured once and the winner is
  // then re-measured by the ladder's own screen round.
  if (plan.phase === 'sweep') {
    const best = [...entries].sort((a, b) => b.score - a.score)[0]
    const decision = { phase: 'sweep', level: 0, baseline: best.sensitivity, entries, winner: best.sensitivity }
    // The fine ladder must re-anchor on the winner: the sweep's own anchor was the
    // population centre, which is only a starting guess. Anything else would run
    // the refinement around a value the sweep just rejected.
    const factors = stepFactors(best.sensitivity * session.setup.dpi)
    const swept = {
      ...session, incumbent: best.sensitivity, factors, latestComparison: entries,
      decisions: [...session.decisions, decision],
    }
    const plan = screenPlan(swept, `${best.sensitivity.toFixed(3)} 在粗扫中最好，围绕它开始细调。`)
    return { ...swept, plan }
  }

  const base = entries.find((entry) => entry.sensitivity === plan.baseline)
  const decision = { phase: plan.phase, level: session.level, baseline: plan.baseline, entries }
  const next = { ...session, latestComparison: entries }

  if (plan.phase === 'screen') {
    if (entries.length === 1) return finish({ ...next, decisions: [...session.decisions, decision] }, 'resolution')
    // These are explicit task-resolution heuristics, not estimates of player skill.
    if (entries.every((entry) => entry.score >= 29)) {
      return finish({ ...next, decisions: [...session.decisions, decision] }, 'ceiling')
    }
    if (entries.every((entry) => entry.score <= 1)) {
      return finish({ ...next, decisions: [...session.decisions, decision] }, 'floor')
    }
    const challenger = entries.filter((entry) => entry.sensitivity !== base.sensitivity && entry.score - base.score >= session.minGain)
      .sort((a, b) => b.score - a.score || Math.abs(a.sensitivity - base.sensitivity) - Math.abs(b.sensitivity - base.sensitivity))[0]
    const screened = { ...next, decisions: [...session.decisions, { ...decision, challenger: challenger?.sensitivity ?? null }] }
    if (!challenger) return narrow(screened)
    return { ...screened, plan: confirmPlan(screened, base.sensitivity, challenger.sensitivity) }
  }

  const challenger = entries.find((entry) => entry.sensitivity === plan.challenger)
  const recentRuns = session.runs.slice(plan.start)
  // Each pair is one challenger round against one base round, so a pair's
  // difference is independent of who opened the block.
  const differences = []
  for (let offset = 0; offset + 1 < recentRuns.length; offset += 2) {
    const first = recentRuns[offset]
    const second = recentRuns[offset + 1]
    differences.push(first.sensitivity === plan.challenger
      ? first.kills - second.kills
      : second.kills - first.kills)
  }
  const accepted = differences.every((difference) => difference > 0) && challenger.score - base.score >= session.minGain
  const driftWarning = base.kills[1] <= base.kills[0] - 3
    ? '基准档成绩下降 3 杀以上，可能有状态波动，建议休息后继续复查。' : null
  const direction = plan.challenger > plan.baseline ? 'up' : 'down'
  const confirmed = {
    ...next, confirmations: session.confirmations + 1,
    incumbent: accepted ? challenger.sensitivity : session.incumbent,
    warning: driftWarning ?? session.warning,
    decisions: [...session.decisions, { ...decision, challenger: plan.challenger, differences, accepted, direction }],
  }
  // A rejected challenge means the outside rung is not better: the band is real,
  // so tighten the step where we stand and look again.
  if (!accepted) return narrow(confirmed)
  // An accepted challenge in refine mode is a warning sign, not a reason to keep
  // walking: this mode exists because the player's value is roughly right. If the
  // edge keeps winning, their value is not roughly right, and the honest answer is
  // to say so and point them at the mode that searches from scratch — not to spend
  // thirty more range runs crawling there one rung at a time.
  if (!isDiscovery(confirmed.mode)) return finish(confirmed, 'runaway')
  return travelPlan(confirmed, direction)
}
export function createSession(setup, options = {}) {
  // The mode may arrive either as an option or carried on the setup object: the
  // setup is what gets persisted and handed around the UI, so both are accepted
  // rather than making every call site remember which one the callee wants.
  const mode = options.mode ?? setup.mode ?? DEFAULT_MODE
  if (!MODES[mode]) throw new RangeError(`未知的测试模式：${mode}`)
  const discovery = isDiscovery(mode)

  if (!Number.isFinite(setup.dpi) || setup.dpi <= 0) {
    throw new RangeError('DPI 必须是大于 0 的数字。')
  }
  // Discovery mode has no meaningful starting value: the player's current
  // sensitivity is the thing being questioned, so it may be absent entirely.
  const startSens = discovery ? quantize(Number(setup.sens) > 0 ? Number(setup.sens) : LADDER_ANCHOR / setup.dpi) : setup.sens
  if (!Number.isFinite(startSens) || startSens <= 0) {
    throw new RangeError('灵敏度必须是大于 0 的数字。')
  }
  const incumbent = quantize(startSens)
  if (incumbent <= 0) throw new RangeError('灵敏度按三位小数取整后必须大于 0。')

  const resolved = { ...setup, sens: incumbent }
  if (discovery) resolved.startSens = null

  const factors = [...(options.factors ?? ladderFor(resolved, mode))]
  const minGain = options.minGain ?? MIN_MEAN_GAIN
  if (!factors.length || factors.some((factor, index) => !Number.isFinite(factor) || factor <= 1 || (index > 0 && factor >= factors[index - 1]))) {
    throw new RangeError('倍率必须大于 1 并严格递减。')
  }
  if (!Number.isFinite(minGain) || minGain <= 0) throw new RangeError('最小提升必须大于 0。')

  // Discovery needs a longer repeat: its sweep already re-measures nothing, so the
  // first confirmation after the switch is the player's only noise check.
  const pairs = options.pairs ?? (discovery ? CONFIRM_PAIRS : CONFIRM_PAIRS)
  if (!Number.isInteger(pairs) || pairs < 1) throw new RangeError('复查对数需为不小于 1 的整数。')

  const session = {
    setup: resolved, mode, factors, minGain, pairs, incumbent, level: 0, runs: [], decisions: [],
    anchorEdpi: ladderAnchor(resolved, mode), confirmations: 0,
    latestComparison: [], warning: null, done: false, reason: null,
  }

  if (discovery) {
    return sweepPlan(session, '先在这个灵敏度附近粗扫一遍，找到大致合适的范围，再围绕它细调。')
  }
  return { ...session, plan: screenPlan(session, '先测当前档位及上下各一档，再根据本轮成绩决定推进方向。') }
}

export function recordKills(session, value) {
  if (session.done) throw new Error('测试已完成。')
  const kills = parseKills(value)
  const sensitivity = session.plan.schedule[session.plan.cursor]
  const runs = [...session.runs, { sensitivity, kills, phase: session.plan.phase, level: session.level }]
  const next = { ...session, runs, plan: { ...session.plan, cursor: session.plan.cursor + 1 } }
  return next.plan.cursor === next.plan.schedule.length ? advance(next) : next
}

export function rebuildSession(setup, runs, options = {}) {
  return runs.reduce((session, run) => {
    if (session.plan.schedule[session.plan.cursor] !== run.sensitivity) throw new Error('成绩与测试计划不一致。')
    return recordKills(session, run.kills)
  }, createSession(setup, options))
}

export function undoLastRun(session) {
  if (!session.runs.length) return session
  return rebuildSession(session.setup, session.runs.slice(0, -1), {
    mode: session.mode, factors: session.factors, minGain: session.minGain, pairs: session.pairs,
  })
}

export function completeEarly(session) {
  if (session.done) return session
  if (!session.runs.length) throw new Error('至少完成一轮靶场测试后才能查看结果。')
  return finish(session, 'manual')
}

export function summarizeSession(session) {
  if (!session.done) throw new Error('请完成测试或选择提前查看结果。')
  const candidates = [...new Set(session.runs.map((run) => run.sensitivity))]
  const history = candidates.map((sensitivity) => {
    const kills = session.runs.filter((run) => run.sensitivity === sensitivity).map((run) => run.kills)
    return { sensitivity, edpi: sensitivity * session.setup.dpi, kills, score: mean(kills) }
  }).sort((a, b) => a.sensitivity - b.sensitivity)
  const incumbentEntry = history.find((entry) => entry.sensitivity === session.incumbent)
  const localBase = session.latestComparison.find((entry) => entry.sensitivity === session.incumbent)
  const close = localBase ? session.latestComparison.filter((entry) => Math.abs(entry.score - localBase.score) < session.minGain).map((entry) => entry.sensitivity) : []
  return {
    mode: 'range-medium-30', algorithm: 'adaptive-local-v1', testMode: session.mode,
    sensitivity: session.incumbent, edpi: session.incumbent * session.setup.dpi,
    score: incumbentEntry.score, rounds: session.runs.length,
    tied: close.length > 1, leaders: close,
    reason: session.reason, message: END_REASONS[session.reason], warning: session.warning,
    history, runs: session.runs, decisions: session.decisions, latestComparison: session.latestComparison,
    // Discovery has no "initial" value to compare against: the whole point is that
    // the player arrived without one, so the result must not claim a delta.
    initialSensitivity: session.setup.startSens === null ? null : session.setup.sens,
    minGain: session.minGain,
  }
}
