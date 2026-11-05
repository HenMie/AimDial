import { useCallback, useMemo, useState } from 'react'
import {
  createSearch,
  currentProbe,
  submit,
  isDone,
  recommend,
  historyOf,
} from '../lib/goldenSearch.js'
import { cm360, sensFromEdpi } from '../lib/sens.js'

/**
 * Drives one calibration session: base eDPI in, a stream of probes out,
 * converged recommendation at the end. Pure state — the search object is
 * rebuilt from the snapshot each update so React sees a fresh reference.
 */
export function useCalibration(setup) {
  const [session, setSession] = useState(null)

  const start = useCallback(() => {
    setSession(snapshot(createSearch(setup.edpi)))
  }, [setup.edpi])

  const record = useCallback((probeEdpi, score) => {
    setSession((prev) => (prev ? snapshot(submit(prev.engine, probeEdpi, score)) : prev))
  }, [])

  const result = useMemo(() => {
    if (!session || !session.done) return null
    const rec = recommend(session.engine)
    const sens = sensFromEdpi(rec.edpi, setup.dpi)
    return { ...rec, sensitivity: sens, cm360: cm360(setup.dpi, sens) }
  }, [session, setup.dpi])

  return {
    session,
    current: session?.nextProbe ?? null,
    done: Boolean(session?.done),
    record,
    start,
    result,
  }
}

function snapshot(engine) {
  return {
    engine,
    lo: engine.lo,
    hi: engine.hi,
    baseEdpi: engine.baseEdpi,
    rounds: engine.rounds,
    maxRounds: engine.maxRounds,
    tolerance: engine.tolerance,
    nextProbe: currentProbe(engine),
    done: isDone(engine),
    best: engine.best,
    lastComparison: engine.lastComparison,
    history: historyOf(engine),
  }
}
