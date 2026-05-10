import type { UseQueryResult } from '@tanstack/react-query'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'

import { buildStudioLlmPolicyRows } from '../lib/studioLlmPolicy'
import type { AdminLlmDeployment, LlmProviderRegistryRow, StudioLlmPolicyRow } from '../services/api'
import {
  getAdminLlmDeployment,
  getAdminStudioLlmPolicy,
  putAdminStudioLlmPolicy,
} from '../services/api'

export interface UseStudioLlmPolicyResult {
  deploymentQuery: UseQueryResult<AdminLlmDeployment, Error>
  policyQuery: UseQueryResult<StudioLlmPolicyRow[], Error>
  connectedProviders: LlmProviderRegistryRow[]
  rowsForStudio: StudioLlmPolicyRow[]
  savePolicyIsPending: boolean
  updatePolicyRow: (
    providerId: string,
    patch: Partial<Pick<StudioLlmPolicyRow, 'enabled' | 'selected_model'>>,
  ) => void
  persistRows: (next: StudioLlmPolicyRow[]) => void
}

/**
 * Per-studio LLM allow-list rows: loads deployment + policy, builds merged rows, persists via PUT.
 */
export function useStudioLlmPolicy(studioId: string): UseStudioLlmPolicyResult {
  const qc = useQueryClient()

  const deploymentQuery = useQuery({
    queryKey: ['admin', 'llm', 'deployment'],
    queryFn: () => getAdminLlmDeployment(),
  })

  const policyQuery = useQuery({
    queryKey: ['admin', 'llm', 'policy', studioId],
    queryFn: () => getAdminStudioLlmPolicy(studioId),
    enabled: Boolean(studioId),
    retry: false,
  })

  const providers = deploymentQuery.data?.providers ?? []
  const connectedProviders = useMemo(
    () => providers.filter((p) => p.status === 'connected'),
    [providers],
  )

  const rowsForStudio = useMemo(
    () => buildStudioLlmPolicyRows(connectedProviders, policyQuery.data),
    [connectedProviders, policyQuery.data],
  )

  const savePolicy = useMutation({
    mutationFn: ({ sid, rows }: { sid: string; rows: StudioLlmPolicyRow[] }) =>
      putAdminStudioLlmPolicy(sid, { rows }),
    onSuccess: async (_, { sid }) => {
      await qc.invalidateQueries({ queryKey: ['admin', 'llm', 'policy', sid] })
    },
  })

  const persistRows = useCallback(
    (next: StudioLlmPolicyRow[]) => {
      if (!studioId) return
      savePolicy.mutate({ sid: studioId, rows: next })
    },
    [studioId, savePolicy],
  )

  const updatePolicyRow = useCallback(
    (providerId: string, patch: Partial<Pick<StudioLlmPolicyRow, 'enabled' | 'selected_model'>>) => {
      const next = rowsForStudio.map((r) =>
        r.provider_id === providerId ? { ...r, ...patch } : r,
      )
      persistRows(next)
    },
    [persistRows, rowsForStudio],
  )

  return {
    deploymentQuery,
    policyQuery,
    connectedProviders,
    rowsForStudio,
    savePolicyIsPending: savePolicy.isPending,
    updatePolicyRow,
    persistRows,
  }
}
