export const BOTS_PER_RUN = 30
export const STEP_FACTORS = Object.freeze([1.25, 1.12, 1.06])
export const MIN_MEAN_GAIN = 1

export const END_REASONS = Object.freeze({
  plateau: '精细档位没有发现足够且可重复的提升，保留已确认档位。',
  resolution: '按三位小数取整后，附近档位已无法进一步区分。',
  ceiling: '本组各档均达到 29–30 杀，中等难度接近满分，暂不足以区分灵敏度。',
  floor: '本组各档均只有 0–1 杀，当前测试不足以区分灵敏度，请先确认测试条件。',
  manual: '你已提前结束；保留当前基准或最近一次通过交错复测的档位。',
})

export function parseKills(value) {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new RangeError('击杀数量必须是 0–30 的整数。')
  }
  if (String(value).trim() === '') throw new RangeError('请填写本轮击杀数量。')
  const kills = Number(value)
  if (!Number.isInteger(kills) || kills < 0 || kills > BOTS_PER_RUN) {
    throw new RangeError('击杀数量必须是 0–30 的整数。')
  }
  return kills
}

const quantize = (sensitivity) => Number(sensitivity.toFixed(3))
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length

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

function finish(session, reason) {
  return { ...session, done: true, reason }
}

function narrow(session) {
  if (session.level === session.factors.length - 1) return finish(session, 'plateau')
  const next = { ...session, level: session.level + 1 }
  const plan = screenPlan(next, '未发现足够且可重复的提升，保留当前档位，缩小倍率后再测。')
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
    const a = base.sensitivity
    const b = challenger.sensitivity
    // Alternate ABBA and BAAB to balance which setting opens each confirmation.
    const schedule = session.confirmations % 2 === 0 ? [a, b, b, a] : [b, a, a, b]
    return { ...screened, plan: {
      phase: 'confirm', baseline: a, challenger: b, candidates: [a, b], schedule,
      cursor: 0, start: session.runs.length,
      message: `${b.toFixed(3)} 初测领先，交错复测确认；单次高分不会直接替换当前档位。`,
    } }
  }

  const challenger = entries.find((entry) => entry.sensitivity === plan.challenger)
  const recentRuns = session.runs.slice(plan.start)
  const differences = [0, 2].map((offset) => {
    const first = recentRuns[offset]
    const second = recentRuns[offset + 1]
    return first.sensitivity === plan.challenger
      ? first.kills - second.kills
      : second.kills - first.kills
  })
  const accepted = differences.every((difference) => difference > 0) && challenger.score - base.score >= session.minGain
  const driftWarning = base.kills[1] <= base.kills[0] - 3
    ? '同组基准档成绩下降至少 3 杀，可能有状态波动；建议休息后继续确认。' : null
  const confirmed = {
    ...next, confirmations: session.confirmations + 1,
    incumbent: accepted ? challenger.sensitivity : session.incumbent,
    warning: driftWarning ?? session.warning,
    decisions: [...session.decisions, { ...decision, challenger: plan.challenger, differences, accepted }],
  }
  if (!accepted) return narrow(confirmed)
  return { ...confirmed, plan: screenPlan(confirmed,
    `已确认 ${challenger.sensitivity.toFixed(3)} 在两次比较中均领先，平均提升 ${(challenger.score - base.score).toFixed(1)} 杀；以此为基准继续探索。`) }
}

export function createSession(setup, options = {}) {
  if (!Number.isFinite(setup.sens) || setup.sens <= 0 || !Number.isFinite(setup.dpi) || setup.dpi <= 0) {
    throw new RangeError('DPI 和灵敏度必须是大于 0 的数字。')
  }
  const incumbent = quantize(setup.sens)
  if (incumbent <= 0) throw new RangeError('灵敏度按三位小数取整后必须大于 0。')
  const factors = [...(options.factors ?? STEP_FACTORS)]
  const minGain = options.minGain ?? MIN_MEAN_GAIN
  if (!factors.length || factors.some((factor, index) => !Number.isFinite(factor) || factor <= 1 || (index > 0 && factor >= factors[index - 1]))) {
    throw new RangeError('倍率必须大于 1 并严格递减。')
  }
  if (!Number.isFinite(minGain) || minGain <= 0) throw new RangeError('最小提升必须大于 0。')
  const session = {
    setup: { ...setup }, factors, minGain, incumbent, level: 0, runs: [], decisions: [],
    confirmations: 0, latestComparison: [], warning: null, done: false, reason: null,
  }
  return { ...session, plan: screenPlan(session, '先测试当前档及两侧档位；之后根据本组成绩决定推进方向。') }
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
  return rebuildSession(session.setup, session.runs.slice(0, -1), { factors: session.factors, minGain: session.minGain })
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
    mode: 'range-medium-30', algorithm: 'adaptive-local-v1',
    sensitivity: session.incumbent, edpi: session.incumbent * session.setup.dpi,
    score: incumbentEntry.score, rounds: session.runs.length,
    tied: close.length > 1, leaders: close,
    reason: session.reason, message: END_REASONS[session.reason], warning: session.warning,
    history, runs: session.runs, decisions: session.decisions, latestComparison: session.latestComparison,
    initialSensitivity: session.setup.sens, minGain: session.minGain,
  }
}
