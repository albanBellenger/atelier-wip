import { useCallback, useMemo } from 'react'

import {
  streamPrivateThreadReply,
  type PrivateThreadStreamPayload,
} from '../services/api'
import type { PrivateThreadStreamMeta } from '../services/privateThreadSse'

export type { PrivateThreadStreamMeta }

/** Hook for SSE-streamed private thread replies (delegates to api + shared SSE parser). */
export function useStream(): {
  streamPrivateThread: (
    projectId: string,
    sectionId: string,
    payload: PrivateThreadStreamPayload,
    handlers: {
      onToken: (text: string) => void
      onMeta: (meta: PrivateThreadStreamMeta) => void
      onResponseOpen?: () => void
    },
  ) => Promise<void>
} {
  const streamPrivateThread = useCallback(
    (
      projectId: string,
      sectionId: string,
      payload: PrivateThreadStreamPayload,
      handlers: {
        onToken: (text: string) => void
        onMeta: (meta: PrivateThreadStreamMeta) => void
        onResponseOpen?: () => void
      },
    ) => streamPrivateThreadReply(projectId, sectionId, payload, handlers),
    [],
  )
  return useMemo(() => ({ streamPrivateThread }), [streamPrivateThread])
}
