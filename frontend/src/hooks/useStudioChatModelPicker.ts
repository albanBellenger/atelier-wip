import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  buildChatModelOptions,
  studioChatModelPickerTitle,
} from '../lib/studioChatModels'
import {
  readStoredSoftwareChatModel,
  softwareChatModelStorageKey,
} from '../lib/softwareComposerNav'
import { getStudioChatLlmModels, type StudioChatLlmModels } from '../services/api'

export function useStudioChatModelPicker(opts: {
  studioId: string
  enabled?: boolean
  /** Shown in model picker tooltip after loading. */
  titleContextHint?: string
}): {
  modelsQ: UseQueryResult<StudioChatLlmModels>
  options: string[]
  selectedModel: string | null
  /** Updates selection and persists to studio-scoped localStorage. */
  setSelectedModel: (modelId: string) => void
  modelTitle: string
} {
  const enabled = opts.enabled !== false && Boolean(opts.studioId)
  const modelsQ = useQuery({
    queryKey: ['studios', opts.studioId, 'llm-chat-models'],
    queryFn: () => getStudioChatLlmModels(opts.studioId),
    enabled,
    staleTime: 60_000,
    retry: 1,
  })

  const options = useMemo((): string[] => {
    if (!modelsQ.data) return []
    return buildChatModelOptions(modelsQ.data)
  }, [modelsQ.data])

  const [selectedModel, setSelectedModelState] = useState<string | null>(null)

  useEffect(() => {
    if (options.length === 0) {
      setSelectedModelState(null)
      return
    }
    let cancelled = false
    const stored = readStoredSoftwareChatModel(opts.studioId)
    const pick =
      stored && options.includes(stored) ? stored : (options[0] ?? null)
    if (!cancelled) setSelectedModelState(pick)
    return () => {
      cancelled = true
    }
  }, [options, opts.studioId])

  const setSelectedModel = useCallback(
    (modelId: string) => {
      setSelectedModelState(modelId)
      window.localStorage.setItem(
        softwareChatModelStorageKey(opts.studioId),
        modelId,
      )
    },
    [opts.studioId],
  )

  const modelTitle = useMemo(
    () =>
      studioChatModelPickerTitle(
        {
          isPending: modelsQ.isPending,
          isError: modelsQ.isError,
          data: modelsQ.data,
        },
        opts.titleContextHint,
      ),
    [modelsQ.data, modelsQ.isError, modelsQ.isPending, opts.titleContextHint],
  )

  return { modelsQ, options, selectedModel, setSelectedModel, modelTitle }
}
