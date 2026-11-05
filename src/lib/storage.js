const KEY = 'aimdial.history.v1'
const MAX_ENTRIES = 20

export function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveRun(run) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    ...run,
  }
  const next = [entry, ...loadHistory()].slice(0, MAX_ENTRIES)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Quota or private mode — the run is still shown on screen, just not kept.
  }
  return next
}

export function clearHistory() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
  return []
}
