/**
 * Adaptive sensitivity search for a 30-bot medium range run.
 *
 * The instrument is one number per round: how many of the 30 bots you killed.
 * Everything else here follows from what that number can and cannot tell you.
 *
 * 1. Every round is noisy. With a hit rate near 0.8 the count has a standard
 *    deviation around 2.4 kills, so a one-kill difference is a coin flip. Any
 *    decision rule that reacts to a gap smaller than that noise will keep
 *    reacting to noise forever — that is exactly what an earlier version of
 *    this file did, and why a run could circle the same four values.
 *
 * 2. So the state is not "which rung are we on". It is a running estimate of
 *    the response curve: for every sensitivity you have played, the mean of
 *    *all* its kills with a shrinkage prior, plus a standard error that shrinks
 *    as rounds accumulate. Rounds are never thrown away and every decision is
 *    re-derived from the full history.
 *
 * 3. The next sensitivity is chosen for its informational value: the point on
 *    the fitted curve that is best, or still could be, and is not already
 *    known. That gives a continuous proposal — three decimals, not one of four
 *    rungs — and it never repeats itself, because a sensitivity already played
 *    is already known.
 *
 * 4. Stopping is a statement about resolution, not about running out of rungs:
 *    stop when the plausible-best range cannot be told apart from the leader at
 *    the noise level this test can actually reach.
 */

export const BOTS_PER_RUN = 30

/**
 * Kill-count noise. Modelled as binomial over 30 bots at p ≈ 0.8, which gives
 * sd = sqrt(30 · 0.8 · 0.2) ≈ 2.19. Used at p = 0.75 for a slightly
 * conservative 2.4, since the few-kill end of the range is noisier than the
 * mean suggests and a pessimistic sigma is the safe direction for a stopping
 * rule.
 */
export const SIGMA_KILLS = 2.4

/**
 * Shrinkage weight, in "rounds" of prior. A sensitivity played once keeps most
 * of its own score; one played five times is trusted almost entirely on its own
 * data. Without this, a single lucky 30 would outrank a well-measured 27.
 */
export const PRIOR_ROUNDS = 1.5

/** One-sided 95% confidence: how many standard errors a gap must clear. */
export const CONFIRM_Z = 1.65

/** Soft cap on range runs. Reaching it never invents a result, it just stops. */
export const MAX_ROUNDS = 30

/**
 * How many candidates the result page may present as "the same, pick either".
 *
 * The plausible set is a hypothesis set: with every setting played once its
 * error bars are wide, so after five rounds it can legitimately hold five or
 * six values. Reporting all of them is honest but useless — "these seven are
 * all the same" is not a recommendation. A tie is only worth showing when it
 * has been narrowed down, so the reported set is capped at the settings the
 * data cannot separate from the leader *and* whose own round-average sits
 * within this many kills of the leader's. Beyond it, the run says plainly that
 * the field is still too close to call rather than handing back a list.
 */
export const TIE_BAND_KILLS = 1

/**
 * How many rounds a finalist gets before "still level" is the answer.
 *
 * A tie that survives one extra measurement per finalist is a real tie: the
 * difference is under the noise the instrument can reach, and asking for a
 * seventh round changes nothing. This is what stops the narrowing step from
 * running to MAX_ROUNDS once the band is closed.
 */
export const REVISIT_LIMIT = 2

/**
 * The smallest spacing worth a whole range run, as a fraction of eDPI.
 *
 * This is the search's horizon, and it is the one constant that decides whether
 * a run explores or merely polishes. Too small and every proposal lands beside
 * the last one — the search looks busy, learns nothing about the shape of the
 * curve, and reports the starting point as the answer because it never went
 * anywhere else. Two probes closer than this are also not a difference a hand
 * can feel, so the round is wasted regardless.
 *
 * 6% is roughly one ladder rung: big enough that the curve is visibly sampled
 * across the plausible band, small enough to stay inside a bracket that a peak
 * could be in.
 */
export const MIN_PROBE_GAP = 0.06

/**
 * How many rungs of coverage the opening sweep buys on each side of the
 * starting value: `[down, up]`. Two each way plus the start is five rounds, the
 * minimum that can show a rise, a peak and a fall across the band. After that
 * the fitted curve chooses, and the layout rule is finished for good.
 *
 * A fixed budget rather than "keep filling the thin side": left to decide for
 * itself, a coverage rule on a one-sided landscape keeps picking the same side
 * and walks to the floor of the playable range — the original runaway wearing a
 * new name. A symmetrical budget cannot do that.
 */
export const LAYOUT_STEPS = Object.freeze([3, 3])

/**
 * How many measured settings each side needs for the saturation check to be
 * allowed to fire: a claim about the whole band needs a band, not a point.
 */
export const LAYOUT_SIDES = 2

/** Below/above these the player is outside anything a human plays at. */
export const EDPI_FLOOR = 80
export const EDPI_CEILING = 1200

/** The centre of the published pro population; used only as a weak prior. */
export const LADDER_ANCHOR = 250

/**
 * The two ways a run can be framed. Both use the same estimator and the same
 * proposal rule; the difference is only what is known before round one.
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

export const END_REASONS = Object.freeze({
  resolved: '已经分不出高低的那几个数值，挑手感最顺手的那个就行。',
  confirmed: '最好的那个已经明显比其它都好，不必再测了。',
  noise: '再测下去也分不出差别了，就用现在这个。',
  ceiling: '几乎每轮都接近满分，这个难度已经分不出高低了。建议换更难的靶场重测。',
  floor: '几乎每轮都只有 0–1 杀，测试条件可能有问题，请检查后再测。',
  manual: '你提前结束了，结果取目前表现最好的那个。',
  edge: '已经调到正常人不会用的极端数值，就此停下。',
  resolution: '游戏灵敏度最小只能改到 0.001，再细也分不出来了。',
})

/**
 * How the run ended, in the terms the result page needs.
 *
 * A run that finishes with every setting near 30 has technically resolved — the
 * numbers cannot be told apart — but the useful thing to say is not "pick any
 * of them", it is "this difficulty is not discriminating for you". So a
 * resolved run whose whole band sits at the ceiling is reported as a ceiling,
 * with its own advice.
 */
export function explainOutcome(session) {
  const pts = points(session.runs, { priorScore: globalPrior(session.runs) })
  const best = leader(pts, session.incumbent)
  const flatHigh = pts.length >= 3 && pts.every((point) => point.raw >= SATURATED_CEILING)
  const flatLow = pts.length >= 3 && pts.every((point) => point.raw <= SATURATED_FLOOR)
  let reason = session.reason
  if ((reason === 'resolved' || reason === 'confirmed') && flatHigh) reason = 'ceiling'
  if ((reason === 'resolved' || reason === 'confirmed') && flatLow) reason = 'floor'
  return {
    reason,
    message: END_REASONS[reason] ?? END_REASONS[session.reason],
    // A discriminating run needs at least one setting that actually scored
    // away from the extremum; saying so is more useable than a bare number.
    discriminating: Boolean(best) && best.raw >= SATURATED_FLOOR + 1 && best.raw <= SATURATED_CEILING - 1,
  }
}

export function parseKills(value) {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new RangeError(`击杀数需为 0–${BOTS_PER_RUN} 的整数。`)
  }
  if (String(value).trim() === '') throw new RangeError('请填写本轮击杀数。')
  const kills = Number(value)
  if (!Number.isInteger(kills) || kills < 0 || kills > BOTS_PER_RUN) {
    throw new RangeError(`击杀数需为 0–${BOTS_PER_RUN} 的整数。`)
  }
  return kills
}

/** Round a sensitivity to the game's own resolution. */
export const quantize = (sensitivity) => Number(sensitivity.toFixed(3))

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length

/**
 * Step spacing in eDPI at the population anchor: 20 / 10 / 5 / 2.5.
 *
 * The search no longer walks a ladder of these — it proposes continuous values
 * — but the method page draws its first bracket from them, and the tests pin
 * the "one feelable hand movement" property that motivated them, so they stay
 * exported as the description of what a first step should feel like.
 */
export const STEP_DELTAS = Object.freeze([20, 10, 5, 2.5])

export function stepFactors(anchorEdpi = LADDER_ANCHOR, deltas = STEP_DELTAS) {
  if (!Number.isFinite(anchorEdpi) || anchorEdpi <= 0) throw new RangeError('锚点 eDPI 必须大于 0。')
  let factors
  if (anchorEdpi > Math.max(...deltas)) {
    factors = deltas.map((delta) => anchorEdpi / (anchorEdpi - delta))
  } else {
    // Anchor too small for absolute steps: a capped geometric ladder instead.
    const n = deltas.length
    factors = deltas.map((_, index) => 1.25 ** ((n - index) / n))
  }
  if (!factors.every((factor, index) => factor > 1 && (index === 0 || factor < factors[index - 1]))) {
    throw new RangeError('步长梯度必须严格递减且大于 1。')
  }
  return factors
}

export function ladderAnchor(setup, mode = DEFAULT_MODE) {
  if (isDiscovery(mode)) return LADDER_ANCHOR
  const edpi = Number(setup?.dpi) * Number(setup?.sens)
  return Number.isFinite(edpi) && edpi > 0 ? edpi : LADDER_ANCHOR
}

export function ladderFor(setup, mode = DEFAULT_MODE) {
  if (setup?.anchorEdpi) return stepFactors(setup.anchorEdpi)
  return stepFactors(ladderAnchor(setup, mode))
}

export function stepPercent(setup, mode = DEFAULT_MODE) {
  const factor = ladderFor(setup, mode)[0]
  return Math.round((factor - 1) * 1000) / 10
}

export function ladderPercents(setup, mode = DEFAULT_MODE) {
  return ladderFor(setup, mode).map((factor) => Math.round((factor - 1) * 1000) / 10)
}

/** The opening bracket, ascending: your value, and one step either side. */
export function openingSchedule(setup, mode = DEFAULT_MODE) {
  const start = quantize(Number(setup.sens))
  if (!Number.isFinite(start) || start <= 0) return []
  const factor = ladderFor(setup, mode)[0]
  return [...new Set([quantize(start / factor), start, quantize(start * factor)])]
    .filter((value) => value > 0)
    .sort((a, b) => a - b)
}

// ---------------------------------------------------------------------------
// Estimator
// ---------------------------------------------------------------------------

/**
 * The measured response curve, rebuilt from every round ever played.
 *
 * Each sensitivity gets its own score. Neighbouring sensitivities are *not*
 * smoothed into one curve: a player's response has a peak of finite width, and
 * fitting a single global shape across it is how a search talks itself into
 * walking past the optimum. The neighbours are used for the shape judgement
 * (is the leader bracketed?) and for choosing the next probe.
 *
 * Every point carries `se`, the standard error of its adjusted mean. It is what
 * makes "these two are 1.5 kills apart" a statement that can be wrong, and what
 * lets the stopping rule be about resolution instead of round count.
 */
export function points(runs, options = {}) {
  const priorRounds = options.priorRounds ?? PRIOR_ROUNDS
  const priorScore = options.priorScore ?? null
  const grouped = new Map()
  for (const run of runs) {
    const key = quantize(run.sensitivity)
    const entry = grouped.get(key) ?? []
    entry.push(run.kills)
    grouped.set(key, entry)
  }
  return [...grouped.entries()]
    .map(([sensitivity, kills]) => {
      const n = kills.length
      const raw = mean(kills)
      // Empirical-Bayes style shrinkage towards the grand mean, so a single
      // lucky round cannot outrank a sensitivity that has been measured five
      // times. `priorScore === null` means there is nothing to shrink towards.
      const base = priorScore ?? raw
      return {
        sensitivity,
        kills,
        n,
        raw,
        score: (raw * n + base * priorRounds) / (n + priorRounds),
        se: SIGMA_KILLS / Math.sqrt(n + priorRounds),
      }
    })
    .sort((a, b) => a.sensitivity - b.sensitivity)
}

/** Mean of every kill recorded so far: the prior the shrinkage pulls towards. */
function globalPrior(runs) {
  if (!runs.length) return null
  return mean(runs.map((run) => run.kills))
}

/**
 * The curve as a shape, not just as a list of measured points.
 *
 * Kills per round is a unimodal function of log-sensitivity: there is a band
 * where hand and wrist agree, and the score falls away on both sides for
 * different reasons (too twitchy misses leave late, too slow misses leave
 * short). Fitting that shape is what lets the search say something about a
 * sensitivity nobody has played yet — and, more importantly, it is what stops
 * a run of rising scores at a truncated edge from being read as "still
 * climbing" when the real explanation is that the whole measured band sits at
 * the ceiling.
 *
 * The shape fitted is a parabola in log-sensitivity, fitted on the logit of the
 * kills so the far side cannot climb past 30 bots. Parabolic-in-log is the same
 * family the response was measured to have: equal ratio steps produce equal
 * score changes, and the peak is a single number rather than an interval.
 *
 * Fitted by reweighted least squares with weights proportional to rounds. The
 * unit of evidence is a range run, so a setting played four times counts four
 * times — that is the "综合之前的各次成绩" property, and it is why the fit gets
 * sharper with every round instead of jittering with each new score.
 *
 * Returns null when there is not enough shape to fit; callers then fall back to
 * the measured points alone.
 */
export function fitCurve(pts) {
  if (pts.length < 3) return null
  const scale = BOTS_PER_RUN + 1
  const clampProb = (p) => Math.min(1 - 1e-3, Math.max(1e-3, p))
  const logit = (kills) => {
    const p = clampProb((kills + 0.5) / scale)
    return Math.log(p / (1 - p))
  }

  const xs = pts.map((point) => Math.log(point.sensitivity))
  const xBar = pts.reduce((sum, point, index) => sum + xs[index] * point.n, 0)
    / pts.reduce((sum, point) => sum + point.n, 0)
  const rows = pts.map((point, index) => ({ u: xs[index] - xBar, y: logit(point.raw), w: point.n }))

  // Intercept, linear and quadratic terms of logit(kills) in log-sensitivity.
  // Solved with a few rounds of IRLS so a point at 30/30 does not dominate.
  const theta = [logit(mean(pts.map((point) => point.raw))), 0, 0]
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const normal = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    const rhs = [0, 0, 0]
    for (const row of rows) {
      const basis = [1, row.u, row.u * row.u]
      const p = 1 / (1 + Math.exp(-(theta[0] * basis[0] + theta[1] * basis[1] + theta[2] * basis[2])))
      const w = row.w * Math.max(0.02, p * (1 - p))
      for (let i = 0; i < 3; i += 1) {
        rhs[i] += w * basis[i] * row.y
        for (let j = 0; j < 3; j += 1) normal[i][j] += w * basis[i] * basis[j]
      }
    }
    const next = solve3(normal, rhs)
    if (!next) return null
    const moved = next.reduce((sum, value, index) => sum + Math.abs(value - theta[index]), 0)
    for (let i = 0; i < 3; i += 1) theta[i] = next[i]
    if (moved < 1e-8) break
  }
  if (theta.some((value) => !Number.isFinite(value))) return null

  const [c0, c1, c2] = theta
  const toLogit = (sensitivity) => c0 + c1 * (Math.log(sensitivity) - xBar) + c2 * (Math.log(sensitivity) - xBar) ** 2
  const toScore = (sensitivity) => scale / (1 + Math.exp(-toLogit(sensitivity))) - 0.5

  // Guard the peak. A quadratic through five points is a fragile object: on a
  // band that is monotone in the data, the fitted curvature is tiny and the
  // implied peak lands thousands of eDPI away, which would send the search off
  // to the ceiling. The peak is therefore only believed when it falls inside
  // the span the points actually cover — extrapolating a peak beyond the
  // measured range is not a prediction, it is an accident of the algebra.
  const xLow = Math.min(...xs)
  const xHigh = Math.max(...xs)
  const spanLog = xHigh - xLow
  const rawPeakLog = c2 < 0 ? xBar - c1 / (2 * c2) : null
  const inside = rawPeakLog != null
    && Number.isFinite(rawPeakLog)
    && rawPeakLog > xLow - spanLog
    && rawPeakLog < xHigh + spanLog
  // How strongly the fitted shape turns, normalised so it does not depend on the
  // scale of log-sensitivity: this is what tells a real peak from a straight
  // line that the solver happened to bend by a rounding error.
  const curvature = c2 * spanLog * spanLog
  const curvatureDown = c2 < 0 && curvature < -0.05
  const peakLog = inside && curvatureDown ? rawPeakLog : null
  const optimum = peakLog != null ? Math.exp(peakLog) : null

  return {
    toScore,
    toLogit,
    optimum,
    curvatureDown,
    peakScore: optimum ? toScore(optimum) : null,
  }
}

/** Solve a 3x3 system by Cramer's rule; null when it is singular. */
function solve3(m, v) {
  const det = (a) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1])
    - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0])
    + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0])
  const d = det(m)
  if (!Number.isFinite(d) || Math.abs(d) < 1e-12) return null
  const replace = (column) => m.map((row, index) => row.map((value, j) => (j === column ? v[index] : value)))
  const result = [det(replace(0)) / d, det(replace(1)) / d, det(replace(2)) / d]
  return result.every((value) => Number.isFinite(value)) ? result : null
}

/** Best-scoring measured point; ties break towards the incumbent. */
export function leader(pts, incumbent) {
  if (!pts.length) return null
  return [...pts].sort((a, b) => {
    if (Math.abs(b.score - a.score) > 1e-9) return b.score - a.score
    if (a.sensitivity === incumbent) return -1
    if (b.sensitivity === incumbent) return 1
    return a.sensitivity - b.sensitivity
  })[0]
}

/**
 * The set of sensitivities that could still be the true best.
 *
 * A point drops out as soon as the leader beats it by more than CONFIRM_Z
 * standard errors of the difference. That is what lets the search stop on its
 * own: as rounds accumulate the error bars shrink, the plausible set narrows,
 * and it eventually collapses without anyone declaring a plateau by hand.
 */
export function plausible(pts, best) {
  if (!best) return []
  return pts.filter((point) => {
    const gap = best.score - point.score
    const se = Math.hypot(best.se, point.se)
    return gap <= CONFIRM_Z * se
  })
}

/**
 * The candidates the result page can honestly call "the same".
 *
 * Two conditions, and both are needed:
 *
 *  - **already narrowed.** Every round played so far must have been folded into
 *    a live hypothesis. A set holding most of the sweep is not a tie, it is a
 *    run that has not measured enough — changing the recommendation will not
 *    fix that, so the run carries on instead of reporting it.
 *  - **narrow enough to be actionable.** At most `maximum` settings, and each
 *    within `band` kills of the leader's own measured average. Error bars alone
 *    are too generous a gate: after a sweep of single rounds they can cover six
 *    values whose averages differ by three kills. The band is the part a hand
 *    can actually be asked to choose between; anything outside it is a
 *    difference the data has already shown.
 *
 * Returns the leader first, then the rest by score. A single-element result is
 * a clean answer, not a tie.
 */
export function tiedSet(pts, best, options = {}) {
  if (!best) return []
  const maximum = options.maximum ?? 3
  const band = options.band ?? TIE_BAND_KILLS
  const rest = plausible(pts, best)
    .filter((point) => point.sensitivity !== best.sensitivity && best.raw - point.raw <= band)
    .sort((a, b) => b.score - a.score)
  // The winner plus at most `maximum - 1` challengers, and only when the field
  // is small enough that handing it over is a choice rather than a data dump.
  if (rest.length > maximum - 1) return [best]
  return [best, ...rest]
}

/**
 * The settings a run still has to separate, as opposed to the few it may report.
 *
 * This is the pool `revisit` draws from: everything the error bars cannot retire
 * from the leader, whether or not the set is already small enough to print.
 * Keeping the two ideas apart is what lets the stopping rule say "not narrowed
 * yet, keep measuring inside these four" instead of "the set is too wide, so
 * report the leader alone and pretend the question is settled".
 */
export function contenders(pts, best, options = {}) {
  if (!best) return []
  const maximum = options.maximum ?? 4
  const band = options.band ?? TIE_BAND_KILLS
  const pool = plausible(pts, best)
    .filter((point) => point.sensitivity === best.sensitivity || best.raw - point.raw <= band)
    .sort((a, b) => b.score - a.score)
  return pool.slice(0, maximum)
}

/**
 * Is the leader bracketed — measurably lower on one side, lower on the other?
 *
 * Without a bracket the top of the measured range can only be a slope, and
 * walking along a slope is how a search leaves everything sensible behind.
 *
 * Two ways to earn a bracket, because the measured points alone are a weak
 * instrument: either the neighbouring measured points are lower (each compared
 * against its own error bar), or the fitted curve from `fitCurve` is falling on
 * both sides of the leader. The second is what lets a run stop after sampling a
 * band without having to re-play every neighbour — the fit has already used
 * every round ever played to decide the shape.
 */
export function bracketed(pts, best, curve = null) {
  if (!best) return false
  const below = pts.filter((point) => point.sensitivity < best.sensitivity)
  const above = pts.filter((point) => point.sensitivity > best.sensitivity)
  if (!below.length || !above.length) return false

  const lowerWorse = Math.max(...below.map((point) => point.score))
    <= best.score + CONFIRM_Z * Math.hypot(best.se, Math.min(...below.map((point) => point.se)))
  const upperWorse = Math.max(...above.map((point) => point.score))
    <= best.score + CONFIRM_Z * Math.hypot(best.se, Math.min(...above.map((point) => point.se)))

  if (curve?.curvatureDown) {
    // Sample the fitted shape a probe-gap out on each side. A real peak stands
    // above both.
    const left = curve.toScore(best.sensitivity * (1 - MIN_PROBE_GAP))
    const right = curve.toScore(best.sensitivity * (1 + MIN_PROBE_GAP))
    const fitted = best.score >= left - 2 && best.score >= right - 2
    return (lowerWorse && upperWorse) || (fitted && curve.optimum != null)
  }
  return lowerWorse && upperWorse
}

/**
 * Are the measured scores pinned at one end of the scale?
 *
 * This is the one place where the search has to admit the instrument failed
 * rather than keep probing: a range where every setting scores 0–1 or 28–30
 * cannot rank settings at all, and more rounds cannot fix that.
 *
 * It is therefore a claim about the *whole playable range*, not about the
 * corner the run happens to be standing in. So the test needs both:
 *  - three distinct settings (two points are a line, not a band), and
 *  - the opening layout finished, because a run still inside its first bracket
 *    has not seen enough of the range to call it flat. A player whose real
 *    optimum is three times their current eDPI scores 1/30 at every setting
 *    near home; ending there would report "the test cannot distinguish
 *    anything" when the truth is "you started in the wrong place".
 *
 * Past the layout the search is free to walk outward, and only then does a
 * uniformly extreme score mean what it says.
 */
const SATURATED_CEILING = 28
const SATURATED_FLOOR = 1

function saturated(pts, laidOut) {
  if (!laidOut) return null
  if (pts.length < 3) return null
  if (pts.every((point) => point.raw >= SATURATED_CEILING)) return 'ceiling'
  if (pts.every((point) => point.raw <= SATURATED_FLOOR)) return 'floor'
  return null
}

/**
 * Is the run still in its opening sweep, where every round is buying coverage
 * rather than confirmation? Saturation and "no candidates left" must not fire
 * during it, or a run that started in a flat band reports the band as the
 * answer without ever having looked outside.
 */
function keepsExtending(session, pts) {
  const anchor = session.setup.sens
  if (!Number.isFinite(anchor)) return false
  const gap = Math.log(1 + MIN_PROBE_GAP)
  const reach = (direction) => {
    const side = pts.filter((point) => (direction > 0
      ? point.sensitivity > anchor
      : point.sensitivity < anchor))
    if (!side.length) return 0
    const edge = direction > 0 ? side[side.length - 1].sensitivity : side[0].sensitivity
    return Math.abs(Math.log(edge / anchor)) / gap
  }
  // A side whose rungs are cut off by the playable range counts as covered:
  // there is nowhere further to go on that side, and waiting for coverage that
  // cannot exist would strand the sweep and let a late rule fire on a run that
  // never explored anything.
  const coverable = (direction) => {
    const limit = direction > 0 ? EDPI_CEILING : EDPI_FLOOR
    const perRung = Math.log(1 + MIN_PROBE_GAP)
    const rungs = Math.floor(Math.abs(Math.log((limit / session.setup.dpi) / anchor)) / perRung)
    return Math.min(LAYOUT_STEPS[direction > 0 ? 1 : 0], Math.max(1, rungs))
  }
  const upNeed = coverable(1) - 0.5
  const downNeed = coverable(-1) - 0.5
  return reach(1) < upNeed || reach(-1) < downNeed
}

// ---------------------------------------------------------------------------
// Proposal
// ---------------------------------------------------------------------------

/**
 * Where to go next.
 *
 * Already-measured sensitivities are excluded by construction: every candidate
 * has to sit at least MIN_PROBE_GAP away from every recorded point, so the
 * search cannot re-ask the same number and cannot creep so finely that two
 * proposals are the same physical movement.
 *
 * Two sources of candidates, and they answer different questions:
 *
 *  - the **fitted curve** (`curve`) says where the peak most likely is given
 *    every round played so far. Proposing just off that peak is how the search
 *    lands on values nobody chose in advance — the consecutive proposals walk
 *    towards the fitted optimum rather than around the starting point;
 *  - the **measured points** say what is still unknown: an unlocked edge that
 *    has not been shown to fall away, or a gap between two points wide enough
 *    that the fitted line through it is only a guess.
 *
 * Ranking is by fitted score first, then by how much is left to learn there.
 * When `forceExtend` is set the outward candidates are promoted, so a run that
 * started somewhere cannot stop before the curve has actually disproved it.
 */
export function proposeNext(pts, best, setup, options = {}) {
  const dpi = setup.dpi
  if (!best || !Number.isFinite(dpi) || dpi <= 0) return null

  const gap = Math.max(MIN_PROBE_GAP, options.span ?? MIN_PROBE_GAP)
  const curve = options.curve ?? null
  const taken = pts.map((point) => point.sensitivity)
  /**
   * Is this value already known?
   *
   * A proposal has to be a *different* sensitivity, but the bar for "different"
   * cannot be the full probe spacing: once the fitted peak lands between two
   * measured points, everything within one gap of it is blocked and the search
   * would fall through to the last-resort ring — jumping across the whole band
   * to find something "far enough" away. That is a self-inflicted runaway.
   *
   * So the block radius is half a gap: enough that two proposals are never the
   * same physical movement, small enough that a fitted peak is always reachable.
   * Exact repeats are caught by the quantised value itself.
   */
  const blockRadius = gap / 2
  const blocked = (value) => taken.some((other) => Math.abs(other - value) / value < blockRadius)
  const inRange = (value) => value > 0 && value * dpi >= EDPI_FLOOR && value * dpi <= EDPI_CEILING
  const add = (list, value, why, tier) => {
    if (value == null || !Number.isFinite(value)) return
    const rounded = quantize(value)
    if (!inRange(rounded) || blocked(rounded)) return
    list.push({
      value: rounded,
      why,
      tier,
      predicted: curve ? curve.toScore(rounded) : null,
      distance: Math.abs(Math.log(rounded / best.sensitivity)),
    })
  }

  // Neighbours of the leader, nearest first, so "the outermost point on this
  // side" is always index 0.
  const below = pts.filter((point) => point.sensitivity < best.sensitivity).sort((a, b) => b.sensitivity - a.sensitivity)
  const above = pts.filter((point) => point.sensitivity > best.sensitivity).sort((a, b) => a.sensitivity - b.sensitivity)
  const outer = [...pts].sort((a, b) => a.sensitivity - b.sensitivity)
  const lowest = outer[0]
  const highest = outer[outer.length - 1]

  const candidates = []

  // 0. Layout: a fixed, symmetrical budget of rungs on each side of where the
  //    run began. A fit through a one-sided range is a slope, and following a
  //    slope is how a search walks off in one direction forever. So the opening
  //    rounds buy coverage — the same amount on both sides, no matter what the
  //    scores say — and then this rule is finished for good.
  //
  //    It is a budget, not a preference: given a choice, a coverage rule on a
  //    one-sided landscape keeps picking the same side and ends at the floor of
  //    the playable range, which is the original runaway wearing a new name.
  const anchorValue = options.anchor ?? best.sensitivity
  const highSide = pts.filter((point) => point.sensitivity > anchorValue)
  const lowSide = pts.filter((point) => point.sensitivity < anchorValue)
  const rungsOut = (side, direction) => (side.length
    ? Math.abs(Math.log((direction > 0 ? side.at(-1) : side[0]).sensitivity / anchorValue)) / Math.log(1 + gap)
    : 0)
  // A side that has run into the playable limit is done, however few rungs it
  // managed: asking for coverage that cannot exist would strand the sweep and
  // hand the round back to a rule that has not been laid out yet.
  const atLimit = (direction) => {
    const edge = direction > 0 ? highSide : lowSide
    if (!edge.length) return false
    const value = (direction > 0 ? edge.at(-1) : edge[0]).sensitivity * dpi
    return direction > 0 ? value >= EDPI_CEILING * 0.98 : value <= EDPI_FLOOR * 1.02
  }
  const upLeft = atLimit(1) ? 0 : Math.max(0, Math.floor(LAYOUT_STEPS[1] - rungsOut(highSide, 1)))
  const downLeft = atLimit(-1) ? 0 : Math.max(0, Math.floor(LAYOUT_STEPS[0] - rungsOut(lowSide, -1)))
  if (upLeft > 0 || downLeft > 0) {
    // Alternate so a warm-up trend cannot be mistaken for a slope, and so the
    // band grows symmetrically. When one side is pinned against the playable
    // limit the other side takes the round.
    const goUp = upLeft > downLeft || (upLeft === downLeft && highSide.length <= lowSide.length)
    const side = goUp ? highSide : lowSide
    const from = side.length ? (goUp ? side.at(-1) : side[0]).sensitivity : anchorValue
    // Aim at the intended side, but if the playable range blocks it, take the
    // round on the other side rather than dropping the candidate — otherwise a
    // start near a limit stalls the opening sweep entirely.
    const preferred = goUp ? from * (1 + gap) : from * (1 - gap)
    const fallback = goUp ? from * (1 - gap) : from * (1 + gap)
    if (inRange(quantize(preferred)) && !blocked(quantize(preferred))) {
      add(candidates, preferred, 'layout', 0)
    } else {
      add(candidates, fallback, 'layout', 0)
    }
  } else {
    // 1. Past the fitting. One target, chosen by the slope of what has been
    //    measured: while the response is still rising towards one end, the peak
    //    is that way and one more rung there buys information. Once the leader
    //    is interior — lower on both sides — there is nothing outward left to
    //    find, and proposing a rung anyway is how a run spends twenty rounds
    //    walking to the edge after it already has its answer.
    const bestIsInterior = Boolean(best)
      && pts.some((point) => point.sensitivity < best.sensitivity)
      && pts.some((point) => point.sensitivity > best.sensitivity)
    const outwardStillLearning = !bestIsInterior
      || !bracketed(pts, best, curve)
    const goesUp = highest.score > lowest.score
      || (best && best.sensitivity >= highest.sensitivity)
    if (outwardStillLearning) {
      if (goesUp) add(candidates, highest.sensitivity * (1 + gap), 'step', 1)
      else add(candidates, lowest.sensitivity * (1 - gap), 'step', 1)
      // If that rung is already measured, step from it once more, so a stretch
      // of adjacent measured rungs cannot stall the proposal.
      if (goesUp) add(candidates, highest.sensitivity * (1 + gap) ** 2, 'step', 3)
      else add(candidates, lowest.sensitivity * (1 - gap) ** 2, 'step', 3)
    }

    // 2. A gap between two measured points wide enough that the fitted line
    //    through it is a guess rather than a measurement. This is what closes
    //    up a bracket once the outer rungs are in place.
    for (let index = 0; index + 1 < pts.length; index += 1) {
      const left = pts[index]
      const right = pts[index + 1]
      const ratio = right.sensitivity / left.sensitivity
      if (ratio < 1 + 3 * gap) continue
      add(candidates, left.sensitivity * ratio ** 0.5, 'bracket', 2)
    }
  }

  if (!candidates.length) {
    // Everything nearby is taken. Widen one ring at a time — 2 gaps, then 3 —
    // rather than leaping across the whole band: a search that has run out of
    // ideas near what it knows should look a little further, not somewhere
    // else entirely.
    for (const ratio of [1 + 2 * gap, 1 + 3 * gap]) {
      add(candidates, best.sensitivity * ratio, 'probe', 3)
      add(candidates, best.sensitivity / ratio, 'probe', 3)
    }
  }
  // Fill a hole between two measured points if one is still wide open. This is
  // the honest "no idea, so cover the gap" move, and unlike the old last
  // resort it stays inside the range the run has already committed to.
  if (!candidates.length) {
    for (let index = 0; index + 1 < pts.length; index += 1) {
      const left = pts[index]
      const right = pts[index + 1]
      const ratio = right.sensitivity / left.sensitivity
      if (ratio < 1 + 2 * blockRadius) continue
      add(candidates, left.sensitivity * ratio ** 0.5, 'probe', 3)
    }
  }
  if (!candidates.length) return null

  const ranked = candidates.sort((a, b) => {
    // Layout first, always, while its budget lasts: nothing else can be trusted
    // until the band has been covered.
    if (a.why === 'layout' || b.why === 'layout') {
      if (a.why !== b.why) return a.why === 'layout' ? -1 : 1
      return a.distance - b.distance
    }
    // Then the fit: whichever candidate the model believes scores highest.
    const byScore = (b.predicted ?? -Infinity) - (a.predicted ?? -Infinity)
    if (Math.abs(byScore) > 1e-9) return byScore
    if (a.tier !== b.tier) return a.tier - b.tier
    return a.distance - b.distance
  })
  const chosen = ranked[0]

  return {
    sensitivity: chosen.value,
    edpi: chosen.value * dpi,
    why: chosen.why,
    predicted: chosen.predicted,
  }
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/** Bumped whenever the derivation changes; drafts of other versions are refused. */
export const ALGORITHM = 'adaptive-curve-v2'

/**
 * The plan object the UI renders.
 *
 * One round is now the unit: the proposal is a single continuous value
 * recomputed after every recorded score, so there is no multi-round block to
 * describe. `schedule`/`cursor` are kept because the whole screen and the draft
 * format are built around "the setting you are about to play".
 */
function planFor(session, proposal) {
  const rounds = session.runs.length
  return {
    phase: rounds === 0 ? 'seed' : 'probe',
    sensitivity: proposal?.sensitivity ?? null,
    candidates: proposal ? [proposal.sensitivity] : [],
    schedule: proposal ? [proposal.sensitivity] : [],
    cursor: 0,
    start: rounds,
    why: proposal?.why ?? null,
    edpi: proposal?.edpi ?? null,
    message: proposal
      ? `已测 ${rounds} 轮。综合目前所有成绩，下一轮测 ${proposal.sensitivity.toFixed(3)}（${Math.round(proposal.edpi)} eDPI）。`
      : '已经没有更值得测的数值了。',
  }
}

export function createSession(setup, options = {}) {
  const mode = options.mode ?? setup.mode ?? DEFAULT_MODE
  if (!MODES[mode]) throw new RangeError(`未知的测试模式：${mode}`)
  const discovery = isDiscovery(mode)

  if (!Number.isFinite(setup.dpi) || setup.dpi <= 0) {
    throw new RangeError('DPI 必须是大于 0 的数字。')
  }
  const rawSens = Number(setup.sens)
  const startSens = quantize(Number.isFinite(rawSens) && rawSens > 0 ? rawSens : LADDER_ANCHOR / setup.dpi)
  if (startSens <= 0) throw new RangeError('灵敏度按三位小数取整后必须大于 0。')

  const resolved = { ...setup, sens: startSens }
  if (discovery) resolved.startSens = null

  // A run can only measure settings the game can actually produce. A starting
  // value outside that band is a setup mistake, and the honest response is to
  // say so rather than to spend a range run on a sensitivity nobody can enter.
  const startEdpi = startSens * setup.dpi
  if (!discovery && (startEdpi < EDPI_FLOOR || startEdpi > EDPI_CEILING)) {
    throw new RangeError(`起始灵敏度 ${Math.round(startEdpi)} eDPI 超出可测范围（${EDPI_FLOOR}–${EDPI_CEILING}）。`)
  }

  const session = {
    algorithm: ALGORITHM,
    setup: resolved,
    mode,
    incumbent: startSens,
    // Kept for the explanation diagrams and the result copy; the search itself
    // no longer walks these.
    factors: ladderFor(resolved, mode),
    anchorEdpi: ladderAnchor(resolved, mode),
    runs: [],
    decisions: [],
    proposal: null,
    latestComparison: [],
    warning: null,
    done: false,
    reason: null,
  }

  // Round one is the only fixed part: the player's own value in refine mode, the
  // population centre in discovery. From round two on, the estimator speaks.
  const opener = discovery ? quantize(LADDER_ANCHOR / setup.dpi) : startSens
  if (opener <= 0) throw new RangeError('灵敏度按三位小数取整后必须大于 0。')
  const seed = { sensitivity: opener, edpi: opener * setup.dpi, why: 'seed' }
  return { ...session, proposal: seed, plan: planFor(session, seed) }
}

/**
 * Re-derive the whole state from the rounds recorded so far.
 *
 * Deliberately a pure function of `setup + runs`: that is what makes undo, draft
 * restoration and "the next value depends on the whole history" one code path
 * instead of three that can drift apart.
 */
export function derive(session) {
  if (session.done) return session
  const runs = session.runs
  const pts = points(runs, { priorScore: globalPrior(runs) })
  const best = leader(pts, session.incumbent)
  const alive = plausible(pts, best)
  const curve = fitCurve(pts)
  // While the opening sweep is still running, no stopping rule may fire: the
  // shape is unknown until both sides have been reached, and a run that stops
  // early reports a corner of the range as if it were the whole of it.
  const sweep = keepsExtending(session, pts)
  const extreme = saturated(pts, !sweep)

  const base = {
    ...session,
    incumbent: best?.sensitivity ?? session.incumbent,
    // The curve is *not* stored on the session: it holds closures and is a pure
    // function of the runs, so keeping it in state would make two sessions that
    // describe the same run compare unequal and would leak a function into the
    // saved draft. Anything that needs the shape calls `fitCurve` itself.
    latestComparison: alive.map((point) => ({
      sensitivity: point.sensitivity,
      kills: point.kills,
      score: point.score,
      n: point.n,
      se: point.se,
    })),
  }

  // A run whose whole measured band sits at the floor has one honest reading:
  // this test cannot rank settings from here. But if that band also ended at the
  // edge of the playable range, the likelier story is that the run started in
  // the wrong place, and saying so is far more useful than "try again".
  if (extreme) {
    const atEdge = best && (best.sensitivity * session.setup.dpi <= EDPI_FLOOR * 1.35
      || best.sensitivity * session.setup.dpi >= EDPI_CEILING * 0.75)
    return finish(base, extreme === 'floor' && atEdge ? 'edge' : extreme)
  }
  if (runs.length >= MAX_ROUNDS) return finish(base, 'noise')
  if (pts.length >= 2 && alive.length === 1) return finish(base, 'confirmed')
  // A leader pressed against the playable edge has nowhere further to go.
  if (best && (best.sensitivity * session.setup.dpi <= EDPI_FLOOR * 1.02
    || best.sensitivity * session.setup.dpi >= EDPI_CEILING * 0.98)) {
    return finish(base, 'edge')
  }

  const start = session.setup.sens
  const vote = keepsVote(session, pts, best, alive, curve)
  // What the result page would be allowed to call a tie, and the wider pool the
  // run still has to separate. Computed before the stopping rules because both
  // decide whether "stop and report" is a recommendation or a shrug: a narrow
  // set is a result, a wide one is a run that has not measured enough yet.
  const tied = tiedSet(pts, best)
  const pool = contenders(pts, best)
  const narrow = tied.length > 1
  const open = pool.length > 1 && !narrow

  // The curve has run out of things to say: every candidate is already
  // measured, or the band is closed and the remaining spread is inside the
  // noise. Report the plausible set honestly instead of manufacturing a winner.
  if (pts.length >= 5 && !vote) {
    const spread = Math.max(...alive.map((point) => point.score))
      - Math.min(...alive.map((point) => point.score))
    const resolution = 2 * SIGMA_KILLS / Math.sqrt(Math.min(...alive.map((point) => point.n)) + PRIOR_ROUNDS)
    // The band is closed *and* the fit agrees there is a single peak inside it:
    // without both, "the numbers are close" just means the run never went far
    // enough to find a difference.
    const closed = bracketed(pts, best, curve) && curve?.curvatureDown
    // An open tie is not an answer yet. Once the shape is closed, fresh probes
    // would only re-measure inside it, so the rounds are spent re-measuring the
    // finalists — an extra round is what retires a challenger or promotes the
    // leader. Without this a run could only report a tie as wide as the whole
    // sweep, which is not something a player can choose from.
    //
    // The budget is finite on purpose: a tie that survives one extra round per
    // finalist is a real tie, and asking again only repeats what the last round
    // already said. Without the cap this branch re-measures the same shortlist
    // until MAX_ROUNDS, which is exactly the endless loop the search exists to
    // avoid — just wearing the opposite mask.
    if (closed && open && best) {
      const spent = pool.every((point) => point.n >= REVISIT_LIMIT)
      if (spent) return finish(base, 'noise')
      const again = revisit(pts, pool, best, session.setup.dpi)
      return { ...base, proposal: again, plan: planFor(base, again) }
    }
    if (closed && spread <= resolution && Number.isFinite(start)) {
      return finish(base, narrow ? 'resolved' : 'confirmed')
    }
  }

  const proposal = proposeNext(pts, best, session.setup, {
    curve,
    forceExtend: vote,
    // Balance is measured around where the player started, not around whoever
    // is leading: the point of evening out is to cover the band on both sides
    // of the only fixed reference the run has.
    anchor: Number.isFinite(start) ? start : best?.sensitivity,
  })

  if (!proposal) {
    // No room to extend and no gap worth filling: the plausible set is the
    // honest answer, so report it as a tie rather than as a single number.
    return finish(base, narrow ? 'resolved' : 'resolution')
  }
  return { ...base, proposal, plan: planFor(base, proposal) }
}

/**
 * Which candidate to measure again.
 *
 * The one with the fewest rounds behind it, leader included: an extra round at
 * a challenger is what can retire it, and an extra round at the leader is what
 * can promote it. Ties go to the leader, so a run never looks like it is
 * avoiding the number it is about to recommend.
 *
 * This is the only proposal allowed to repeat a measured value. Every other
 * rule buys information about a place on the scale nobody has stood on; this
 * one buys certainty about a place that is already a finalist, which is the
 * thing a tie is short of.
 */
function revisit(pts, tied, best, dpi) {
  const pool = tied.length ? tied : [best]
  const target = [...pool].sort((a, b) => (a.n - b.n)
    || (Number(b.sensitivity === best?.sensitivity) - Number(a.sensitivity === best?.sensitivity)))[0]
  return {
    sensitivity: target.sensitivity,
    edpi: target.sensitivity * dpi,
    why: 'revisit',
    predicted: null,
  }
}

/**
 * Is the value the player arrived with still a live hypothesis?
 *
 * It stops being one once enough rounds exist on both sides of it to place it
 * on the curve, or once it is the bracketed leader. Until then, the honest
 * thing is to keep sampling outward rather than crown a winner — otherwise a
 * run can converge on a narrow local high simply because nothing outside it was
 * ever played.
 */
function keepsVote(session, pts, best, alive, curve = null) {
  const start = session.setup.sens
  if (!Number.isFinite(start)) return false
  if (!alive.some((point) => point.sensitivity === start)) return false
  // A run that stops while still climbing has found an edge, not a peak. That
  // is a state of the *range*, not of the starting value: the round has to go
  // outward whichever point is currently leading, or the reported answer is
  // simply wherever the walk ran out of budget.
  if (best && !bracketed(pts, best, curve)) return true
  const sides = [
    pts.filter((point) => point.sensitivity < start).length,
    pts.filter((point) => point.sensitivity > start).length,
  ]
  return Math.min(...sides) < 2
}

export function recordKills(session, value) {
  if (session.done) throw new Error('测试已完成。')
  const kills = parseKills(value)
  const sensitivity = session.plan.schedule[session.plan.cursor]
  if (sensitivity == null) throw new Error('当前没有待记录的档位。')
  const runs = [...session.runs, { sensitivity, kills, phase: session.plan.phase }]
  return derive({
    ...session,
    runs,
    decisions: [...session.decisions, decide(session, sensitivity, kills, runs)],
  })
}

/**
 * What this one round changed, in terms the result page can show. A record of
 * the reasoning, never an input to it: the decision itself is always re-derived
 * from all the runs.
 */
function decide(before, sensitivity, kills, runs) {
  const pts = points(runs, { priorScore: globalPrior(runs.slice(0, -1)) ?? kills })
  const best = leader(pts, before.incumbent)
  const leaderChanged = Boolean(best && best.sensitivity !== before.incumbent)
  const point = pts.find((entry) => entry.sensitivity === sensitivity)
  return {
    round: runs.length,
    phase: before.plan.phase,
    sensitivity,
    kills,
    // All the rounds played at this setting, not just this one: the whole point
    // of the estimator is that a second look revises the first.
    score: point?.raw ?? kills,
    rounds: point?.n ?? 1,
    leader: best?.sensitivity ?? null,
    incumbentBefore: before.incumbent,
    leaderChanged,
    accepted: leaderChanged,
    direction: sensitivity > before.incumbent ? 'up' : sensitivity < before.incumbent ? 'down' : 'same',
  }
}

export function rebuildSession(setup, runs, options = {}) {
  return runs.reduce((session, run) => {
    const expected = session.plan.schedule[session.plan.cursor]
    if (run.sensitivity !== expected) throw new Error('成绩与测试计划不一致。')
    return recordKills(session, run.kills)
  }, createSession(setup, options))
}

export function undoLastRun(session) {
  if (!session.runs.length) return session
  // Replaying through the same derivation is the only way undo stays honest:
  // the proposal after n-1 rounds is a function of those n-1 rounds, and any
  // shortcut would leave a stale plan behind.
  return rebuildSession(session.setup, session.runs.slice(0, -1), { mode: session.mode })
}

export function completeEarly(session) {
  if (session.done) return session
  if (!session.runs.length) throw new Error('至少完成一轮靶场测试后才能查看结果。')
  return finish(session, 'manual')
}

function finish(session, reason) {
  const pts = points(session.runs, { priorScore: globalPrior(session.runs) })
  const best = leader(pts, session.incumbent)
  const settled = { ...session, done: true, reason, plan: planFor(session, null) }
  if (!best) return settled
  return {
    ...settled,
    incumbent: best.sensitivity,
    warning: session.warning ?? caveat(reason, pts, best),
  }
}

/**
 * A result that stopped before proving its own shape is a local optimum, and
 * saying so is more useful than presenting it as the answer.
 */
function caveat(reason, pts, best) {
  if (reason === 'edge') return '这个数值已经到可测范围的边界了，真正合适的可能在范围之外。'
  if ((reason === 'noise' || reason === 'resolved') && !bracketed(pts, best)) {
    return '这次没能确认峰值两边都在变差，结果可能只是一个局部高点。'
  }
  return null
}

export function summarizeSession(session) {
  if (!session.done) throw new Error('请完成测试或选择提前查看结果。')
  const pts = points(session.runs, { priorScore: globalPrior(session.runs) })
  const best = leader(pts, session.incumbent)
  const alive = plausible(pts, best)
  const tied = tiedSet(pts, best)
  const outcome = explainOutcome(session)
  const history = pts.map((point) => ({
    sensitivity: point.sensitivity,
    edpi: point.sensitivity * session.setup.dpi,
    kills: point.kills,
    score: point.raw,
    adjusted: point.score,
    rounds: point.n,
  }))
  return {
    mode: 'range-medium-30',
    algorithm: ALGORITHM,
    testMode: session.mode,
    sensitivity: session.incumbent,
    edpi: session.incumbent * session.setup.dpi,
    score: best?.raw ?? 0,
    rounds: session.runs.length,
    // "Tied" is a claim about the run, not about the error bars: it means the
    // data cannot separate a few settings from the winner *and* those settings
    // are close enough on their own averages that choosing between them by hand
    // is the honest advice. `contested` keeps the wider truth — the field is
    // still open — for the wording that has to say so.
    tied: tied.length > 1,
    leaders: tied.map((point) => point.sensitivity).sort((a, b) => a - b),
    contested: alive.length > 1,
    reason: session.reason,
    message: outcome.message,
    outcomeReason: outcome.reason,
    discriminating: outcome.discriminating,
    warning: session.warning,
    history,
    runs: session.runs,
    decisions: session.decisions,
    latestComparison: session.latestComparison,
    // `null` on purpose for discovery: there was no starting value, and a
    // result must not claim a delta against a number the player never gave.
    initialSensitivity: session.setup.startSens === null ? null : session.setup.sens,
    sigma: SIGMA_KILLS,
  }
}
