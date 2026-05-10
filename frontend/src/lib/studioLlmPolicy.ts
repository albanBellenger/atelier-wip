import type { LlmProviderRegistryRow, StudioLlmPolicyRow } from '../services/api'
import { chatModelIdsFromEntries } from '../services/api'

/** Merge connected registry rows with saved studio policy (chat models only for defaults). */
export function buildStudioLlmPolicyRows(
  connectedProviders: LlmProviderRegistryRow[],
  existing: StudioLlmPolicyRow[] | undefined,
): StudioLlmPolicyRow[] {
  const map = new Map(existing?.map((r) => [r.provider_id, r]) ?? [])
  const built = connectedProviders.map((p) => {
    const prev = map.get(p.provider_id)
    const ids = chatModelIdsFromEntries(p.models)
    const defaultModel = ids[0] ?? null
    return {
      provider_id: p.provider_id,
      enabled: prev?.enabled ?? false,
      selected_model:
        prev?.selected_model && ids.includes(prev.selected_model)
          ? prev.selected_model
          : defaultModel,
    }
  })
  const connIds = new Set(connectedProviders.map((pr) => pr.provider_id))
  const preserved = (existing ?? []).filter((r) => !connIds.has(r.provider_id))
  return [...built, ...preserved]
}
