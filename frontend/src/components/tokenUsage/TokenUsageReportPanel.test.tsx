import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import * as api from '../../services/api'
import { TokenUsageReportPanel } from './TokenUsageReportPanel'

function makeRowsOverDays(days: number): api.TokenUsageRow[] {
  const rows: api.TokenUsageRow[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.UTC(2025, 2, 1 + i))
    rows.push({
      id: `row-${i}`,
      studio_id: null,
      software_id: null,
      project_id: null,
      work_order_id: null,
      user_id: null,
      call_type: 'test',
      model: 'm',
      input_tokens: 50,
      output_tokens: 50,
      estimated_cost_usd: null,
      created_at: d.toISOString(),
    })
  }
  return rows
}

describe('TokenUsageReportPanel', () => {
  it('shows chart and granularity toggle; weekly has fewer bars than daily', async () => {
    const report: api.TokenUsageReport = {
      rows: makeRowsOverDays(14),
      totals: {
        input_tokens: 700,
        output_tokens: 700,
        estimated_cost_usd: '0',
      },
    }

    vi.spyOn(api, 'getAdminTokenUsage').mockResolvedValue(report)

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <TokenUsageReportPanel mode="admin" />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /apply filters/i }))

    await waitFor(() => {
      expect(screen.getByTestId('usage-chart')).toBeInTheDocument()
    })

    expect(screen.getByTestId('granularity-daily')).toBeInTheDocument()
    expect(screen.getByTestId('granularity-weekly')).toBeInTheDocument()
    expect(screen.getByTestId('granularity-monthly')).toBeInTheDocument()

    const chart = screen.getByTestId('usage-chart')
    const dailyTicks = chart.querySelectorAll(
      '.recharts-xAxis .recharts-cartesian-axis-tick',
    )
    expect(dailyTicks.length).toBeGreaterThan(0)

    await user.click(screen.getByTestId('granularity-weekly'))

    await waitFor(() => {
      const wChart = screen.getByTestId('usage-chart')
      const weeklyTicks = wChart.querySelectorAll(
        '.recharts-xAxis .recharts-cartesian-axis-tick',
      )
      expect(weeklyTicks.length).toBeLessThan(dailyTicks.length)
    })
  })

  it('pre-fills studio_id from URL for me mode and sends it on load', async () => {
    const report: api.TokenUsageReport = {
      rows: [],
      totals: {
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost_usd: '0',
      },
    }
    const getMe = vi.spyOn(api, 'getMeTokenUsage').mockResolvedValue(report)
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    render(
      <MemoryRouter initialEntries={['/llm-usage?studio_id=st-99']}>
        <QueryClientProvider client={qc}>
          <TokenUsageReportPanel mode="me" />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /apply filters/i }))
    await waitFor(() => {
      expect(getMe).toHaveBeenCalled()
    })
    const arg = getMe.mock.calls[0]?.[0] as { studio_id?: string } | undefined
    expect(arg?.studio_id).toBe('st-99')
  })
})
