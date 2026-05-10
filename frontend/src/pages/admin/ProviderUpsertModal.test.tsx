import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../services/api'
import { ProviderUpsertModal } from './ProviderUpsertModal'

describe('ProviderUpsertModal', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getAdminLlmModelSuggestions').mockResolvedValue({
      models: [],
      warning: null,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('create mode: register stays disabled until models are non-empty (viewer cannot submit empty registry)', async () => {
    const user = userEvent.setup()
    const onRegister = vi.fn()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ProviderUpsertModal
            mode="create"
            open
            onClose={() => undefined}
            isPending={false}
            onRegister={onRegister}
            modelIdsHelp={<span>help</span>}
            contextTokensHelp={<span>help</span>}
            litellmSlugHelp={<span>help</span>}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()
    await user.type(screen.getByLabelText(/^Provider ID/i), 'acme')
    const register = screen.getByRole('button', { name: /^Register provider$/i })
    expect(register).toBeDisabled()
    await user.type(screen.getByLabelText(/^Model IDs/i), 'm1')
    expect(register).not.toBeDisabled()
  })

  it('create mode: submits putAdminLlmProvider via onRegister', async () => {
    const user = userEvent.setup()
    const putSpy = vi.spyOn(api, 'putAdminLlmProvider').mockResolvedValue({
      id: 'id',
      provider_id: 'acme',
      models: [{ id: 'm1', context_metadata_source: 'unknown' }],
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
    const onRegister = vi.fn((args: { providerId: string; body: api.LlmProviderUpsertBody }) => {
      void putSpy(args.providerId, args.body)
    })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ProviderUpsertModal
            mode="create"
            open
            onClose={() => undefined}
            isPending={false}
            onRegister={onRegister}
            modelIdsHelp={<span>help</span>}
            contextTokensHelp={<span>help</span>}
            litellmSlugHelp={<span>help</span>}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await user.type(await screen.findByLabelText(/^Provider ID/i), 'acme')
    await user.type(screen.getByLabelText(/^Model IDs/i), 'm1')
    await user.click(screen.getByRole('button', { name: /^Register provider$/i }))
    await waitFor(() => {
      expect(onRegister).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: 'acme',
          body: expect.objectContaining({
            models: [{ id: 'm1', kind: 'chat', context_metadata_source: 'unknown' }],
          }),
        }),
      )
    })
  })

  it('edit mode: provider id field is readonly with distinct id', async () => {
    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <ProviderUpsertModal
            mode="edit"
            provider={{
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
            }}
            onClose={() => undefined}
            isPending={false}
            isDeletePending={false}
            onSave={() => undefined}
            onDelete={() => undefined}
            modelIdsHelp={<span>help</span>}
            contextTokensHelp={<span>help</span>}
            litellmSlugHelp={<span>help</span>}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    const idInput = await screen.findByRole('textbox', { name: /^Provider ID$/i })
    expect(idInput).toHaveAttribute('id', 'llm-provider-modal-edit-provider-id')
    expect(idInput).toHaveAttribute('readOnly')
  })
})
