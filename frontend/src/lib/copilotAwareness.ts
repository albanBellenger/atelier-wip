import { colorsForUser, type YjsCollab } from '../hooks/useYjsCollab'

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
  const keys = new Set<string>()
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
      const u = state.user as { name: string; userId?: unknown }
      const userId =
        typeof u.userId === 'string' && u.userId.length > 0 ? u.userId : undefined
      keys.add(userId != null ? `id:${userId}` : `name:${u.name}`)
    }
  })
  return Math.max(1, keys.size)
}

export interface RemoteAwarenessPeer {
  name: string
  /** Fallback when `userId` is missing from awareness (older clients). */
  color: string
  userId?: string
}

function dedupeRemotePeers(peers: RemoteAwarenessPeer[]): RemoteAwarenessPeer[] {
  const seen = new Set<string>()
  const out: RemoteAwarenessPeer[] = []
  for (const p of peers) {
    const key =
      p.userId != null && p.userId !== '' ? `id:${p.userId}` : `name:${p.name}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    out.push(p)
  }
  return out
}

/** Circle / cursor tint aligned with `colorsForUser` when `userId` is present on awareness. */
export function remotePeerDisplayColor(peer: RemoteAwarenessPeer): string {
  if (peer.userId != null && peer.userId !== '') {
    return colorsForUser(peer.userId).color
  }
  return peer.color
}

/** Remote collaborators (excludes local client) for presence UI. */
export function remoteAwarenessPeers(
  collab: YjsCollab | null,
): RemoteAwarenessPeer[] {
  if (collab == null) {
    return []
  }
  const awareness = collab.awareness as unknown
  if (
    awareness == null ||
    typeof awareness !== 'object' ||
    !('getStates' in awareness) ||
    typeof (awareness as { getStates?: unknown }).getStates !== 'function' ||
    !('clientID' in awareness) ||
    typeof (awareness as { clientID?: unknown }).clientID !== 'number'
  ) {
    return []
  }
  const localId = (awareness as { clientID: number }).clientID
  const states = safeAwarenessStates(
    awareness as { getStates: () => Map<number, unknown> },
  )
  if (states == null) {
    return []
  }
  const out: RemoteAwarenessPeer[] = []
  states.forEach((state: unknown, clientId: number) => {
    if (clientId === localId) {
      return
    }
    if (
      state != null &&
      typeof state === 'object' &&
      'user' in state &&
      state.user != null &&
      typeof state.user === 'object' &&
      'name' in state.user &&
      typeof (state.user as { name?: unknown }).name === 'string'
    ) {
      const u = state.user as { name: string; color?: unknown; userId?: unknown }
      const userId =
        typeof u.userId === 'string' && u.userId.length > 0 ? u.userId : undefined
      const color =
        typeof u.color === 'string' && u.color.length > 0 ? u.color : '#71717a'
      out.push({ name: u.name, color, userId })
    }
  })
  return dedupeRemotePeers(out)
}
