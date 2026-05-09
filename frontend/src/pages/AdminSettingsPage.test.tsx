import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  postAdminTestEmbedding: vi.fn(),
}))

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    me: apiMocks.me,
    postAdminTestEmbedding: apiMocks.postAdminTestEmbedding,
  }
})

import { AdminSettingsPage } from './AdminSettingsPage'

describe('AdminSettingsPage', () => {
  beforeEach(() => {
    apiMocks.me.mockResolvedValue({
      user: {
        id: 'u1',
        email: 'ta@example.com',
        display_name: 'TA',
        is_platform_admin: true,
      },
      studios: [],
    })
    apiMocks.postAdminTestEmbedding.mockResolvedValue({
      ok: true,
      message: 'Embedding connection succeeded (1536 dimensions).',
      detail: null,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('platform admin sees shortcuts and can run embedding probe', async () => {
    const user = userEvent.setup()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <AdminSettingsPage />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: /Platform admin shortcuts/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Test embedding/i }))
    expect(apiMocks.postAdminTestEmbedding).toHaveBeenCalled()
    expect(
      await screen.findByText(/Embedding connection succeeded/i),
    ).toBeInTheDocument()
  })

  it('non-platform admin cannot access settings content', async () => {
    apiMocks.me.mockResolvedValue({
      user: {
        id: 'u2',
        email: 'm@example.com',
        display_name: 'Member',
        is_platform_admin: false,
      },
      studios: [],
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <AdminSettingsPage />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText(/Access denied/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Test embedding/i })).not.toBeInTheDocument()
  })
})
