import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  getAdminEmbeddingConfig: vi.fn(),
  getAdminLlmModelSuggestions: vi.fn(),
}))

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    me: apiMocks.me,
    getAdminEmbeddingConfig: apiMocks.getAdminEmbeddingConfig,
    getAdminLlmModelSuggestions: apiMocks.getAdminLlmModelSuggestions,
  }
})

import { AdminSettingsPage } from './AdminSettingsPage'

describe('AdminSettingsPage', () => {
  const suggestSpy = vi.fn()

  beforeEach(() => {
    suggestSpy.mockReset()
    apiMocks.me.mockResolvedValue({
      user: {
        id: 'u1',
        email: 'ta@example.com',
        display_name: 'TA',
        is_platform_admin: true,
      },
      studios: [],
    })
    apiMocks.getAdminEmbeddingConfig.mockResolvedValue({
      embedding_provider: 'openai',
      embedding_model: '',
      embedding_api_base_url: null,
      embedding_api_key_set: false,
    })
    apiMocks.getAdminLlmModelSuggestions.mockImplementation((p) => {
      suggestSpy(p)
      return Promise.resolve({ models: [], warning: null })
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('requests embedding catalog suggestions after debounced typing in model field', async () => {
    const user = userEvent.setup()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <AdminSettingsPage />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await screen.findByText('Embedding settings')
    const modelInput = await screen.findByPlaceholderText(
      /Type 2\+ characters for embedding catalog suggestions/i,
    )
    await user.type(modelInput, 'te')

    await waitFor(
      () => {
        expect(suggestSpy).toHaveBeenCalled()
      },
      { timeout: 4000 },
    )
    expect(
      suggestSpy.mock.calls.some((c) => {
        const p = c[0] as { q?: string | null; mode?: string }
        return String(p?.q ?? '').includes('te') && p?.mode === 'embedding'
      }),
    ).toBe(true)
  })
})
