import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  type LlmModelSuggestionsResponse,
  getAdminLlmModelSuggestions,
} from '../services/api'

export function useAdminLlmModelSuggestions(opts: {
  q: string
  providerId?: string | null
  litellmProvider?: string | null
  mode?: 'chat' | 'embedding'
  source?: 'auto' | 'catalog' | 'upstream' | 'registry'
  /** When true, fetch even if q is short (e.g. modal open). */
  prefetch?: boolean
  /** Minimum trimmed q length before fetching when prefetch is false. Default 2. */
  minChars?: number
  enabled?: boolean
}): ReturnType<typeof useQuery<LlmModelSuggestionsResponse>> {
  const [debouncedQ, setDebouncedQ] = useState(opts.q)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(opts.q), 300)
    return () => clearTimeout(t)
  }, [opts.q])

  const minChars = opts.minChars ?? 2
  const prefetch = opts.prefetch ?? false
  const qOk = prefetch || debouncedQ.trim().length >= minChars

  return useQuery({
    queryKey: [
      'admin',
      'llm',
      'model-suggestions',
      debouncedQ,
      opts.providerId ?? '',
      opts.litellmProvider ?? '',
      opts.mode ?? 'chat',
      opts.source ?? 'catalog',
    ],
    queryFn: () =>
      getAdminLlmModelSuggestions({
        provider_id: opts.providerId ?? undefined,
        litellm_provider: opts.litellmProvider ?? undefined,
        q: debouncedQ.trim() || undefined,
        mode: opts.mode,
        source: opts.source ?? 'catalog',
      }),
    enabled: opts.enabled !== false && qOk,
    staleTime: 5 * 60 * 1000,
  })
}
