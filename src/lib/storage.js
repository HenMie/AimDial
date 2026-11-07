import { ALGORITHM, completeEarly, rebuildSession } from './rangeCalibration.js'

const KEY = 'aimdial.data.v2'
const LEGACY_KEY = 'aimdial.history.v1'

export function loadData(storage = localStorage) {
  const raw = storage.getItem(KEY)
  if (raw) {
    const data = JSON.parse(raw)
    if (data.version !== 2 || !Array.isArray(data.history)) throw new Error('保存的数据格式不兼容。')
    return data
  }
  const history = JSON.parse(storage.getItem(LEGACY_KEY) || '[]')
  if (!Array.isArray(history)) throw new Error('历史记录格式不正确。')
  return { version: 2, draft: null, history }
}

/**
 * Restore an in-progress run.
 *
 * The draft stores only the rounds; the plan is re-derived from them. That is
 * possible — and correct — precisely because the search is a pure function of
 * `setup + runs`, so a restored session resumes on exactly the setting the
 * algorithm would have proposed had the tab never been closed.
 *
 * Drafts from an older algorithm are refused rather than replayed: the rounds
 * mean something different to a search that no longer walks a fixed ladder, and
 * silently replaying them would present a value the current rules never chose.
 */
export function restoreDraft(draft) {
  if (draft.algorithm !== ALGORITHM) throw new Error('测试进度的算法版本不兼容，请重新开始。')
  const restored = rebuildSession(draft.setup, draft.runs, draft.options)
  return draft.reason === 'manual' ? completeEarly(restored) : restored
}

export function saveDraft(id, session, input, storage = localStorage) {
  const data = loadData(storage)
  const draft = {
    id, algorithm: ALGORITHM, updatedAt: new Date().toISOString(),
    setup: session.setup, runs: session.runs, reason: session.reason, input,
    // The mode decides what the run was allowed to know at the start — refine
    // has a starting value, discovery deliberately does not — so a draft
    // without it cannot be rebuilt.
    options: { mode: session.mode },
  }
  storage.setItem(KEY, JSON.stringify({ ...data, draft }))
  return draft
}

export function finishRun(id, result, setup, storage = localStorage) {
  const data = loadData(storage)
  const existing = data.history.find((entry) => entry.id === id)
  const entry = existing ?? { ...result, id, at: new Date().toISOString(), dpi: setup.dpi, setup }
  const next = {
    ...data,
    draft: data.draft?.id === id ? null : data.draft,
    history: [entry, ...data.history.filter((item) => item.id !== id)],
  }
  // History and draft change in one write, so a failed save keeps the draft intact.
  storage.setItem(KEY, JSON.stringify(next))
  return next
}

export function discardDraft(storage = localStorage) {
  const data = { ...loadData(storage), draft: null }
  storage.setItem(KEY, JSON.stringify(data))
  return data
}
