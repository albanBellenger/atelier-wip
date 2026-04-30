import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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
      <QueryClientProvider client={qc}>
        <TokenUsageReportPanel mode="admin" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /apply filters/i }))

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

    fireEvent.click(screen.getByTestId('granularity-weekly'))

    await waitFor(() => {
      const wChart = screen.getByTestId('usage-chart')
      const weeklyTicks = wChart.querySelectorAll(
        '.recharts-xAxis .recharts-cartesian-axis-tick',
      )
      expect(weeklyTicks.length).toBeLessThan(dailyTicks.length)
    })
  })
})
