import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import * as api from '../services/api'
import { useStudioLlmPolicy } from './useStudioLlmPolicy'

function wrapper(qc: QueryClient) {
  return function W({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

const deployment: api.AdminLlmDeployment = {
  has_providers: true,
  providers: [
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
      llm_api_key_hint: '…',
    },
  ],
}

describe('useStudioLlmPolicy', () => {
  it('does not fetch policy when studioId is empty but still builds rows from deployment', async () => {
    const policySpy = vi.spyOn(api, 'getAdminStudioLlmPolicy')
    vi.spyOn(api, 'getAdminLlmDeployment').mockResolvedValue(deployment)

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(() => useStudioLlmPolicy(''), {
      wrapper: wrapper(qc),
    })

    await waitFor(() => {
      expect(result.current.deploymentQuery.isSuccess).toBe(true)
    })
    expect(policySpy).not.toHaveBeenCalled()
    expect(result.current.rowsForStudio).toEqual([
      {
        provider_id: 'openai',
        enabled: false,
        selected_model: 'gpt-4o-mini',
      },
    ])
  })

  it('builds rows with chat-only default model and persists toggle', async () => {
    vi.spyOn(api, 'getAdminLlmDeployment').mockResolvedValue(deployment)
    vi.spyOn(api, 'getAdminStudioLlmPolicy').mockResolvedValue([
      { provider_id: 'openai', enabled: false, selected_model: 'gpt-4o-mini' },
    ])
    const putSpy = vi.spyOn(api, 'putAdminStudioLlmPolicy').mockResolvedValue([
      { provider_id: 'openai', enabled: true, selected_model: 'gpt-4o-mini' },
    ])

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const studioId = '11111111-1111-1111-1111-111111111111'
    const { result } = renderHook(() => useStudioLlmPolicy(studioId), {
      wrapper: wrapper(qc),
    })

    await waitFor(() => {
      expect(result.current.policyQuery.isSuccess).toBe(true)
    })

    const openai = result.current.rowsForStudio.find((r) => r.provider_id === 'openai')
    expect(openai?.selected_model).toBe('gpt-4o-mini')

    result.current.updatePolicyRow('openai', { enabled: true })

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(studioId, {
        rows: expect.arrayContaining([
          expect.objectContaining({
            provider_id: 'openai',
            enabled: true,
            selected_model: 'gpt-4o-mini',
          }),
        ]),
      })
    })
  })
})
