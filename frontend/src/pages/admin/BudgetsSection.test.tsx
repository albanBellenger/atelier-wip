import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import * as api from '../../services/api'
import { BudgetsSection } from './BudgetsSection'

describe('BudgetsSection', () => {
  it('loads per-studio spend and cap from overview and PATCHes when cap changes', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'getAdminConsoleOverview').mockResolvedValue({
      studios: [
        {
          studio_id: '550e8400-e29b-41d4-a716-446655440001',
          name: 'Studio Alpha',
          software_count: 1,
          member_count: 2,
          mtd_spend_usd: '100.00',
          budget_cap_monthly_usd: '600.00',
          budget_overage_action: 'pause_generations',
        },
      ],
      mtd_spend_total_usd: '100.00',
      active_builders_count: 1,
      embedding_collection_count: 0,
      recent_activity: [],
    })
    const patchSpy = vi.spyOn(api, 'patchAdminStudioBudget').mockResolvedValue(undefined)

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <BudgetsSection />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Studio Alpha')).toBeInTheDocument()

    const plusButtons = screen.getAllByRole('button', { name: '+' })
    await user.click(plusButtons[0])

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440001', {
        budget_cap_monthly_usd: '650.00',
      })
    })
  })

  it('PATCHes overage action when the policy select changes', async () => {
    const user = userEvent.setup()
    const patchSpy = vi.spyOn(api, 'patchAdminStudioBudget').mockResolvedValue(undefined)
    vi.spyOn(api, 'getAdminConsoleOverview').mockResolvedValue({
      studios: [
        {
          studio_id: '550e8400-e29b-41d4-a716-446655440001',
          name: 'Studio Alpha',
          software_count: 1,
          member_count: 2,
          mtd_spend_usd: '100.00',
          budget_cap_monthly_usd: '600.00',
          budget_overage_action: 'pause_generations',
        },
      ],
      mtd_spend_total_usd: '100.00',
      active_builders_count: 1,
      embedding_collection_count: 0,
      recent_activity: [],
    })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <BudgetsSection />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Studio Alpha')).toBeInTheDocument()
    const select = screen.getByLabelText('Overage action for Studio Alpha')
    await user.selectOptions(select, 'allow_with_warning')

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440001', {
        budget_overage_action: 'allow_with_warning',
      })
    })
  })

  it('loads per-builder caps for the selected studio and PATCHes when cap changes', async () => {
    const user = userEvent.setup()
    const studioId = '550e8400-e29b-41d4-a716-446655440001'
    const userId = '650e8400-e29b-41d4-a716-446655440002'
    vi.spyOn(api, 'getAdminConsoleOverview').mockResolvedValue({
      studios: [
        {
          studio_id: studioId,
          name: 'Studio Alpha',
          software_count: 1,
          member_count: 2,
          mtd_spend_usd: '100.00',
          budget_cap_monthly_usd: '600.00',
          budget_overage_action: 'pause_generations',
        },
      ],
      mtd_spend_total_usd: '100.00',
      active_builders_count: 1,
      embedding_collection_count: 0,
      recent_activity: [],
    })
    vi.spyOn(api, 'getAdminStudioMemberBudgets').mockResolvedValue([
      {
        user_id: userId,
        email: 'builder@example.com',
        display_name: 'Builder One',
        role: 'studio_member',
        budget_cap_monthly_usd: '200.00',
        mtd_spend_usd: '50.00',
      },
    ])
    const patchSpy = vi.spyOn(api, 'patchAdminStudioMemberBudget').mockResolvedValue({
      user_id: userId,
      email: 'builder@example.com',
      display_name: 'Builder One',
      role: 'studio_member',
      budget_cap_monthly_usd: '250.00',
      mtd_spend_usd: '50.00',
    })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <BudgetsSection />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'By builder' }))
    expect(await screen.findByText('Builder One')).toBeInTheDocument()

    const plusButtons = screen.getAllByRole('button', { name: '+' })
    await user.click(plusButtons[0])

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(studioId, userId, {
        budget_cap_monthly_usd: '250.00',
      })
    })
  })
})
