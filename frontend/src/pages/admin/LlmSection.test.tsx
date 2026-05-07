import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import * as api from '../../services/api'
import { LlmSection } from './LlmSection'

describe('LlmSection', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getAdminLlmModelSuggestions').mockResolvedValue({
      models: [],
      warning: null,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens add-provider dialog and submits putAdminLlmProvider', async () => {
    const user = userEvent.setup()

    vi.spyOn(api, 'listStudios').mockResolvedValue([
      { id: 'studio-1', name: 'Studio One', description: null, logo_path: null, created_at: '' },
    ])
    vi.spyOn(api, 'getAdminLlmDeployment').mockResolvedValue({
      has_providers: false,
      providers: [],
    })
    vi.spyOn(api, 'getAdminLlmRouting').mockResolvedValue([])
    vi.spyOn(api, 'getAdminStudioLlmPolicy').mockResolvedValue([])

    const putSpy = vi.spyOn(api, 'putAdminLlmProvider').mockResolvedValue({
      id: 'new-id',
      provider_key: 'acme',
      display_name: 'Acme AI',
      models: ['model-a'],
      api_base_url: null,
      logo_url: null,
      status: 'needs-key',
      is_default: false,
      sort_order: 0,
      llm_api_key_set: false,
      llm_api_key_hint: null,
      litellm_provider_slug: null,
    })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <LlmSection />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText(/Model registry/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Embedding settings' })).toHaveAttribute(
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

  it('edits routing registry in dialog, saves, and runs row probe with overrides', async () => {
    const user = userEvent.setup()

    vi.spyOn(api, 'listStudios').mockResolvedValue([
      { id: 'studio-1', name: 'Studio One', description: null, logo_path: null, created_at: '' },
    ])
    const deploymentState: {
      providers: api.LlmProviderRegistryRow[]
    } = {
      providers: [
        {
          id: 'prov-1',
          provider_key: 'moonshot',
          display_name: 'M2 Moonshot',
          models: ['old-model'],
          api_base_url: 'https://api.moonshot.example/v1',
          logo_url: 'https://icons.duckduckgo.com/ip3/api.moonshot.example.ico',
          status: 'connected',
          is_default: false,
          sort_order: 0,
          llm_api_key_set: false,
          llm_api_key_hint: null,
          litellm_provider_slug: null,
        },
      ],
    }
    vi.spyOn(api, 'getAdminLlmDeployment').mockImplementation(() =>
      Promise.resolve({
        has_providers: true,
        providers: deploymentState.providers,
      }),
    )
    vi.spyOn(api, 'getAdminLlmRouting').mockResolvedValue([])
    vi.spyOn(api, 'getAdminStudioLlmPolicy').mockResolvedValue([])

    const putSpy = vi.spyOn(api, 'putAdminLlmProvider').mockImplementation(async (key, body) => {
      deploymentState.providers = deploymentState.providers.map((p) =>
        p.provider_key === key
          ? {
              ...p,
              display_name: body.display_name,
              models: body.models,
              api_base_url: body.api_base_url !== undefined ? body.api_base_url : p.api_base_url,
              status: body.status !== undefined ? body.status : p.status,
              is_default: body.is_default !== undefined ? body.is_default : p.is_default,
              sort_order: body.sort_order !== undefined ? body.sort_order : p.sort_order,
              litellm_provider_slug:
                body.litellm_provider_slug !== undefined
                  ? body.litellm_provider_slug
                  : p.litellm_provider_slug,
            }
          : p,
      )
      const row = deploymentState.providers.find((p) => p.provider_key === key)
      return {
        id: row?.id ?? 'prov-1',
        provider_key: key,
        display_name: body.display_name,
        models: body.models,
        api_base_url: body.api_base_url ?? null,
        logo_url: row?.logo_url ?? null,
        status: body.status ?? 'needs-key',
        is_default: body.is_default ?? false,
        sort_order: body.sort_order ?? 0,
        llm_api_key_set: row?.llm_api_key_set ?? false,
        llm_api_key_hint: row?.llm_api_key_hint ?? null,
        litellm_provider_slug:
          body.litellm_provider_slug !== undefined
            ? body.litellm_provider_slug
            : row?.litellm_provider_slug ?? null,
      }
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

    expect(await screen.findByText('M2 Moonshot')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^edit$/i }))

    const dialog = await screen.findByRole('dialog')
    const modelsField = within(dialog).getByLabelText(/^Model IDs/i)
    await user.clear(modelsField)
    await user.type(modelsField, 'alpha, beta')

    await user.click(within(dialog).getByRole('button', { name: /^save changes$/i }))

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        'moonshot',
        expect.objectContaining({
          display_name: 'M2 Moonshot',
          models: ['alpha', 'beta'],
          api_base_url: 'https://api.moonshot.example/v1',
          status: 'connected',
          litellm_provider_slug: null,
        }),
      )
    })

    await user.click(screen.getByRole('button', { name: 'Test' }))

    await waitFor(() => {
      expect(probeSpy).toHaveBeenCalledWith({
        model: 'alpha',
        api_base_url: 'https://api.moonshot.example/v1',
        provider_key: 'moonshot',
      })
    })

    expect(await screen.findByText('Probe OK')).toBeInTheDocument()
  })

  it('adds a routing rule from the modal and persists with putAdminLlmRouting', async () => {
    const user = userEvent.setup()

    vi.spyOn(api, 'listStudios').mockResolvedValue([
      { id: 'studio-1', name: 'Studio One', description: null, logo_path: null, created_at: '' },
    ])
    vi.spyOn(api, 'getAdminLlmDeployment').mockResolvedValue({
      has_providers: false,
      providers: [],
    })
    vi.spyOn(api, 'getAdminLlmRouting').mockResolvedValue([])
    vi.spyOn(api, 'getAdminStudioLlmPolicy').mockResolvedValue([])

    const putRoutingSpy = vi.spyOn(api, 'putAdminLlmRouting').mockResolvedValue([
      { use_case: 'chat', primary_model: 'gpt-4o-mini', fallback_model: null },
    ])

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <LlmSection />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText(/Model registry/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /add routing/i }))

    const dialog = await screen.findByRole('dialog', { name: /add routing rule/i })
    await user.type(within(dialog).getByLabelText(/^Primary model$/i), 'gpt-4o-mini')
    await user.click(within(dialog).getByRole('button', { name: /^add rule$/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /add routing rule/i })).not.toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /^save routing$/i }))

    await waitFor(() => {
      expect(putRoutingSpy).toHaveBeenCalledWith({
        rules: [{ use_case: 'chat', primary_model: 'gpt-4o-mini', fallback_model: null }],
      })
    })
  })
})
