import { useEffect, useMemo, useState } from 'react'

import type { YjsCollab } from './useYjsCollab'
import {
  collaboratorCountFromAwareness,
  remoteAwarenessPeers,
  type RemoteAwarenessPeer,
} from '../lib/copilotAwareness'

/** Recomputes when Yjs awareness changes (presence + collaborator counts). */
export function useCollabAwarenessPresence(collab: YjsCollab | null): {
  remotePeers: RemoteAwarenessPeer[]
  collaboratorCount: number
} {
  const [bump, setBump] = useState(0)

  useEffect(() => {
    if (!collab?.awareness) {
      return
    }
    const a = collab.awareness as {
      on?: (ev: string, fn: () => void) => void
      off?: (ev: string, fn: () => void) => void
    }
    if (typeof a.on !== 'function') {
      return
    }
    const fn = (): void => {
      setBump((n) => n + 1)
    }
    a.on('change', fn)
    return () => {
      a.off?.('change', fn)
    }
  }, [collab?.awareness])

  void bump

  const remotePeers = useMemo(
    () => remoteAwarenessPeers(collab),
    [collab, bump],
  )
  const collaboratorCount = useMemo(
    () => collaboratorCountFromAwareness(collab),
    [collab, bump],
  )

  return { remotePeers, collaboratorCount }
}
