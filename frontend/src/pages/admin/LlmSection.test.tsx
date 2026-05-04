import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import * as api from '../../services/api'
import { LlmSection } from './LlmSection'

describe('LlmSection', () => {
  it('opens add-provider dialog and submits putAdminLlmProvider', async () => {
    const user = userEvent.setup()

    vi.spyOn(api, 'listStudios').mockResolvedValue([
      { id: 'studio-1', name: 'Studio One', description: null, logo_path: null, created_at: '' },
    ])
    vi.spyOn(api, 'getAdminLlmDeployment').mockResolvedValue({
      credentials: {
        llm_provider: 'openai',
        llm_model: 'gpt-4o-mini',
        llm_api_base_url: null,
        llm_api_key_set: true,
        embedding_provider: null,
        embedding_model: null,
        embedding_api_base_url: null,
        embedding_api_key_set: false,
      },
      providers: [],
    })
    vi.spyOn(api, 'getAdminLlmRouting').mockResolvedValue([])
    vi.spyOn(api, 'getAdminStudioLlmPolicy').mockResolvedValue([])

    const putSpy = vi.spyOn(api, 'putAdminLlmProvider').mockResolvedValue({
      id: 'new-id',
      provider_key: 'acme',
      display_name: 'Acme AI',
      models: ['model-a'],
      region: null,
      api_base_url: null,
      status: 'needs-key',
      is_default: false,
      key_preview: null,
      sort_order: 0,
    })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <LlmSection />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText('gpt-4o-mini')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tool settings' })).toHaveAttribute(
      'href',
      '/admin/settings',
    )

    await user.click(screen.getByRole('button', { name: /add provider/i }))

    await user.type(screen.getByLabelText(/^Provider key/i), 'acme')
    await user.type(screen.getByLabelText(/^Display name/i), 'Acme AI')
    await user.type(screen.getByLabelText(/^Model IDs/i), 'model-a, model-b')
    await user.type(
      screen.getByLabelText(/^API base URL \(optional\)/i),
      'https://api.example.com/v1',
    )

    await user.click(screen.getByRole('button', { name: /^Register provider$/i }))

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        'acme',
        expect.objectContaining({
          display_name: 'Acme AI',
          models: ['model-a', 'model-b'],
          api_base_url: 'https://api.example.com/v1',
          status: 'needs-key',
        }),
      )
    })
  })

  it('edits routing registry models, saves, and runs row probe with overrides', async () => {
    const user = userEvent.setup()

    vi.spyOn(api, 'listStudios').mockResolvedValue([
      { id: 'studio-1', name: 'Studio One', description: null, logo_path: null, created_at: '' },
    ])
    vi.spyOn(api, 'getAdminLlmDeployment').mockResolvedValue({
      credentials: {
        llm_provider: 'openai',
        llm_model: 'gpt-4o-mini',
        llm_api_base_url: null,
        llm_api_key_set: true,
        embedding_provider: null,
        embedding_model: null,
        embedding_api_base_url: null,
        embedding_api_key_set: false,
      },
      providers: [
        {
          id: 'prov-1',
          provider_key: 'moonshot',
          display_name: 'M2 Moonshot',
          models: ['old-model'],
          region: 'US',
          api_base_url: 'https://api.moonshot.example/v1',
          status: 'connected',
          is_default: false,
          key_preview: 'sk-…x',
          sort_order: 0,
        },
      ],
    })
    vi.spyOn(api, 'getAdminLlmRouting').mockResolvedValue([])
    vi.spyOn(api, 'getAdminStudioLlmPolicy').mockResolvedValue([])

    const putSpy = vi.spyOn(api, 'putAdminLlmProvider').mockResolvedValue({
      id: 'prov-1',
      provider_key: 'moonshot',
      display_name: 'M2 Moonshot',
      models: ['alpha', 'beta'],
      region: 'US',
      api_base_url: 'https://api.moonshot.example/v1',
      status: 'connected',
      is_default: false,
      key_preview: 'sk-…x',
      sort_order: 0,
    })
    const probeSpy = vi.spyOn(api, 'postAdminTestLlm').mockResolvedValue({
      ok: true,
      message: 'Probe OK',
      detail: null,
    })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <LlmSection />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByLabelText(/Model IDs for M2 Moonshot/i)).toBeInTheDocument()

    const modelsField = screen.getByLabelText(/Model IDs for M2 Moonshot/i)
    await user.clear(modelsField)
    await user.type(modelsField, 'alpha, beta')

    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        'moonshot',
        expect.objectContaining({
          display_name: 'M2 Moonshot',
          models: ['alpha', 'beta'],
          api_base_url: 'https://api.moonshot.example/v1',
          status: 'connected',
        }),
      )
    })

    await user.click(screen.getByRole('button', { name: 'Test' }))

    await waitFor(() => {
      expect(probeSpy).toHaveBeenCalledWith({
        model: 'alpha',
        api_base_url: 'https://api.moonshot.example/v1',
      })
    })

    expect(await screen.findByText('Probe OK')).toBeInTheDocument()
  })
})
