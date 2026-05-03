import type { YjsCollab } from '../hooks/useYjsCollab'

/** y-websocket Awareness can throw from getStates() before the conn/doc is ready. */
export function safeAwarenessStates(awareness: {
  getStates: () => Map<number, unknown>
}): Map<number, unknown> | null {
  try {
    return awareness.getStates()
  } catch {
    return null
  }
}

export function collaboratorCountFromAwareness(collab: YjsCollab | null): number {
  if (collab == null) {
    return 1
  }
  const awareness = collab.awareness as unknown
  if (
    awareness == null ||
    typeof awareness !== 'object' ||
    !('getStates' in awareness) ||
    typeof (awareness as { getStates?: unknown }).getStates !== 'function'
  ) {
    return 1
  }
  const states = safeAwarenessStates(
    awareness as { getStates: () => Map<number, unknown> },
  )
  if (states == null) {
    return 1
  }
  const names = new Set<string>()
  states.forEach((state: unknown) => {
    if (
      state != null &&
      typeof state === 'object' &&
      'user' in state &&
      state.user != null &&
      typeof state.user === 'object' &&
      'name' in state.user &&
      typeof (state.user as { name?: unknown }).name === 'string'
    ) {
      names.add((state.user as { name: string }).name)
    }
  })
  return Math.max(1, names.size)
}
