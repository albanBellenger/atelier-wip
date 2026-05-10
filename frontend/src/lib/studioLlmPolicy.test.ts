import { describe, expect, it } from 'vitest'

import { buildStudioLlmPolicyRows } from './studioLlmPolicy'
import type { LlmProviderRegistryRow, StudioLlmPolicyRow } from '../services/api'

describe('buildStudioLlmPolicyRows', () => {
  it('defaults selected_model to first chat model, not embedding', () => {
    const connected: LlmProviderRegistryRow[] = [
      {
        id: 'p1',
        provider_id: 'openai',
        models: [
          { id: 'text-embedding-3-small', kind: 'embedding' },
          { id: 'gpt-4o-mini', kind: 'chat' },
        ],
        litellm_provider_slug: null,
        api_base_url: null,
        logo_url: null,
        status: 'connected',
        is_default: true,
        sort_order: 0,
        llm_api_key_set: true,
        llm_api_key_hint: null,
      },
    ]
    const existing: StudioLlmPolicyRow[] | undefined = undefined
    const rows = buildStudioLlmPolicyRows(connected, existing)
    expect(rows).toEqual([
      expect.objectContaining({
        provider_id: 'openai',
        enabled: false,
        selected_model: 'gpt-4o-mini',
      }),
    ])
  })

  it('preserves policy rows for disconnected providers', () => {
    const connected: LlmProviderRegistryRow[] = []
    const existing: StudioLlmPolicyRow[] = [
      { provider_id: 'anthropic', enabled: true, selected_model: 'claude-3-sonnet' },
    ]
    const rows = buildStudioLlmPolicyRows(connected, existing)
    expect(rows).toEqual(existing)
  })
})
