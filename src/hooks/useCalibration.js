import { useEffect, useMemo, useState } from 'react'
import { completeEarly, createSession, recordKills, summarizeSession, undoLastRun } from '../lib/rangeCalibration.js'
import { saveDraft } from '../lib/storage.js'

export function useCalibration(setup, id, initialSession, initialInput = '') {
  const [session, setSession] = useState(() => initialSession ?? createSession(setup))
  const [kills, setKills] = useState(initialInput)
  const [saveError, setSaveError] = useState(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    try {
      saveDraft(id, session, kills)
      setSaveError(null)
      setSaved(true)
    } catch (error) {
      setSaveError(`进度未保存：${error.message}`)
      setSaved(false)
    }
  }, [id, session, kills])
  const result = useMemo(() => {
    if (!session.done) return null
    return summarizeSession(session)
  }, [session])
  return {
    session, kills, setKills, saved, saveError,
    current: session.plan.schedule[session.plan.cursor],
    record: (value) => { setSession((previous) => recordKills(previous, value)); setKills('') },
    undo: () => { setSession((previous) => undoLastRun(previous)); setKills('') },
    stop: () => setSession((previous) => completeEarly(previous)),
    done: session.done, result,
  }
}
