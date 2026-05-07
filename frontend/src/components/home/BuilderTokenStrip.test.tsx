import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import * as api from '../../services/api'
import { BuilderTokenStrip } from './BuilderTokenStrip'

describe('BuilderTokenStrip', () => {
  it('uses default detailed report link', () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <BuilderTokenStrip
            report={{
              rows: [],
              totals: {
                input_tokens: 0,
                output_tokens: 0,
                estimated_cost_usd: '0',
              },
            }}
            isPending={false}
            canSeeTokenUsage
            billedToStudioName="Acme"
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    const links = screen.getAllByRole('link', { name: /detailed report/i })
    expect(links[0]).toHaveAttribute('href', '/llm-usage')
  })

  it('honours detailReportHref for detailed report', () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <BuilderTokenStrip
            report={{
              rows: [],
              totals: {
                input_tokens: 0,
                output_tokens: 0,
                estimated_cost_usd: '0',
              },
            }}
            isPending={false}
            canSeeTokenUsage
            billedToStudioName={null}
            detailReportHref="/llm-usage?software_id=sw-99"
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    const links = screen.getAllByRole('link', { name: /detailed report/i })
    expect(links[0]).toHaveAttribute(
      'href',
      '/llm-usage?software_id=sw-99',
    )
  })

  it('honours custom heading', () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <BuilderTokenStrip
            report={{
              rows: [],
              totals: {
                input_tokens: 0,
                output_tokens: 0,
                estimated_cost_usd: '0',
              },
            }}
            isPending={false}
            canSeeTokenUsage
            billedToStudioName={null}
            heading="Studio LLM usage"
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('heading', { name: /studio llm usage/i }),
    ).toBeInTheDocument()
  })

  it('shows USD cap from builder_budget instead of fixed token scale', () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <BuilderTokenStrip
            report={{
              rows: [],
              totals: {
                input_tokens: 1_000,
                output_tokens: 2_000,
                estimated_cost_usd: '0.50',
              },
              builder_budget: {
                studio_id: 's1',
                cap_monthly_usd: '100.00',
                spent_monthly_usd: '12.50',
                budget_status: {
                  is_capped: true,
                  usage_pct: 12.5,
                  remaining_monthly_usd: '87.50',
                  severity: 'ok',
                  over_cap: false,
                  blocks_new_usage: false,
                },
              },
            }}
            isPending={false}
            canSeeTokenUsage
            billedToStudioName={null}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(screen.getByText(/% of cap/)).toBeInTheDocument()
    expect(screen.getByText(/tokens in usage log/)).toBeInTheDocument()
    expect(screen.queryByText(/2,000,000 tokens/)).not.toBeInTheDocument()
  })

  it('shows no personal cap when builder_budget has no cap', () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <BuilderTokenStrip
            report={{
              rows: [],
              totals: {
                input_tokens: 100,
                output_tokens: 50,
                estimated_cost_usd: '0',
              },
              builder_budget: {
                studio_id: 's1',
                cap_monthly_usd: null,
                spent_monthly_usd: '3.25',
                budget_status: {
                  is_capped: false,
                  usage_pct: null,
                  remaining_monthly_usd: null,
                  severity: 'ok',
                  over_cap: false,
                  blocks_new_usage: false,
                },
              },
            }}
            isPending={false}
            canSeeTokenUsage
            billedToStudioName={null}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(screen.getByText(/No personal cap/)).toBeInTheDocument()
    expect(screen.getByText(/this month \(estimated\)/)).toBeInTheDocument()
  })
})
