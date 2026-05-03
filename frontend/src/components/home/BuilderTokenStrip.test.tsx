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
})
