import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../services/api'
import { LlmUsagePage } from './LlmUsagePage'

describe('LlmUsagePage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders heading and footer after profile loads', async () => {
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'Alex',
        is_platform_admin: false,
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
    expect(
      screen.getByRole('button', {
        name: 'Filter usage by studio, software, project, work order, call type, and dates.',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /back to home/i })).not.toBeInTheDocument()
    expect(await screen.findByText(/Atelier · Builder workspace/i)).toBeInTheDocument()
  })

  it('formats totals input/output tokens with locale grouping', async () => {
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'Alex',
        is_platform_admin: false,
      },
      studios: [
        { studio_id: 's1', studio_name: 'Studio One', role: 'studio_member' },
      ],
      cross_studio_grants: [],
    })
    vi.spyOn(api, 'getMeTokenUsage').mockResolvedValue({
      rows: [],
      totals: {
        input_tokens: 117_422,
        output_tokens: 53_555,
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

    expect(
      await screen.findByText((117_422).toLocaleString(), { exact: false }),
    ).toBeInTheDocument()
    expect(
      screen.getByText((53_555).toLocaleString(), { exact: false }),
    ).toBeInTheDocument()
  })

  it('header studio crumb prefers saved home studio on /llm-usage', async () => {
    localStorage.setItem('atelier:home:studioId', 's-second')
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'Alex',
        is_platform_admin: false,
      },
      studios: [
        { studio_id: 's-first', studio_name: 'First', role: 'studio_member' },
        { studio_id: 's-second', studio_name: 'Second', role: 'studio_member' },
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
      await screen.findByRole('link', { name: /^Second$/i }),
    ).toHaveAttribute('href', '/studios/s-second')
  })

  it('header studio crumb prefers studio_id from URL on /llm-usage', async () => {
    localStorage.setItem('atelier:home:studioId', 's-second')
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'Alex',
        is_platform_admin: false,
      },
      studios: [
        { studio_id: 's-first', studio_name: 'First', role: 'studio_member' },
        { studio_id: 's-second', studio_name: 'Second', role: 'studio_member' },
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
      <MemoryRouter
        initialEntries={['/llm-usage?studio_id=s-first']}
      >
        <QueryClientProvider client={qc}>
          <LlmUsagePage />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('link', { name: /^First$/i }),
    ).toHaveAttribute('href', '/studios/s-first')
  })

  it('Builder does not get user filter multi-select', async () => {
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'Alex',
        is_platform_admin: false,
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
