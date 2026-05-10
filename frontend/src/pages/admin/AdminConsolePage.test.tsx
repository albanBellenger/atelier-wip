import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../services/api'
import { AdminConsolePage } from './AdminConsolePage'
import { OverviewSection } from './OverviewSection'

function renderConsoleAt(
  path: string,
  toolAdmin: boolean,
  overview?: Awaited<ReturnType<typeof api.getAdminConsoleOverview>>,
): void {
  vi.spyOn(api, 'me').mockResolvedValue({
    user: {
      id: 'u-admin',
      email: 'admin@example.com',
      display_name: 'Admin',
      is_platform_admin: toolAdmin,
    },
    studios: [],
    cross_studio_grants: [],
  })
  if (overview) {
    vi.spyOn(api, 'getAdminConsoleOverview').mockResolvedValue(overview)
  } else {
    vi.spyOn(api, 'getAdminConsoleOverview').mockRejectedValue(new Error('no api in test'))
  }
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/admin/console" element={<AdminConsolePage />}>
            <Route path="overview" element={<OverviewSection />} />
          </Route>
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AdminConsolePage', () => {
  it('shows overview shell for platform admin; table empty when overview fails', async () => {
    renderConsoleAt('/admin/console/overview', true)
    expect(await screen.findByRole('heading', { name: /^Overview$/ })).toBeInTheDocument()
    expect(await screen.findByText('Studios at a glance')).toBeInTheDocument()
    expect(
      await screen.findByText(
        'No overview data. Unable to load the studio list — open Studios to browse tenants.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Could not load overview metrics/i),
    ).toBeInTheDocument()
    expect(screen.queryByText('Northwind Atelier')).not.toBeInTheDocument()
  })

  it('denies access when user is not platform admin', async () => {
    renderConsoleAt('/admin/console/overview', false)
    await waitFor(() => {
      expect(screen.getByText('Access denied')).toBeInTheDocument()
    })
    expect(
      screen.getByText(/Platform administrator privileges are required/i),
    ).toBeInTheDocument()
  })

  it('SideNav shows spend and counts from the overview API when available', async () => {
    renderConsoleAt('/admin/console/overview', true, {
      studios: [
        {
          studio_id: 's1',
          name: 'Only Studio',
          description: null,
          created_at: '2026-01-01T00:00:00Z',
          software_count: 0,
          member_count: 1,
          mtd_spend_usd: '1.00',
          budget_cap_monthly_usd: null,
          budget_overage_action: 'pause_generations',
          budget_status: {
            is_capped: false,
            usage_pct: null,
            remaining_monthly_usd: null,
            severity: 'ok',
            over_cap: false,
            blocks_new_usage: false,
          },
        },
      ],
      active_builders_count: 12,
      embedding_collection_count: 0,
      recent_activity: [],
    })
    await screen.findByRole('heading', { name: /^Overview$/ })
    const nav = screen.getByRole('navigation')
    expect(await within(nav).findByText('$1.00')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.hover(within(nav).getByRole('button', { name: /month summary details/i }))
    expect(
      await screen.findByRole('tooltip', {
        name: /Sum of listed studios \(no cross-studio aggregate\) · 1 studio · 12 active builders/i,
      }),
    ).toBeInTheDocument()
  })
})
