import { describe, it, expect } from 'vitest'
import { createSession, recordKills, completeEarly, summarizeSession, undoLastRun } from './rangeCalibration.js'
import { loadData, saveDraft, restoreDraft, finishRun, discardDraft } from './storage.js'

const setup = { dpi: 800, sens: 0.2 }
function memoryStorage() {
  const entries = new Map()
  return { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) }
}

describe('persistent calibration', () => {
  it('restores dynamic confirmation plans and unfinished input', () => {
    const storage = memoryStorage()
    const session = [20, 19, 25, 20, 23].reduce(recordKills, createSession(setup))
    saveDraft('session-1', session, '2', storage)
    const data = loadData(storage)
    expect(restoreDraft(data.draft)).toEqual(session)
    expect(data.draft.input).toBe('2')
    expect(data.draft.id).toBe('session-1')
  })

  it('persists undo so removed scores never return on reload', () => {
    const storage = memoryStorage()
    const session = [20, 19, 25].reduce(recordKills, createSession(setup))
    saveDraft('session-1', undoLastRun(session), '', storage)
    const restored = restoreDraft(loadData(storage).draft)
    expect(restored.runs).toHaveLength(2)
    expect(restored.plan.phase).toBe('screen')
  })

  it('restores a manually finished session even before opening its report', () => {
    const storage = memoryStorage()
    const session = completeEarly(recordKills(createSession(setup), 20))
    saveDraft('session-1', session, '', storage)
    expect(restoreDraft(loadData(storage).draft)).toEqual(session)
  })

  it('finishes atomically and idempotently with the full report', () => {
    const storage = memoryStorage()
    const session = completeEarly(recordKills(createSession(setup), 20))
    saveDraft('session-1', session, '', storage)
    const result = summarizeSession(session)
    finishRun('session-1', result, setup, storage)
    finishRun('session-1', result, setup, storage)
    const data = loadData(storage)
    expect(data.draft).toBeNull()
    expect(data.history).toHaveLength(1)
    expect(data.history[0].runs).toEqual(session.runs)
    expect(data.history[0].reason).toBe('manual')
  })

  it('exposes write errors and leaves the saved draft intact', () => {
    const storage = memoryStorage()
    const session = completeEarly(recordKills(createSession(setup), 20))
    saveDraft('session-1', session, '', storage)
    const broken = { ...storage, setItem: () => { throw new Error('disk full') } }
    expect(() => finishRun('session-1', summarizeSession(session), setup, broken)).toThrow('disk full')
    expect(loadData(storage).draft.id).toBe('session-1')
  })

  it('preserves old history while saving a new-format draft', () => {
    const storage = memoryStorage()
    const old = { id: 'old-1', sensitivity: 0.2, dpi: 800, rounds: 6 }
    storage.setItem('aimdial.history.v1', JSON.stringify([old]))
    saveDraft('new-1', createSession(setup), '', storage)
    expect(loadData(storage).history).toEqual([old])
    expect(discardDraft(storage).history).toEqual([old])
    expect(loadData(storage).draft).toBeNull()
  })

  it('exposes incompatible drafts and corrupted data', () => {
    const storage = memoryStorage()
    expect(() => restoreDraft({ algorithm: 'unknown' })).toThrow('版本')
    storage.setItem('aimdial.data.v2', '{')
    expect(() => loadData(storage)).toThrow(SyntaxError)
  })
})
