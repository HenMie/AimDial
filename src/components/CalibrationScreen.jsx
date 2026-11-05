import { useEffect, useMemo } from 'react'
import AimCanvas from './AimCanvas.jsx'
import { useCalibration } from '../hooks/useCalibration.js'
import { sensFromEdpi, cm360, round } from '../lib/sens.js'

export default function CalibrationScreen({ setup, onFinish }) {
  const { session, current, record, start, done, result } = useCalibration(setup)

  // Kicking off the search on mount makes the screen self-contained.
  useEffect(() => {
    start()
  }, [start])

  useEffect(() => {
    if (done && result) onFinish(result)
  }, [done, result, onFinish])

  const probeSens = useMemo(
    () => (current ? sensFromEdpi(current, setup.dpi) : null),
    [current, setup.dpi],
  )

  if (!session || !current) return <div className="stage" />

  return (
    <AimCanvas
      key={current}
      sensitivity={probeSens}
      meta={`${round(current, 0)} eDPI · ${round(cm360(setup.dpi, probeSens), 1)} cm/360°`}
      round={session.history.length + 1}
      rounds={session.maxRounds}
      onComplete={(r) => record(current, r.score)}
    />
  )
}
