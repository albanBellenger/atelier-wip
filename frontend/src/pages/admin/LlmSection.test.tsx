import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
      provider_id: 'acme',
      models: [{ id: 'model-a', context_metadata_source: 'unknown' }],
      api_base_url: null,
      logo_url: null,
      status: 'needs-key',
      is_default: false,
      sort_order: 0,
      llm_api_key_set: false,
      llm_api_key_hint: null,
      litellm_provider_slug: null,
      save_warnings: [],
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
    expect(
      screen.queryByText(/Registered providers and model IDs for routing/i),
    ).not.toBeInTheDocument()
    await user.hover(screen.getByRole('button', { name: /model registry overview/i }))
    expect(
      await screen.findByRole('tooltip', {
        name: /Registered providers and model IDs for routing and studio allow-lists/i,
      }),
    ).toBeInTheDocument()

    expect(screen.getByRole('link', { name: 'Embedding settings' })).toHaveAttribute(
      'href',
      '/admin/settings',
    )

    await user.click(screen.getByRole('button', { name: /add provider/i }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByText(/Short ids are fine if LiteLLM/i)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/Non-empty values mark that position/i)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/If empty, the provider ID is used/i)).not.toBeInTheDocument()

    await user.hover(
      within(dialog).getByRole('button', { name: /model id format and litellm catalog/i }),
    )
    expect(
      await screen.findByRole('tooltip', {
        name: /Short ids are fine if LiteLLM can infer the provider/i,
      }),
    ).toBeInTheDocument()

    await user.type(screen.getByLabelText(/^Provider ID/i), 'acme')
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
          models: [
            { id: 'model-a', context_metadata_source: 'unknown' },
            { id: 'model-b', context_metadata_source: 'unknown' },
          ],
          api_base_url: 'https://api.example.com/v1',
        }),
      )
    })
  })

  it('shows abbreviated max context column after models in registry table', async () => {
    vi.spyOn(api, 'listStudios').mockResolvedValue([
      { id: 'studio-1', name: 'Studio One', description: null, logo_path: null, created_at: '' },
    ])
    vi.spyOn(api, 'getAdminLlmDeployment').mockResolvedValue({
      has_providers: true,
      providers: [
        {
          id: 'p1',
          provider_id: 'acme',
          models: [
            { id: 'a', max_context_tokens: 128_000, context_metadata_source: 'manual' },
            { id: 'b', max_context_tokens: 2_000_000, context_metadata_source: 'litellm' },
            { id: 'c', context_metadata_source: 'unknown' },
          ],
          api_base_url: null,
          logo_url: null,
          status: 'connected',
          is_default: false,
          sort_order: 0,
          llm_api_key_set: false,
          llm_api_key_hint: null,
          litellm_provider_slug: null,
        },
      ],
    })
    vi.spyOn(api, 'getAdminLlmRouting').mockResolvedValue([])
    vi.spyOn(api, 'getAdminStudioLlmPolicy').mockResolvedValue([])

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <LlmSection />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText(/max context/i)).toBeInTheDocument()
    expect(await screen.findByText('128K, 2M, —')).toBeInTheDocument()
  })

  it('shows Testing only on the registry row whose Test was clicked', async () => {
    const user = userEvent.setup()

    vi.spyOn(api, 'listStudios').mockResolvedValue([
      { id: 'studio-1', name: 'Studio One', description: null, logo_path: null, created_at: '' },
    ])
    vi.spyOn(api, 'getAdminLlmDeployment').mockResolvedValue({
      has_providers: true,
      providers: [
        {
          id: 'p1',
          provider_id: 'alpha',
          models: [{ id: 'm1', context_metadata_source: 'unknown' }],
          api_base_url: null,
          logo_url: null,
          status: 'connected',
          is_default: false,
          sort_order: 0,
          llm_api_key_set: false,
          llm_api_key_hint: null,
          litellm_provider_slug: null,
        },
        {
          id: 'p2',
          provider_id: 'beta',
          models: [{ id: 'm2', context_metadata_source: 'unknown' }],
          api_base_url: null,
          logo_url: null,
          status: 'connected',
          is_default: false,
          sort_order: 1,
          llm_api_key_set: false,
          llm_api_key_hint: null,
          litellm_provider_slug: null,
        },
      ],
    })
    vi.spyOn(api, 'getAdminLlmRouting').mockResolvedValue([])
    vi.spyOn(api, 'getAdminStudioLlmPolicy').mockResolvedValue([])

    let release!: () => void
    const barrier = new Promise<void>((r) => {
      release = r
    })
    vi.spyOn(api, 'postAdminTestLlm').mockImplementation(
      () =>
        barrier.then(() =>
          Promise.resolve({ ok: true, message: 'Probe OK', detail: null }),
        ),
    )

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <LlmSection />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^test$/i })).toHaveLength(2)
    })
    const rowTestButtons = screen.getAllByRole('button', { name: /^test$/i })
    expect(rowTestButtons).toHaveLength(2)
    await user.click(rowTestButtons[0])

    expect(screen.getAllByRole('button', { name: /testing/i })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /^test$/i })).toHaveLength(1)

    release()
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /testing/i })).not.toBeInTheDocument()
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
          provider_id: 'moonshot',
          models: [{ id: 'old-model', context_metadata_source: 'unknown' }],
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
        p.provider_id === key
          ? {
              ...p,
              models: body.models,
              api_base_url: body.api_base_url !== undefined ? body.api_base_url : p.api_base_url,
              status:
                body.disabled === true
                  ? 'disabled'
                  : body.disabled === false
                    ? 'needs-key'
                    : 'needs-key',
              is_default: body.is_default !== undefined ? body.is_default : p.is_default,
              sort_order: body.sort_order !== undefined ? body.sort_order : p.sort_order,
              litellm_provider_slug:
                body.litellm_provider_slug !== undefined
                  ? body.litellm_provider_slug
                  : p.litellm_provider_slug,
            }
          : p,
      )
      const row = deploymentState.providers.find((p) => p.provider_id === key)
      return {
        id: row?.id ?? 'prov-1',
        provider_id: key,
        models: body.models,
        api_base_url: body.api_base_url ?? null,
        logo_url: row?.logo_url ?? null,
        status: row?.status ?? 'needs-key',
        is_default: body.is_default ?? false,
        sort_order: body.sort_order ?? 0,
        llm_api_key_set: row?.llm_api_key_set ?? false,
        llm_api_key_hint: row?.llm_api_key_hint ?? null,
        litellm_provider_slug:
          body.litellm_provider_slug !== undefined
            ? body.litellm_provider_slug
            : row?.litellm_provider_slug ?? null,
        save_warnings: [],
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

    expect((await screen.findAllByText('moonshot')).length).toBeGreaterThan(0)

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
          models: [
            { id: 'alpha', context_metadata_source: 'unknown' },
            { id: 'beta', context_metadata_source: 'unknown' },
          ],
          api_base_url: 'https://api.moonshot.example/v1',
          disabled: false,
          litellm_provider_slug: null,
        }),
      )
    })

    await user.click(screen.getByRole('button', { name: 'Test' }))

    await waitFor(() => {
      expect(probeSpy).toHaveBeenCalledWith({
        model: 'alpha',
        api_base_url: 'https://api.moonshot.example/v1',
        provider_id: 'moonshot',
      })
    })

    expect(await screen.findByText('Probe OK')).toBeInTheDocument()
  })

  it('deletes provider from edit modal without confirm when status is not connected', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    vi.spyOn(api, 'listStudios').mockResolvedValue([
      { id: 'studio-1', name: 'Studio One', description: null, logo_path: null, created_at: '' },
    ])
    vi.spyOn(api, 'getAdminLlmDeployment').mockResolvedValue({
      has_providers: true,
      providers: [
        {
          id: 'prov-x',
          provider_id: 'needs-key-co',
          models: [{ id: 'm1', context_metadata_source: 'unknown' }],
          api_base_url: null,
          logo_url: null,
          status: 'needs-key',
          is_default: false,
          sort_order: 0,
          llm_api_key_set: false,
          llm_api_key_hint: null,
          litellm_provider_slug: null,
        },
      ],
    })
    vi.spyOn(api, 'getAdminLlmRouting').mockResolvedValue([])
    vi.spyOn(api, 'getAdminStudioLlmPolicy').mockResolvedValue([])

    const deleteSpy = vi.spyOn(api, 'deleteAdminLlmProvider').mockResolvedValue(undefined)

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <LlmSection />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText('needs-key-co')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^edit$/i }))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /delete provider/i }))

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('needs-key-co')
    })
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('confirms before deleting when provider status is connected', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    vi.spyOn(api, 'listStudios').mockResolvedValue([
      { id: 'studio-1', name: 'Studio One', description: null, logo_path: null, created_at: '' },
    ])
    vi.spyOn(api, 'getAdminLlmDeployment').mockResolvedValue({
      has_providers: true,
      providers: [
        {
          id: 'prov-1',
          provider_id: 'moonshot',
          models: [{ id: 'old-model', context_metadata_source: 'unknown' }],
          api_base_url: 'https://api.moonshot.example/v1',
          logo_url: null,
          status: 'connected',
          is_default: false,
          sort_order: 0,
          llm_api_key_set: false,
          llm_api_key_hint: null,
          litellm_provider_slug: null,
        },
      ],
    })
    vi.spyOn(api, 'getAdminLlmRouting').mockResolvedValue([])
    vi.spyOn(api, 'getAdminStudioLlmPolicy').mockResolvedValue([])

    const deleteSpy = vi.spyOn(api, 'deleteAdminLlmProvider').mockResolvedValue(undefined)

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <LlmSection />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect((await screen.findAllByText('moonshot')).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: /^edit$/i }))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /delete provider/i }))

    expect(confirmSpy).toHaveBeenCalledWith(
      'This provider is connected. Delete it from the registry? Studio LLM policy and routing may reference this row.',
    )
    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('moonshot')
    })
  })

  it('does not delete connected provider when confirmation is dismissed', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    vi.spyOn(api, 'listStudios').mockResolvedValue([
      { id: 'studio-1', name: 'Studio One', description: null, logo_path: null, created_at: '' },
    ])
    vi.spyOn(api, 'getAdminLlmDeployment').mockResolvedValue({
      has_providers: true,
      providers: [
        {
          id: 'prov-1',
          provider_id: 'moonshot',
          models: [{ id: 'old-model', context_metadata_source: 'unknown' }],
          api_base_url: null,
          logo_url: null,
          status: 'connected',
          is_default: false,
          sort_order: 0,
          llm_api_key_set: false,
          llm_api_key_hint: null,
          litellm_provider_slug: null,
        },
      ],
    })
    vi.spyOn(api, 'getAdminLlmRouting').mockResolvedValue([])
    vi.spyOn(api, 'getAdminStudioLlmPolicy').mockResolvedValue([])

    const deleteSpy = vi.spyOn(api, 'deleteAdminLlmProvider').mockResolvedValue(undefined)

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <LlmSection />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect((await screen.findAllByText('moonshot')).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: /^edit$/i }))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /delete provider/i }))

    await waitFor(() => {
      expect(deleteSpy).not.toHaveBeenCalled()
    })
  })

  it('shows routing policy help in tooltip, not inline', async () => {
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

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <LlmSection />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: /routing & fallback policy/i })).toBeInTheDocument()
    expect(screen.queryByText(/Primary and fallback values must be model IDs configured/i)).not.toBeInTheDocument()

    await user.hover(screen.getByRole('button', { name: /routing and fallback policy details/i }))
    const tip = await screen.findByRole('tooltip', {
      name: /Primary and fallback values must be model IDs configured on an LLM registry provider row above/i,
    })
    expect(tip).toBeInTheDocument()
    expect(within(tip).getByRole('link', { name: /litellm providers/i })).toHaveAttribute(
      'href',
      'https://docs.litellm.ai/docs/providers',
    )
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

    await user.click(screen.getByRole('button', { name: 'Add routing rule' }))

    const dialog = await screen.findByRole('dialog', { name: /add routing rule/i })

    await waitFor(() => {
      expect(api.getAdminLlmModelSuggestions).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'registry' }),
      )
    })

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

  it('requests LiteLLM catalog with mode embedding when add-provider catalog scope is Embedding models', async () => {
    const user = userEvent.setup()
    const suggestSpy = vi
      .spyOn(api, 'getAdminLlmModelSuggestions')
      .mockResolvedValue({ models: [], warning: null })

    vi.spyOn(api, 'listStudios').mockResolvedValue([
      { id: 'studio-1', name: 'Studio One', description: null, logo_path: null, created_at: '' },
    ])
    vi.spyOn(api, 'getAdminLlmDeployment').mockResolvedValue({
      has_providers: false,
      providers: [],
    })
    vi.spyOn(api, 'getAdminLlmRouting').mockResolvedValue([])
    vi.spyOn(api, 'getAdminStudioLlmPolicy').mockResolvedValue([])

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <LlmSection />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await screen.findByText(/Model registry/i)
    await user.click(screen.getByRole('button', { name: /add provider/i }))

    const dialog = await screen.findByRole('dialog')
    await user.selectOptions(
      within(dialog).getByLabelText(/LiteLLM catalog scope/i),
      'embedding',
    )
    const catalogInput = within(dialog).getByPlaceholderText(/Search models, then append/i)
    await user.type(catalogInput, 'te')

    await waitFor(() => {
      expect(suggestSpy).toHaveBeenCalledWith(expect.objectContaining({ mode: 'embedding' }))
    })
  })
})
