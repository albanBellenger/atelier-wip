import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import * as api from '../services/api'
import { LlmUsagePage } from './LlmUsagePage'

describe('LlmUsagePage', () => {
  it('renders heading and footer after profile loads', async () => {
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'Alex',
        is_tool_admin: false,
      },
      studios: [
        { studio_id: 's1', studio_name: 'Studio One', role: 'studio_member' },
      ],
      cross_studio_grants: [],
    })
    vi.spyOn(api, 'getMeTokenUsage').mockResolvedValue({
      rows: [],
      totals: {
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost_usd: '0',
      },
    })
    vi.spyOn(api, 'listSoftware').mockResolvedValue([])

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter initialEntries={['/llm-usage']}>
        <QueryClientProvider client={qc}>
          <LlmUsagePage />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', { name: /^LLM usage$/i }),
    ).toBeInTheDocument()
    expect(await screen.findByText(/Back to home/i)).toBeInTheDocument()
    expect(await screen.findByText(/Atelier · Builder workspace/i)).toBeInTheDocument()
  })

  it('studio member does not get user filter multi-select', async () => {
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'Alex',
        is_tool_admin: false,
      },
      studios: [
        { studio_id: 's1', studio_name: 'Studio One', role: 'studio_member' },
      ],
      cross_studio_grants: [],
    })
    vi.spyOn(api, 'getMeTokenUsage').mockResolvedValue({
      rows: [],
      totals: {
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost_usd: '0',
      },
    })
    vi.spyOn(api, 'listSoftware').mockResolvedValue([])

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter initialEntries={['/llm-usage']}>
        <QueryClientProvider client={qc}>
          <LlmUsagePage />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(api.getMeTokenUsage).toHaveBeenCalled()
    })
    expect(screen.queryByText(/^User \(multi\)$/)).not.toBeInTheDocument()
    expect(
      screen.queryByText(/User IDs \(comma or newline separated/i),
    ).not.toBeInTheDocument()
  })
})
