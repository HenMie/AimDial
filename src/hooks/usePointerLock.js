import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Pointer lock + raw movement for an element.
 *
 * `movementX/Y` comes back in CSS pixels: one unit per 1/96 inch of physical
 * travel, at every display scale. The caller converts to degrees by scaling the
 * game's counts-per-degree constant by `mouseDPI / 96` (see sens.js), so the
 * view turns at exactly the in-game rate.
 *
 * That mapping only holds under `unadjustedMovement`. When the browser refuses
 * it, the OS pointer-acceleration curve is applied to the deltas, the same mouse
 * travel yields different angles at different speeds, and the 1:1 mapping is
 * gone — so the refusal is surfaced via `rawInput` instead of being swallowed.
 */
export function usePointerLock(targetRef, { onLockChange } = {}) {
  const [locked, setLocked] = useState(false)
  const [rawInput, setRawInput] = useState(null) // null until a lock has been requested
  const lockCallback = useRef(onLockChange)
  lockCallback.current = onLockChange

  const request = useCallback(() => {
    const el = targetRef.current
    if (!el) return
    const grant = () => {
      setRawInput(true)
    }
    const fallback = () => {
      setRawInput(false)
      el.requestPointerLock?.()
    }
    // Ask for raw device deltas: with the OS acceleration curve left on, the
    // same mouse travel produces different angles at different speeds, and the
    // 1:1 mapping to the in-game sensitivity falls apart.
    const pending = el.requestPointerLock?.({ unadjustedMovement: true })
    if (pending?.then) {
      pending.then(grant).catch(fallback)
    } else {
      // Older engines return undefined and report failures through the
      // pointerlockerror event; assume the request took unless it errors.
      setRawInput(true)
    }
  }, [targetRef])

  const exit = useCallback(() => {
    if (document.pointerLockElement) document.exitPointerLock?.()
  }, [])

  useEffect(() => {
    const onChange = () => {
      const isLocked = document.pointerLockElement === targetRef.current
      setLocked(isLocked)
      lockCallback.current?.(isLocked)
    }
    const onError = () => {
      // A failed lock is not a raw-input refusal worth alarming about on its
      // own; leave `rawInput` alone and just re-read the lock state.
      onChange()
    }
    document.addEventListener('pointerlockchange', onChange)
    document.addEventListener('pointerlockerror', onError)
    return () => {
      document.removeEventListener('pointerlockchange', onChange)
      document.removeEventListener('pointerlockerror', onError)
    }
  }, [targetRef])

  return { locked, request, exit, rawInput }
}
