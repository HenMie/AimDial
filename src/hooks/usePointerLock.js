import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Pointer lock + raw movement accumulation for an element.
 *
 * `movementX/Y` is reported in CSS pixels, not device counts, so we do not try
 * to reverse-engineer physical DPI here. Instead the caller converts a
 * *relative* rotation budget into on-screen pixels: the ratio between two
 * sensitivities is what matters for the search, and that ratio survives the
 * CSS-pixel abstraction intact.
 */
export function usePointerLock(targetRef, { onLockChange } = {}) {
  const [locked, setLocked] = useState(false)
  const lockCallback = useRef(onLockChange)
  lockCallback.current = onLockChange

  const request = useCallback(() => {
    const el = targetRef.current
    if (!el) return
    // Ask for raw device deltas: with the OS acceleration curve left on, the
    // same mouse travel produces different angles at different speeds, and the
    // 1:1 mapping to the in-game sensitivity falls apart.
    const pending = el.requestPointerLock?.({ unadjustedMovement: true })
    if (pending?.catch) pending.catch(() => el.requestPointerLock?.())
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
    document.addEventListener('pointerlockchange', onChange)
    document.addEventListener('pointerlockerror', onChange)
    return () => {
      document.removeEventListener('pointerlockchange', onChange)
      document.removeEventListener('pointerlockerror', onChange)
    }
  }, [targetRef])

  return { locked, request, exit }
}
